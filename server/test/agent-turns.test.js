import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFiles, parseLearnedMacroId, parseTriage, snapshotMacroFiles, triagePrompt } from "../lib/agent-turns.js";

test("triage line: last one wins; markdown stripped; missing → UNKNOWN", () => {
	assert.deepEqual(parseTriage("thinking… TRIAGE: APP_BUG — draft\n\n**TRIAGE: MACRO_BROKEN — tab row id renamed to `FS_TabRow`**"), { kind: "MACRO_BROKEN", summary: "tab row id renamed to FS_TabRow" });
	assert.equal(parseTriage("no verdict here").kind, "UNKNOWN");
	assert.equal(parseLearnedMacroId("done\nMACRO: mc_N8G7DBVQB8 Engagement/FlashSale/macros/x.json"), "mc_N8G7DBVQB8");
});

test("snapshot: only macro, reference and TestForgeMacros files; diff names added, changed, removed", async () => {
	const root = await mkdtemp(join(tmpdir(), "test-forge-snap-"));
	await mkdir(join(root, "Engagement", "FlashSale", "macros"), { recursive: true });
	await mkdir(join(root, "TestForgeMacros"), { recursive: true });
	await writeFile(join(root, "Engagement", "FlashSale", "macros", "a.json"), "{}");
	await writeFile(join(root, "TestForgeMacros", "elements.json"), "{}");
	await writeFile(join(root, "Engagement", "notes.json"), "{}");
	const before = await snapshotMacroFiles(root);
	assert.deepEqual([...before.keys()].sort(), ["Engagement/FlashSale/macros/a.json", "TestForgeMacros/elements.json"]);
	await writeFile(join(root, "TestForgeMacros", "elements.json"), '{"elements":{}}');
	await writeFile(join(root, "Engagement", "FlashSale", "macros", "b.json"), "{}");
	assert.deepEqual(changedFiles(before, await snapshotMacroFiles(root)).sort((x, y) => x.path.localeCompare(y.path)), [
		{ path: "Engagement/FlashSale/macros/b.json", change: "added" },
		{ path: "TestForgeMacros/elements.json", change: "changed" },
	]);
});

test("triage prompt names the macro file, the registry, the allowed edits and the answer line", () => {
	const prompt = triagePrompt({ item: { caseId: "SF-084", verdict: "FAIL at step 5" }, macro: { id: "mc_1", name: "SF-084", path: "Engagement/FlashSale/macros/sf.json" }, root: "/r", log: "✗ 5. Wait", screenshot: "/m/t.png" });
	for (const part of ["/r/Engagement/FlashSale/macros/sf.json", "/r/TestForgeMacros/elements.json", "Never weaken", "TRIAGE: <APP_BUG|MACRO_BROKEN|ENVIRONMENT>", "/m/t.png"]) assert.ok(prompt.includes(part), part);
});
