// Reads a login OTP from the tester's Outlook mailbox through Microsoft Graph (D-048), so a prod
// login can run without a person typing the code. Only `Mail.Read` is requested, the refresh token
// lives in the macOS Keychain, and only the code itself leaves this module — never a subject, body
// or address. Anything that goes wrong returns null and the replay falls back to the OTP popup.
import { EventEmitter } from "node:events";
import { keychain } from "./credentials.js";

// Microsoft's published public client for Graph command-line tools; IT can issue a dedicated one.
const CLIENT_ID = process.env.TEST_FORGE_GRAPH_CLIENT_ID || "14d82eec-204b-4c2f-b7e8-296a70dab67e";
const TENANT = process.env.TEST_FORGE_GRAPH_TENANT || "organizations";
const SCOPE = "openid profile offline_access Mail.Read";
const AUTHORITY = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";
const KEYCHAIN_SERVICE = "test-forge.graph";
const KEYCHAIN_ACCOUNT = "mail";

export const OTP_SENDER = (process.env.TEST_FORGE_OTP_SENDER || "noreply@bliblitiket.com").toLowerCase();
/** How far before the OTP step a mail still counts: the code is sent when the password is submitted. */
const LOOKBACK_MS = 120_000;
const CODE_PATTERN = /\b(\d{6})\b/;

/** Pulls the code from a message; only the first 6-digit number, nothing else is kept. */
export function extractOtp({ subject = "", body = "" }) {
	return (CODE_PATTERN.exec(subject) ?? CODE_PATTERN.exec(body))?.[1] ?? null;
}

/** Newest message from `sender` received at or after `since`, from a Graph `value` array. */
export function pickOtpMessage(messages, { sender = OTP_SENDER, since }) {
	return messages
		.filter((message) => message.from?.emailAddress?.address?.toLowerCase() === sender)
		.filter((message) => Date.parse(message.receivedDateTime) >= since.getTime())
		.sort((a, b) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime))
		.map((message) => extractOtp({ subject: message.subject, body: message.body?.content }))
		.find(Boolean) ?? null;
}

function usernameFrom(idToken) {
	try {
		return JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8")).preferred_username ?? null;
	} catch {
		return null;
	}
}

async function postForm(url, form, fetcher) {
	const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
	return response.json();
}

export class MailOtp extends EventEmitter {
	constructor({ fetcher = fetch, store = keychain, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
		super();
		this.fetcher = fetcher;
		this.store = store;
		this.sleep = sleep;
		this.link = null;
		this.accessToken = null;
		this.accessTokenExpiresAt = 0;
	}

	async status() {
		if (this.link?.state === "pending") return { state: "pending", userCode: this.link.userCode, verificationUri: this.link.verificationUri, expiresAt: this.link.expiresAt };
		const saved = await this.saved();
		if (saved) return { state: "linked", username: saved.username, linkedAt: saved.linkedAt, sender: OTP_SENDER };
		return { state: "unlinked", error: this.link?.error ?? null, sender: OTP_SENDER };
	}

	async saved() {
		const raw = await this.store.read(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
		try {
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}

	async save(tokens, username) {
		const record = { refreshToken: tokens.refresh_token, username, linkedAt: new Date().toISOString() };
		await this.store.write(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(record), "TestForge Outlook OTP reader");
		this.accessToken = tokens.access_token;
		this.accessTokenExpiresAt = Date.now() + (Number(tokens.expires_in) - 60) * 1000;
	}

	/** Starts a device-code sign-in; the person enters `userCode` at `verificationUri`. */
	async startLink() {
		const started = await postForm(`${AUTHORITY}/devicecode`, { client_id: CLIENT_ID, scope: SCOPE }, this.fetcher);
		if (!started.device_code) throw new Error(started.error_description?.split("\r\n")[0] ?? "Microsoft didn't start a sign-in");
		this.link = { state: "pending", userCode: started.user_code, verificationUri: started.verification_uri, expiresAt: Date.now() + started.expires_in * 1000 };
		this.emit("change");
		this.pollLink(started).catch((error) => this.finishLink({ error: error.message }));
		return this.status();
	}

	async pollLink({ device_code: deviceCode, interval = 5 }) {
		let waitS = interval;
		while (this.link?.state === "pending" && Date.now() < this.link.expiresAt) {
			await this.sleep(waitS * 1000);
			const tokens = await postForm(`${AUTHORITY}/token`, { client_id: CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode }, this.fetcher);
			if (tokens.access_token) {
				await this.save(tokens, usernameFrom(tokens.id_token));
				return this.finishLink({});
			}
			if (tokens.error === "slow_down") waitS += 5;
			else if (tokens.error !== "authorization_pending") return this.finishLink({ error: tokens.error_description?.split("\r\n")[0] ?? tokens.error });
		}
		if (this.link?.state === "pending") this.finishLink({ error: "the sign-in code expired" });
	}

	finishLink({ error }) {
		this.link = { state: "done", error: error ?? null };
		this.emit("change");
	}

	async unlink() {
		await this.store.remove(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
		this.link = null;
		this.accessToken = null;
		this.emit("change");
	}

	async token() {
		if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;
		const saved = await this.saved();
		if (!saved?.refreshToken) return null;
		const tokens = await postForm(`${AUTHORITY}/token`, { client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: saved.refreshToken, scope: SCOPE }, this.fetcher);
		if (!tokens.access_token) throw new Error(tokens.error_description?.split("\r\n")[0] ?? "the Outlook sign-in has expired — link it again");
		await this.save(tokens, saved.username);
		return tokens.access_token;
	}

	/**
	 * Waits for the OTP mail and returns the code, or null when Outlook isn't linked or nothing
	 * arrived in time. `since` is when the OTP step started.
	 */
	async fetchOtp({ since = new Date(), timeoutS = 60, pollS = 4 } = {}) {
		const windowStart = new Date(since.getTime() - LOOKBACK_MS);
		const deadline = Date.now() + timeoutS * 1000;
		while (Date.now() < deadline) {
			const accessToken = await this.token();
			if (!accessToken) return null;
			const query = new URLSearchParams({
				$filter: `receivedDateTime ge ${windowStart.toISOString()}`,
				$orderby: "receivedDateTime desc",
				$top: "10",
				$select: "from,receivedDateTime,subject,body",
			});
			const response = await this.fetcher(`${GRAPH}/me/messages?${query}`, {
				headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
			});
			if (!response.ok) throw new Error(`Outlook answered ${response.status}`);
			const code = pickOtpMessage((await response.json()).value ?? [], { since: windowStart });
			if (code) return code;
			await this.sleep(pollS * 1000);
		}
		return null;
	}
}

export const mailOtp = new MailOtp();
