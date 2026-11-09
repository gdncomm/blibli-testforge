import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "test-forge-copy-"));
process.env.TEST_FORGE_HOME = join(sandbox, "testforge");
const { listBranches, localDrift, prepareBranch, snapshotLocal } = await import("../lib/test-forge-copy.js");

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
const origin = join(sandbox, "origin.git");
const dev = join(sandbox, "BlibliIOSApp");

/** What "the developer's repo was not touched" means here: same HEAD, refs, status and index file. */
function fingerprint() {
	return {
		head: sh(dev, "rev-parse", "HEAD"),
		refs: sh(dev, "for-each-ref"),
		status: sh(dev, "status", "--porcelain"),
		indexMtime: statSync(join(dev, ".git", "index")).mtimeMs,
	};
}

before(() => {
	execFileSync("git", ["init", "--bare", "-b", "develop", origin]);
	execFileSync("git", ["clone", origin, dev], { stdio: "ignore" });
	writeFileSync(join(dev, "README.md"), "one\n");
	writeFileSync(join(dev, ".gitignore"), "ignored.txt\n");
	writeFileSync(join(dev, "Podfile.lock"), "PODFILE CHECKSUM: abc\n");
	mkdirSync(join(dev, "Pods"));
	writeFileSync(join(dev, "Pods", "Manifest.lock"), "PODFILE CHECKSUM: abc\n");
	writeFileSync(join(dev, "gone.txt"), "will be deleted\n");
	sh(dev, "add", ".");
	sh(dev, "commit", "-m", "first");
	sh(dev, "push", "-q", "origin", "develop");
	sh(dev, "checkout", "-q", "-b", "release/v1");
	writeFileSync(join(dev, "README.md"), "release\n");
	sh(dev, "commit", "-qam", "release change");
	sh(dev, "push", "-q", "origin", "release/v1");
	sh(dev, "checkout", "-q", "develop");
});

test("GitHub branch: separate copy at the branch tip; second prepare skips; dev repo untouched", async () => {
	const before = fingerprint();
	const lines = [];
	const manifest = await prepareBranch({ repoPath: dev, branch: "release/v1", onLine: (line) => lines.push(line) });
	assert.equal(manifest.source, "github");
	assert.equal(manifest.title, "release change");
	assert.deepEqual(manifest.changedFiles, ["README.md"]);
	assert.equal(readFileSync(join(manifest.path, "README.md"), "utf8"), "release\n");
	assert.ok(lines.some((line) => line.includes("CocoaPods: already installed")), "Pods match their lock → no pod install");

	const again = [];
	await prepareBranch({ repoPath: dev, branch: "release/v1", onLine: (line) => again.push(line) });
	assert.ok(again.some((line) => line.includes("already up to date")));
	assert.deepEqual(fingerprint(), before);
});

test("GitHub branch: rejects names that are not branch names", async () => {
	await assert.rejects(prepareBranch({ repoPath: dev, branch: "x;rm -rf /" }), /not a branch name/);
	await assert.rejects(prepareBranch({ repoPath: dev, branch: "a..b" }), /not a branch name/);
});

test("local repository: snapshot carries uncommitted + untracked, not ignored; drift is reported", async () => {
	writeFileSync(join(dev, "README.md"), "edited, not committed\n");
	writeFileSync(join(dev, "new.swift"), "// untracked\n");
	writeFileSync(join(dev, "ignored.txt"), "secret\n");
	const before = fingerprint();

	const manifest = await snapshotLocal({ repoPath: dev });
	assert.equal(manifest.source, "local");
	assert.equal(manifest.hasLocalChanges, true);
	assert.match(manifest.snapshotId, /^[0-9a-f]{7}\+[0-9a-f]{4}$/);
	assert.equal(readFileSync(join(manifest.path, "README.md"), "utf8"), "edited, not committed\n");
	assert.ok(existsSync(join(manifest.path, "new.swift")));
	assert.ok(!existsSync(join(manifest.path, "ignored.txt")));
	assert.ok(!existsSync(join(manifest.path, ".git")));
	assert.deepEqual(fingerprint(), before);

	assert.equal((await localDrift()).hasDrifted, false);
	writeFileSync(join(dev, "README.md"), "edited again\n");
	assert.equal((await localDrift()).hasDrifted, true);
});

test("local repository: a file deleted in the working copy leaves the next snapshot", async () => {
	const first = await snapshotLocal({ repoPath: dev });
	assert.ok(existsSync(join(first.path, "gone.txt")));
	execFileSync("rm", [join(dev, "gone.txt")]);
	const second = await snapshotLocal({ repoPath: dev });
	assert.notEqual(second.snapshotId, first.snapshotId);
	assert.ok(!existsSync(join(second.path, "gone.txt")));
});

test("branches: local refs first; refresh adds a branch only GitHub has", async () => {
	const other = join(sandbox, "other");
	execFileSync("git", ["clone", "-q", origin, other]);
	sh(other, "checkout", "-q", "-b", "feature/only-remote");
	writeFileSync(join(other, "f.txt"), "f\n");
	sh(other, "add", ".");
	sh(other, "commit", "-qm", "remote only");
	sh(other, "push", "-q", "origin", "feature/only-remote");

	const offline = await listBranches(dev);
	assert.ok(offline.some((branch) => branch.name === "release/v1"));
	assert.ok(!offline.some((branch) => branch.name === "feature/only-remote"));
	const live = await listBranches(dev, { refresh: true });
	assert.equal(live.find((branch) => branch.name === "feature/only-remote")?.isNew, true);
});

test("D-069: edits and commits under tools/ keep the build-input id; app edits change it", async () => {
	const { buildInputId } = await import("../lib/test-forge-copy.js");
	const { execFileSync } = await import("node:child_process");
	const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const repo = await mkdtemp(join(tmpdir(), "inputs-"));
	const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
	git("init", "-q");
	await mkdir(join(repo, "App"));
	await mkdir(join(repo, "tools"));
	await writeFile(join(repo, "App", "main.swift"), "print(1)\n");
	await writeFile(join(repo, "tools", "server.js"), "1\n");
	git("add", ".");
	git("commit", "-qm", "one");
	const before = await buildInputId(repo);
	// The UI-test folder's JSON (macros, registry, packs) is read by the dashboard, never built.
	await mkdir(join(repo, "BlibliMobile-iOS", "BlibliMobile_XCUITest", "TestForgeMacros"), { recursive: true });
	await writeFile(join(repo, "BlibliMobile-iOS", "BlibliMobile_XCUITest", "TestForgeMacros", "elements.json"), "{}\n");
	assert.equal(await buildInputId(repo), before);
	await writeFile(join(repo, "tools", "server.js"), "2\n");
	await writeFile(join(repo, "tools", "new.js"), "x\n");
	assert.equal(await buildInputId(repo), before);
	git("add", ".");
	git("commit", "-qm", "tools only");
	assert.equal(await buildInputId(repo), before);
	await writeFile(join(repo, "App", "main.swift"), "print(2)\n");
	const edited = await buildInputId(repo);
	assert.notEqual(edited, before);
	// Committing what was built keeps the id: it is content-based.
	git("add", ".");
	git("commit", "-qm", "app");
	assert.equal(await buildInputId(repo), edited);
});
