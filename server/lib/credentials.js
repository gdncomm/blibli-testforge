// Test-account logins, kept in the macOS login Keychain — never in a file, macro, log or run
// history (D-044). Secrets reach `security` on stdin (`security -i`), never on a command line,
// where any process could read them from `ps`.
//
// Each login is one generic-password item: service `test-forge.login.<env>`, account `<profile>`,
// secret = JSON {email, password, otp?}. A stored OTP is allowed only for environments with a
// static test OTP (UATB); production OTPs are real and are asked of the person at run time.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TEST_FORGE_HOME } from "./test-forge-copy.js";

const run = promisify(execFile);
const SERVICE_PREFIX = "test-forge.login.";
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const FIELDS = ["email", "password", "otp"];

/** Environments where a static OTP may be stored with the login. Everything else asks live. */
export const STATIC_OTP_ENVIRONMENTS = new Set(["uatb"]);

/** Non-secret listing (env, profile, masked email, whether an OTP is stored), so the UI can list logins without touching the Keychain. */
const indexPath = (home = TEST_FORGE_HOME) => join(home, "credentials-index.json");

export function maskEmail(email) {
	const [user, domain] = String(email ?? "").split("@");
	if (!domain) return "";
	return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

function serviceFor(env) {
	return `${SERVICE_PREFIX}${env}`;
}

function checkNames(env, profile) {
	if (!NAME.test(env) || !NAME.test(profile)) throw new Error("env and profile must be lowercase letters, digits or '-'");
}

/** `security -i` reads one command per line; a value is double-quoted with `\` and `"` escaped. */
function quote(value) {
	return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function securityViaStdin(line) {
	return new Promise((resolve, reject) => {
		const child = spawn("security", ["-i"], { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => (code === 0 && !stderr.trim() ? resolve() : reject(new Error(stderr.trim() || `security exited ${code}`))));
		child.stdin.end(`${line}\n`);
	});
}

/** Injected in tests; production uses the real Keychain. */
export const keychain = {
	async write(service, account, secret, label = `TestForge login (${service.slice(SERVICE_PREFIX.length)}/${account})`) {
		const line = ["add-generic-password", "-U", "-s", quote(service), "-a", quote(account), "-l", quote(label), "-w", quote(secret)].join(" ");
		await securityViaStdin(line);
	},
	async read(service, account) {
		try {
			const { stdout } = await run("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { timeout: 15_000 });
			return stdout.replace(/\n$/, "");
		} catch {
			return null;
		}
	},
	async remove(service, account) {
		await run("security", ["delete-generic-password", "-s", service, "-a", account], { timeout: 15_000 }).catch(() => {});
	},
};

async function readIndex(home) {
	try {
		return JSON.parse(await readFile(indexPath(home), "utf8"));
	} catch {
		return [];
	}
}

async function writeIndex(rows, home) {
	await mkdir(home ?? TEST_FORGE_HOME, { recursive: true });
	await writeFile(indexPath(home), `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
}

export async function listCredentials({ home } = {}) {
	return readIndex(home);
}

export async function saveCredential({ env, profile, email, password, otp }, { store = keychain, home } = {}) {
	checkNames(env, profile);
	if (!email || !password) throw new Error("email and password are required");
	if (otp && !STATIC_OTP_ENVIRONMENTS.has(env)) {
		throw new Error(`${env} uses real OTPs — they are entered at run time, never stored`);
	}
	const secret = JSON.stringify(otp ? { email, password, otp } : { email, password });
	await store.write(serviceFor(env), profile, secret);
	const rows = (await readIndex(home)).filter((row) => !(row.env === env && row.profile === profile));
	rows.push({ env, profile, email: maskEmail(email), hasOtp: Boolean(otp), updatedAt: new Date().toISOString() });
	await writeIndex(rows, home);
	return rows.at(-1);
}

export async function deleteCredential({ env, profile }, { store = keychain, home } = {}) {
	checkNames(env, profile);
	await store.remove(serviceFor(env), profile);
	await writeIndex((await readIndex(home)).filter((row) => !(row.env === env && row.profile === profile)), home);
}

/** `ref` is `<env>/<profile>`. Returns null for an OTP that isn't stored — the caller asks a person. */
export async function readCredentialField(ref, field, { store = keychain } = {}) {
	const [env, profile] = String(ref).split("/");
	checkNames(env ?? "", profile ?? "");
	if (!FIELDS.includes(field)) throw new Error(`unknown credential field “${field}”`);
	const raw = await store.read(serviceFor(env), profile);
	if (raw === null) throw new Error(`no login ${ref} in the Keychain — add it on the dashboard`);
	const value = JSON.parse(raw)[field];
	return value ?? null;
}
