import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmedVerdict, replayProblem, replayStatus, UNCONFIRMED } from "../lib/replay-status.js";

const registry = { elements: { home_tab: { locator: { chain: [{ identifier: "home_tab" }] } } } };
const routine = { id: "mc_HOME", steps: [{ do: "tap", el: "home_tab" }] };
const loadMacro = async (id) => (id === routine.id ? routine : null);

test("a recording whose steps all plan has no replay problem", async () => {
	assert.equal(await replayProblem({ steps: [{ do: "run", macro: "mc_HOME" }, { do: "wait", seconds: 1 }] }, { loadMacro, registry }), null);
});

test("a missing routine, an unknown element or no steps is a replay problem", async () => {
	assert.match(await replayProblem({ steps: [{ do: "run", macro: "mc_GONE" }] }, { loadMacro, registry }), /routine mc_GONE not found/);
	assert.match(await replayProblem({ steps: [{ do: "tap", el: "nowhere" }] }, { loadMacro, registry }), /element nowhere is not in the registry/);
	assert.equal(await replayProblem({ steps: [] }, { loadMacro, registry }), "it has no steps");
});

test("an unreadable registry skips the element check instead of failing every recording", async () => {
	assert.equal(await replayProblem({ steps: [{ do: "tap", el: "nowhere" }] }, { loadMacro, registry: null }), null);
});

test("status: no recording needs Claude; a broken one too; a passing replay makes it free", () => {
	const macro = { id: "mc_A", name: "A" };
	assert.equal(replayStatus({ macro: null }).kind, "claude");
	assert.equal(replayStatus({ macro, problem: "routine mc_X not found" }).kind, "broken");
	assert.equal(replayStatus({ macro }).kind, "unconfirmed");
	assert.equal(replayStatus({ macro, lastReplay: { verdict: "FAIL at step 2" } }).kind, "unconfirmed");
	assert.match(replayStatus({ macro, lastReplay: { verdict: "FAIL at step 2" } }).text, /ended FAIL/);
	assert.equal(replayStatus({ macro, lastReplay: { verdict: "PASS", recordedAt: "2026-11-07T10:00:00.000Z" } }).kind, "free");
});

test("a Claude pass is unconfirmed; replays and failures keep their verdict", () => {
	assert.equal(confirmedVerdict({ mode: "run", verdict: "PASS" }), UNCONFIRMED);
	assert.equal(confirmedVerdict({ mode: "claude", verdict: "PASS — section shows" }), UNCONFIRMED);
	assert.equal(confirmedVerdict({ mode: "run", verdict: "FAIL" }), "FAIL");
	assert.equal(confirmedVerdict({ mode: "replay", verdict: "PASS" }), "PASS");
	assert.equal(confirmedVerdict(null), null);
});
