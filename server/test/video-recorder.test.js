// Video proof (R4k, D-110): the recorder interrupts simctl and reports the movie only when one was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startVideo } from "../lib/video-recorder.js";

function fakeSimctl({ writes }) {
	return (_command, args) => {
		const child = new EventEmitter();
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		child.exitCode = null;
		child.signals = [];
		child.kill = async (signal) => {
			child.signals.push(signal);
			if (writes) await writeFile(args.at(-1), "mp4");
			child.exitCode = 0;
			child.emit("exit", 0);
		};
		setTimeout(() => child.stderr.emit("data", "Recording started"), 10);
		fakeSimctl.last = child;
		return child;
	};
}

test("stop sends SIGINT and returns the movie path", async () => {
	const path = join(await mkdtemp(join(tmpdir(), "test-forge-video-")), "SF-001", "SF-001.mp4");
	const recording = await startVideo({ udid: "UDID", path, spawn: fakeSimctl({ writes: true }) });
	assert.equal(await recording.stop(), path);
	assert.deepEqual(fakeSimctl.last.signals, ["SIGINT"]);
});

test("no movie written → null", async () => {
	const path = join(await mkdtemp(join(tmpdir(), "test-forge-video-")), "x.mp4");
	const recording = await startVideo({ udid: "UDID", path, spawn: fakeSimctl({ writes: false }) });
	assert.equal(await recording.stop(), null);
});

test("trimToLast keeps the movie's end with a stream copy, and keeps the full movie when ffmpeg fails", async () => {
	const { trimToLast } = await import("../lib/video-recorder.js");
	const { existsSync } = await import("node:fs");
	if (!["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].some((path) => existsSync(path))) return;
	const path = join(await mkdtemp(join(tmpdir(), "test-forge-video-")), "SF-061.mp4");
	await writeFile(path, "full");
	const calls = [];
	assert.equal(await trimToLast(path, 60, { run: async (_bin, args) => (calls.push(args), writeFile(args.at(-1), "cut")) }), path);
	assert.deepEqual(calls[0].slice(3, 5), ["-sseof", "-60"]);
	const { readFile } = await import("node:fs/promises");
	assert.equal(await readFile(path, "utf8"), "cut");
	await trimToLast(path, 60, { run: async () => { throw new Error("bad input"); } });
	assert.equal(await readFile(path, "utf8"), "cut");
});
