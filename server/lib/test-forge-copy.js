// Question 1 of the run flow — "What code?" (workflow-plan §4 ①, D-034, D-035).
//
// Tests never run in the developer's own working copy. Two sources, both ending in a separate QA
// copy under ~/.test-forge/checkouts/:
//   • GitHub branch → `<repo>`: a clone that borrows objects from the developer's repo
//     (`--reference … --dissociate`), then a detached checkout of origin/<branch>.
//   • Local repository → `<repo>-local`: a read-only snapshot of the working copy, uncommitted
//     changes included. The developer's repo is only ever read, with GIT_OPTIONAL_LOCKS=0 so even
//     `git status` does not rewrite its index.
// Every step that is already satisfied is skipped, so a repeat run costs seconds.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const TEST_FORGE_HOME = process.env.TEST_FORGE_HOME || join(homedir(), ".test-forge");
const CHECKOUTS = join(TEST_FORGE_HOME, "checkouts");
const STATE_PATH = join(TEST_FORGE_HOME, "state.json");
const READ_ONLY_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
const MAX_CHANGED_FILES = 200;

// --- Process helpers -------------------------------------------------------------

/** Runs a command, streaming each output line to `onLine`; rejects with the last lines on failure. */
function exec(command, args, { cwd, env = READ_ONLY_ENV, onLine, signal, input, timeoutMs } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env });
		let stdout = "";
		const tail = [];
		const timer = timeoutMs ? setTimeout(() => child.kill("SIGTERM"), timeoutMs) : null;
		const abort = () => child.kill("SIGTERM");
		signal?.addEventListener("abort", abort, { once: true });
		const collect = (isStdout) => (chunk) => {
			const text = String(chunk);
			if (isStdout) stdout += text;
			for (const line of text.split("\n").filter(Boolean)) {
				tail.push(line);
				if (tail.length > 15) tail.shift();
				onLine?.(line);
			}
		};
		child.stdout.on("data", collect(true));
		child.stderr.on("data", collect(false));
		if (input !== undefined) child.stdin.end(input);
		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			if (signal?.aborted) return reject(new Error("cancelled"));
			if (code === 0) return resolve(stdout);
			const error = new Error(`${command} ${args[0] ?? ""} failed (exit ${code})`);
			error.tail = tail.join("\n");
			reject(error);
		});
	});
}

/** Read-only git against the developer's repo (or any repo); returns trimmed stdout. */
async function git(dir, args, options = {}) {
	return (await exec("git", ["-C", dir, ...args], options)).trimEnd();
}

const sha1 = (value) => createHash("sha1").update(value).digest("hex");

async function fileHash(path) {
	try {
		return sha1(await readFile(path));
	} catch {
		return null;
	}
}

// --- State -----------------------------------------------------------------------

async function readState() {
	try {
		return JSON.parse(await readFile(STATE_PATH, "utf8"));
	} catch {
		return { checkouts: {}, current: null };
	}
}

async function writeState(state) {
	await mkdir(TEST_FORGE_HOME, { recursive: true });
	const temporary = `${STATE_PATH}.tmp-${process.pid}`;
	await writeFile(temporary, JSON.stringify(state, null, 2));
	await rename(temporary, STATE_PATH);
}

export async function currentManifest() {
	return (await readState()).current;
}

// --- Branches --------------------------------------------------------------------

/**
 * Branches to pick from, most recent first. Local refs come from the developer's repo as they are
 * (no fetch there — that would move their remote-tracking refs); `refresh` asks GitHub directly
 * with ls-remote, which changes nothing locally.
 */
export async function listBranches(repoPath, { refresh = false, signal } = {}) {
	const format = "%(refname:short)\t%(objectname:short)\t%(committerdate:iso-strict)\t%(authorname)\t%(subject)";
	const raw = await git(repoPath, ["for-each-ref", "--sort=-committerdate", `--format=${format}`, "refs/remotes/origin", "refs/heads"], { signal });
	const byName = new Map();
	const lines = raw.split("\n").filter(Boolean).map((line) => line.split("\t"));
	// D-200: `isLocal` lets the Git sheet tell a plain switch from one that creates a tracking branch.
	const localNames = new Set(lines.map(([ref]) => ref).filter((ref) => !ref.startsWith("origin/")));
	for (const [ref, sha, date, author, subject] of lines) {
		const name = ref.replace(/^origin\//, "");
		if (name === "HEAD" || name === "origin" || byName.has(name)) continue;
		byName.set(name, { name, sha, date, author, subject, onGitHub: ref.startsWith("origin/"), isLocal: localNames.has(name) });
	}
	if (refresh) {
		const remote = await git(repoPath, ["ls-remote", "--heads", "origin"], { signal, timeoutMs: 30_000 });
		const live = new Map(remote.split("\n").filter(Boolean).map((line) => {
			const [sha, ref] = line.split("\t");
			return [ref.replace("refs/heads/", ""), sha.slice(0, 9)];
		}));
		for (const [name, sha] of live) {
			const known = byName.get(name);
			if (known) Object.assign(known, { sha, onGitHub: true, isStaleLocally: !sha.startsWith(known.sha) && !known.sha.startsWith(sha) });
			else byName.set(name, { name, sha, onGitHub: true, isNew: true });
		}
	}
	return [...byName.values()];
}

// --- Dependencies ------------------------------------------------------------------

/**
 * Dependency steps this repo needs, found by the files it carries. Each runs only when its input
 * changed since the last prepare of this copy, or its output is missing.
 */
async function dependencySteps(copyDir) {
	const projectDirs = [copyDir, ...["BlibliMobile-iOS"].map((name) => join(copyDir, name))].filter((dir) => existsSync(dir));
	const steps = [];
	for (const dir of projectDirs) {
		if (existsSync(join(dir, "SwiftPackageList.txt")) && existsSync(join(dir, "SwiftPackages.sh"))) {
			steps.push({
				name: "Swift packages",
				key: `${dir}:spm`,
				cwd: dir,
				input: await fileHash(join(dir, "SwiftPackageList.txt")),
				isOutputMissing: !existsSync(join(dir, "SwiftPackages")),
				command: ["sh", ["SwiftPackages.sh", "download"]],
			});
		}
		if (existsSync(join(dir, "Podfile.lock"))) {
			const lock = await fileHash(join(dir, "Podfile.lock"));
			steps.push({
				name: "CocoaPods",
				key: `${dir}:pods`,
				cwd: dir,
				input: lock,
				// CocoaPods' own up-to-date check is authoritative: the installed manifest matches the lock.
				isUpToDate: lock === (await fileHash(join(dir, "Pods", "Manifest.lock"))),
				command: ["pod", ["install"]],
			});
		}
		if (existsSync(join(dir, "Cartfile.resolved"))) {
			steps.push({
				name: "Carthage",
				key: `${dir}:carthage`,
				cwd: dir,
				input: await fileHash(join(dir, "Cartfile.resolved")),
				isOutputMissing: !existsSync(join(dir, "Carthage", "Build")),
				command: ["carthage", ["bootstrap", "--platform", "iOS", "--use-xcframeworks", "--cache-builds"]],
			});
		}
	}
	return steps;
}

async function installDependencies(copyDir, record, { say, signal }) {
	record.deps ??= {};
	const ran = [];
	for (const step of await dependencySteps(copyDir)) {
		const isSatisfied = step.isUpToDate ?? (!step.isOutputMissing && record.deps[step.key] === step.input);
		if (isSatisfied) {
			say(`  ✓ ${step.name}: already installed`);
			continue;
		}
		say(`  ▸ ${step.name}: ${step.command[0]} ${step.command[1].join(" ")}`);
		await exec(step.command[0], step.command[1], { cwd: step.cwd, env: process.env, signal, onLine: (line) => say(`    ${line}`) });
		record.deps[step.key] = step.input;
		ran.push(step.name);
		say(`  ✓ ${step.name}: installed`);
	}
	return ran;
}

// --- GitHub branch ------------------------------------------------------------------

function repoKey(repoPath) {
	return basename(repoPath).replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Fetches `branch` into the QA copy and checks it out detached. The developer's repo is only read. */
export async function prepareBranch({ repoPath, branch, onLine = () => {}, signal }) {
	if (!/^[\w./-]+$/.test(branch) || branch.includes("..")) throw new Error(`not a branch name: ${branch}`);
	const say = onLine;
	const copyDir = join(CHECKOUTS, repoKey(repoPath));
	const state = await readState();
	const record = state.checkouts[copyDir] ?? {};

	say("▸ Get the code");
	if (!existsSync(join(copyDir, ".git"))) {
		const url = await git(repoPath, ["remote", "get-url", "origin"]);
		say(`  ▸ first time: making a separate QA copy at ${copyDir} (borrows objects from your repo, no change to it)`);
		await mkdir(CHECKOUTS, { recursive: true });
		await exec("git", ["clone", "--no-checkout", "--reference", repoPath, "--dissociate", url, copyDir], { signal, onLine: (line) => say(`    ${line}`) });
	}
	say(`  ▸ fetching ${branch} from GitHub`);
	try {
		await git(copyDir, ["fetch", "--prune", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { signal, timeoutMs: 600_000 });
	} catch (error) {
		error.hint = "Can't reach GitHub — is the VPN on?";
		throw error;
	}
	const sha = await git(copyDir, ["rev-parse", `origin/${branch}`]);
	const head = await git(copyDir, ["rev-parse", "HEAD"]).catch(() => "");
	if (head === sha && record.sha === sha) {
		say(`  ✓ already up to date at ${sha.slice(0, 7)}`);
	} else {
		await git(copyDir, ["checkout", "--force", "--detach", sha], { signal });
		await git(copyDir, ["clean", "-ffd"], { signal });
		if (existsSync(join(copyDir, ".gitmodules"))) await git(copyDir, ["submodule", "update", "--init", "--recursive"], { signal });
		say(`  ✓ checked out ${branch} @ ${sha.slice(0, 7)}`);
	}
	const depsRan = await installDependencies(copyDir, record, { say, signal });

	const [subject, author] = (await git(copyDir, ["log", "-1", "--format=%s%x09%an", sha])).split("\t");
	const base = await git(copyDir, ["merge-base", sha, "origin/develop"]).catch(() => "");
	const changed = base ? (await git(copyDir, ["diff", "--name-only", base, sha])).split("\n").filter(Boolean) : [];
	const manifest = {
		source: "github",
		repo: repoPath,
		branch,
		sha,
		snapshotId: sha.slice(0, 7),
		buildInputId: await buildInputId(copyDir).catch(() => null),
		title: subject,
		author,
		changedFiles: changed.slice(0, MAX_CHANGED_FILES),
		changedFileCount: changed.length,
		path: copyDir,
		depsRan,
		preparedAt: new Date().toISOString(),
	};
	state.checkouts[copyDir] = { ...record, sha, snapshotId: manifest.snapshotId, usedAt: manifest.preparedAt };
	state.current = manifest;
	await writeState(state);
	return manifest;
}

// --- Build inputs ---------------------------------------------------------------------

/**
 * Files that never go into the app or the test runner (D-069), as git globs: the dashboard itself
 * (`tools/`), and the macros, element registry and mock packs the dashboard reads from the UI-test
 * folder (that target compiles only its Swift files). A change there gives a new snapshot id but
 * leaves the build current, so learning or repairing a macro never forces a rebuild.
 */
// D-152: `.claude/` folders (Claude settings, skills, hooks) never go into the app either.
// D-198: the notes Claude runs write next to the macros (`*-notes.md`) are results, not app code.
const BUILD_IGNORED_PATHS = (process.env.TEST_FORGE_BUILD_IGNORED_PATHS ?? "tools/**,**/.claude/**,BlibliMobile-iOS/BlibliMobile_XCUITest/**/*.json,BlibliMobile-iOS/BlibliMobile_XCUITest/**/*.md")
	.split(",").map((path) => path.trim()).filter(Boolean);

/**
 * What the app is built from, as one id: every file outside `BUILD_IGNORED_PATHS` as it is on disk
 * (path + git blob id). Content-based, so committing what was built keeps the id; nothing is
 * written to the repository (`hash-object` without `-w`).
 */
export async function buildInputId(dir) {
	const pathspec = ["--", ".", ...BUILD_IGNORED_PATHS.map((path) => `:(exclude,glob)${path}`)];
	const blobs = new Map();
	for (const entry of (await exec("git", ["-C", dir, "ls-files", "-s", "-z", ...pathspec])).split("\0").filter(Boolean)) {
		const [meta, path] = entry.split("\t");
		blobs.set(path, meta.split(" ")[1]);
	}
	// Files whose content on disk differs from the index's blob, plus untracked ones: hash them as they are.
	const changed = (await exec("git", ["-C", dir, "diff", "--name-only", "-z", "HEAD", ...pathspec])).split("\0").filter(Boolean);
	const untracked = (await exec("git", ["-C", dir, "ls-files", "-z", "--others", "--exclude-standard", ...pathspec])).split("\0").filter(Boolean);
	const toHash = [...new Set([...changed, ...untracked])].filter((path) => existsSync(join(dir, path)));
	for (const path of changed) if (!existsSync(join(dir, path))) blobs.delete(path);
	if (toHash.length) {
		const ids = (await exec("git", ["-C", dir, "hash-object", "--stdin-paths"], { input: toHash.join("\n") })).trim().split("\n");
		toHash.forEach((path, index) => blobs.set(path, ids[index]));
	}
	const hash = createHash("sha1");
	for (const path of [...blobs.keys()].sort()) hash.update(`${path}\0${blobs.get(path)}\n`);
	return hash.digest("hex").slice(0, 12);
}

// --- Local repository snapshot --------------------------------------------------------

/** Files a snapshot carries: tracked + untracked-not-ignored, as git sees them right now. */
async function workingFiles(repoPath) {
	const raw = await exec("git", ["-C", repoPath, "ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
	return [...new Set(raw.split("\0").filter(Boolean))].filter((path) => existsSync(join(repoPath, path)));
}

/**
 * `<sha7>` for a clean tree, `<sha7>+<hash4>` with uncommitted changes — the hash covers the diff
 * against HEAD and every untracked file's content, so any edit gives a new id.
 */
export async function localSnapshotId(repoPath) {
	const sha = await git(repoPath, ["rev-parse", "HEAD"]);
	const dirty = (await git(repoPath, ["status", "--porcelain"])).split("\n").filter(Boolean);
	if (!dirty.length) return { sha, snapshotId: sha.slice(0, 7), dirty };
	const hash = createHash("sha1");
	hash.update(await exec("git", ["-C", repoPath, "diff", "HEAD", "--binary"]));
	const untracked = (await exec("git", ["-C", repoPath, "ls-files", "-z", "--others", "--exclude-standard"])).split("\0").filter(Boolean).sort();
	for (const path of untracked) {
		hash.update(path);
		hash.update((await fileHash(join(repoPath, path))) ?? "");
	}
	return { sha, snapshotId: `${sha.slice(0, 7)}+${hash.digest("hex").slice(0, 4)}`, dirty };
}

/** Copies the working copy into `<repo>-local`. Nothing is written to the developer's repo. */
export async function snapshotLocal({ repoPath, onLine = () => {}, signal }) {
	const say = onLine;
	const copyDir = join(CHECKOUTS, `${repoKey(repoPath)}-local`);
	const state = await readState();
	const record = state.checkouts[copyDir] ?? {};

	say("▸ Get the code");
	const { sha, snapshotId, dirty } = await localSnapshotId(repoPath);
	const files = await workingFiles(repoPath);
	if (record.snapshotId === snapshotId && existsSync(copyDir)) {
		say(`  ✓ already up to date (${snapshotId})`);
	} else {
		say(`  ▸ copying ${files.length} files${dirty.length ? ` — ${dirty.length} uncommitted, included` : ""}`);
		await mkdir(copyDir, { recursive: true });
		// macOS ships openrsync: no --ignore-missing-args, so `files` is already filtered to what exists.
		await exec("rsync", ["-a", "--from0", "--files-from=-", `${repoPath}/`, `${copyDir}/`], { input: files.join("\0"), signal });
		const current = new Set(files);
		const removed = (record.files ?? []).filter((path) => !current.has(path));
		for (const path of removed) await rm(join(copyDir, path), { force: true });
		if (removed.length) say(`  ▸ removed ${removed.length} file(s) deleted since the last snapshot`);
		say(`  ✓ snapshot ${snapshotId}`);
	}
	const depsRan = await installDependencies(copyDir, record, { say, signal });

	const [subject, author] = (await git(repoPath, ["log", "-1", "--format=%s%x09%an"])).split("\t");
	const branch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const changed = dirty.map((line) => line.slice(3));
	const manifest = {
		source: "local",
		repo: repoPath,
		branch,
		sha,
		snapshotId,
		buildInputId: await buildInputId(repoPath).catch(() => null),
		hasLocalChanges: dirty.length > 0,
		title: subject,
		author,
		changedFiles: changed.slice(0, MAX_CHANGED_FILES),
		changedFileCount: changed.length,
		path: copyDir,
		depsRan,
		preparedAt: new Date().toISOString(),
	};
	state.checkouts[copyDir] = { ...record, sha, snapshotId, files, usedAt: manifest.preparedAt };
	state.current = manifest;
	await writeState(state);
	return manifest;
}

/**
 * Has the developer's working copy moved on since the snapshot? A warning, never a block (D-034):
 * the results stay valid for the snapshot that was taken.
 */
export async function localDrift(manifest = null) {
	const current = manifest ?? (await currentManifest());
	if (current?.source !== "local") return { applies: false };
	const now = await localSnapshotId(current.repo);
	const hasDrifted = now.snapshotId !== current.snapshotId;
	// D-083: whether what the app is built from moved — only worth computing once the snapshot moved.
	// A prepare from before build input ids (no `buildInputId`) falls back to the snapshot.
	let hasAppInputsChanged = hasDrifted;
	let appFiles = null;
	if (hasDrifted && current.path && existsSync(current.path)) {
		// D-198: compare app files with the prepared copy itself, so a change to the ignore list never reads as drift.
		appFiles = await appFilesChangedSince(current, now).catch(() => null);
	}
	if (appFiles) hasAppInputsChanged = appFiles.length > 0;
	else if (hasDrifted && current.buildInputId) {
		const nowInputId = await buildInputId(current.repo).catch(() => null);
		hasAppInputsChanged = nowInputId !== current.buildInputId;
	}
	return { applies: true, hasDrifted, hasAppInputsChanged, appFiles: appFiles?.slice(0, 20) ?? null, snapshotId: current.snapshotId, nowId: now.snapshotId };
}

const IGNORED_PATTERNS = BUILD_IGNORED_PATHS.map((glob) => new RegExp(`^${glob
	.replace(/[.+^${}()|[\]\\]/g, "\\$&")
	.replace(/\*\*\//g, "\u0000")
	.replace(/\*\*/g, "\u0001")
	.replace(/\*/g, "[^/]*")
	.replace(/\u0000/g, "(?:.*/)?")
	.replace(/\u0001/g, ".*")}$`));
const isBuildInput = (path) => !IGNORED_PATTERNS.some((pattern) => pattern.test(path));

/** App files whose content differs between the working copy and the prepared copy; null when that can't be told. */
async function appFilesChangedSince(manifest, now) {
	if (!manifest.sha || (manifest.changedFileCount ?? 0) > (manifest.changedFiles ?? []).length) return null;
	const dirtyNow = [
		...(await exec("git", ["-C", manifest.repo, "diff", "--name-only", "-z", "HEAD"])).split("\0"),
		...(await exec("git", ["-C", manifest.repo, "ls-files", "-z", "--others", "--exclude-standard"])).split("\0"),
	];
	const committed = manifest.sha === now.sha ? [] : (await exec("git", ["-C", manifest.repo, "diff", "--name-only", "-z", manifest.sha, now.sha])).split("\0");
	const candidates = [...new Set([...dirtyNow, ...committed, ...(manifest.changedFiles ?? []).map((path) => path.replace(/^"|"$/g, "").split(" -> ").pop())])]
		.filter((path) => path && isBuildInput(path));
	const changed = [];
	for (const path of candidates.sort()) {
		if ((await fileHash(join(manifest.repo, path))) !== (await fileHash(join(manifest.path, path)))) changed.push(path);
	}
	return changed;
}

// --- Disk (workflow-plan §4 ① "Cleanup") -------------------------------------------------

const DERIVED = join(TEST_FORGE_HOME, "derived");

export async function sizeMb(path) {
	try {
		const out = await exec("du", ["-sk", path], { env: process.env });
		return Math.round(Number(out.split("\t")[0]) / 1024);
	} catch {
		return 0;
	}
}

/** QA copies and their DerivedData, with size and last use. Only ever looks inside ~/.test-forge/. */
export async function testForgeUsage() {
	const state = await readState();
	const current = state.current?.path;
	const entries = [];
	for (const [kind, root] of [["copy", CHECKOUTS], ["derived", DERIVED]]) {
		for (const name of await readdir(root).catch(() => [])) {
			const path = join(root, name);
			const copyPath = kind === "copy" ? path : join(CHECKOUTS, name);
			const usedAt = state.checkouts[copyPath]?.usedAt ?? (await stat(path)).mtime.toISOString();
			entries.push({ kind, name, path, sizeMb: await sizeMb(path), usedAt, isCurrent: copyPath === current });
		}
	}
	return { entries, totalMb: entries.reduce((sum, entry) => sum + entry.sizeMb, 0) };
}

/**
 * Removes QA copies / DerivedData not used for `olderThanDays`; the loaded copy is kept unless `keepCurrent`
 * is false (Reset, D-108: a fresh run rebuilds anyway). `kinds` limits it to "copy" or "derived".
 */
export async function freeDiskSpace({ olderThanDays = 14, kinds = ["copy", "derived"], keepCurrent = true } = {}) {
	const cutoff = Date.now() - olderThanDays * 86_400_000;
	const { entries } = await testForgeUsage();
	const removed = [];
	const state = await readState();
	for (const entry of entries) {
		if (!kinds.includes(entry.kind) || (keepCurrent && entry.isCurrent) || Date.parse(entry.usedAt) > cutoff) continue;
		if (!entry.path.startsWith(`${TEST_FORGE_HOME}/`)) continue;
		await rm(entry.path, { recursive: true, force: true });
		if (entry.kind === "copy") delete state.checkouts[entry.path];
		removed.push(entry);
	}
	if (removed.length) await writeState(state);
	return { removed: removed.map(({ kind, name, sizeMb }) => ({ kind, name, sizeMb })), freedMb: removed.reduce((sum, entry) => sum + entry.sizeMb, 0) };
}
