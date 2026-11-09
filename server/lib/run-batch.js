// P4 — the Run step (workflow-plan §⑥, D-061). "Run selected" becomes a server-side batch: the
// cases run one after another in the device lane, survive a page reload, and can be paused (finish
// the current case, then hold), skipped or cancelled. Each case runs as a macro replay when one is
// linked to it, otherwise as a Claude /test-forge-run (user decision). A case during which the app crashed
// is BLOCKED with the crash report, and the batch holds until someone relaunches and continues.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { caseLinks } from "./macro-v2.js";

const FINISHED = new Set(["done", "cancelled"]);

export class RunBatch extends EventEmitter {
	/**
	 * `items`: [{caseId, scenario, mode: "replay"|"claude", macroId?, macroName?}].
	 * `deps.start(item, batch)` → `{jobId, sessionId?, done: Promise<{status, verdict}>, cancel()}`;
	 * `deps.findCrash(sinceMs)` → `{path, summary}` | null; `deps.relaunch()` brings the app back.
	 */
	constructor({ items, approval = "ask", deps, rerunOf = null }) {
		super();
		this.id = randomUUID();
		this.rerunOf = rerunOf;
		this.approval = approval;
		this.deps = deps;
		this.status = "running";
		this.createdAt = new Date().toISOString();
		this.items = items.map((item) => ({ ...item, status: "queued" }));
		this.isPauseRequested = false;
		this.pauseReason = null;
		this.current = null;
		this.resumeWaiter = null;
	}

	snapshot() {
		const { id, approval, status, createdAt, items, isPauseRequested, pauseReason, endedAt, rerunOf } = this;
		const counts = {};
		for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
		return { id, rerunOf, approval, status, createdAt, endedAt, isPauseRequested, pauseReason, counts, items: items.map(({ handle, ...item }) => item) };
	}

	#changed() {
		this.emit("change", this.snapshot());
	}

	async run() {
		// Re-scans each time: a case stopped by the usage limit goes back to queued and runs after the resume.
		for (let item = this.#nextQueued(); item; item = this.#nextQueued()) {
			if (this.status === "cancelled") break;
			if (this.isPauseRequested) await this.#hold(this.pauseReason ?? "the next case waits for you");
			if (this.status === "cancelled") break;
			await this.#runItem(item);
		}
		if (this.status !== "cancelled") this.status = "done";
		this.endedAt = new Date().toISOString();
		this.#changed();
		return this.snapshot();
	}

	#nextQueued() {
		return this.status === "cancelled" ? undefined : this.items.find((item) => item.status === "queued");
	}

	async #runItem(item) {
		const startedAtMs = Date.now();
		Object.assign(item, { status: "running", startedAt: new Date(startedAtMs).toISOString() });
		this.current = item;
		this.#changed();
		let outcome;
		try {
			item.handle = await this.deps.start(item, this);
			Object.assign(item, { jobId: item.handle.jobId, sessionId: item.handle.sessionId });
			this.#changed();
			outcome = await item.handle.done;
		} catch (error) {
			outcome = { status: "error", verdict: `BLOCKED (couldn't start: ${error.message})` };
		}
		if (outcome.usageLimit && item.status !== "skipping" && this.status !== "cancelled") {
			this.#requeueForLimit(item, outcome.usageLimit);
			return;
		}
		const isStopped = () => item.status === "skipping" || this.status === "cancelled";
		item.verdict = outcome.verdict ?? outcome.status?.toUpperCase();
		// Checked whatever the verdict: a replay that loses the app restarts and may still PASS.
		if (!isStopped()) {
			const crash = await this.deps.findCrash?.(startedAtMs).catch(() => null);
			if (crash) {
				Object.assign(item, { verdict: "BLOCKED (app crashed)", verdictBeforeCrash: item.verdict, crash });
				this.requestPause(`the app crashed during ${item.caseId} — relaunch it and continue`, { isCrash: true });
			}
		}
		// Driver first, Claude only on an issue (D-064): a failed replay is triaged (and repaired, then
		// replayed by the driver); a case Claude passed is saved as a macro and proven by a replay.
		if (!isStopped() && !item.crash && this.deps.followUp) {
			const attach = (handle) => {
				Object.assign(item, { handle, jobId: handle.jobId, phase: handle.phase });
				this.#changed();
			};
			const next = await this.deps.followUp(item, { attach, isStopped }).catch((error) => ({ followUpError: error.message }));
			if (next && !isStopped()) {
				const { usageLimit, ...result } = next;
				Object.assign(item, result);
				// D-220: the limit stopped saving or triaging, not the case; its result stands and the batch holds.
				if (usageLimit) this.requestPause(`Claude's usage limit stopped the follow-up for ${item.caseId}: ${usageLimit}. Resume when it resets.`);
			}
			delete item.phase;
		}
		const wasSkipped = item.status === "skipping";
		if (wasSkipped) item.verdict = "SKIPPED";
		item.status = wasSkipped ? "skipped" : this.status === "cancelled" ? "cancelled" : "done";
		item.endedAt = new Date().toISOString();
		item.durationMs = Date.now() - startedAtMs;
		// Evidence for the results review (P5): screenshots, mocks served, summary, cost.
		if (!wasSkipped && this.deps.collect) item.evidence = await this.deps.collect(item, startedAtMs).catch(() => null);
		this.emit("item-done", item);
		delete item.handle;
		this.current = null;
		this.#changed();
	}

	/** The case never got a fair run: it goes back in the queue and the batch holds until someone resumes. */
	#requeueForLimit(item, message) {
		const { caseId, scenario, mode, macroId, macroName, rerunIndex } = item;
		for (const key of Object.keys(item)) delete item[key];
		Object.assign(item, { caseId, scenario, mode, ...(macroId && { macroId, macroName }), ...(Number.isInteger(rerunIndex) && { rerunIndex }), status: "queued" });
		this.current = null;
		this.requestPause(`Claude's usage limit stopped ${caseId}: ${message}. Resume when it resets — ${caseId} runs again.`);
	}

	#hold(reason) {
		this.status = "paused";
		this.pauseReason = reason;
		this.#changed();
		return new Promise((resolve) => {
			this.resumeWaiter = resolve;
		});
	}

	/** Finish the current case, then hold before the next one. */
	requestPause(reason = null, { isCrash = false } = {}) {
		if (FINISHED.has(this.status)) return false;
		this.isPauseRequested = true;
		this.pauseReason = reason;
		this.isCrashPause = isCrash;
		this.#changed();
		return true;
	}

	/** Continue after a pause; after a crash the app is relaunched first. */
	async resume() {
		if (this.status !== "paused" && !this.isPauseRequested) return false;
		if (this.isCrashPause) await this.deps.relaunch?.();
		this.isPauseRequested = false;
		this.isCrashPause = false;
		this.pauseReason = null;
		if (this.status === "paused") this.status = "running";
		const waiter = this.resumeWaiter;
		this.resumeWaiter = null;
		this.#changed();
		waiter?.();
		return true;
	}

	/** Stop the current case and move on to the next. */
	skip() {
		const item = this.current;
		if (!item || item.status !== "running") return false;
		item.status = "skipping";
		item.handle?.cancel();
		this.#changed();
		return true;
	}

	/** Stop the current case and drop the rest. */
	cancel() {
		if (FINISHED.has(this.status)) return false;
		const wasPaused = this.status === "paused";
		this.status = "cancelled";
		for (const item of this.items) if (item.status === "queued") Object.assign(item, { status: "cancelled", verdict: "CANCELLED" });
		this.current?.handle?.cancel();
		this.#changed();
		if (wasPaused) {
			const waiter = this.resumeWaiter;
			this.resumeWaiter = null;
			waiter?.();
		}
		return true;
	}
}

/** Picks how a case runs: its linked macro (free, fast) when there is one, else Claude /test-forge-run. */
export function planItems(cases, macros) {
	return cases.map((testCase) => {
		const macro = macros.find((entry) => entry.schemaVersion === 2 && caseLinks(entry).includes(String(testCase.id).toUpperCase()));
		return macro
			? { caseId: testCase.id, scenario: testCase.scenario, mode: "replay", macroId: macro.id, macroName: macro.name }
			: { caseId: testCase.id, scenario: testCase.scenario, mode: "claude" };
	});
}
