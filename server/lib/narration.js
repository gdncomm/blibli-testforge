// Plain-words live steps (D-077, redesign-plan #4/#5): what the robot or Claude is doing on the phone
// right now, one entry per step with an SF Symbol name, its status and how long it took. Replays
// narrate their macro steps; Claude's first runs narrate their phone and fake-data tool calls. The
// console keeps the raw lines; `logIndex` points at the job line a step starts from.
import { EventEmitter } from "node:events";

const KEEP_RUNS = 3;
const MAX_STEPS = 300;

const STEP_ICONS = {
	openDeeplink: "link",
	openUrl: "link",
	relaunch: "app.badge",
	relaunchApp: "app.badge",
	setAppDefault: "gearshape",
	setDefault: "gearshape",
	clearAppDefault: "gearshape",
	clearDefault: "gearshape",
	mock: "network",
	tap: "hand.tap",
	alertTap: "hand.tap",
	type: "keyboard",
	typeSecret: "key",
	waitFor: "eye",
	waitForGone: "eye.slash",
	assert: "checkmark.seal",
	scrollTo: "arrow.up.and.down",
	scrollToTop: "arrow.up.to.line",
	swipe: "hand.draw",
	screenshot: "camera",
	wait: "clock",
	assertRequested: "antenna.radiowaves.left.and.right",
	sleep: "clock",
	run: "list.bullet.indent",
	manual: "person.fill.questionmark",
};

/** A macro step's description without the review-only markers ("by text ⚠", forced taps). */
export function plainStepText(row) {
	let text = String(row.text ?? row.do ?? "step")
		.replace(/ \(by text ⚠\)/g, "")
		.replace(/ \(forced — [^)]*\)/g, "")
		.replace(/ \(up to \d+ s\)/g, "")
		.replace(/ within \d+ s/g, "");
	if (row.do === "mock") text = text.replace(/^Mock (?!off: )/, "Mock: ");
	if (row.do === "run") text = text.replace(/^Run routine /, "Run ");
	return text;
}

/**
 * What the phone is busy with while nothing on screen is worth watching yet, or null: a shared setup routine
 * (Open Home, log in), a relaunch, arming a mock, opening a page, waiting for something to load. The Mac app
 * shows it as a banner with a spinner over the Simulator.
 */
export function busyMessage(step) {
	if (step.from) return `Getting the app ready — ${step.routineName ?? "setup"}`;
	const text = plainStepText(step);
	switch (step.do) {
		case "relaunch":
			return "Relaunching the app";
		case "mock":
			return "Setting up the mocked response";
		case "openDeeplink":
		case "openUrl":
			return "Opening the page";
		case "waitFor":
			return text.replace(/^Wait for /, "Waiting for ").concat(" to load");
		case "waitForGone":
		case "wait":
			return text.replace(/^Wait /, "Waiting ");
		case "setDefault":
		case "clearDefault":
			return "Changing an app setting";
		default:
			return null;
	}
}

const shortTool = (name) => String(name ?? "").split("__").at(-1);

/** A Claude tool call as a live step, or null when it doesn't touch the phone or the network mocks. */
export function narrateToolCall(name, input = {}) {
	const tool = shortTool(name);
	const el = input.identifier ?? input.id ?? input.element ?? input.label;
	const quoted = (value) => (value === undefined || value === null || value === "" ? "" : ` “${value}”`);
	// Claude passes booleans as strings as often as not ("false").
	const isOff = (value) => value === false || value === "false";
	const endpoint = input.endpoint ?? input.rule ?? input.id;
	const known = {
		test_forge_tap_by_label: ["hand.tap", `Tap${quoted(input.label)}`],
		test_forge_tap: ["hand.tap", `Tap${quoted(el)}`],
		test_forge_alert_tap: ["hand.tap", `Tap${quoted(input.button ?? input.label)} on the alert`],
		test_forge_type: ["keyboard", `Type${quoted(input.text)}`],
		test_forge_dismiss_keyboard: ["keyboard.chevron.compact.down", "Hide the keyboard"],
		test_forge_scroll_until_exists: ["arrow.up.and.down", `Scroll until${quoted(el)} shows`],
		test_forge_scroll_to_top: ["arrow.up.to.line", "Scroll back to the top"],
		test_forge_swipe: ["hand.draw", `Swipe ${input.direction ?? ""}`.trim()],
		test_forge_wait_for_exists: ["eye", `Wait for${quoted(el)}`],
		test_forge_wait_for_not_exists: ["eye.slash", `Wait for${quoted(el)} to disappear`],
		test_forge_assert_exists: ["checkmark.seal", `Check${quoted(el)} ${isOff(input.exists) ? "is gone" : "is there"}`],
		test_forge_assert_spacing: ["ruler", "Check the spacing"],
		test_forge_get_label: ["text.viewfinder", `Read the text of${quoted(el)}`],
		test_forge_get_labels: ["text.viewfinder", "Read the text on screen"],
		test_forge_get_element_count: ["number", `Count${quoted(el)}`],
		test_forge_get_frame: ["viewfinder", `Measure${quoted(el)}`],
		test_forge_dump_tree: ["list.bullet.indent", "Look at everything on screen"],
		test_forge_screenshot: ["camera", "Take a screenshot"],
		test_forge_open_deeplink: ["link", `Open ${input.url ?? "a link"}`],
		test_forge_relaunch_app: ["app.badge", "Relaunch the app"],
		test_forge_start_recording: ["record.circle", "Start recording the screen"],
		test_forge_stop_recording: ["stop.circle", "Stop recording the screen"],
		lens_set_variant: ["network", isOff(input.enabled) ? `Mock off:${quoted(endpoint)}` : `Mock:${quoted(endpoint)}${input.variant ? ` → ${input.variant}` : " on"}`],
		lens_set_variant_body: ["network", `Mock:${quoted(endpoint)} → custom answer`],
		lens_set_mocking: ["network", `${isOff(input.enabled) ? "Network mocks off" : "Network mocks on"}${endpoint ? `:${quoted(endpoint)}` : ""}`],
		lens_apply_scenario: ["network", `Mock scenario${quoted(input.scenario ?? input.name)}`],
		lens_import_pack: ["square.and.arrow.down", "Load mock pack"],
		lens_set_offline: ["wifi.slash", input.offline === false ? "Back online" : "Phone offline"],
	}[tool];
	if (!known) return null;
	return { icon: known[0], text: known[1] };
}

export class Narrator extends EventEmitter {
	constructor({ now = () => Date.now() } = {}) {
		super();
		this.now = now;
		this.runs = new Map(); // key → run
		this.models = new Map(); // key → { model, modelReason }, set before or after the run begins (D-158)
	}

	/** `key` is the job id. `source`: "macro" (replay) or "claude" (first run / triage); `sessionId` names its Claude session. */
	begin(key, { caseId = null, title = null, source = "macro", sessionId = null } = {}) {
		this.runs.set(key, { key, caseId, title, source, sessionId, ...this.models.get(key), startedAt: new Date(this.now()).toISOString(), endedAt: null, verdict: null, steps: [], busy: null });
		while (this.runs.size > KEEP_RUNS) this.runs.delete(this.runs.keys().next().value);
		this.#changed();
	}

	/** D-158: the model a Claude run is on now and why ("auto, score 3: …" or the switch's reason). */
	setModel(key, { model, reason }) {
		const entry = { model, modelReason: reason };
		this.models.set(key, entry);
		while (this.models.size > KEEP_RUNS) this.models.delete(this.models.keys().next().value);
		const run = this.runs.get(key);
		if (!run) return;
		Object.assign(run, entry);
		this.#changed();
	}

	/** A replay step is about to run. */
	stepStarted(key, { index, do: kind, text, isCleanup = false, logIndex = null, identifier = null, from = null, routineName = null }) {
		const run = this.runs.get(key);
		if (!run) return;
		this.#closeWorking(run, "done");
		this.#setBusy(run, busyMessage({ do: kind, text, from, routineName }));
		this.#push(run, { n: run.steps.length + 1, index, do: kind, icon: STEP_ICONS[kind] ?? "circle", text: plainStepText({ do: kind, text }), isCleanup, status: "working", startedAt: this.now(), ms: null, reason: null, logIndex, source: "macro", target: identifier, frame: null });
	}

	/** Where the working step's element is on screen, in device points (R3d step outline). */
	stepFrame(key, { index, isCleanup = false, frame, screen = null }) {
		const run = this.runs.get(key);
		const step = run && [...run.steps].reverse().find((candidate) => candidate.status === "working" && candidate.index === index && candidate.isCleanup === Boolean(isCleanup));
		if (!step || !frame) return;
		step.frame = frame;
		if (screen) run.screen = screen;
		this.#changed();
	}

	/** A replay step finished (the `onStep` row of replayMacroV2). */
	stepEnded(key, row) {
		const run = this.runs.get(key);
		if (!run || row.note) return;
		const status = row.skipped ? "skipped" : row.ok ? "done" : "failed";
		const open = [...run.steps].reverse().find((step) => step.status === "working" && step.index === row.index && step.isCleanup === Boolean(row.isCleanup));
		if (open) Object.assign(open, { status, ms: row.ms ?? null, reason: row.ok ? null : row.reason ?? null });
		else this.#push(run, { n: run.steps.length + 1, index: row.index, do: row.do, icon: STEP_ICONS[row.do] ?? "circle", text: plainStepText(row), isCleanup: Boolean(row.isCleanup), status, startedAt: this.now(), ms: row.ms ?? null, reason: row.ok ? null : row.reason ?? null, logIndex: null, source: "macro" });
		this.#changed();
	}

	/** A Claude tool call; only phone and fake-data tools become steps. */
	toolCall(key, { id, name, input, logIndex = null }) {
		const run = this.runs.get(key);
		const step = run && narrateToolCall(name, input);
		if (!step) return;
		this.#closeWorking(run, "done");
		this.#push(run, { n: run.steps.length + 1, toolUseId: id ?? null, do: shortTool(name), icon: step.icon, text: step.text, isCleanup: false, status: "working", startedAt: this.now(), ms: null, reason: null, logIndex, source: "claude" });
	}

	/** The tool's result came back. */
	toolResult(key, { id, isError = false, text = "" }) {
		const run = this.runs.get(key);
		const step = run?.steps.find((candidate) => candidate.toolUseId === id && candidate.status === "working");
		if (!step) return;
		Object.assign(step, { status: isError ? "failed" : "done", ms: this.now() - step.startedAt, reason: isError ? String(text).slice(0, 200) : null });
		this.#changed();
	}

	/** D-165 live overlay: an explained replay starts on its opening card; `notes` is the macro's `demo` block or null. */
	explain(key, { notes = null, screen = null } = {}) {
		const run = this.runs.get(key);
		if (!run) return;
		const pick = (field) => notes?.[field] ?? null;
		run.explain = { phase: "intro", title: pick("title"), checks: pick("checks"), why: pick("why"), setup: pick("setup"), focus: null, steps: notes?.steps ?? {} };
		if (screen) run.screen = screen;
		this.#changed();
	}

	/** Where to look now: `style` is action, checking, step, passed or failed; a routine's own steps carry no note. */
	explainFocus(key, { stepId, from, do: kind, text, style, frame, screen = null }) {
		const explain = this.runs.get(key)?.explain;
		if (!explain) return;
		// The opening card stays up through the shared setup (relaunch, home) until the test's own first step.
		if (from && explain.phase === "intro") return;
		const note = !from && stepId ? explain.steps[stepId] ?? null : null;
		explain.phase = "steps";
		explain.focus = { stepId, isRoutine: Boolean(from), do: kind, style, frame, note, text: plainStepText({ do: kind, text }), at: new Date(this.now()).toISOString() };
		if (screen) this.runs.get(key).screen = screen;
		this.#changed();
	}

	/** Background work outside a step (restarting the runner, preconditions, the opening card); null clears it. */
	busy(key, message) {
		const run = this.runs.get(key);
		if (!run) return;
		this.#setBusy(run, message);
		this.#changed();
	}

	#setBusy(run, message) {
		if ((run.busy?.message ?? null) === (message ?? null)) return;
		run.busy = message ? { message, since: new Date(this.now()).toISOString() } : null;
	}

	end(key, verdict) {
		const run = this.runs.get(key);
		if (!run) return;
		run.busy = null;
		this.#closeWorking(run, verdict === "CANCELLED" ? "cancelled" : "done");
		if (run.explain) Object.assign(run.explain, { phase: "result", focus: null });
		Object.assign(run, { verdict, endedAt: new Date(this.now()).toISOString() });
		this.#changed();
	}

	view() {
		return { runs: [...this.runs.values()].reverse() };
	}

	#closeWorking(run, status) {
		for (const step of run.steps) if (step.status === "working" && step.source === "claude") Object.assign(step, { status, ms: this.now() - step.startedAt });
		if (status === "cancelled") for (const step of run.steps) if (step.status === "working") Object.assign(step, { status, ms: this.now() - step.startedAt });
	}

	#push(run, step) {
		run.steps.push(step);
		if (run.steps.length > MAX_STEPS) run.steps.shift();
		this.#changed();
	}

	#changed() {
		this.emit("change");
	}
}

export const narrator = new Narrator();
