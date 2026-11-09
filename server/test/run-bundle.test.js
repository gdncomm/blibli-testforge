import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportRules } from "../lib/mock-pack.js";
import { listMacrosV2, loadRegistry, saveMacroV2, saveRegistry } from "../lib/macro-v2.js";
import { compareRuns } from "../lib/results.js";
import { BundleStore, buildBundle, bundleAsRun, codeMatch, commitOf, inspectBundle, installBundle, validateBundle, withLaterResults } from "../lib/run-bundle.js";

const body = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const rule = (endpointKey) => ({
	id: "r1", endpointKey, isEnabled: true, activeVariantID: "v0", match: {},
	variants: [{ id: "v0", name: "anchor-mode", steps: [{ respond: { _0: { statusCode: 200, headers: { Authorization: "Bearer x" }, body: body({ token: "secret", ok: true }) } } }] }],
});
const element = (identifier) => ({ alias: identifier, screen: "Promo", locator: { chain: [{ identifier, type: "button" }], fallbacks: [] } });
const ENDPOINT = "GET /backend/content-api/promotions/{id}";

/** A developer's repo: a routine, a case macro that runs it and arms a mock, a registry, a pack. */
async function developerRepo() {
	const root = await mkdtemp(join(tmpdir(), "test-forge-bundle-dev-"));
	await saveRegistry({ schemaVersion: 1, elements: { el_TAB0000001: element("tab_0"), el_HOME000001: element("home"), el_UNUSED0001: element("x") } }, root);
	await saveMacroV2({ id: "mc_OPEN000001", name: "Open promo", kind: "routine", steps: [{ do: "wait", el: "el_HOME000001" }] }, { module: "Engagement", submodule: "Promo", root });
	await saveMacroV2({
		id: "mc_CASE000018", name: "MT-018 anchor tap", links: { testCase: "18" },
		steps: [{ do: "mock", endpoint: ENDPOINT, variant: "anchor-mode" }, { do: "run", macro: "mc_OPEN000001" }, { do: "tap", el: "el_TAB0000001", unless: "el_HOME000001" }],
	}, { module: "Engagement", submodule: "Promo", root });
	await exportRules([rule(ENDPOINT)], { root });
	return root;
}

const finishedRun = {
	id: "run-1", createdAt: "2026-10-31T02:00:00.000Z", status: "done",
	manifest: { branch: "feature/tabs", codeId: "9ec4017", hasLocalChanges: false, simulator: "TestForge · iPhone 12 (AC2A1B55-2C97-46EA-81AA-06C01819B753)" },
	items: [
		{ caseId: "18", scenario: "Anchor tap", mode: "claude", status: "done", verdict: "PASS", learned: { ok: true, macroId: "mc_CASE000018" }, evidence: { costUsd: 1.25, summary: "Checked /Users/someone/shot.png", screenshots: [] } },
		{ caseId: "24", scenario: "Header collapse", mode: "claude", status: "done", verdict: "UNDECIDED", evidence: { costUsd: 1.92, screenshots: [] } },
	],
};
const cases = [{ id: "18", scenario: "Anchor tap", steps: "Tap the tab" }, { id: "24", scenario: "Header collapse", steps: "Tap" }];

test("build: carries the case macro, its routine, only the elements they use, the redacted mock, and the run's verdicts", async () => {
	const root = await developerRepo();
	const bundle = await buildBundle({ run: finishedRun, cases, title: "MICROSITE_TABBING", source: "/Users/someone/cases.md", root, thumbnails: false });
	assert.equal(validateBundle(bundle), bundle);
	assert.deepEqual(bundle.macros.map((macro) => macro.id), ["mc_OPEN000001", "mc_CASE000018"]);
	assert.deepEqual(Object.keys(bundle.elements), ["el_HOME000001", "el_TAB0000001"]);
	assert.equal(bundle.mocks.length, 1);
	assert.equal(bundle.mocks[0].isEnabled, false);
	assert.equal(bundle.mocks[0].variants[0].steps[0].respond._0.headers.Authorization, "<redacted>");
	const [replayable, judged] = bundle.items;
	assert.equal(replayable.macroId, "mc_CASE000018");
	assert.equal(replayable.isProven, true);
	assert.equal(replayable.summary, "Checked ~/shot.png");
	assert.equal(judged.macroId, null);
	assert.equal(judged.verdict, "UNDECIDED");
	assert.equal(bundle.run.costUsd, 3.17);
	assert.equal(bundle.run.simulator, "TestForge · iPhone 12");
	assert.equal(bundle.source, "~/cases.md");
	assert.deepEqual(bundle.code, { branch: "feature/tabs", codeId: "9ec4017", commit: "9ec4017", hasLocalChanges: false });
	assert.equal(bundle.cases.length, 2);
});

test("import: an empty repo gets every macro, element and mock; a second import changes nothing", async () => {
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root: await developerRepo(), thumbnails: false });
	const testForgeRoot = await mkdtemp(join(tmpdir(), "test-forge-bundle-qa-"));
	const first = await installBundle(bundle, { root: testForgeRoot });
	assert.equal(first.written.macros.length, 2);
	assert.equal(first.written.elements, 2);
	assert.equal(first.written.mocks.length, 1);
	assert.deepEqual((await listMacrosV2(testForgeRoot)).map((macro) => macro.id).sort(), ["mc_CASE000018", "mc_OPEN000001"]);
	assert.ok((await loadRegistry(testForgeRoot)).elements.el_TAB0000001);
	const second = await installBundle(bundle, { root: testForgeRoot });
	assert.deepEqual(second.written, { macros: [], elements: 0, mocks: [], mockNotes: 0 });
	assert.equal(second.conflicts, 0);
	assert.equal(second.counts.replayable, 1);
	assert.equal(second.counts.needsJudgment, 1);
});

test("import: a local macro that differs is kept unless overwrite, and replaced where it lives", async () => {
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root: await developerRepo(), thumbnails: false });
	const testForgeRoot = await mkdtemp(join(tmpdir(), "test-forge-bundle-qa-"));
	await saveMacroV2({ id: "mc_CASE000018", name: "MT-018 anchor tap", links: { testCase: "18" }, steps: [{ do: "wait", el: "el_TAB0000001" }] }, { module: "Engagement", submodule: "Moved", root: testForgeRoot });
	const kept = await installBundle(bundle, { root: testForgeRoot });
	assert.equal(kept.macros.find((entry) => entry.id === "mc_CASE000018").action, "differs");
	assert.ok(!kept.written.macros.some((path) => path.includes("mt-018")));
	const replaced = await installBundle(bundle, { root: testForgeRoot, overwrite: true });
	assert.ok(replaced.written.macros.includes("Engagement/Moved/macros/mt-018-anchor-tap.json"));
	const stored = JSON.parse(await readFile(join(testForgeRoot, "Engagement/Moved/macros/mt-018-anchor-tap.json"), "utf8"));
	assert.equal(stored.steps.length, 3);
	assert.equal((await listMacrosV2(testForgeRoot)).filter((macro) => macro.id === "mc_CASE000018").length, 1);
});

test("inspect: tells whether the prepared code is the code the bundle tested", async () => {
	const code = { branch: "feature/tabs", commit: "9ec4017", hasLocalChanges: false };
	assert.equal(codeMatch(code, null).state, "notPrepared");
	assert.equal(codeMatch(code, { branch: "develop", snapshotId: "9ec4017" }).state, "otherBranch");
	assert.equal(codeMatch(code, { branch: "feature/tabs", snapshotId: "1111111" }).state, "otherCommit");
	assert.equal(codeMatch(code, { branch: "feature/tabs", snapshotId: "9ec4017+ab12" }).state, "match");
	assert.equal(codeMatch({ ...code, hasLocalChanges: true }, { branch: "feature/tabs", snapshotId: "9ec4017" }).state, "localChanges");
	assert.equal(commitOf("9ec4017+64e6"), "9ec4017");
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root: await developerRepo(), thumbnails: false });
	const plan = await inspectBundle(bundle, { root: await mkdtemp(join(tmpdir(), "test-forge-bundle-qa-")) });
	assert.equal(plan.macros.every((entry) => entry.action === "add"), true);
});

test("compare: the bundle's verdicts are the base for the replay", async () => {
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root: await developerRepo(), thumbnails: false });
	const replay = { id: "replay-1", createdAt: "2026-11-01T00:00:00.000Z", items: [{ caseId: "18", mode: "replay", status: "done", verdict: "FAIL step 3" }] };
	const comparison = compareRuns(bundleAsRun(bundle), replay);
	assert.equal(comparison.rows.find((row) => row.caseId === "18").change, "newlyFailing");
	assert.equal(comparison.rows.find((row) => row.caseId === "24").change, "notRun");
});

test("validate: refuses other files and newer formats", () => {
	assert.throws(() => validateBundle({ format: "other" }), /not a TestForge bundle/);
	assert.throws(() => validateBundle({ format: "test-forge-bundle", formatVersion: 99 }), /newer/);
});

test("store: keeps imported bundles and rejects unsafe ids", async () => {
	const store = new BundleStore(await mkdtemp(join(tmpdir(), "test-forge-bundle-store-")));
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root: await developerRepo(), thumbnails: false });
	await store.save(bundle, { replayRunIds: [] });
	await store.update(bundle.id, { replayRunIds: ["replay-1"] });
	assert.deepEqual((await store.get(bundle.id)).replayRunIds, ["replay-1"]);
	assert.equal((await store.list()).length, 1);
	await assert.rejects(store.get("../etc"), /bad bundle id/);
});

test("merge: a later run of the same code replaces a case's result; other code and unfinished runs don't", () => {
	const later = { id: "run-2", createdAt: "2026-10-31T05:00:00.000Z", status: "done", manifest: { codeId: "9ec4017" }, items: [{ caseId: "24", status: "done", verdict: "PASS" }] };
	const otherCode = { id: "run-3", createdAt: "2026-10-31T06:00:00.000Z", status: "done", manifest: { codeId: "abc1234" }, items: [{ caseId: "18", status: "done", verdict: "FAIL" }] };
	const merged = withLaterResults([otherCode, later, finishedRun], finishedRun);
	assert.deepEqual(merged.mergedFrom, ["run-2"]);
	assert.equal(merged.items.find((item) => item.caseId === "24").verdict, "PASS");
	assert.equal(merged.items.find((item) => item.caseId === "18").verdict, "PASS");
	assert.equal(withLaterResults([finishedRun], finishedRun), finishedRun);
});

test("mocks: a recorded served variant wins; a macro case falls back to what its macro arms; the rule rides along", async () => {
	const root = await developerRepo();
	const run = {
		...finishedRun,
		items: [
			finishedRun.items[0],
			{ ...finishedRun.items[1], evidence: { ...finishedRun.items[1].evidence, mocksUsed: [{ endpoint: ENDPOINT, variant: "anchor-mode", match: "exact", count: 1 }] } },
		],
	};
	const bundle = await buildBundle({ run, cases, title: "T", root, thumbnails: false });
	assert.deepEqual(bundle.items[0].mocksUsed, [{ endpoint: ENDPOINT, variant: "anchor-mode", match: "macro" }]);
	assert.equal(bundle.items[1].macroId, null);
	assert.equal(bundle.items[1].mocksUsed[0].variant, "anchor-mode");
	assert.equal(bundle.mocks.length, 1);
	const plan = await inspectBundle(bundle, { root: await mkdtemp(join(tmpdir(), "test-forge-bundle-qa-")) });
	assert.deepEqual(plan.caseMocks.map((entry) => [entry.caseId, entry.hasMacro, entry.mocks[0].variant]), [["18", true, "anchor-mode"], ["24", false, "anchor-mode"]]);
});

test("mocks: a run from before D-163 reads its variants back from the trace for its time window", async () => {
	const root = await developerRepo();
	const body = rule(ENDPOINT).variants[0].steps[0].respond._0.body;
	const traceRecords = [{ recordedAt: "2026-10-31T02:05:00.000Z", exchange: { isMockServed: true, endpointKey: ENDPOINT, response: { statusCode: 200, body, bodyTruncated: false } } }];
	const run = { ...finishedRun, items: [{ ...finishedRun.items[1], startedAt: "2026-10-31T02:04:00.000Z", endedAt: "2026-10-31T02:06:00.000Z" }] };
	const bundle = await buildBundle({ run, cases, title: "T", root, traceRecords, deviceRules: [rule(ENDPOINT)], thumbnails: false });
	assert.deepEqual(bundle.items[0].mocksUsed, [{ endpoint: ENDPOINT, variant: "anchor-mode", match: "exact", count: 1, from: "trace" }]);
});

test("demo notes travel: the macro's demo block and the server-answer notes reach the next repo", async () => {
	const root = await developerRepo();
	const { mergeMockNotes, loadMockNotes, saveMacroNotes } = await import("../lib/demo.js");
	const [caseMacro] = (await listMacrosV2(root)).filter((macro) => macro.id === "mc_CASE000018");
	await saveMacroNotes(caseMacro.path, { title: { en: "Tab scrolls", id: "Tab menggulir" }, steps: {} }, { root });
	await mergeMockNotes({ [ENDPOINT]: { "anchor-mode": { en: "Tabs jump to sections", id: "Tab melompat ke bagian" } } }, { root });
	const bundle = await buildBundle({ run: finishedRun, cases, title: "T", root, thumbnails: false });
	assert.equal(bundle.macros.find((macro) => macro.id === "mc_CASE000018").demo.title.id, "Tab menggulir");
	const testForgeRoot = await mkdtemp(join(tmpdir(), "test-forge-bundle-qa-"));
	const report = await installBundle(bundle, { root: testForgeRoot });
	assert.equal(report.demoNotes, 1);
	assert.equal(report.written.mockNotes, 1);
	assert.equal((await loadMockNotes(testForgeRoot))[ENDPOINT]["anchor-mode"].en, "Tabs jump to sections");
});
