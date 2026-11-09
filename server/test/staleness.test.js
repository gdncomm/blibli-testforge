import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedBetween, coverageOf, SHARED_INPUTS, staleReason } from "../lib/staleness.js";
import { StaleChecker } from "../lib/stale-cases.js";
import { buildLabel, testcaseView } from "../lib/testcase-view.js";

const promo = "BlibliMobile-iOS/BlibliMobile-iOS/CustomerExperience/Engagement/Promotions";
const runBuild = { linked: true, builtFrom: "aaa1111", buildInputId: "in-a" };
const currentBuild = { linked: true, builtFrom: "bbb2222", buildInputId: "in-b" };

test("coverage: own `covers` first, then the macro's module folder, else unknown", () => {
	assert.deepEqual(coverageOf({ covers: ["x/y"], path: "Engagement/Promo/macros/a.json" }), ["x/y"]);
	assert.deepEqual(coverageOf({ path: "Engagement/Promo/macros/mt-004.json" }), [promo]);
	assert.deepEqual(coverageOf({ path: "Authentication/General/macros/a.json" }), ["BlibliMobile-iOS/BlibliMobile-iOS/Authentication"]);
	assert.equal(coverageOf({ path: "General/General/macros/a.json" }), null);
});

test("stale only when a newer build changed covered code or dependencies", () => {
	const covers = [promo];
	assert.equal(staleReason({ runBuild: currentBuild, currentBuild, changed: [], covers }), null);
	assert.equal(staleReason({ runBuild: { ...runBuild, buildInputId: "in-b" }, currentBuild, changed: [`${promo}/A.swift`], covers }), null);
	assert.equal(staleReason({ runBuild, currentBuild, changed: ["BlibliMobile-iOS/BlibliMobile-iOS/Payment/P.swift"], covers }), null);
	assert.deepEqual(staleReason({ runBuild, currentBuild, changed: [`${promo}/A.swift`], covers }).files, [`${promo}/A.swift`]);
	assert.match(staleReason({ runBuild, currentBuild, changed: [SHARED_INPUTS[0]], covers }).reason, /dependencies/);
	assert.match(staleReason({ runBuild, currentBuild, changed: null, covers }).reason, /can't compare/);
	assert.match(staleReason({ runBuild, currentBuild, changed: ["BlibliMobile-iOS/BlibliMobile-iOS/X.swift"], covers: null }).reason, /coverage unknown/);
});

test("changed files: commit diff (app code only) plus local edits that differ", async () => {
	const diffNames = async () => [`${promo}/A.swift`, "tools/test-forge-server/README.md"];
	const from = { sha: "aaa", local: { [`${promo}/B.swift`]: "h1" } };
	const to = { sha: "bbb", local: { [`${promo}/B.swift`]: "h2", [`${promo}/C.swift`]: "h3" } };
	assert.deepEqual(await changedBetween(from, to, diffNames), [`${promo}/A.swift`, `${promo}/B.swift`, `${promo}/C.swift`]);
	assert.deepEqual(await changedBetween({ ...from, sha: "bbb" }, { sha: "bbb", local: from.local }, diffNames), []);
	assert.equal(await changedBetween(null, to, diffNames), null);
});

test("checker records a built snapshot's local edits and compares two builds", async () => {
	const dir = await mkdtemp(join(tmpdir(), "stale-"));
	await mkdir(join(dir, "copy", promo), { recursive: true });
	await writeFile(join(dir, "copy", promo, "B.swift"), "one");
	const checker = new StaleChecker(join(dir, "snapshots.json"), { diffNames: async () => [] });
	await checker.remember({ builtFrom: "abc+1" }, { snapshotId: "abc+1", sha: "abc", path: join(dir, "copy"), changedFiles: [`${promo}/B.swift`, "docs/x.md"] });
	await writeFile(join(dir, "copy", promo, "B.swift"), "two");
	await checker.remember({ builtFrom: "abc+2" }, { snapshotId: "abc+2", sha: "abc", path: join(dir, "copy"), changedFiles: [`${promo}/B.swift`] });
	assert.deepEqual(await checker.changed("abc+1", "abc+2"), [`${promo}/B.swift`]);
	assert.equal(await checker.changed("old+9", "abc+2"), null);
});

test("Tests slice: last run carries its build label and stale reason", () => {
	const build = { linked: true, branch: "develop", sha: "9ec4017ba4", hasLocalChanges: true, appVersion: "15.0.0", buildNumber: "150006", builtFrom: "9ec4017+64e6" };
	assert.equal(buildLabel(build), "develop @ 9ec4017+local · 15.0.0 (150006)");
	const view = testcaseView({
		cases: [{ id: "4" }],
		macros: [{ id: "mc_1", name: "MT-004", testCases: ["4"], path: "Engagement/Promo/macros/mt-004.json" }],
		runs: [{ caseId: "4", macroId: "mc_1", verdict: "PASS", recordedAt: "2026-11-02T00:00:00Z", build }],
		staleFor: (_run, covers) => ({ reason: `covers ${covers.length}`, files: [] }),
	});
	assert.equal(view.cases[0].lastRun.build, "develop @ 9ec4017+local · 15.0.0 (150006)");
	assert.equal(view.cases[0].lastRun.stale.reason, "covers 1");
});
