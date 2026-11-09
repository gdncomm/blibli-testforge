import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describePick, followUpModel, nextTier, pickModel, watchForEscalation } from "../lib/model-pick.js";

const SHORT = { id: "HM-901", scenario: "Home search bar opens the search page", steps: "Tap the search bar on Home.", expected: "The search page opens." };
const MOCKED = {
	id: "SF-001",
	scenario: "Hide main schedule tabs when only one schedule is available",
	precondition: "Main Flash Sale response has only one schedule eligible for this section.",
	steps: "Open the Flash Sale page and observe the campaign header area.",
	api: "`/backend/content-api/sub-flashsale/range`",
};

test("a short case without mocks starts on Haiku", () => {
	const pick = pickModel(SHORT);
	assert.equal(pick.model, "haiku");
	assert.equal(pick.isAuto, true);
});

test("a case that needs mocked data starts on Sonnet", () => {
	assert.equal(pickModel(MOCKED).model, "sonnet");
	assert.ok(pickModel(MOCKED).reasons.includes("needs mocked server data"));
});

test("recent struggles push a case to Opus; a later PASS only adds a point", () => {
	const struggled = [{ caseId: "SF-001", mode: "run", verdict: "BLOCKED" }, { caseId: "SF-001", mode: "run", verdict: "UNDECIDED" }];
	assert.equal(pickModel(MOCKED, { history: struggled }).model, "opus");
	const passedSince = [{ caseId: "SF-001", mode: "run", verdict: "PASS" }, ...struggled];
	assert.equal(pickModel(MOCKED, { history: passedSince }).model, "sonnet");
});

test("a hand-picked model wins; triage never runs on Haiku", () => {
	assert.deepEqual(pickModel(MOCKED, { override: "opus" }), { model: "opus", score: null, reasons: ["chosen by hand"], isAuto: false });
	assert.equal(pickModel(SHORT, { override: "auto", purpose: "triage" }).model, "sonnet");
	assert.match(describePick(pickModel(SHORT)), /^Haiku \(auto, score/);
});

test("nextTier climbs to Opus and stops", () => {
	assert.equal(nextTier("haiku"), "sonnet");
	assert.equal(nextTier("sonnet"), "opus");
	assert.equal(nextTier("opus"), null);
});

test("three failed steps in a row, or a spent time budget, move the run up one tier", async () => {
	const session = new EventEmitter();
	let clock = 0;
	const switches = [];
	const watch = watchForEscalation(session, { model: "haiku", now: () => clock, tick: 5, escalate: async (next) => switches.push(next) });
	session.emit("tool-result", { name: "mcp__test-forge-driver__test_forge_tap", text: "element not found" });
	session.emit("tool-result", { name: "Read", text: "ok" });
	for (let index = 0; index < 3; index++) session.emit("tool-result", { name: "mcp__test-forge-driver__test_forge_tap", isError: true });
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.deepEqual(switches, ["sonnet"]);
	clock = 13 * 60_000;
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.deepEqual(switches, ["sonnet", "opus"]);
	assert.equal(watch.model, "opus");
	watch.stop();
	assert.equal(session.listenerCount("tool-result"), 0);
});

test("a step that configures CMS data, or a JSON body in the API column, counts as mocked data", () => {
	const configured = { id: "7", scenario: "Component hidden when there is no valid tab", steps: "Configure MICROSITE_TABBING where every tab is invalid.", expected: "Component is not shown." };
	assert.ok(pickModel(configured).reasons.includes("needs mocked server data"));
	const withBody = { id: "3", scenario: "UI is same as PAGE_TABBING", steps: "Open a promo page.", api: '`{ "name": "MICROSITE_TABBING" }`' };
	assert.ok(pickModel(withBody).reasons.includes("needs mocked server data"));
	assert.match(pickModel({ id: "13", scenario: "Sticky and collapse on scroll", steps: "Scroll down." }).reasons.join(), /motion/);
});

test("only failures on the same build push the pick up; follow-up turns drop Opus to Sonnet", () => {
	const blockedOnOldBuild = [{ caseId: "SF-001", mode: "run", verdict: "BLOCKED", build: { buildId: "old" } }, { caseId: "SF-001", mode: "run", verdict: "BLOCKED", build: { buildId: "old" } }];
	assert.equal(pickModel(MOCKED, { history: blockedOnOldBuild, buildId: "new" }).model, "sonnet");
	assert.equal(pickModel(MOCKED, { history: blockedOnOldBuild, buildId: "old" }).model, "opus");
	assert.equal(pickModel(MOCKED, { history: blockedOnOldBuild }).model, "opus");
	assert.equal(followUpModel("opus", "save"), "sonnet");
	assert.equal(followUpModel("opus", "run"), null);
	assert.equal(followUpModel("sonnet", "save"), null);
});
