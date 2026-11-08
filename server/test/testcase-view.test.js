import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoadedDocStore, testcaseView } from "../lib/testcase-view.js";

const cases = [
	{ id: "SF-001", scenario: "Open Flash Sale", expected: "Section shows", androidStatus: "PASS" },
	{ id: "SF-002", scenario: "Range empty", expected: "Section hidden" },
	{ id: "SF-003", scenario: "Never touched" },
];
const macros = [{ id: "flashsale-open", name: "Open Flash Sale", testCases: ["SF-001", "SF-002"], usesMocks: true }];

test("links each case to the recording that replays it (D-085)", () => {
	const view = testcaseView({ title: "Flash Sale", source: "page", cases, macros });
	assert.equal(view.title, "Flash Sale");
	assert.deepEqual(view.cases[0].macro, { id: "flashsale-open", name: "Open Flash Sale", usesMocks: true, hasDemoNotes: false, setup: null, covers: null });
	assert.equal(view.cases[2].macro, null);
	assert.equal(view.cases[0].androidStatus, undefined, "only summary fields are sent");
	assert.equal(view.cases[2].steps, null);
});

test("last run is the newest of the case's Claude run and its recording's replay", () => {
	const runs = [
		{ caseId: "flashsale-open", macroId: "flashsale-open", mode: "replay", verdict: "PASS", durationMs: 9000, recordedAt: "2026-10-14T10:00:00.000Z" },
		{ caseId: "SF-002", mode: "claude", verdict: "FAIL", durationMs: 60000, recordedAt: "2026-10-14T11:00:00.000Z" },
		{ caseId: "SF-001", mode: "claude", verdict: "FAIL", recordedAt: "2026-10-13T09:00:00.000Z" },
	];
	const view = testcaseView({ cases, macros, runs });
	assert.deepEqual(view.cases[0].lastRun, { verdict: "PASS", mode: "replay", at: "2026-10-14T10:00:00.000Z", durationMs: 9000, build: null, stale: null });
	assert.equal(view.cases[1].lastRun.verdict, "FAIL");
	assert.equal(view.cases[2].lastRun, null);
});

test("the loaded document survives a restart", async () => {
	const file = join(await mkdtemp(join(tmpdir(), "tc-")), "nested", "testcases.json");
	const store = createLoadedDocStore(file);
	assert.equal(await store.read(), null);
	await store.write({ source: "page", title: "Flash Sale", cases });
	const saved = await createLoadedDocStore(file).read();
	assert.equal(saved.title, "Flash Sale");
	assert.equal(saved.cases.length, 3);
});

test("case setup: the recording's start screen and needs, in words", async () => {
	const { caseSetup } = await import("../lib/testcase-view.js");
	assert.deepEqual(caseSetup({ startScreen: "anyScreen", environment: "uatb", session: "loggedIn" }), { startScreen: "Any screen", needs: ["UAT B", "Logged in"] });
	assert.equal(caseSetup({}), null);
	assert.equal(caseSetup(undefined), null);
});

test("D-220: replay status per case, case ids matched in any case, follow-up turns ignored", () => {
	const lowerCases = [{ id: "sf-001", scenario: "Open" }, { id: "SF-002", scenario: "Range" }, { id: "SF-003", scenario: "None" }];
	const linked = [
		{ id: "mc_A", name: "Open", testCases: ["SF-001"], replayProblem: null },
		{ id: "mc_B", name: "Range", testCases: ["SF-002"], replayProblem: "routine mc_X not found" },
	];
	const runs = [
		{ caseId: "sf-001", mode: "triage", verdict: "DONE", recordedAt: "2026-11-07T12:00:00.000Z" },
		{ caseId: "SF-001", macroId: "mc_A", mode: "replay", verdict: "PASS", recordedAt: "2026-11-07T11:00:00.000Z" },
	];
	const view = testcaseView({ cases: lowerCases, macros: linked, runs });
	assert.equal(view.cases[0].macro.id, "mc_A");
	assert.equal(view.cases[0].replay.kind, "free");
	assert.equal(view.cases[0].lastRun.verdict, "PASS", "the triage turn is not the case's result");
	assert.equal(view.cases[1].replay.kind, "broken");
	assert.equal(view.cases[2].replay.kind, "claude");
});

test("D-220: a Claude pass shows UNCONFIRMED until a replay of the recording passes", () => {
	const linked = [{ id: "mc_A", name: "Open", testCases: ["SF-001"] }];
	const claudeOnly = testcaseView({ cases, macros: linked, runs: [{ caseId: "SF-001", mode: "run", verdict: "PASS", recordedAt: "2026-11-07T10:00:00.000Z" }] });
	assert.deepEqual([claudeOnly.cases[0].lastRun.verdict, claudeOnly.cases[0].lastRun.claudeVerdict, claudeOnly.cases[0].replay.kind], ["UNCONFIRMED", "PASS", "unconfirmed"]);
	const proven = testcaseView({ cases, macros: linked, runs: [
		{ caseId: "SF-001", macroId: "mc_A", mode: "replay", verdict: "PASS", recordedAt: "2026-11-07T10:05:00.000Z" },
		{ caseId: "SF-001", mode: "run", verdict: "PASS", recordedAt: "2026-11-07T10:00:00.000Z" },
	] });
	assert.deepEqual([proven.cases[0].lastRun.verdict, proven.cases[0].replay.kind], ["PASS", "free"]);
});
