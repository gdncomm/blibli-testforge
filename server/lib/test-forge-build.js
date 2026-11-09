// P2 — Build the QA copy (workflow-plan §4 ③, D-054). `build-for-testing` runs inside the QA copy,
// into its own DerivedData under ~/.test-forge/derived/, for the QA simulator; every build is
// recorded as build id → code id (commit SHA or local snapshot id), so a run can tell whether the
// app it would test was built from the code that was prepared. Only ever started by a confirmed
// click (hard constraint): nothing here builds on its own.
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { TEST_FORGE_HOME } from "./test-forge-copy.js";
import { findTestBundle } from "./readiness.js";

const run = promisify(execFile);
const BUILDS_PATH = join(TEST_FORGE_HOME, "builds.json");
const PROFILES_PATH = join(TEST_FORGE_HOME, "profiles.json");
const KEEP_BUILDS = 50;

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return fallback;
	}
}

async function writeJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.tmp-${process.pid}`;
	await writeFile(temporary, JSON.stringify(value, null, 2));
	await rename(temporary, path);
}

// --- Repo profile -------------------------------------------------------------------

/** The folder holding the `.xcworkspace`, searched two levels deep (Pods' workspaces skipped). */
async function findWorkspace(root, depth = 2) {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
	const workspace = entries.find((entry) => entry.name.endsWith(".xcworkspace") && entry.name !== "project.xcworkspace");
	if (workspace) return { projectDir: root, workspace: workspace.name };
	if (depth === 0) return null;
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith(".") || ["Pods", "Carthage", "node_modules", "build"].includes(entry.name)) continue;
		const found = await findWorkspace(join(root, entry.name), depth - 1);
		if (found) return found;
	}
	return null;
}

/**
 * Scheme / configuration / UI test target for a repo — auto-detected once from the dashboard's own
 * settings (the ones the developer harness already uses), editable later through `saveProfile`.
 */
export async function profileFor(manifest) {
	const profiles = await readJson(PROFILES_PATH, {});
	const saved = profiles[manifest.repo] ?? {};
	const found = await findWorkspace(manifest.path);
	if (!found) throw new Error(`no .xcworkspace in the QA copy at ${manifest.path}`);
	return {
		scheme: process.env.TEST_FORGE_SCHEME || "BlibliMobile-iOS-PerfTest",
		configuration: process.env.TEST_FORGE_CONFIGURATION || "PerformanceTest",
		runnerTarget: process.env.TEST_FORGE_UITEST_TARGET || null,
		...saved,
		projectDir: found.projectDir,
		workspace: found.workspace,
		projectSubdir: relative(manifest.path, found.projectDir),
	};
}

export async function saveProfile(repo, { scheme, configuration, runnerTarget }) {
	const profiles = await readJson(PROFILES_PATH, {});
	profiles[repo] = { ...profiles[repo], ...(scheme && { scheme }), ...(configuration && { configuration }), ...(runnerTarget && { runnerTarget }) };
	await writeJson(PROFILES_PATH, profiles);
	return profiles[repo];
}

export const derivedDataFor = (manifest) => join(TEST_FORGE_HOME, "derived", basename(manifest.path));

// --- Build records ------------------------------------------------------------------

export async function listBuilds() {
	return readJson(BUILDS_PATH, []);
}

async function recordBuild(build) {
	const builds = (await listBuilds()).filter((entry) => entry.id !== build.id);
	builds.push(build);
	await writeJson(BUILDS_PATH, builds.slice(-KEEP_BUILDS));
}

/** The newest successful build of this QA copy, if any. */
export async function latestBuild(manifest) {
	const builds = await listBuilds();
	return builds.filter((build) => build.copyPath === manifest.path && build.status === "succeeded").at(-1) ?? null;
}

/**
 * `current` — built from exactly the prepared code; `stale` — a build exists, from other code;
 * `none` — never built (or its output was removed).
 */
export async function buildStatus(manifest) {
	if (!manifest) return { state: "no-code" };
	const build = await latestBuild(manifest);
	if (!build) return { state: "none" };
	const profile = await profileFor(manifest).catch(() => null);
	const bundle = profile && (await findTestBundle({ projectDir: profile.projectDir, configuration: build.configuration, runnerTarget: profile.runnerTarget, derivedDataPath: build.derivedData }));
	if (!bundle) return { state: "none", build, reason: "the build output is gone" };
	// Current when built from this snapshot, or from one that differs only outside the app (D-069).
	const isSameInputs = Boolean(build.buildInputId) && build.buildInputId === manifest.buildInputId;
	return { state: build.codeId === manifest.snapshotId || isSameInputs ? "current" : "stale", build };
}

// --- Build --------------------------------------------------------------------------

/** First line a person should read, from xcodebuild's output. */
export function firstProblem(lines) {
	const patterns = [
		/error: .*/i,
		/Signing for .* requires/i,
		/(Unable to|Could not) resolve package/i,
		/No such module/i,
		/The sandbox is not in sync with the Podfile.lock/i,
	];
	// Noise that merely contains "error:" — it never explains a failure.
	const isNoise = (entry) => /skipping cache due to an error/i.test(entry);
	for (const pattern of patterns) {
		const line = lines.find((entry) => pattern.test(entry) && !isNoise(entry));
		if (line) return line.trim().slice(0, 300);
	}
	return null;
}

export function buildArgs(profile, { udid, derivedData }) {
	return [
		"build-for-testing",
		"-workspace", profile.workspace,
		"-scheme", profile.scheme,
		"-configuration", profile.configuration,
		"-destination", `platform=iOS Simulator,id=${udid},arch=arm64`,
		"-derivedDataPath", derivedData,
		// Xcode's GUI "Trust & Enable" for package plug-ins/macros doesn't apply to xcodebuild.
		"-skipPackagePluginValidation",
		"-skipMacroValidation",
	];
}

/**
 * Packages whose cached checkout (DerivedData `SourcePackages/workspace-state.json`) is on another
 * revision than the workspace's `Package.resolved` pins. Seen after a re-pin (D-066): xcodebuild kept
 * the old checkout, wrote its revision back into `Package.resolved`, and the build failed on files the
 * new revision added.
 */
export async function stalePackageCheckouts({ resolvedPath, derivedData }) {
	const resolved = await readJson(resolvedPath, null);
	const state = await readJson(join(derivedData, "SourcePackages", "workspace-state.json"), null);
	if (!resolved || !state) return [];
	const pinned = new Map((resolved.pins ?? resolved.object?.pins ?? []).map((pin) => [String(pin.identity ?? pin.package).toLowerCase(), pin.state?.revision]));
	const stale = [];
	for (const dependency of state.object?.dependencies ?? []) {
		const identity = String(dependency.packageRef?.identity ?? "").toLowerCase();
		const checkedOut = dependency.state?.checkoutState?.revision;
		const wanted = pinned.get(identity);
		if (checkedOut && wanted && checkedOut !== wanted) stale.push({ identity, checkedOut, wanted });
	}
	return stale;
}

/** Deletes part of the package cache. SwiftPM leaves checkouts read-only, so a plain rm stops half way. */
async function removePackageCache(derivedData, names) {
	for (const name of names) {
		const path = join(derivedData, "SourcePackages", name);
		if (!existsSync(path)) continue;
		await run("chmod", ["-R", "u+w", path]).catch(() => {});
		await rm(path, { recursive: true, force: true });
	}
}

/** Drops the package checkouts (not the fetched repositories) so xcodebuild checks out what is pinned. */
async function resetStalePackages(profile, derivedData, onLine) {
	const resolvedPath = join(profile.projectDir, profile.workspace, "xcshareddata", "swiftpm", "Package.resolved");
	const stale = await stalePackageCheckouts({ resolvedPath, derivedData });
	if (stale.length === 0) return;
	for (const { identity, checkedOut, wanted } of stale) onLine(`↻ ${identity}: cached checkout ${checkedOut.slice(0, 7)}, pinned ${wanted.slice(0, 7)} — checking it out again`);
	await removePackageCache(derivedData, ["checkouts", "workspace-state.json"]);
}

/** One xcodebuild run; `exitCode` is null when cancelled. */
async function runXcodebuild(profile, args, onLine, signal) {
	onLine(`$ xcodebuild ${args.join(" ")}`);
	onLine(`  in ${profile.projectDir}`);
	const tail = [];
	// Error lines are kept apart from the tail: xcodebuild prints hundreds of lines after the first one.
	const problems = [];
	let followLines = 0;
	const exitCode = await new Promise((resolve, reject) => {
		const child = spawn("xcodebuild", args, { cwd: profile.projectDir, env: process.env });
		const abort = () => child.kill("SIGTERM");
		signal?.addEventListener("abort", abort, { once: true });
		const isWorthShowing = (line) => /error|warning: .*fail|BUILD|TEST BUILD|\*\*|Resolve Package/i.test(line);
		const forward = (chunk) => {
			for (const line of String(chunk).split("\n").filter(Boolean)) {
				tail.push(line);
				if (tail.length > 400) tail.shift();
				// "Could not resolve package dependencies:" names the package on the lines after it.
				if (followLines > 0) {
					problems.push(`  ${line.trim()}`);
					followLines -= 1;
				} else if (problems.length < 50 && firstProblem([line])) {
					problems.push(line);
					if (/Could not resolve package dependencies/i.test(line)) followLines = 3;
				}
				if (isWorthShowing(line)) onLine(line);
			}
		};
		child.stdout.on("data", forward);
		child.stderr.on("data", forward);
		child.on("error", reject);
		child.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			resolve(signal?.aborted ? null : code);
		});
	});
	return { exitCode, problems, tail };
}

/** Builds the QA copy; resolves with the build record (succeeded or failed), rejects only on cancel. */
export async function buildTestForgeCopy({ manifest, udid, onLine = () => {}, signal }) {
	const profile = await profileFor(manifest);
	const derivedData = derivedDataFor(manifest);
	await resetStalePackages(profile, derivedData, onLine);
	const args = buildArgs(profile, { udid, derivedData });
	const build = {
		id: randomUUID(),
		codeId: manifest.snapshotId,
		buildInputId: manifest.buildInputId ?? null,
		source: manifest.source,
		branch: manifest.branch,
		sha: manifest.sha,
		hasLocalChanges: Boolean(manifest.hasLocalChanges),
		copyPath: manifest.path,
		projectDir: profile.projectDir,
		scheme: profile.scheme,
		configuration: profile.configuration,
		derivedData,
		simulatorUdid: udid,
		startedAt: new Date().toISOString(),
		status: "running",
	};
	let { exitCode, problems, tail } = await runXcodebuild(profile, args, onLine, signal);
	// A run interrupted while SwiftPM was checking out or downloading leaves a half-written package
	// cache ("HEAD.lock", "failed extracting …zip", "fatalError", a plug-in's artifact bundle without
	// its info.json) that fails every later build (D-066).
	// The cache is regenerable: drop it once and try again.
	const isPackageCacheBroken = (lines) => lines.some((line) => /Could not resolve package dependencies|ArtifactsArchive info\.json not found/i.test(line));
	if (exitCode !== 0 && exitCode !== null && (isPackageCacheBroken(problems) || isPackageCacheBroken(tail))) {
		onLine("↻ the Swift package cache looks broken — clearing it and building once more");
		await removePackageCache(derivedData, ["checkouts", "artifacts", "workspace-state.json"]);
		({ exitCode, problems, tail } = await runXcodebuild(profile, args, onLine, signal));
	}
	if (exitCode === null) throw new Error("cancelled");
	Object.assign(build, {
		status: exitCode === 0 ? "succeeded" : "failed",
		endedAt: new Date().toISOString(),
		durationMs: Date.now() - Date.parse(build.startedAt),
		firstError: exitCode === 0 ? undefined : firstProblem(problems) ?? firstProblem(tail) ?? `xcodebuild exited ${exitCode}`,
		errors: exitCode === 0 ? undefined : [...new Set(problems)].slice(0, 10),
	});
	await recordBuild(build);
	return build;
}

/** Env for harness.py so the runner starts from this build on the QA simulator. */
export function harnessEnvFor(build) {
	return {
		TEST_FORGE_PROJECT_DIR: build.projectDir,
		TEST_FORGE_DERIVED_DATA: build.derivedData,
		TEST_FORGE_SCHEME: build.scheme,
		TEST_FORGE_CONFIGURATION: build.configuration,
		TEST_FORGE_SIMULATOR_UDID: build.simulatorUdid,
	};
}

export const hasBuildOutput = (build) => existsSync(join(build.derivedData, "Build", "Products"));

async function executableUuids(appPath) {
	const { stdout: name } = await run("plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", join(appPath, "Info.plist")], { timeout: 10_000 });
	const { stdout } = await run("dwarfdump", ["--uuid", join(appPath, name.trim())], { timeout: 20_000 });
	return new Set([...stdout.matchAll(/UUID: ([0-9A-F-]{36})/gi)].map((match) => match[1].toUpperCase()));
}

/**
 * Is the app on the QA simulator the one `build` produced? Compares the executables' Mach-O UUIDs —
 * a harness started before the build keeps serving the previous app until it restarts.
 */
export async function installedMatchesBuild(build, bundleId, udid = build?.simulatorUdid) {
	if (!build) return { applies: false };
	const products = join(build.derivedData, "Build", "Products", `${build.configuration}-iphonesimulator`);
	const builtApp = (await readdir(products).catch(() => [])).find((file) => file.endsWith(".app") && !file.endsWith("-Runner.app"));
	if (!builtApp) return { applies: false };
	const { stdout } = await run("xcrun", ["simctl", "get_app_container", udid, bundleId, "app"], { timeout: 15_000 });
	const [installed, built] = await Promise.all([executableUuids(stdout.trim()), executableUuids(join(products, builtApp))]);
	const isSame = [...built].some((uuid) => installed.has(uuid));
	return { applies: true, ok: isSame, detail: isSame ? `matches build ${build.codeId}` : `the installed app isn't from build ${build.codeId} — restart the harness to install it` };
}
