import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TEST_FORGE_HOME = await mkdtemp(join(tmpdir(), "wb-"));
const { buildArgs, firstProblem } = await import("../lib/test-forge-build.js");
const { freeDiskSpace } = await import("../lib/test-forge-copy.js");

test("build args keep the QA copy's own DerivedData and the QA simulator", () => {
	const args = buildArgs({ workspace: "App.xcworkspace", scheme: "S", configuration: "C" }, { udid: "U", derivedData: "/wb/derived/app" });
	assert.deepEqual(args.slice(args.indexOf("-derivedDataPath"), args.indexOf("-derivedDataPath") + 2), ["-derivedDataPath", "/wb/derived/app"]);
	assert.ok(args.includes("platform=iOS Simulator,id=U,arch=arm64"));
});

test("first problem is the line a person should read", () => {
	assert.equal(firstProblem(["CompileSwift a.swift", "/x/a.swift:3:1: error: cannot find 'Foo' in scope", "** TEST BUILD FAILED **"]), "/x/a.swift:3:1: error: cannot find 'Foo' in scope");
	assert.equal(firstProblem(["all good"]), null);
});

test("free disk space removes only old entries under the testforge", async () => {
	const home = process.env.TEST_FORGE_HOME;
	const old = join(home, "checkouts", "old-repo");
	const fresh = join(home, "derived", "fresh-repo");
	await mkdir(old, { recursive: true });
	await mkdir(fresh, { recursive: true });
	await writeFile(join(old, "f"), "x");
	const longAgo = new Date(Date.now() - 30 * 86_400_000);
	await utimes(old, longAgo, longAgo);
	const { removed } = await freeDiskSpace({ olderThanDays: 14 });
	assert.deepEqual(removed.map((entry) => entry.name), ["old-repo"]);
});

test("cache noise is never the first problem", () => {
	assert.equal(firstProblem(["skipping cache due to an error: x already exists", "xcodebuild: error: Could not resolve package dependencies:"]), "xcodebuild: error: Could not resolve package dependencies:");
});

test("a cached package checkout on another revision than Package.resolved is reported stale (D-066)", async () => {
	const { stalePackageCheckouts } = await import("../lib/test-forge-build.js");
	const root = await mkdtemp(join(tmpdir(), "spm-"));
	const resolvedPath = join(root, "Package.resolved");
	const derivedData = join(root, "derived");
	await mkdir(join(derivedData, "SourcePackages"), { recursive: true });
	await writeFile(resolvedPath, JSON.stringify({ pins: [
		{ identity: "networkinterceptor", state: { revision: "0bfd92e" } },
		{ identity: "blibli-utility", state: { revision: "aaaaaaa" } },
	] }));
	const state = (revision) => JSON.stringify({ object: { dependencies: [
		{ packageRef: { identity: "networkinterceptor" }, state: { checkoutState: { revision } } },
		{ packageRef: { identity: "blibli-utility" }, state: { checkoutState: { revision: "aaaaaaa" } } },
	] } });
	await writeFile(join(derivedData, "SourcePackages", "workspace-state.json"), state("280a4e1"));
	assert.deepEqual(await stalePackageCheckouts({ resolvedPath, derivedData }), [{ identity: "networkinterceptor", checkedOut: "280a4e1", wanted: "0bfd92e" }]);
	await writeFile(join(derivedData, "SourcePackages", "workspace-state.json"), state("0bfd92e"));
	assert.deepEqual(await stalePackageCheckouts({ resolvedPath, derivedData }), []);
	// Never built: nothing cached, nothing stale.
	assert.deepEqual(await stalePackageCheckouts({ resolvedPath, derivedData: join(root, "none") }), []);
});
