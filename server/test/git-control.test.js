import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IDENTITY = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
Object.assign(process.env, IDENTITY);
const { fastForward, fetchOrigin, isBranchName, repoStatus, restoreStash, switchBranch } = await import("../lib/git-control.js");

const sandbox = mkdtempSync(join(tmpdir(), "git-control-"));
const origin = join(sandbox, "origin.git");
const dev = join(sandbox, "dev");
const other = join(sandbox, "other");
const testForgeDir = join(dev, "tools", "test-forge-server");
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITY } }).trim();

before(() => {
	execFileSync("git", ["init", "--bare", "-b", "develop", origin]);
	execFileSync("git", ["clone", origin, dev], { stdio: "ignore" });
	writeFileSync(join(dev, "README.md"), "one\n");
	sh(dev, "add", ".");
	sh(dev, "commit", "-qm", "first");
	sh(dev, "push", "-q", "origin", "develop");
	// A branch that carries the TestForge, as the POC branch does; develop doesn't.
	sh(dev, "checkout", "-q", "-b", "qa");
	mkdirSync(testForgeDir, { recursive: true });
	writeFileSync(join(testForgeDir, "server.js"), "// server\n");
	sh(dev, "add", ".");
	sh(dev, "commit", "-qm", "testforge");
	sh(dev, "push", "-q", "-u", "origin", "qa");
	sh(dev, "branch", "-q", "test-forge-two");
	sh(dev, "push", "-q", "origin", "test-forge-two");
	sh(dev, "branch", "-q", "-D", "test-forge-two");
	execFileSync("git", ["clone", "-b", "qa", origin, other], { stdio: "ignore" });
});

test("branch names: refuses option-looking and ref-escaping names", () => {
	assert.equal(isBranchName("feature/IOS-1_a.b"), true);
	assert.equal(isBranchName("-f"), false);
	assert.equal(isBranchName("a..b"), false);
	assert.equal(isBranchName("a b"), false);
});

test("status reads branch, upstream and dirty files", async () => {
	writeFileSync(join(dev, "README.md"), "edited\n");
	writeFileSync(join(dev, "new.txt"), "new\n");
	const status = await repoStatus(dev);
	assert.equal(status.branch, "qa");
	assert.equal(status.upstream, "origin/qa");
	assert.equal(status.unstaged, 1);
	assert.equal(status.untracked, 1);
	assert.equal(status.isDirty, true);
	assert.deepEqual(status.files.map((file) => file.path).sort(), ["README.md", "new.txt"]);
});

test("switch refuses uncommitted work unless asked to stash", async () => {
	await assert.rejects(switchBranch(dev, { branch: "test-forge-two", testForgeDir }), (error) => error.code === "dirty" && error.files.length === 2);
	assert.equal(sh(dev, "branch", "--show-current"), "qa");
});

test("switch refuses a branch that would delete the TestForge", async () => {
	await assert.rejects(switchBranch(dev, { branch: "develop", stash: true, testForgeDir }), (error) => error.code === "removes-testforge");
	assert.equal(sh(dev, "branch", "--show-current"), "qa");
	assert.equal(readFileSync(join(dev, "README.md"), "utf8"), "edited\n");
});

test("switch with stash: tracking branch from origin, then restore brings the work back", async () => {
	const switched = await switchBranch(dev, { branch: "test-forge-two", stash: true, testForgeDir });
	assert.equal(switched.branch, "test-forge-two");
	assert.equal(switched.upstream, "origin/test-forge-two");
	assert.equal(switched.isDirty, false);
	assert.match(switched.stashed, /qa → test-forge-two/);
	await switchBranch(dev, { branch: "qa", testForgeDir });
	const restored = await restoreStash(dev);
	assert.equal(restored.isDirty, true);
	assert.equal(readFileSync(join(dev, "README.md"), "utf8"), "edited\n");
	assert.equal(existsSync(join(dev, "new.txt")), true);
	await assert.rejects(restoreStash(dev), (error) => error.code === "no-stash");
});

test("unknown branch is refused", async () => {
	await assert.rejects(switchBranch(dev, { branch: "nope", testForgeDir }), (error) => error.code === "unknown-branch");
});

test("fetch + fast-forward follows GitHub; a diverged branch is refused", async () => {
	sh(dev, "stash", "push", "-q", "--include-untracked");
	writeFileSync(join(other, "later.txt"), "later\n");
	sh(other, "add", ".");
	sh(other, "commit", "-qm", "later");
	sh(other, "push", "-q", "origin", "qa");
	const fetched = await fetchOrigin(dev);
	assert.equal(fetched.behind, 1);
	assert.ok(fetched.fetchedAt);
	const moved = await fastForward(dev);
	assert.equal(moved.behind, 0);
	assert.equal(existsSync(join(dev, "later.txt")), true);

	writeFileSync(join(dev, "mine.txt"), "mine\n");
	sh(dev, "add", ".");
	sh(dev, "commit", "-qm", "mine");
	writeFileSync(join(other, "theirs.txt"), "theirs\n");
	sh(other, "add", ".");
	sh(other, "commit", "-qm", "theirs");
	sh(other, "pull", "-q", "--no-rebase", "--no-edit");
	sh(other, "push", "-q", "origin", "qa");
	sh(dev, "reset", "-q", "--hard", "HEAD");
	await fetchOrigin(dev);
	const before = sh(dev, "rev-parse", "HEAD");
	await assert.rejects(fastForward(dev), (error) => error.code === "diverged");
	assert.equal(sh(dev, "rev-parse", "HEAD"), before);
});
