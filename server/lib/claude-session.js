// A live, two-way Claude Code session hosted by the dashboard (Agent SDK over the user's installed
// `claude`, so every plugin, MCP server and claude.ai connector is available). Messages go in while
// a turn is running; tool approvals and Claude's own questions come out as events and wait for the
// dashboard's answer. Survives a dashboard restart through `resume: <claude session id>`.
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { deviceLock } from "./device-lock.js";
import { usageFeed } from "./usage.js";
import { TEST_FORGE_DRIVER_TOOL, hardDenyReason, isPreAllowed } from "./permissions.js";

const CLAUDE_PATH = (() => {
	try {
		return execFileSync("/bin/sh", ["-lc", "command -v claude"]).toString().trim() || undefined;
	} catch {
		return undefined;
	}
})();

const NOISY_SYSTEM_EVENTS = new Set(["hook_started", "hook_response", "thinking_tokens", "commands_changed", "status"]);
const UI_RESULT_LIMIT = 6000;
const MEMORY_EVENT_LIMIT = 4000;

/** Async iterable the SDK reads user messages from; `push` feeds it, `end` finishes the session. */
class InputQueue {
	items = [];
	waiting = null;
	isEnded = false;

	push(item) {
		if (this.waiting) {
			this.waiting({ value: item, done: false });
			this.waiting = null;
		} else {
			this.items.push(item);
		}
	}

	end() {
		this.isEnded = true;
		this.waiting?.({ value: undefined, done: true });
		this.waiting = null;
	}

	[Symbol.asyncIterator]() {
		return {
			next: () => {
				if (this.items.length) return Promise.resolve({ value: this.items.shift(), done: false });
				if (this.isEnded) return Promise.resolve({ value: undefined, done: true });
				return new Promise((resolve) => (this.waiting = resolve));
			},
		};
	}
}

function clipToolResults(message) {
	if (message.type !== "user" || !Array.isArray(message.message?.content)) return message;
	const content = message.message.content.map((part) => {
		if (part.type !== "tool_result") return part;
		const text = typeof part.content === "string"
			? part.content
			: (part.content ?? []).map((piece) => (piece.type === "text" ? piece.text : `[${piece.type}]`)).join("\n");
		return { ...part, content: text.length > UI_RESULT_LIMIT ? `${text.slice(0, UI_RESULT_LIMIT)}\n… (${text.length} chars)` : text };
	});
	const { tool_use_result: _dropped, ...rest } = message;
	return { ...rest, message: { ...message.message, content } };
}

function toolResultText(part) {
	if (typeof part.content === "string") return part.content;
	return (part.content ?? []).map((piece) => piece.text ?? "").join("");
}

export class ClaudeSession extends EventEmitter {
	/**
	 * `record` is the persisted index entry; `options` are per-session engine settings that are not
	 * persisted (allowed tools, permission mode, auto-close for one-shot tasks).
	 */
	constructor(record, { dataDir, alwaysAllow, onChange, options = {} }) {
		super();
		this.setMaxListeners(50);
		this.record = record;
		this.dataDir = dataDir;
		this.alwaysAllow = alwaysAllow;
		this.onChange = onChange;
		this.options = options;
		this.events = [];
		this.seq = 0;
		this.pending = new Map(); // requestId → { kind, resolve, toolName, input }
		this.query = null;
		this.input = null;
		this.toolNames = new Map();
		this.writeChain = Promise.resolve();
		this.isHistoryLoaded = false;
	}

	get id() {
		return this.record.id;
	}

	get isLive() {
		return Boolean(this.query);
	}

	summary() {
		return {
			...this.record,
			isLive: this.isLive,
			pending: [...this.pending.entries()].map(([requestId, entry]) => ({ requestId, kind: entry.kind, toolName: entry.toolName })),
		};
	}

	/** Loads the persisted transcript once so a reopened session shows its history. */
	async loadHistory() {
		if (this.isHistoryLoaded) return;
		this.isHistoryLoaded = true;
		try {
			const text = await readFile(this.#transcriptPath(), "utf8");
			const stored = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
			this.events = [...stored, ...this.events].slice(-MEMORY_EVENT_LIMIT);
			this.seq = Math.max(this.seq, ...this.events.map((event) => event.seq ?? 0));
		} catch {
			// No transcript yet — a brand-new session.
		}
	}

	send(text, { attachments = [] } = {}) {
		if (this.record.status === "closed") throw new Error("session is closed — start a new one");
		const content = attachments.length
			? [...attachments, { type: "text", text }]
			: text;
		this.#record({ type: "dashboard", kind: "user", text, attachmentCount: attachments.length });
		this.#ensureStarted();
		this.input.push({ type: "user", message: { role: "user", content }, parent_tool_use_id: null });
		this.#setStatus("running");
	}

	/** `decision`: { behavior: "allow" | "deny", message?, alwaysAllow?, answers? }. */
	async answer(requestId, decision) {
		const entry = this.pending.get(requestId);
		if (!entry) throw new Error("that request is no longer pending");
		this.pending.delete(requestId);
		if (decision.alwaysAllow && entry.kind === "approval") await this.alwaysAllow.add(this.record.projectDir, entry.toolName);
		this.#record({ type: "dashboard", kind: `${entry.kind}-resolved`, requestId, decision: { ...decision, answers: decision.answers } });
		entry.resolve(decision);
		this.#refreshStatus();
	}

	/**
	 * D-158: switches the model of a live session without ending its turn — the next request Claude makes uses
	 * `model`. Kept on the record, so a resumed session stays on it.
	 */
	async setModel(model, reason = "") {
		this.record.model = model;
		if (this.query) await this.query.setModel(model);
		this.#record({ type: "dashboard", kind: "model", model, reason });
		this.onChange?.(this);
	}

	async interrupt() {
		if (!this.query) return;
		for (const [requestId] of this.pending) await this.answer(requestId, { behavior: "deny", message: "Interrupted from the dashboard" });
		await this.query.interrupt().catch(() => {});
		this.#record({ type: "dashboard", kind: "interrupted" });
	}

	/**
	 * D-147: a closed session (a cancelled run) can take a message again — the conversation resumes from Claude's own
	 * transcript (`resume: claudeSessionId`), so "investigate and fix this" reaches the session that did the run.
	 */
	reopen() {
		if (this.record.status !== "closed") return;
		if (!this.record.claudeSessionId) throw new Error("this session never started Claude — start a new one");
		this.#record({ type: "dashboard", kind: "reopened" });
		this.#setStatus("idle");
	}

	close() {
		for (const [requestId] of this.pending) this.answer(requestId, { behavior: "deny", message: "Session closed" }).catch(() => {});
		this.input?.end();
		this.query?.close?.();
		this.query = null;
		deviceLock.release(this.id);
		this.#setStatus("closed");
	}

	#ensureStarted() {
		if (this.query) return;
		this.input = new InputQueue();
		const { allowedTools = [], disallowedTools = [], permissionMode, env } = this.options;
		this.query = query({
			prompt: this.input,
			options: {
				// `env` (D-068): a QA session's device and build. A settings file's own `env` (the
				// developer's local settings pin their own simulator) outranks the process env, so the
				// values go in as flag settings too, which outrank every settings file.
				...(env && { env: { ...process.env, ...env }, settings: { env } }),
				cwd: this.record.projectDir,
				model: this.record.model || undefined,
				pathToClaudeCodeExecutable: CLAUDE_PATH,
				settingSources: ["user", "project", "local"],
				resume: this.record.claudeSessionId || undefined,
				allowedTools,
				disallowedTools,
				permissionMode,
				canUseTool: (toolName, input, context) => this.#canUseTool(toolName, input, context),
				hooks: { PreToolUse: [{ hooks: [(hookInput) => this.#preToolUse(hookInput)], timeout: 3600 }] },
				stderr: (data) => this.emit("stderr", data),
			},
		});
		this.#pump();
	}

	async #pump() {
		const activeQuery = this.query;
		try {
			for await (const message of activeQuery) this.#handle(message);
			if (this.query === activeQuery && this.record.status !== "closed") this.#endProcess("idle");
		} catch (error) {
			this.#record({ type: "dashboard", kind: "error", text: error.message });
			if (this.query === activeQuery) this.#endProcess("error");
		}
	}

	#endProcess(status) {
		this.query = null;
		this.input = null;
		deviceLock.release(this.id);
		this.#setStatus(status);
	}

	#handle(message) {
		// Usage figures ride on the stream, including the "allowed" rate-limit events dropped below (D-077).
		usageFeed.noteMessage(message, this.id);
		if (message.type === "system") {
			if (NOISY_SYSTEM_EVENTS.has(message.subtype)) return;
			if (message.subtype === "init") {
				this.record.claudeSessionId = message.session_id;
				this.#record({
					type: "system",
					subtype: "init",
					model: message.model,
					cwd: message.cwd,
					permissionMode: message.permissionMode,
					mcp_servers: message.mcp_servers,
				});
				return;
			}
		}
		if (message.type === "rate_limit_event" && message.rate_limit_info?.status === "allowed") return;
		if (message.type === "assistant") {
			for (const part of message.message?.content ?? []) if (part.type === "tool_use") this.toolNames.set(part.id, part.name);
			const text = (message.message?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
			if (text) this.record.lastText = text.slice(0, 200);
		}
		if (message.type === "user") {
			for (const part of message.message?.content ?? []) {
				if (part.type !== "tool_result") continue;
				this.emit("tool-result", { name: this.toolNames.get(part.tool_use_id), text: toolResultText(part), isError: Boolean(part.is_error) });
			}
		}
		if (message.type === "result") {
			this.record.turns = (this.record.turns ?? 0) + (message.num_turns ?? 0);
			this.record.costUsd = (this.record.costUsd ?? 0) + (message.total_cost_usd ?? 0);
			deviceLock.release(this.id);
			this.#record(message);
			this.emit("turn-end", message);
			if (this.options.autoClose) this.close();
			else this.#refreshStatus("idle");
			return;
		}
		this.#record(clipToolResults(message));
	}

	async #preToolUse(hookInput) {
		const reason = hardDenyReason(hookInput.tool_name, hookInput.tool_input);
		if (reason) {
			this.#record({ type: "dashboard", kind: "hard-deny", toolName: hookInput.tool_name, text: reason });
			return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
		}
		if (TEST_FORGE_DRIVER_TOOL.test(hookInput.tool_name) && deviceLock.holder?.ownerId !== this.id) {
			const waitFor = deviceLock.acquire(this.id, this.record.title);
			if (deviceLock.isWaiting(this.id)) this.#setStatus("waiting-device");
			await waitFor;
			this.#refreshStatus("running");
		}
		return { continue: true };
	}

	async #canUseTool(toolName, input, { signal, suggestions }) {
		const reason = hardDenyReason(toolName, input);
		if (reason) return { behavior: "deny", message: reason };

		if (toolName === "AskUserQuestion") {
			const decision = await this.#waitForUser("question", toolName, input, signal);
			if (decision.behavior !== "allow") return { behavior: "deny", message: decision.message || "The user skipped the question." };
			return { behavior: "allow", updatedInput: { ...input, answers: decision.answers ?? {} } };
		}

		if (isPreAllowed(toolName) || (await this.alwaysAllow.allows(this.record.projectDir, toolName))) {
			return { behavior: "allow", updatedInput: input };
		}

		const decision = await this.#waitForUser("approval", toolName, input, signal, suggestions);
		if (decision.behavior === "allow") return { behavior: "allow", updatedInput: input };
		return { behavior: "deny", message: decision.message || "Denied from the dashboard." };
	}

	#waitForUser(kind, toolName, input, signal, suggestions) {
		const requestId = randomUUID();
		return new Promise((resolve) => {
			this.pending.set(requestId, { kind, toolName, input, resolve });
			this.#record({ type: "dashboard", kind, requestId, toolName, input, suggestions });
			this.emit("needs-you", { requestId, kind, toolName });
			this.#refreshStatus();
			signal?.addEventListener("abort", () => {
				if (!this.pending.has(requestId)) return;
				this.pending.delete(requestId);
				this.#record({ type: "dashboard", kind: `${kind}-resolved`, requestId, decision: { behavior: "deny", message: "aborted" } });
				resolve({ behavior: "deny", message: "aborted" });
				this.#refreshStatus();
			});
		});
	}

	#refreshStatus(fallback = this.record.status) {
		if (this.record.status === "closed") return;
		const kinds = [...this.pending.values()].map((entry) => entry.kind);
		if (kinds.includes("question")) this.#setStatus("waiting-answer");
		else if (kinds.includes("approval")) this.#setStatus("waiting-approval");
		else if (deviceLock.isWaiting(this.id)) this.#setStatus("waiting-device");
		else this.#setStatus(fallback.startsWith("waiting") ? "running" : fallback);
	}

	#setStatus(status) {
		if (this.record.status === status) return;
		this.record.status = status;
		this.record.updatedAt = new Date().toISOString();
		this.#record({ type: "dashboard", kind: "status", status });
		this.emit("status", status);
		this.onChange?.(this);
	}

	#record(event) {
		const stamped = { ...event, seq: ++this.seq, at: new Date().toISOString() };
		this.events.push(stamped);
		if (this.events.length > MEMORY_EVENT_LIMIT) this.events.shift();
		this.record.updatedAt = stamped.at;
		this.emit("event", stamped);
		const path = this.#transcriptPath();
		this.writeChain = this.writeChain
			.then(() => mkdir(join(this.dataDir, "sessions"), { recursive: true }))
			.then(() => appendFile(path, `${JSON.stringify(stamped)}\n`))
			.catch(() => {});
		this.onChange?.(this);
	}

	#transcriptPath() {
		return join(this.dataDir, "sessions", `${this.id}.ndjson`);
	}
}
