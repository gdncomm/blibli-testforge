// JS port of test-flow-recorder's queue_cli.py — a client for the TestForgeDriverRunner command queue the
// XCUITest harness hosts at 127.0.0.1:8789. See contracts/commands.md in the test-flow-recorder
// plugin for the full command vocabulary (tap, type, swipe, screenshot, dumpTree, ...).
import { harnessEnsure } from "./harness.js";

const BASE = process.env.TEST_FORGE_DRIVER_URL || "http://127.0.0.1:8789";
const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_MS = 400;

/** One enqueue + poll against any queue base URL; exported for tests that run a fake runner. */
export async function postOnce(command, timeoutMs, base = BASE) {
	const enqueueResponse = await fetch(`${base}/command`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(command),
		signal: AbortSignal.timeout(8_000),
	}).catch((error) => {
		throw new Error(`queue server unreachable at ${base}: ${error.message}`);
	});
	if (!enqueueResponse.ok) throw new Error(`enqueue failed: HTTP ${enqueueResponse.status}`);
	const { id } = await enqueueResponse.json();

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const resultResponse = await fetch(`${base}/result?id=${id}`, { signal: AbortSignal.timeout(8_000) });
		const payload = await resultResponse.json();
		if (!payload.pending) return payload.result;
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	return { error: `timeout waiting for ${command.kind}` };
}

/**
 * One command, with a single harness restart if the session died under it — same recovery
 * `queue_cli.py`'s `post()` does. Only a client-side timeout triggers a retry; an error the harness
 * itself returned (e.g. "no element 'X' after 10s") is a real answer, not a reason to restart.
 */
export async function postCommand(command, { timeoutMs = DEFAULT_TIMEOUT_MS, recover = true } = {}) {
	let result;
	try {
		result = await postOnce(command, timeoutMs);
	} catch (error) {
		result = { error: error.message };
	}
	const timedOut = typeof result?.error === "string" && result.error.startsWith("timeout waiting for");
	if (!recover || !timedOut) return result;

	const restarted = await harnessEnsure();
	if (!restarted.ok) return { error: "harness down and could not be restarted", detail: restarted.output };

	try {
		const retried = await postOnce(command, timeoutMs);
		if (retried?.error) retried.note = "failed again after a harness restart — this command is what kills the session";
		else retried.harnessRestarted = true;
		return retried;
	} catch (error) {
		return { error: error.message };
	}
}
