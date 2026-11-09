import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Narrator, narrateToolCall, plainStepText } from "../lib/narration.js";
import { UsageFeed, elapsedPct } from "../lib/usage.js";

test("R1: macro step text loses review markers; mock steps read as plain mock lines", () => {
	assert.equal(plainStepText({ do: "tap", text: "Tap “Lihat Semua” (by text ⚠)" }), "Tap “Lihat Semua”");
	assert.equal(plainStepText({ do: "waitFor", text: "Wait for “Flash Sale” (up to 10 s)" }), "Wait for “Flash Sale”");
	assert.equal(plainStepText({ do: "mock", text: "Mock /flashsale → “loaded”" }), "Mock: /flashsale → “loaded”");
	assert.equal(plainStepText({ do: "mock", text: "Mock off: /flashsale" }), "Mock off: /flashsale");
});

test("R1: Claude's phone and network-mock tools become steps; other tools don't", () => {
	assert.deepEqual(narrateToolCall("mcp__plugin_test-flow-recorder_test-forge-driver__test_forge_tap_by_label", { label: "Lihat Semua" }), { icon: "hand.tap", text: "Tap “Lihat Semua”" });
	assert.equal(narrateToolCall("mcp__networklens__lens_set_variant", { endpoint: "/flashsale", variant: "empty" }).text, "Mock: “/flashsale” → empty");
	// Inputs as a real first run sent them (SF-028, D-077): string booleans, enabled:false to switch off.
	assert.equal(narrateToolCall("x__lens_set_variant", { endpoint: "/configs", enabled: false }).text, "Mock off: “/configs”");
	assert.equal(narrateToolCall("x__lens_set_mocking", { endpoint: "/configs", enabled: true }).text, "Network mocks on: “/configs”");
	assert.equal(narrateToolCall("x__test_forge_assert_exists", { identifier: "FS_Title", exists: "false" }).text, "Check “FS_Title” is gone");
	assert.equal(narrateToolCall("x__test_forge_assert_exists", { identifier: "FS_Title", exists: "true" }).text, "Check “FS_Title” is there");
	assert.equal(narrateToolCall("Read", { file_path: "/x" }), null);
	assert.equal(narrateToolCall("mcp__networklens__lens_list", {}), null);
});

test("R1: a replay narrates working → done/failed with times; cleanup is marked", () => {
	let clock = 1000;
	const narrator = new Narrator({ now: () => clock });
	narrator.begin("job1", { caseId: "SF-011", title: "White header", source: "macro" });
	narrator.stepStarted("job1", { index: 0, do: "tap", text: "Tap “See all” (by text ⚠)" });
	let run = narrator.view().runs[0];
	assert.equal(run.steps[0].status, "working");
	assert.equal(run.steps[0].icon, "hand.tap");
	clock += 800;
	narrator.stepEnded("job1", { index: 0, do: "tap", text: "Tap “See all” (by text ⚠)", ok: true, ms: 800 });
	narrator.stepStarted("job1", { index: 1, do: "assert", text: "Check “Header” appears within 5 s" });
	narrator.stepEnded("job1", { index: 1, do: "assert", ok: false, ms: 5000, reason: "not found", text: "Check “Header” appears within 5 s" });
	narrator.stepStarted("job1", { index: 2, do: "mock", text: "Mock off: /range", isCleanup: true });
	narrator.stepEnded("job1", { index: 2, do: "mock", ok: true, ms: 40, isCleanup: true, text: "Mock off: /range" });
	narrator.end("job1", "FAIL");
	run = narrator.view().runs[0];
	assert.deepEqual(run.steps.map((step) => [step.n, step.status, step.text, step.isCleanup]), [
		[1, "done", "Tap “See all”", false],
		[2, "failed", "Check “Header” appears", false],
		[3, "done", "Mock off: /range", true],
	]);
	assert.equal(run.steps[1].reason, "not found");
	assert.equal(run.verdict, "FAIL");
});

test("R1: Claude tool calls close on their result; only 3 runs are kept", () => {
	let clock = 0;
	const narrator = new Narrator({ now: () => clock });
	narrator.begin("c", { source: "claude" });
	narrator.toolCall("c", { id: "t1", name: "x__test_forge_screenshot", input: {} });
	narrator.toolCall("c", { id: "t2", name: "Bash", input: {} });
	clock = 300;
	narrator.toolResult("c", { id: "t1", isError: false });
	assert.deepEqual(narrator.view().runs[0].steps.map((step) => [step.text, step.status, step.ms]), [["Take a screenshot", "done", 300]]);
	for (const key of ["a", "b", "d"]) narrator.begin(key, {});
	assert.deepEqual(narrator.view().runs.map((run) => run.key), ["d", "b", "a"]);
});

test("R1: usage comes from rate-limit events (allowed ones too) and the run's context", () => {
	const nowMs = Date.UTC(2026, 9, 13, 10, 0, 0);
	const feed = new UsageFeed({ tapPath: "/nonexistent", now: () => nowMs });
	const nowS = nowMs / 1000;
	feed.noteMessage({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { five_hour: { utilization: 0.32, resetsAt: nowS + 3600 }, seven_day: { utilization: 0.46, resetsAt: nowS + 4 * 86400 } } } });
	feed.noteMessage({ type: "assistant", message: { model: "claude-opus-5-5", usage: { input_tokens: 2, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 30_000 } } }, "s1");
	feed.noteMessage({ type: "result", modelUsage: { "claude-haiku-5-5": { contextWindow: 200_000 }, "claude-opus-5-5": { contextWindow: 1_000_000 } } }, "s1");
	const view = feed.view();
	assert.equal(view.fiveHour.usedPct, 32);
	assert.equal(view.fiveHour.elapsedPct, 80);
	assert.equal(view.fiveHour.resetsInS, 3600);
	assert.equal(view.fiveHour.isAhead, false);
	assert.equal(view.sevenDay.usedPct, 46);
	assert.equal(view.context.pct, 23);
	assert.equal(view.source, "claude-run");
	assert.equal(view.ageS, 0);
	assert.equal(view.isStale, false);
});

test("R1: the weekly elapsed share counts weekdays only, like the status line script", () => {
	// Window Tue 00:00 → next Tue 00:00 local; now = Sat noon → Tue..Fri = 4 full weekdays = 80%.
	const tuesday = new Date(2026, 9, 13, 0, 0, 0).getTime() / 1000;
	const saturdayNoon = new Date(2026, 9, 17, 12, 0, 0).getTime() / 1000;
	assert.equal(elapsedPct(tuesday + 7 * 86400, 7 * 86400, { nowS: saturdayNoon, weekdaysOnly: true }), 80);
	assert.equal(elapsedPct(tuesday + 7 * 86400, 7 * 86400, { nowS: saturdayNoon }), 64);
	assert.equal(elapsedPct(null, 100), null);
});

test("R1: the usage tap is read when newer than the runs' figures", async () => {
	const dir = await mkdtemp(join(tmpdir(), "usage-"));
	const tapPath = join(dir, "usage.json");
	await writeFile(tapPath, JSON.stringify({ context_window: { used_percentage: 12.4 }, rate_limits: { five_hour: { used_percentage: 7, resets_at: 2_000_000_000 }, seven_day: { used_percentage: 42.2, resets_at: 2_000_400_000 } } }));
	const feed = new UsageFeed({ tapPath, now: () => Date.now() });
	assert.equal(await feed.readTap(), true);
	const view = feed.view();
	assert.equal(view.source, "status-line");
	assert.equal(view.fiveHour.usedPct, 7);
	assert.equal(view.sevenDay.usedPct, 42);
	assert.equal(view.context.pct, 12);
	assert.equal(await feed.readTap(), false, "unchanged file → nothing new");
	assert.equal(await new UsageFeed({ tapPath: join(dir, "missing.json") }).readTap(), false);
});
