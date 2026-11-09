// Model auto-pick (D-158): a Claude run starts on the cheapest model the case looks simple enough for, scored locally
// from the case's own words and its run history (no model call), and moves up a tier mid-run when it gets stuck —
// `setModel` on the live session, so the conversation and the phone's state carry over. Every pick and every switch
// says why, in the run's log and on its history record.

export const MODEL_TIERS = ["haiku", "sonnet", "opus"];
export const MODEL_LABELS = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus" };

// Score → tier: 0–2 Haiku, 3–5 Sonnet, 6+ Opus.
const SONNET_AT = 3;
const OPUS_AT = 6;
const MOCK_WORDS = /\b(mock|mocked|empty|null|500|error|fail(s|ed|ure)?|timeout|times? out|slow|no data|invert)\b/i;
const MOTION_WORDS = /\b(countdown|timer|scroll(s|ing)?|stick(s|y)?|collaps(e|es|ed)|expands?|automatically|transition|refresh(es)?|swipe|carousel|chevron|pager|animation|appears? after|seconds?)\b/i;
const DATA_STATE_WORDS = /\b(only one|at least|more than|less than|no \w+ (is|are)|is (empty|null|missing)|returns?|eligible|available)\b/i;
// "Configure a tab without image" / "Set `invertMode` = true": a CMS state the run has to mock; so is a JSON body in the API column.
const CONFIGURE_STEP = /\b(configure[ds]?|set `)/i;
const JSON_BODY = /\{\s*"/;
const NAVIGATION_WORDS = /\b(opens?|navigat(e|es|ion)|redirect(s|ed)?|pdp|back button|deeplink|tab)\b/i;
const HARD_VERDICTS = new Set(["BLOCKED", "FAIL", "UNDECIDED"]);

/** How many steps the case lists (numbered lines, bullets or sentences), at least 1. */
function stepCount(steps) {
	const text = String(steps ?? "").trim();
	if (!text) return 1;
	const numbered = text.match(/(^|\s)\d+[.)]\s/g)?.length ?? 0;
	const lines = text.split(/\n|•|;/).map((line) => line.trim()).filter(Boolean).length;
	return Math.max(1, numbered, lines);
}

/**
 * `{ model, score, reasons, isAuto }` for one case. `override` ("haiku" | "sonnet" | "opus") wins; `"auto"` or
 * nothing scores the case. `history` = earlier run records (`{ caseId, mode, verdict }`); `purpose` other than
 * "run" (triage, repair, save) needs at least Sonnet — it reasons about code, not a screen.
 */
export function pickModel(testCase = {}, { history = [], purpose = "run", override = "auto", buildId = null } = {}) {
	if (MODEL_TIERS.includes(override)) return { model: override, score: null, reasons: ["chosen by hand"], isAuto: false };
	const text = ["scenario", "precondition", "steps", "expected", "api"].map((key) => testCase[key] ?? "").join(" ");
	const reasons = [];
	let score = 0;
	const steps = stepCount(testCase.steps);
	if (steps > 3) {
		score += Math.min(3, Math.floor(steps / 3));
		reasons.push(`${steps} steps`);
	}
	// A named API is one point; a precondition that asks for a data state (or mock words) means arming a mock: two.
	const needsDataState = MOCK_WORDS.test(text) || DATA_STATE_WORDS.test(String(testCase.precondition ?? ""))
		|| CONFIGURE_STEP.test(String(testCase.steps ?? "")) || JSON_BODY.test(String(testCase.api ?? ""));
	if (String(testCase.api ?? "").trim() || needsDataState) {
		score += needsDataState ? 2 : 1;
		reasons.push(needsDataState ? "needs mocked server data" : "reads an API");
	}
	if (MOTION_WORDS.test(text)) {
		score += 2;
		reasons.push("timing or motion to judge");
	}
	if (NAVIGATION_WORDS.test(text)) {
		score += 1;
		reasons.push("crosses screens");
	}
	// History is newest first. Struggles since the last PASS weigh 2 each (up to 4); a case that passed after
	// struggling is still harder than it reads: one point.
	// A failure on an older build says little about this one (the app may have been fixed since), so with a known
	// build only runs on the same build count.
	const earlier = history.filter((run) => run.caseId === testCase.id && run.mode === "run")
		.filter((run) => !buildId || !run.build?.buildId || run.build.buildId === buildId);
	const lastPass = earlier.findIndex((run) => run.verdict === "PASS");
	const recent = (lastPass < 0 ? earlier : earlier.slice(0, lastPass)).filter((run) => HARD_VERDICTS.has(run.verdict));
	const older = lastPass < 0 ? [] : earlier.slice(lastPass).filter((run) => HARD_VERDICTS.has(run.verdict));
	if (recent.length) {
		score += Math.min(4, recent.length * 2);
		reasons.push(`last ${recent.length} Claude run${recent.length > 1 ? "s" : ""} ended ${[...new Set(recent.map((run) => run.verdict))].join("/")}`);
	} else if (older.length) {
		score += 1;
		reasons.push(`passed after ${older.length} failed Claude run${older.length > 1 ? "s" : ""}`);
	}
	let model = score >= OPUS_AT ? "opus" : score >= SONNET_AT ? "sonnet" : "haiku";
	if (purpose !== "run" && model === "haiku") {
		model = "sonnet";
		reasons.push(`${purpose} needs at least Sonnet`);
	}
	if (!reasons.length) reasons.push("short case, no mocks or timing");
	return { model, score, reasons, isAuto: true };
}

export function nextTier(model) {
	const index = MODEL_TIERS.indexOf(model);
	return index >= 0 && index < MODEL_TIERS.length - 1 ? MODEL_TIERS[index + 1] : null;
}

// A tier gets this long before the run moves up; Opus has no limit (nothing above it).
const TIER_BUDGET_MS = { haiku: 6 * 60_000, sonnet: 12 * 60_000 };
const STUCK_AFTER_ERRORS = 3;
// Driver answers that mean "the step didn't work", even when the tool itself didn't error.
const FAILED_STEP = /\b(not found|no element|timed out|timeout|not hittable|failed|unable to|couldn't|could not)\b/i;

/**
 * Watches a live session's tool results and clock; calls `escalate(next, reason)` when the current tier is stuck —
 * three failed tool results in a row, or the tier's time budget spent. At most one switch per tier, always upward.
 * `stop()` ends the watch. Only automatic picks escalate; a model chosen by hand stays.
 */
export function watchForEscalation(session, { model, escalate, now = Date.now, tick = 15_000 }) {
	let current = model;
	let tierStartedAt = now();
	let failuresInRow = 0;
	let isSwitching = false;
	const moveUp = async (reason) => {
		const next = nextTier(current);
		if (!next || isSwitching) return;
		isSwitching = true;
		try {
			await escalate(next, reason, current);
			current = next;
			tierStartedAt = now();
			failuresInRow = 0;
		} finally {
			isSwitching = false;
		}
	};
	const onResult = ({ name = "", text = "", isError }) => {
		const isDriverStep = /qa[-_]driver|test-forge|xcrun|simctl/i.test(name) || name === "Bash";
		const didFail = isError || (isDriverStep && FAILED_STEP.test(String(text).slice(0, 400)));
		failuresInRow = didFail ? failuresInRow + 1 : 0;
		if (failuresInRow >= STUCK_AFTER_ERRORS) moveUp(`${failuresInRow} failed steps in a row on ${MODEL_LABELS[current]}`);
	};
	session.on("tool-result", onResult);
	const timer = setInterval(() => {
		const budget = TIER_BUDGET_MS[current];
		if (budget && now() - tierStartedAt > budget) moveUp(`${Math.round(budget / 60_000)} min on ${MODEL_LABELS[current]} without finishing`);
	}, tick);
	timer.unref?.();
	return {
		get model() {
			return current;
		},
		stop() {
			clearInterval(timer);
			session.off("tool-result", onResult);
		},
	};
}

/** One log line: "Sonnet (auto: 9 steps, needs mocked server data)". */
export function describePick(pick) {
	return `${MODEL_LABELS[pick.model]} (${pick.isAuto ? `auto, score ${pick.score}: ` : ""}${pick.reasons.join(", ")})`;
}

/** Follow-up turns (save a macro, learn a step) only write files from what the run already did: Sonnet is enough. */
export function followUpModel(currentModel, purpose) {
	return purpose !== "run" && currentModel === "opus" ? "sonnet" : null;
}
