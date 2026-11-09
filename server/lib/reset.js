// Reset for a fresh run (R4f, D-108): one checklist of everything a test cycle leaves behind, with sizes. D-214: it
// also holds what Build › Clean used to delete, and each row can be deleted on its own (ids: [one id]).
// Each item names fixed paths only; nothing here runs git, and the user's repo is reported, never changed.
import { execFile } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { currentManifest, freeDiskSpace, sizeMb, TEST_FORGE_HOME, testForgeUsage } from "./test-forge-copy.js";
import { findTestForgeSimulator } from "./test-forge-simulator.js";

const run = promisify(execFile);
const XCODE_DERIVED = join(homedir(), "Library/Developer/Xcode/DerivedData");
const SWIFTPM_CACHE = join(homedir(), "Library/Caches/org.swift.swiftpm");
const SWIFTPM_SETTINGS = join(homedir(), "Library/org.swift.swiftpm");

const totalMb = async (paths) => (await Promise.all(paths.map(sizeMb))).reduce((sum, mb) => sum + mb, 0);
const childrenOf = async (dir) => (await readdir(dir).catch(() => [])).filter((name) => name !== ".DS_Store").map((name) => join(dir, name));

/** The QA simulator's XCTest Attachments folders (runner screenshots; recordings on sims built before D-106). */
async function attachmentFolders() {
	const qa = await findTestForgeSimulator().catch(() => null);
	if (!qa) return [];
	const daemons = join(homedir(), "Library/Developer/CoreSimulator/Devices", qa.udid, "data/Containers/Data/InternalDaemon");
	return (await childrenOf(daemons)).map((dir) => join(dir, "Attachments"));
}

/**
 * D-214: empties the runner's screenshots between runs. The testforge never reads them — proof is its own simctl
 * captures in the Test Batch folder — and they pile up across sessions. Only files go; the folders stay for XCTest.
 */
export async function clearRunnerScreenshots() {
	let mb = 0;
	for (const folder of await attachmentFolders()) mb += await removeChildren(folder);
	return mb;
}

async function repoState() {
	const manifest = await currentManifest();
	if (!manifest?.repo) return { repo: null, changedFiles: 0 };
	const { stdout } = await run("git", ["-C", manifest.repo, "status", "--porcelain"], { timeout: 15_000 }).catch(() => ({ stdout: "" }));
	return { repo: manifest.repo, branch: manifest.branch, changedFiles: stdout.split("\n").filter(Boolean).length };
}

/**
 * The proof root (R4j: chosen in the app; TEST_FORGE_MEDIA_ROOT itself now points at the active Test Batch's folder),
 * or null when unset or so broad (~, /Users) that emptying it would take the user's files.
 */
function mediaRoot(stores) {
	const root = stores?.testBatches ? stores.testBatches.proofRoot : process.env.TEST_FORGE_MEDIA_ROOT;
	if (!root || !isAbsolute(root)) return null;
	const path = resolve(root);
	return path === homedir() || path.split(sep).length < 4 ? null : path;
}

async function removeChildren(dir, { keep = null } = {}) {
	const paths = (await childrenOf(dir)).filter((path) => path !== keep);
	const mb = await totalMb(paths);
	for (const path of paths) await rm(path, { recursive: true, force: true });
	return mb;
}

const testForgeMb = async (filter) => (await testForgeUsage()).entries.filter(filter).reduce((sum, entry) => sum + entry.sizeMb, 0);

/**
 * In display order. `isDefault` = ticked on open; `stopsRunner` = the test runner is stopped first.
 * `measure` sizes it for the checklist, `perform` deletes it and returns MB freed; paths are fixed here.
 */
const ITEMS = [
	{
		id: "test-forge-derived",
		title: "QA build output",
		detail: () => "~/.test-forge/derived — Build for testing again afterwards",
		isDefault: true,
		stopsRunner: true,
		measure: () => testForgeMb((entry) => entry.kind === "derived"),
		perform: async () => (await freeDiskSpace({ olderThanDays: 0, kinds: ["derived"], keepCurrent: false })).freedMb,
	},
	{
		id: "test-forge-copies",
		title: "Old QA copies",
		detail: () => "~/.test-forge/checkouts — the loaded copy is kept",
		isDefault: true,
		measure: () => testForgeMb((entry) => entry.kind === "copy" && !entry.isCurrent),
		perform: async () => (await freeDiskSpace({ olderThanDays: 0, kinds: ["copy"] })).freedMb,
	},
	{
		id: "sim-attachments",
		title: "Test runner screenshots",
		detail: () => "XCTest Attachments on the QA simulator",
		isDefault: true,
		stopsRunner: true,
		measure: async () => totalMb(await attachmentFolders()),
		perform: () => clearRunnerScreenshots(),
	},
	{
		id: "proof-media",
		title: "Proof screenshots and videos",
		detail: ({ stores }) => (mediaRoot(stores) ? `${mediaRoot(stores)} — the active Test Batch's folder is kept` : "No proof folder chosen (or too broad) — skipped"),
		isDefault: true,
		stopsRunner: true,
		measure: async ({ stores }) => (mediaRoot(stores) ? sizeMb(mediaRoot(stores)) : 0),
		perform: async ({ stores }) => {
			const root = mediaRoot(stores);
			if (!root) throw new Error("no proof folder chosen, or it is too broad to empty");
			const active = stores?.testBatches?.active;
			return removeChildren(root, { keep: active ? join(root, active.folder) : null });
		},
	},
	{
		id: "run-history",
		title: "Run history",
		detail: ({ stores }) => `Results, Reports, finished tasks and Claude sessions (${stores.results.list().length} runs)`,
		isDefault: false,
		measure: ({ stores }) => sizeMb(join(stores.dataDir, "sessions")),
		perform: async ({ stores, say }) => {
			const mb = await sizeMb(join(stores.dataDir, "sessions"));
			say(`  ${stores.results.clearFinished()} result runs, ${stores.tasks.clearFinished()} tasks, ${await stores.sessions.removeFinished()} Claude sessions, ${await stores.clearRuns()} history entries`);
			return mb;
		},
	},
	{
		id: "xcode-derived",
		title: "Xcode DerivedData (yours)",
		detail: () => "~/Library/Developer/Xcode/DerivedData — Xcode re-indexes and rebuilds",
		isDefault: false,
		measure: () => sizeMb(XCODE_DERIVED),
		perform: () => removeChildren(XCODE_DERIVED),
	},
	{
		id: "swiftpm-cache",
		title: "Swift package cache",
		detail: () => "~/Library/Caches/org.swift.swiftpm — packages download again",
		isDefault: false,
		measure: () => sizeMb(SWIFTPM_CACHE),
		perform: () => removeChildren(SWIFTPM_CACHE),
	},
	{
		// D-214: was Build › Clean only; Clean and Reset are one list now.
		id: "swiftpm-settings",
		title: "Swift package settings",
		detail: () => "~/Library/org.swift.swiftpm — package sign-ins and mirrors are set up again",
		isDefault: false,
		measure: () => sizeMb(SWIFTPM_SETTINGS),
		perform: () => removeChildren(SWIFTPM_SETTINGS),
	},
];

export const RESET_IDS = ITEMS.map((item) => item.id);

/** The checklist with sizes, measured in parallel; the repo row is information only and never deleted. */
export async function resetPlan({ stores }) {
	const [sizes, repo] = await Promise.all([Promise.all(ITEMS.map((item) => item.measure({ stores }))), repoState()]);
	const items = ITEMS.map((item, index) => ({
		id: item.id,
		title: item.title,
		detail: item.detail({ stores }),
		sizeMb: sizes[index],
		isDefault: item.isDefault && (item.id !== "proof-media" || Boolean(mediaRoot(stores))),
		stopsRunner: Boolean(item.stopsRunner),
		isInfo: false,
	}));
	const repoDetail = repo.repo ? `${repo.branch ?? "?"} · ${repo.changedFiles} uncommitted file(s) — left alone` : "No code prepared";
	return [...items, { id: "repo", title: "Your repo", detail: repoDetail, sizeMb: 0, isDefault: false, stopsRunner: false, isInfo: true }];
}

/** Deletes the chosen items in display order. */
export async function performReset({ ids, stores, harnessStop, say }) {
	const chosen = ITEMS.filter((item) => ids.includes(item.id));
	if (chosen.some((item) => item.stopsRunner)) {
		say("▸ Stopping the test runner");
		await harnessStop();
	}
	let freedMb = 0;
	for (const item of chosen) {
		say(`▸ ${item.title}`);
		const mb = await item.perform({ stores, say });
		freedMb += mb;
		say(`✓ ${item.title} — ${formatMb(mb)} freed`);
	}
	return { freedMb, items: chosen.map((item) => item.id), testForgeHome: TEST_FORGE_HOME };
}

export const formatMb = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
