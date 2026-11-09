// Things only a person can do mid-run, until the runner can reach them itself (D-044): tap a
// SpringBoard/system popup the runner can't see, or type a real production OTP. A replay asks;
// the dashboard shows a popup; the answer resumes the replay.
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class PromptHub extends EventEmitter {
	#open = new Map();

	/**
	 * `kind` is `manual` (do something on the simulator, then Done / Not shown) or `input` (type a
	 * value; `secret` hides it on screen). Resolves `{action: "done"|"skip"|"stop"|"timeout", value?}`.
	 */
	ask({ kind = "manual", title, text, secret = false, taskId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
		const id = randomUUID();
		return new Promise((resolve) => {
			const timer = setTimeout(() => this.#settle(id, { action: "timeout" }), timeoutMs);
			this.#open.set(id, { prompt: { id, kind, title, text, secret, taskId, askedAt: new Date().toISOString() }, resolve, timer });
			this.emit("change");
			notifyMac(title, text);
		});
	}

	list() {
		return [...this.#open.values()].map((entry) => entry.prompt);
	}

	answer(id, { action, value }) {
		if (!["done", "skip", "stop"].includes(action)) return false;
		return this.#settle(id, { action, value: typeof value === "string" ? value : undefined });
	}

	/** A cancelled task must not leave its popup behind. */
	cancelForTask(taskId) {
		for (const entry of this.#open.values()) if (entry.prompt.taskId === taskId) this.#settle(entry.prompt.id, { action: "stop" });
	}

	#settle(id, outcome) {
		const entry = this.#open.get(id);
		if (!entry) return false;
		clearTimeout(entry.timer);
		this.#open.delete(id);
		entry.resolve(outcome);
		this.emit("change");
		return true;
	}
}

/** A macOS banner, so a person in another window notices the run is waiting. Never carries a value. */
function notifyMac(title, text) {
	if (process.platform !== "darwin" || process.env.TEST_FORGE_NO_NOTIFY) return;
	const script = `display notification ${JSON.stringify(String(text ?? "").slice(0, 200))} with title "TestForge" subtitle ${JSON.stringify(String(title ?? ""))}`;
	execFile("osascript", ["-e", script], () => {});
}

export const prompts = new PromptHub();
