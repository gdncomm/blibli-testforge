// D-127 (phase A of docs/networklens-console.md): one API for everything NetworkLens — the Mac console, the web page and
// the `test-forge-lens` script all use it, so nothing needs the networklens MCP. Changes go live when the app is polling the
// control queue (owned by this server, port 8788), otherwise into session.json for the next launch; every answer says which.
import { callDetail, callRows, responseOf } from "../lib/lens-calls.js";
import {
	allOff, appliedScenario, editedRule, guardrails, resetToPack, ruleView, scenarioFrom, scenarioView, shiftedBody, timestampsIn,
	variantView, withCopiedVariant, withoutVariant,
} from "../lib/lens-console.js";
import { sessionsIn, trackerDetail, trackerFires, trackerMarkdown, trackerSummary } from "../lib/lens-trackers.js";

export function registerLensRoutes(app, deps) {
	const { readState, setMocking, armVariant, upsertQuickMock, currentTrace, queueHealth, readRules, commit, loadPackRules, replaceScenariosOffline, isAppRunning, sendLensCommand } = deps;

	const send = (res, work) => work().then((value) => res.json(value), (error) => res.status(error.status ?? 500).json({ error: error.message, ...(error.needsRelaunch && { needsRelaunch: true }) }));

	/** Health (who owns the queue, is the app polling it) + mocking state + every rule with its variants. */
	app.get("/api/lens/state", (_req, res) => send(res, async () => ({ health: await queueHealth(), ...(await readState()) })));

	app.get("/api/lens/health", (_req, res) => send(res, queueHealth));

	app.post("/api/lens/mocking", (req, res) => send(res, () => setMocking(Boolean(req.body?.enabled))));

	/** `{ endpoint: "GET /backend/…", variant: "empty", retime? }` — or `{ endpoint, enabled: false }` to turn the rule off. */
	app.post("/api/lens/rule", (req, res) => send(res, () => {
		const { endpoint, variant, enabled = true, retime = false } = req.body ?? {};
		if (!endpoint) throw Object.assign(new Error("endpoint is required, e.g. \"GET /backend/content-api/flashsale\""), { status: 400 });
		if (enabled && !variant) throw Object.assign(new Error("variant is required to turn a rule on"), { status: 400 });
		return armVariant({ endpoint, variant, enabled: Boolean(enabled), retime: Boolean(retime) });
	}));

	app.get("/api/lens/calls", (req, res) => send(res, async () => {
		const reader = await currentTrace();
		if (!reader) return { calls: [], note: "no trace on the test simulator — is it booted, with the app installed? (Devices shows which one tests use)" };
		const rows = callRows(await reader.entries(), { grep: req.query.grep ?? "", limit: Number(req.query.limit || 50) });
		return { calls: rows };
	}));

	app.get("/api/lens/calls/:id", (req, res) => send(res, async () => {
		const record = await findCall(req.params.id);
		return callDetail(record);
	}));

	/** Mock this call: its real response becomes a rule with the standard variant set (loaded = this body, empty, 500, slow…). */
	app.post("/api/lens/calls/:id/mock", (req, res) => send(res, async () => {
		const record = await findCall(req.params.id);
		const { statusCode, body } = responseOf(record);
		const { method = "GET", url = "" } = record.exchange.request ?? {};
		return upsertQuickMock({ method, endpoint: url, statusCode, body });
	}));

	// --- D-128: the Mac Network console (phase B) ---------------------------------------------------------

	/** Every rule with its variants as editor fields (status, headers, delay, pretty body). */
	app.get("/api/lens/rules", (_req, res) => send(res, async () => {
		const { rules, isMockingEnabled, source } = await readRules();
		return { source, isMockingEnabled, rules: rules.map(ruleView) };
	}));

	/** `{ name?, kind: respond|fail|hang, statusCode, headers, delay, body, failure }` — the variant rewritten in place. */
	app.put("/api/lens/rules/:id/variants/:variantId", (req, res) => send(res, async () => {
		const rule = await findRule(req.params.id);
		const next = editedRule(rule, req.params.variantId, req.body ?? {});
		const result = await commit({ rules: [next] });
		return { ...result, rule: ruleView(next) };
	}));

	/** `{ from: variantId, name }` — a copy to edit, so the captured answer stays. */
	app.post("/api/lens/rules/:id/variants", (req, res) => send(res, async () => {
		const rule = await findRule(req.params.id);
		const { rule: next, variant } = withCopiedVariant(rule, req.body?.from, req.body?.name);
		const result = await commit({ rules: [next] });
		return { ...result, rule: ruleView(next), variant: variantView(variant) };
	}));

	app.delete("/api/lens/rules/:id/variants/:variantId", (req, res) => send(res, async () => {
		const next = withoutVariant(await findRule(req.params.id), req.params.variantId);
		const result = await commit({ rules: [next] });
		return { ...result, rule: ruleView(next) };
	}));

	/** The timestamps in a variant's body, to pick the one a time-shift anchors on. */
	app.get("/api/lens/rules/:id/variants/:variantId/timestamps", (req, res) => send(res, async () => {
		const variant = variantView(await findVariant(req.params.id, req.params.variantId));
		const now = Date.now();
		return { timestamps: timestampsIn(variant.body ?? "").map((entry) => ({ ...entry, inSeconds: Math.round((entry.value - now) / 1000) })) };
	}));

	/** `{ anchorPath, inSeconds }` — every timestamp moves so that one lands `inSeconds` from now. */
	app.post("/api/lens/rules/:id/variants/:variantId/timeshift", (req, res) => send(res, async () => {
		const rule = await findRule(req.params.id);
		const variant = variantView(await findVariant(req.params.id, req.params.variantId));
		if (variant.kind !== "respond") throw Object.assign(new Error("only a variant that answers with a body can be time-shifted"), { status: 422 });
		const { body, delta } = shiftedBody(variant.body, req.body?.anchorPath, req.body?.inSeconds ?? 0);
		const next = editedRule(rule, variant.id, { ...variant, body });
		const result = await commit({ rules: [next] });
		return { ...result, deltaMs: delta, rule: ruleView(next) };
	}));

	app.get("/api/lens/scenarios", (_req, res) => send(res, async () => {
		const { scenarios } = await readRules();
		return { scenarios: scenarios.map(scenarioView) };
	}));

	/** `{ name, group?, replace? }` — how every rule is set now, as a named scenario. */
	app.post("/api/lens/scenarios", (req, res) => send(res, async () => {
		const { rules, scenarios } = await readRules();
		const scenario = scenarioFrom(rules, req.body?.name, req.body?.group);
		const existing = scenarios.find((entry) => entry.name === scenario.name);
		if (existing && !req.body?.replace) throw Object.assign(new Error(`“${scenario.name}” already exists — replace it, or pick another name`), { status: 409 });
		if (existing) scenario.id = existing.id;
		const result = await commit({ scenarios: [...scenarios.filter((entry) => entry !== existing), scenario] });
		return { ...result, scenario: scenarioView(scenario) };
	}));

	app.post("/api/lens/scenarios/:id/apply", (req, res) => send(res, async () => {
		const { rules, scenarios } = await readRules();
		const scenario = scenarios.find((entry) => entry.id === req.params.id || entry.name === req.params.id);
		if (!scenario) throw Object.assign(new Error("no such scenario"), { status: 404 });
		const { touched, missing } = appliedScenario(rules, scenario);
		const result = await commit({ rules: touched, isMockingEnabled: true });
		return { ...result, applied: touched.length, missing };
	}));

	/**
	 * Only the grouping goes; the rules it pinned stay. The running app can't drop a scenario live, so this stops and
	 * restarts it — `?relaunch=1` says that is fine, otherwise a running app answers 409 explaining it.
	 */
	app.delete("/api/lens/scenarios/:id", (req, res) => send(res, async () => {
		const { scenarios } = await readRules();
		const doomed = scenarios.find((entry) => entry.id === req.params.id);
		if (!doomed) throw Object.assign(new Error("no such scenario"), { status: 404 });
		// D-130: a phase-D app drops it live; an older build can't, so it falls through to the restart below.
		const live = (await queueHealth()).isAppPolling ? await sendLensCommand({ kind: "edit", removeScenarioIDs: [doomed.id] }) : null;
		if (live?.ok && typeof live.outcome?.removedScenarioCount === "number") {
			return { live: true, removed: doomed.name, note: "Live in the running app — no relaunch needed." };
		}
		if (req.query.relaunch !== "1" && (await isAppRunning())) {
			throw Object.assign(new Error("deleting a scenario restarts the app (it can't drop one while running) — confirm to go ahead"), { status: 409, needsRelaunch: true });
		}
		const result = await replaceScenariosOffline(scenarios.filter((entry) => entry !== doomed));
		return { ...result, removed: doomed.name };
	}));

	/** Leftover-mock check: armed rules, ones the repo pack doesn't keep, armed answers that differ from the pack. */
	app.get("/api/lens/guardrails", (_req, res) => send(res, async () => {
		const [{ rules, isMockingEnabled }, packRules] = await Promise.all([readRules(), loadPackRules()]);
		return guardrails({ rules, isMockingEnabled, packRules });
	}));

	/** `{ to: "off" }` turns every rule off; `{ to: "pack" }` puts the pack's version back on every rule it keeps (off). */
	app.post("/api/lens/reset", (req, res) => send(res, async () => {
		const to = req.body?.to;
		if (!["off", "pack"].includes(to)) throw Object.assign(new Error("to must be \"off\" or \"pack\""), { status: 400 });
		const { rules } = await readRules();
		const changed = to === "off" ? allOff(rules) : resetToPack(rules, await loadPackRules());
		const result = changed.length ? await commit({ rules: changed }) : { live: false, note: "nothing to change" };
		return { ...result, changed: changed.length };
	}));

	// --- D-129: trackers (phase E) ---------------------------------------------------------------------------
	// POST because a contract travels with the ask: `{ ids?: [TRMS ID], contract?: { id: rule }, allSessions? }`.

	app.post("/api/lens/trackers", (req, res) => send(res, async () => {
		const { records, ask } = await trackerInput(req.body);
		const fires = trackerFires(records, ask);
		return { session: sessionsIn(records).at(-1) ?? null, ...trackerSummary(fires, ask) };
	}));

	app.post("/api/lens/trackers/:id", (req, res) => send(res, async () => {
		const { records, ask } = await trackerInput(req.body);
		return trackerDetail(trackerFires(records, ask), req.params.id, ask.contracts[req.params.id]);
	}));

	/** The DA-format markdown page, as text — what a tracker sign-off pastes into Confluence. */
	app.post("/api/lens/trackers-report", (req, res) => send(res, async () => {
		const { records, ask } = await trackerInput(req.body);
		const session = sessionsIn(records).at(-1) ?? "unknown";
		const provenance = {
			Generated: new Date().toISOString().slice(0, 16).replace("T", " "),
			Session: `\`${session}\`${ask.allSessions ? " (all sessions)" : ""}`,
		};
		return { markdown: trackerMarkdown(trackerFires(records, ask), { ...ask, provenance }) };
	}));

	async function trackerInput(body = {}) {
		const ids = (Array.isArray(body.ids) ? body.ids : String(body.ids ?? "").split(","))
			.map((id) => String(id).trim()).filter(Boolean);
		const contracts = body.contract && typeof body.contract === "object" ? body.contract : {};
		const reader = await currentTrace();
		if (!reader) throw Object.assign(new Error("no trace on the test simulator — is it booted, with the app installed? (Devices shows which one tests use)"), { status: 404 });
		return { records: await reader.entries(), ask: { ids, contracts, allSessions: Boolean(body.allSessions) } };
	}

	// --- D-130: breakpoints, replay and the bubble (phase D — fork verbs, live only) ------------------------

	/** Breakpoints set, and every request/response held right now (with the body it would continue with). */
	app.get("/api/lens/breakpoints", (_req, res) => send(res, async () => {
		const outcome = await liveOnly({ kind: "breakpoint.held" });
		return { breakpoints: outcome.breakpoints ?? [], held: outcome.held ?? [] };
	}));

	/**
	 * `{ endpoint: "GET /backend/…", url?, stage?: request|response|both, oneShot? }` — one per endpoint (a second add
	 * updates it). `{ call: <id> }` instead of `endpoint` holds that captured call's endpoint, as the app keys it.
	 */
	app.post("/api/lens/breakpoints", (req, res) => send(res, async () => {
		const { url, stage = "response", oneShot = false } = req.body ?? {};
		const endpoint = req.body?.call ? (await findCall(req.body.call)).exchange.endpointKey : req.body?.endpoint;
		if (!endpoint) throw Object.assign(new Error("endpoint is required, e.g. \"GET /backend/content-api/flashsale\""), { status: 400 });
		if (!["request", "response", "both"].includes(stage)) throw Object.assign(new Error("stage is request, response or both"), { status: 400 });
		const outcome = await liveOnly({ kind: "breakpoint.add", endpointKey: endpoint, ...(url && { url }), stage, oneShot: Boolean(oneShot) });
		return { breakpoints: outcome.breakpoints ?? [] };
	}));

	/** One breakpoint by id, or `?endpoint=` for that endpoint's, or neither for all. Held ones stay held — resume them. */
	app.delete("/api/lens/breakpoints/:id?", (req, res) => send(res, async () => {
		const target = req.params.id ? { breakpointID: req.params.id } : req.query.endpoint ? { endpointKey: String(req.query.endpoint) } : {};
		const outcome = await liveOnly({ kind: "breakpoint.remove", ...target });
		return { breakpoints: outcome.breakpoints ?? [], removed: outcome.removedCount ?? 0 };
	}));

	/** `{ status?, headers?, body? }` — continue, edited; `{ failure: offline|timedOut|connectionLost|cannotFindHost|secureConnectionFailed }` fails it. */
	app.post("/api/lens/held/:id/resume", (req, res) => send(res, async () => {
		const { status, headers, body, failure } = req.body ?? {};
		const outcome = await liveOnly({
			kind: "breakpoint.resume", heldID: req.params.id,
			...(status !== undefined && { status: Number(status) }), ...(headers && { headers }), ...(typeof body === "string" && { body }), ...(failure && { failure }),
		});
		return { held: outcome.held ?? [] };
	}));

	app.post("/api/lens/held/resume-all", (_req, res) => send(res, async () => ({ held: (await liveOnly({ kind: "breakpoint.resumeAll" })).held ?? [] })));

	/** Sends the captured request again from the app (mocks and breakpoints apply; the screen does not see the answer). */
	app.post("/api/lens/calls/:id/replay", (req, res) => send(res, async () => {
		const record = await findCall(req.params.id);
		const outcome = await liveOnly({ kind: "replay", exchangeID: record.exchange.id });
		return { replayed: outcome.replayed ?? null };
	}));

	/** `{ hidden: true }` hides the NetworkLens bubble (and its overlay) so it never covers what a test taps. */
	app.post("/api/lens/bubble", (req, res) => send(res, async () => {
		const outcome = await liveOnly({ kind: "ui.bubble", isBubbleHidden: req.body?.hidden !== false });
		return { isBubbleHidden: Boolean(outcome.isBubbleHidden) };
	}));

	/** These verbs exist only in a running phase-D build: no file fallback, and an older build is named as the cause. */
	async function liveOnly(command) {
		if (!(await queueHealth()).isAppPolling) {
			throw Object.assign(new Error("the app isn't connected — breakpoints, replay and the bubble only work while it runs"), { status: 409 });
		}
		const result = await sendLensCommand(command);
		if (result.ok) return result.outcome ?? {};
		if (/Unknown command/.test(result.error ?? "")) {
			throw Object.assign(new Error("this app build predates NetworkLens phase D — Install for testing after the test-forge-driver-3 re-pin"), { status: 501 });
		}
		throw Object.assign(new Error(result.error ?? "the app did not answer"), { status: result.reachable ? 422 : 504 });
	}

	async function findRule(id) {
		const { rules } = await readRules();
		const rule = rules.find((entry) => entry.id === id);
		if (!rule) throw Object.assign(new Error("no such rule"), { status: 404 });
		return rule;
	}

	async function findVariant(ruleId, variantId) {
		const variant = (await findRule(ruleId)).variants?.find((entry) => entry.id === variantId);
		if (!variant) throw Object.assign(new Error("no such variant on this rule"), { status: 404 });
		return variant;
	}

	/** A full id, or a unique prefix of one (the 8 characters a terminal shows). */
	async function findCall(id) {
		const reader = await currentTrace();
		const needle = String(id).toUpperCase();
		const matches = reader ? (await reader.entries()).filter((entry) => String(entry.exchange.id).toUpperCase().startsWith(needle)) : [];
		const exact = matches.find((entry) => String(entry.exchange.id).toUpperCase() === needle);
		if (exact) return exact;
		if (matches.length > 1) throw Object.assign(new Error(`${matches.length} calls start with ${id} — give more of the id`), { status: 409 });
		if (!matches.length) throw Object.assign(new Error("no such call in the trace"), { status: 404 });
		return matches[0];
	}
}
