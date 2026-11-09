// Reset (R4f, D-108): runs against a throwaway testforge home and media root, never the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "test-forge-reset-"));
process.env.TEST_FORGE_HOME = join(root, "home");
const { performReset, resetPlan } = await import("../lib/reset.js");

const fakeStores = () => ({
	dataDir: join(root, "data"),
	results: { list: () => [], clearFinished: () => 2 },
	tasks: { clearFinished: () => 3 },
	sessions: { removeFinished: async () => 1 },
	clearRuns: async () => 4,
});

test("plan lists every item; the repo is info only", async () => {
	process.env.TEST_FORGE_MEDIA_ROOT = join(root, "media");
	const items = await resetPlan({ stores: fakeStores() });
	assert.deepEqual(items.map((item) => item.id), ["test-forge-derived", "test-forge-copies", "sim-attachments", "proof-media", "run-history", "xcode-derived", "swiftpm-cache", "swiftpm-settings", "repo"]);
	assert.equal(items.at(-1).isInfo, true);
	assert.deepEqual(items.filter((item) => item.isDefault).map((item) => item.id), ["test-forge-derived", "test-forge-copies", "sim-attachments", "proof-media"]);
});

test("empties the media root but keeps the folder, stops the runner first, clears run history", async () => {
	const media = join(root, "media");
	process.env.TEST_FORGE_MEDIA_ROOT = media;
	await mkdir(join(media, "TestForgeDriverSession-x"), { recursive: true });
	await writeFile(join(media, "TestForgeDriverSession-x", "shot.png"), "png");
	await writeFile(join(media, "a.mp4"), "mp4");
	const lines = [];
	let stopped = 0;
	await performReset({ ids: ["proof-media", "run-history"], stores: fakeStores(), harnessStop: async () => stopped++, say: (line) => lines.push(line) });
	assert.equal(stopped, 1);
	assert.ok(existsSync(media));
	assert.deepEqual(await readdir(media), []);
	assert.ok(lines.some((line) => line.includes("2 result runs, 3 tasks, 1 Claude sessions, 4 history entries")));
});

test("refuses a media root that is too broad", async () => {
	process.env.TEST_FORGE_MEDIA_ROOT = "/Users";
	await assert.rejects(performReset({ ids: ["proof-media"], stores: fakeStores(), harnessStop: async () => {}, say: () => {} }), /too broad/);
	assert.match((await resetPlan({ stores: fakeStores() })).find((item) => item.id === "proof-media").detail, /too broad/);
});

test("D-214: the reset list also holds what Build › Clean used to delete", async () => {
	const { RESET_IDS } = await import("../lib/reset.js");
	for (const id of ["test-forge-derived", "xcode-derived", "swiftpm-cache", "swiftpm-settings", "sim-attachments"]) assert.ok(RESET_IDS.includes(id), id);
	assert.equal(new Set(RESET_IDS).size, RESET_IDS.length);
});
