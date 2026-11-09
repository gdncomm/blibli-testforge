// In-memory job registry backing the SSE console. A job is any long-running, line-oriented
// process (a headless /test-forge-run, a macro replay, a tailed command) that the UI wants to watch live
// without blocking the HTTP request that started it.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

const jobs = new Map();
/** Emits "change" when a job starts, is asked to cancel, or finishes — the state stream watches it. */
export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);
const MAX_BUFFERED_LINES = 2000;

export function createJob(meta = {}) {
	const id = randomUUID();
	const job = {
		id,
		meta,
		lines: [],
		status: "running",
		verdict: null,
		startedAt: new Date().toISOString(),
		endedAt: null,
		isCancelled: false,
		onCancel: null,
		emitter: new EventEmitter(),
	};
	jobs.set(id, job);
	jobEvents.emit("change", job);
	return job;
}

/** Marks the job cancelled and runs its owner's cancel hook (kill a child process, stop a loop).
 *  The owner still calls `finishJob`, so history records what actually happened. */
export function cancelJob(id) {
	const job = jobs.get(id);
	if (!job || job.status !== "running") return false;
	job.isCancelled = true;
	appendLine(job, "! cancel requested");
	job.onCancel?.();
	jobEvents.emit("change", job);
	return true;
}

export function activeJobs() {
	return [...jobs.values()]
		.filter((job) => job.status === "running")
		.map(({ id, meta, startedAt }) => ({ id, meta, startedAt }));
}

export function appendLine(job, line) {
	job.lines.push(line);
	if (job.lines.length > MAX_BUFFERED_LINES) job.lines.shift();
	job.emitter.emit("line", line);
}

export function finishJob(job, { status = "done", verdict = null } = {}) {
	job.status = status;
	job.verdict = verdict;
	job.endedAt = new Date().toISOString();
	job.emitter.emit("end");
	jobEvents.emit("change", job);
}

export function getJob(id) {
	return jobs.get(id);
}
