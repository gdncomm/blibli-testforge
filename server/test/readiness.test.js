import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTestBundle } from "../lib/readiness.js";

test("finds the runner for the configured build only", async () => {
	const derivedData = await mkdtemp(join(tmpdir(), "dd-"));
	await mkdir(join(derivedData, "BlibliMobile-iOS-abc/Build/Products/Debug-iphonesimulator/BlibliMobile_XCUITest-Runner.app"), { recursive: true });
	const options = { projectDir: "/x/BlibliMobile-iOS", runnerTarget: "BlibliMobile_XCUITest", derivedData };
	assert.equal(await findTestBundle({ ...options, configuration: "PerformanceTest" }), null);
	await mkdir(join(derivedData, "BlibliMobile-iOS-abc/Build/Products/PerformanceTest-iphonesimulator/BlibliMobile_XCUITest-Runner.app"), { recursive: true });
	assert.match((await findTestBundle({ ...options, configuration: "PerformanceTest" })).path, /PerformanceTest-iphonesimulator/);
});

test("no QA simulator: blocked with the create fix, nothing probed", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	let probed = false;
	const state = await checkReadiness({
		bundleId: "x", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa: null, booted: [], others: [] }),
		buildState: async () => ({ state: "stale", build: { codeId: "aaaaaaa" }, codeId: "bbbbbbb" }),
		legacyBundle: async () => null,
		probeHarness: async () => (probed = true),
	});
	assert.equal(state.ready, false);
	assert.equal(state.checks[0].fix, "test-forge-sim-create");
	assert.equal(state.checks[2].fix, "build-qa");
	assert.match(state.checks[2].detail, /built from aaaaaaa, the code is at bbbbbbb/);
	assert.equal(probed, false);
});

test("D-120: other booted simulators are left alone — every command names the test device", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const qa = { udid: "q", name: "TestForge · iPhone", state: "Booted" };
	const state = await checkReadiness({
		bundleId: "x", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa, booted: [qa, { udid: "d", name: "iPhone" }], others: [{ udid: "d", name: "iPhone" }] }),
		buildState: async () => ({ state: "no-code" }), legacyBundle: async () => null, probeHarness: async () => true,
	});
	const simulator = state.checks.find((check) => check.id === "simulator");
	assert.equal(simulator.ok, true);
	assert.equal(simulator.fix, undefined);
	assert.match(simulator.detail, /also booted: iPhone \(left alone\)/);
});

test("P7: a runner that stops answering on a good setup only warns — the next test restarts it", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const qa = { udid: "q", name: "TestForge · iPhone", state: "Booted" };
	const base = {
		bundleId: "x", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa, booted: [qa], others: [] }),
		buildState: async () => ({ state: "no-code" }), legacyBundle: async () => ({ path: "/x" }),
	};
	// The fake bundle id isn't installed, so "app" blocks and nothing is probed: still a blocker.
	const unprobed = await checkReadiness({ ...base, probeHarness: async () => false });
	const waiting = unprobed.checks.find((check) => check.id === "harness");
	assert.equal(waiting.level, "block");
	assert.equal(waiting.selfHeals, undefined);
});

test("P3: warnings don't block, Claude only gates ▶ Run, low disk blocks", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const qa = { udid: "q", name: "TestForge · iPhone", state: "Booted" };
	const base = {
		bundleId: "com.example.none", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa, booted: [qa], others: [] }),
		buildState: async () => ({ state: "no-code" }), legacyBundle: async () => ({ path: "/x" }), probeHarness: async () => true,
		codeState: async () => ({ manifest: null }),
		deviceHolder: () => "SF-084 replay",
		claudeState: async () => ({ ok: false, detail: "not signed in" }),
	};
	const state = await checkReadiness({ ...base, diskFreeGb: async () => 50 });
	const byId = Object.fromEntries(state.checks.map((check) => [check.id, check]));
	assert.equal(byId.code.level, "warn");
	assert.equal(byId.device.level, "warn");
	assert.equal(byId.claude.scope, "claude");
	// The fake bundle id is never installed, so "app" blocks; nothing else should.
	assert.deepEqual(state.checks.filter((check) => !check.ok && check.level === "block" && check.scope === "all").map((check) => check.id).filter((id) => id !== "app" && id !== "harness"), []);
	assert.equal(state.readyForClaude, false);
	const lowDisk = await checkReadiness({ ...base, diskFreeGb: async () => 3 });
	assert.equal(lowDisk.checks.find((check) => check.id === "disk").fix, "free-space");
});

test("D-156: claude-env is a warn-level check, scoped to all (it never gates a Run/Replay here)", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const qa = { udid: "q", name: "TestForge · iPhone", state: "Booted" };
	const base = {
		bundleId: "com.example.none", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa, booted: [qa], others: [] }),
		buildState: async () => ({ state: "no-code" }), legacyBundle: async () => ({ path: "/x" }), probeHarness: async () => true,
	};
	const notSetUp = await checkReadiness({ ...base, claudeEnvState: async () => ({ ok: false, detail: "not set up yet" }) });
	const check = notSetUp.checks.find((c) => c.id === "claude-env");
	assert.equal(check.level, "warn");
	assert.equal(check.scope, "all");
	assert.equal(check.fix, "configure-claude-env");
	assert.equal(check.ok, false);

	const setUp = await checkReadiness({ ...base, claudeEnvState: async () => ({ ok: true, detail: "settings.local.json matches this Mac" }) });
	assert.equal(setUp.checks.find((c) => c.id === "claude-env").fix, undefined);

	const omitted = await checkReadiness(base);
	assert.equal(omitted.checks.find((c) => c.id === "claude-env"), undefined, "no claudeEnvState dep ⇒ no check added, same as the other optional checks");
});

test("a fresh readiness request never reuses a check that started before it (D-067)", async () => {
	const { readinessGate } = await import("../lib/readiness.js");
	let calls = 0;
	const gate = readinessGate({
		bundleId: "x", configuration: "PerformanceTest",
		simulatorState: async () => {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { qa: null, booted: [], others: [] };
		},
		buildState: async () => ({ state: "no-code" }), legacyBundle: async () => null, probeHarness: async () => true,
	});
	const polling = gate.get();
	await gate.get({ fresh: true });
	await polling;
	assert.equal(calls, 2);
	// A non-fresh request right after shares the cached answer.
	await gate.get();
	assert.equal(calls, 2);
});

// D-082: readiness fingerprints.
const memoInputs = (overrides = {}) => {
	const calls = { installed: 0, matched: 0 };
	const options = {
		bundleId: "com.example", configuration: "PerformanceTest",
		simulatorState: async () => ({ qa: { udid: "UDID-1", name: "TestForge · iPhone", state: "Booted" }, booted: [], others: [] }),
		buildState: async () => ({ state: "current", build: { codeId: "abc1234", endedAt: "2026-10-13T10:00:00Z" }, codeId: "abc1234" }),
		legacyBundle: async () => null,
		probeHarness: async () => true,
		appInstalled: async () => {
			calls.installed += 1;
			return true;
		},
		installedMatch: async () => {
			calls.matched += 1;
			return { applies: true, ok: true, detail: "matches" };
		},
		...overrides,
	};
	return { calls, options };
};

test("D-082: a passing install check is reused while its fingerprint is unchanged", async () => {
	const { checkReadiness, createCheckMemo } = await import("../lib/readiness.js");
	const memo = createCheckMemo();
	const { calls, options } = memoInputs({ memo });
	await checkReadiness(options);
	const second = await checkReadiness(options);
	assert.deepEqual(calls, { installed: 1, matched: 1 });
	const app = second.checks.find((check) => check.id === "app");
	assert.equal(app.ok, true);
	assert.equal(app.isReused, true);
	assert.ok(app.checkedAt);
	assert.equal(second.checks.find((check) => check.id === "installed").isReused, true);
	assert.equal(typeof second.durationMs, "number");
});

test("D-082: a new build or simulator changes the fingerprint and re-runs the check", async () => {
	const { checkReadiness, createCheckMemo } = await import("../lib/readiness.js");
	const memo = createCheckMemo();
	const { calls, options } = memoInputs({ memo });
	await checkReadiness(options);
	await checkReadiness({ ...options, buildState: async () => ({ state: "current", build: { codeId: "def5678", endedAt: "2026-10-13T11:00:00Z" }, codeId: "def5678" }) });
	await checkReadiness({ ...options, simulatorState: async () => ({ qa: { udid: "UDID-2", name: "TestForge · iPhone", state: "Booted" }, booted: [], others: [] }) });
	assert.equal(calls.installed, 3);
});

test("D-082: failures are never reused, and a reused pass expires", async () => {
	const { checkReadiness, createCheckMemo } = await import("../lib/readiness.js");
	let clock = 0;
	const memo = createCheckMemo({ now: () => clock, maxAgeMs: 1_000 });
	let isInstalled = false;
	const { calls, options } = memoInputs({ memo, appInstalled: async () => { calls.installed += 1; return isInstalled; } });
	await checkReadiness(options);
	await checkReadiness(options);
	assert.equal(calls.installed, 2, "a failing check runs every time");
	isInstalled = true;
	await checkReadiness(options);
	await checkReadiness(options);
	assert.equal(calls.installed, 3, "the first pass is then reused");
	clock = 5_000;
	await checkReadiness(options);
	assert.equal(calls.installed, 4, "an expired pass is checked again");
});

test("D-082: the memo file lets a restarted server start warm", async () => {
	const { checkReadiness, createCheckMemo } = await import("../lib/readiness.js");
	const file = join(await mkdtemp(join(tmpdir(), "memo-")), ".data", "readiness-memo.json");
	const first = memoInputs({ memo: createCheckMemo({ file }) });
	await checkReadiness(first.options);
	const restarted = memoInputs({ memo: createCheckMemo({ file }) });
	const state = await checkReadiness(restarted.options);
	assert.deepEqual(restarted.calls, { installed: 0, matched: 0 });
	assert.equal(state.checks.find((check) => check.id === "app").isReused, true);
});

// D-083: "Code prepared" warns only when what the app is built from changed.
const codeOnly = (code) => ({
	bundleId: "x", configuration: "PerformanceTest",
	simulatorState: async () => ({ qa: null, booted: [], others: [] }),
	buildState: async () => ({ state: "none" }),
	legacyBundle: async () => null,
	probeHarness: async () => false,
	codeState: async () => code,
});
const preparedHoursAgo = (hours, source = "local") => ({ source, branch: "dev", snapshotId: "aaaaaaa+1111", preparedAt: new Date(Date.now() - hours * 3_600_000).toISOString() });

test("D-083: a snapshot that moved only outside the app passes, with a note", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const state = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(1), drift: { hasDrifted: true, hasAppInputsChanged: false, nowId: "bbbbbbb" } }));
	const code = state.checks.find((check) => check.id === "code");
	assert.equal(code.ok, true);
	assert.match(code.detail, /only files outside the app changed/);
});

test("D-083: a change to app inputs still warns with the Prepare fix", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const state = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(1), drift: { hasDrifted: true, hasAppInputsChanged: true, nowId: "bbbbbbb" } }));
	const code = state.checks.find((check) => check.id === "code");
	assert.equal(code.ok, false);
	assert.equal(code.fix, "code");
});

test("D-083: age warns only for a GitHub branch; an old prepare without drift info falls back to the snapshot", async () => {
	const { checkReadiness } = await import("../lib/readiness.js");
	const local = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(30), drift: { hasDrifted: false } }));
	assert.equal(local.checks.find((check) => check.id === "code").ok, true);
	const github = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(30, "github"), drift: null }));
	assert.equal(github.checks.find((check) => check.id === "code").ok, false);
	const legacy = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(1), drift: { hasDrifted: true, nowId: "b" } }));
	assert.equal(legacy.checks.find((check) => check.id === "code").ok, false);
});

test("D-083: localDrift tells app-input changes from tools/macro changes", async () => {
	const { execFileSync } = await import("node:child_process");
	const { writeFile } = await import("node:fs/promises");
	const { localDrift, localSnapshotId, buildInputId } = await import("../lib/test-forge-copy.js");
	const repo = await mkdtemp(join(tmpdir(), "drift-"));
	const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
	git("init", "-q");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	await mkdir(join(repo, "tools"), { recursive: true });
	await mkdir(join(repo, "BlibliMobile-iOS/BlibliMobile_XCUITest"), { recursive: true });
	await writeFile(join(repo, "App.swift"), "let a = 1\n");
	await writeFile(join(repo, "tools/notes.md"), "v1\n");
	await writeFile(join(repo, "BlibliMobile-iOS/BlibliMobile_XCUITest/macro.json"), "{}\n");
	git("add", ".");
	git("commit", "-qm", "init");
	const { snapshotId } = await localSnapshotId(repo);
	const manifest = { source: "local", repo, snapshotId, buildInputId: await buildInputId(repo) };
	await writeFile(join(repo, "tools/notes.md"), "v2\n");
	await writeFile(join(repo, "BlibliMobile-iOS/BlibliMobile_XCUITest/macro.json"), "{\"a\":1}\n");
	git("commit", "-qam", "tools + macro");
	const outside = await localDrift(manifest);
	assert.equal(outside.hasDrifted, true);
	assert.equal(outside.hasAppInputsChanged, false);
	await writeFile(join(repo, "App.swift"), "let a = 2\n");
	const inside = await localDrift(manifest);
	assert.equal(inside.hasAppInputsChanged, true);
});

test("D-198: run notes beside macros aren't app code; drift names the changed app file", async () => {
	const { execFileSync } = await import("node:child_process");
	const { writeFile, cp } = await import("node:fs/promises");
	const { localDrift, localSnapshotId, buildInputId } = await import("../lib/test-forge-copy.js");
	const { checkReadiness } = await import("../lib/readiness.js");
	const repo = await mkdtemp(join(tmpdir(), "drift-notes-"));
	const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" }).toString().trim();
	git("init", "-q");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	await mkdir(join(repo, "BlibliMobile-iOS/BlibliMobile_XCUITest/Promo"), { recursive: true });
	await writeFile(join(repo, "App.swift"), "let a = 1\n");
	git("add", ".");
	git("commit", "-qm", "init");
	const copy = await mkdtemp(join(tmpdir(), "drift-copy-"));
	await cp(join(repo, "App.swift"), join(copy, "App.swift"));
	const { snapshotId, sha } = await localSnapshotId(repo);
	const manifest = { source: "local", repo, sha, snapshotId, path: copy, changedFiles: [], changedFileCount: 0, buildInputId: await buildInputId(repo) };
	await writeFile(join(repo, "BlibliMobile-iOS/BlibliMobile_XCUITest/Promo/CASE-1-notes.md"), "ran\n");
	const notes = await localDrift(manifest);
	assert.equal(notes.hasDrifted, true);
	assert.equal(notes.hasAppInputsChanged, false);
	await writeFile(join(repo, "App.swift"), "let a = 2\n");
	const app = await localDrift(manifest);
	assert.equal(app.hasAppInputsChanged, true);
	assert.deepEqual(app.appFiles, ["App.swift"]);
	const state = await checkReadiness(codeOnly({ manifest: preparedHoursAgo(1), drift: app }));
	assert.match(state.checks.find((check) => check.id === "code").detail, /app code changed since: App\.swift/);
});
