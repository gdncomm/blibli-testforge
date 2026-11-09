// Test Batches + proof folder (R4j, D-109), against a throwaway data dir and proof root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { batchCases, batchFolderName, batchProgress, compareBatches, proofRootProblem, TestBatchStore } from "../lib/test-batches.js";
import { testBatchChecks } from "../lib/readiness.js";
import { batchReport } from "../routes/test-batches.js";

const root = await mkdtemp(join(tmpdir(), "test-forge-batches-"));

test("proof root must be an existing, writable, specific folder", async () => {
	assert.match(await proofRootProblem("relative/path"), /absolute/);
	assert.match(await proofRootProblem("/Users"), /too broad/);
	assert.match(await proofRootProblem(join(root, "missing")), /doesn't exist/);
	assert.equal(await proofRootProblem(root), null);
});

test("folder name is dated and filesystem-safe", () => {
	const startedAt = new Date(2026, 9, 15, 9, 30, 5).toISOString();
	assert.equal(batchFolderName("IOS-123: flash sale / v2", startedAt), "2026-10-15_09-30-05_IOS-123-flash-sale-v2");
});

test("readiness blocks until a folder is chosen and a batch is active", () => {
	const [folder, batch] = testBatchChecks({ proofRoot: null, active: null });
	assert.equal(folder.ok, false);
	assert.equal(folder.fix, "choose-proof-folder");
	assert.equal(batch.ok, false);
	assert.equal(batch.fix, undefined);
	const [, waiting] = testBatchChecks({ proofRoot: root, active: null });
	assert.equal(waiting.fix, "start-test-batch");
	assert.ok(testBatchChecks({ proofRoot: root, active: { name: "A", folder: "f" } }).every((check) => check.ok));
});

test("one active batch; attach; TEST_FORGE_MEDIA_ROOT follows it; end writes report.md", async () => {
	const dataDir = join(root, "data");
	const proof = join(root, "proof");
	await mkdir(proof, { recursive: true });
	const store = await new TestBatchStore(dataDir).restore();
	await assert.rejects(store.start("A"), /proof folder/);
	await store.setProofRoot(proof);
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, proof);
	const batch = await store.start("Flash sale");
	await assert.rejects(store.start("B"), /still active/);
	await assert.rejects(store.setProofRoot(root), /end Test Batch/);
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, join(proof, batch.folder));
	store.attach({ kind: "replay-v2", refId: "t1", title: "Open flash sale" });
	store.attach({ kind: "replay-v2", refId: "t1", title: "duplicate" });
	assert.equal(store.active.items.length, 1);
	const fakes = { results: { get: () => null }, tasks: { get: () => ({ status: "done", verdict: "PASS" }) } };
	const ended = await store.end(batch.id, { buildReport: (entry) => batchReport(entry, fakes) });
	assert.equal(ended.status, "ended");
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, proof);
	const report = await readFile(join(proof, batch.folder, "report.md"), "utf8");
	assert.match(report, /# Test Batch — Flash sale/);
	assert.match(report, /Macro replays \| Open flash sale \| done · PASS/);
	const reopened = await new TestBatchStore(dataDir).restore();
	assert.equal(reopened.proofRoot, proof);
	assert.equal(reopened.active, null);
	assert.ok(existsSync(join(dataDir, "test-batches.json")));
});

test("an ended batch reopens with its folder and items; never over another active batch", async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "test-forge-batches-reopen-"));
	const proofRoot = await mkdtemp(join(tmpdir(), "test-forge-proof-reopen-"));
	const store = await new TestBatchStore(dataDir).restore();
	await store.setProofRoot(proofRoot);
	const first = await store.start("MICROSITE");
	store.attach({ kind: "run", refId: "r1", title: "Run" });
	await store.end(first.id, { buildReport: async () => "# report" });
	const second = await store.start("Other");
	await assert.rejects(store.reopen(first.id), /still active/);
	await store.end(second.id, { buildReport: async () => "# report" });
	const reopened = await store.reopen(first.id);
	assert.equal(reopened.status, "active");
	assert.equal(reopened.folder, first.folder);
	assert.equal(reopened.itemCount, 1);
	assert.equal(reopened.reopenedAt.length, 1);
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, join(proofRoot, first.folder));
	await assert.rejects(store.reopen(first.id), /already active/);
	store.attach({ kind: "run", refId: "r2", title: "Run again" });
	assert.equal(store.get(first.id).items.length, 2);
	await store.end(first.id, { buildReport: async () => "# report" });
});

test("D-189: progress counts each case's latest outcome from settled items and batch runs", () => {
	const batch = {
		items: [
			{ kind: "replay-v2", refId: "t1", caseId: "4", status: "done", verdict: "FAIL" },
			{ kind: "test-forge-run", refId: "t2", caseId: "4", status: "done", verdict: "PASS" },
			{ kind: "test-forge-run", refId: "t3", caseId: "5", status: "done", verdict: "DONE" },
			{ kind: "replay-v2", refId: "t4", caseId: "6", status: "running", verdict: null },
			{ kind: "run", refId: "r1" },
			{ kind: "scan", refId: "s1" },
		],
	};
	const runCases = () => [{ caseId: "7", status: "done", verdict: "UNDECIDED" }, { caseId: "8", status: "done", verdict: "BLOCKED" }];
	assert.deepEqual(batchProgress(batch, { runCases }), { passed: 1, failed: 1, undecided: 1, running: 1, cases: 3 });
});

test("D-189: settle copies outcomes onto items; remove keeps the folder and refuses the active batch", async () => {
	const root = await mkdtemp(join(tmpdir(), "tb-"));
	const store = await new TestBatchStore(join(root, "data")).restore();
	await store.setProofRoot(root);
	const batch = await store.start("B");
	store.attach({ kind: "replay-v2", refId: "t1", title: "x" });
	assert.equal(store.settle([{ refId: "t1", status: "done", verdict: "PASS", caseId: "4" }]), true);
	assert.equal(store.settle([{ refId: "t1", status: "done", verdict: "PASS", caseId: "4" }]), false);
	assert.equal(store.view().active.progress.passed, 1);
	await assert.rejects(store.remove(batch.id), /end this Test Batch/);
	await store.end(batch.id, { buildReport: async () => "# r" });
	assert.equal((await store.remove(batch.id)).batches.length, 0);
	assert.ok(existsSync(join(root, batch.folder, "report.md")));
});

test("D-201: a replay batch compares each replayed case with the batch it replayed", () => {
	const source = {
		id: "old",
		name: "Sprint 12",
		items: [
			{ kind: "run", refId: "r1" },
			{ kind: "replay-v2", refId: "t1", caseId: "3", status: "done", verdict: "FAIL" },
		],
	};
	const runCases = (runId) => ({
		r1: [{ caseId: "1", scenario: "Opens", status: "done", verdict: "PASS" }, { caseId: "2", status: "done", verdict: "PASS" }],
		r2: [{ caseId: "1", status: "done", verdict: "FAIL" }, { caseId: "3", status: "done", verdict: "PASS" }, { caseId: "2", status: "running", verdict: null }],
	})[runId] ?? [];
	assert.deepEqual(batchCases(source, { runCases }).map((entry) => [entry.caseId, entry.outcome]), [["1", "passed"], ["2", "passed"], ["3", "failed"]]);
	const replay = { id: "new", replayOf: { id: "old", caseIds: ["1", "2", "3"] }, items: [{ kind: "run", refId: "r2" }] };
	const comparison = compareBatches(source, replay, { runCases });
	assert.deepEqual({ regressed: comparison.regressed, fixed: comparison.fixed, same: comparison.same, missing: comparison.missing }, { regressed: 1, fixed: 1, same: 0, missing: 1 });
	assert.deepEqual(comparison.cases.map((entry) => entry.change), ["regressed", "missing", "fixed"]);
	assert.equal(comparison.cases[0].scenario, "Opens");
});

test("D-212: a paused batch collects nothing, keeps its items, resumes, and can still end or be listed", async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "test-forge-batches-pause-"));
	const proofRoot = await mkdtemp(join(tmpdir(), "test-forge-proof-pause-"));
	const store = await new TestBatchStore(dataDir).restore();
	await store.setProofRoot(proofRoot);
	const first = await store.start("MICROSITE");
	store.attach({ kind: "run", refId: "r1", title: "Run" });
	const paused = await store.pause(first.id);
	assert.equal(paused.status, "paused");
	assert.equal(store.active, null);
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, proofRoot);
	assert.equal(store.attach({ kind: "run", refId: "r-elsewhere", title: "Run" }), null);
	await assert.rejects(store.pause(first.id), /already paused/);
	await assert.rejects(store.reopen(first.id), /resume it instead/);
	await assert.rejects(store.remove(first.id), /end this Test Batch/);
	assert.deepEqual(store.view().paused.map((batch) => batch.id), [first.id]);

	const second = await store.start("Hotfix");
	await assert.rejects(store.resume(first.id), /still active — pause or end it first/);
	await store.pause(second.id);
	const resumed = await store.resume(first.id);
	assert.equal(resumed.status, "active");
	assert.equal(resumed.itemCount, 1);
	assert.equal(store.batches[0].id, first.id);
	assert.ok(store.get(first.id).pauses[0].resumedAt);
	assert.equal(process.env.TEST_FORGE_MEDIA_ROOT, join(proofRoot, first.folder));
	store.attach({ kind: "run", refId: "r2", title: "Run again" });
	assert.equal(store.get(first.id).items.length, 2);

	const ended = await store.end(second.id, { buildReport: async () => "# report" });
	assert.equal(ended.status, "ended");
	assert.ok(store.get(second.id).pauses[0].endedAt);
	assert.equal(store.get(second.id).pausedAt, null);
	await assert.rejects(store.resume(second.id), /reopen it instead/);
});

test("D-212: readiness and the report say a batch is paused", async () => {
	const [, idle] = testBatchChecks({ proofRoot: root, active: null, paused: [{ name: "MICROSITE" }, { name: "SF" }] });
	assert.equal(idle.ok, false);
	assert.match(idle.detail, /“MICROSITE” and 1 more are paused/);
	const batch = { name: "MICROSITE", folder: "f", status: "paused", startedAt: new Date().toISOString(), pausedAt: new Date().toISOString(), endedAt: null, pauses: [{ at: "x" }], items: [] };
	const report = await batchReport(batch, { results: { get: () => null }, tasks: { get: () => null } });
	assert.match(report, /\*\*Paused since:\*\*/);
	assert.match(report, /\*\*Paused:\*\* 1 time\(s\)/);
});
