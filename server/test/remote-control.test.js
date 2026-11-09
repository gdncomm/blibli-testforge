// D-150: the Remote Control supervisor reads the CLI's own status output and starts it with the TestForge marker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteControl, plainText, readOutput } from "../lib/remote-control.js";

const sample = "\x1b[2K·|· Connecting · BlibliIOSApp · main\r\n·✔︎· Connected · BlibliIOSApp · main\n    Capacity: 1/32 · New sessions\n    \x1b]8;;https://claude.ai/code/session_01ABC?from=cli\x07TestForge · probe\x1b]8;;\x07\nContinue coding in the Claude mobile app or https://claude.ai/code?environment=env_01XYZ\n";

test("plain text keeps the visible words and the hyperlink targets", () => {
	const text = plainText(sample);
	assert.match(text, /Connected · BlibliIOSApp/);
	assert.match(text, /https:\/\/claude\.ai\/code\/session_01ABC/);
	assert.doesNotMatch(text, /\x1b/);
});

test("output says connected, with capacity and both links", () => {
	const lines = plainText(sample).split("\n").map((line) => line.trim()).filter(Boolean);
	const status = readOutput(lines);
	assert.equal(status.phase, "connected");
	assert.deepEqual(status.capacity, { used: 1, max: 32 });
	assert.deepEqual(status.sessionUrls, ["https://claude.ai/code/session_01ABC"]);
	assert.equal(status.environmentUrl, "https://claude.ai/code?environment=env_01XYZ");
	assert.equal(status.problem, null);
});

test("a trust question is surfaced as the problem", () => {
	assert.match(readOutput(["Do you trust the files in this folder?"]).problem, /trust/);
});

test("start runs claude remote-control in the repo with the marker; output updates the view", async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "rc-"));
	const launched = [];
	const fakeChild = Object.assign(new EventEmitter(), { pid: 4242, stdout: new EventEmitter(), stderr: new EventEmitter() });
	const remote = new RemoteControl({
		projectDir: "/repo/App",
		dataDir,
		spawnProcess: (command, args, options) => {
			launched.push({ command, args, options });
			return fakeChild;
		},
		isAlive: (pid) => pid === 4242,
	});
	await remote.start({ spawnMode: "worktree" });
	assert.deepEqual(launched[0].args, ["remote-control", "--name", "TestForge · repo", "--spawn", "worktree"]);
	assert.equal(launched[0].options.cwd, "/repo/App");
	assert.equal(launched[0].options.env.TEST_FORGE_REMOTE, "1");
	fakeChild.stdout.emit("data", sample);
	const view = remote.view();
	assert.equal(view.isRunning, true);
	assert.equal(view.phase, "connected");
	assert.equal(view.spawnMode, "worktree");
	assert.equal(view.sessionUrls.length, 1);
	fakeChild.emit("exit", 0, null);
	assert.equal(remote.view().phase, "stopped");
});
