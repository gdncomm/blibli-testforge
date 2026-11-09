// Git control (D-200): fetch, fast-forward and switch the developer's own working repo from the Mac app.
// The QA copy (lib/test-forge-copy.js) stays the only thing builds are made from; this module is for the
// developer's checkout. Every write is guarded: no force, no reset, no discard. Uncommitted work is
// either kept (refuse) or stashed on request, and a switch that would remove the TestForge itself is refused.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const READ_ENV = { ...ENV, GIT_OPTIONAL_LOCKS: "0" };
const MAX_LISTED_FILES = 50;
const FETCH_TIMEOUT_MS = 10 * 60_000;

/** A git failure carries `tail` (git's own last lines) and, when it is one we recognise, a `code`. */
function git(dir, args, { env = READ_ENV, timeoutMs = 60_000 } = {}) {
	return new Promise((resolvePromise, reject) => {
		execFile("git", ["-C", dir, ...args], { env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (!error) return resolvePromise(String(stdout).trimEnd());
			const failure = new Error(`git ${args[0]} failed`);
			failure.tail = String(stderr || stdout).trim().split("\n").slice(-15).join("\n");
			reject(failure);
		});
	});
}

const refused = (message, code, extra = {}) => Object.assign(new Error(message), { code, refused: true, ...extra });

export function isBranchName(name) {
	return typeof name === "string" && /^[\w./-]+$/.test(name) && !name.includes("..") && !name.startsWith("-") && !name.endsWith(".lock");
}

/** Merge, rebase, cherry-pick or revert half done in the repo; a switch in the middle of one loses track of it. */
async function operationInProgress(repoPath) {
	const gitDir = resolve(repoPath, await git(repoPath, ["rev-parse", "--git-dir"]));
	const markers = [["MERGE_HEAD", "a merge"], ["rebase-merge", "a rebase"], ["rebase-apply", "a rebase"], ["CHERRY_PICK_HEAD", "a cherry-pick"], ["REVERT_HEAD", "a revert"]];
	return markers.find(([file]) => existsSync(join(gitDir, file)))?.[1] ?? null;
}

/** `git status --porcelain=v2 --branch`, read into what the Git sheet shows. */
export async function repoStatus(repoPath) {
	const raw = await git(repoPath, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]);
	const status = { branch: null, sha: null, upstream: null, ahead: 0, behind: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [] };
	for (const entry of raw.split("\0").filter(Boolean)) {
		if (entry.startsWith("# branch.oid ")) status.sha = entry.slice(13) === "(initial)" ? null : entry.slice(13, 22);
		else if (entry.startsWith("# branch.head ")) status.branch = entry.slice(14) === "(detached)" ? null : entry.slice(14);
		else if (entry.startsWith("# branch.upstream ")) status.upstream = entry.slice(18);
		else if (entry.startsWith("# branch.ab ")) {
			const [ahead, behind] = entry.slice(12).split(" ");
			Object.assign(status, { ahead: Math.abs(Number(ahead)), behind: Math.abs(Number(behind)) });
		} else if (entry.startsWith("? ")) {
			status.untracked += 1;
			status.files.push({ path: entry.slice(2), state: "untracked" });
		} else if (entry.startsWith("u ")) {
			status.conflicted += 1;
			status.files.push({ path: entry.split(" ").slice(10).join(" "), state: "conflicted" });
		} else if (entry.startsWith("1 ") || entry.startsWith("2 ")) {
			// A rename (`2 …`) is followed by its original path as a separate NUL field, which matches no prefix here.
			const fields = entry.split(" ");
			const xy = fields[1];
			if (xy[0] !== ".") status.staged += 1;
			if (xy[1] !== ".") status.unstaged += 1;
			status.files.push({ path: fields.slice(entry.startsWith("2 ") ? 9 : 8).join(" "), state: xy[0] !== "." ? "staged" : "modified" });
		}
	}
	const gitDir = resolve(repoPath, await git(repoPath, ["rev-parse", "--git-dir"]));
	const fetchedAt = await stat(join(gitDir, "FETCH_HEAD")).then((info) => info.mtime.toISOString(), () => null);
	const subject = status.sha ? await git(repoPath, ["log", "-1", "--format=%s"]).catch(() => "") : "";
	const stashCount = (await git(repoPath, ["stash", "list"]).catch(() => "")).split("\n").filter(Boolean).length;
	const changedCount = status.files.length;
	return {
		...status,
		subject,
		files: status.files.slice(0, MAX_LISTED_FILES),
		changedCount,
		isDirty: changedCount > 0,
		fetchedAt,
		stashCount,
		operation: await operationInProgress(repoPath),
	};
}

/** `git fetch --prune origin`; writes only remote-tracking refs, never the working tree. */
export async function fetchOrigin(repoPath) {
	try {
		await git(repoPath, ["fetch", "--prune", "origin"], { env: ENV, timeoutMs: FETCH_TIMEOUT_MS });
	} catch (error) {
		error.hint = "Can't reach GitHub — is the VPN on?";
		throw error;
	}
	return repoStatus(repoPath);
}

/** Brings the current branch up to its upstream only when that needs no merge (`--ff-only`). */
export async function fastForward(repoPath) {
	const before = await repoStatus(repoPath);
	if (!before.branch) throw refused("HEAD is detached — switch to a branch first", "detached");
	if (!before.upstream) throw refused(`${before.branch} has no upstream on GitHub`, "no-upstream");
	if (before.operation) throw refused(`finish ${before.operation} first`, "operation");
	if (before.behind === 0) return { ...before, note: "already up to date" };
	if (before.ahead > 0) throw refused(`${before.branch} has ${before.ahead} local commit(s) GitHub doesn't — merge or rebase in a terminal`, "diverged");
	try {
		await git(repoPath, ["merge", "--ff-only", "@{u}"], { env: ENV });
	} catch (error) {
		throw refused("your uncommitted changes touch files the update changes — commit or stash them first", "would-overwrite", { tail: error.tail });
	}
	return { ...(await repoStatus(repoPath)), note: `moved ${before.behind} commit(s) forward` };
}

/** True when `ref` still carries the TestForge's own server; switching to one that doesn't would delete it under the app. */
async function keepsTestForge(repoPath, ref, testForgeDir) {
	if (!testForgeDir) return true;
	const inside = relative(resolve(repoPath), resolve(testForgeDir));
	if (inside.startsWith("..") || inside === "") return true;
	return git(repoPath, ["cat-file", "-e", `${ref}:${inside}/server.js`]).then(() => true, () => false);
}

/**
 * Switches the working repo to `branch` (local, or a new tracking branch from origin). Refuses while work is
 * uncommitted unless `stash` is set, then stashes with untracked files under a message naming the switch.
 * `testForgeDir` is this server's folder: a branch without it is refused.
 */
export async function switchBranch(repoPath, { branch, stash = false, testForgeDir = null }) {
	if (!isBranchName(branch)) throw refused(`not a branch name: ${branch}`, "bad-name");
	const before = await repoStatus(repoPath);
	if (before.operation) throw refused(`finish ${before.operation} first`, "operation");
	if (before.branch === branch) return { ...before, note: `already on ${branch}` };
	const hasLocal = await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true, () => false);
	const hasRemote = await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).then(() => true, () => false);
	if (!hasLocal && !hasRemote) throw refused(`${branch} isn't here or on origin — Fetch first`, "unknown-branch");
	const ref = hasLocal ? `refs/heads/${branch}` : `refs/remotes/origin/${branch}`;
	if (!(await keepsTestForge(repoPath, ref, testForgeDir))) {
		throw refused(`${branch} doesn't carry TestForge — switching would delete the app's own server. Use Prepare code to test that branch instead.`, "removes-testforge");
	}
	let stashed = null;
	if (before.isDirty) {
		if (!stash) throw refused(`${before.changedCount} uncommitted change(s) — commit them, or switch with Stash`, "dirty", { files: before.files });
		const message = `TestForge: before switching ${before.branch ?? before.sha} → ${branch}`;
		await git(repoPath, ["stash", "push", "--include-untracked", "-m", message], { env: ENV });
		stashed = message;
	}
	try {
		await git(repoPath, hasLocal ? ["switch", branch] : ["switch", "--track", `origin/${branch}`], { env: ENV });
	} catch (error) {
		// The stash stays in `git stash list`; the person gets it back with Restore stash on the old branch.
		throw Object.assign(refused(`git couldn't switch to ${branch}`, "switch-failed", { tail: error.tail }), { stashed });
	}
	if (existsSync(join(repoPath, ".gitmodules"))) await git(repoPath, ["submodule", "update", "--init", "--recursive"], { env: ENV, timeoutMs: FETCH_TIMEOUT_MS }).catch(() => {});
	return { ...(await repoStatus(repoPath)), note: `switched to ${branch}`, stashed };
}

/** Re-applies the newest TestForge stash (`git stash pop`); a conflict leaves the stash in place. */
export async function restoreStash(repoPath) {
	const list = (await git(repoPath, ["stash", "list", "--format=%gd%x09%s"])).split("\n").filter(Boolean);
	const entry = list.map((line) => line.split("\t")).find(([, subject]) => subject.includes("TestForge: before switching"));
	if (!entry) throw refused("no TestForge stash to restore", "no-stash");
	try {
		await git(repoPath, ["stash", "pop", entry[0]], { env: ENV });
	} catch (error) {
		throw refused("the stash doesn't apply cleanly here — it's kept; resolve it in a terminal", "stash-conflict", { tail: error.tail });
	}
	return { ...(await repoStatus(repoPath)), note: `restored ${entry[1].replace(/^On [^:]+: /, "")}` };
}
