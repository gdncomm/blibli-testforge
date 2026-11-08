import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunBatch, planItems } from "../lib/run-batch.js";
import { findCrash, summarizeIps } from "../lib/crash-report.js";

/** A fake `start`: each case resolves when the test says so (or with its scripted verdict). */
function fakeStarter(verdicts = {}) {
	const started = [];
	const pending = new Map();
	const start = async (item) => {
		started.push(item.caseId);
		let finish;
		const done = new Promise((resolve) => (finish = resolve));
		pending.set(item.caseId, finish);
		if (verdicts[item.caseId]) setImmediate(() => finish({ status: "done", verdict: verdicts[item.caseId] }));
		return { jobId: `job-${item.caseId}`, done, cancel: () => finish({ status: "cancelled", verdict: "CANCELLED" }) };
	};
	return { start, started, finish: (caseId, verdict = "PASS") => pending.get(caseId)?.({ status: "done", verdict }) };
}

const items = (...ids) => ids.map((caseId) => ({ caseId, mode: "replay" }));
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("runs cases one after another and reports verdicts", async () => {
	const starter = fakeStarter({ A: "PASS", B: "FAIL at step 3" });
	const batch = new RunBatch({ items: items("A", "B"), deps: { start: starter.start } });
	const result = await batch.run();
	assert.equal(result.status, "done");
	assert.deepEqual(result.items.map((item) => item.verdict), ["PASS", "FAIL at step 3"]);
	assert.deepEqual(starter.started, ["A", "B"]);
});

test("pause finishes the current case, then holds until resume", async () => {
	const starter = fakeStarter();
	const batch = new RunBatch({ items: items("A", "B"), deps: { start: starter.start } });
	const running = batch.run();
	await tick();
	batch.requestPause();
	starter.finish("A");
	await tick();
	await tick();
	assert.equal(batch.status, "paused");
	assert.deepEqual(starter.started, ["A"]);
	await batch.resume();
	await tick();
	starter.finish("B");
	assert.equal((await running).status, "done");
	assert.deepEqual(starter.started, ["A", "B"]);
});

test("skip stops the current case and moves on; cancel drops the rest", async () => {
	const starter = fakeStarter();
	const batch = new RunBatch({ items: items("A", "B", "C"), deps: { start: starter.start } });
	const running = batch.run();
	await tick();
	batch.skip();
	await tick();
	await tick();
	assert.deepEqual(starter.started, ["A", "B"]);
	batch.cancel();
	const result = await running;
	assert.equal(result.status, "cancelled");
	assert.deepEqual(result.items.map((item) => item.status), ["skipped", "cancelled", "cancelled"]);
	assert.equal(result.items[0].verdict, "SKIPPED");
});

test("a crash makes the case BLOCKED and holds the batch; resume relaunches first", async () => {
	const starter = fakeStarter({ A: "FAIL at step 2", B: "PASS" });
	let relaunched = 0;
	let reports = 1; // one crash report, written during case A
	const batch = new RunBatch({
		items: items("A", "B"),
		deps: { start: starter.start, findCrash: async () => (reports-- > 0 ? { path: "/x.ips", exception: "EXC_BAD_ACCESS", frames: [] } : null), relaunch: async () => relaunched++ },
	});
	const running = batch.run();
	for (let i = 0; i < 6; i++) await tick();
	assert.equal(batch.status, "paused");
	assert.equal(batch.items[0].verdict, "BLOCKED (app crashed)");
	assert.match(batch.pauseReason, /crashed during A/);
	await batch.resume();
	assert.equal(relaunched, 1);
	assert.equal((await running).items[1].verdict, "PASS");
});

test("planItems: linked macro → replay, otherwise Claude", () => {
	const plan = planItems([{ id: "SF-084" }, { id: "SF-001" }], [{ schemaVersion: 2, id: "mc_1", name: "m", links: { testCase: "sf-084" } }]);
	assert.deepEqual(plan.map((item) => item.mode), ["replay", "claude"]);
	assert.equal(plan[0].macroId, "mc_1");
});

test("crash reports: summarized, filtered by bundle id and time", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ips-"));
	const header = JSON.stringify({ app_name: "BliBliMobile", bundleID: "com.blibli.mobile" });
	const body = JSON.stringify({ exception: { type: "EXC_BAD_ACCESS", signal: "SIGSEGV" }, threads: [{ frames: [] }, { triggered: true, frames: [{ imageIndex: 0, symbol: "FSScreen.render" }] }], usedImages: [{ name: "BliBliMobile" }] });
	await writeFile(join(directory, "BliBliMobile-2026-10-12.ips"), `${header}\n${body}`);
	await writeFile(join(directory, "Other-2026-10-12.ips"), `${JSON.stringify({ bundleID: "com.other" })}\n{}`);
	const crash = await findCrash(Date.now() - 60_000, { bundleId: "com.blibli.mobile", directory });
	assert.equal(crash.exception, "EXC_BAD_ACCESS · SIGSEGV");
	assert.deepEqual(crash.frames, ["BliBliMobile FSScreen.render"]);
	assert.equal(await findCrash(Date.now() + 60_000, { bundleId: "com.blibli.mobile", directory }), null);
	assert.equal(summarizeIps("not an ips"), null);
});

test("follow-up: runs after the case, can attach its own job, and replaces the verdict", async () => {
	const starter = fakeStarter({ A: "FAIL at step 3", B: "PASS" });
	const seen = [];
	const followUp = async (item, { attach }) => {
		seen.push(item.caseId);
		if (item.verdict.startsWith("FAIL")) {
			attach({ jobId: "triage-A", phase: "triage", done: Promise.resolve(), cancel: () => {} });
			return { verdict: "PASS", verdictBeforeRepair: item.verdict, repaired: true };
		}
		return null;
	};
	const batch = new RunBatch({ items: items("A", "B"), deps: { start: starter.start, followUp } });
	const result = await batch.run();
	assert.deepEqual(seen, ["A", "B"]);
	assert.deepEqual([result.items[0].verdict, result.items[0].repaired, result.items[0].jobId], ["PASS", true, "triage-A"]);
	assert.equal(result.items[0].phase, undefined);
	assert.equal(result.items[1].verdict, "PASS");
});

test("a usage-limit stop requeues the case and pauses; resume runs it again", async () => {
	let isLimited = true;
	const started = [];
	const start = async (item) => {
		started.push(item.caseId);
		const outcome = item.caseId === "B" && isLimited
			? { status: "error", verdict: "USAGE_LIMIT", usageLimit: "You've hit your 5-hour limit" }
			: { status: "done", verdict: "PASS" };
		return { jobId: `job-${item.caseId}`, done: Promise.resolve(outcome), cancel: () => {} };
	};
	const batch = new RunBatch({ items: items("A", "B", "C"), deps: { start } });
	const running = batch.run();
	for (let wait = 0; wait < 20 && batch.status !== "paused"; wait++) await tick();
	assert.equal(batch.status, "paused");
	assert.match(batch.pauseReason, /usage limit stopped B/);
	const queued = batch.snapshot().items.find((item) => item.caseId === "B");
	assert.deepEqual([queued.status, queued.verdict], ["queued", undefined]);
	isLimited = false;
	await batch.resume();
	const result = await running;
	assert.deepEqual(result.items.map((item) => [item.caseId, item.verdict]), [["A", "PASS"], ["B", "PASS"], ["C", "PASS"]]);
	assert.deepEqual(started, ["A", "B", "B", "C"]);
});

test("a usage limit in the follow-up keeps the result, drops the flag and pauses the batch (D-220)", async () => {
	const starter = fakeStarter({ A: "PASS", B: "PASS" });
	const followUp = async (item) => (item.caseId === "A" ? { claudeVerdict: item.verdict, verdict: "UNCONFIRMED", usageLimit: "You've hit your 5-hour limit" } : null);
	const batch = new RunBatch({ items: items("A", "B"), deps: { start: starter.start, followUp } });
	const running = batch.run();
	for (let wait = 0; wait < 50 && batch.status !== "paused"; wait++) await tick();
	assert.equal(batch.status, "paused");
	assert.match(batch.pauseReason, /usage limit stopped the follow-up for A/);
	const snapshot = batch.snapshot();
	assert.deepEqual([snapshot.items[0].verdict, snapshot.items[0].claudeVerdict, snapshot.items[0].usageLimit], ["UNCONFIRMED", "PASS", undefined]);
	assert.equal(snapshot.items[1].status, "queued", "the next case waits for the resume");
	batch.resume();
	const result = await running;
	assert.equal(result.items[1].verdict, "PASS");
});
