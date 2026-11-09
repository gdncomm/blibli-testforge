// The dedicated QA simulator (workflow-plan §4 ①, D-053). It is a `simctl clone` of the developer's
// simulator, so it starts with the same installed app and iOS saved passwords the login macros use
// through AutoFill, and from then on QA builds land only on it. QA runs need it to be the only
// booted simulator: every simctl "booted" lookup (NetworkLens, defaults, deep links) then means it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chosenTestDeviceUdid, noteTestDevice } from "./test-device.js";

const run = promisify(execFile);
export const TEST_FORGE_PREFIX = "TestForge · ";

async function simctl(args, timeout = 60_000) {
	return (await run("xcrun", ["simctl", ...args], { timeout, maxBuffer: 16 * 1024 * 1024 })).stdout;
}

export async function listDevices() {
	const { devices } = JSON.parse(await simctl(["list", "devices", "-j"], 20_000));
	return Object.entries(devices).flatMap(([runtime, list]) => list.filter((device) => device.isAvailable !== false).map((device) => ({ ...device, runtime })));
}

/** The test device (D-120): the one the person chose ("Use for tests"), else the "TestForge · " clone. */
export async function findTestForgeSimulator(devices = null) {
	const list = devices ?? (await listDevices());
	const chosen = chosenTestDeviceUdid();
	const device = (chosen && list.find((candidate) => candidate.udid === chosen)) || list.find((candidate) => candidate.name.startsWith(TEST_FORGE_PREFIX)) || null;
	noteTestDevice(device?.udid);
	return device;
}

/** `{ qa, booted, others }` — what the readiness check and the fix buttons need. */
export async function simulatorState() {
	const devices = await listDevices();
	const qa = await findTestForgeSimulator(devices);
	const booted = devices.filter((device) => device.state === "Booted");
	return { qa, booted, others: booted.filter((device) => device.udid !== qa?.udid) };
}

/**
 * Clones the booted simulator (or `sourceUdid`) as "TestForge · <name>". simctl only clones a shut-down
 * device, so the source is shut down for the clone and booted again afterwards when `rebootSource`.
 */
export async function createTestForgeSimulator({ sourceUdid, rebootSource = false, onLine = () => {} } = {}) {
	const devices = await listDevices();
	const existing = await findTestForgeSimulator(devices);
	if (existing) return existing;
	const source = devices.find((device) => device.udid === sourceUdid) ?? devices.find((device) => device.state === "Booted");
	if (!source) throw new Error("no simulator to clone — boot the one you test with first");
	const name = `${TEST_FORGE_PREFIX}${source.name}`;
	if (source.state === "Booted") {
		onLine(`▸ shutting down ${source.name} to clone it`);
		await simctl(["shutdown", source.udid]);
	}
	onLine(`▸ cloning ${source.name} → ${name} (app, data and saved passwords come along)`);
	const udid = (await simctl(["clone", source.udid, name], 600_000)).trim();
	onLine(`▸ booting ${name}`);
	await simctl(["boot", udid]);
	await run("open", ["-a", "Simulator"]).catch(() => {});
	if (rebootSource) await simctl(["boot", source.udid]).catch(() => {});
	onLine(`✓ ${name} ready (${udid})`);
	return { ...source, udid, name, state: "Booted" };
}

export async function bootTestForgeSimulator() {
	const qa = await findTestForgeSimulator();
	if (!qa) throw new Error("no QA simulator yet — create it first");
	if (qa.state !== "Booted") await simctl(["boot", qa.udid]);
	await run("open", ["-a", "Simulator"]).catch(() => {});
	return qa;
}

/** Shuts down every booted simulator except the QA one, so "booted" is unambiguous for QA runs. */
export async function shutDownOthers() {
	const { others } = await simulatorState();
	for (const device of others) await simctl(["shutdown", device.udid]);
	return others.map((device) => device.name);
}
