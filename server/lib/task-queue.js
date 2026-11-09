// Task queue with two lanes (D-024): the device lane runs strictly one task at a time because every
// task in it drives the one simulator; the general lane runs up to TEST_FORGE_GENERAL_CONCURRENCY tasks in
// parallel. Executors are registered per task kind; the queue only schedules and records.
import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const TERMINAL = new Set(["done", "failed", "cancelled"]);
const KEEP_FINISHED = 200;

export class TaskQueue extends EventEmitter {
	constructor(dataDir, { generalConcurrency = 3 } = {}) {
		super();
		this.setMaxListeners(100);
		this.path = join(dataDir, "tasks.json");
		this.dataDir = dataDir;
		this.generalConcurrency = generalConcurrency;
		this.tasks = [];
		this.executors = new Map();
		this.running = new Map(); // taskId → { cancel }
		this.saveTimer = null;
	}

	async restore() {
		try {
			this.tasks = JSON.parse(await readFile(this.path, "utf8"));
		} catch {
			this.tasks = [];
		}
		for (const task of this.tasks) {
			if (task.status === "running" || task.status.startsWith("waiting")) {
				Object.assign(task, { status: "failed", error: "interrupted — the dashboard restarted", endedAt: new Date().toISOString() });
			}
		}
		this.#changed();
	}

	/** `executor(task, controls)` → Promise<{ verdict?, costUsd?, error? }>; `controls`: { update(patch), onCancel(fn) }. */
	register(kind, { lane, executor }) {
		this.executors.set(kind, { lane, executor });
	}

	enqueue({ kind, title, payload = {}, links = {} }) {
		const registration = this.executors.get(kind);
		if (!registration) throw new Error(`unknown task kind ${kind}`);
		const task = {
			id: randomUUID(),
			kind,
			lane: registration.lane,
			title,
			status: "queued",
			payload,
			links,
			createdAt: new Date().toISOString(),
		};
		this.tasks.push(task);
		this.emit("enqueued", task);
		this.#changed();
		this.#schedule();
		return task;
	}

	get(id) {
		return this.tasks.find((task) => task.id === id);
	}

	list() {
		return this.tasks;
	}

	cancel(id) {
		const task = this.get(id);
		if (!task || TERMINAL.has(task.status)) return false;
		if (task.status === "queued") {
			Object.assign(task, { status: "cancelled", endedAt: new Date().toISOString() });
			this.#changed();
		} else {
			task.isCancelRequested = true;
			this.running.get(id)?.cancel?.();
			this.#changed();
		}
		return true;
	}

	/** Moves a queued task one place up (-1) or down (+1) among the queued tasks of its lane. */
	move(id, direction) {
		const task = this.get(id);
		if (!task || task.status !== "queued") return false;
		const peers = this.tasks.filter((other) => other.lane === task.lane && other.status === "queued");
		const swapWith = peers[peers.indexOf(task) + direction];
		if (!swapWith) return false;
		const a = this.tasks.indexOf(task);
		const b = this.tasks.indexOf(swapWith);
		[this.tasks[a], this.tasks[b]] = [this.tasks[b], this.tasks[a]];
		this.#changed();
		return true;
	}

	retry(id) {
		const task = this.get(id);
		if (!task || !TERMINAL.has(task.status)) return null;
		return this.enqueue({ kind: task.kind, title: task.title, payload: task.payload, links: task.links });
	}

	/** Drops every finished task from the queue; run results stay in runs.json. Returns how many went. */
	clearFinished() {
		const before = this.tasks.length;
		this.tasks = this.tasks.filter((task) => !TERMINAL.has(task.status));
		this.#changed();
		return before - this.tasks.length;
	}

	/** Starts whatever can run — called once executors are registered after a restore. */
	kick() {
		this.#schedule();
	}

	#schedule() {
		for (const lane of ["device", "general"]) {
			const limit = lane === "device" ? 1 : this.generalConcurrency;
			let active = this.tasks.filter((task) => task.lane === lane && !TERMINAL.has(task.status) && task.status !== "queued").length;
			for (const task of this.tasks) {
				if (active >= limit) break;
				if (task.lane !== lane || task.status !== "queued") continue;
				active += 1;
				this.#start(task);
			}
		}
	}

	async #start(task) {
		const { executor } = this.executors.get(task.kind);
		Object.assign(task, { status: "running", startedAt: new Date().toISOString() });
		const handle = {};
		this.running.set(task.id, handle);
		this.#changed();
		const controls = {
			update: (patch) => {
				Object.assign(task, patch);
				this.#changed();
			},
			onCancel: (fn) => (handle.cancel = fn),
		};
		let outcome;
		try {
			outcome = await executor(task, controls);
		} catch (error) {
			outcome = { error: error.message };
		}
		this.running.delete(task.id);
		let status = outcome?.error ? "failed" : "done";
		if (task.isCancelRequested) status = "cancelled";
		Object.assign(task, { ...outcome, status, endedAt: new Date().toISOString() });
		this.#changed();
		this.#schedule();
	}

	#changed() {
		this.emit("change", this.tasks);
		clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(async () => {
			const finished = this.tasks.filter((task) => TERMINAL.has(task.status));
			if (finished.length > KEEP_FINISHED) {
				const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED));
				this.tasks = this.tasks.filter((task) => !drop.has(task));
			}
			await mkdir(this.dataDir, { recursive: true });
			await writeFile(this.path, JSON.stringify(this.tasks, null, 2));
		}, 300);
	}
}
