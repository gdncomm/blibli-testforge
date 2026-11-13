// Setup readiness gate (D-052; QA simulator + QA-copy build D-053/D-054; full P3 checklist D-055): no
// test or macro starts unless every blocking check passes, and each failing check names its fix —
// instead of a run failing at step 1 with "harness stopped answering".
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { deviceArg } from "./test-device.js";

const run = promisify(execFile);
const CACHE_MS = 8_000;
/** A reused pass is re-checked anyway after this long, so something changed outside its fingerprint shows up. */
import { prerequisiteChecks } from "./prerequisites.js";

export const MEMO_MAX_MS = 30 * 60_000;

/**
 * Readiness fingerprints (#8, D-082): a passing simctl-backed check is reused while what it depends on —
 * its fingerprint (QA simulator UDID + build id) — is unchanged, so a re-check or a server restart only
 * re-runs checks whose inputs moved. Failures are never reused; live checks (harness, lens) never are.
 * `file` persists the memo (best effort) so a restarted server starts warm.
 */
export function createCheckMemo({ file = null, now = Date.now, maxAgeMs = MEMO_MAX_MS } = {}) {
	let entries = null;
	const load = async () => {
		if (entries) return entries;
		entries = new Map();
		if (file) {
			try {
				for (const [id, entry] of Object.entries(JSON.parse(await readFile(file, "utf8")))) entries.set(id, entry);
			} catch {
				// No memo yet, or unreadable: start cold.
			}
		}
		return entries;
	};
	const persist = async () => {
		if (!file) return;
		try {
			await mkdir(dirname(file), { recursive: true });
			const temp = `${file}.${process.pid}.tmp`;
			await writeFile(temp, JSON.stringify(Object.fromEntries(entries)));
			await rename(temp, file);
		} catch {
			// Losing the memo only costs one slower check.
		}
	};
	return {
		async get(id, fingerprint) {
			const entry = (await load()).get(id);
			if (!entry || entry.fingerprint !== fingerprint || now() - entry.at > maxAgeMs) return null;
			return entry;
		},
		async set(id, fingerprint, value) {
			(await load()).set(id, { fingerprint, value, at: now() });
			await persist();
		},
		async forget(id) {
			if ((await load()).delete(id)) await persist();
		},
	};
}

/** Runs `compute` unless `memo` holds a pass for the same fingerprint; `isPass(value)` decides what may be kept. */
async function memoized(memo, { id, fingerprint, isPass }, compute) {
	if (!memo || !fingerprint) return { value: await compute(), isReused: false };
	const hit = await memo.get(id, fingerprint);
	if (hit) return { value: hit.value, isReused: true, checkedAt: new Date(hit.at).toISOString() };
	const value = await compute();
	if (isPass(value)) await memo.set(id, fingerprint, value);
	else await memo.forget(id);
	return { value, isReused: false };
}

/** What the installed-app checks depend on: which QA simulator, and which build is on it. */
async function installFingerprint({ sims, buildState, legacyBundle }) {
	const udid = sims?.qa?.udid;
	if (!udid) return null;
	const { build } = buildState;
	if (build?.codeId) return `${udid}|${build.codeId}|${build.endedAt ?? ""}`;
	const bundle = await legacyBundle().catch(() => null);
	return bundle ? `${udid}|${bundle.path}|${bundle.mtimeMs}` : null;
}

const reusedFields = ({ isReused, checkedAt }) => (isReused ? { isReused, checkedAt } : {});

async function isAppInstalled(bundleId) {
	try {
		await run("xcrun", ["simctl", "get_app_container", deviceArg(), bundleId], { timeout: 15_000 });
		return true;
	} catch {
		return false;
	}
}

/** Same lookup as harness.py's `test_bundle_built`: the newest `*-Runner.app` for the configuration. */
export async function findTestBundle({ projectDir, configuration, runnerTarget, derivedData = join(homedir(), "Library/Developer/Xcode/DerivedData"), derivedDataPath = null }) {
	const prefix = `${basename(projectDir)}-`;
	const runnerName = runnerTarget ? `${runnerTarget}-Runner.app` : null;
	// `-derivedDataPath` builds (the QA copy) put Build/ straight under that path, not in a hashed folder.
	const roots = derivedDataPath
		? [derivedDataPath]
		: (await readdir(derivedData).catch(() => [])).filter((entry) => entry.startsWith(prefix)).map((entry) => join(derivedData, entry));
	let newest = null;
	for (const root of roots) {
		const products = join(root, "Build", "Products", `${configuration}-iphonesimulator`);
		for (const file of await readdir(products).catch(() => [])) {
			if (runnerName ? file !== runnerName : !file.endsWith("-Runner.app")) continue;
			const path = join(products, file);
			const { mtimeMs } = await stat(path);
			if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
		}
	}
	return newest;
}

function simulatorCheck(sims) {
	const check = { id: "simulator", label: "Test simulator ready" };
	if (!sims?.qa) return { ...check, ok: false, detail: "no QA simulator yet — it is cloned from the one you test with (keeps saved passwords)", fix: "test-forge-sim-create" };
	if (sims.qa.state !== "Booted") return { ...check, ok: false, detail: `${sims.qa.name} is shut down`, fix: "test-forge-sim-boot" };
	// D-120: every command names the test device by UDID, so other booted simulators no longer get in the way.
	const others = sims.others.length ? ` · also booted: ${sims.others.map((device) => device.name).join(", ")} (left alone)` : "";
	return { ...check, ok: true, detail: `${sims.qa.name}${others}` };
}

async function buildCheck({ buildState, legacyBundle, configuration, isBuilding }) {
	const check = { id: "bundle", label: "App + tests built" };
	// D-223: `isWorking` tells the app to show this row as in progress, not as a failure.
	if (isBuilding) return { ...check, ok: false, isWorking: true, detail: "a build is running — this row updates when it finishes" };
	const { state, build, codeId, override } = buildState;
	if (state === "no-code") {
		// Nothing prepared in Question 1 yet: the developer's own build, as before P2.
		const bundle = await legacyBundle();
		return bundle
			? { ...check, ok: true, detail: `developer build (${configuration}) — prepare code in Question 1 to test a QA copy`, isUnlinked: true }
			: { ...check, ok: false, detail: "nothing built — prepare the code (Question 1), then build it", fix: "code" };
	}
	if (state === "current") return { ...check, ok: true, detail: `built from ${build.codeId} · ${new Date(build.endedAt).toLocaleString()}` };
	if (override) return { ...check, ok: true, detail: `UNVERIFIED BUILD — ${override.reason}`, isUnverified: true };
	if (state === "stale") return { ...check, ok: false, detail: `built from ${build.codeId}, the code is at ${codeId} — rebuild`, fix: "build-qa" };
	return { ...check, ok: false, detail: `${codeId} isn't built yet`, fix: "build-qa" };
}

const MIN_FREE_GB = 10;
const STALE_CODE_HOURS = 24;

function codeCheck(code) {
	const check = { id: "code", label: "Code prepared", level: "warn" };
	const manifest = code?.manifest;
	if (!manifest) return { ...check, ok: false, detail: "nothing prepared in Question 1 — the developer's own build is tested", fix: "code" };
	const ageHours = (Date.now() - Date.parse(manifest.preparedAt)) / 3_600_000;
	const where = `${manifest.branch} @ ${manifest.snapshotId}`;
	// D-083: only changes to what the app is built from warn; macros, mocks, tools/ and docs don't.
	const hasAppChanged = code.drift?.hasAppInputsChanged ?? code.drift?.hasDrifted;
	if (hasAppChanged) {
		const files = code.drift.appFiles ?? [];
		const which = files.length ? `: ${files[0].split("/").pop()}${files.length > 1 ? ` +${files.length - 1} more` : ""}` : ` (now ${code.drift.nowId})`;
		return { ...check, ok: false, detail: `${where} — app code changed since${which}`, fix: "code" };
	}
	// A local snapshot is checked against the working copy above; only a GitHub branch can move unseen.
	if (manifest.source !== "local" && ageHours > STALE_CODE_HOURS) return { ...check, ok: false, detail: `${where} — prepared ${Math.round(ageHours)} h ago; GitHub may have moved on`, fix: "code" };
	if (code.drift?.hasDrifted) return { ...check, ok: true, detail: `${where} — only files outside the app changed since (macros, mocks, tools, docs)` };
	return { ...check, ok: true, detail: where };
}

/** R4j (D-109): proof folder chosen, then a Test Batch active; both block every test and macro. */
export function testBatchChecks({ proofRoot, active, paused = [] }) {
	const folder = { id: "proof-folder", label: "Proof folder chosen", ok: Boolean(proofRoot), detail: proofRoot ?? "choose where screenshots, videos and reports go", fix: proofRoot ? undefined : "choose-proof-folder" };
	const idleDetail = paused.length
		? `“${paused[0].name}”${paused.length > 1 ? ` and ${paused.length - 1} more are` : " is"} paused — resume one or start another`
		: "start one — every run until you end it is collected in it";
	const batchDetail = active ? `“${active.name}” → ${active.folder}` : proofRoot ? idleDetail : "waits for the proof folder";
	const batch = { id: "test-batch", label: "Test Batch active", ok: Boolean(active), detail: batchDetail, fix: active || !proofRoot ? undefined : "start-test-batch" };
	return [folder, batch];
}

/**
 * The P3 checklist (workflow-plan §⑤). Each check: `{ id, label, ok, detail, fix?, level, scope }`.
 * `level: "block"` stops a run, `"warn"` only informs; `scope: "claude"` matters only for ▶ Run
 * (a Claude session), never for a macro replay. Every dep beyond the first five is optional.
 */
export async function checkReadiness({
	bundleId, configuration, simulatorState, buildState, legacyBundle, probeHarness, isBuilding = () => false,
	codeState, installedMatch, diskFreeGb, deviceHolder, lensState, claudeState, memo = null, appInstalled = isAppInstalled,
	testBatchState = null, claudeEnvState = null, prerequisiteState = null,
}) {
	const startedAt = Date.now();
	const checks = [];
	// Time each check added to the wait (independent reads below start together, so a check whose read
	// finished while an earlier one ran shows ~0).
	let lastAddedAt = startedAt;
	const add = (check) => {
		const addedAt = Date.now();
		checks.push({ level: "block", scope: "all", ...check, durationMs: addedAt - lastAddedAt });
		lastAddedAt = addedAt;
	};
	// D-082: reads that don't depend on each other start at once; checks are still added in order.
	const codeRead = codeState ? codeState().catch(() => null) : null;
	const simsRead = simulatorState().catch(() => null);
	const diskRead = diskFreeGb ? diskFreeGb().catch(() => null) : null;
	const claudeRead = claudeState ? claudeState().catch((error) => ({ ok: false, detail: error.message })) : null;
	if (testBatchState) for (const check of testBatchChecks(testBatchState())) add(check);
	// D-190: read from a cache refreshed in the background — `claude mcp list` is far too slow to wait on here.
	if (prerequisiteState) for (const check of prerequisiteChecks(prerequisiteState())) add(check);
	if (codeRead) add(codeCheck(await codeRead));

	const sims = await simsRead;
	const simulator = simulatorCheck(sims);
	add(simulator);

	const currentBuildState = await buildState();
	const fingerprint = simulator.ok ? await installFingerprint({ sims, buildState: currentBuildState, legacyBundle }) : null;
	const installed = simulator.ok
		? await memoized(memo, { id: "app", fingerprint, isPass: Boolean }, () => appInstalled(bundleId))
		: { value: false, isReused: false };
	const isInstalled = installed.value;
	add({ id: "app", label: "App installed", ok: isInstalled, detail: isInstalled ? bundleId : simulator.ok ? `${bundleId} is not on the QA simulator` : "waits for the QA simulator", fix: isInstalled || !simulator.ok ? undefined : "build-qa", ...reusedFields(installed) });

	const build = await buildCheck({ buildState: currentBuildState, legacyBundle, configuration, isBuilding: isBuilding() });
	add(build);

	// The installed app's binary UUID against the build's: a harness started before the build still
	// serves the previous app until it restarts.
	if (installedMatch && isInstalled && build.ok && !build.isUnlinked && !build.isUnverified) {
		const matched = await memoized(memo, { id: "installed", fingerprint, isPass: (match) => match.applies && match.ok },
			() => installedMatch().catch((error) => ({ applies: false, detail: error.message })));
		const match = matched.value;
		if (match.applies) add({ id: "installed", label: "App installed from this build", ok: match.ok, detail: match.detail, fix: match.ok ? undefined : "restart-harness", ...reusedFields(matched) });
	}

	if (diskRead) {
		const freeGb = await diskRead;
		if (freeGb !== null) add({ id: "disk", label: `Disk space ≥ ${MIN_FREE_GB} GB`, ok: freeGb >= MIN_FREE_GB, detail: `${freeGb.toFixed(1)} GB free`, fix: freeGb >= MIN_FREE_GB ? undefined : "free-space" });
	}

	const canProbe = simulator.ok && build.ok && checks.every((check) => check.ok || check.level !== "block" || check.id === "harness");
	const isHarnessUp = canProbe ? await probeHarness().catch(() => false) : false;
	// A runner that stopped answering on a good build doesn't stop a test (P7): the device lane
	// restarts it before the test's first step, so it only warns.
	const selfHeals = canProbe && !isHarnessUp;
	add({
		id: "harness", label: "Harness answering", ok: isHarnessUp, ...(selfHeals ? { level: "warn", selfHeals } : {}),
		detail: isHarnessUp ? "TestForgeDriver runner answers" : selfHeals ? "the runner isn't answering — the next test restarts it first" : "waits for the checks above",
		fix: isHarnessUp || !canProbe ? undefined : "ensure",
	});

	if (lensState && isHarnessUp) {
		const lens = await lensState().catch(() => ({ ok: false, detail: "couldn't ask" }));
		add({ id: "lens", label: "NetworkLens live control", level: "warn", ok: lens.ok, detail: lens.ok ? lens.detail : `${lens.detail} — mocks are applied at the next launch instead (macros do this themselves)` });
	}
	if (deviceHolder) {
		const holder = deviceHolder();
		add({ id: "device", label: "Simulator free", level: "warn", ok: !holder, detail: holder ? `held by “${holder}” — a new run waits for it` : "free", fix: holder ? "queue" : undefined });
	}
	if (claudeRead) {
		const claude = await claudeRead;
		add({ id: "claude", label: "Claude signed in + test-forge-driver plugin", scope: "claude", ok: claude.ok, detail: claude.detail, fix: claude.ok ? undefined : "claude-howto" });
	}
	if (claudeEnvState) {
		// D-156: only matters when Claude's own NetworkLens/test-forge-driver tools are used directly in a
		// Claude Code session — every Run/Replay here goes through this server instead, which never
		// needed these, so this never blocks a test.
		const claudeEnv = await claudeEnvState().catch((error) => ({ ok: false, detail: error.message }));
		add({ id: "claude-env", label: "Claude Code set up for this Mac", level: "warn", ok: claudeEnv.ok, detail: claudeEnv.detail, fix: claudeEnv.ok ? undefined : "configure-claude-env" });
	}

	const blocking = (check, scopes) => !check.ok && check.level === "block" && scopes.includes(check.scope);
	const ready = !checks.some((check) => blocking(check, ["all"]));
	return {
		ready,
		readyForClaude: ready && !checks.some((check) => blocking(check, ["claude"])),
		isUnverifiedBuild: Boolean(build.isUnverified),
		checks,
		checkedAt: new Date().toISOString(),
		durationMs: Date.now() - startedAt,
	};
}

/** Caches one readiness result for a few seconds so polling pages and run requests share one probe. */
export function readinessGate(options) {
	let cached = null;
	let pending = null;
	return {
		async get({ fresh = false } = {}) {
			if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
			// A check already in flight may have started before what the caller just changed (Run again
			// prepares the code, then gates on it — D-067): a fresh request waits it out and checks anew.
			if (fresh && pending) await pending.catch(() => {});
			pending ??= checkReadiness(options).then((value) => {
				cached = { at: Date.now(), value };
				return value;
			}).finally(() => (pending = null));
			return pending;
		},
		/** Drops the cached result and tells listeners (D-223: the app's rows update at once, not on the 30 s poll). */
		invalidate() {
			cached = null;
			options.onInvalidate?.();
		},
	};
}
