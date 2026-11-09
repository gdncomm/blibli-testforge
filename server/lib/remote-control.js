// D-150: the TestForge supervises one `claude remote-control` server in the repo, so QA can be driven from the Claude
// mobile app (Code → session) or claude.ai/code. The sessions it spawns inherit TEST_FORGE_REMOTE=1, which the
// test-flow-recorder plugin's guard hook and the test-forge-remote skill key on. Its output goes to a log file the
// server tails (a pipe would die with the server and take Remote Control with it), so it outlives a server restart and
// is adopted again from its recorded pid; the log is what tells "Connecting" from "Connected" and gives the links.
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { open, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const OUTPUT_LINES = 60;
const SESSION_URL = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g;
const ENVIRONMENT_URL = /https:\/\/claude\.ai\/code\?environment=[A-Za-z0-9_]+/;
const CAPACITY = /Capacity:\s*(\d+)\s*\/\s*(\d+)/;

/** Removes terminal colour / cursor codes and OSC-8 hyperlink wrappers, keeping the visible text and the URLs. */
export function plainText(chunk) {
	return String(chunk)
		.replace(/\x1b\]8;;([^\x07\x1b]*)(?:\x07|\x1b\\)/g, " $1 ")
		.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
		.replace(/\x1b[()][A-Za-z0-9]/g, "")
		.replace(/\r/g, "\n");
}

/** What the server's output says so far: `{ phase, capacity, sessionUrls, environmentUrl, problem }`. */
export function readOutput(lines) {
	const text = lines.join("\n");
	const connectedAt = text.lastIndexOf("Connected");
	const connectingAt = text.lastIndexOf("Connecting");
	const phase = connectedAt > connectingAt ? "connected" : connectingAt >= 0 ? "connecting" : "starting";
	const capacity = text.match(new RegExp(CAPACITY.source, "g"))?.at(-1)?.match(CAPACITY);
	const problem = lines.findLast((line) => /trust|not logged in|log in|subscription|error|failed/i.test(line)) ?? null;
	return {
		phase,
		capacity: capacity ? { used: Number(capacity[1]), max: Number(capacity[2]) } : null,
		sessionUrls: [...new Set(text.match(SESSION_URL) ?? [])],
		environmentUrl: text.match(ENVIRONMENT_URL)?.[0] ?? null,
		problem,
	};
}

export class RemoteControl extends EventEmitter {
	/** `spawnProcess` and `isAlive` are injectable for tests. */
	constructor({ projectDir, dataDir, spawnProcess = spawn, isAlive = defaultIsAlive, claudePath = "claude" }) {
		super();
		this.projectDir = projectDir;
		this.recordPath = join(dataDir, "remote-control.json");
		this.logPath = join(dataDir, "remote-control.log");
		this.logOffset = 0;
		this.tailTimer = null;
		this.isTailingInjected = spawnProcess !== spawn;
		this.spawnProcess = spawnProcess;
		this.isAlive = isAlive;
		this.claudePath = claudePath;
		this.child = null;
		this.adoptedPid = null;
		this.lines = [];
		this.status = readOutput([]);
		this.startedAt = null;
		this.options = null;
		this.exit = null;
	}

	get name() {
		return `TestForge · ${basename(dirname(this.projectDir))}`;
	}

	get pid() {
		return this.child?.pid ?? this.adoptedPid;
	}

	get isRunning() {
		return Boolean(this.pid && this.isAlive(this.pid));
	}

	/** Takes back a server an earlier run of the dashboard started, so a restart doesn't orphan it. */
	async adopt() {
		try {
			const record = JSON.parse(await readFile(this.recordPath, "utf8"));
			if (record.pid && this.isAlive(record.pid)) {
				this.adoptedPid = record.pid;
				this.startedAt = record.startedAt;
				this.options = record.options;
				this.logOffset = 0;
				this.#tail();
				this.emit("change");
			}
		} catch {
			// Nothing recorded — not running.
		}
	}

	/** `spawnMode`: "same-dir" (sessions share the repo) or "worktree" (each new session in its own git worktree). */
	async start({ spawnMode = "same-dir" } = {}) {
		if (this.isRunning) return this.view();
		this.lines = [];
		this.status = readOutput([]);
		this.exit = null;
		this.options = { spawnMode };
		const args = ["remote-control", "--name", this.name, "--spawn", spawnMode];
		await mkdir(dirname(this.logPath), { recursive: true });
		const logDescriptor = this.isTailingInjected ? null : openSync(this.logPath, "w");
		this.child = this.spawnProcess(this.claudePath, args, {
			cwd: this.projectDir,
			env: { ...process.env, TEST_FORGE_REMOTE: "1" },
			stdio: logDescriptor === null ? ["ignore", "pipe", "pipe"] : ["ignore", logDescriptor, logDescriptor],
			detached: true,
		});
		if (logDescriptor !== null) {
			closeSync(logDescriptor);
			this.child.unref?.();
			this.logOffset = 0;
			this.#tail();
		}
		this.adoptedPid = null;
		this.startedAt = new Date().toISOString();
		// Tests hand in a fake process and write its output straight to the pipes.
		const take = (chunk) => this.#append(plainText(chunk));
		this.child.stdout?.on("data", take);
		this.child.stderr?.on("data", take);
		this.child.on("exit", (code, signal) => {
			this.exit = { code, signal, at: new Date().toISOString() };
			this.child = null;
			rm(this.recordPath, { force: true }).catch(() => {});
			this.emit("change");
		});
		this.child.on("error", (error) => {
			this.#append(`failed to start claude remote-control: ${error.message}`);
		});
		await mkdir(dirname(this.recordPath), { recursive: true });
		await writeFile(this.recordPath, JSON.stringify({ pid: this.child.pid, startedAt: this.startedAt, options: this.options }));
		this.emit("change");
		return this.view();
	}

	/** Stops the server and the sessions it spawned (its whole process group). */
	async stop() {
		const pid = this.pid;
		if (pid) {
			try {
				process.kill(-pid, "SIGTERM");
			} catch {
				try {
					process.kill(pid, "SIGTERM");
				} catch {
					// Already gone.
				}
			}
		}
		// Answer once it has gone, so the app never shows "connected" after Turn off.
		for (let wait = 0; pid && this.isAlive(pid) && wait < 50; wait++) await new Promise((resolve) => setTimeout(resolve, 100));
		this.adoptedPid = null;
		this.child = null;
		await rm(this.recordPath, { force: true });
		this.emit("change");
		return this.view();
	}

	view() {
		const output = this.status;
		return {
			isRunning: this.isRunning,
			name: this.name,
			projectDir: this.projectDir,
			pid: this.pid ?? null,
			startedAt: this.isRunning ? this.startedAt : null,
			spawnMode: this.options?.spawnMode ?? "same-dir",
			phase: this.isRunning ? output.phase : "stopped",
			capacity: output.capacity,
			sessionUrls: output.sessionUrls,
			environmentUrl: output.environmentUrl,
			problem: output.problem,
			exit: this.exit,
			output: this.lines.slice(-12),
		};
	}

	/** Reads what the log gained since last time; notices when an adopted server has gone. */
	#tail() {
		clearInterval(this.tailTimer);
		this.tailTimer = setInterval(async () => {
			if (!this.isRunning) {
				clearInterval(this.tailTimer);
				this.adoptedPid = null;
				this.emit("change");
				return;
			}
			try {
				const handle = await open(this.logPath, "r");
				const { size } = await handle.stat();
				if (size > this.logOffset) {
					const buffer = Buffer.alloc(size - this.logOffset);
					await handle.read(buffer, 0, buffer.length, this.logOffset);
					this.logOffset = size;
					this.#append(plainText(buffer.toString("utf8")));
				}
				await handle.close();
			} catch {
				// No log yet.
			}
		}, 500);
		this.tailTimer.unref?.();
	}

	#append(text) {
		const fresh = text.split("\n").map((line) => line.trim()).filter(Boolean);
		if (!fresh.length) return;
		// Status comes from every chunk as it arrives (a reconnect repeats lines the tail below drops).
		const latest = readOutput(fresh);
		this.status = {
			phase: latest.phase === "starting" ? this.status.phase : latest.phase,
			capacity: latest.capacity ?? this.status.capacity,
			sessionUrls: [...new Set([...this.status.sessionUrls, ...latest.sessionUrls])],
			environmentUrl: latest.environmentUrl ?? this.status.environmentUrl,
			problem: latest.problem ?? this.status.problem,
		};
		// The CLI redraws its status block in place; repeated lines are dropped so the tail stays readable.
		for (const line of fresh) if (this.lines.at(-1) !== line && !this.lines.slice(-8).includes(line)) this.lines.push(line);
		if (this.lines.length > OUTPUT_LINES) this.lines.splice(0, this.lines.length - OUTPUT_LINES);
		this.emit("change");
	}
}

function defaultIsAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
