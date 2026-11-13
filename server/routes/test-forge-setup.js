// QA setup routes — the QA simulator (D-053), building the QA copy (P2, D-054) and disk cleanup.
// Every action that changes the machine is a POST the page only sends after a confirm.
import { currentManifest, freeDiskSpace, localDrift, TEST_FORGE_HOME, testForgeUsage } from "../lib/test-forge-copy.js";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
import { buildTestForgeCopy, buildStatus, harnessEnvFor, installedMatchesBuild, latestBuild, profileFor, saveProfile } from "../lib/test-forge-build.js";
import { bootTestForgeSimulator, createTestForgeSimulator, findTestForgeSimulator, shutDownOthers, simulatorState } from "../lib/test-forge-simulator.js";
import { appendLine, createJob, finishJob } from "../lib/jobs.js";
import { formatMb, performReset, RESET_IDS, resetPlan } from "../lib/reset.js";
import { detectLocalEnv, diffLocalEnv, readLocalEnv, realDeps, writeLocalEnv } from "../lib/claude-local-env.js";

/** `.claude/settings.local.json` (and its committed `.example` baseline) in the QA project. */
function localSettingsPaths() {
	const claudeDir = join(process.env.TEST_FORGE_PROJECT_DIR || process.cwd(), ".claude");
	return { path: join(claudeDir, "settings.local.json"), examplePath: join(claudeDir, "settings.local.json.example") };
}

/** For the readiness check (D-156): detected vs. what `.claude/settings.local.json` already has. */
export async function claudeEnvCheck() {
	const { path } = localSettingsPaths();
	const expected = await detectLocalEnv({ projectDir: process.env.TEST_FORGE_PROJECT_DIR, mediaRoot: process.env.TEST_FORGE_MEDIA_ROOT, uitestTarget: process.env.TEST_FORGE_UITEST_TARGET });
	const actual = await readLocalEnv(path, realDeps());
	const missing = diffLocalEnv(expected, actual);
	if (!missing.length) return { ok: true, detail: "settings.local.json matches this Mac" };
	const reason = !expected.TEST_FORGE_DEVICE_UDID ? "waits for the QA simulator" : `${missing.join(", ")} not set for this Mac`;
	return { ok: false, detail: `${reason} — only matters for Claude's own NetworkLens/test-forge-driver tools used directly, not Run/Replay here` };
}

let activeTestForgeBuild = null;
let activeSimJob = null;
let activeReset = null;
/** "Test the installed app anyway" — held for one code id only, so new code clears it. */
let buildOverride = null;

export const isTestForgeBuilding = () => activeTestForgeBuild?.status === "running";

/** For the readiness check: the prepared code's build state, plus any reasoned override. */
export async function testForgeBuildState() {
	const manifest = await currentManifest();
	if (!manifest) return { state: "no-code" };
	const status = await buildStatus(manifest);
	const override = buildOverride?.codeId === manifest.snapshotId ? buildOverride : null;
	return { ...status, codeId: manifest.snapshotId, override };
}

/** harness.py env: the current QA-copy build when it matches the code, and always the QA simulator. */
export async function testForgeHarnessTarget() {
	const qa = await findTestForgeSimulator().catch(() => null);
	const base = qa ? { TEST_FORGE_SIMULATOR_UDID: qa.udid } : {};
	const manifest = await currentManifest();
	if (!manifest) return base;
	const status = await buildStatus(manifest).catch(() => ({ state: "none" }));
	// A stale build is still what's installed; with an override the harness runs it, stamped unverified.
	// The build runs on whichever simulator is the test device now (D-120), not only the one it was built against.
	return status.build && status.state !== "none" ? { ...harnessEnvFor(status.build), ...base } : base;
}

const appVersions = new Map();

/** The built app's marketing version and build number (`CFBundleShortVersionString`, `CFBundleVersion`), per build. */
async function appVersionOf(build) {
	if (!build?.derivedData) return {};
	if (appVersions.has(build.id)) return appVersions.get(build.id);
	const products = join(build.derivedData, "Build", "Products", `${build.configuration}-iphonesimulator`);
	const { stdout } = await run("find", [products, "-maxdepth", "1", "-name", "*.app", "-not", "-name", "*-Runner.app"], { timeout: 10_000 }).catch(() => ({ stdout: "" }));
	const app = stdout.split("\n").find(Boolean);
	const read = async (key) => (app ? (await run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(app, "Info.plist")], { timeout: 10_000 })).stdout.trim() : null);
	const version = { appVersion: await read("CFBundleShortVersionString").catch(() => null), buildNumber: await read("CFBundleVersion").catch(() => null) };
	appVersions.set(build.id, version);
	return version;
}

/** What a run record carries about the code and build it tested (workflow-plan §2 manifest; F1 adds commit + build number). */
export async function buildStamp() {
	const manifest = await currentManifest();
	if (!manifest) return { linked: false };
	const state = await testForgeBuildState();
	return {
		linked: true,
		source: manifest.source,
		branch: manifest.branch,
		codeId: manifest.snapshotId,
		hasLocalChanges: Boolean(manifest.hasLocalChanges),
		buildId: state.build?.id,
		builtFrom: state.build?.codeId,
		sha: state.build?.sha ?? null,
		buildInputId: state.build?.buildInputId ?? null,
		...(await appVersionOf(state.build)),
		isUnverified: state.state !== "current",
		overrideReason: state.override?.reason,
	};
}

// --- P3 checklist inputs (D-055) ---

export async function testForgeCodeState() {
	const manifest = await currentManifest();
	return { manifest, drift: manifest ? await localDrift(manifest).catch(() => null) : null };
}

export async function testForgeInstalledMatch(bundleId) {
	const state = await testForgeBuildState();
	return state.state === "current" ? installedMatchesBuild(state.build, bundleId, (await findTestForgeSimulator().catch(() => null))?.udid) : { applies: false };
}

/** Free space on the volume holding ~/.test-forge (DerivedData and QA copies live there). */
export async function testForgeFreeGb() {
	const { stdout } = await run("df", ["-k", TEST_FORGE_HOME.replace(/\/\.test-forge.*$/, "") || "/"], { timeout: 10_000 });
	const columns = stdout.trim().split("\n").at(-1).split(/\s+/);
	return Number(columns[3]) / 1024 / 1024;
}

function simJob(res, kind, action) {
	if (activeSimJob?.status === "running") return res.status(409).json({ error: "a simulator action is already running", jobId: activeSimJob.id });
	const job = createJob({ kind });
	activeSimJob = job;
	action((line) => appendLine(job, line))
		.then((verdict) => finishJob(job, { status: "done", verdict }))
		.catch((error) => {
			appendLine(job, `! ${error.message}`);
			finishJob(job, { status: "error", verdict: error.message });
		});
	res.json({ ok: true, jobId: job.id });
}

export function registerTestForgeSetupRoutes(app, { readiness, isTestInFlight, harnessStop, deviceLock, resetStores }) {
	const refuseWhileBusy = (res) => {
		const busy = isTestInFlight();
		if (busy) {
			res.status(409).json({ error: `“${busy.title}” is running — wait for it to finish.` });
			return true;
		}
		if (isTestForgeBuilding()) {
			res.status(409).json({ error: "a build is running — wait for it to finish." });
			return true;
		}
		if (activeReset?.status === "running") {
			res.status(409).json({ error: "a reset is running — wait for it to finish." });
			return true;
		}
		return false;
	};

	// --- QA simulator ---
	app.get("/api/test-forge-sim", async (_req, res) => {
		try {
			res.json(await simulatorState());
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	});
	app.post("/api/test-forge-sim/create", (_req, res) => {
		if (refuseWhileBusy(res)) return;
		simJob(res, "test-forge-sim", async (say) => {
			await harnessStop();
			const qa = await createTestForgeSimulator({ onLine: say });
			readiness.invalidate();
			return qa.name;
		});
	});
	app.post("/api/test-forge-sim/boot", (_req, res) => {
		simJob(res, "test-forge-sim", async (say) => {
			const qa = await bootTestForgeSimulator();
			say(`✓ ${qa.name} booted`);
			readiness.invalidate();
			return qa.name;
		});
	});
	app.post("/api/test-forge-sim/solo", (_req, res) => {
		if (refuseWhileBusy(res)) return;
		simJob(res, "test-forge-sim", async (say) => {
			const names = await shutDownOthers();
			say(names.length ? `✓ shut down ${names.join(", ")}` : "✓ nothing else was booted");
			readiness.invalidate();
			return "QA simulator alone";
		});
	});

	// --- Build the QA copy (P2) ---
	app.get("/api/build/status", async (_req, res) => {
		const manifest = await currentManifest();
		const profile = manifest ? await profileFor(manifest).catch((error) => ({ error: error.message })) : null;
		res.json({ manifest, profile, ...(await testForgeBuildState()), isBuilding: isTestForgeBuilding(), jobId: activeTestForgeBuild?.id ?? null, last: manifest ? await latestBuild(manifest) : null });
	});

	app.post("/api/build/profile", async (req, res) => {
		const manifest = await currentManifest();
		if (!manifest) return res.status(409).json({ error: "prepare the code first (Question 1)" });
		res.json({ profile: await saveProfile(manifest.repo, req.body ?? {}) });
	});

	/** Only from the page's confirmed button (hard constraint: never an implicit build-for-testing). */
	app.post("/api/build/qa", async (_req, res) => {
		if (isTestForgeBuilding()) return res.json({ ok: true, jobId: activeTestForgeBuild.id });
		if (refuseWhileBusy(res)) return;
		const manifest = await currentManifest();
		if (!manifest) return res.status(409).json({ error: "prepare the code first (Question 1)" });
		const qa = await findTestForgeSimulator();
		if (!qa || qa.state !== "Booted") return res.status(409).json({ error: "the QA simulator isn't booted — set it up first" });
		const job = createJob({ kind: "build", codeId: manifest.snapshotId });
		activeTestForgeBuild = job;
		// D-223: the build row turns to "running" now, not on the next poll.
		readiness.invalidate();
		const controller = new AbortController();
		job.onCancel = () => controller.abort();
		const say = (line) => appendLine(job, line);
		say(`▸ Build ${manifest.branch} @ ${manifest.snapshotId} for ${qa.name}`);
		// The runner's own xcodebuild uses the same DerivedData and package cache; building under it
		// raced SwiftPM's checkouts (D-066). Nothing runs on it now (refuseWhileBusy).
		harnessStop()
			.then(() => buildTestForgeCopy({ manifest, udid: qa.udid, onLine: say, signal: controller.signal }))
			.then(async (build) => {
				if (build.status === "succeeded") {
					say(`✓ Built ${build.codeId} in ${Math.round(build.durationMs / 1000)} s`);
					// The runner must restart from the new build; the next Ensure picks it up.
					await harnessStop();
					buildOverride = null;
					finishJob(job, { status: "done", verdict: "BUILT" });
				} else {
					say(`! ${build.firstError}`);
					finishJob(job, { status: "error", verdict: "BUILD FAILED" });
				}
			})
			.catch((error) => finishJob(job, { status: job.isCancelled ? "cancelled" : "error", verdict: error.message }))
			.finally(() => readiness.invalidate());
		res.json({ ok: true, jobId: job.id });
	});

	app.post("/api/build/override", async (req, res) => {
		const reason = String(req.body?.reason ?? "").trim();
		if (reason.length < 5) return res.status(400).json({ error: "say why the installed app is good enough (at least a few words)" });
		const manifest = await currentManifest();
		if (!manifest) return res.status(409).json({ error: "nothing prepared to override" });
		buildOverride = { codeId: manifest.snapshotId, reason, at: new Date().toISOString() };
		readiness.invalidate();
		res.json({ ok: true, override: buildOverride });
	});
	app.delete("/api/build/override", (_req, res) => {
		buildOverride = null;
		readiness.invalidate();
		res.json({ ok: true });
	});

	// --- Reset for a fresh run (R4f, D-108) ---
	app.get("/api/reset/plan", async (_req, res) => {
		try {
			res.json({ items: await resetPlan({ stores: resetStores }), isRunning: activeReset?.status === "running", jobId: activeReset?.id ?? null });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	});
	/** Only from a confirmed button; ids outside the fixed list are refused, never treated as paths. */
	app.post("/api/reset", (req, res) => {
		const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
		const unknown = ids.filter((id) => !RESET_IDS.includes(id));
		if (!ids.length || unknown.length) return res.status(400).json({ error: unknown.length ? `unknown items: ${unknown.join(", ")}` : "choose at least one item" });
		if (refuseWhileBusy(res)) return;
		const holder = deviceLock?.status().holder;
		if (holder) return res.status(409).json({ error: `${holder.label} holds the phone — stop it first.` });
		const job = createJob({ kind: "reset" });
		activeReset = job;
		const say = (line) => appendLine(job, line);
		performReset({ ids, stores: resetStores, harnessStop, say })
			.then(({ freedMb }) => finishJob(job, { status: "done", verdict: `${formatMb(freedMb)} freed` }))
			.catch((error) => {
				say(`! ${error.message}`);
				finishJob(job, { status: "error", verdict: error.message });
			})
			.finally(() => readiness.invalidate());
		res.json({ ok: true, jobId: job.id });
	});

	// --- Disk ---
	app.get("/api/code/usage", async (_req, res) => res.json(await testForgeUsage()));
	app.post("/api/code/free-space", async (req, res) => {
		if (refuseWhileBusy(res)) return;
		const result = await freeDiskSpace({ olderThanDays: Number(req.body?.olderThanDays ?? 14) });
		readiness.invalidate();
		res.json(result);
	});

	// --- Claude Code local env (D-156) ---
	// Fills in this Mac's `.claude/settings.local.json` `env` block so Claude's own NetworkLens/
	// test-forge-driver MCP tools, used directly in a Claude Code session, target the right project + QA
	// simulator. The page only sends this after showing the developer exactly what will be written
	// and why (same "confirm first" rule as every other action here).
	app.post("/api/claude-env/configure", async (_req, res) => {
		const expected = await detectLocalEnv({ projectDir: process.env.TEST_FORGE_PROJECT_DIR, mediaRoot: process.env.TEST_FORGE_MEDIA_ROOT, uitestTarget: process.env.TEST_FORGE_UITEST_TARGET });
		if (!expected.TEST_FORGE_DEVICE_UDID) return res.status(409).json({ error: "no QA simulator yet — fix “Test simulator ready” first" });
		const { path, examplePath } = localSettingsPaths();
		await writeLocalEnv(path, expected, { examplePath }, realDeps());
		readiness.invalidate();
		res.json({ ok: true, env: expected });
	});
}
