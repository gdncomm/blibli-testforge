import { test } from "node:test";
import assert from "node:assert/strict";
import { MailOtp, extractOtp, pickOtpMessage } from "../lib/mail-otp.js";

const memoryStore = () => {
	const items = new Map();
	return {
		items,
		write: async (service, account, secret) => items.set(`${service}/${account}`, secret),
		read: async (service, account) => items.get(`${service}/${account}`) ?? null,
		remove: async (service, account) => items.delete(`${service}/${account}`),
	};
};
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const idToken = `x.${Buffer.from(JSON.stringify({ preferred_username: "qa.tester@example.com" })).toString("base64url")}.y`;
const mail = (address, minutesAgo, subject, content = "") => ({
	from: { emailAddress: { address } },
	receivedDateTime: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
	subject,
	body: { content },
});

test("extracts only a 6-digit code, subject first", () => {
	assert.equal(extractOtp({ subject: "Kode OTP kamu 482913", body: "" }), "482913");
	assert.equal(extractOtp({ subject: "Verifikasi", body: "Kode: 123456. Berlaku 5 menit. Order 1234567" }), "123456");
	assert.equal(extractOtp({ subject: "Promo 2026", body: "no code" }), null);
});

test("picks the newest mail from the sender inside the window", () => {
	const since = new Date(Date.now() - 3 * 60_000);
	const messages = [
		mail("someone@else.com", 0, "Code 111111"),
		mail("NoReply@BlibliTiket.com", 1, "Code 222222"),
		mail("noreply@bliblitiket.com", 0.5, "Code 333333"),
		mail("noreply@bliblitiket.com", 10, "Code 444444"),
	];
	assert.equal(pickOtpMessage(messages, { since }), "333333");
	assert.equal(pickOtpMessage([mail("noreply@bliblitiket.com", 10, "Code 444444")], { since }), null);
});

test("device-code link stores the refresh token in the Keychain, then fetchOtp reads the code", async () => {
	const store = memoryStore();
	const calls = [];
	const fetcher = async (url, init = {}) => {
		calls.push(url);
		if (url.endsWith("/devicecode")) return json({ device_code: "dc", user_code: "ABCD-1234", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900, interval: 1 });
		if (url.endsWith("/token")) {
			const form = new URLSearchParams(init.body);
			if (form.get("grant_type").endsWith("device_code") && calls.filter((call) => call.endsWith("/token")).length === 1) return json({ error: "authorization_pending" });
			return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, id_token: idToken });
		}
		assert.match(init.headers.Authorization, /^Bearer at$/);
		return json({ value: [mail("noreply@bliblitiket.com", 0, "Your OTP 654321")] });
	};
	const reader = new MailOtp({ fetcher, store, sleep: async () => {} });
	const started = await reader.startLink();
	assert.equal(started.userCode, "ABCD-1234");
	await new Promise((resolve) => reader.once("change", resolve));
	const status = await reader.status();
	assert.equal(status.state, "linked");
	assert.equal(status.username, "qa.tester@example.com");
	assert.equal(JSON.parse([...store.items.values()][0]).refreshToken, "rt");
	assert.equal(await reader.fetchOtp({ timeoutS: 5 }), "654321");
});

test("not linked → null, so the replay falls back to the popup", async () => {
	const reader = new MailOtp({ fetcher: async () => assert.fail("must not call Microsoft"), store: memoryStore() });
	assert.equal(await reader.fetchOtp({ timeoutS: 1 }), null);
	assert.equal((await reader.status()).state, "unlinked");
});

test("no matching mail before the deadline → null", async () => {
	const store = memoryStore();
	await store.write("test-forge.graph", "mail", JSON.stringify({ refreshToken: "rt" }));
	const fetcher = async (url) => (url.endsWith("/token") ? json({ access_token: "at", refresh_token: "rt2", expires_in: 3600 }) : json({ value: [] }));
	const reader = new MailOtp({ fetcher, store, sleep: async () => new Promise((resolve) => setTimeout(resolve, 5)) });
	assert.equal(await reader.fetchOtp({ timeoutS: 0.05, pollS: 0 }), null);
	assert.equal(JSON.parse(await store.read("test-forge.graph", "mail")).refreshToken, "rt2", "rotated refresh token is kept");
});
