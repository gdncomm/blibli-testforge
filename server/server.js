// QA Mocker dashboard — the local QA server behind the TestForge Mac app, over the same NetworkLens
// session.json file the api-mock skill and MCP server already drive. Nothing
// here talks to the network; it only reads/writes the booted simulator's
// session file and tails its trace, same as the skill does by hand.
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { exportRules, loadPackRules, resolveRule } from "./lib/mock-pack.js";
import { applyStepEdits, editableFields } from "./lib/step-edits.js";
import { macroInputs, mockResponse } from "./lib/macro-inputs.js";
import { affectedCases, diffCommands } from "./lib/verify-plan.js";
import { parseDevicectl } from "./lib/physical-devices.js";
import { changedFiles, learnPrompt, parseLearnedMacroId, parseTriage, snapshotMacroFiles, triagePrompt } from "./lib/agent-turns.js";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

import { bootedAppContainer, isAppRunning } from "./lib/container.js";
import {
	blockedByRunningApp,
	RELAUNCH_NOTE,
	readSession,
	resolveSessionPath,
	sameRule,
	writeSession,
} from "./lib/session.js";
import { ruleFor, standardSet } from "./lib/variants.js";
import { Trace, decodeBody, durationMs, preview, statusOf } from "./lib/trace.js";
import { resolveEndpoint } from "./lib/endpoint.js";
import { isSidecarUp, LIVE_NOTE, liveEdit } from "./lib/control.js";
import { checkInterceptor, mockServedSince } from "./lib/lens-check.js";
import { postCommand } from "./lib/driver-queue.js";
import { createCheckMemo, findTestBundle, readinessGate } from "./lib/readiness.js";
import { simulatorState } from "./lib/test-forge-simulator.js";
import { buildStamp, claudeEnvCheck, isTestForgeBuilding, testForgeBuildState, testForgeCodeState, testForgeHarnessTarget, testForgeInstalledMatch, registerTestForgeSetupRoutes, testForgeFreeGb } from "./routes/test-forge-setup.js";
import { liveState, sendCommand as sendLensCommand } from "./lib/control.js";
import { resolvePluginScript } from "./lib/plugin-paths.js";
import { TestBatchStore, batchCases } from "./lib/test-batches.js";
import { clearRunnerScreenshots } from "./lib/reset.js";
import { startVideo, trimToLast } from "./lib/video-recorder.js";
import { planVideo, videoGuidance, videoWindow } from "./lib/video-plan.js";
import { batchReport, registerTestBatchRoutes } from "./routes/test-batches.js";
import { harnessEnsure, harnessLogs, harnessStatus, harnessStop, setHarnessTarget } from "./lib/harness.js";
import { confluencePageId, hasConfluenceCredentials, loadTestCases, parseConfluencePage } from "./lib/testcases.js";
import { listMacros, replayMacro } from "./lib/macro.js";
import { anchorSummary, caseLinks, defaultHost, describeStep, findMacroV2, flattenSteps, launchInputState, lintMacros, listMacrosV2, loadRegistry, macroMap, saveMacroInPlace, saveMacroV2, saveRegistry, uiTestRoot, noteAppLaunched, noteLaunchInput, replayMacroV2 } from "./lib/macro-v2.js";
import { retimeBody } from "./lib/retime.js";
import { RunBatch, planItems } from "./lib/run-batch.js";
import { findCrash } from "./lib/crash-report.js";
import { ResultsStore, branchHistory, buildReport, compareRuns, defaultBaseRun, finalVerdict, isProbeShot, rerunCandidates, reviewState } from "./lib/results.js";
import { SetupStore, needsPrepare } from "./lib/setups.js";
import { currentManifest, localDrift } from "./lib/test-forge-copy.js";
import { findTestForgeSimulator, listDevices } from "./lib/test-forge-simulator.js";
import { chooseTestDevice, chosenTestDeviceUdid, configureTestDevice, deviceArg } from "./lib/test-device.js";
import { parkLensBubble } from "./lib/lens-bubble.js";
import { queue as controlQueue } from "./lib/control-queue.js";
import { pollHealth } from "./lib/lens-pollers.js";
import { registerLensRoutes } from "./routes/lens.js";
import { HOME_LOGIN_ELEMENT, ROUTINES, START_SCREENS, readAppDefault, readEnvironment, resolvePreconditions, usesMocks } from "./lib/preconditions.js";
import { loadCaseRules, requirementsFor } from "./lib/case-requirements.js";
import { prompts } from "./lib/prompts.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { claudeAccount, sessionProjectDir, testingTarget } from "./lib/claude-identity.js";

const run = promisify(execFile);
import { driverHost } from "./lib/driver-host.js";
import { activeJobs, appendLine, cancelJob, createJob, finishJob, getJob, jobEvents } from "./lib/jobs.js";
import { narrator } from "./lib/narration.js";
import { usageFeed } from "./lib/usage.js";
import { replayProblem, UNCONFIRMED } from "./lib/replay-status.js";
import { installTap } from "./lib/usage-tap.js";
import { listCliSessions } from "./lib/claude-cli-sessions.js";
import { RemoteControl } from "./lib/remote-control.js";
import { appendRun as appendRunRecord, clearRuns, listRuns } from "./lib/history.js";
import { runClaude } from "./lib/claude-runner.js";
import { registerBundleRoutes } from "./routes/bundles.js";
import { variantsServed, variantsArmedBy } from "./lib/mock-variants.js";
import { LANGUAGES as DEMO_LANGUAGES, createDemoRecorder, loadMockNotes } from "./lib/demo.js";
import { buildSession, listDemoRecordings, sessionFileName, writeSessionExport } from "./lib/session-export.js";
import { sessionConfluenceHtml, sessionMarkdown, sessionReportTitle } from "./lib/session-report.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { SessionManager } from "./lib/sessions.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerDeviceRoutes } from "./routes/device.js";
import { registerDeeplinkRoutes } from "./routes/deeplinks.js";
import { MODEL_LABELS, describePick, followUpModel, pickModel, watchForEscalation } from "./lib/model-pick.js";
import { DeeplinkStore } from "./lib/deeplinks.js";
import { registerCodeRoutes } from "./routes/code.js";
import { captureFrame, deviceScreen, noteDeviceInfo, screenshotAttachment } from "./lib/device.js";
import { createStepFrames, frameOf } from "./lib/step-frames.js";
import { TaskQueue } from "./lib/task-queue.js";
import { deviceLock } from "./lib/device-lock.js";
import { extractVerdict, formatEvent } from "./lib/claude-stream.js";
import { StateHub } from "./lib/state-hub.js";
import { buildLabel, createLoadedDocStore, testcaseView } from "./lib/testcase-view.js";
import { StaleChecker } from "./lib/stale-cases.js";
import { checkPrerequisites } from "./lib/prerequisites.js";
import { jiraComment, ticketsFor } from "./lib/jira-links.js";
import { orderForFewerSwitches, planBatch } from "./lib/batch-plan.js";
import { staleReason } from "./lib/staleness.js";
import { caseProof, caseProofFiles } from "./lib/case-proof.js";
import { applyCaseEdits, createCaseEditStore, EDITABLE_FIELDS, mergeCaseEdit, mergeImportedCases, separateCarriedEdits } from "./lib/case-edits.js";
import { applyResultOverrides, createResultOverrideStore, overrideEntry, reviewerNotesText, separateCarriedOverrides } from "./lib/result-overrides.js";
import { buildRecordedMacro, freeMacroName, recordedMacros } from "./lib/recorded-macro.js";
import { jobView, withBatchPhases, withTaskPhase } from "./lib/lifecycle.js";
import { registerStateRoutes } from "./routes/state.js";
import { registerScanRoutes } from "./routes/scan.js";
import { ScanSession } from "./lib/scan-session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_ID = process.env.NETWORKLENS_BUNDLE_ID || process.env.TEST_FORGE_BUNDLE_ID || "com.blibli.mobile";
process.env.NETWORKLENS_BUNDLE_ID ??= BUNDLE_ID;
const PORT = Number(process.env.TEST_FORGE_SERVER_PORT || 4545);

const app = express();
app.use(express.json({ limit: "5mb" }));
// One live state for every page (D-077); slices are defined at the end of this file.
const stateHub = new StateHub();
registerStateRoutes(app, { hub: stateHub });
// D-199: no web UI any more; the TestForge Mac app, test-forge and Claude Code are the clients.

const DATA_DIR = join(__dirname, ".data");
configureTestDevice({ file: join(DATA_DIR, "test-device.json") });
// Pin NetworkLens to the test simulator before anything reads a trace: until the first readiness check resolved it,
// a second booted simulator with the app (the developer's own) could be guessed instead.
await findTestForgeSimulator().catch(() => null);

// --- D-127: this server owns the NetworkLens control queue (port 8788) -------------------------------
// One owner, not a race: Claude sessions it starts point their MCP at it (NETWORKLENS_SIDECAR). The app polls every 2 s;
// the last poll tells the console whether a change will be live or only applied on the next launch.
const ownsControlQueue = await controlQueue.listen();
const LENS_POLL_FRESH_MS = 5_000;
const DEFAULT_PROJECT_DIR = resolvePath(process.env.TEST_FORGE_PROJECT_DIR || process.cwd());
const sessions = new SessionManager(DATA_DIR);
await sessions.restore();
registerSessionRoutes(app, { sessions, defaultProjectDir: DEFAULT_PROJECT_DIR, resolveProjectDir: () => sessionProjectDir(DEFAULT_PROJECT_DIR), captureScreenshot: screenshotAttachment });
// D-149: CLI usage in the Mac status bar — poll the tap, and let the app add it to the status-line script (it asks first).
usageFeed.watchTap();
// D-150: Remote Control — QA from the Claude mobile app (Code → session) or claude.ai/code, run on this Mac.
const remoteControl = new RemoteControl({ projectDir: DEFAULT_PROJECT_DIR, dataDir: DATA_DIR });
await remoteControl.adopt();
app.get("/api/remote-control", (_req, res) => res.json(remoteControl.view()));
app.post("/api/remote-control/start", async (req, res) => {
	const spawnMode = req.body?.spawnMode === "worktree" ? "worktree" : "same-dir";
	res.json(await remoteControl.start({ spawnMode }));
});
app.post("/api/remote-control/stop", async (_req, res) => res.json(await remoteControl.stop()));
app.post("/api/usage/tap", async (_req, res) => {
	try {
		res.json(await installTap());
	} catch (error) {
		res.status(409).json({ error: error.message });
	}
});

app.get("/api/identity", async (req, res) => {
	const [account, target] = await Promise.all([claudeAccount({ refresh: req.query.refresh === "1" }), testingTarget()]);
	res.json({ account, target, sessionDir: await sessionProjectDir(DEFAULT_PROJECT_DIR) });
});
registerProjectRoutes(app);
/** Every run record carries the code + build it tested, so a verdict is traceable (workflow-plan §2). */
async function appendRun(entry) {
	const build = await buildStamp().catch(() => ({ linked: false }));
	return appendRunRecord({ ...entry, build, ...(build.linked && build.isUnverified && { stamp: "UNVERIFIED BUILD" }) });
}

// F1 (D-188): which app files changed between the build a result ran on and the build under test.
const staleChecker = new StaleChecker(join(DATA_DIR, "code-snapshots.json"), {
	diffNames: async (fromSha, toSha) => {
		const manifest = await currentManifest();
		const { stdout } = await run("git", ["-C", manifest?.repo ?? manifest?.path, "diff", "--name-only", fromSha, toSha], { timeout: 30_000 });
		return stdout.split("\n").filter(Boolean);
	},
});

/** The build under test, and a `staleFor(run, covers)` for the Tests slice. */
async function stalenessNow(runs) {
	const current = await buildStamp().catch(() => ({ linked: false }));
	await staleChecker.remember(current, await currentManifest().catch(() => null)).catch(() => {});
	const changedByCode = new Map();
	for (const codeId of new Set(runs.map((entry) => entry.build?.builtFrom).filter(Boolean))) {
		changedByCode.set(codeId, codeId === current.builtFrom ? [] : await staleChecker.changed(codeId, current.builtFrom));
	}
	const staleFor = (entry, covers) => staleReason({ runBuild: entry.build, currentBuild: current, changed: changedByCode.get(entry.build?.builtFrom) ?? null, covers });
	return { current, staleFor };
}

const tasks = new TaskQueue(DATA_DIR, { generalConcurrency: Number(process.env.TEST_FORGE_GENERAL_CONCURRENCY || 3) });
await tasks.restore();
const results = new ResultsStore(DATA_DIR);
const setups = new SetupStore(DATA_DIR);
await results.restore();
const testBatches = await new TestBatchStore(DATA_DIR).restore();
// R4j: everything started while a Test Batch is active is collected in it (runs are attached where they start).
tasks.on("enqueued", (task) => testBatches.attach({ kind: task.kind, refId: task.id, title: task.title }));
// F2 (D-189): a batch's progress comes from outcomes copied onto its items, not from tasks the queue may since have dropped.
testBatches.runCases = (runId) => (results.get(runId)?.items ?? []).map((item) => ({ caseId: item.caseId, status: item.status, verdict: item.verdict }));
let macroCases = { at: 0, byMacro: new Map() };
async function caseOfMacro(macroId) {
	if (Date.now() - macroCases.at > 60_000) {
		const macros = await listMacrosV2().catch(() => []);
		macroCases = { at: Date.now(), byMacro: new Map(macros.map((macro) => [macro.id, caseLinks(macro)[0] ?? null])) };
	}
	return macroCases.byMacro.get(macroId) ?? null;
}
// D-214: the runner's own screenshots are emptied after each finished test, once nothing else is testing.
const sweptTaskIds = new Set();
let runnerSweepTimer = null;
function sweepRunnerScreenshotsWhenIdle() {
	clearTimeout(runnerSweepTimer);
	runnerSweepTimer = null;
	const isRunQueueBusy = activeBatch && !["done", "cancelled"].includes(activeBatch.status);
	if (testInFlight() || isRunQueueBusy || scanSession.isActive) {
		runnerSweepTimer = setTimeout(sweepRunnerScreenshotsWhenIdle, RUNNER_SWEEP_RETRY_MS);
		return;
	}
	clearRunnerScreenshots()
		.then((mb) => mb > 0 && console.log(`runner screenshots: ${mb} MB deleted after the run`))
		.catch((error) => console.log(`runner screenshots: not deleted (${error.message})`));
}
const RUNNER_SWEEP_DELAY_MS = 5_000;
const RUNNER_SWEEP_RETRY_MS = 60_000;

tasks.on("change", async (all) => {
	const updates = [];
	const finishedTests = (all ?? []).filter((task) => TEST_KINDS.has(task.kind) && ["done", "failed", "cancelled"].includes(task.status) && !sweptTaskIds.has(task.id));
	if (finishedTests.length) {
		for (const task of finishedTests) sweptTaskIds.add(task.id);
		if (!runnerSweepTimer) runnerSweepTimer = setTimeout(sweepRunnerScreenshotsWhenIdle, RUNNER_SWEEP_DELAY_MS);
	}
	for (const task of all ?? []) {
		if (!["done", "failed", "cancelled", "running"].includes(task.status)) continue;
		const caseId = task.payload?.caseId ?? (task.payload?.macroId ? await caseOfMacro(task.payload.macroId) : null);
		updates.push({ refId: task.id, status: task.status, verdict: task.verdict ?? null, caseId });
	}
	testBatches.settle(updates);
});
sessions.on("created", (session) => {
	// The Mac app's own Claude session (D-133) is a long-lived assistant, not test work — it belongs to no batch.
	if (!session.meta?.taskId && !session.meta?.testforge) testBatches.attach({ kind: "claude-chat", refId: session.id, title: session.title });
});
registerTaskRoutes(app, { tasks, deviceLock });
const stepFrames = createStepFrames({ fetchFrame: (identifier, timeout) => postCommand({ kind: "getFrame", identifier, timeout }, { timeoutMs: 6_000, recover: false }) });
registerDeviceRoutes(app, { deviceLock, driverHost, stepFrames, postCommand, captureFrame });
// D-157: the app's own route list (this repo's copy, not the QA clone's — it only builds links) + saved/recent links.
registerDeeplinkRoutes(app, {
	confirmOpen: async () => {
		const outcome = await postCommand({ kind: "alertTap", buttonTitle: "Open", timeout: 4 }, { timeoutMs: 10_000, recover: false });
		return Boolean(outcome?.value?.found ?? outcome?.found);
	},
	catalogFile: join(__dirname, "..", "..", "BlibliMobile-iOS", "BlibliMobile-iOS", "Common", "Deeplink", "DeeplinkList.txt"),
	store: new DeeplinkStore(join(DATA_DIR, "deeplinks.json")),
	appVersion: async () => (await buildStamp()).appVersion ?? null,
	deviceArg,
	deviceLock,
	refuseWhileTesting,
});
const { startPrepare } = registerCodeRoutes(app, {
	testForgeDir: __dirname,
	isCopyInUse: () => {
		const busy = testInFlight();
		if (busy) return `“${busy.title}” is running`;
		if (isTestForgeBuilding() || activeBuildJob?.status === "running") return "a build is running";
		return null;
	},
});
registerCredentialRoutes(app, { prompts });

// Hosting :8789 here lets a macro replay without a Claude session (D-040); an MCP that started first
// keeps it, and the dashboard takes over when that MCP exits.
await driverHost.start();
app.get("/api/driver/host", async (_req, res) => res.json(await driverHost.status()));

let trace = null;
let tracePath = null;

/**
 * D-079: the first trace record of `endpoint` ("GET /path", query ignored) made since `sinceMs`, or
 * null after `withinS`. Proves a screen state came from the answer a macro faked — the app asked.
 */
async function traceRequested(endpoint, { sinceMs, withinS = 10 }) {
	const [method, path] = endpoint.includes(" ") ? endpoint.split(" ") : [null, endpoint];
	const deadline = Date.now() + withinS * 1000;
	for (;;) {
		const reader = await currentTrace();
		const records = reader ? await reader.entries().catch(() => []) : [];
		const hit = records.find((record) => {
			const request = record.exchange?.request;
			if (!request || (method && request.method !== method)) return false;
			let pathname = request.url;
			try {
				pathname = new URL(request.url).pathname;
			} catch {
				// A relative URL is already a path.
			}
			// Trace times have second resolution.
			return pathname === path && Date.parse(record.recordedAt) >= sinceMs - 1000;
		});
		if (hit) return hit;
		if (Date.now() >= deadline) return null;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

async function currentTrace() {
	const container = await bootedAppContainer(BUNDLE_ID);
	const path = container
		? join(container, "Library", "Application Support", "NetworkLens", "trace.ndjson")
		: null;
	if (!path) return null;
	if (!trace || tracePath !== path) {
		trace = new Trace(path);
		tracePath = path;
	}
	return trace;
}

/**
 * Tries the running app first (no relaunch needed), falls back to the session file.
 *
 * `liveEdit` only succeeds when the app is up and polling the control queue; everything else
 * (app not running, queue not reachable yet) reads as `ok: false` and falls through to the file
 * write every route already knew how to do.
 */
const NETWORKLENS_OFF = "The app is running but NetworkLens isn't answering — it is probably switched off (an environment switch turns it off). "
	+ "Use “Turn NetworkLens on” on the Mocking tab (or a macro's setAppDefault NetworkLensEnabled step), then try again.";

async function applyEdit(edit, fallbackWrite) {
	const live = await liveEdit(edit);
	if (live.ok) return { live: true, note: LIVE_NOTE };
	const blocked = await blockedByRunningApp();
	// Running but not collecting the queued edit: in this app that means NetworkLens is switched
	// off (an environment switch wipes NetworkLensEnabled), not that the person must quit it.
	if (blocked && live.reachable === false && /no app collected/.test(live.error ?? "")) {
		return { live: false, blocked: NETWORKLENS_OFF };
	}
	if (blocked) return { live: false, blocked };
	await fallbackWrite();
	return { live: false, note: RELAUNCH_NOTE };
}

/**
 * The failure note (D-043, D-059): which mocks answered requests during this run, per the trace,
 * and whether the macro set them up itself. Falls back to "what is armed now" without a trace.
 */
async function interceptorNote(macro, runStartedAt) {
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, findMacroV2).catch(() => []);
	const touched = [...new Set(steps.filter((step) => step.do === "mock").map((step) => step.endpoint))];
	const reader = await currentTrace().catch(() => null);
	const served = reader ? await reader.entries().then((records) => mockServedSince(records, runStartedAt)).catch(() => null) : null;
	return checkInterceptor({ served, touched });
}

/** A screenshot taken from the host when the runner doesn't answer (D-064); lands with the run's evidence. */
async function hostScreenshot(name = "screenshot") {
	const root = process.env.TEST_FORGE_MEDIA_ROOT;
	if (!root) throw new Error("TEST_FORGE_MEDIA_ROOT is not set");
	const path = join(root, `${String(name).replace(/[^\w.-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
	await mkdir(root, { recursive: true });
	await run("xcrun", ["simctl", "io", deviceArg(), "screenshot", "--type=png", path], { timeout: 15_000 });
	return path;
}

/** A macro `mock` step: switch one existing rule to a variant (or off), live when the app is up. */
async function armMock({ endpoint, variant, enabled, retime = false }) {
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	// The device's rule when it has the variant, else the repo's mock pack (D-064): a reinstalled app
	// or another tester's simulator starts with none of them.
	const resolved = resolveRule(data.mocks, await loadPackRules(), endpoint, enabled ? variant : undefined);
	const rule = resolved.rule;
	if (!rule) throw new Error(`no mock rule for ${endpoint} on the device or in the repo's mock pack — add it on the Mocking tab, then “Save mocks to repo”`);
	if (resolved.missingVariant) throw new Error(`rule ${rule.endpointKey} has no variant “${variant}” on the device or in the repo's mock pack (has ${rule.variants.map((entry) => entry.name).join(", ")})`);
	if (resolved.imported) {
		const index = data.mocks.findIndex((entry) => entry.id === rule.id);
		if (index >= 0) data.mocks[index] = rule;
		else data.mocks.push(rule);
	}
	rule.isEnabled = enabled;
	if (enabled) {
		const chosen = rule.variants.find((entry) => entry.name === variant);
		if (!chosen) throw new Error(`rule ${rule.endpointKey} has no variant “${variant}” (has ${rule.variants.map((entry) => entry.name).join(", ")})`);
		rule.activeVariantID = chosen.id;
		data.isMockingEnabled = true;
		if (retime) {
			for (const step of chosen.steps ?? []) {
				const response = step.respond?._0;
				if (response?.body) response.body = retimeBody(Buffer.from(response.body, "base64")).body.toString("base64");
			}
		}
	}
	const write = () => writeSession(session.path, data);
	const result = await applyEdit({ rules: [rule], ...(enabled ? { isMockingEnabled: true } : {}) }, write);
	if (resolved.imported) result.importedFromPack = true;
	if (!result.blocked) return result;
	// Live control refused: quit the app so the file write sticks; the macro's next relaunch loads it.
	await run("xcrun", ["simctl", "terminate", deviceArg(), BUNDLE_ID]).catch(() => {});
	await write();
	return { live: false, note: "app quit; mock loads on the next relaunch" };
}

/** Turns NetworkLens on in the app (D-050): the setting only applies at launch, so the app is relaunched. */
app.post("/api/networklens/enable", async (_req, res) => {
	try {
		await defaultHost.setDefault(BUNDLE_ID, "NetworkLensEnabled", true);
		const relaunched = await postCommand({ kind: "relaunchApp" }, { timeoutMs: 45_000, recover: false }).catch(() => null);
		if (!relaunched || relaunched.error) {
			await run("xcrun", ["simctl", "terminate", deviceArg(), BUNDLE_ID]).catch(() => {});
			await run("xcrun", ["simctl", "launch", deviceArg(), BUNDLE_ID]);
		}
		noteLaunchInput("default:NetworkLensEnabled", true);
		noteAppLaunched();
		res.json({ ok: true, via: relaunched && !relaunched.error ? "harness" : "simctl" });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.get("/api/status", async (_req, res) => {
	const session = await resolveSessionPath();
	const running = await isAppRunning(BUNDLE_ID);
	const data = await readSession(session.path);
	const controlQueueUp = await isSidecarUp();
	res.json({
		bundleId: BUNDLE_ID,
		sessionPath: session.path,
		sessionHow: session.how,
		appRunning: running,
		controlQueueUp,
		isMockingEnabled: data.isMockingEnabled,
		ruleCount: data.mocks.length,
	});
});

app.get("/api/mocks", async (_req, res) => {
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	res.json({ mocks: data.mocks });
});

async function setMocking(enabled) {
	const result = await applyEdit({ isMockingEnabled: enabled }, async () => {
		const session = await resolveSessionPath();
		const data = await readSession(session.path);
		data.isMockingEnabled = enabled;
		await writeSession(session.path, data);
	});
	if (result.blocked) throw Object.assign(new Error(result.blocked), { status: 409 });
	return { ok: true, isMockingEnabled: enabled, live: result.live, note: result.note };
}

app.post("/api/mocking", (req, res) => {
	setMocking(Boolean(req.body.enabled)).then((value) => res.json(value), (error) => res.status(error.status ?? 500).json({ error: error.message }));
});

/** Create or refresh a quick mock: pastes a body, gets the standard
 *  loaded/empty/500/slow/timeout variant set, same shape the api-mock skill writes by hand. */
app.post("/api/mocks", async (req, res) => {
	const { method = "GET", endpoint, statusCode = 200, body } = req.body;
	if (!endpoint) return res.status(400).json({ error: "endpoint (URL or path) is required" });

	let parsedBody;
	try {
		parsedBody = Buffer.from(typeof body === "string" ? body : JSON.stringify(body ?? {}), "utf8");
	} catch {
		return res.status(400).json({ error: "body must be valid JSON or a string" });
	}
	upsertQuickMock({ method, endpoint, statusCode, body: parsedBody }).then((value) => res.json(value), (error) => res.status(error.status ?? 500).json({ error: error.message }));
});

/** A rule with the standard variant set (loaded = `body`, empty, 500, slow, timeout) — from a pasted body or a captured call. */
async function upsertQuickMock({ method, endpoint, statusCode, body: parsedBody }) {
	const { endpointKey, query } = resolveEndpoint(method, endpoint);
	const session = await resolveSessionPath();
	const data = await readSession(session.path);

	const variants = standardSet(parsedBody, statusCode);
	const candidate = ruleFor(endpointKey, variants);
	candidate.match.query = query;

	const existingIndex = data.mocks.findIndex((rule) => sameRule(rule, candidate));
	if (existingIndex >= 0) {
		// Keep the existing id/enabled state, reuses ids the way write_mock.py does.
		const existing = data.mocks[existingIndex];
		candidate.id = existing.id;
		candidate.isEnabled = existing.isEnabled;
	}

	const result = await applyEdit({ rules: [candidate] }, async () => {
		if (existingIndex >= 0) data.mocks[existingIndex] = candidate;
		else data.mocks.push(candidate);
		await writeSession(session.path, data);
	});
	if (result.blocked) throw Object.assign(new Error(result.blocked), { status: 409 });
	return { ok: true, rule: candidate, live: result.live, note: result.note };
}

app.post("/api/mocks/:id/activate", async (req, res) => {
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	const rule = data.mocks.find((entry) => entry.id === req.params.id);
	if (!rule) return res.status(404).json({ error: "no such rule" });
	const variant = rule.variants.find((entry) => entry.id === req.body.variantId);
	if (!variant) return res.status(404).json({ error: "no such variant" });
	rule.activeVariantID = variant.id;

	const result = await applyEdit({ rules: [rule] }, async () => {
		await writeSession(session.path, data);
	});
	if (result.blocked) return res.status(409).json({ error: result.blocked });
	res.json({ ok: true, live: result.live, note: result.note });
});

app.post("/api/mocks/:id/enabled", async (req, res) => {
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	const rule = data.mocks.find((entry) => entry.id === req.params.id);
	if (!rule) return res.status(404).json({ error: "no such rule" });
	rule.isEnabled = Boolean(req.body.enabled);

	const result = await applyEdit({ rules: [rule] }, async () => {
		await writeSession(session.path, data);
	});
	if (result.blocked) return res.status(409).json({ error: result.blocked });
	res.json({ ok: true, live: result.live, note: result.note });
});

app.delete("/api/mocks/:id", async (req, res) => {
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	const rule = data.mocks.find((entry) => entry.id === req.params.id);
	if (!rule) return res.status(404).json({ error: "no such rule" });

	const result = await applyEdit({ removeEndpointKeys: [rule.endpointKey] }, async () => {
		data.mocks = data.mocks.filter((entry) => entry.id !== req.params.id);
		await writeSession(session.path, data);
	});
	if (result.blocked) return res.status(409).json({ error: result.blocked });
	res.json({ ok: true, live: result.live, note: result.note });
});

app.get("/api/trace", async (req, res) => {
	const limit = Number(req.query.limit || 50);
	const reader = await currentTrace();
	if (!reader) return res.json({ entries: [], note: "no booted simulator / app container found" });
	try {
		const entries = await reader.entries();
		const rows = entries
			.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
			.slice(0, limit)
			.map((record) => {
				const { exchange } = record;
				return {
					id: exchange.id,
					method: exchange.request?.method ?? "?",
					url: exchange.request?.url ?? "?",
					status: statusOf(exchange),
					durationMs: durationMs(exchange),
					recordedAt: record.recordedAt,
				};
			});
		res.json({ entries: rows });
	} catch (error) {
		res.json({ entries: [], note: String(error?.message ?? error) });
	}
});

app.get("/api/trace/:id/body", async (req, res) => {
	const side = req.query.side === "request" ? "request" : "response";
	const reader = await currentTrace();
	if (!reader) return res.status(404).json({ error: "no trace available" });
	const entries = await reader.entries();
	const record = entries.find((entry) => entry.exchange.id === req.params.id);
	if (!record) return res.status(404).json({ error: "no such exchange" });
	const raw = side === "request" ? record.exchange.request?.body : record.exchange.response?.body;
	const decoded = decodeBody(raw);
	if (!decoded) return res.json({ body: null });
	try {
		res.json({ body: JSON.parse(decoded.toString("utf8")) });
	} catch {
		res.json({ body: preview(decoded.toString("utf8"), 4000) });
	}
});

/** Generic pass-through for every kind in contracts/commands.md — tap, type, swipe, screenshot,
 *  dumpTree, deviceInfo, etc. The dashboard does not special-case any one kind; the UI builds the
 *  right form per kind and posts the same shape the queue already expects. */
app.post("/api/driver/command", async (req, res) => {
	const { kind, ...args } = req.body;
	if (!kind) return res.status(400).json({ error: "kind is required" });
	// Direct clicks stay direct (D-022) but must not cut into a task that is driving the device.
	if (!deviceLock.tryAcquire("driver-console", "Driver Console")) {
		return res.status(409).json({ error: `device busy — ${deviceLock.holder.label} is driving it` });
	}
	try {
		res.json(await postCommand({ kind, ...args }));
	} finally {
		deviceLock.release("driver-console");
	}
});

/** Serves driver evidence (screenshots/recordings) to the page — a browser will not load a
 *  `file://` image into an `http://` page. Restricted to media extensions so this can never be used
 *  to read arbitrary local files. */
const MEDIA_EXTENSIONS = /\.(png|jpe?g|heic|mp4|mov)$/i;
app.get("/api/media", (req, res) => {
	const path = String(req.query.path || "");
	if (!path.startsWith("/") || !MEDIA_EXTENSIONS.test(path) || path.includes("..")) {
		return res.status(400).end();
	}
	res.sendFile(path, (error) => {
		if (error && !res.headersSent) res.status(404).end();
	});
});

let activeBuildJob = null;

/** The one step harness.py deliberately refuses to automate (slow, needs VPN, failures need a human
 *  to read). Exposed here only as an explicit, confirmed click, with output streamed so the human
 *  can read it. */
app.post("/api/harness/build", async (_req, res) => {
	if (activeBuildJob?.status === "running") return res.json({ ok: true, jobId: activeBuildJob.id });

	const projectDir = process.env.TEST_FORGE_PROJECT_DIR || process.cwd();
	const { stdout } = await new Promise((resolve) => {
		const probe = spawn("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
		let out = "";
		probe.stdout.on("data", (chunk) => { out += chunk; });
		probe.on("close", () => resolve({ stdout: out }));
	});
	let udid = null;
	try {
		const booted = Object.values(JSON.parse(stdout).devices).flat();
		udid = booted.find((device) => device.udid === deviceArg())?.udid ?? booted[0]?.udid ?? null;
	} catch {
		udid = null;
	}
	if (!udid) return res.status(409).json({ error: "no booted simulator — boot one first" });

	const args = [
		"build-for-testing",
		"-workspace", "BlibliMobile-iOS.xcworkspace",
		"-scheme", process.env.TEST_FORGE_SCHEME || "BlibliMobile-iOS-PerfTest",
		"-configuration", process.env.TEST_FORGE_CONFIGURATION || "PerformanceTest",
		"-destination", `platform=iOS Simulator,id=${udid},arch=arm64`,
		// Xcode's GUI "Trust & Enable" for package plug-ins/macros doesn't apply to xcodebuild; without
		// these the build stops at "Validate plug-in GenerateBluIconInternalResources".
		"-skipPackagePluginValidation",
		"-skipMacroValidation",
	];
	const job = createJob({ kind: "build" });
	activeBuildJob = job;
	appendLine(job, `$ xcodebuild ${args.join(" ")}`);
	const child = spawn("xcodebuild", args, { cwd: projectDir, env: process.env });
	// xcodebuild is extremely chatty; forward only lines a human needs to see.
	const isWorthShowing = (line) => /error|warning: .*fail|BUILD|TEST BUILD|\*\*|Compiling .*XCUITest|Resolve Package/i.test(line);
	const forward = (chunk) => String(chunk).split("\n").filter(isWorthShowing).forEach((line) => appendLine(job, line));
	child.stdout.on("data", forward);
	child.stderr.on("data", forward);
	child.on("error", (error) => {
		appendLine(job, `! failed to start xcodebuild: ${error.message}`);
		finishJob(job, { status: "error" });
	});
	job.onCancel = () => child.kill("SIGTERM");
	child.on("close", (code) => {
		let status = code === 0 ? "done" : "error";
		if (job.isCancelled) status = "cancelled";
		finishJob(job, { status });
	});
	res.json({ ok: true, jobId: job.id });
});

/** Ensure can take up to 4 minutes; a second click while it runs would race harness.py's own
 *  start logic, so lifecycle actions are serialized and a concurrent one is refused. */
let harnessAction = null;
async function exclusiveHarness(name, action, res) {
	if (harnessAction) return res.status(409).json({ ok: false, error: `harness ${harnessAction} already in progress` });
	harnessAction = name;
	try {
		res.json(await action());
	} finally {
		harnessAction = null;
	}
}

/**
 * P7: the readiness gate lets a test through when the only problem is a runner that stopped
 * answering; the device lane then restarts it here, before the test's first step, instead of a
 * person having to press Ensure. Waits out an Ensure someone already started.
 */
let isHarnessHealDue = false;
async function healHarnessIfDue(say) {
	if (!isHarnessHealDue) return;
	isHarnessHealDue = false;
	while (harnessAction) await new Promise((resolve) => setTimeout(resolve, 1000));
	say("↻ the runner wasn't answering — restarting it before the test");
	harnessAction = "ensure";
	let restarted;
	try {
		restarted = await harnessEnsure();
	} finally {
		harnessAction = null;
	}
	if (!restarted.ok) throw new Error(`the runner isn't answering and couldn't be restarted: ${String(restarted.output ?? "").trim().split("\n").at(-1)}`);
	say("✓ runner restarted");
}

app.get("/api/harness/status", async (_req, res) => res.json({ ...(await harnessStatus()), busy: harnessAction }));
app.post("/api/harness/ensure", (_req, res) => exclusiveHarness("ensure", harnessEnsure, res));
app.post("/api/harness/stop", (_req, res) => exclusiveHarness("stop", harnessStop, res));
app.get("/api/harness/logs", async (req, res) => res.json(await harnessLogs(Number(req.query.count) || 40)));

// --- Test cases -------------------------------------------------------------

// `documentCases` is the document as loaded; `loadedCases` is what runs: the same cases with local edits laid over (D-166).
let documentCases = [];
let loadedCases = [];
let loadedSource = null;
let loadedTitle = null;
/** D-193: the document's Jira tickets — the page's own and any a case row names. */
let loadedJira = null;
// R3a (D-085): the loaded document survives restarts.
const loadedDocStore = createLoadedDocStore(join(__dirname, ".data", "testcases.json"));
const caseEdits = createCaseEditStore(join(__dirname, ".data", "case-edits.json"));
await caseEdits.load();
const resultOverrides = createResultOverrideStore(join(__dirname, ".data", "result-overrides.json"));
await resultOverrides.load();
const restoredDoc = await loadedDocStore.read();
if (restoredDoc) ({ cases: documentCases, source: loadedSource, title: loadedTitle, jira: loadedJira = null } = restoredDoc);
applyLocalEdits();

function applyLocalEdits() {
	loadedCases = applyResultOverrides(applyCaseEdits(documentCases, caseEdits.forSource(loadedSource)), resultOverrides.forSource(loadedSource));
}

// D-080: the Atlassian plugin first (the claude.ai Rovo connector answered 403 "app is not installed"
// from 13 Oct), Rovo as the fallback. Both are read-only page reads.
const CONFLUENCE_READ_TOOLS = ["mcp__plugin_atlassian_atlassian__getConfluenceContent", "mcp__claude_ai_Atlassian_Rovo__getConfluencePage"];
const CONFLUENCE_WRITE_TOOLS = [
	"mcp__claude_ai_Atlassian_Rovo__updateConfluencePage", "mcp__claude_ai_Atlassian_Rovo__createConfluencePage",
	"mcp__claude_ai_Atlassian_Rovo__createConfluenceFooterComment", "mcp__claude_ai_Atlassian_Rovo__createConfluenceInlineComment",
	"mcp__plugin_atlassian_atlassian__createConfluenceContent", "mcp__plugin_atlassian_atlassian__updateConfluenceContent",
	"mcp__plugin_atlassian_atlassian__executeWrite", "mcp__plugin_atlassian_atlassian__executeDestructive",
];

function describeSource(path) {
	const pageId = confluencePageId(path);
	return pageId ? `Confluence page ${pageId}` : path;
}

/** The document's own cases; edits and override history the cases carry (a bundle) are stored under `source`. */
function storeCarried(source, loaded) {
	// D-180: a bundle's cases carry their result override history; keep it beside the document like edits.
	const { cases: withoutOverrides, overrides: carriedOverrides } = separateCarriedOverrides(loaded);
	const { cases, edits: carried } = separateCarriedEdits(withoutOverrides);
	const stored = caseEdits.forSource(source);
	for (const [caseId, edit] of Object.entries(carried)) {
		if (!stored[caseId]) caseEdits.set(source, caseId, edit).catch((error) => console.error(`case edits: not saved — ${error.message}`));
	}
	for (const [caseId, history] of Object.entries(carriedOverrides)) {
		resultOverrides.merge(source, caseId, history).catch((error) => console.error(`result overrides: not saved — ${error.message}`));
	}
	return cases;
}

function acceptLoaded(source, { title, cases: loaded, jira = null }) {
	const cases = storeCarried(source, loaded);
	documentCases = cases;
	loadedSource = source;
	loadedTitle = title;
	loadedJira = jira;
	applyLocalEdits();
	loadedDocStore.write({ source, title, cases, jira }).catch((error) => console.error(`testcases: not saved — ${error.message}`));
	stateHub.poke("testcases");
}

/** Reads a Confluence page through headless Claude and the user's Atlassian connector, so no
 *  dashboard token is needed. Read-only by construction: the session may call only ToolSearch and
 *  the two page-read tools, write tools are denied outright, and permission bypass is never passed — the
 *  test-case page is a production document. The page body is taken from the raw tool result, not
 *  re-typed by Claude. */
function loadViaClaude(source) {
	const job = createJob({ kind: "load", source });
	const pageId = confluencePageId(source);
	const cloudId = new URL(source).host;
	const [pluginTool, rovoTool] = CONFLUENCE_READ_TOOLS;
	const prompt = [
		`Load the tools with ToolSearch query "select:${pluginTool},${rovoTool}"`,
		"(if neither is found, the Atlassian connector may still be connecting — retry the search up to 3 times).",
		`If ${pluginTool} is available, call it once with cloudId "${cloudId}", content_id "${pageId}", content_format "markdown", detail "full".`,
		`Only if that tool is missing or its call fails, call ${rovoTool} once with cloudId "${cloudId}", pageId "${pageId}", contentFormat "markdown".`,
		"Call no other tool, never edit or comment on the page, and reply only: DONE — or the error if the calls failed.",
	].join(" ");
	runClaude(job, {
		prompt,
		cwd: __dirname,
		args: [
			"--model", process.env.TEST_FORGE_LOADER_MODEL || "haiku",
			"--allowedTools", "ToolSearch", ...CONFLUENCE_READ_TOOLS,
			"--disallowedTools", ...CONFLUENCE_WRITE_TOOLS,
		],
	}).then(({ code, result, toolResults }) => {
		if (job.isCancelled) return finishJob(job, { status: "cancelled", verdict: "CANCELLED" });
		// The first read that parses wins (the plugin's, else Rovo's).
		const bodies = CONFLUENCE_READ_TOOLS.flatMap((tool) => toolResults[tool] ?? []);
		const body = bodies.find((text) => {
			try {
				parseConfluencePage(text);
				return true;
			} catch {
				return false;
			}
		}) ?? bodies.at(-1);
		if (!body) {
			const reason = result?.text?.trim() || `claude exited with code ${code}`;
			appendLine(job, `! no page content came back: ${reason}`);
			return finishJob(job, { status: "error", verdict: `Claude could not read ${describeSource(source)}: ${reason}` });
		}
		try {
			const loaded = parseConfluencePage(body);
			acceptLoaded(source, loaded);
			appendLine(job, `✓ parsed ${loaded.cases.length} case(s) from “${loaded.title}”`);
			finishJob(job, { status: "done", verdict: `${loaded.cases.length}` });
		} catch (error) {
			appendLine(job, `! could not parse the page: ${error.message}`);
			finishJob(job, { status: "error", verdict: `could not parse ${describeSource(source)}: ${error.message}` });
		}
	});
	return job;
}

app.post("/api/testcases/load", async (req, res) => {
	const path = req.body.path?.trim();
	if (!path) return res.status(400).json({ error: "path or Confluence URL is required" });
	const isConfluence = /^https?:\/\//i.test(path) && confluencePageId(path);
	if (isConfluence && !hasConfluenceCredentials()) {
		const running = activeJobs().find((job) => job.meta.kind === "load");
		if (running) return res.status(409).json({ error: "a document is already loading", jobId: running.id });
		return res.status(202).json({ ok: true, viaClaude: true, jobId: loadViaClaude(path).id });
	}
	try {
		const loaded = await loadTestCases(path);
		acceptLoaded(path, loaded);
		res.json({ ok: true, title: loaded.title, count: loaded.cases.length, cases: loaded.cases });
	} catch (error) {
		res.status(400).json({ error: `could not load ${describeSource(path)}: ${error.message}` });
	}
});

// --- D-193: a case's result as a Jira comment — previewed in full, posted only on the person's confirm ---
const JIRA_COMMENT_TOOLS = ["mcp__plugin_atlassian_atlassian__addOrEditJiraIssueComment", "mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue"];
const JIRA_POSTS_PATH = join(DATA_DIR, "jira-posts.json");
const jiraPosts = {
	read: async () => JSON.parse(await readFile(JIRA_POSTS_PATH, "utf8").catch(() => "[]")),
	append: async (record) => writeFile(JIRA_POSTS_PATH, JSON.stringify([record, ...(await jiraPosts.read())].slice(0, 500), null, 2)),
};

async function jiraDraft(caseId) {
	const testCase = loadedCases.find((entry) => entry.id === caseId);
	if (!testCase) return null;
	const runs = await listRuns();
	const [{ macros = [] }, { current }] = await Promise.all([ownApi("/api/macros"), stalenessNow(runs)]);
	const macro = macros.find((entry) => entry.schemaVersion === 2 && (entry.testCases ?? []).includes(caseId));
	const run = runs.find((entry) => entry.caseId === caseId || (macro && entry.macroId === macro.id)) ?? null;
	const proofFolder = process.env.TEST_FORGE_MEDIA_ROOT ? join(process.env.TEST_FORGE_MEDIA_ROOT, String(caseId)) : null;
	const proofNames = proofFolder ? (await readdir(proofFolder).catch(() => [])).filter((name) => /\.(png|jpe?g|mp4|mov)$/i.test(name)) : [];
	const comment = jiraComment({
		testCase,
		run: run && { verdict: run.verdict, at: run.recordedAt, steps: run.steps },
		build: buildLabel(run?.build ?? current),
		batchName: testBatches.active?.name ?? null,
		proofNames,
	});
	return { caseId, tickets: ticketsFor(caseId, loadedJira), comment, posts: (await jiraPosts.read()).filter((post) => post.caseId === caseId) };
}

app.get("/api/testcases/:id/jira", async (req, res) => {
	const draft = await jiraDraft(req.params.id);
	if (!draft) return res.status(404).json({ error: "no such case — load the doc first" });
	res.json(draft);
});

app.post("/api/testcases/:id/jira", async (req, res) => {
	const { key, comment, confirmed } = req.body ?? {};
	if (confirmed !== true) return res.status(400).json({ error: "posting to Jira needs the person's confirmation" });
	if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/.test(String(key ?? ""))) return res.status(400).json({ error: "a Jira key like SEA-123 is required" });
	if (!String(comment ?? "").trim()) return res.status(400).json({ error: "the comment is empty" });
	const cloudId = /^https?:\/\//i.test(loadedSource ?? "") ? new URL(loadedSource).host : process.env.JIRA_SITE || null;
	if (!cloudId) return res.status(400).json({ error: "no Atlassian site — load the test case document from Confluence first" });
	const job = createJob({ kind: "jira-post", caseId: req.params.id, key });
	const [pluginTool, rovoTool] = JIRA_COMMENT_TOOLS;
	const prompt = [
		`Load the tools with ToolSearch query "select:${pluginTool},${rovoTool}".`,
		`Add exactly one comment to Jira issue ${key} on site "${cloudId}" — with ${rovoTool} (cloudId, issueIdOrKey "${key}", commentBody) if it is available, otherwise with ${pluginTool}.`,
		"The comment body is the text between the markers, verbatim, nothing added:",
		"<<<COMMENT", String(comment), "COMMENT>>>",
		"Call no other tool and change nothing else. Reply only: POSTED — or the error.",
	].join("\n");
	const outcome = await runClaude(job, {
		prompt,
		cwd: __dirname,
		args: ["--model", process.env.TEST_FORGE_LOADER_MODEL || "haiku", "--allowedTools", "ToolSearch", ...JIRA_COMMENT_TOOLS],
	}).catch((error) => ({ result: { text: error.message } }));
	const reply = String(outcome?.result?.text ?? "").trim();
	const isPosted = /^POSTED/i.test(reply) && JIRA_COMMENT_TOOLS.some((tool) => (outcome?.toolResults?.[tool] ?? []).length);
	const record = { caseId: req.params.id, key, at: new Date().toISOString(), ok: isPosted, reply: isPosted ? null : reply.slice(0, 300) };
	await jiraPosts.append(record);
	finishJob(job, { status: isPosted ? "done" : "error", verdict: isPosted ? `posted to ${key}` : reply });
	res.status(isPosted ? 200 : 502).json(isPosted ? record : { ...record, error: reply || "Claude didn't confirm the post" });
});

app.get("/api/testcases", (_req, res) => res.json({ cases: loadedCases, title: loadedTitle, source: loadedSource }));

// D-166: edits stay local — the document itself (often a read-only production page) is never written.
app.put("/api/testcases/:id/edit", async (req, res) => {
	const documentCase = documentCases.find((entry) => entry.id === req.params.id);
	if (!documentCase) return res.status(404).json({ error: "no such case — load the doc first" });
	const changes = Object.fromEntries(Object.entries(req.body?.fields ?? {}).filter(([field, value]) => EDITABLE_FIELDS.includes(field) && typeof value === "string"));
	if (Object.keys(changes).length === 0) return res.status(400).json({ error: `fields must name at least one of ${EDITABLE_FIELDS.join(", ")}` });
	if (changes.scenario !== undefined && !changes.scenario.trim()) return res.status(400).json({ error: "the scenario can't be empty" });
	const previous = caseEdits.forSource(loadedSource)[documentCase.id];
	await caseEdits.set(loadedSource, documentCase.id, mergeCaseEdit(documentCase, previous, changes));
	applyLocalEdits();
	stateHub.poke("testcases");
	res.json({ ok: true, case: loadedCases.find((entry) => entry.id === documentCase.id) });
});

app.delete("/api/testcases/:id/edit", async (req, res) => {
	if (!documentCases.some((entry) => entry.id === req.params.id)) return res.status(404).json({ error: "no such case — load the doc first" });
	await caseEdits.set(loadedSource, req.params.id, null);
	applyLocalEdits();
	stateHub.poke("testcases");
	res.json({ ok: true });
});

/**
 * D-181: a bundle of the loaded document adds its cases instead of replacing the document, so cases it doesn't
 * hold stay listed. A bundle of another document (or nothing loaded) loads as before. Returns the added ids.
 */
function acceptImported({ title, source, cases: incoming }) {
	const isSameDocument = documentCases.length > 0 && (source === loadedSource || title === loadedTitle || loadedSource === `bundle:${title}`);
	if (!isSameDocument) {
		acceptLoaded(`bundle:${title}`, { title, cases: incoming });
		return { mode: "loaded", added: incoming.map((testCase) => testCase.id) };
	}
	const { cases, added } = mergeImportedCases(documentCases, storeCarried(loadedSource, incoming));
	documentCases = cases;
	applyLocalEdits();
	loadedDocStore.write({ source: loadedSource, title: loadedTitle, cases, jira: loadedJira }).catch((error) => console.error(`testcases: not saved — ${error.message}`));
	stateHub.poke("testcases");
	return { mode: "merged", added };
}

// D-183: the case's proof files in the active test batch folder, for the Tests media panel.
app.get("/api/testcases/:id/media", async (req, res) => {
	if (!loadedCases.some((entry) => entry.id === req.params.id)) return res.status(404).json({ error: "no such case — load the doc first" });
	res.json({ files: await caseProofFiles(process.env.TEST_FORGE_MEDIA_ROOT || null, req.params.id) });
});

// D-180: a person overrides a case's result with a required description; every override is kept as history,
// travels in bundles and session exports, and its comments and leniency go into the next Claude run.
app.put("/api/testcases/:id/result", async (req, res) => {
	const testCase = loadedCases.find((entry) => entry.id === req.params.id);
	if (!testCase) return res.status(404).json({ error: "no such case — load the doc first" });
	const { verdict, reason, leniency, expected, rerun = false } = req.body ?? {};
	if (rerun && refuseWhileTesting(res)) return;
	if (rerun && (await refuseUnlessReady(res, { needsClaude: true }))) return;
	const [{ macros = [] }, runs] = await Promise.all([ownApi("/api/macros"), listRuns()]);
	const previousVerdict = testcaseView({ cases: [testCase], macros, runs }).cases[0]?.lastRun?.verdict ?? null;
	const { entry, error } = overrideEntry({ verdict, reason, leniency, previousVerdict });
	if (error) return res.status(400).json({ error });
	const documentCase = documentCases.find((item) => item.id === testCase.id);
	if (typeof expected === "string" && documentCase && expected.trim() !== String(testCase.expected ?? "").trim()) {
		const previous = caseEdits.forSource(loadedSource)[documentCase.id];
		await caseEdits.set(loadedSource, documentCase.id, mergeCaseEdit(documentCase, previous, { expected }));
	}
	await resultOverrides.append(loadedSource, testCase.id, entry);
	applyLocalEdits();
	stateHub.poke("testcases");
	const updated = loadedCases.find((item) => item.id === testCase.id);
	const run = rerun ? confirmAfterPass(updated, enqueueTestForgeRun(updated, { model: req.body.model })) : null;
	res.json({ ok: true, override: entry, case: updated, ...(run && { jobId: run.job.id, taskId: run.task.id }) });
});

app.get("/api/macros", async (_req, res) => {
	const [v1, v2, registry] = await Promise.all([listMacros(), listMacrosV2(), loadRegistry().catch(() => ({ elements: {} }))]);
	// D-220: a recording that can't replay (missing routine, unknown element) is not a free replay.
	const byId = new Map(v2.map((macro) => [macro.id, macro]));
	// An unreadable registry says nothing about a recording, so its element check is skipped, not failed.
	const registryRead = await loadRegistry().catch(() => null);
	const problems = await Promise.all(v2.map((macro) => replayProblem(macro, { loadMacro: async (id) => byId.get(id) ?? null, registry: registryRead })));
	const macros = [
		...v2.map((macro, index) => ({ id: macro.id, name: macro.name, kind: macro.kind, links: macro.links, testCases: caseLinks(macro), aliases: macro.aliases, requires: macro.requires, covers: macro.covers, usesMocks: usesMocks(macro), hasDemoNotes: Boolean(macro.demo), path: macro.path, schemaVersion: 2, anchors: anchorSummary(macro, registry), replayProblem: problems[index] })),
		// macro_cli.py lists every file under macros/, v2 ones and references included; those are shown once, above.
		...(v1.macros ?? []).filter((macro) => !v2.some((entry) => macro.file?.endsWith(entry.path)) && !String(macro.file ?? "").endsWith(".ref.json")).map((macro) => ({ ...macro, schemaVersion: 1 })),
	];
	res.json({ ok: true, macros, v1Error: v1.ok ? undefined : v1.error });
});

/** "One instance per id" check (D-064): duplicate ids, dangling references, same-step macros. */
app.get("/api/macros/lint", async (_req, res) => res.json(await lintMacros()));

/** D-171: Scan › Record a macro — the person's recorded taps saved as a replayable v2 macro, linked to test cases. */
/** D-174: Scan's saved-macros list — every macro recorded by hand in Scan, newest first. */
app.get("/api/macros/v2/recorded", async (_req, res) => {
	const root = uiTestRoot();
	res.json({ macros: recordedMacros(await listMacrosV2(root), root) });
});

app.post("/api/macros/v2/recorded", async (req, res) => {
	const { name, caseIds = [], module, submodule = "General", gestures, startFresh = true } = req.body ?? {};
	if (!String(name ?? "").trim()) return res.status(400).json({ error: "name the macro" });
	if (!String(module ?? "").trim()) return res.status(400).json({ error: "pick the module the macro belongs to" });
	if (!Array.isArray(gestures) || gestures.length === 0) return res.status(400).json({ error: "nothing was recorded" });
	if (!Array.isArray(caseIds)) return res.status(400).json({ error: "caseIds must be a list" });
	const root = uiTestRoot();
	const placement = { module: String(module).trim(), submodule: String(submodule).trim() || "General", root };
	const freeName = await freeMacroName(String(name).trim(), join(root, placement.module, placement.submodule, "macros"));
	const built = buildRecordedMacro({ name: freeName, caseIds, gestures, startFresh: startFresh !== false }, await loadRegistry(root));
	if (built.createdElements.length) await saveRegistry(built.registry, root);
	const saved = await saveMacroV2(built.macro, placement);
	stateHub.poke("testcases");
	res.json({ ok: true, macro: saved.macro, path: saved.path, warnings: built.warnings, createdElements: built.createdElements });
});

/** Every endpoint a macro's `mock` step names (steps and cleanup, routines expanded). */
async function endpointsMacrosUse() {
	const endpoints = new Set();
	for (const macro of await listMacrosV2()) {
		const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, findMacroV2).catch(() => []);
		for (const step of steps) if (step.do === "mock") endpoints.add(step.endpoint);
	}
	return endpoints;
}

/** Mock pack (D-064): what the repo keeps vs. what macros need vs. what the device has. */
app.get("/api/mocks/pack", async (_req, res) => {
	const [needed, packed, session] = await Promise.all([endpointsMacrosUse(), loadPackRules(), resolveSessionPath().then((found) => readSession(found.path)).catch(() => null)]);
	const onDevice = new Set((session?.mocks ?? []).map((rule) => rule.endpointKey));
	res.json({ endpoints: [...needed].sort().map((endpoint) => ({ endpoint, inRepo: packed.has(endpoint), onDevice: onDevice.has(endpoint) })), dir: "TestForgeMacros/mocks" });
});

/** Saves the device's rules that macros use into the repo's mock pack (redacted). */
app.post("/api/mocks/pack", async (req, res) => {
	try {
		const needed = await endpointsMacrosUse();
		const wanted = Array.isArray(req.body?.endpoints) ? new Set(req.body.endpoints) : needed;
		const session = await readSession((await resolveSessionPath()).path);
		const rules = session.mocks.filter((rule) => wanted.has(rule.endpointKey));
		const missing = [...wanted].filter((endpoint) => !rules.some((rule) => rule.endpointKey === endpoint));
		const written = await exportRules(rules);
		res.json({ ok: true, written, missing });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

/** One v2 macro with its review map (steps in plain words, element quality). */
app.get("/api/macros/v2/:id", async (req, res) => {
	const macro = await findMacroV2(req.params.id);
	if (!macro) return res.status(404).json({ error: "no such macro" });
	const registry = await loadRegistry();
	res.json({ macro, map: macroMap(macro, registry), anchors: anchorSummary(macro, registry) });
});

/** Scan's step editor (D-195): a macro's own steps with what each may change. */
app.get("/api/macros/v2/:id/steps", async (req, res) => {
	const macro = await findMacroV2(req.params.id);
	if (!macro) return res.status(404).json({ error: "no such macro" });
	const registry = await loadRegistry();
	res.json({ id: macro.id, path: macro.path, steps: (macro.steps ?? []).map((step) => ({ id: step.id, kind: step.do, text: describeStep(step, registry), fields: editableFields(step), timeout: step.timeout ?? null, isOptional: Boolean(step.optional), typedText: step.do === "type" ? step.text ?? "" : null, seconds: step.do === "wait" ? step.seconds ?? null : null, name: step.do === "screenshot" ? step.name ?? null : null })) });
});

app.put("/api/macros/v2/:id/steps", async (req, res) => {
	if (testInFlight()) return res.status(409).json({ error: "a test is running — save the steps once it ends" });
	const macro = await findMacroV2(req.params.id);
	if (!macro) return res.status(404).json({ error: "no such macro" });
	try {
		const edited = applyStepEdits(macro, { order: req.body?.order, changes: req.body?.changes ?? {} });
		await saveMacroInPlace(edited);
		res.json({ ok: true, stepCount: edited.steps.length });
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

/** What a recording feeds the app (D-195): its deeplinks and the mocked responses it arms, from the device or the repo pack. */
app.get("/api/macros/v2/:id/inputs", async (req, res) => {
	const macro = await findMacroV2(req.params.id);
	if (!macro) return res.status(404).json({ error: "no such macro" });
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, findMacroV2).catch(() => []);
	const { deeplinks, mocks } = macroInputs(steps);
	const [session, packed] = await Promise.all([resolveSessionPath().then((found) => readSession(found.path)).catch(() => null), loadPackRules().catch(() => new Map())]);
	const packRules = [...packed.values()].map((entry) => entry.rule);
	res.json({ deeplinks, mocks: mocks.map((mock) => {
		const fromDevice = mock.variant ? mockResponse(session?.mocks, mock.endpoint, mock.variant) : null;
		const response = fromDevice ?? (mock.variant ? mockResponse(packRules, mock.endpoint, mock.variant) : null);
		return { ...mock, response, source: fromDevice ? "device" : response ? "repo" : null };
	}) });
});

/** Replays a v2 macro on its own — no test case, no Claude. Goes through the device lane like any run. */
/** One test on the simulator at a time (D-051): a second start is refused, never queued behind it. */
const TEST_KINDS = new Set(["test-forge-run", "replay", "replay-v2"]);
function testInFlight() {
	return tasks.list().find((task) => TEST_KINDS.has(task.kind) && (task.status === "queued" || task.status === "running")) ?? null;
}
function refuseWhileTesting(res) {
	if (scanSession.isActive) {
		res.status(409).json({ error: "Scan mode is on — stop the scan before running a test." });
		return true;
	}
	if (activeBatch && !["done", "cancelled"].includes(activeBatch.status)) {
		res.status(409).json({ error: "A batch run is in progress — pause or cancel it on the Test Cases tab first." });
		return true;
	}
	const busy = testInFlight();
	if (!busy) return false;
	res.status(409).json({ error: `“${busy.title}” is ${busy.status === "queued" ? "about to start" : "running"} — one test at a time. Wait for it to finish or cancel it.`, busyTaskId: busy.id });
	return true;
}

// D-086: scan mode runs the plugin's scan_mode.py; saved maps go to .data/scans/.
const scanSession = new ScanSession({
	scriptPath: resolvePluginScript("TEST_FORGE_SCAN_SCRIPT", "scan_mode.py"),
	outDir: join(__dirname, ".data", "scans"),
});
registerScanRoutes(app, {
	scan: scanSession,
	deviceLock,
	busyReason: () => {
		if (activeBatch && !["done", "cancelled"].includes(activeBatch.status)) return "A batch run is in progress — stop it before scanning.";
		const busy = testInFlight();
		return busy ? `“${busy.title}” is running — wait for it to finish or cancel it before scanning.` : null;
	},
});

// D-190: tools, plugin and MCP servers this Mac needs; refreshed in the background every 10 min or on request.
const PREREQUISITE_MAX_AGE_MS = 10 * 60_000;
let prerequisites = { result: null, pending: null };
function refreshPrerequisites() {
	prerequisites.pending ??= checkPrerequisites({ run, cwd: DEFAULT_PROJECT_DIR })
		.then((result) => {
			prerequisites = { result, pending: null };
			readiness?.invalidate?.();
			return result;
		})
		.catch(() => (prerequisites.pending = null));
	return prerequisites.pending;
}
function cachedPrerequisites() {
	const age = prerequisites.result ? Date.now() - Date.parse(prerequisites.result.checkedAt) : Infinity;
	if (age > PREREQUISITE_MAX_AGE_MS) refreshPrerequisites();
	return prerequisites.result;
}
app.get("/api/prerequisites", async (req, res) => res.json(req.query.refresh === "1" || !prerequisites.result ? await refreshPrerequisites() : prerequisites.result));
app.post("/api/prerequisites/refresh", async (_req, res) => res.json(await refreshPrerequisites()));

// No test or macro starts on an incomplete setup (D-052).
const readiness = readinessGate({
	prerequisiteState: cachedPrerequisites,
	bundleId: BUNDLE_ID,
	memo: createCheckMemo({ file: join(__dirname, ".data", "readiness-memo.json") }),
	configuration: process.env.TEST_FORGE_CONFIGURATION || "PerformanceTest",
	simulatorState,
	buildState: testForgeBuildState,
	legacyBundle: () => findTestBundle({ projectDir: process.env.TEST_FORGE_PROJECT_DIR || process.cwd(), configuration: process.env.TEST_FORGE_CONFIGURATION || "PerformanceTest", runnerTarget: process.env.TEST_FORGE_UITEST_TARGET }),
	isBuilding: () => activeBuildJob?.status === "running" || isTestForgeBuilding(),
	codeState: testForgeCodeState,
	installedMatch: () => testForgeInstalledMatch(BUNDLE_ID),
	diskFreeGb: testForgeFreeGb,
	deviceHolder: () => deviceLock.status().holder?.label ?? null,
	testBatchState: () => ({ proofRoot: testBatches.proofRoot, active: testBatches.active, paused: testBatches.paused }),
	lensState: async () => {
		const answer = await liveState();
		return answer.ok ? { ok: true, detail: `answering · mocking ${answer.outcome?.isMockingEnabled ? "ON" : "OFF"}` } : { ok: false, detail: "the app isn't answering on the control queue" };
	},
	claudeState: async () => {
		const account = await claudeAccount();
		if (!account.loggedIn) return { ok: false, detail: `Claude isn't signed in${account.error ? ` (${account.error})` : ""} — run \`claude auth login\`` };
		if (!resolvePluginScript("TEST_FORGE_HARNESS_SCRIPT", "harness.py")) return { ok: false, detail: "the test-flow-recorder plugin (test-forge-driver) isn't installed" };
		return { ok: true, detail: `${account.email ?? "signed in"} · test-forge-driver plugin found` };
	},
	claudeEnvState: claudeEnvCheck,
	probeHarness: async () => {
		// `deviceInfo`, not a screenshot: same round trip through the runner, no PNG left behind per probe.
		const outcome = await postCommand({ kind: "deviceInfo" }, { timeoutMs: 8_000, recover: false });
		noteDeviceInfo(outcome);
		return Boolean(outcome) && !outcome.error;
	},
});
let lastReadiness = null;
setHarnessTarget(testForgeHarnessTarget);
registerTestForgeSetupRoutes(app, {
	readiness,
	isTestInFlight: testInFlight,
	harnessStop,
	deviceLock,
	resetStores: { dataDir: DATA_DIR, results, tasks, sessions, clearRuns, testBatches },
});
registerTestBatchRoutes(app, {
	testBatches, readiness, isTestInFlight: testInFlight, results, tasks,
	isRunQueueBusy: () => Boolean(activeBatch && !["done", "cancelled"].includes(activeBatch.status)),
});

async function queueHealth() {
	const isRunning = await isAppRunning(BUNDLE_ID).catch(() => false);
	// D-130: live = the test simulator's app (or an older build that polls without saying where it runs).
	const testUdid = deviceArg() === "booted" ? null : deviceArg();
	const polls = pollHealth(ownsControlQueue ? controlQueue.recentPollers : [], { testUdid, freshMs: LENS_POLL_FRESH_MS });
	return {
		queueOwner: ownsControlQueue ? "dashboard" : (await isSidecarUp()) ? "another process" : "none",
		isAppRunning: isRunning,
		testDevice: testUdid,
		...polls,
	};
}

/** Live from the app when it is polling (no 6 s wait otherwise), else session.json. */
async function readLensState() {
	const health = await queueHealth();
	const live = health.isAppPolling ? await liveState().catch(() => null) : null;
	const fromFile = live?.ok ? null : await readSession((await resolveSessionPath()).path);
	const rules = (live?.ok ? live.outcome?.rules : fromFile?.mocks) ?? [];
	return {
		source: live?.ok ? "live" : "file",
		isMockingEnabled: Boolean(live?.ok ? live.outcome?.isMockingEnabled : fromFile?.isMockingEnabled),
		rules: rules.map((rule) => ({
			id: rule.id,
			endpoint: rule.endpointKey,
			isEnabled: rule.isEnabled !== false,
			activeVariant: rule.variants?.find((entry) => entry.id === rule.activeVariantID)?.name ?? null,
			variants: (rule.variants ?? []).map((entry) => entry.name),
		})),
	};
}

/** The scenario list last sent live — the app's autosave reaches session.json a little later. */
let sentScenarios = null;

/** D-128: full rules (live when polling, else session.json) + scenarios (the app has no verb to read them back). */
async function readLensRules() {
	const health = await queueHealth();
	const live = health.isAppPolling ? await liveState().catch(() => null) : null;
	const sessionPath = (await resolveSessionPath()).path;
	const fromFile = await readSession(sessionPath);
	const fileSavedAt = await stat(sessionPath).then((info) => info.mtimeMs, () => 0);
	const isFileBehind = sentScenarios && sentScenarios.at > fileSavedAt;
	return {
		source: live?.ok ? "live" : "file",
		rules: (live?.ok ? live.outcome?.rules : fromFile.mocks) ?? [],
		isMockingEnabled: Boolean(live?.ok ? live.outcome?.isMockingEnabled : fromFile.isMockingEnabled),
		scenarios: isFileBehind ? sentScenarios.list : (fromFile.scenarios ?? []),
	};
}

/**
 * D-128: rules upserted by id; `scenarios`, when given, is the WHOLE list (the app's edit verb replaces its list).
 * Live first, else into session.json (409 when a running app blocks it).
 */
async function commitLens({ rules = [], scenarios, isMockingEnabled }) {
	const session = await resolveSessionPath();
	const edit = { ...(rules.length && { rules }), ...(scenarios && { scenarios }), ...(isMockingEnabled !== undefined && { isMockingEnabled }) };
	const result = await applyEdit(edit, async () => {
		const data = await readSession(session.path);
		const upsert = (list, item) => {
			const index = list.findIndex((entry) => entry.id === item.id);
			if (index >= 0) list[index] = item;
			else list.push(item);
		};
		rules.forEach((rule) => upsert(data.mocks, rule));
		if (scenarios) data.scenarios = scenarios;
		if (isMockingEnabled !== undefined) data.isMockingEnabled = isMockingEnabled;
		await writeSession(session.path, data);
	});
	if (result.blocked) throw Object.assign(new Error(result.blocked), { status: 409 });
	if (scenarios && result.live) sentScenarios = { list: scenarios, at: Date.now() };
	return result;
}

/**
 * D-128: the running app merges scenarios it is sent and has no verb to remove one, so a delete is a file write with
 * the app stopped, then started again (phase D adds the verb).
 */
async function replaceScenariosOffline(scenarios) {
	const wasRunning = await isAppRunning(BUNDLE_ID);
	if (wasRunning) {
		await run("xcrun", ["simctl", "terminate", deviceArg(), BUNDLE_ID]).catch(() => {});
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	const session = await resolveSessionPath();
	const data = await readSession(session.path);
	data.scenarios = scenarios;
	await writeSession(session.path, data);
	sentScenarios = null;
	if (wasRunning) await run("xcrun", ["simctl", "launch", deviceArg(), BUNDLE_ID]);
	return { live: false, relaunched: wasRunning, note: wasRunning ? "the app was restarted to drop it" : RELAUNCH_NOTE };
}

registerLensRoutes(app, {
	readState: readLensState,
	setMocking,
	armVariant: armMock,
	upsertQuickMock,
	currentTrace,
	queueHealth,
	readRules: readLensRules,
	commit: commitLens,
	replaceScenariosOffline,
	isAppRunning: () => isAppRunning(BUNDLE_ID),
	sendLensCommand,
	loadPackRules,
});

// --- D-120: which simulator tests run on -----------------------------------------------------------

const runtimeName = (runtime) => String(runtime ?? "").split(".").pop().replace(/-/g, " ").replace(/ (\d+) (\d+)$/, " $1.$2");
const testDeviceView = (device) => device && { udid: device.udid, name: device.name, runtime: runtimeName(device.runtime), isBooted: device.state === "Booted", isChosen: device.udid === chosenTestDeviceUdid() };

app.get("/api/test-device", async (_req, res) => {
	const device = await findTestForgeSimulator().catch(() => null);
	res.json({ device: testDeviceView(device) });
});

/** F7 (D-197): iPhones paired with this Mac. devicectl takes a few seconds, so a result is kept 15 s. */
let physicalCache = null;
app.get("/api/devices/physical", async (req, res) => {
	if (physicalCache && Date.now() - physicalCache.at < 15_000 && req.query.fresh !== "1") return res.json(physicalCache.view);
	const file = join(DATA_DIR, `devicectl-${process.pid}.json`);
	try {
		await run("xcrun", ["devicectl", "list", "devices", "--json-output", file], { timeout: 30_000 });
		const view = { devices: parseDevicectl(JSON.parse(await readFile(file, "utf8"))), checkedAt: new Date().toISOString() };
		physicalCache = { at: Date.now(), view };
		res.json(view);
	} catch (error) {
		res.json({ devices: [], error: `couldn't list devices: ${error.message.split("\n")[0]}` });
	}
});

/** `{ udid }` makes that simulator the test device; `{ udid: null }` goes back to the "TestForge · " clone. */
app.post("/api/test-device", async (req, res) => {
	if (refuseWhileTesting(res)) return;
	const udid = req.body?.udid ?? null;
	const devices = await listDevices().catch(() => []);
	if (udid && !devices.some((device) => device.udid === udid)) return res.status(404).json({ error: "no such simulator" });
	const before = deviceArg();
	chooseTestDevice(udid);
	const device = await findTestForgeSimulator(devices);
	// The runner is bound to the simulator it was started on; the next test starts it on the new one.
	if (device?.udid !== before) await harnessStop().catch(() => null);
	// Every check depends on the device, so the cached result is redone at once rather than on the next poll.
	lastReadiness = await readiness.get({ fresh: true }).catch(() => lastReadiness);
	stateHub.poke("readiness");
	res.json({ ok: true, device: testDeviceView(device) });
});
findTestForgeSimulator().catch(() => null);
// The two Test Batch checks change with the batch, not with the 30 s readiness poll.
testBatches.on("change", () => stateHub.poke("readiness"));
scanSession.on("change", (scan) => {
	if (scan?.isActive && scan.out) testBatches.attach({ kind: "scan", refId: scan.out, title: `Scan ${new Date(scan.startedAt).toLocaleTimeString("en-GB")}` });
});

app.get("/api/readiness", async (req, res) => {
	// A running test owns the runner; probing it would queue behind the test's own commands.
	if (testInFlight() && lastReadiness) return res.json({ ...lastReadiness, isTestRunning: true });
	lastReadiness = await readiness.get({ fresh: req.query.fresh === "1" });
	res.json(lastReadiness);
});

/** ▶ Run (a Claude session) also needs the Claude checks; a macro replay never does. */
async function refuseUnlessReady(res, { needsClaude = false } = {}) {
	const { state, problem } = await startGate({ needsClaude });
	if (!problem) return false;
	res.status(423).json({ error: problem, readiness: state });
	return true;
}

/** The gate without a response: `problem` is null when a test may start. */
async function startGate({ needsClaude = false } = {}) {
	const state = await readiness.get({ fresh: true });
	lastReadiness = state;
	if (state.checks.some((check) => check.id === "harness" && check.selfHeals)) isHarnessHealDue = true;
	if (needsClaude ? state.readyForClaude : state.ready) return { state, problem: null };
	const scopes = needsClaude ? ["all", "claude"] : ["all"];
	const missing = state.checks.filter((check) => !check.ok && check.level === "block" && scopes.includes(check.scope)).map((check) => `${check.label}: ${check.detail}`);
	return { state, problem: `Setup isn't ready — ${missing.join("; ")}.` };
}

app.post("/api/macros/v2/:id/replay", async (req, res) => {
	const macro = await findMacroV2(req.params.id);
	if (!macro) return res.status(404).json({ error: "no such macro" });
	if (refuseWhileTesting(res)) return;
	// D-220: Replay is only offered for a recording that can run without Claude.
	const problem = await replayProblem(macro, { loadMacro: (id) => findMacroV2(id), registry: await loadRegistry().catch(() => null) });
	if (problem) return res.status(409).json({ error: `The recording can't replay: ${problem}. Run with Claude to repair it.` });
	if (await refuseUnlessReady(res)) return;
	// D-165: `explain` replays slowly with the live overlay's cards, subtitles and pointers over the Simulator.
	const { job, task } = enqueueReplay(macro, { explain: req.body?.explain === true });
	res.json({ ok: true, jobId: job.id, taskId: task.id });
});

/** D-165: paces the replay and tells the live overlay where to look; a demo films the same pacing. */
function explainRecorder(macro, jobId) {
	const screen = deviceScreen();
	return createDemoRecorder({
		fetchFrame: async (identifier) => frameOf(await postCommand({ kind: "getFrame", identifier, timeout: 2 }, { timeoutMs: 6_000, recover: false })),
		screen,
		notedStepIds: new Set(Object.keys(macro.demo?.steps ?? {})),
		onFocus: (focus) => jobId && narrator.explainFocus(jobId, { ...focus, screen }),
	});
}

/** The opening card stays up long enough to read; shorter without notes, when it only names the test. */
async function showExplainIntro(macro, jobId) {
	if (!jobId) return;
	narrator.explain(jobId, { notes: macro.demo ?? null, screen: deviceScreen() });
	await new Promise((resolve) => setTimeout(resolve, macro.demo ? EXPLAIN_INTRO_MS : EXPLAIN_INTRO_MS / 2));
}

const EXPLAIN_INTRO_MS = 6_000;

/** D-164: the demo's folder, screen recording and timeline recorder; the recording starts with the macro's first step. */
async function startDemo(macro, say, recorder) {
	const root = process.env.TEST_FORGE_MEDIA_ROOT;
	const qa = await findTestForgeSimulator().catch(() => null);
	if (!root || !qa) throw new Error("a demo needs the proof folder and the QA simulator");
	const caseId = caseLinks(macro)[0] ?? macro.id;
	const dir = join(root, "demos", `${String(caseId).replace(/[^\w.-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
	const video = await startVideo({ udid: qa.udid, path: join(dir, "raw.mp4") });
	recorder.begin();
	say(`🎬 demo: filming the whole test, pausing at each check — ${dir}`);
	return { dir, caseId, recorder, video };
}

/** Stops the recording and writes `timeline.json` beside it; the Mac app renders the subtitled videos from both. */
async function finishDemo(demo, { macro, verdict, say }) {
	const videoPath = await demo.video.stop();
	demo.isStopped = true;
	const steps = await flattenSteps({ steps: [...(macro.steps ?? []), ...(macro.cleanup ?? [])] }, findMacroV2).catch(() => []);
	const mocks = variantsArmedBy(steps);
	const timeline = demo.recorder.timeline({ caseId: demo.caseId, macro, notes: macro.demo ?? null, mockNotes: await loadMockNotes(), mocks, verdict });
	await writeFile(join(demo.dir, "timeline.json"), `${JSON.stringify({ ...timeline, video: videoPath ? "raw.mp4" : null }, null, 2)}\n`);
	say(macro.demo ? `🎬 demo recorded: ${demo.dir}` : "🎬 demo recorded without notes — write them first (POST /api/demo/:macro/notes) for subtitles");
	await renderDemo(demo.dir, say);
	return demo.dir;
}

/** The Mac app renders (AVFoundation); run headless from its binary. Missing app → the raw recording + timeline stay. */
async function renderDemo(dir, say) {
	const candidates = [process.env.TEST_FORGE_BINARY, join(__dirname, "..", "mac-app", "build", "TestForge.app", "Contents", "MacOS", "TestForge"), "/Applications/TestForge.app/Contents/MacOS/TestForge"].filter(Boolean);
	const binary = candidates.find((path) => existsSync(path));
	if (!binary) return say("! no TestForge app found to render the demo — open the Mac app's Results to render it");
	try {
		const { stdout } = await run(binary, ["--render-demo", dir], { timeout: 600_000 });
		stdout.split("\n").filter(Boolean).forEach((line) => say(`🎬 ${line}`));
	} catch (error) {
		say(`! rendering failed: ${String(error.stderr || error.message).slice(0, 300)}`);
	}
}

/** `video` ({ caseId, plan }, D-113) films the replay's planned window; the movie lands in `job.meta.videoPath`. */
function enqueueReplay(macro, { video = null, demo = false, explain = false } = {}) {
	const title = `${demo ? "🎬 Demo" : explain ? "💬 Explained replay" : "⚡ Replay"} ${macro.name}`;
	const job = jobForTask({ kind: "replay", macroId: macro.id }, title);
	const task = tasks.enqueue({ kind: "replay-v2", title, payload: { macroId: macro.id, jobId: job.id, video, demo, explain }, links: { macroId: macro.id } });
	linkJobToTask(job, task);
	return { job, task };
}

/** A queued case keeps the old job contract (jobId → SSE lines) so the Test Cases tab works as
 *  before; cancelling the job cancels the task, whether it is still queued or already running. */
function jobForTask(meta, label) {
	const job = createJob(meta);
	appendLine(job, `● queued in the device lane — ${label}`);
	return job;
}

function linkJobToTask(job, task) {
	job.meta.taskId = task.id;
	job.onCancel = () => {
		const wasQueued = tasks.get(task.id)?.status === "queued";
		tasks.cancel(task.id);
		if (wasQueued) finishJob(job, { status: "cancelled", verdict: "CANCELLED" });
	};
}

/** Mirrors a session's events into a job as console lines (the Test Cases "Run output" view). */
function mirrorSessionToJob(session, job) {
	if (!narrator.runs.has(job.id)) narrator.begin(job.id, { caseId: job.meta.caseId ?? session.record.meta?.caseId ?? null, title: session.record.title, source: "claude", sessionId: session.id });
	const onEvent = (event) => {
		narrateSessionEvent(job, event);
		if (event.type === "dashboard") {
			if (event.kind === "approval") appendLine(job, `⏸ waiting for your approval: ${event.toolName} — answer it in Sessions`);
			else if (event.kind === "question") appendLine(job, "⏸ Claude asked a question — answer it in Sessions");
			else if (event.kind === "hard-deny") appendLine(job, `⛔ ${event.text}`);
			else if (event.kind === "status" && event.status === "waiting-device") appendLine(job, "⏸ waiting for the device");
			return;
		}
		formatEvent(JSON.stringify(event)).lines.forEach((text) => appendLine(job, text));
	};
	session.on("event", onEvent);
	return () => session.off("event", onEvent);
}

/** Claude's phone and fake-data tool calls as live steps (D-077); the console keeps every line. */
function narrateSessionEvent(job, event) {
	for (const part of event.message?.content ?? []) {
		if (event.type === "assistant" && part.type === "tool_use") narrator.toolCall(job.id, { id: part.id, name: part.name, input: part.input, logIndex: job.lines.length });
		else if (event.type === "user" && part.type === "tool_result") narrator.toolResult(job.id, { id: part.tool_use_id, isError: Boolean(part.is_error), text: typeof part.content === "string" ? part.content : "" });
	}
}

/** Resolves with the `result` message of the session's current turn, or null if it ends without one. */
function nextTurnEnd(session) {
	return new Promise((resolve) => {
		const onEnd = (result) => done(result);
		const onStatus = (status) => {
			if (status === "closed" || status === "error") done(null);
		};
		const done = (value) => {
			session.off("turn-end", onEnd);
			session.off("status", onStatus);
			resolve(value);
		};
		session.on("turn-end", onEnd);
		session.on("status", onStatus);
	});
}

/**
 * D-068: what a QA Claude session drives — the QA simulator and the QA build, never the developer's
 * own simulator that their local `.claude/settings.json` may pin (`TEST_FORGE_DEVICE_UDID`).
 */
async function testForgeSessionEnv() {
	const target = await testForgeHarnessTarget().catch(() => ({}));
	// NETWORKLENS_SIDECAR: the session's MCP sends to this server's queue instead of hosting a second one (D-127).
	return {
		...target,
		NETWORKLENS_SIDECAR: controlQueue.endpoint,
		...(target.TEST_FORGE_SIMULATOR_UDID && { TEST_FORGE_DEVICE_UDID: target.TEST_FORGE_SIMULATOR_UDID, NETWORKLENS_UDID: target.TEST_FORGE_SIMULATOR_UDID }),
	};
}

// Automatic preconditions (D-051, D-153): brings environment, NetworkLens and session to `requires`, replaying the
// routines with `replayOptions(prefix)`. Shared by replays and Claude runs.
async function meetPreconditions(requires, { replayOptions, say, macro = null }) {
	const runRoutine = async (routineId) => {
		const routine = await findMacroV2(routineId);
		if (!routine) return { ok: false, reason: `routine ${routineId} not found` };
		say(`  ▸ ${routine.name}`);
		return replayMacroV2(routine, replayOptions("    "));
	};
	const probeLoggedOut = async () => {
		const probe = await replayMacroV2({ steps: [{ do: "run", macro: ROUTINES.openHome }, { id: "probe", do: "waitFor", el: HOME_LOGIN_ELEMENT, timeout: 4 }] }, { ...replayOptions(), onStep: () => {}, onStepStart: () => {}, ignoreLaunchInputs: true });
		if (probe.ok) return true;
		if (probe.results.at(-1)?.id === "probe") return false;
		throw new Error(`couldn't reach Home to check the session: ${probe.reason ?? probe.verdict}`);
	};
	return resolvePreconditions(requires, {
		readEnvironment, readDefault: (key) => readAppDefault(key), setDefault: (key, value) => defaultHost.setDefault(undefined, key, value),
		relaunch: () => replayMacroV2({ steps: [{ id: "relaunch", do: "relaunch" }] }, replayOptions("    ")),
		runRoutine, probeLoggedOut, say,
		isAppRunning: () => isAppRunning(BUNDLE_ID),
		runsRoutineFirst: (routineId) => runsRoutine(macro, routineId),
	});
}

/** True when the macro runs that routine itself (after its own mocks and setup routines), so preconditions needn't. */
function runsRoutine(macro, routineId) {
	return (macro?.steps ?? []).some((step) => step.do === "run" && step.macro === routineId);
}

function describeRequires(requires) {
	return [
		requires.environment && `environment ${requires.environment}`,
		requires.networkLens && "NetworkLens on",
		requires.session === "loggedIn" && "logged in",
		requires.session === "loggedOut" && "logged out",
		requires.reloadHome && "app relaunched so Home loaded for that session",
		requires.startScreen && `app on ${START_SCREENS[requires.startScreen]?.label ?? requires.startScreen}`,
	].filter(Boolean).join(", ");
}

tasks.register("test-forge-run", {
	lane: "device",
	executor: async (task, controls) => {
		const { caseId, scenario, prompt, jobId, sessionId, purpose = "run" } = task.payload;
		const job = getJob(jobId);
		const target = await testingTarget();
		// A follow-up turn (D-064: save the case as a macro) continues the run's own session, which
		// still knows every step it took.
		const continued = sessionId ? sessions.get(sessionId) : null;
		const isContinued = Boolean(continued && continued.record.status !== "closed");
		// D-158: a new session starts on the model the case looks like it needs; a continued one keeps its own.
		const pick = isContinued ? null : pickModel(loadedCases.find((entry) => entry.id === caseId) ?? { id: caseId, scenario }, {
			history: await listRuns(300).catch(() => []),
			purpose,
			override: task.payload.model ?? process.env.TEST_FORGE_RUN_MODEL ?? "auto",
			buildId: (await buildStamp().catch(() => null))?.buildId ?? null,
		});
		const session = isContinued ? continued : sessions.create({
			projectDir: await sessionProjectDir(DEFAULT_PROJECT_DIR),
			title: `▶ ${caseId}${scenario ? ` — ${scenario}` : ""}`,
			model: pick?.model,
			meta: { taskId: task.id, caseId, branch: target?.branch, sha: target?.sha },
			// Unattended only when this machine allows it; a batch may still choose "ask" (D-061).
			options: {
				...(process.env.TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE === "1" && task.payload.approval !== "ask" && { permissionMode: "bypassPermissions" }),
				env: await testForgeSessionEnv(),
			},
		});
		const downshift = isContinued ? followUpModel(session.record.model, purpose) : null;
		if (downshift) {
			await session.setModel(downshift, `${purpose} turn — no need for ${MODEL_LABELS[session.record.model]}`);
			if (job) appendLine(job, `● model: ${MODEL_LABELS.opus} → ${MODEL_LABELS[downshift]} for the ${purpose} turn`);
		}
		controls.update({ sessionId: session.id });
		if (job) {
			job.meta.sessionId = session.id;
			appendLine(job, `● session started — open it in Sessions to watch, chat or answer questions`);
		}
		const stopMirror = job ? mirrorSessionToJob(session, job) : () => {};
		controls.onCancel(() => session.interrupt());
		await deviceLock.acquire(session.id, session.record.title);
		await parkLensBubble({ udid: deviceArg(), bundleId: BUNDLE_ID });
		const healError = await healHarnessIfDue((line) => job && appendLine(job, line)).then(() => null, (error) => error.message);
		if (healError) {
			stopMirror();
			deviceLock.release(session.id);
			if (job) {
				appendLine(job, `! ${healError}`);
				finishJob(job, { status: "error", verdict: "BLOCKED" });
			}
			return { verdict: "BLOCKED", error: healError };
		}
		// D-153: what the case needs on the phone (e.g. SF-* → logged in, Home reloaded) is set up before Claude starts,
		// with the same routines a replay uses; Claude is told it's done so it doesn't redo or undo it.
		const requires = purpose === "run" ? requirementsFor(caseId, await loadCaseRules(uiTestRoot())) : {};
		let preconditionNote = "";
		if (Object.keys(requires).length) {
			const say = (line) => job && appendLine(job, line);
			const registry = await loadRegistry();
			const replayOptions = (prefix = "") => ({
				registry,
				send: (command, { timeoutMs }) => postCommand(command, { timeoutMs, recover: false }),
				restart: harnessEnsure,
				loadMacro: findMacroV2,
				host: { ...defaultHost, mock: armMock, screenshot: hostScreenshot, requested: traceRequested, ask: (question) => prompts.ask({ ...question, taskId: task.id }) },
				isCancelled: () => Boolean(task.isCancelRequested),
				onStepStart: async () => {},
				onStep: (row) => say(`${prefix}${row.ok || row.skipped ? "✓" : "✗"} ${row.index + 1}. ${row.text} — ${row.ms} ms${row.ok || row.skipped ? "" : ` — ${row.reason}`}`),
			});
			const setup = await meetPreconditions(requires, { replayOptions, say }).catch((error) => ({ ok: false, reason: error.message }));
			if (!setup.ok || task.isCancelRequested) {
				stopMirror();
				deviceLock.release(session.id);
				const verdict = task.isCancelRequested ? "CANCELLED" : "BLOCKED";
				if (job) {
					appendLine(job, verdict === "BLOCKED" ? `● BLOCKED — precondition not met: ${setup.reason}` : "● CANCELLED during preconditions");
					finishJob(job, { status: verdict === "BLOCKED" ? "error" : "cancelled", verdict });
				}
				await appendRun({ caseId, scenario, mode: purpose, verdict, sessionId: session.id, durationMs: 0 });
				return { verdict, error: setup.reason };
			}
			preconditionNote = `\n\nPreconditions already met by TestForge before you started: ${describeRequires(requires)}. Don't redo or undo them.`;
		}
		const turnStartedAt = Date.now();
		const turnEnd = nextTurnEnd(session);
		if (pick && job) {
			appendLine(job, `● model: ${describePick(pick)}`);
			narrator.setModel(job.id, { model: pick.model, reason: pick.isAuto ? `auto · ${pick.reasons.join(", ")}` : "chosen by hand" });
		}
		const escalations = [];
		// Only an automatic pick moves up; a model chosen by hand stays for the whole run.
		const watch = pick?.isAuto ? watchForEscalation(session, {
			model: pick.model,
			escalate: async (next, reason, from) => {
				await session.setModel(next, reason);
				escalations.push({ from, to: next, reason, at: new Date().toISOString() });
				if (job) {
					appendLine(job, `● model: ${MODEL_LABELS[from]} → ${MODEL_LABELS[next]} — ${reason}`);
					narrator.setModel(job.id, { model: next, reason: `moved up from ${MODEL_LABELS[from]} · ${reason}` });
				}
			},
		}) : null;
		session.send(`${prompt}${preconditionNote}`);
		const result = await turnEnd;
		watch?.stop();
		stopMirror();
		// D-154: the runner writes screenshots to its own folder; a single Claude run files them into the active Test
		// Batch's `<case>/` folder too, as a batch-run item's evidence already is.
		const proof = purpose === "run" ? await copyIntoBatchFolder(await proofWrittenBetween(turnStartedAt, Date.now()), caseId).catch(() => []) : [];
		if (job && proof.length) appendLine(job, `● proof filed: ${proof.length} file${proof.length > 1 ? "s" : ""} in ${(await proofFolderFor(caseId)) ?? dirname(proof[0])}`);
		if (job) job.meta.finalText = result?.result ?? "";
		// The account's usage limit stopped the turn — not the case. Nothing is recorded; a batch requeues it and pauses.
		if (isUsageLimit(result)) {
			if (job) {
				job.meta.usageLimit = result.result || "Claude's usage limit was reached";
				appendLine(job, `⏸ ${job.meta.usageLimit}`);
				finishJob(job, { status: "error", verdict: "USAGE_LIMIT" });
			}
			return { verdict: "USAGE_LIMIT", error: result.result };
		}
		// A run that ends without a verdict line (e.g. /test-forge-run stopped in its preflight) is UNDECIDED,
		// not blank, so the results review asks a person (D-068).
		const verdict = task.isCancelRequested ? "CANCELLED" : purpose === "run" ? (extractVerdict(result?.result, job?.lines ?? []) ?? "UNDECIDED") : (result && !result.is_error ? "DONE" : "ERROR");
		let status = result && !result.is_error ? "done" : "error";
		if (task.isCancelRequested) status = "cancelled";
		if (job) finishJob(job, { status, verdict });
		await appendRun({
			caseId,
			scenario,
			mode: purpose,
			verdict,
			sessionId: session.id,
			...(proof.length && { screenshots: proof }),
			turns: result?.num_turns,
			durationMs: result?.duration_ms,
			costUsd: result?.total_cost_usd,
			...(pick && { model: watch?.model ?? pick.model, modelPick: { initial: pick.model, isAuto: pick.isAuto, score: pick.score, reasons: pick.reasons, escalations } }),
		});
		return { verdict, costUsd: result?.total_cost_usd, error: status === "error" ? (result?.result || "the run ended without a result") : undefined };
	},
});

tasks.register("replay", {
	lane: "device",
	executor: async (task) => {
		const { caseId, scenario, macroName, jobId } = task.payload;
		const job = getJob(jobId);
		await deviceLock.acquire(task.id, task.title);
		try {
			const healError = await healHarnessIfDue((line) => job && appendLine(job, line)).then(() => null, (error) => error.message);
			if (healError) {
				if (job) finishJob(job, { status: "error", verdict: "BLOCKED" });
				return { verdict: "BLOCKED", error: healError };
			}
			const result = await replayMacro(
				macroName,
				({ index, command, outcome, failed }) => {
					if (job) appendLine(job, `${failed ? "✗" : "✓"} step ${index + 1}: ${command.kind} → ${JSON.stringify(outcome)}`);
				},
				() => Boolean(task.isCancelRequested),
			);
			if (result.error && job) appendLine(job, `! ${result.error}`);
			let verdict = "PASS (driver-level, no adjudication)";
			let status = "done";
			if (result.cancelledAt !== undefined) {
				verdict = "CANCELLED";
				status = "cancelled";
			} else if (!result.ok) {
				verdict = result.failedAt === undefined ? "BLOCKED (macro not resolved)" : `FAIL at step ${result.failedAt + 1}`;
				status = "error";
			}
			if (job) finishJob(job, { status, verdict });
			await appendRun({ caseId, scenario, mode: "replay", macroName, verdict });
			return { verdict, error: status === "error" ? verdict : undefined };
		} finally {
			deviceLock.release(task.id);
		}
	},
});

tasks.register("replay-v2", {
	lane: "device",
	executor: async (task, controls) => {
		controls?.onCancel?.(() => prompts.cancelForTask(task.id));
		const { macroId, jobId, video, demo: isDemo, explain: isExplained } = task.payload;
		const job = getJob(jobId);
		const say = (line) => job && appendLine(job, line);
		// D-113: the planned window is filmed during the macro's own steps only, never its preconditions.
		const film = video?.plan?.needed ? videoWindow(video.plan, { start: () => startCaseVideo(video.caseId), trim: trimToLast }) : null;
		let activeDemo = null;
		const finish = async (outcome) => {
			const videoPath = await film?.stop();
			if (job && videoPath) job.meta.videoPath = videoPath;
			if (job) finishJob(job, outcome);
		};
		await deviceLock.acquire(task.id, task.title);
		const runStartedAt = Date.now();
		// The banner over the Simulator while nothing there is worth watching yet; a step's own message replaces it.
		const busy = (message) => jobId && narrator.busy(jobId, message);
		// Names the precondition being met, so its routine's steps read "Getting the app ready — Logging in".
		let setupLabel = null;
		try {
			const macro = await findMacroV2(macroId);
			if (!macro) throw new Error(`macro ${macroId} not found`);
			if (jobId) narrator.begin(jobId, { caseId: caseLinks(macro)[0] ?? macro.id, title: macro.name, source: "macro" });
			busy("Getting the test runner ready");
			await healHarnessIfDue(say);
			// D-126: the NetworkLens bubble waits over the status bar, out of every tap (applies at the next app launch).
			const bubble = await parkLensBubble({ udid: deviceArg(), bundleId: BUNDLE_ID });
			if (bubble === "parked") say("● moved the NetworkLens bubble over the status bar (the app was restarted once for it)");
			const registry = await loadRegistry();
			const replayOptions = (prefix = "") => ({
				registry,
				send: (command, { timeoutMs }) => postCommand(command, { timeoutMs, recover: false }),
				restart: harnessEnsure,
				loadMacro: findMacroV2,
				host: { ...defaultHost, mock: armMock, screenshot: hostScreenshot, requested: traceRequested, ask: (question) => prompts.ask({ ...question, taskId: task.id }) },
				isCancelled: () => Boolean(task.isCancelRequested),
				onStepStart: async (rawStep) => {
					if (!jobId) return;
					// A precondition's routine runs as its own macro; its steps are setup all the same.
					const step = prefix && !rawStep.from ? { ...rawStep, from: "precondition", routineName: setupLabel ?? rawStep.routineName } : rawStep;
					narrator.stepStarted(jobId, { ...step, logIndex: job?.lines.length ?? null });
					const frame = await stepFrames.frameFor(step);
					if (frame) narrator.stepFrame(jobId, { ...step, frame, screen: deviceScreen() });
				},
				onStep: (row) => {
					if (jobId) narrator.stepEnded(jobId, row);
					if (row.note) return say(`${prefix}↻ ${row.note}`);
					const via = { email: " (OTP read from Outlook)", person: " (typed by a person)", simctl: " (taken by the host — the runner didn't answer)" }[row.via] ?? "";
					const scrolled = row.nudges ? ` (scrolled into view: ${row.nudges} swipe${row.nudges > 1 ? "s" : ""} from ${row.scrolledFrom})` : "";
					const how = `${row.resolvedBy === "label" ? " (by text)" : ""}${via}${scrolled}`;
					if (row.skipped) return say(`${prefix}↷ ${row.index + 1}. ${row.text} — skipped (${row.reason ?? "not shown"}) — ${row.ms} ms`);
					say(`${prefix}${row.ok ? "✓" : "✗"} ${row.index + 1}. ${row.text}${how} — ${row.ms} ms${row.ok ? "" : ` — ${row.reason}`}`);
				},
			});
			// Automatic preconditions (D-051): environment, NetworkLens and session are brought to what the
			// macro declares in `requires` before its own first step; nobody picks a setup macro.
			// D-153: the case's own needs (case-requirements.json) come first; the recording's `requires` wins over them.
			const caseRules = await loadCaseRules(uiTestRoot());
			const requires = { ...(usesMocks(macro) ? { networkLens: true } : {}), ...requirementsFor(caseLinks(macro)[0], caseRules), ...macro.requires };
			if (Object.keys(requires).length) {
				busy("Getting the app ready");
				const sayStep = (line) => {
					const label = /^⚙ precondition: (.+)$/.exec(line)?.[1];
					if (label) {
						setupLabel = label.replace(/^environment /, "switching environment ").replace(/^(.)/, (first) => first.toUpperCase());
						busy(`Getting the app ready — ${setupLabel}`);
					}
					say(line);
				};
				const setup = await meetPreconditions(requires, { replayOptions, say: sayStep, macro });
				if (task.isCancelRequested) {
					say("● CANCELLED during preconditions");
					await finish({ status: "cancelled", verdict: "CANCELLED" });
					return { verdict: "CANCELLED" };
				}
				if (!setup.ok) {
					say(`● BLOCKED — precondition not met: ${setup.reason}`);
					await finish({ status: "error", verdict: "BLOCKED" });
					await appendRun({ caseId: caseLinks(macro)[0] ?? macro.id, scenario: macro.name, mode: "replay", macroName: macro.name, macroId: macro.id, verdict: "BLOCKED", durationMs: 0, steps: [{ id: "preconditions", text: "Preconditions", ok: false, ms: 0, reason: setup.reason }] });
					return { verdict: "BLOCKED", error: setup.reason };
				}
				say(`▶ ${macro.name}`);
			}
			if (film) say(`🎥 ${video.plan.reason} — filming steps ${video.plan.startIndex + 1}–${video.plan.stopIndex + 1}, keeping the last ${video.plan.maxSeconds} s`);
			const options = replayOptions();
			// D-164: a demo films the whole macro, frames where to look and pauses so the subtitles can be read.
			// D-165: a demo is always explained live too; the overlay is a Mac window, so the device recording never shows it.
			const explainer = isDemo || isExplained ? explainRecorder(macro, jobId) : null;
			busy(null);
			if (explainer) await showExplainIntro(macro, jobId);
			const demo = isDemo ? await startDemo(macro, say, explainer) : null;
			activeDemo = demo;
			if (explainer && !demo) explainer.begin();
			const hooks = film ?? explainer;
			const result = await replayMacroV2(macro, hooks ? {
				...options,
				onStepStart: async (step) => (await hooks.onStepStart(step), options.onStepStart(step)),
				onStep: async (row) => (options.onStep(row), await hooks.onStep(row)),
			} : options);
			if (demo) {
				const dir = await finishDemo(demo, { macro, verdict: result.verdict, say });
				if (job) job.meta.demoDir = dir;
			}
			say(`● ${result.verdict} in ${(result.durationMs / 1000).toFixed(1)} s${result.attempts > 1 ? " (after a harness restart)" : ""}`);
			const interceptor = result.ok || result.verdict === "CANCELLED" ? null : await interceptorNote(macro, runStartedAt);
			interceptor?.lines.forEach((line) => say(`${interceptor.suspicious ? "⚠" : "ℹ"} ${line}`));
			let status = result.ok ? "done" : "error";
			if (result.verdict === "CANCELLED") status = "cancelled";
			await finish({ status, verdict: result.verdict });
			await appendRun({
				caseId: caseLinks(macro)[0] ?? macro.id,
				scenario: macro.name,
				mode: "replay",
				macroName: macro.name,
				macroId: macro.id,
				verdict: result.verdict,
				durationMs: result.durationMs,
				interceptor: interceptor && { source: interceptor.source, isMockingEnabled: interceptor.isMockingEnabled, armed: interceptor.armed },
				steps: result.results.map(({ id, text, ok, ms, reason, resolvedBy, attempt }) => ({ id, text, ok, ms, reason, resolvedBy, attempt })),
			});
			return { verdict: result.verdict, error: result.ok ? undefined : result.reason ?? result.verdict };
		} catch (error) {
			say(`! ${error.message}`);
			await finish({ status: "error", verdict: "BLOCKED" });
			return { verdict: "BLOCKED", error: error.message };
		} finally {
			// A demo whose replay threw must not leave simctl recording.
			if (activeDemo && !activeDemo.isStopped) await activeDemo.video.stop().catch(() => {});
			deviceLock.release(task.id);
		}
	},
});

/** Free-form Claude task from the Queue / Work tabs: a session whose first turn is the task. */
tasks.register("claude", {
	lane: "general",
	executor: async (task, controls) => {
		const { projectDir, prompt, model, title } = task.payload;
		const session = sessions.create({ projectDir: projectDir || (await sessionProjectDir(DEFAULT_PROJECT_DIR)), title: title || task.title, model, meta: { taskId: task.id, ...task.links } });
		controls.update({ sessionId: session.id });
		controls.onCancel(() => session.interrupt());
		const turnEnd = nextTurnEnd(session);
		session.send(prompt);
		const result = await turnEnd;
		return { costUsd: result?.total_cost_usd, error: result && !result.is_error ? undefined : (result?.result || "ended without a result") };
	},
});

app.post("/api/testcases/:id/run", async (req, res) => {
	const testCase = loadedCases.find((entry) => entry.id === req.params.id);
	if (!testCase) return res.status(404).json({ error: "no such case — load the doc first" });
	const { techDocPath } = req.body;
	if (refuseWhileTesting(res)) return;
	if (await refuseUnlessReady(res, { needsClaude: true })) return;

	const { job, task } = confirmAfterPass(testCase, enqueueTestForgeRun(testCase, { techDocPath, model: req.body.model }));
	res.json({ ok: true, jobId: job.id, taskId: task.id });
});

// D-127: the script first — it goes through this dashboard (live in the app, state shown in the TestForge); the MCP stays as
// the fallback for what the script does not cover yet (scenarios, script variants).
const MOCK_HINT = `Mocks on this simulator: run \`${join(__dirname, "scripts", "test-forge-lens.mjs")}\` with Bash `
	+ "(state · mock \"GET /backend/…\" <variant> · off \"GET /backend/…\" · mocking on|off · calls --grep text · call <id> --curl · mock-call <id>); "
	+ "the `networklens` MCP (lens_list, lens_set_variant, lens_set_mocking) is the fallback. "
	+ "Ready-made rules for this app's APIs, with named variants, are on the device and in BlibliMobile-iOS/BlibliMobile_XCUITest/TestForgeMacros/mocks/*.networklens-pack.json: "
	+ "when a case needs data the live backend lacks, arm the matching variant before judging. "
	+ "Learned macros (BlibliMobile-iOS/BlibliMobile_XCUITest/**/macros/*.json) show proven routes into each screen — reuse their entry steps before exploring.";

const CASE_FIELDS = [["precondition", "Precondition"], ["steps", "Steps"], ["expected", "Expected"], ["api", "API"], ["evidence", "Evidence"]];

/** The case's row as loaded in the dashboard, for the run prompt. */
function caseRowText(testCase) {
	const fields = CASE_FIELDS.filter(([key]) => testCase[key]).map(([key, label]) => `${label}: ${String(testCase[key]).replace(/\s+/g, " ").trim()}`);
	if (!fields.length) return "";
	// D-166: a locally corrected case must win over the document, which still has the old text.
	if (testCase.localEdit) {
		const edited = testCase.localEdit.fields.join(", ");
		return `The case's row, with the tester's local corrections (${edited}) — these override the document, judge against them: ${fields.join(" | ")}.`;
	}
	return `The case's row, as loaded from the document (use it if the document can't be read): ${fields.join(" | ")}.`;
}

const START_SCREEN_HINT = [
	"Before step 1, decide what the case needs from the app and bring it there: the start screen it expects",
	"(Home, or any screen when the case opens its own page with a deeplink) and its base UI needs (environment, logged in or out, onboarding done).",
	"Add one line before the verdict: `START: {\"startScreen\": \"home\"|\"anyScreen\"|\"freshLaunch\"|\"<Screen>\", \"environment\": …, \"session\": …}` with only what the case depends on.",
].join(" ");

function enqueueTestForgeRun(testCase, { techDocPath, approval, videoNote = "", model } = {}) {
	// The source doc goes first so /test-forge-run reads the full row (precondition, steps, API) itself; the
	// case id narrows the run to this one row.
	const caseDescription = `${testCase.id}: ${testCase.scenario || ""}`.trim();
	const prompt = [
		"/test-forge-run",
		loadedSource,
		techDocPath || "",
		`— run only case ${caseDescription}.`,
		// The loaded row itself, so a run never depends on re-reading the document (a stale local snapshot or an
		// unreachable Confluence blocked SF-062).
		caseRowText(testCase),
		// D-180: the tester's override comments clarify what passing means; leniency says how strictly to judge.
		reviewerNotesText(testCase.resultOverrides),
		// Without this Claude never armed a mock (D-071); the plugin's `test-forge-mock` proxy is deleted (D-072).
		MOCK_HINT,
		videoNote,
		// D-185: the case's start screen and base UI needs are decided on the first run and kept for every replay.
		START_SCREEN_HINT,
		// The dashboard reads the verdict from this line only (D-070).
		"End your answer with exactly one line `VERDICT: <PASS|FAIL|BLOCKED|EVIDENCE_ONLY|UNDECIDED> — <one sentence>`; BLOCKED when the case did not run (a gate, setup or missing data stopped it).",
	].filter(Boolean).join(" ");

	return enqueueClaudeTurn({ caseId: testCase.id, scenario: testCase.scenario, prompt, title: `▶ Run ${testCase.id}`, approval, model });
}

/**
 * D-220: a single Claude run that passes is confirmed the way a batch confirms it — a case with a recording replays
 * it; one without is saved as a macro and proven by a replay. Until a replay passes, the case shows UNCONFIRMED.
 */
function confirmAfterPass(testCase, enqueued, { approval } = {}) {
	jobDone(enqueued.job).then(async (outcome) => {
		if (!String(outcome.verdict ?? "").startsWith("PASS") || outcome.usageLimit) return;
		const macro = (await listMacrosV2()).find((entry) => caseLinks(entry).includes(String(testCase.id).toUpperCase()));
		if (macro) return enqueueReplay(macro);
		const item = { caseId: testCase.id, scenario: testCase.scenario, verdict: outcome.verdict, jobId: enqueued.job.id };
		return learnMacro(item, { attach: () => {}, isStopped: () => false, approval });
	}).catch((error) => console.error(`confirming ${testCase.id} failed:`, error));
	return enqueued;
}

/** One Claude turn in the device lane: a new session, or the next turn of `sessionId` (D-064). */
function enqueueClaudeTurn({ caseId, scenario, prompt, title, approval, sessionId = null, purpose = "run", model }) {
	const job = jobForTask({ kind: purpose, caseId }, title);
	const task = tasks.enqueue({ kind: "test-forge-run", title, payload: { caseId, scenario, prompt, jobId: job.id, approval, sessionId, purpose, ...(model && { model }) }, links: { caseId } });
	linkJobToTask(job, task);
	return { job, task };
}

// --- P6: driver first, Claude only on an issue (D-064) -------------------------

const handleFor = (job, phase) => ({ jobId: job.id, phase, done: jobDone(job), cancel: () => cancelJob(job.id) });

/**
 * A replay that didn't pass: Claude classifies it (app bug / broken macro / environment). A repaired
 * macro is replayed by the driver at once — that replay's verdict is the case's verdict, flagged
 * "repaired" with the files Claude changed, for a person to review.
 */
async function triageFailure(item, { attach, isStopped, approval }) {
	const macro = await findMacroV2(item.macroId);
	if (!macro) return null;
	const log = (getJob(item.jobId)?.lines ?? []).slice(-80).join("\n");
	const screenshot = await hostScreenshot(`triage-${item.caseId}`).catch(() => null);
	const root = uiTestRoot();
	const before = await snapshotMacroFiles(root);
	const turn = enqueueClaudeTurn({ caseId: item.caseId, scenario: item.scenario, prompt: triagePrompt({ item, macro, root, log, screenshot }), title: `🩺 Triage ${item.caseId}`, approval, purpose: "triage" });
	attach(handleFor(turn.job, "triage"));
	await jobDone(turn.job);
	if (isStopped()) return null;
	// D-220: no triage happened; the failed replay's verdict stands and the batch pauses.
	if (turn.job.meta.usageLimit) return { triage: { kind: "NOT_RUN", summary: "Claude's usage limit stopped the triage" }, usageLimit: turn.job.meta.usageLimit };
	const triage = { ...parseTriage(turn.job.meta.finalText || turn.job.lines.slice(-20).join("\n")), sessionId: turn.job.meta.sessionId, costUsd: await taskCost(turn.task.id), changedFiles: changedFiles(before, await snapshotMacroFiles(root)) };
	if (triage.kind === "MACRO_BROKEN" && triage.changedFiles.length) {
		const repaired = await findMacroV2(item.macroId);
		const replay = enqueueReplay(repaired);
		attach(handleFor(replay.job, "replay after repair"));
		const outcome = await jobDone(replay.job);
		return { triage, repaired: true, verdictBeforeRepair: item.verdict, verdict: outcome.verdict ?? outcome.status?.toUpperCase() };
	}
	if (triage.kind === "ENVIRONMENT") return { triage, verdictBeforeTriage: item.verdict, verdict: `BLOCKED (environment: ${triage.summary})` };
	return { triage };
}

/**
 * A case Claude passed: the same session saves it as a macro linked to the case; the driver replays
 * it once, and only a passing replay keeps it (a new macro file that fails is removed again).
 */
async function learnMacro(item, { attach, isStopped, approval }) {
	const sessionId = getJob(item.jobId)?.meta.sessionId;
	if (!sessionId) return null;
	const root = uiTestRoot();
	const macros = await listMacrosV2(root);
	const routines = macros.filter((macro) => macro.kind === "routine").map(({ id, name }) => ({ id, name }));
	const example = join(root, macros.find((macro) => macro.id === "mc_E5INNJFSM4")?.path ?? macros[0]?.path ?? "");
	const before = await snapshotMacroFiles(root);
	const turn = enqueueClaudeTurn({ caseId: item.caseId, scenario: item.scenario, sessionId, prompt: learnPrompt({ item, root, routines, example }), title: `📝 Save ${item.caseId} as a macro`, approval, purpose: "learn" });
	attach(handleFor(turn.job, "saving a macro"));
	await jobDone(turn.job);
	if (isStopped()) return null;
	const changed = changedFiles(before, await snapshotMacroFiles(root));
	const costUsd = await taskCost(turn.task.id);
	// D-220: Claude's pass counts only once a replay of the saved recording passes; until then it is UNCONFIRMED.
	const unconfirmed = (reason, extra = {}) => ({ claudeVerdict: item.verdict, verdict: UNCONFIRMED, learned: { ok: false, reason, changedFiles: changed, costUsd, ...extra } });
	if (turn.job.meta.usageLimit) return { ...unconfirmed("Claude's usage limit stopped saving the recording"), usageLimit: turn.job.meta.usageLimit };
	const named = parseLearnedMacroId(turn.job.meta.finalText);
	const learned = (await listMacrosV2(root)).find((macro) => macro.id === named || caseLinks(macro).includes(String(item.caseId).toUpperCase()));
	if (!learned) return unconfirmed("Claude didn't save a macro linked to the case");
	const replay = enqueueReplay(learned);
	attach(handleFor(replay.job, "proving the macro"));
	const outcome = await jobDone(replay.job);
	const isProven = String(outcome.verdict ?? "").startsWith("PASS");
	const isNew = !before.has(learned.path);
	if (!isProven && isNew) await unlink(join(root, learned.path)).catch(() => {});
	// `path` and `aliases` are what listing adds, not macro content; a copy of them in the file goes stale.
	if (isProven) {
		const file = join(root, learned.path);
		const { path: _path, aliases: _aliases, ...content } = JSON.parse(await readFile(file, "utf8"));
		await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
	}
	const learnedResult = { macroId: learned.id, macroName: learned.name, path: learned.path, replayVerdict: outcome.verdict, removed: !isProven && isNew, changedFiles: changed, costUsd };
	if (!isProven) return { claudeVerdict: item.verdict, verdict: UNCONFIRMED, learned: { ok: false, reason: `the saved recording's replay ended ${outcome.verdict ?? "without a verdict"}`, ...learnedResult } };
	return { learned: { ok: true, ...learnedResult } };
}

app.post("/api/testcases/:id/replay", async (req, res) => {
	const testCase = loadedCases.find((entry) => entry.id === req.params.id);
	if (!testCase) return res.status(404).json({ error: "no such case — load the doc first" });
	const { macroName } = req.body;
	if (!macroName) return res.status(400).json({ error: "macroName is required" });
	if (refuseWhileTesting(res)) return;
	if (await refuseUnlessReady(res)) return;
	const title = `⚡ Replay ${testCase.id} (${macroName})`;
	const job = jobForTask({ kind: "replay", caseId: testCase.id }, title);
	const task = tasks.enqueue({ kind: "replay", title, payload: { caseId: testCase.id, scenario: testCase.scenario, macroName, jobId: job.id }, links: { caseId: testCase.id } });
	linkJobToTask(job, task);
	res.json({ ok: true, jobId: job.id, taskId: task.id });
});

app.get("/api/runs", async (_req, res) => res.json({ runs: await listRuns() }));

// --- P4: batch run (D-061) ------------------------------------------------------

/** Resolves when a job ends, with its final status and verdict. */
function jobDone(job) {
	const outcome = () => ({ status: job.status, verdict: job.verdict, usageLimit: job.meta?.usageLimit ?? null });
	if (job.status !== "running") return Promise.resolve(outcome());
	return new Promise((resolve) => job.emitter.once("end", () => resolve(outcome())));
}

/** Claude's stream result when the account hit its usage limit (HTTP 429 `usage_limit_reached`). */
function isUsageLimit(result) {
	return result?.api_error === "usage_limit_reached" || (result?.is_error && result?.api_error_status === 429);
}

const STEP_LINE = /^\s*(✓|✗|↷|→|▶|⚙|●|⏸)/;

// The XCUITest runner writes its own screenshots under the folder baked into TestForgeDriver.xctestplan at build time
// (`TestForge-Test` → ~/Documents/TestForge-Test), so it can't follow the Test Batch folder (D-109). Evidence is searched there
// too, and a case's files are copied into the batch folder.
const RUNNER_MEDIA_ROOT = process.env.TEST_FORGE_RUNNER_MEDIA_ROOT || join(homedir(), "Documents", "TestForge-Test");

/** Folders proof may land in: the active batch folder (TEST_FORGE_MEDIA_ROOT) and the runner's, one level deep each. */
async function proofFolders() {
	const roots = [...new Set([process.env.TEST_FORGE_MEDIA_ROOT, RUNNER_MEDIA_ROOT].filter(Boolean))];
	const folders = [];
	for (const root of roots) {
		const children = (await readdir(root, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
		folders.push(root, ...children);
	}
	return [...new Set(folders)];
}

/**
 * Copies runner-written proof into `<batch folder>/<case id>/`; returns the copies' paths (originals when no batch
 * folder). A copy keeps the original's mtime, or the next case's time window would claim it as its own evidence.
 */
async function copyIntoBatchFolder(entries, caseId) {
	const paths = entries.map((entry) => entry.path);
	const target = process.env.TEST_FORGE_MEDIA_ROOT;
	if (!target) return paths;
	const folder = join(target, String(caseId).replace(/[^\w.-]/g, "_"));
	const copied = [];
	for (const path of paths) {
		if (path.startsWith(`${target}/`)) {
			copied.push(path);
			continue;
		}
		const destination = join(folder, basename(path));
		const modifiedAt = new Date(entries.find((entry) => entry.path === path).mtimeMs);
		await mkdir(folder, { recursive: true });
		await copyFile(path, destination)
			.then(() => utimes(destination, modifiedAt, modifiedAt))
			.then(() => copied.push(destination), () => copied.push(path));
	}
	return copied;
}
let mediaCache = { at: 0, sinceMs: 0, path: null };

/** The newest screenshot under TEST_FORGE_MEDIA_ROOT written since `sinceMs` (evidence from replay or Claude). */
async function latestScreenshot(sinceMs) {
	if (Date.now() - mediaCache.at < 2000 && mediaCache.sinceMs === sinceMs) return mediaCache.path;
	let best = null;
	{
		for (const folder of await proofFolders()) {
			for (const name of await readdir(folder).catch(() => [])) {
				if (!name.endsWith(".png") || /harness-probe/.test(name)) continue;
				const info = await stat(join(folder, name)).catch(() => null);
				if (info && info.mtimeMs >= sinceMs && (!best || info.mtimeMs > best.mtimeMs)) best = { path: join(folder, name), mtimeMs: info.mtimeMs };
			}
		}
	}
	mediaCache = { at: Date.now(), sinceMs, path: best?.path ?? null };
	return mediaCache.path;
}

let activeBatch = null;

async function batchView() {
	const canRunUnattended = process.env.TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE === "1";
	if (!activeBatch) return { batch: null, canRunUnattended };
	const snapshot = activeBatch.snapshot();
	for (const item of snapshot.items) if (item.jobId && !item.sessionId) item.sessionId = getJob(item.jobId)?.meta?.sessionId ?? null;
	const current = snapshot.items.find((item) => item.status === "running" || item.status === "skipping");
	let live = null;
	if (current?.jobId) {
		const job = getJob(current.jobId);
		const step = [...(job?.lines ?? [])].reverse().find((line) => STEP_LINE.test(line))?.trim() ?? null;
		live = { caseId: current.caseId, jobId: current.jobId, step, sessionId: current.sessionId, screenshot: await latestScreenshot(Date.parse(current.startedAt)) };
	}
	return { batch: snapshot, live, canRunUnattended };
}

app.get("/api/batch", async (_req, res) => res.json(await batchView()));

// The live view's "what the simulator shows now": one `simctl io screenshot` at most every 2 s,
// shared by every viewer; the runner is not involved, so it never disturbs the test.
let liveScreen = { at: 0, pending: null, png: null };
app.get("/api/simulator/screen.png", async (_req, res) => {
	if (Date.now() - liveScreen.at > 2000 && !liveScreen.pending) {
		const path = join(tmpdir(), `test-forge-live-screen-${process.pid}.png`);
		liveScreen.pending = run("xcrun", ["simctl", "io", deviceArg(), "screenshot", "--type=png", path], { timeout: 10_000 })
			.then(() => readFile(path))
			.then((png) => (liveScreen = { at: Date.now(), pending: null, png }))
			.catch(() => (liveScreen = { ...liveScreen, at: Date.now(), pending: null }));
	}
	if (liveScreen.pending && !liveScreen.png) await liveScreen.pending;
	if (!liveScreen.png) return res.status(503).end();
	res.set({ "Content-Type": "image/png", "Cache-Control": "no-store" }).send(liveScreen.png);
});

/** F1: replays every stale case that has a recording — no Claude; a failing replay is fixed from its own row. */
app.post("/api/batch/stale", async (req, res) => {
	const runs = await listRuns();
	const [{ macros = [] }, { staleFor }] = await Promise.all([ownApi("/api/macros"), stalenessNow(runs)]);
	const view = testcaseView({ cases: loadedCases, macros, runs, staleFor });
	const caseIds = view.cases.filter((entry) => entry.macro && entry.lastRun?.stale).map((entry) => entry.id);
	if (caseIds.length === 0) return res.status(400).json({ error: "no stale case with a recording" });
	if (refuseWhileTesting(res)) return;
	const items = planItems(caseIds.map((id) => loadedCases.find((entry) => entry.id === id)), await listMacrosV2()).filter((item) => item.mode === "replay");
	if (await refuseUnlessReady(res, { needsClaude: false })) return;
	await launchBatch({ items, approval: req.body?.approval, recordVideo: "auto" });
	res.json({ ...(await batchView()), caseIds });
});

/**
 * D-201: replays every recorded case of a finished Test Batch on the build installed now — driver only, no Claude — into
 * a new Test Batch that remembers which one it replays, so its row and report compare the two case by case.
 */
app.post("/api/test-batches/:id/replay", async (req, res) => {
	const source = testBatches.get(req.params.id);
	if (!source) return res.status(404).json({ error: "no such Test Batch" });
	if (refuseWhileTesting(res)) return;
	const runCases = (runId) => results.get(runId)?.items ?? [];
	const decided = batchCases(source, { runCases });
	const macros = await listMacrosV2();
	const planned = planItems(decided.map((entry) => loadedCases.find((testCase) => testCase.id === entry.caseId) ?? { id: entry.caseId, scenario: entry.scenario }), macros);
	const items = planned.filter((item) => item.mode === "replay");
	const skipped = planned.filter((item) => item.mode !== "replay").map((item) => item.caseId);
	if (items.length === 0) return res.status(400).json({ error: "none of this batch's cases has a recording to replay", skipped });
	if (await refuseUnlessReady(res, { needsClaude: false })) return;
	const build = await buildStamp().catch(() => ({}));
	const label = build.codeId ? `${build.branch} @ ${build.codeId}` : "current build";
	try {
		// D-212: the batch active now is paused, not ended — it can be resumed after the replay.
		const active = testBatches.active;
		const paused = active ? await testBatches.pause(active.id) : null;
		const name = String(req.body?.name ?? "").trim() || `${source.name} · replay on ${label}`;
		const batch = await testBatches.start(name, { replayOf: { id: source.id, name: source.name, caseIds: items.map((item) => item.caseId), build: label } });
		await launchBatch({ items, approval: req.body?.approval, recordVideo: "auto", noClaude: true });
		res.json({ batch, paused, caseIds: items.map((item) => item.caseId), skipped });
	} catch (error) {
		res.status(409).json({ error: error.message });
	}
});

/** F6 (D-196): which loaded cases a diff touches, for `/verify` and Tests › Verify my changes. Read-only. */
app.post("/api/verify/plan", async (req, res) => {
	const repo = join(__dirname, "..", "..");
	const range = typeof req.body?.range === "string" && /^[\w./~^-]+\.\.\.?[\w./~^-]+$/.test(req.body.range) ? req.body.range : undefined;
	const base = typeof req.body?.base === "string" && /^[\w./-]+$/.test(req.body.base) ? req.body.base : "develop";
	try {
		const outputs = await Promise.all(diffCommands({ range, base, isIncludingLocal: req.body?.includeLocal !== false })
			.map((args) => run("git", ["-C", repo, ...args], { timeout: 30_000 }).then((result) => result.stdout)));
		const changed = outputs.join("\n").split("\n").filter(Boolean);
		const plan = affectedCases({ changed, macros: await listMacrosV2(), caseIds: loadedCases.map((entry) => entry.id) });
		res.json({ range: range ?? `${base}...HEAD${req.body?.includeLocal === false ? "" : " + local edits"}`, changedFileCount: new Set(changed).size, ...plan });
	} catch (error) {
		res.status(400).json({ error: `git couldn't compare: ${error.message.split("\n")[0]}` });
	}
});

/** F3 (D-191): what a batch of these cases will do and what could stop it, before it starts. */
async function batchPlanFor(caseIds) {
	const cases = caseIds.map((id) => loadedCases.find((entry) => entry.id === id)).filter(Boolean);
	const macros = await listMacrosV2();
	const byId = new Map(macros.map((macro) => [macro.id, macro]));
	const fiveHour = usageFeed.view?.()?.fiveHour ?? null;
	return planBatch({
		items: planItems(cases, macros),
		macroOf: (id) => byId.get(id),
		currentEnvironment: await readEnvironment().catch(() => null),
		canRunUnattended: process.env.TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE === "1",
		usage: fiveHour ? { percent: fiveHour.usedPct, isNearLimit: fiveHour.usedPct >= 80 } : null,
	});
}

app.post("/api/batch/plan", async (req, res) => {
	const caseIds = Array.isArray(req.body?.caseIds) ? req.body.caseIds : loadedCases.map((entry) => entry.id);
	if (caseIds.length === 0) return res.status(400).json({ error: "no loaded case selected" });
	res.json(await batchPlanFor(caseIds));
});

app.post("/api/batch", async (req, res) => {
	const { caseIds = [], techDocPath, approval, recordVideo = "auto", model } = req.body ?? {};
	const cases = caseIds.map((id) => loadedCases.find((entry) => entry.id === id)).filter(Boolean);
	if (cases.length === 0) return res.status(400).json({ error: "no loaded case selected" });
	if (refuseWhileTesting(res)) return;
	// D-191: each environment and session is set up once, not once per case.
	const items = (await batchPlanFor(caseIds)).items;
	if (await refuseUnlessReady(res, { needsClaude: items.some((item) => item.mode === "claude") })) return;
	await launchBatch({ items, approval, techDocPath, recordVideo: [true, false].includes(recordVideo) ? recordVideo : "auto", model });
	res.json(await batchView());
});

/** What a run tested (workflow-plan §2): code, build, simulator, environment — kept with its results. */
async function runManifest() {
	const [stamp, simulator, environment] = await Promise.all([
		buildStamp().catch(() => ({})),
		findTestForgeSimulator().catch(() => null),
		readEnvironment().catch(() => null),
	]);
	return { ...stamp, simulator: simulator ? `${simulator.name} (${simulator.udid})` : null, environment };
}

/** A finished task's Claude cost (null for a driver replay); waits briefly for the task to settle. */
async function taskCost(taskId) {
	for (let wait = 0; taskId && wait < 10; wait++) {
		const task = tasks.get(taskId);
		if (task && ["done", "failed", "cancelled"].includes(task.status)) return task.costUsd ?? null;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return null;
}

/** P5 evidence for one finished case: screenshots, mocks that answered, steps, summary, cost. */
/** Screenshots and videos written into any proof folder between two times, oldest first. */
async function proofWrittenBetween(startedAtMs, endedAtMs) {
	const files = [];
	for (const folder of await proofFolders()) {
		for (const name of await readdir(folder).catch(() => [])) {
			// The harness's own liveness probes are not evidence.
			if (!/\.(png|jpe?g|mp4|mov)$/i.test(name) || isProbeShot(name)) continue;
			const info = await stat(join(folder, name)).catch(() => null);
			if (info && info.mtimeMs >= startedAtMs && info.mtimeMs <= endedAtMs + 2000) files.push({ path: join(folder, name), mtimeMs: info.mtimeMs });
		}
	}
	return files.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

async function collectEvidence(item, startedAtMs) {
	// A case that didn't pass often stops before its own screenshot step: capture what the
	// simulator shows at the end, so the reviewer sees the failure, not just its description.
	if (item.status === "done" && !String(item.verdict ?? "").startsWith("PASS") && process.env.TEST_FORGE_MEDIA_ROOT) {
		const folder = join(process.env.TEST_FORGE_MEDIA_ROOT, "failures");
		const path = join(folder, `${String(item.caseId).replace(/[^\w.-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
		await mkdir(folder, { recursive: true }).catch(() => {});
		await run("xcrun", ["simctl", "io", deviceArg(), "screenshot", "--type=png", path], { timeout: 15_000 }).catch(() => {});
	}
	const endedAtMs = Date.now();
	const job = getJob(item.jobId);
	const screenshots = await proofWrittenBetween(startedAtMs, endedAtMs);
	const reader = await currentTrace().catch(() => null);
	const records = reader ? await reader.entries().catch(() => []) : [];
	const mocksServed = mockServedSince(records.filter((record) => new Date(record.recordedAt).getTime() <= endedAtMs + 2000), startedAtMs);
	// Which variant answered, not just which endpoint (D-163): what a bundle hands to the next person.
	const deviceRules = Object.keys(mocksServed).length ? await resolveSessionPath().then((found) => readSession(found.path)).then((session) => session.mocks ?? []).catch(() => []) : [];
	const mocksUsed = variantsServed(records, deviceRules, { since: startedAtMs, until: endedAtMs + 2000 });
	const lines = job?.lines ?? [];
	const steps = lines.filter((line) => STEP_LINE.test(line)).slice(-200);
	// Claude's last words are its reasoning summary; a replay's are its verdict and failing step.
	const summary = item.mode === "claude"
		? lines.filter((line) => line.trim() && !line.trimStart().startsWith("→") && !line.trimStart().startsWith("←")).slice(-12).join("\n")
		: [lines.find((line) => line.trimStart().startsWith("✗")), lines.findLast((line) => line.trimStart().startsWith("●"))].filter(Boolean).join("\n");
	// The case's whole Claude spend: the job it ended on, plus the first run and any triage or
	// save-as-macro turn that came after it (D-064).
	const costs = [await taskCost(job?.meta?.taskId), item.runCostUsd, item.triage?.costUsd, item.learned?.costUsd].filter((cost) => typeof cost === "number");
	const costUsd = costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null;
	const proof = await copyIntoBatchFolder(screenshots, item.caseId);
	// A recorded case's video is listed apart from screenshots (R4k), and kept out of the screenshot strip — the
	// server's recording and any a Claude run filmed itself (D-113).
	const videos = [...new Set([...(item.videoPath ? [item.videoPath] : []), ...proof.filter((path) => /\.(mp4|mov)$/i.test(path))])];
	return { screenshots: proof.filter((path) => !videos.includes(path)), videos, mocksServed, mocksUsed, steps, summary, costUsd, folder: await proofFolderFor(item.caseId) };
}

/** The case's own proof folder (`<batch folder>/<case>/`) when it has one; null otherwise (its proof sits in a shared folder). */
async function proofFolderFor(caseId) {
	const root = process.env.TEST_FORGE_MEDIA_ROOT;
	const own = root ? join(root, String(caseId).replace(/[^\w.-]/g, "_")) : null;
	return own && (await stat(own).catch(() => null))?.isDirectory() ? own : null;
}

/** R4k (D-110): records the QA simulator for one case into `<batch folder>/<case>/`; null when it can't start. */
async function startCaseVideo(caseId) {
	const qa = await findTestForgeSimulator().catch(() => null);
	const root = process.env.TEST_FORGE_MEDIA_ROOT;
	if (!qa || qa.state !== "Booted" || !root) return null;
	const safeId = String(caseId).replace(/[^\w.-]/g, "_");
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return startVideo({ udid: qa.udid, path: join(root, safeId, `${safeId}-${stamp}.mp4`) }).catch(() => null);
}

/**
 * D-113: `recordVideo` "auto" (the default) films only what a screenshot can't prove — `lib/video-plan.js` reads the
 * case's words. A replay is filmed by the server over the case's own action window; a Claude run is told whether and
 * when to film itself (test_forge_start_recording). `true` / `false` force it: true records the whole run on the server.
 */
async function videoFor(item, recordVideo, macro) {
	const testCase = loadedCases.find((entry) => entry.id === item.caseId) ?? (macro && { scenario: macro.name, steps: macro.description });
	if (recordVideo === false) return { note: "Video: not wanted for this run; do not call test_forge_start_recording." };
	if (recordVideo === true) return { whole: true, note: "Video: the dashboard records this whole run; do not call test_forge_start_recording." };
	if (item.mode !== "replay") return { note: videoGuidance(testCase) };
	const steps = await flattenSteps(macro ?? {}, findMacroV2).catch(() => []);
	return { plan: planVideo({ testCase, steps }) };
}

async function launchBatch({ items, approval, techDocPath, rerunOf = null, recordVideo = "auto", model, noClaude = false, bundleId = null }) {
	const policy = approval === "ask" || process.env.TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE !== "1" ? "ask" : "autonomous";
	const batch = new RunBatch({
		items,
		approval: policy,
		rerunOf,
		deps: {
			start: async (item) => {
				let enqueued;
				const macro = item.mode === "replay" ? await findMacroV2(item.macroId) : null;
				const video = await videoFor(item, recordVideo, macro);
				const recording = video.whole ? await startCaseVideo(item.caseId) : null;
				try {
				if (item.mode === "replay") {
					if (!macro) throw new Error(`macro ${item.macroId} not found`);
					enqueued = enqueueReplay(macro, { video: video.plan && { caseId: item.caseId, plan: video.plan } });
				} else {
					const testCase = loadedCases.find((entry) => entry.id === item.caseId);
					if (!testCase) throw new Error("the case is no longer loaded");
					enqueued = enqueueTestForgeRun(testCase, { techDocPath, approval: policy, videoNote: video.note, model });
				}
				} catch (error) {
					await recording?.stop();
					throw error;
				}
				const { job } = enqueued;
				if (!recording) {
					const done = jobDone(job).finally(() => {
						if (job.meta.videoPath) item.videoPath = job.meta.videoPath;
					});
					return { jobId: job.id, done, cancel: () => cancelJob(job.id) };
				}
				const done = jobDone(job).finally(async () => {
					item.videoPath = await recording.stop();
				});
				return { jobId: job.id, done, cancel: () => cancelJob(job.id) };
			},
			findCrash: (sinceMs) => findCrash(sinceMs, { bundleId: BUNDLE_ID }),
			followUp: async (item, controls) => {
				// A bundle replay stays driver-only: a failure is the verdict, never a Claude triage (D-162).
				if (noClaude) return null;
				const isPassing = String(item.verdict ?? "").startsWith("PASS");
				// The first run's cost, before a follow-up job replaces the case's job.
				item.runCostUsd = await taskCost(getJob(item.jobId)?.meta?.taskId);
				if (item.mode === "replay" && !isPassing && item.verdict !== "CANCELLED") return triageFailure(item, { ...controls, approval: policy });
				if (item.mode === "claude" && isPassing) return learnMacro(item, { ...controls, approval: policy });
				return null;
			},
			collect: collectEvidence,
			relaunch: async () => {
				const relaunched = await postCommand({ kind: "relaunchApp" }, { timeoutMs: 45_000, recover: true }).catch(() => null);
				if (!relaunched || relaunched.error) await run("xcrun", ["simctl", "launch", deviceArg(), BUNDLE_ID]).catch(() => {});
				noteAppLaunched();
			},
		},
	});
	const manifest = await runManifest();
	await results.upsert(batch.snapshot(), { manifest, ...(bundleId ? { bundleId } : {}) });
	testBatches.attach({ kind: "run", refId: batch.snapshot().id, title: `Run of ${batch.snapshot().items.length} case(s)` });
	batch.on("change", (snapshot) => results.upsert(snapshot));
	batch.on("item-done", (item) => {
		if (rerunOf && Number.isInteger(item.rerunIndex)) results.recordRerun(rerunOf, item.rerunIndex, { verdict: item.verdict, batchId: batch.id });
	});
	activeBatch = batch;
	batch.on("change", () => stateHub.poke("batch"));
	stateHub.poke("batch");
	batch.run().catch((error) => console.error("batch failed:", error));
	return batch;
}

for (const action of ["pause", "resume", "skip", "cancel"]) {
	app.post(`/api/batch/${action}`, async (_req, res) => {
		if (!activeBatch) return res.status(404).json({ error: "no batch run" });
		const changed = await activeBatch[action === "pause" ? "requestPause" : action]();
		res.json({ ok: Boolean(changed), ...(await batchView()) });
	});
}

// --- P5: results, review, re-run, report (D-062) ---------------------------------

// --- Saved setups (P9, D-067) ------------------------------------------------------------------

/** A setup with its last run's outcome, read from the results store. */
function setupView(setup) {
	const run = setup.lastRun?.batchId ? results.get(setup.lastRun.batchId) : null;
	return { ...setup, lastRun: setup.lastRun && { ...setup.lastRun, ...(run && { counts: run.counts, status: run.status, ...reviewState(run) }) } };
}

app.get("/api/setups", async (_req, res) => res.json({ setups: (await setups.list()).map(setupView) }));

/** Saves what is on screen now: the prepared code, the loaded document, the ticked cases. */
app.post("/api/setups", async (req, res) => {
	const { name, caseIds = [], approval, techDocPath } = req.body ?? {};
	const manifest = await currentManifest();
	const missing = caseIds.filter((id) => !loadedCases.some((entry) => entry.id === id));
	if (missing.length) return res.status(400).json({ error: `not in the loaded document: ${missing.join(", ")}` });
	try {
		const setup = await setups.save({ name, code: manifest && { source: manifest.source, repo: manifest.repo, branch: manifest.branch }, doc: loadedSource && { source: loadedSource, title: loadedTitle }, caseIds, approval, techDocPath });
		res.json({ ok: true, setup: setupView(setup) });
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

app.delete("/api/setups/:id", async (req, res) => {
	if (!(await setups.remove(req.params.id))) return res.status(404).json({ error: "no such setup" });
	res.json({ ok: true });
});

/** Loads a document the way the Load button does, waiting for the Claude read when there's no token. */
async function loadSource(source) {
	if (/^https?:\/\//i.test(source) && confluencePageId(source) && !hasConfluenceCredentials()) {
		const end = await jobDone(loadViaClaude(source));
		if (end.status !== "done") throw new Error(end.verdict || "the document didn't load");
		return;
	}
	acceptLoaded(source, await loadTestCases(source));
}

/**
 * "▶ Run again": code → document → checks → batch, as one job whose lines Home shows. It never
 * builds (hard constraint): when the code moved past the build, it stops and says to build.
 */
async function runSetup(setup, job) {
	const say = (line) => appendLine(job, line);
	const stop = (verdict) => finishJob(job, { status: "error", verdict });
	const manifest = await currentManifest();
	const drift = manifest?.source === "local" ? await localDrift(manifest).catch(() => null) : null;
	const where = setup.code.source === "github" ? `${setup.code.branch} (GitHub)` : "the local folder";
	if (needsPrepare(setup, manifest, drift)) {
		say(`⚙ preparing the code — ${where}`);
		const started = await startPrepare(setup.code);
		if (started.error) return stop(started.error);
		started.job.emitter.on("line", (line) => say(`  ${line}`));
		const end = await jobDone(started.job);
		if (end.status !== "done") return stop(`the code didn't prepare: ${end.verdict}`);
	} else {
		say(`✓ code: ${manifest.branch} @ ${manifest.snapshotId} — unchanged`);
	}
	if (loadedSource !== setup.doc.source) {
		say(`⚙ loading ${describeSource(setup.doc.source)}`);
		try {
			await loadSource(setup.doc.source);
		} catch (error) {
			return stop(`the test cases didn't load: ${error.message}`);
		}
	}
	const cases = setup.caseIds.map((id) => loadedCases.find((entry) => entry.id === id)).filter(Boolean);
	const gone = setup.caseIds.filter((id) => !cases.some((entry) => entry.id === id));
	say(`✓ test cases: ${loadedTitle ?? describeSource(setup.doc.source)} — ${cases.length} of ${setup.caseIds.length} case(s)${gone.length ? `; no longer in the document: ${gone.join(", ")}` : ""}`);
	if (cases.length === 0) return stop("none of the setup's cases are in the document any more");
	const items = planItems(cases, await listMacrosV2());
	const { state, problem } = await startGate({ needsClaude: items.some((item) => item.mode === "claude") });
	if (problem) {
		const isStaleBuild = state.checks.some((check) => check.id === "bundle" && !check.ok && check.fix === "build-qa");
		if (isStaleBuild) say("! the code changed since the last build — press “Build” on the Test Cases tab (it asks first), then Run again");
		return stop(problem);
	}
	if (activeBatch && !["done", "cancelled"].includes(activeBatch.status)) return stop("a batch run is in progress");
	const batch = await launchBatch({ items, approval: setup.approval, techDocPath: setup.techDocPath });
	await setups.noteRun(setup.id, { at: new Date().toISOString(), batchId: batch.id });
	say(`▶ running ${items.length} case(s): ${items.filter((item) => item.mode === "replay").length} by macro, ${items.filter((item) => item.mode === "claude").length} by Claude — follow it on the Test Cases tab`);
	finishJob(job, { status: "done", verdict: batch.id });
}

app.post("/api/setups/:id/run", async (req, res) => {
	const setup = await setups.get(req.params.id);
	if (!setup) return res.status(404).json({ error: "no such setup" });
	if (refuseWhileTesting(res)) return;
	const running = activeJobs().find((job) => job.meta.kind === "setup-run");
	if (running) return res.status(409).json({ error: "a setup is already starting", jobId: running.id });
	const job = createJob({ kind: "setup-run", setupId: setup.id });
	appendLine(job, `● Run again — ${setup.name}`);
	runSetup(setup, job).catch((error) => finishJob(job, { status: "error", verdict: error.message }));
	res.json({ ok: true, jobId: job.id });
});

app.get("/api/results", (_req, res) => res.json({ runs: results.list() }));

// Demo videos (D-164): notes once per case, a slowed replay with a timeline, rendered by the Mac app.
registerDemoRoutes(app, {
	findMacro: findMacroV2,
	describe: async (macro) => {
		const registry = await loadRegistry();
		return (macro.steps ?? []).map((step) => ({ id: step.id, text: macroMap({ steps: [step] }, registry)[0]?.text ?? step.do, note: step.note }));
	},
	caseFor: (macro) => loadedCases.find((entry) => caseLinks(macro).includes(String(entry.id).toUpperCase())) ?? null,
	mediaRoot: () => process.env.TEST_FORGE_MEDIA_ROOT || null,
	guard: async (res) => refuseWhileTesting(res) || (await refuseUnlessReady(res, { needsClaude: false })),
	enqueueDemo: (macro) => enqueueReplay(macro, { demo: true }),
	runClaude,
	jobs: { createJob, appendLine, finishJob },
});

// Session export (D-173): every loaded case with its metadata, optionally with proof media, as one .zip.
async function currentSession() {
	const [{ macros = [] }, history, demos, code] = await Promise.all([
		ownApi("/api/macros"),
		listRuns(Number.MAX_SAFE_INTEGER),
		listDemoRecordings(process.env.TEST_FORGE_MEDIA_ROOT || null, DEMO_LANGUAGES),
		currentManifest().catch(() => null),
	]);
	const doc = { title: loadedTitle, source: loadedSource, cases: loadedCases };
	return buildSession({ doc, history, runs: results.runs, macros, demos, code: code ? { branch: code.branch ?? null, codeId: code.codeId ?? null } : null });
}

/** What an export would hold, so the save sheet can say how many media files (and MB) "Include media" adds. */
app.get("/api/session/export", async (_req, res) => {
	try {
		if (!loadedCases.length) return res.status(409).json({ error: "load a test document first" });
		const session = await currentSession();
		const files = session.cases.flatMap((entry) => [...entry.media.screenshots, ...entry.media.videos, ...entry.media.demoVideos]);
		const sizes = await Promise.all(files.map((file) => stat(file.path).then((info) => info.size).catch(() => null)));
		res.json({
			fileName: sessionFileName(session.document.title),
			summary: session.summary,
			runs: session.runs.length,
			mediaFiles: sizes.filter((size) => size !== null).length,
			mediaBytes: sizes.reduce((sum, size) => sum + (size ?? 0), 0),
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

/** D-176: the session report — Markdown for the Mac viewer and .md export (images as absolute paths on this Mac). */
app.get("/api/session/report.md", async (_req, res) => {
	if (!loadedCases.length) return res.status(409).json({ error: "load a test document first" });
	try {
		const session = await currentSession();
		res.set({ "Content-Type": "text/markdown; charset=utf-8", "X-Report-Title": encodeURIComponent(sessionReportTitle(session)) }).send(sessionMarkdown(session, { imagePath: (file) => `file://${file.path}` }));
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

/** The same report as Confluence-ready HTML (no macros or images), for .html export and publishing. */
app.get("/api/session/report.html", async (_req, res) => {
	if (!loadedCases.length) return res.status(409).json({ error: "load a test document first" });
	try {
		res.set({ "Content-Type": "text/html; charset=utf-8" }).send(sessionConfluenceHtml(await currentSession()));
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

/**
 * Publishes the session report as ONE new child page of the personal page, through a Claude session and the
 * Atlassian connector (same rule as Reports › Publish): production test-case and tech-doc pages are never touched.
 */
app.post("/api/session/publish", async (_req, res) => {
	if (!loadedCases.length) return res.status(409).json({ error: "load a test document first" });
	try {
		const session = await currentSession();
		const title = sessionReportTitle(session);
		const dir = join(DATA_DIR, "reports");
		await mkdir(dir, { recursive: true });
		const file = join(dir, `session-${Date.now()}.confluence.html`);
		await writeFile(file, sessionConfluenceHtml(session));
		const prompt = [
			`Publish a QA test session report to Confluence as a NEW child page of page ${REPORT_PARENT_PAGE} (my personal space), titled "${title}".`,
			`The page body is the HTML in ${file} — Read it and pass it unchanged as the body, with contentFormat "html" (createConfluencePage, parentId ${REPORT_PARENT_PAGE}; get the spaceId from that parent page).`,
			`Rules: create exactly one page under ${REPORT_PARENT_PAGE}. Do not edit, comment on or create pages anywhere else. Never touch pages 2396520535, 2446558056 or 2391769202.`,
			"Do not add anything about QA tooling beyond what the HTML says. Reply with the new page's URL.",
		].join("\n");
		const task = tasks.enqueue({ kind: "claude", title: `📝 Publish session report · ${title}`, payload: { projectDir: DEFAULT_PROJECT_DIR, prompt, model: "sonnet", title: `📝 Publish ${title}` } });
		res.json({ ok: true, taskId: task.id, title });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.post("/api/session/export", async (req, res) => {
	const target = req.body?.path;
	if (!target) return res.status(400).json({ error: "path is required" });
	if (!loadedCases.length) return res.status(409).json({ error: "load a test document first" });
	try {
		const full = resolvePath(String(target).replace(/^~(?=\/|$)/, homedir()));
		const written = await writeSessionExport(await currentSession(), { target: full.endsWith(".zip") ? full : `${full}.zip`, includeMedia: req.body?.includeMedia === true });
		res.json({ ok: true, ...written });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Run bundles (D-162): export a run for the next person; import one and replay it without Claude.
const bundleStore = registerBundleRoutes(app, {
	dataDir: DATA_DIR,
	deps: {
		results,
		testcases: () => ({ cases: loadedCases, title: loadedTitle, source: loadedSource }),
		acceptImported,
		currentCode: () => currentManifest().catch(() => null),
		deviceRules: async () => (await readSession((await resolveSessionPath()).path)).mocks ?? [],
		traceRecords: async () => {
			const reader = await currentTrace().catch(() => null);
			return reader ? reader.entries().catch(() => []) : [];
		},
		armMock,
		guard: async (res) => refuseWhileTesting(res) || (await refuseUnlessReady(res, { needsClaude: false })),
		launchReplay: async ({ items, bundleId }) => {
			await launchBatch({ items, approval: "ask", noClaude: true, bundleId });
			return batchView();
		},
	},
});

app.get("/api/results/:id", async (req, res) => {
	const run = results.get(req.params.id);
	if (!run) return res.status(404).json({ error: "no such run" });
	// A bundle replay shows each case's verdict from the run that made the bundle (D-162).
	const bundle = run.bundleId ? await bundleStore.get(run.bundleId).catch(() => null) : null;
	const bundleVerdicts = new Map((bundle?.items ?? []).map((item) => [String(item.caseId), item.verdict]));
	// Proof only: probe shots and files deleted since (D-084 cleared old probes) are left out (D-087).
	const withProof = (item) => item.evidence ? { ...item.evidence, screenshots: (item.evidence.screenshots ?? []).filter((path) => !isProbeShot(path) && existsSync(path)) } : item.evidence;
	res.json({ run: { ...run, ...(bundle && { bundleTitle: bundle.title }), items: run.items.map((item) => ({ ...item, evidence: withProof(item), finalVerdict: finalVerdict(item), ...(bundle && { bundleVerdict: bundleVerdicts.get(String(item.caseId)) ?? null }) })) }, ...reviewState(run) });
});

/** Compares a run with `?with=<runId>`, else with `defaultBaseRun` (D-087). */
app.get("/api/results/:id/compare", (req, res) => {
	const head = results.get(req.params.id);
	if (!head) return res.status(404).json({ error: "no such run" });
	const base = req.query.with ? results.get(String(req.query.with)) : defaultBaseRun(results.runs, head);
	if (req.query.with && !base) return res.status(404).json({ error: "no such run to compare with" });
	res.json(compareRuns(base, head));
});

app.post("/api/results/:id/items/:index/review", (req, res) => {
	try {
		const run = results.review(req.params.id, Number(req.params.index), req.body ?? {});
		res.json({ ok: true, ...reviewState(run) });
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

app.post("/api/results/:id/rerun-failed", async (req, res) => {
	const run = results.get(req.params.id);
	if (!run) return res.status(404).json({ error: "no such run" });
	const picks = rerunCandidates(run);
	if (picks.length === 0) return res.status(400).json({ error: "nothing to re-run — every case passed or was already re-run" });
	if (refuseWhileTesting(res)) return;
	// D-220: planned again, so a case that has a recording now replays instead of going back to Claude.
	const replanned = planItems(picks.map(({ item }) => loadedCases.find((entry) => entry.id === item.caseId) ?? { id: item.caseId, scenario: item.scenario }), await listMacrosV2());
	const items = picks.map(({ index }, position) => ({ ...replanned[position], rerunIndex: index }));
	if (items.some((item) => item.mode === "claude" && !loadedCases.some((entry) => entry.id === item.caseId))) {
		return res.status(409).json({ error: "load the test document again — a case to re-run runs through Claude and needs it" });
	}
	if (await refuseUnlessReady(res, { needsClaude: items.some((item) => item.mode === "claude") })) return;
	await launchBatch({ items, approval: req.body?.approval ?? run.approval, rerunOf: run.id });
	res.json(await batchView());
});

app.get("/api/results/:id/report.md", (req, res) => {
	const run = results.get(req.params.id);
	if (!run) return res.status(404).end();
	res.set({ "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="test-forge-run-${run.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.md"` }).send(buildReport(run));
});

/**
 * Publishing goes through a Claude session (the Atlassian connector), never on its own: the session
 * asks before it writes, and it may only create a child page of the personal page — the production
 * test-case page stays read-only (hard constraint).
 */
const REPORT_PARENT_PAGE = "2437316839";
app.post("/api/results/:id/publish", (req, res) => {
	const run = results.get(req.params.id);
	if (!run) return res.status(404).json({ error: "no such run" });
	const title = `QA run ${run.createdAt.slice(0, 16).replace("T", " ")} — ${run.items.length} case(s)`;
	const prompt = [
		`Publish this QA report to Confluence as a NEW child page of page ${REPORT_PARENT_PAGE} (my personal space), titled "${title}".`,
		`Rules: create exactly one page under ${REPORT_PARENT_PAGE}. Do not edit, comment on or create pages anywhere else. Never touch page 2396520535.`,
		"Convert the Markdown faithfully (tables stay tables). Reply with the new page's URL.",
		"",
		buildReport(run),
	].join("\n");
	const task = tasks.enqueue({ kind: "claude", title: `📝 Publish report · ${title}`, payload: { projectDir: DEFAULT_PROJECT_DIR, prompt, title: `📝 Publish ${title}` }, links: { resultsId: run.id } });
	res.json({ ok: true, taskId: task.id });
});

// --- Jobs ---------------------------------------------------------------------

/** Lets a reloaded page re-attach to a run/replay/build that is still going. */
app.get("/api/launch-inputs", (_req, res) => res.json(launchInputState()));

app.get("/api/jobs/active", (_req, res) => res.json({ jobs: activeJobs() }));

app.post("/api/jobs/:id/cancel", (req, res) => {
	if (!cancelJob(req.params.id)) return res.status(404).json({ error: "no running job with that id" });
	res.json({ ok: true });
});

// --- SSE console ------------------------------------------------------------

app.get("/api/jobs/:id/stream", (req, res) => {
	const job = getJob(req.params.id);
	if (!job) return res.status(404).end();

	res.set({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	res.flushHeaders();

	for (const line of job.lines) res.write(`data: ${JSON.stringify(line)}\n\n`);
	if (job.status !== "running") {
		res.write(`event: end\ndata: ${JSON.stringify({ status: job.status, verdict: job.verdict })}\n\n`);
		return res.end();
	}

	const onLine = (line) => res.write(`data: ${JSON.stringify(line)}\n\n`);
	const onEnd = () => {
		res.write(`event: end\ndata: ${JSON.stringify({ status: job.status, verdict: job.verdict })}\n\n`);
		res.end();
	};
	job.emitter.on("line", onLine);
	job.emitter.on("end", onEnd);
	req.on("close", () => {
		job.emitter.off("line", onLine);
		job.emitter.off("end", onEnd);
	});
});

// --- Live state slices (D-077) ------------------------------------------------------------------
// Event-driven slices re-read when their source changes; slices that live outside the dashboard
// (simulator, git, NetworkLens) are probed here, once for every page, only while a page is connected.
// Probed slices reuse the page's own GET endpoints, so the stream carries exactly what they return.
const ownApi = async (path) => {
	const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: AbortSignal.timeout(60_000) });
	if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
	return response.json();
};
stateHub
	.define("testBatch", { read: () => testBatches.view() })
	.watch("testBatch", testBatches)
	.define("queue", { read: () => ({ tasks: tasks.list().map(withTaskPhase), sessions: sessions.list(), device: deviceLock.status() }) })
	.watch("queue", tasks).watch("queue", sessions).watch("queue", deviceLock)
	// D-199: popups a run raises for a person (tap a system popup, type an OTP), shown by the Mac app.
	.define("prompts", { read: () => ({ prompts: prompts.list() }) })
	.watch("prompts", prompts)
	.define("jobs", { read: () => ({ jobs: activeJobs().map((job) => jobView(getJob(job.id))) }) })
	.watch("jobs", jobEvents)
	.define("batch", { read: async () => {
		const view = await batchView();
		return { ...view, batch: withBatchPhases(view.batch) };
	} })
	.watch("batch", narrator)
	.define("narration", { read: () => narrator.view() })
	.watch("narration", narrator)
	.define("usage", { everyMs: 30_000, read: async () => {
		await usageFeed.readTap();
		return usageFeed.view();
	} })
	.watch("usage", usageFeed)
	// D-149: Claude Code CLI sessions on this Mac and their Remote Control state, for the Mac usage bar.
	.define("claudeCli", { everyMs: 5_000, read: () => listCliSessions() })
	.define("remoteControl", { everyMs: 5_000, read: () => remoteControl.view() })
	.watch("remoteControl", remoteControl)
	.define("status", { everyMs: 4_000, read: () => ownApi("/api/status") })
	.define("trace", { everyMs: 4_000, read: () => ownApi("/api/trace?limit=30") })
	.define("mocks", { everyMs: 10_000, read: () => ownApi("/api/mocks") })
	.define("harness", { everyMs: 10_000, read: () => ownApi("/api/harness/status") })
	.define("device", { everyMs: 5_000, read: () => ownApi("/api/device") })
	.define("identity", { everyMs: 30_000, read: () => ownApi("/api/identity") })
	.define("code", { everyMs: 30_000, read: () => ownApi("/api/code/current") })
	.define("build", { everyMs: 30_000, read: () => ownApi("/api/build/status") })
	.define("readiness", { everyMs: 30_000, read: () => ownApi("/api/readiness") })
	.define("testcases", { read: async () => {
		const [{ macros = [] }, runs, proof] = await Promise.all([
			ownApi("/api/macros"),
			listRuns(),
			caseProof(process.env.TEST_FORGE_MEDIA_ROOT || null, loadedCases.map((testCase) => testCase.id)),
		]);
		const isLoading = activeJobs().some((job) => job.meta.kind === "load");
		const { current, staleFor } = await stalenessNow(runs);
		const view = testcaseView({ title: loadedTitle, source: loadedSource, cases: loadedCases, macros, runs, proof, isLoading, staleFor, ticketsOf: (caseId) => ticketsFor(caseId, loadedJira) });
		return { ...view, build: buildLabel(current), isBuildUnverified: Boolean(current.isUnverified), staleCaseIds: view.cases.filter((entry) => entry.macro && entry.lastRun?.stale).map((entry) => entry.id) };
	} })
	.watch("testcases", jobEvents)
	.define("scan", { read: () => scanSession.view() })
	.watch("scan", scanSession)
	.define("results", { read: () => ({ runs: results.list(), branches: branchHistory(results.runs) }) })
	.watch("results", results);
// A job that starts or ends can change the code, the build and what is ready.
jobEvents.on("change", (job) => {
	if (job.status === "running") return;
	if (narrator.runs.has(job.id) && !narrator.runs.get(job.id).endedAt) narrator.end(job.id, job.verdict);
	for (const name of ["code", "build", "readiness", "batch"]) stateHub.poke(name);
});

// Executors are registered above; tasks restored as queued can start now.
tasks.kick();

app.listen(PORT, "127.0.0.1", () => {
	console.log(`QA dashboard → http://127.0.0.1:${PORT}  (bundle ${BUNDLE_ID})`);
});
