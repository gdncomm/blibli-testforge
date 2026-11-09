// Test Batches (R4j, D-109): a named cycle of QA work. Exactly one is active at a time; every run, replay,
// Claude chat and scan started while it is active is attached to it, and its proof lands in
// <proof root>/<batch folder>/. The proof root is chosen once in the app and kept in `.data/settings.json`.
// D-212: status is active → paused ⇄ active → ended. A paused batch keeps its items and folder but collects nothing,
// so QA can switch to other work and come back to it without ending it.
import { EventEmitter } from "node:events";
import { access, constants, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const NAME_LIMIT = 80;
// The folder start.sh / .env.local configured before R4j: offered in the picker, never used until chosen.
const ENV_SUGGESTION = process.env.TEST_FORGE_MEDIA_ROOT ?? null;

/** Why `path` can't be the proof root, or null. Too broad (`~`, `/Users`) would let Reset empty the user's files. */
export async function proofRootProblem(path) {
	if (!path || !isAbsolute(String(path))) return "choose an absolute folder";
	const full = resolve(String(path));
	if (full === homedir() || full.split(sep).length < 4) return `${full} is too broad — choose or create a folder inside it`;
	const info = await stat(full).catch(() => null);
	if (info && !info.isDirectory()) return `${full} is a file, not a folder`;
	if (!info) return `${full} doesn't exist`;
	const isWritable = await access(full, constants.W_OK).then(() => true, () => false);
	return isWritable ? null : `${full} isn't writable`;
}

/** A folder name from the batch name: readable, filesystem-safe, unique by its local date-time prefix. */
export function batchFolderName(name, startedAt) {
	const date = new Date(startedAt);
	const pad = (value) => String(value).padStart(2, "0");
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
	const slug = String(name).trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
	return slug ? `${stamp}_${slug}` : stamp;
}

export class TestBatchStore extends EventEmitter {
	constructor(dataDir) {
		super();
		this.settingsPath = join(dataDir, "settings.json");
		this.path = join(dataDir, "test-batches.json");
		this.settings = {};
		this.batches = [];
		this.saveChain = Promise.resolve();
		/** A batch run's cases from the results store, for `batchProgress`; the server sets it. */
		this.runCases = () => [];
	}

	async restore() {
		this.settings = await readJson(this.settingsPath, {});
		this.batches = await readJson(this.path, []);
		this.#applyMediaRoot();
		return this;
	}

	get proofRoot() {
		return this.settings.proofRoot ?? null;
	}

	get active() {
		return this.batches.find((batch) => batch.status === "active") ?? null;
	}

	/** Where proof goes right now: the active batch's folder, else the root itself (scans, Driver Console). */
	get mediaDir() {
		if (!this.proofRoot) return null;
		return this.active ? join(this.proofRoot, this.active.folder) : this.proofRoot;
	}

	list() {
		return this.batches.map((batch) => this.#summarize(batch));
	}

	#summarize(batch) {
		const source = batch.replayOf ? this.get(batch.replayOf.id) : null;
		const comparison = source ? compareBatches(source, batch, { runCases: this.runCases }) : null;
		return { ...summary(batch), progress: batchProgress(batch, { runCases: this.runCases }), comparison };
	}

	get(id) {
		return this.batches.find((batch) => batch.id === id) ?? null;
	}

	/** D-212: batches set aside to come back to, most recently paused first. */
	get paused() {
		return this.batches.filter((batch) => batch.status === "paused").sort((a, b) => String(b.pausedAt).localeCompare(String(a.pausedAt)));
	}

	view() {
		return {
			proofRoot: this.proofRoot,
			suggestedRoot: this.proofRoot ? null : ENV_SUGGESTION,
			active: this.active ? this.#summarize(this.active) : null,
			paused: this.paused.map((batch) => this.#summarize(batch)),
			batches: this.list(),
		};
	}

	async setProofRoot(path) {
		const problem = await proofRootProblem(path);
		if (problem) throw new Error(problem);
		if (this.active) throw new Error(`end Test Batch “${this.active.name}” first — its proof is in the current folder`);
		this.settings = { ...this.settings, proofRoot: resolve(path) };
		await writeAtomically(this.settingsPath, this.settings);
		this.#applyMediaRoot();
		this.emit("change");
		return this.view();
	}

	/** `replayOf` (D-201): {id, name, caseIds, build} when this batch replays an earlier one on a new build. */
	async start(name, { replayOf = null } = {}) {
		const trimmed = String(name ?? "").trim().slice(0, NAME_LIMIT);
		if (!trimmed) throw new Error("name the Test Batch (a ticket, build or feature)");
		if (!this.proofRoot) throw new Error("choose the proof folder first");
		if (this.active) throw new Error(`Test Batch “${this.active.name}” is still active — end it first`);
		const startedAt = new Date().toISOString();
		const batch = { id: randomUUID(), name: trimmed, folder: batchFolderName(trimmed, startedAt), status: "active", startedAt, endedAt: null, items: [], ...(replayOf && { replayOf }) };
		await mkdir(join(this.proofRoot, batch.folder), { recursive: true });
		this.batches.unshift(batch);
		await this.#save();
		return summary(batch);
	}

	/** Adds a piece of work to the active batch; a no-op when none is active or it is already there. */
	attach({ kind, refId, title }) {
		const batch = this.active;
		if (!batch || !refId || batch.items.some((item) => item.refId === refId)) return null;
		batch.items.push({ kind, refId, title: title ?? kind, at: new Date().toISOString() });
		this.#save();
		return batch.id;
	}

	/**
	 * F2 (D-189): copies finished work's outcome onto its batch item, so a batch's progress survives the task store
	 * dropping old tasks and server restarts. `updates`: [{refId, status, verdict, caseId}]; saves once when anything changed.
	 */
	settle(updates) {
		const byRef = new Map(updates.map((update) => [update.refId, update]));
		let isChanged = false;
		for (const batch of this.batches) {
			for (const item of batch.items) {
				const update = byRef.get(item.refId);
				if (!update || (item.status === update.status && item.verdict === (update.verdict ?? null))) continue;
				Object.assign(item, { status: update.status, verdict: update.verdict ?? null, ...(update.caseId && { caseId: update.caseId }) });
				isChanged = true;
			}
		}
		if (isChanged) this.#save();
		return isChanged;
	}

	/** Takes a batch off the list; its proof folder and report stay on disk. An active or paused batch must be ended first. */
	async remove(id) {
		const batch = this.get(id);
		if (!batch) throw new Error("no such Test Batch");
		if (batch.status !== "ended") throw new Error("end this Test Batch before removing it");
		this.batches = this.batches.filter((entry) => entry.id !== id);
		await this.#save();
		return this.view();
	}

	/** Ends the batch and writes its report into the batch folder; `buildReport(batch)` returns Markdown. */
	async end(id, { buildReport }) {
		const batch = this.get(id);
		if (!batch) throw new Error("no such Test Batch");
		if (batch.status === "ended") throw new Error("this Test Batch has already ended");
		if (batch.status === "paused") closePause(batch, "endedAt");
		batch.status = "ended";
		batch.pausedAt = null;
		batch.endedAt = new Date().toISOString();
		const reportPath = join(this.proofRoot, batch.folder, "report.md");
		await mkdir(dirname(reportPath), { recursive: true });
		await writeFile(reportPath, await buildReport(batch));
		batch.reportPath = reportPath;
		await this.#save();
		return summary(batch);
	}

	/**
	 * D-184: makes an ended batch active again — same folder and items, so later work and proof join it. Refuses while
	 * another batch is active (the route ends that one first). Each reopen is recorded in `reopenedAt`.
	 */
	async reopen(id) {
		const batch = this.get(id);
		if (!batch) throw new Error("no such Test Batch");
		if (batch.status === "active") throw new Error("this Test Batch is already active");
		if (batch.status === "paused") throw new Error("this Test Batch is paused — resume it instead");
		if (this.active) throw new Error(`Test Batch “${this.active.name}” is still active — pause or end it first`);
		if (!this.proofRoot) throw new Error("choose the proof folder first");
		await mkdir(join(this.proofRoot, batch.folder), { recursive: true });
		batch.status = "active";
		batch.reopenedAt = [...(batch.reopenedAt ?? []), new Date().toISOString()];
		batch.endedAt = null;
		this.batches = [batch, ...this.batches.filter((entry) => entry.id !== id)];
		await this.#save();
		return summary(batch);
	}

	/**
	 * D-212: sets the active batch aside. Nothing attaches to it and proof goes to the root until it is resumed; its items,
	 * folder and progress stay. Each pause is kept in `pauses` ({at, resumedAt | endedAt}).
	 */
	async pause(id) {
		const batch = this.get(id);
		if (!batch) throw new Error("no such Test Batch");
		if (batch.status !== "active") throw new Error(batch.status === "paused" ? "this Test Batch is already paused" : "this Test Batch has ended — reopen it instead");
		const at = new Date().toISOString();
		batch.status = "paused";
		batch.pausedAt = at;
		batch.pauses = [...(batch.pauses ?? []), { at }];
		await this.#save();
		return summary(batch);
	}

	/** D-212: makes a paused batch active again. Refuses while another is active (the route pauses that one first). */
	async resume(id) {
		const batch = this.get(id);
		if (!batch) throw new Error("no such Test Batch");
		if (batch.status !== "paused") throw new Error(batch.status === "active" ? "this Test Batch is already active" : "this Test Batch has ended — reopen it instead");
		if (this.active) throw new Error(`Test Batch “${this.active.name}” is still active — pause or end it first`);
		if (!this.proofRoot) throw new Error("choose the proof folder first");
		await mkdir(join(this.proofRoot, batch.folder), { recursive: true });
		closePause(batch, "resumedAt");
		batch.status = "active";
		batch.pausedAt = null;
		this.batches = [batch, ...this.batches.filter((entry) => entry.id !== id)];
		await this.#save();
		return summary(batch);
	}

	/** Every proof write in the server and in what it spawns (test-forge-driver MCP, harness) reads this variable. */
	#applyMediaRoot() {
		const dir = this.mediaDir;
		if (dir) process.env.TEST_FORGE_MEDIA_ROOT = dir;
		else delete process.env.TEST_FORGE_MEDIA_ROOT;
	}

	#save() {
		this.#applyMediaRoot();
		this.emit("change");
		this.saveChain = this.saveChain.then(() => writeAtomically(this.path, this.batches)).catch(() => {});
		return this.saveChain;
	}
}

/** PASS…, FAIL…/BLOCKED… and undecided outcomes; anything else (a save-as-macro turn's DONE) is not a test result. */
export function outcomeOf(verdict) {
	const text = String(verdict ?? "").toUpperCase();
	if (text.startsWith("PASS")) return "passed";
	if (text.startsWith("FAIL") || text.startsWith("BLOCKED")) return "failed";
	if (/^(UNDECIDED|EVIDENCE|INCONCLUSIVE|SKIP)/.test(text)) return "undecided";
	return null;
}

const TEST_KINDS = new Set(["replay-v2", "replay", "test-forge-run"]);

/**
 * Where a batch stands, per case (its latest result counts): passed, failed, undecided, running. `runCases(refId)` gives a
 * batch run's own cases ([{caseId, status, verdict}]) from the results store.
 */
export function batchProgress(batch, { runCases = () => [] } = {}) {
	const { latest, running } = latestOutcomes(batch, { runCases });
	const counts = { passed: 0, failed: 0, undecided: 0 };
	for (const { outcome } of latest.values()) counts[outcome]++;
	return { ...counts, running, cases: latest.size };
}

/** Per case key, the latest decided result in the batch ({outcome, verdict, caseId, scenario}), plus how many still run. */
function latestOutcomes(batch, { runCases }) {
	const latest = new Map();
	let running = 0;
	for (const item of batch.items) {
		const entries = item.kind === "run" ? runCases(item.refId).map((entry) => ({ ...entry, key: entry.caseId })) : TEST_KINDS.has(item.kind) ? [{ ...item, key: item.caseId ?? item.refId }] : [];
		for (const entry of entries) {
			if (["queued", "running", "pending"].includes(entry.status)) running++;
			const outcome = outcomeOf(entry.verdict);
			if (outcome) latest.set(String(entry.key), { outcome, verdict: entry.verdict, caseId: entry.caseId ?? null, scenario: entry.scenario ?? null });
		}
	}
	return { latest, running };
}

/** D-201: the cases a batch decided, latest result each — what "Replay on this build" replays. */
export function batchCases(batch, { runCases = () => [] } = {}) {
	return [...latestOutcomes(batch, { runCases }).latest.values()].filter((entry) => entry.caseId);
}

/**
 * D-201: a replay batch against the batch it replayed, per case. `regressed` passed before and fails now; `fixed` the
 * reverse; `missing` were in the original and have no result yet. Only cases the replay was asked to run count.
 */
export function compareBatches(source, replay, { runCases = () => [] } = {}) {
	const before = new Map(batchCases(source, { runCases }).map((entry) => [String(entry.caseId), entry]));
	const now = new Map(batchCases(replay, { runCases }).map((entry) => [String(entry.caseId), entry]));
	const cases = (replay.replayOf?.caseIds ?? [...before.keys()]).map((caseId) => {
		const was = before.get(String(caseId))?.outcome ?? null;
		const is = now.get(String(caseId))?.outcome ?? null;
		const change = !is ? "missing" : was === "passed" && is !== "passed" ? "regressed" : was !== "passed" && is === "passed" ? "fixed" : "same";
		return { caseId, scenario: now.get(String(caseId))?.scenario ?? before.get(String(caseId))?.scenario ?? null, was, is, change };
	});
	const counts = { regressed: 0, fixed: 0, same: 0, missing: 0 };
	for (const entry of cases) counts[entry.change]++;
	return { sourceId: source.id, sourceName: source.name, ...counts, cases };
}

/** Stamps the open pause entry with how it closed (`resumedAt` or `endedAt`). */
function closePause(batch, key) {
	const open = (batch.pauses ?? []).findLast((entry) => !entry.resumedAt && !entry.endedAt);
	if (open) open[key] = new Date().toISOString();
}

function summary(batch) {
	const { items, ...rest } = batch;
	const counts = {};
	for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
	return { ...rest, itemCount: items.length, counts, items };
}

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return fallback;
	}
}

async function writeAtomically(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.tmp-${process.pid}`;
	await writeFile(temporary, JSON.stringify(value, null, 2));
	await rename(temporary, path);
}
