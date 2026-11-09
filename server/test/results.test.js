import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResultsStore, buildReport, finalVerdict, rerunCandidates, reviewState } from "../lib/results.js";

const snapshot = (items, extra = {}) => ({ id: "run1", createdAt: "2026-10-12T03:00:00.000Z", status: "done", approval: "autonomous", items, ...extra });

test("final verdict: override wins; fail then pass on re-run is FLAKY", () => {
	assert.equal(finalVerdict({ verdict: "PASS" }), "PASS");
	assert.equal(finalVerdict({ verdict: "FAIL at step 3", rerun: { verdict: "PASS" } }), "FLAKY");
	assert.equal(finalVerdict({ verdict: "FAIL at step 3", rerun: { verdict: "FAIL at step 3" } }), "FAIL at step 3");
	assert.equal(finalVerdict({ verdict: "FAIL", review: { action: "override", verdict: "PASS" } }), "PASS");
});

test("review rules and the Validated state", async () => {
	const store = new ResultsStore(await mkdtemp(join(tmpdir(), "results-")));
	await store.upsert(snapshot([{ caseId: "A", status: "done", verdict: "PASS" }, { caseId: "B", status: "done", verdict: "FAIL at step 2" }]), { manifest: { branch: "main" } });
	assert.throws(() => store.review("run1", 1, { action: "override", verdict: "PASS" }), /say why/);
	assert.throws(() => store.review("run1", 1, { action: "override", verdict: "MAYBE", reason: "looks fine" }), /PASS or FAIL/);
	store.review("run1", 0, { action: "accept" });
	assert.equal(reviewState(store.get("run1")).isValidated, false);
	store.review("run1", 1, { action: "override", verdict: "PASS", reason: "known backend flake, product OK" });
	assert.deepEqual(reviewState(store.get("run1")), { reviewed: 2, total: 2, isValidated: true });
});

test("upsert keeps reviews and the manifest; restore marks a running run interrupted", async () => {
	const dir = await mkdtemp(join(tmpdir(), "results-"));
	const store = new ResultsStore(dir);
	await store.upsert(snapshot([{ caseId: "A", status: "running" }], { status: "running" }), { manifest: { branch: "main" } });
	store.review("run1", 0, { action: "rerun" });
	await store.upsert(snapshot([{ caseId: "A", status: "running", jobId: "j" }], { status: "running" }));
	assert.equal(store.get("run1").items[0].review.action, "rerun");
	assert.equal(store.get("run1").manifest.branch, "main");
	const reopened = new ResultsStore(dir);
	const [run] = await reopened.restore();
	assert.equal(run.status, "interrupted");
	assert.equal(run.items[0].status, "cancelled");
});

test("re-run candidates: failures not yet re-run, plus Needs re-run; a recorded re-run clears it", async () => {
	const store = new ResultsStore(await mkdtemp(join(tmpdir(), "results-")));
	await store.upsert(snapshot([
		{ caseId: "A", status: "done", verdict: "PASS" },
		{ caseId: "B", status: "done", verdict: "FAIL at step 2" },
		{ caseId: "C", status: "done", verdict: "PASS" },
	]));
	store.review("run1", 2, { action: "rerun" });
	assert.deepEqual(rerunCandidates(store.get("run1")).map(({ index }) => index), [1, 2]);
	store.recordRerun("run1", 1, { verdict: "PASS", batchId: "run2" });
	store.recordRerun("run1", 2, { verdict: "PASS", batchId: "run2" });
	assert.equal(finalVerdict(store.get("run1").items[1]), "FLAKY");
	assert.equal(store.get("run1").items[2].review, undefined);
	assert.deepEqual(rerunCandidates(store.get("run1")), []);
});

test("report: manifest, per-case table, FLAKY, review trail, evidence", () => {
	const report = buildReport(snapshot([
		{ caseId: "SF-084", scenario: "Tomorrow tab", mode: "replay", macroName: "SF-084 · m", status: "done", verdict: "FAIL at step 5", rerun: { verdict: "PASS" }, durationMs: 41000, review: { action: "accept" }, evidence: { screenshots: ["/m/1.png"], mocksServed: { "GET /backend/configs": 2 } } },
	], { manifest: { branch: "qa", codeId: "abc1234", builtFrom: "abc1234", simulator: "TestForge · iPhone", environment: "prod" } }));
	assert.match(report, /\*\*Code:\*\* qa @ abc1234/);
	assert.match(report, /\| SF-084 Tomorrow tab \| macro SF-084 · m \| FAIL at step 5 → re-run PASS \| \*\*FLAKY\*\* \| accept \| 41 s \| 1 screenshot\(s\) \|/);
	assert.match(report, /GET \/backend\/configs ×2/);
	assert.match(report, /✅ Validated/);
});

test("compare: newly failing, fixed, same, added, not run; default base prefers develop", async () => {
	const { compareRuns, defaultBaseRun, branchHistory } = await import("../lib/results.js");
	const run = (id, createdAt, branch, verdicts) => ({ id, createdAt, status: "done", manifest: { branch }, items: Object.entries(verdicts).map(([caseId, verdict]) => ({ caseId, status: "done", verdict })) });
	const head = run("h", "2026-10-14T03:00:00Z", "fix/x", { A: "FAIL at step 7", B: "PASS", C: "PASS", D: "PASS" });
	const develop = run("d", "2026-10-14T01:00:00Z", "develop", { A: "PASS", B: "FAIL at step 2", C: "PASS", E: "PASS" });
	const older = run("o", "2026-10-14T02:00:00Z", "fix/x", { A: "PASS" });
	const unrelated = run("u", "2026-10-14T02:30:00Z", "main", { Z: "PASS" });
	const runs = [head, unrelated, older, develop];
	assert.equal(defaultBaseRun(runs, head).id, "d");
	assert.equal(defaultBaseRun([head, unrelated, older], head).id, "o");
	assert.equal(defaultBaseRun([head, unrelated], head), null);
	const { rows, counts, base } = compareRuns(develop, head);
	assert.equal(base.branch, "develop");
	assert.deepEqual(Object.fromEntries(rows.map((row) => [row.caseId, row.change])), { A: "newlyFailing", B: "fixed", C: "same", D: "added", E: "notRun" });
	assert.deepEqual(counts, { newlyFailing: 1, fixed: 1, same: 1, added: 1, notRun: 1 });
	assert.equal(compareRuns(null, head).counts.added, 4);
	assert.deepEqual(branchHistory(runs).map((entry) => [entry.branch, entry.runCount, entry.latest.id]), [["fix/x", 2, "h"], ["main", 1, "u"], ["develop", 1, "d"]]);
});

test("store emits change and stamps updatedAt on upsert and review", async () => {
	const store = new ResultsStore(await mkdtemp(join(tmpdir(), "results-")));
	let changes = 0;
	store.on("change", () => changes++);
	await store.upsert(snapshot([{ caseId: "A", status: "done", verdict: "PASS" }]), { manifest: { branch: "main", codeId: "abc" } });
	const first = store.list()[0];
	assert.equal(first.branch, "main");
	assert.deepEqual(first.caseIds, ["A"]);
	await new Promise((resolve) => setTimeout(resolve, 5));
	store.review("run1", 0, { action: "accept" });
	assert.ok(store.list()[0].updatedAt > first.updatedAt);
	assert.equal(changes, 2);
});
