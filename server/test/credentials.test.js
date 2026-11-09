import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteCredential, listCredentials, maskEmail, readCredentialField, saveCredential } from "../lib/credentials.js";
import { PromptHub } from "../lib/prompts.js";
import { DriverHost } from "../lib/driver-host.js";
import { postOnce } from "../lib/driver-queue.js";
import { replayMacroV2 } from "../lib/macro-v2.js";
import { startFakeRunner } from "./fake-runner.js";

process.env.TEST_FORGE_NO_NOTIFY = "1";

function memoryKeychain() {
	const items = new Map();
	return {
		items,
		write: async (service, account, secret) => items.set(`${service}|${account}`, secret),
		read: async (service, account) => items.get(`${service}|${account}`) ?? null,
		remove: async (service, account) => items.delete(`${service}|${account}`),
	};
}

test("UATB keeps its static OTP; the index holds no secret", async () => {
	const home = await mkdtemp(join(tmpdir(), "test-forge-creds-"));
	const store = memoryKeychain();
	await saveCredential({ env: "uatb", profile: "internal", email: "tester@example.com", password: "s3cret!", otp: "123456" }, { store, home });
	const index = await readFile(join(home, "credentials-index.json"), "utf8");
	assert.ok(!index.includes("s3cret!") && !index.includes("123456") && !index.includes("tester@"));
	assert.deepEqual((await listCredentials({ home })).map((row) => [row.env, row.profile, row.hasOtp]), [["uatb", "internal", true]]);
	assert.equal(await readCredentialField("uatb/internal", "otp", { store }), "123456");
	await deleteCredential({ env: "uatb", profile: "internal" }, { store, home });
	assert.equal(store.items.size, 0);
	assert.deepEqual(await listCredentials({ home }), []);
});

test("production refuses a stored OTP; a missing one reads as null (asked live)", async () => {
	const home = await mkdtemp(join(tmpdir(), "test-forge-creds-"));
	const store = memoryKeychain();
	await assert.rejects(saveCredential({ env: "prod", profile: "internal", email: "a@b.c", password: "x", otp: "1" }, { store, home }), /real OTPs/);
	await saveCredential({ env: "prod", profile: "internal", email: "a@b.c", password: "x" }, { store, home });
	assert.equal(await readCredentialField("prod/internal", "otp", { store }), null);
	await assert.rejects(readCredentialField("prod/nobody", "password", { store }), /no login/);
	assert.equal(maskEmail("qa.tester@example.com"), "qa*******@example.com");
});

test("prompt hub: answer resolves, cancel-for-task stops, bad action refused", async () => {
	const hub = new PromptHub();
	const pending = hub.ask({ title: "Tap Continue", text: "x", taskId: "t1" });
	const [prompt] = hub.list();
	assert.equal(hub.answer(prompt.id, { action: "nope" }), false);
	hub.answer(prompt.id, { action: "done" });
	assert.equal((await pending).action, "done");
	const second = hub.ask({ title: "y", text: "y", taskId: "t2" });
	hub.cancelForTask("t2");
	assert.equal((await second).action, "stop");
	assert.equal(hub.list().length, 0);
});

const registry = { schemaVersion: 1, elements: { el_pw: { alias: "Password field", locator: { chain: [{ identifier: "pw" }] } } } };

async function replayWith(steps, hostOverrides) {
	const host = new DriverHost({ port: 0 });
	await host.listen();
	const runner = startFakeRunner(host.endpoint, (command) => (command.kind === "tap" ? { found: true, hittable: true } : { error: "unexpected" }));
	const typed = [];
	try {
		const result = await replayMacroV2({ id: "mc_x", name: "x", steps }, {
			registry,
			send: (command, { timeoutMs }) => postOnce(command, Math.min(timeoutMs, 600), host.endpoint),
			host: { keystroke: async (text, options) => typed.push([text, options.submit]), secret: async () => null, ask: async () => ({ action: "done" }), ...hostOverrides },
		});
		return { result, typed, seen: runner.seen };
	} finally {
		await runner.stop();
		host.close();
	}
}

test("typeSecret: runner only focuses, value typed host-side, never in the step text", async () => {
	const { result, typed, seen } = await replayWith(
		[{ id: "st_1", do: "typeSecret", el: "el_pw", credential: "uatb/internal", field: "password", submit: true }],
		{ secret: async () => "s3cret!" });
	assert.equal(result.verdict, "PASS (driver-level)");
	assert.deepEqual(typed, [["s3cret!", true]]);
	assert.ok(!JSON.stringify(seen).includes("s3cret!"), "secret must not reach the runner");
	assert.ok(!result.results[0].text.includes("s3cret!"));
});

test("typeSecret without a stored OTP asks a person; stop → BLOCKED", async () => {
	const asked = [];
	const ask = async (question) => {
		asked.push(question);
		return { action: "done", value: "987654" };
	};
	const { result, typed } = await replayWith([{ id: "st_1", do: "typeSecret", el: "el_pw", credential: "prod/internal", field: "otp" }], { ask });
	assert.equal(result.ok, true);
	assert.equal(asked[0].kind, "input");
	assert.equal(asked[0].secret, true);
	assert.deepEqual(typed, [["987654", false]]);

	const stopped = await replayWith([{ id: "st_1", do: "typeSecret", el: "el_pw", credential: "prod/internal", field: "otp" }], { ask: async () => ({ action: "stop" }) });
	assert.equal(stopped.result.verdict, "BLOCKED");
});

test("manual step: done passes, not shown skips, timeout blocks", async () => {
	const step = { id: "st_1", do: "manual", say: "Tap Continue on the system alert" };
	assert.equal((await replayWith([step], { ask: async () => ({ action: "done" }) })).result.ok, true);
	const skipped = await replayWith([step], { ask: async () => ({ action: "skip" }) });
	assert.equal(skipped.result.results[0].skipped, true);
	const timedOut = await replayWith([step], { ask: async () => ({ action: "timeout" }) });
	assert.equal(timedOut.result.verdict, "BLOCKED");
	assert.match(timedOut.result.reason, /nobody answered/);
});

test("typeSecret without an element types into the focused field, no runner call", async () => {
	const { result, typed, seen } = await replayWith([{ id: "st_1", do: "typeSecret", credential: "uatb/internal", field: "otp" }], { secret: async () => "123456" });
	assert.equal(result.ok, true);
	assert.deepEqual(typed, [["123456", false]]);
	assert.equal(seen.length, 0);
	assert.match(result.results[0].text, /focused field/);
});
