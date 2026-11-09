import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportRules, loadPackRules, packFileName, resolveRule } from "../lib/mock-pack.js";

const body = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const rule = (id, endpointKey, variants) => ({
	id, endpointKey, isEnabled: true, activeVariantID: `${id}-v0`, match: {},
	variants: variants.map((name, index) => ({ id: `${id}-v${index}`, name, steps: [{ respond: { _0: { statusCode: 200, headers: { Authorization: "Bearer x" }, body: body({ accessToken: "secret", ok: name }) } } }] })),
});

test("export: one redacted, switched-off pack per rule; load reads them back by endpoint", async () => {
	const root = await mkdtemp(join(tmpdir(), "test-forge-pack-"));
	const written = await exportRules([rule("r1", "GET /backend/configs", ["revamp-on", "revamp-off"])], { root });
	assert.deepEqual(written, ["get-backend-configs.networklens-pack.json"]);
	const pack = JSON.parse(await readFile(join(root, "TestForgeMacros", "mocks", written[0]), "utf8"));
	assert.equal(pack.formatVersion, 1);
	const [stored] = pack.mocks;
	assert.equal(stored.isEnabled, false);
	const response = stored.variants[0].steps[0].respond._0;
	assert.equal(response.headers.Authorization, "<redacted>");
	assert.equal(JSON.parse(Buffer.from(response.body, "base64")).accessToken, "<redacted>");
	assert.equal((await loadPackRules(root)).get("GET /backend/configs").file, written[0]);
	assert.equal(packFileName("POST /gdn-oauth/token"), "post-gdn-oauth-token.networklens-pack.json");
});

test("resolve: device rule first; the pack fills a missing rule or variant, keeping the device id", () => {
	const packed = new Map([["GET /a", { rule: rule("p1", "GET /a", ["loaded", "empty"]) }]]);
	assert.equal(resolveRule([rule("d1", "GET /a", ["loaded", "empty"])], packed, "GET /a", "empty").imported, false);
	const fresh = resolveRule([], packed, "GET /a", "empty");
	assert.deepEqual([fresh.imported, fresh.rule.id], [true, "p1"]);
	const upgraded = resolveRule([rule("d1", "GET /a", ["loaded"])], packed, "GET /a", "empty");
	assert.deepEqual([upgraded.imported, upgraded.replaces, upgraded.rule.id], [true, true, "d1"]);
	assert.equal(resolveRule([rule("d1", "GET /a", ["loaded"])], new Map(), "GET /a", "empty").missingVariant, true);
	assert.equal(resolveRule([], new Map(), "GET /b", "x").rule, null);
});
