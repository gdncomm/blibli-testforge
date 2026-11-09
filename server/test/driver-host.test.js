import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DriverHost } from "../lib/driver-host.js";
import { postOnce } from "../lib/driver-queue.js";
import { startFakeRunner } from "./fake-runner.js";

test("hosts the queue: a command round-trips through a runner", async () => {
	const host = new DriverHost({ port: 0 });
	assert.equal(await host.listen(), true);
	const runner = startFakeRunner(host.endpoint, (command) => ({ found: true, echoed: command.kind }));
	try {
		const outcome = await postOnce({ kind: "tap", identifier: "X" }, 3_000, host.endpoint);
		assert.equal(outcome.value.echoed, "tap");
		const status = await host.status();
		assert.equal(status.hostedBy, "test-forge");
		assert.ok(status.lastPolledSecondsAgo !== null);
	} finally {
		await runner.stop();
		host.close();
	}
});

test("draining is destructive", async () => {
	const host = new DriverHost({ port: 0 });
	await host.listen();
	try {
		host.enqueue({ kind: "tap" });
		assert.equal(host.drain().length, 1);
		assert.equal(host.drain().length, 0);
	} finally {
		host.close();
	}
});

test("port taken → client mode, reports the other host; takes over once it frees", async () => {
	const other = createServer((request, response) => {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ ok: true, hostedBy: "test-forge-driver-mcp", queued: 0 }));
	});
	await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
	const port = other.address().port;
	const host = new DriverHost({ port });
	try {
		assert.equal(await host.listen(), false);
		assert.equal((await host.status()).hostedBy, "test-forge-driver-mcp");
		await new Promise((resolve) => other.close(resolve));
		assert.equal(await host.listen(), true);
		assert.equal((await host.status()).hostedBy, "test-forge");
	} finally {
		host.close();
	}
});
