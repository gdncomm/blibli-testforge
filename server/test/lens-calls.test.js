// D-127: captured calls as rows, detail and curl — what the console and test-forge-lens show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { callDetail, callRows, curlCommand, responseOf } from "../lib/lens-calls.js";

const encode = (text) => Buffer.from(text).toString("base64");

const record = (id, url, recordedAt, extra = {}) => ({
	recordedAt,
	exchange: {
		id,
		request: { method: "GET", url, headers: { Accept: "application/json" } },
		response: { statusCode: 200, headers: {}, body: encode("{\"ok\":true}") },
		...extra,
	},
});

test("rows are newest first, filtered by URL text, capped", () => {
	const records = [
		record("a", "https://x/backend/content-api/flashsale", "2026-10-16T05:00:00Z"),
		record("b", "https://x/backend/content-api/sub-flashsale/range", "2026-10-16T05:00:02Z"),
		record("c", "https://x/backend/configs", "2026-10-16T05:00:01Z"),
	];
	assert.deepEqual(callRows(records).map((row) => row.id), ["b", "c", "a"]);
	assert.deepEqual(callRows(records, { grep: "FLASHSALE" }).map((row) => row.id), ["b", "a"]);
	assert.equal(callRows(records, { limit: 1 }).length, 1);
});

test("a served mock is flagged from the trace's own marker", () => {
	const records = [
		record("m", "https://x/a", "2026-10-16T05:00:01Z", { isMockServed: true, source: { mocked: {} } }),
		record("n", "https://x/b", "2026-10-16T05:00:00Z", { source: { network: {} } }),
	];
	assert.deepEqual(callRows(records).map((row) => row.isMocked), [true, false]);
});

test("a binary response body is labelled, not printed", () => {
	const binary = record("p", "https://x/log", "2026-10-16T05:00:00Z");
	binary.exchange.response.body = Buffer.from([0x0a, 0x8f, 0xff, 0x01, 0x02]).toString("base64");
	assert.equal(callDetail(binary).responseBody, "(binary body, 5 bytes)");
});

test("curl quotes safely and carries headers and body", () => {
	const exchange = { request: { method: "POST", url: "https://x/a?b='c'", headers: { "Content-Type": "application/json" }, body: encode("{\"q\":\"it's\"}") } };
	const curl = curlCommand(exchange);
	assert.match(curl, /^curl -X POST 'https:\/\/x\/a\?b='\\''c'\\''' -H 'Content-Type: application\/json' --data-raw /);
	assert.ok(curl.includes("it'\\''s"));
});

test("a captured response becomes a mock source with its status and bytes", () => {
	const source = responseOf(record("a", "https://x/y", "2026-10-16T05:00:00Z"));
	assert.equal(source.body.toString("utf8"), "{\"ok\":true}");
});
