// Thin wrapper around test-flow-recorder's own harness.py — the same script /test-forge-harness already
// drives. This file never reimplements its lifecycle logic (build detection, wedged-process
// recovery, log tailing); it only finds the script and shells out to it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolvePluginScript } from "./plugin-paths.js";

const run = promisify(execFile);

// P2 (D-054): when a QA-copy build exists, the harness runs from it — its project dir, its own
// DerivedData and the QA simulator. Set by the server; empty means the developer's own setup.
let harnessTarget = () => ({});
export function setHarnessTarget(provider) {
	harnessTarget = provider;
}

async function call(action, extraArgs = []) {
	const script = resolvePluginScript("TEST_FORGE_HARNESS_SCRIPT", "harness.py");
	if (!script) {
		return {
			ok: false,
			error:
				"harness.py not found. Set TEST_FORGE_HARNESS_SCRIPT to its path (the script /test-forge-harness and /test-forge-init install).",
		};
	}
	const env = {
		...process.env,
		TEST_FORGE_PROJECT_DIR: process.env.TEST_FORGE_PROJECT_DIR || process.env.TEST_FORGE_SERVER_PROJECT_DIR,
		...(await harnessTarget()),
	};
	try {
		const { stdout, stderr } = await run("python3", [script, action, ...extraArgs], {
			env,
			timeout: action === "ensure" ? 240_000 : 30_000,
		});
		return { ok: true, output: `${stdout}${stderr}`.trim() };
	} catch (error) {
		return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim(), error: error.message };
	}
}

export const harnessStatus = () => call("status");
export const harnessEnsure = () => call("ensure");
export const harnessStop = () => call("stop");
export const harnessLogs = (count = 40) => call("logs", [String(count)]);
