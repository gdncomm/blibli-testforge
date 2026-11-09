// Video proof plan (D-113): decides, before a case runs, whether it needs a video at all and which steps to film.
// A video proves behaviour a screenshot can't: timing, motion, something appearing on its own. A static state or a
// tap that lands on a new screen is proven by screenshots. Filming starts at the case's own action (or the check
// just before it, to show the before-state), never at app launch unless the case is about launch, and stops after the
// last check. The kept movie is the window's last MAX_VIDEO_SECONDS: the proof of a long wait is at its end.

export const MAX_VIDEO_SECONDS = 60;
/** Safety stop for a window that never reaches its last check (a wait can run up to 240 s). */
export const HARD_STOP_SECONDS = 300;

/** Words in a case's steps/expected that only a moving picture proves. */
const MOTION = /\b(immediate(ly)?|countdown|timer|tick(s|ing)?|animat\w*|transition\w*|swip\w*|scroll\w*|sticky|pin(s|ned)?|presents? automatically|appears? automatically|dismiss\w*|freez\w*|left open|leave the page open|shimmer|smooth\w*|auto-?(play|scroll|advance)\w*|flicker\w*|jump\w*)\b/i;
/** Words that put app launch / the way in from Home inside the behaviour under test. */
const FROM_LAUNCH = /\b(app launch|cold start|launch(es|ing)? the app|open(s|ing)? the app|relaunch\w*|splash|from (the )?home( page)?|home page)\b/i;

const INTERACTIVE = new Set(["tap", "type", "typeSecret", "swipe", "scrollTo", "scrollToTop", "alertTap"]);
const CHECKS = new Set(["assert", "assertRequested", "screenshot"]);
/** A wait this long is the case waiting for something to happen on its own (a transition), not for a screen to load. */
const LONG_WAIT_S = 15;

const caseText = (testCase) => [testCase?.scenario, testCase?.steps, testCase?.expected].filter(Boolean).join(" \n ");

/** Whether `testCase` needs a video, and why — from the case's own words, before anything runs. */
export function needsVideo(testCase) {
	const text = caseText(testCase);
	const motion = text.match(MOTION);
	if (!motion) return { needed: false, reason: "static result — screenshots prove it" };
	const fromLaunch = FROM_LAUNCH.test([text, testCase?.precondition].filter(Boolean).join(" "));
	return { needed: true, reason: `the case is about “${motion[0]}”`, fromLaunch };
}

const isBehaviour = (step) => INTERACTIVE.has(step.do) || (step.do === "waitFor" && Number(step.timeout) >= LONG_WAIT_S);

/**
 * The steps to film for a replay of `steps` (flattened, as `replayMacroV2` numbers them): `{ needed, reason, startIndex,
 * stopIndex, maxSeconds }`. Steps that came from a routine (`from`) are setup, never the behaviour.
 */
export function planVideo({ testCase, steps = [] }) {
	const need = needsVideo(testCase);
	if (!need.needed) return { ...need, maxSeconds: 0 };
	const own = steps.map((step, index) => ({ step, index })).filter(({ step }) => !step.from && !step.optional);
	const firstCheck = own.find(({ step }) => step.do.startsWith("assert"));
	// The behaviour is the first action after the screen was checked; without such a check, the last action before
	// the first check (the earlier ones are the way in).
	const afterCheck = firstCheck ? own.find(({ step, index }) => index > firstCheck.index && isBehaviour(step)) : null;
	const beforeCheck = own.filter(({ step, index }) => isBehaviour(step) && (!firstCheck || index < firstCheck.index)).at(-1);
	const behaviour = afterCheck ?? beforeCheck;
	if (!behaviour) return { needed: false, reason: "the replay has no action or transition to film — screenshots prove it", maxSeconds: 0 };
	const lastCheck = own.filter(({ step, index }) => index >= behaviour.index && CHECKS.has(step.do)).at(-1);
	const previous = own.filter(({ index }) => index < behaviour.index).at(-1);
	// One quick check before the action shows the before-state on film.
	const showsBefore = previous && (CHECKS.has(previous.step.do) || previous.step.do === "waitFor") && previous.index === behaviour.index - 1;
	const startIndex = need.fromLaunch ? 0 : showsBefore ? previous.index : behaviour.index;
	return {
		needed: true,
		reason: need.fromLaunch ? `${need.reason}; the case covers the way in, so filming starts at launch` : need.reason,
		startIndex,
		stopIndex: lastCheck?.index ?? steps.length - 1,
		maxSeconds: MAX_VIDEO_SECONDS,
	};
}

/** The rule a Claude run follows when it films a case itself (the server only films replays). */
export function videoGuidance(testCase) {
	const need = needsVideo(testCase);
	if (!need.needed) return `Video: not needed for this case (${need.reason}); prove it with screenshots and do not call test_forge_start_recording.`;
	return [
		`Video: needed (${need.reason}).`,
		need.fromLaunch ? "Start test_forge_start_recording right before the launch/entry the case describes." : "Navigate and arm mocks first; start test_forge_start_recording only right before the case's own action (one quick check before it is fine) — never from app launch.",
		`Stop test_forge_stop_recording right after the last check. Keep it under ${MAX_VIDEO_SECONDS} s; arm time-based mocks so a transition lands within ~20 s of starting, and diagnose with recording stopped.`,
	].join(" ");
}

/**
 * Films one replay's planned window: starts recording when step `plan.startIndex` begins, stops once step
 * `plan.stopIndex` has ended, after HARD_STOP_SECONDS, or when `stop()` is called (the replay ended early). A movie
 * longer than `plan.maxSeconds` is cut to its last `plan.maxSeconds` by `trim` (D-113: a 96 s wait capped from the
 * front lost the sheet it was waiting for). A harness restart that runs the macro again keeps the recording going.
 * `stop()` resolves to the movie's path or null.
 */
export function videoWindow(plan, { start, trim = async (path) => path, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
	let starting = null;
	let startedAt = 0;
	let timer = null;
	let stopped = null;
	const stop = () => (stopped ??= (async () => {
		if (timer) clearTimer(timer);
		const recording = await starting;
		if (!recording) return null;
		const path = await recording.stop();
		const seconds = (now() - startedAt) / 1000;
		return path && seconds > plan.maxSeconds ? trim(path, plan.maxSeconds) : path;
	})());
	return {
		async onStepStart(step) {
			if (stopped || starting || step.isCleanup || step.index !== plan.startIndex) return;
			starting = Promise.resolve().then(start).catch(() => null);
			await starting;
			startedAt = now();
			timer = setTimer(() => void stop(), HARD_STOP_SECONDS * 1000);
		},
		async onStep(row) {
			if (starting && !row.note && !row.isCleanup && row.index >= plan.stopIndex) await stop();
		},
		stop,
	};
}
