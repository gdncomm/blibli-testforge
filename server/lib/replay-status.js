// D-220: whether a case replays without Claude, and when a Claude pass counts as passed.
import { flattenSteps, planStep } from "./macro-v2.js";
import { isPass } from "./results.js";

/** Run history modes that are a Claude run of the case (the server writes "run"; older history has "claude"). */
const CLAUDE_RUN_MODES = new Set(["run", "claude"]);

/** Follow-up turns that are not a result of the case: saving it as a macro and triaging a failed replay. */
export const FOLLOW_UP_MODES = new Set(["learn", "triage"]);

export const UNCONFIRMED = "UNCONFIRMED";

/**
 * Why a recording can't replay without Claude, read from its files alone: a routine it runs is missing or loops,
 * it has no steps, or a step names an element the registry lacks. Null when every step can be planned. Without a
 * `registry` (it couldn't be read) the element check is skipped.
 */
export async function replayProblem(macro, { loadMacro, registry }) {
	let steps;
	try {
		steps = await flattenSteps(macro, loadMacro);
	} catch (error) {
		return error.message;
	}
	if (steps.length === 0) return "it has no steps";
	for (const step of registry ? steps : []) {
		const plan = planStep(step, registry);
		if (plan?.error) return plan.error;
	}
	return null;
}

/**
 * The case's replay status, for its icon and the Replay button's gate:
 * - `free`: a recording whose last replay passed; replays and batches need no Claude.
 * - `unconfirmed`: a recording no replay has passed yet, or whose last replay didn't pass; Replay confirms it.
 * - `broken`: a recording that can't replay; Claude must repair it, so Replay is off.
 * - `claude`: no recording; only Claude can run the case.
 */
export function replayStatus({ macro, problem = null, lastReplay = null }) {
	if (!macro) return { kind: "claude", text: "No recording yet: running this case needs Claude" };
	if (problem) return { kind: "broken", text: `The recording can't replay: ${problem}. Run with Claude to repair it` };
	if (!lastReplay) return { kind: "unconfirmed", text: "Recorded, not confirmed yet: replay it once to confirm it runs without Claude" };
	if (isPass(lastReplay.verdict)) return { kind: "free", text: "Replays without Claude: its last replay passed", at: lastReplay.recordedAt ?? null };
	return {
		kind: "unconfirmed",
		text: `Its last replay ended ${String(lastReplay.verdict ?? "without a verdict").split(" ")[0]}: replay it again, or a batch asks Claude to triage it`,
		at: lastReplay.recordedAt ?? null,
	};
}

/** A Claude pass is not a pass until a replay of the saved recording passes too (D-220). */
export function confirmedVerdict(run) {
	if (!run) return null;
	if (CLAUDE_RUN_MODES.has(run.mode) && isPass(run.verdict)) return UNCONFIRMED;
	return run.verdict ?? null;
}
