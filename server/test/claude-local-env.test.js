import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLocalEnv, diffLocalEnv, LOCAL_ENV_KEYS, readLocalEnv, writeLocalEnv } from "../lib/claude-local-env.js";

/** An in-memory fs: `files` maps path -> string content. */
function fakeDeps(files) {
	return {
		readFile: async (path) => {
			if (!(path in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			return files[path];
		},
		writeFile: async (path, data) => {
			files[path] = data;
		},
		rename: async (from, to) => {
			files[to] = files[from];
			delete files[from];
		},
	};
}

test("detectLocalEnv: resolves every key from what the server already knows, plus the QA simulator's udid", async () => {
	const env = await detectLocalEnv({
		projectDir: "/Users/dev/Project/BlibliMobile-iOS",
		mediaRoot: "/Users/dev/Documents/TestForge-Test",
		findTestForgeSim: async () => ({ udid: "AAAA-1111", name: "TestForge · iPhone 12" }),
	});
	assert.deepEqual(env, {
		TEST_FORGE_BUNDLE_ID: "com.blibli.mobile",
		NETWORKLENS_BUNDLE_ID: "com.blibli.mobile",
		TEST_FORGE_PROJECT_DIR: "/Users/dev/Project/BlibliMobile-iOS",
		TEST_FORGE_UITEST_TARGET: "BlibliMobile_XCUITest",
		TEST_FORGE_DATA_PLANE: "simctl",
		TEST_FORGE_MEDIA_ROOT: "/Users/dev/Documents/TestForge-Test",
		TEST_FORGE_DEVICE_UDID: "AAAA-1111",
	});
});

test("detectLocalEnv: no QA simulator yet ⇒ TEST_FORGE_DEVICE_UDID is null, not thrown", async () => {
	const env = await detectLocalEnv({ projectDir: "/p", findTestForgeSim: async () => null });
	assert.equal(env.TEST_FORGE_DEVICE_UDID, null);
});

test("detectLocalEnv: a findTestForgeSim that throws is treated the same as none found", async () => {
	const env = await detectLocalEnv({ projectDir: "/p", findTestForgeSim: async () => { throw new Error("no simctl"); } });
	assert.equal(env.TEST_FORGE_DEVICE_UDID, null);
});

test("diffLocalEnv: every key mismatched or missing is reported", () => {
	const expected = { TEST_FORGE_PROJECT_DIR: "/a", TEST_FORGE_DEVICE_UDID: "NEW-UDID" };
	const actual = { TEST_FORGE_PROJECT_DIR: "/old", TEST_FORGE_DEVICE_UDID: "NEW-UDID" };
	assert.deepEqual(diffLocalEnv(expected, actual), ["TEST_FORGE_PROJECT_DIR"]);
});

test("diffLocalEnv: an unresolved (null) expected value is never reported as a mismatch", () => {
	const expected = { TEST_FORGE_PROJECT_DIR: "/a", TEST_FORGE_DEVICE_UDID: null };
	assert.deepEqual(diffLocalEnv(expected, {}), ["TEST_FORGE_PROJECT_DIR"]);
});

test("diffLocalEnv: identical values on both sides ⇒ nothing missing", () => {
	const expected = { TEST_FORGE_PROJECT_DIR: "/a" };
	assert.deepEqual(diffLocalEnv(expected, { TEST_FORGE_PROJECT_DIR: "/a" }), []);
});

test("readLocalEnv: no file yet ⇒ {}", async () => {
	const deps = fakeDeps({});
	assert.deepEqual(await readLocalEnv("/repo/.claude/settings.local.json", deps), {});
});

test("readLocalEnv: returns the existing env block", async () => {
	const files = { "/repo/.claude/settings.local.json": JSON.stringify({ env: { TEST_FORGE_DEVICE_UDID: "X" } }) };
	assert.deepEqual(await readLocalEnv("/repo/.claude/settings.local.json", fakeDeps(files)), { TEST_FORGE_DEVICE_UDID: "X" });
});

test("writeLocalEnv: no file and no example ⇒ a new settings.local.json with just the env block", async () => {
	const files = {};
	const path = "/repo/.claude/settings.local.json";
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: "X" }, {}, fakeDeps(files));
	assert.deepEqual(JSON.parse(files[path]), { env: { TEST_FORGE_DEVICE_UDID: "X" } });
});

test("writeLocalEnv: seeds from examplePath's generic baseline the first time this Mac writes it", async () => {
	const examplePath = "/repo/.claude/settings.local.json.example";
	const path = "/repo/.claude/settings.local.json";
	const files = { [examplePath]: JSON.stringify({ permissions: { allow: ["Bash(git log:*)"] }, enabledMcpjsonServers: ["networklens"] }) };
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: "X" }, { examplePath }, fakeDeps(files));
	const written = JSON.parse(files[path]);
	assert.deepEqual(written.permissions, { allow: ["Bash(git log:*)"] });
	assert.deepEqual(written.enabledMcpjsonServers, ["networklens"]);
	assert.deepEqual(written.env, { TEST_FORGE_DEVICE_UDID: "X" });
});

test("writeLocalEnv: an existing file's permissions/hooks/mcp toggles pass through untouched — only env is merged", async () => {
	const path = "/repo/.claude/settings.local.json";
	const files = {
		[path]: JSON.stringify({
			permissions: { allow: ["Bash(git log:*)"] },
			hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
			env: { TEST_FORGE_DEVICE_UDID: "OLD" },
		}),
	};
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: "NEW", TEST_FORGE_PROJECT_DIR: "/p" }, {}, fakeDeps(files));
	const written = JSON.parse(files[path]);
	assert.deepEqual(written.permissions, { allow: ["Bash(git log:*)"] });
	assert.deepEqual(written.hooks, { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] });
	assert.deepEqual(written.env, { TEST_FORGE_DEVICE_UDID: "NEW", TEST_FORGE_PROJECT_DIR: "/p" });
});

test("writeLocalEnv: a null/unresolved value is never written, so it can't clobber a real one already there", async () => {
	const path = "/repo/.claude/settings.local.json";
	const files = { [path]: JSON.stringify({ env: { TEST_FORGE_DEVICE_UDID: "KEEP-ME" } }) };
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: null, TEST_FORGE_PROJECT_DIR: "/p" }, {}, fakeDeps(files));
	assert.deepEqual(JSON.parse(files[path]).env, { TEST_FORGE_DEVICE_UDID: "KEEP-ME", TEST_FORGE_PROJECT_DIR: "/p" });
});

test("writeLocalEnv: only ever writes keys from LOCAL_ENV_KEYS, ignoring anything else passed in", async () => {
	const path = "/repo/.claude/settings.local.json";
	const files = {};
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: "X", notARealKey: "nope" }, {}, fakeDeps(files));
	assert.deepEqual(Object.keys(JSON.parse(files[path]).env), ["TEST_FORGE_DEVICE_UDID"]);
	assert.ok(LOCAL_ENV_KEYS.includes("TEST_FORGE_DEVICE_UDID"));
});

test("writeLocalEnv: atomic write — goes through a temp file, never a partial write at the real path", async () => {
	const path = "/repo/.claude/settings.local.json";
	const renames = [];
	const files = {};
	const deps = {
		readFile: async (p) => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
		writeFile: async (p, data) => { files[p] = data; },
		rename: async (from, to) => { renames.push([from, to]); files[to] = files[from]; delete files[from]; },
	};
	await writeLocalEnv(path, { TEST_FORGE_DEVICE_UDID: "X" }, {}, deps);
	assert.equal(renames.length, 1);
	assert.notEqual(renames[0][0], path);
	assert.equal(renames[0][1], path);
});
