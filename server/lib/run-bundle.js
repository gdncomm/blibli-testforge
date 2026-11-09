// Run bundles (D-162): one person pays for the Claude runs, everyone after replays them for free. A
// bundle is one JSON file made from a finished run: the cases, the macros that replay them (routines
// included), the elements those macros target, the mock rules they arm, the code the run tested and
// the run's own verdicts with a small proof picture per case. Importing it on another Mac writes the
// macros, elements and mocks into that Mac's UI test folder, loads the cases, and a replay-only batch
// checks them with the driver alone. Nothing here calls Claude.
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { exportRules, loadPackRules } from "./mock-pack.js";
import { redacted } from "./redact.js";
import { caseLinks, findMacroV2, flattenSteps, listMacrosV2, loadRegistry, saveRegistry, uiTestRoot } from "./macro-v2.js";
import { finalVerdict, isProbeShot } from "./results.js";
import { variantsArmedBy, variantsServed } from "./mock-variants.js";
import { loadMockNotes, mergeMockNotes } from "./demo.js";

const run = promisify(execFile);

export const BUNDLE_FORMAT = "test-forge-bundle";
export const BUNDLE_VERSION = 1;
export const BUNDLE_SUFFIX = ".test-forge-bundle.json";
const THUMB_MAX_PX = 720;
const MAX_ROUTINE_DEPTH = 5;

/** Home folders in text a bundle carries are cut down to `~`: a path means nothing on another Mac and names this one's user. */
const withoutHome = (text) => String(text ?? "").replace(/\/Users\/[^/\s]+/g, "~");

/** The commit part of a code id: `9ec4017+64e6` (local changes on 9ec4017) → `9ec4017`. */
export const commitOf = (codeId) => String(codeId ?? "").split("+")[0] || null;

/**
 * The run with each case's newest result from later finished runs of the same code — e.g. cases a
 * usage limit stopped and a second run finished. Returns the run unchanged when nothing later shares a case.
 */
export function withLaterResults(runs, run) {
	const later = runs
		.filter((entry) => entry.id !== run.id && entry.createdAt > run.createdAt && entry.status === "done" && entry.manifest?.codeId === run.manifest?.codeId)
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	const items = run.items.map((item) => {
		const newest = later.flatMap((entry) => entry.items).filter((entry) => entry.caseId === item.caseId && entry.status === "done").at(-1);
		return newest ?? item;
	});
	const mergedFrom = later.filter((entry) => entry.items.some((item) => items.includes(item))).map((entry) => entry.id);
	return mergedFrom.length ? { ...run, items, mergedFrom } : run;
}

/** Every element id anywhere in a macro (steps, guards, cleanup), by registry membership. */
export function elementIdsIn(value, registry, found = new Set()) {
	if (typeof value === "string") {
		if (registry.elements?.[value]) found.add(value);
	} else if (Array.isArray(value)) {
		for (const entry of value) elementIdsIn(entry, registry, found);
	} else if (value && typeof value === "object") {
		for (const entry of Object.values(value)) elementIdsIn(entry, registry, found);
	}
	return found;
}

/** The macro plus every routine it runs, each once, routines first. */
async function withRoutines(macro, loadMacro, depth = 0, seen = new Map()) {
	if (depth > MAX_ROUTINE_DEPTH || seen.has(macro.id)) return seen;
	for (const step of [...(macro.steps ?? []), ...(macro.cleanup ?? [])]) {
		if (step.do !== "run") continue;
		const routine = await loadMacro(step.macro);
		if (routine) await withRoutines(routine, loadMacro, depth + 1, seen);
	}
	seen.set(macro.id, macro);
	return seen;
}

/** Endpoints a macro's `mock` steps arm, routines expanded. */
async function mockEndpoints(macro, loadMacro) {
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, loadMacro).catch(() => []);
	return [...new Set(steps.filter((step) => step.do === "mock").map((step) => step.endpoint))];
}

/**
 * The mock variants a case ran with, best evidence first: what the run recorded as served; else what
 * the trace still holds for the case's time window (runs before D-163); else what its macro arms.
 */
async function caseMocks(item, { macro, loadMacro, traceRecords, rules }) {
	if (item.evidence?.mocksUsed?.length) return item.evidence.mocksUsed;
	const startedAt = Date.parse(item.startedAt ?? "");
	const endedAt = Date.parse(item.endedAt ?? "");
	if (traceRecords.length && Number.isFinite(startedAt) && Number.isFinite(endedAt)) {
		const served = variantsServed(traceRecords, rules, { since: startedAt, until: endedAt + 2000 });
		if (served.length) return served.map((entry) => ({ ...entry, from: "trace" }));
	}
	if (!macro) return [];
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, loadMacro).catch(() => []);
	return variantsArmedBy(steps);
}

/** Credential names a macro types (`typeSecret`), so the importer knows what to set up — never the values. */
async function credentialNames(macro, loadMacro) {
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, loadMacro).catch(() => []);
	return [...new Set(steps.filter((step) => step.do === "typeSecret").map((step) => step.credential || step.field).filter(Boolean))];
}

/** The last proof screenshot, shrunk to a JPEG for the bundle; null when there is none or `sips` fails. */
async function proofThumbnail(item) {
	const shot = (item.evidence?.screenshots ?? []).filter((path) => !isProbeShot(path)).at(-1);
	if (!shot) return null;
	const out = join(tmpdir(), `test-forge-thumb-${process.pid}-${Date.now()}.jpg`);
	try {
		await run("sips", ["-Z", String(THUMB_MAX_PX), "-s", "format", "jpeg", "-s", "formatOptions", "60", shot, "--out", out], { timeout: 20_000 });
		return (await readFile(out)).toString("base64");
	} catch {
		return null;
	} finally {
		await unlink(out).catch(() => {});
	}
}

/**
 * Builds the bundle for a finished run. `cases` are the loaded test cases (the full text Claude ran
 * from); `deviceRules` fill in a mock the repo's pack doesn't keep yet. Rules are redacted.
 */
export async function buildBundle({ run: result, cases, title, source, techDoc = null, deviceRules = [], traceRecords = [], root = uiTestRoot(), thumbnails = true, now = new Date() }) {
	const [macros, registry, packRules] = await Promise.all([listMacrosV2(root), loadRegistry(root), loadPackRules(root)]);
	const loadMacro = (idOrName) => findMacroV2(idOrName, root);
	const caseById = new Map(cases.map((entry) => [String(entry.id), entry]));
	const bundledMacros = new Map();
	const endpoints = new Set();
	const warnings = [];
	const items = [];
	const ruleFor = (endpoint) => packRules.get(endpoint)?.rule ?? deviceRules.find((entry) => entry.endpointKey === endpoint);
	// Device rules first: repo packs are redacted, so their bodies can differ from what was served.
	const matchRules = [...deviceRules, ...[...packRules.values()].map((entry) => entry.rule)];
	for (const item of result.items) {
		const linked = macros.find((macro) => caseLinks(macro).includes(String(item.caseId).toUpperCase()));
		const macro = linked ?? (item.macroId ? await loadMacro(item.macroId) : null);
		let credentials = [];
		if (macro) {
			for (const [id, entry] of await withRoutines(macro, loadMacro)) bundledMacros.set(id, entry);
			for (const endpoint of await mockEndpoints(macro, loadMacro)) endpoints.add(endpoint);
			credentials = await credentialNames(macro, loadMacro);
		}
		const mocksUsed = await caseMocks(item, { macro, loadMacro, traceRecords, rules: matchRules });
		for (const entry of mocksUsed) if (ruleFor(entry.endpoint)) endpoints.add(entry.endpoint);
		const isProven = Boolean(macro) && (item.mode === "replay" ? String(item.verdict ?? "").startsWith("PASS") : item.learned?.ok === true);
		items.push({
			caseId: item.caseId,
			scenario: item.scenario ?? caseById.get(String(item.caseId))?.scenario ?? "",
			verdict: finalVerdict(item),
			ranAs: item.mode,
			macroId: macro?.id ?? null,
			macroName: macro?.name ?? null,
			isProven,
			credentials,
			mocksUsed,
			costUsd: item.evidence?.costUsd ?? null,
			durationMs: item.durationMs ?? null,
			summary: withoutHome(item.evidence?.summary ?? "").slice(0, 2000),
			review: item.review ? { action: item.review.action, verdict: item.review.verdict, reason: item.review.reason } : null,
			proofJpeg: thumbnails ? await proofThumbnail(item) : null,
		});
		if (!caseById.has(String(item.caseId))) warnings.push(`case ${item.caseId} isn't in the loaded document — its text is missing from the bundle`);
	}
	const elementIds = new Set();
	for (const macro of bundledMacros.values()) elementIdsIn(macro, registry, elementIds);
	const mocks = [];
	for (const endpoint of [...endpoints].sort()) {
		const rule = ruleFor(endpoint);
		if (rule) mocks.push({ ...redacted(rule), isEnabled: false });
		else warnings.push(`no mock rule for ${endpoint} in the repo or on the device — a macro that arms it will be BLOCKED`);
	}
	// D-164: plain words for the server answers these cases use — demo subtitles on the next Mac read them.
	const allMockNotes = await loadMockNotes(root);
	const mockNotes = Object.fromEntries(mocks.filter((rule) => allMockNotes[rule.endpointKey]).map((rule) => [rule.endpointKey, allMockNotes[rule.endpointKey]]));
	const manifest = result.manifest ?? {};
	if (manifest.hasLocalChanges) warnings.push("the run tested uncommitted changes — push them, or the next person can't prepare the same code");
	const costs = items.map((item) => item.costUsd).filter((cost) => typeof cost === "number");
	return {
		format: BUNDLE_FORMAT,
		formatVersion: BUNDLE_VERSION,
		id: result.id,
		createdAt: now.toISOString(),
		title: title || `Run of ${items.length} case(s)`,
		source: source ? withoutHome(source) : null,
		techDoc: techDoc ? withoutHome(techDoc) : null,
		code: { branch: manifest.branch ?? null, codeId: manifest.codeId ?? null, commit: commitOf(manifest.codeId), hasLocalChanges: Boolean(manifest.hasLocalChanges) },
		run: { createdAt: result.createdAt, mergedFrom: result.mergedFrom ?? [], simulator: manifest.simulator ? manifest.simulator.replace(/\s*\([0-9A-F-]{36}\)$/i, "") : null, environment: manifest.environment ?? null, costUsd: costs.length ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(2)) : null },
		cases: result.items.map((item) => caseById.get(String(item.caseId))).filter(Boolean),
		items,
		macros: [...bundledMacros.values()].map(({ aliases, ...macro }) => macro),
		elements: Object.fromEntries([...elementIds].sort().map((id) => [id, registry.elements[id]])),
		mocks,
		mockNotes,
		warnings,
	};
}

export function validateBundle(bundle) {
	if (bundle?.format !== BUNDLE_FORMAT) throw new Error("not a TestForge bundle");
	if ((bundle.formatVersion ?? 0) > BUNDLE_VERSION) throw new Error(`bundle format ${bundle.formatVersion} is newer than this TestForge reads (${BUNDLE_VERSION}) — update the TestForge`);
	for (const key of ["items", "macros", "cases", "mocks"]) if (!Array.isArray(bundle[key])) throw new Error(`bundle has no ${key} list`);
	if (typeof bundle.elements !== "object" || bundle.elements === null) throw new Error("bundle has no elements");
	return bundle;
}

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const stepsOf = ({ id, name, path, aliases, ...macro }) => macro;

/**
 * What importing would do, without writing: per macro/element/mock `add` · `same` · `differs`, which
 * cases replay (and which still need a person or Claude), and whether the prepared code matches.
 */
export async function inspectBundle(bundle, { root = uiTestRoot(), currentCode = null } = {}) {
	validateBundle(bundle);
	const [macros, registry, packRules] = await Promise.all([listMacrosV2(root), loadRegistry(root), loadPackRules(root)]);
	const macroPlan = bundle.macros.map((macro) => {
		const local = macros.find((entry) => entry.id === macro.id);
		return { id: macro.id, name: macro.name, path: macro.path, action: !local ? "add" : sameJson(stepsOf(local), stepsOf(macro)) ? "same" : "differs" };
	});
	const elementPlan = Object.entries(bundle.elements).map(([id, element]) => {
		const local = registry.elements[id];
		return { id, action: !local ? "add" : sameJson(local, element) ? "same" : "differs" };
	});
	const mockPlan = bundle.mocks.map((rule) => {
		const local = packRules.get(rule.endpointKey)?.rule;
		return { endpoint: rule.endpointKey, action: !local ? "add" : sameJson(local, rule) ? "same" : "differs" };
	});
	const replayable = bundle.items.filter((item) => item.macroId);
	return {
		title: bundle.title,
		code: codeMatch(bundle.code, currentCode),
		counts: {
			cases: bundle.items.length,
			replayable: replayable.length,
			proven: replayable.filter((item) => item.isProven).length,
			needsJudgment: bundle.items.length - replayable.length,
		},
		credentials: [...new Set(bundle.items.flatMap((item) => item.credentials ?? []))],
		caseMocks: bundle.items
			.filter((item) => item.mocksUsed?.length)
			.map((item) => ({ caseId: item.caseId, hasMacro: Boolean(item.macroId), mocks: item.mocksUsed.map(({ endpoint, variant, match, candidates }) => ({ endpoint, variant, match, ...(candidates ? { candidates } : {}) })) })),
		macros: macroPlan,
		elements: elementPlan,
		mocks: mockPlan,
		conflicts: [...macroPlan, ...elementPlan, ...mockPlan].filter((entry) => entry.action === "differs").length,
		demoNotes: bundle.macros.filter((macro) => macro.demo).length,
		warnings: bundle.warnings ?? [],
	};
}

/** Does the prepared QA copy hold the code the bundle's run tested? */
export function codeMatch(code, current) {
	if (!code?.branch) return { state: "unknown", message: "the bundle doesn't say which code it tested" };
	if (!current) return { state: "notPrepared", message: `prepare ${code.branch} first (Test Cases › 1 · What code?)` };
	if (current.branch !== code.branch) return { state: "otherBranch", message: `prepared ${current.branch}, the bundle tested ${code.branch}` };
	const preparedCommit = commitOf(current.snapshotId ?? current.codeId);
	if (code.commit && preparedCommit && preparedCommit !== code.commit) return { state: "otherCommit", message: `prepared ${preparedCommit}, the bundle tested ${code.commit} — pull or prepare again` };
	if (code.hasLocalChanges) return { state: "localChanges", message: "the bundle's run included uncommitted changes you can't have — results may differ" };
	return { state: "match", message: `same code: ${code.branch} @ ${code.commit}` };
}

/**
 * Writes the bundle's macros, elements and mocks into the UI test folder. Anything already there and
 * different is kept unless `overwrite` — the repo is the source of truth until someone decides.
 */
export async function installBundle(bundle, { root = uiTestRoot(), overwrite = false } = {}) {
	const plan = await inspectBundle(bundle, { root });
	const written = { macros: [], elements: 0, mocks: [] };
	const shouldWrite = (action) => action === "add" || (action === "differs" && overwrite);
	const registry = await loadRegistry(root);
	for (const { id, action } of plan.elements) {
		if (!shouldWrite(action)) continue;
		registry.elements[id] = bundle.elements[id];
		written.elements += 1;
	}
	if (written.elements) await saveRegistry(registry, root);
	const existing = await listMacrosV2(root);
	for (const macro of bundle.macros) {
		const { action } = plan.macros.find((entry) => entry.id === macro.id);
		if (!shouldWrite(action)) continue;
		// A macro that differs is replaced where it already lives, so the id stays defined once.
		const relativePath = existing.find((entry) => entry.id === macro.id)?.path ?? macro.path;
		if (!relativePath || relativePath.includes("..") || !relativePath.endsWith(".json")) throw new Error(`macro ${macro.id} has no safe path`);
		const { path, ...stored } = macro;
		await writeJson(join(root, relativePath), stored);
		written.macros.push(relativePath);
	}
	const rules = bundle.mocks.filter((rule) => shouldWrite(plan.mocks.find((entry) => entry.endpoint === rule.endpointKey).action));
	// Already redacted on export.
	if (rules.length) written.mocks = await exportRules(rules, { root, redact: false });
	written.mockNotes = await mergeMockNotes(bundle.mockNotes ?? {}, { root, overwrite });
	return { ...plan, written };
}

async function writeJson(path, value) {
	await mkdir(join(path, ".."), { recursive: true });
	const temporary = `${path}.tmp-${process.pid}`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, path);
}

/** The bundle's verdicts as a run `compareRuns` can take as its base. */
export const bundleAsRun = (bundle) => ({
	id: `bundle:${bundle.id}`,
	createdAt: bundle.run?.createdAt ?? bundle.createdAt,
	manifest: { branch: bundle.code?.branch, codeId: bundle.code?.codeId },
	items: bundle.items.map((item) => ({ caseId: item.caseId, scenario: item.scenario, verdict: item.verdict, status: "done" })),
});

/** Imported bundles, kept whole so their verdicts and proof stay viewable next to the replay. */
export class BundleStore {
	constructor(dir) {
		this.dir = dir;
	}

	#path(id) {
		if (!/^[\w-]{1,80}$/.test(id)) throw new Error("bad bundle id");
		return join(this.dir, `${id}.json`);
	}

	async save(bundle, extra = {}) {
		const entry = { ...bundle, importedAt: new Date().toISOString(), ...extra };
		await writeJson(this.#path(bundle.id), entry);
		return entry;
	}

	async get(id) {
		return JSON.parse(await readFile(this.#path(id), "utf8"));
	}

	async update(id, changes) {
		const entry = { ...(await this.get(id)), ...changes };
		await writeJson(this.#path(id), entry);
		return entry;
	}

	async list() {
		const names = await readdir(this.dir).catch(() => []);
		const entries = [];
		for (const name of names.filter((entry) => entry.endsWith(".json"))) {
			try {
				entries.push(JSON.parse(await readFile(join(this.dir, name), "utf8")));
			} catch {
				// One unreadable file must not hide the others.
			}
		}
		return entries.sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)));
	}
}

export function bundleSummary(bundle) {
	return {
		id: bundle.id,
		title: bundle.title,
		createdAt: bundle.createdAt,
		importedAt: bundle.importedAt ?? null,
		code: bundle.code,
		cases: bundle.items.length,
		replayable: bundle.items.filter((item) => item.macroId).length,
		costUsd: bundle.run?.costUsd ?? null,
		replayRunIds: bundle.replayRunIds ?? [],
	};
}

export const bundleFileName = (bundle) => `${String(bundle.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "test-forge-run"}-${bundle.createdAt.slice(0, 10)}${BUNDLE_SUFFIX}`;
