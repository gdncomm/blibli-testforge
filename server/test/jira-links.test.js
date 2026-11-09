import { test } from "node:test";
import assert from "node:assert/strict";
import { jiraComment, jiraLinksFrom, ticketsFor } from "../lib/jira-links.js";

const BODY = [
	"| **Jira** | [SEA-59531](https://blibli.atlassian.net/browse/SEA-59531) |",
	"| --- | --- |",
	"| **QA** | @someone |",
	"",
	"|  | **Test cases** | **STEP ACTION** | **EXPECTED RESULT** |",
	"| --- | --- | --- | --- |",
	"| 1 | Tab hidden | Save as UTF-8 then open. | Hidden. |",
	"| 2 | Regression SEA-60001 | Open page. | Works. |",
].join("\n");
const cases = [
	{ id: "1", scenario: "Tab hidden", steps: "Save as UTF-8 then open.", expected: "Hidden." },
	{ id: "2", scenario: "Regression SEA-60001", steps: "Open page.", expected: "Works." },
];

test("D-193: the page's Jira row is every case's ticket; a case row naming its own ticket wins; UTF-8 is no ticket", () => {
	const links = jiraLinksFrom(BODY, cases);
	assert.deepEqual(links.document, [{ key: "SEA-59531", url: "https://blibli.atlassian.net/browse/SEA-59531" }]);
	assert.deepEqual(links.byCase, { 2: [{ key: "SEA-60001", url: null }] });
	assert.equal(ticketsFor("1", links)[0].key, "SEA-59531");
	assert.equal(ticketsFor("2", links)[0].key, "SEA-60001");
	assert.deepEqual(ticketsFor("1", null), []);
});

test("D-193: an HTML page's labelled row is found too", () => {
	const html = "<table><tr><td><strong>Jira</strong></td><td><a href=\"https://x.atlassian.net/browse/IOS-47345\">IOS-47345</a></td></tr></table>";
	assert.equal(jiraLinksFrom(html, []).document[0].key, "IOS-47345");
});

test("D-193: the comment names result, build, batch, failed step and proof", () => {
	const text = jiraComment({
		testCase: { id: "4", scenario: "Tab hidden", expected: "Hidden." },
		run: { verdict: "FAIL", at: "2026-11-02T10:00:00Z", steps: [{ text: "Tap tab", ok: false, reason: "not found" }] },
		build: "develop @ 9ec4017 · 15.0.0 (150006)",
		batchName: "MICROSITE_TABBING",
		proofNames: ["a.png"],
	});
	assert.match(text, /^Test result — case 4: Tab hidden/);
	assert.match(text, /Result: FAIL/);
	assert.match(text, /Build: develop @ 9ec4017/);
	assert.match(text, /Failed at: Tap tab — not found/);
	assert.match(text, /Proof \(1\): a\.png/);
	assert.doesNotMatch(text, /TestForgeDriver|NetworkLens|TestForge/);
});
