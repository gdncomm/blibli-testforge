import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadCaseRules, requirementsFor } from "../lib/case-requirements.js";

const rules = [
	{ match: "^SF-", requires: { session: "loggedIn", reloadHome: true } },
	{ match: "^SF-084$", requires: { environment: "prod" } },
	{ match: "([", requires: { session: "loggedOut" } },
];

test("matching rules merge; others and bad patterns are ignored", () => {
	assert.deepEqual(requirementsFor("SF-020", rules), { session: "loggedIn", reloadHome: true });
	assert.deepEqual(requirementsFor("SF-084", rules), { session: "loggedIn", reloadHome: true, environment: "prod" });
	assert.deepEqual(requirementsFor("CO-001", rules), {});
	assert.deepEqual(requirementsFor(undefined, rules), {});
});

test("rules load from TestForgeMacros/case-requirements.json; missing file means none", async () => {
	const root = await mkdtemp(join(tmpdir(), "case-req-"));
	assert.deepEqual(await loadCaseRules(root), []);
	await mkdir(join(root, "TestForgeMacros"));
	await writeFile(join(root, "TestForgeMacros", "case-requirements.json"), JSON.stringify({ rules }));
	assert.equal((await loadCaseRules(root)).length, 3);
});

// Reads the app repo's rule file, so it only runs where the app repo sits beside this one (the app repo's tools/test-forge-server).
const appRulesRoot = new URL("../../../BlibliMobile-iOS/BlibliMobile_XCUITest", import.meta.url).pathname;
test("the repo's rule file makes every SF case log in and reload Home", { skip: !existsSync(appRulesRoot) && "app repo not beside the server" }, async () => {
	const repoRules = await loadCaseRules(appRulesRoot);
	assert.deepEqual(requirementsFor("SF-020", repoRules), { session: "loggedIn", reloadHome: true });
});
