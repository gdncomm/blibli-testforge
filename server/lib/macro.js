// Thin wrapper around test-flow-recorder's macro_cli.py (list/resolve only — recording macros stays
// a Claude-driven flow via /test-forge-macro, this dashboard only replays what it already saved).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolvePluginScript } from "./plugin-paths.js";
import { postCommand } from "./driver-queue.js";

const run = promisify(execFile);

function uiTestRoot() {
	return (
		process.env.TEST_FORGE_UITEST_ROOT ||
		`${process.env.TEST_FORGE_PROJECT_DIR || "."}/${process.env.TEST_FORGE_UITEST_TARGET || "BlibliMobile_XCUITest"}`
	);
}

async function callCli(args) {
	const script = resolvePluginScript("TEST_FORGE_MACRO_SCRIPT", "macro_cli.py");
	if (!script) {
		return { ok: false, error: "macro_cli.py not found. Set TEST_FORGE_MACRO_SCRIPT to its path." };
	}
	try {
		const { stdout } = await run("python3", [script, ...args], { timeout: 15_000 });
		return { ok: true, stdout: stdout.trim() };
	} catch (error) {
		return { ok: false, error: (error.stderr || error.message || "").trim() };
	}
}

export async function listMacros() {
	const result = await callCli(["list", "--search-root", uiTestRoot()]);
	if (!result.ok) return result;
	const macros = result.stdout
		.split("\n")
		.filter((line) => line.includes("·"))
		.map((line) => {
			// `<name> · <n> step(s) · <path>` — a name may itself contain "·", so parse from the right.
			const match = line.match(/^(.*) · (\d+ step\(s\)) · (.*)$/);
			if (!match) return { name: line.split("·")[0].trim(), detail: "" };
			return { name: match[1].trim(), detail: match[2], file: match[3].trim() };
		});
	return { ok: true, macros };
}

async function resolveSteps(name) {
	const result = await callCli(["resolve", name, "--search-root", uiTestRoot()]);
	if (!result.ok) return result;
	try {
		return { ok: true, steps: JSON.parse(result.stdout) };
	} catch {
		return { ok: false, error: `could not parse macro steps: ${result.stdout}` };
	}
}

/**
 * Replays a saved macro's steps against the driver queue, one at a time, re-executing and
 * re-checking live rather than trusting the outcomes it was recorded with — the same rule
 * commands.md holds every plan step to. `onStep` is called after each command with its outcome;
 * replay stops at the first step whose outcome looks like a failure.
 */
export async function replayMacro(name, onStep, isCancelled = () => false) {
	const resolved = await resolveSteps(name);
	if (!resolved.ok) return resolved;

	for (const [index, command] of resolved.steps.entries()) {
		if (isCancelled()) return { ok: false, cancelledAt: index };
		const raw = await postCommand(command);
		// TestForgeDriverRunner answers `{id, value: {...}}`; failures come back as a top-level `error`.
		const outcome = raw?.value && raw.error === undefined ? raw.value : raw;
		const failed =
			outcome?.error ||
			outcome?.found === false ||
			outcome?.exists === false ||
			outcome?.hittable === false;
		onStep?.({ index, command, outcome, failed: Boolean(failed) });
		if (failed) return { ok: false, failedAt: index, outcome };
	}
	return { ok: true, stepCount: resolved.steps.length };
}
