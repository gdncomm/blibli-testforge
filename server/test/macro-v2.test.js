import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DriverHost } from "../lib/driver-host.js";
import { postOnce } from "../lib/driver-queue.js";
import {
	anchorSummary,
	caseLinks,
	findMacroV2,
	lintMacros,
	listMacrosV2,
	loadRegistry,
	macroMap,
	newId,
	replayMacroV2,
	resetLaunchInputs,
	saveMacroRef,
	saveMacroV2,
	saveRegistry,
} from "../lib/macro-v2.js";
import { startFakeRunner } from "./fake-runner.js";

const registry = {
	schemaVersion: 1,
	elements: {
		el_share: { alias: "Share button", screen: "FlashSale", locator: { chain: [{ identifier: "FS_NavBarShareButton", type: "button" }] } },
		el_tomorrow: {
			alias: "Tomorrow tab",
			screen: "FlashSale",
			locator: { fallbacks: [{ label: "Besok", match: "BEGINSWITH" }, { label: "Tomorrow", match: "BEGINSWITH" }] },
		},
	},
};

const sf084 = {
	schemaVersion: 2,
	id: "mc_test",
	name: "SF-084",
	kind: "bug-verify",
	steps: [
		{ id: "st_1", do: "openDeeplink", url: "blibli://flashsale" },
		{ id: "st_2", do: "waitFor", el: "el_share", timeout: 1 },
		{ id: "st_3", do: "tap", el: "el_tomorrow" },
		{ id: "st_4", do: "assert", el: "el_share", exists: true, within: 1 },
	],
};

async function withRunner(respond, body) {
	const host = new DriverHost({ port: 0 });
	await host.listen();
	const runner = startFakeRunner(host.endpoint, respond);
	const opened = [];
	const deps = {
		registry,
		send: (command, { timeoutMs }) => postOnce(command, Math.min(timeoutMs, 600), host.endpoint).catch((error) => ({ error: error.message })),
		host: { openUrl: async (url) => opened.push(url), sleep: async () => {} },
	};
	try {
		return await body({ deps, runner, opened });
	} finally {
		await runner.stop();
		host.close();
	}
}

const healthyApp = (command) => {
	if (command.kind === "tapByLabel") return command.label === "Besok" ? { found: true, hittable: true, matches: 1 } : { error: "no element" };
	if (command.kind === "waitForExists") return { exists: true };
	if (command.kind === "assertExists") return { pass: true };
	return { error: `unexpected ${command.kind}` };
};

test("SF-084 passes on a healthy app; deeplink runs host-side", async () => {
	await withRunner(healthyApp, async ({ deps, runner, opened }) => {
		const result = await replayMacroV2(sf084, deps);
		assert.equal(result.verdict, "PASS");
		assert.deepEqual(opened, ["blibli://flashsale"]);
		assert.equal(result.results.length, 4);
		assert.equal(result.results[2].resolvedBy, "label");
		assert.ok(!runner.seen.some((command) => command.kind === "openDeeplink"), "deeplink must not reach the runner");
	});
});

test("label fallbacks go out as one OR-ed anyOf query, in order", async () => {
	const englishApp = (command) => {
		if (command.kind !== "tapByLabel") return healthyApp(command);
		return command.anyOf?.some((alternative) => alternative.label === "Tomorrow") ? { found: true, hittable: true } : { error: "no element" };
	};
	await withRunner(englishApp, async ({ deps, runner }) => {
		const result = await replayMacroV2(sf084, deps);
		assert.equal(result.verdict, "PASS");
		const taps = runner.seen.filter((c) => c.kind === "tapByLabel");
		assert.equal(taps.length, 1);
		assert.deepEqual(taps[0].anyOf.map((alternative) => alternative.label), ["Besok", "Tomorrow"]);
		assert.equal(taps[0].label, "Besok", "an older runner still gets the first spelling");
	});
});

test("a multi-tap step goes out as one command carrying `taps`", async () => {
	const tripleTap = { ...sf084, steps: [{ id: "st_1", do: "tap", el: "el_share", taps: 3 }] };
	const app = (command) => (command.kind === "tap" ? { found: true, hittable: true } : healthyApp(command));
	await withRunner(app, async ({ deps, runner }) => {
		const result = await replayMacroV2(tripleTap, deps);
		assert.ok(result.verdict.startsWith("PASS"));
		const taps = runner.seen.filter((command) => command.kind === "tap");
		assert.equal(taps.length, 1);
		assert.equal(taps[0].taps, 3);
	});
});

test("`unless` on a label-only element probes one anyOf waitForExists and skips when it matches", async () => {
	const guarded = { ...sf084, steps: [{ id: "st_1", do: "tap", el: "el_share", unless: "el_tomorrow" }] };
	const app = (command) => (command.kind === "waitForExists" && command.anyOf ? { exists: command.anyOf.some((alternative) => alternative.label === "Tomorrow") } : { found: true, hittable: true });
	await withRunner(app, async ({ deps, runner }) => {
		const result = await replayMacroV2(guarded, deps);
		assert.equal(result.results[0].skipped, true);
		assert.ok(!runner.seen.some((command) => command.kind === "getLabels"), "getLabels is unsafe on live web pages");
		assert.ok(!runner.seen.some((command) => command.kind === "tap"), "the guarded tap must not run");
	});
});

test("a frozen app: no answer → one restart, run again from the top → FAIL", async () => {
	let restarts = 0;
	const frozenAfterTap = (() => {
		let tapped = false;
		return (command) => {
			if (command.kind === "tapByLabel") tapped = true;
			if (tapped && command.kind === "assertExists") return undefined;
			return healthyApp(command);
		};
	})();
	await withRunner(frozenAfterTap, async ({ deps, opened }) => {
		const result = await replayMacroV2(sf084, { ...deps, restart: async () => { restarts++; return { ok: true }; } });
		assert.equal(result.verdict, "FAIL");
		assert.equal(restarts, 1);
		assert.equal(result.attempts, 2);
		assert.equal(opened.length, 2, "preconditions re-run on the second attempt");
		assert.match(result.reason, /frozen/);
	});
});

test("a failing assertion is FAIL at that step, without a restart", async () => {
	let restarts = 0;
	const missing = (command) => (command.kind === "assertExists" ? { pass: false } : healthyApp(command));
	await withRunner(missing, async ({ deps }) => {
		const result = await replayMacroV2(sf084, { ...deps, restart: async () => { restarts++; } });
		assert.equal(result.verdict, "FAIL");
		assert.equal(result.failedAt, 3);
		assert.equal(restarts, 0);
	});
});

test("unknown element is BLOCKED, not FAIL", async () => {
	const broken = { ...sf084, steps: [{ id: "st_1", do: "tap", el: "el_nope" }] };
	await withRunner(healthyApp, async ({ deps }) => {
		const result = await replayMacroV2(broken, deps);
		assert.equal(result.verdict, "BLOCKED");
		assert.match(result.reason, /not in the registry/);
	});
});

test("routines expand inline; cycles are refused", async () => {
	const routine = { schemaVersion: 2, id: "mc_open_fs", name: "Open Flash Sale", steps: sf084.steps.slice(0, 2) };
	const caller = { schemaVersion: 2, id: "mc_caller", name: "caller", steps: [{ id: "st_r", do: "run", macro: "mc_open_fs" }, ...sf084.steps.slice(2)] };
	await withRunner(healthyApp, async ({ deps }) => {
		const result = await replayMacroV2(caller, { ...deps, loadMacro: async (id) => (id === "mc_open_fs" ? routine : null) });
		assert.equal(result.verdict, "PASS");
		assert.equal(result.results[0].from, "mc_open_fs");
		const cyclic = { ...routine, steps: [{ id: "st_x", do: "run", macro: "mc_open_fs" }] };
		const blocked = await replayMacroV2(cyclic, { ...deps, loadMacro: async () => cyclic });
		assert.equal(blocked.verdict, "BLOCKED");
		assert.match(blocked.reason, /cycle/);
	});
});

test("an optional step that isn't there is skipped, not failed", async () => {
	const withSkip = { ...sf084, steps: [{ id: "st_0", do: "tap", el: "el_share", optional: true }, ...sf084.steps] };
	const noShare = (command) => (command.kind === "tap" ? { error: "no element 'FS_NavBarShareButton' after 10s" } : healthyApp(command));
	await withRunner(noShare, async ({ deps }) => {
		const result = await replayMacroV2(withSkip, deps);
		assert.equal(result.verdict, "PASS");
		assert.equal(result.results[0].skipped, true);
	});
});

test("`unless` skips a step when its element is already showing", async () => {
	const guarded = { ...sf084, steps: [{ id: "st_0", do: "tap", el: "el_tomorrow", unless: "el_share" }, sf084.steps[3]] };
	await withRunner(healthyApp, async ({ deps, runner }) => {
		const result = await replayMacroV2(guarded, deps);
		assert.equal(result.verdict, "PASS");
		assert.equal(result.results[0].skipped, true);
		assert.ok(!runner.seen.some((command) => command.kind === "tapByLabel"));
	});
});

test("steps sharing one `unless` look once while nothing acts on the app", async () => {
	const guarded = { ...sf084, steps: ["a", "b", "c"].map((id) => ({ id, do: "tap", el: "el_tomorrow", optional: true, unless: "el_share" })) };
	await withRunner(healthyApp, async ({ deps, runner }) => {
		const result = await replayMacroV2(guarded, deps);
		assert.ok(result.results.every((row) => row.skipped));
		assert.equal(runner.seen.filter((command) => command.kind === "waitForExists").length, 1);
	});
});

test("a repeat of an optional tap that found nothing is skipped without asking the runner", async () => {
	const nothingThere = (command) => (command.kind === "waitForExists" ? { exists: false } : { error: "no element" });
	const backTwice = { ...sf084, steps: ["a", "b", "c"].map((id) => ({ id, do: "tap", el: "el_share", optional: true, timeout: 1 })) };
	await withRunner(nothingThere, async ({ deps, runner }) => {
		const result = await replayMacroV2(backTwice, deps);
		assert.equal(result.verdict, "PASS (driver-level)");
		assert.equal(result.results[2].reason, "not there a moment ago");
		assert.equal(runner.seen.filter((command) => command.kind === "tap").length, 1);
	});
});

test("an optional tap whose fallback is covered keeps its own timeout instead of the 5 s commit", async () => {
	const registry = { elements: { el_back: { alias: "Back", locator: { chain: [{ identifier: "BackButton", type: "button" }], fallbacks: [{ label: "arrowLeft", match: "==", type: "button" }] } } } };
	const covered = (command) => (command.kind === "tapByLabel" ? { error: "'arrowLeft' exists but is not hittable" } : { error: "no element 'BackButton'" });
	const macro = { ...sf084, steps: [{ id: "a", do: "tap", el: "el_back", optional: true, timeout: 1 }] };
	await withRunner(covered, async ({ deps, runner }) => {
		const result = await replayMacroV2(macro, { ...deps, registry });
		assert.equal(result.results[0].skipped, true);
		assert.ok(runner.seen.every((command) => (command.timeout ?? 0) <= 1));
	});
});

test("cancel stops before the next step", async () => {
	await withRunner(healthyApp, async ({ deps }) => {
		let count = 0;
		const result = await replayMacroV2(sf084, { ...deps, onStep: () => count++, isCancelled: () => count >= 2 });
		assert.equal(result.verdict, "CANCELLED");
		assert.equal(result.cancelledAt, 2);
	});
});

test("map, anchor summary and storage round-trip", async () => {
	const rows = macroMap(sf084, registry);
	assert.equal(rows[2].quality, "label");
	assert.match(rows[2].text, /by text ⚠/);
	assert.deepEqual(anchorSummary(sf084, registry), { anchored: 2, targeted: 3 });
	assert.match(newId("el"), /^el_[0-9A-Z]{10}$/);

	const root = await mkdtemp(join(tmpdir(), "test-forge-macros-"));
	await saveRegistry(registry, root);
	assert.deepEqual((await loadRegistry(root)).elements.el_share, registry.elements.el_share);
	const { path } = await saveMacroV2(sf084, { module: "Engagement", submodule: "FlashSale", root });
	assert.equal(path, "Engagement/FlashSale/macros/sf-084.json");
	assert.equal(JSON.parse(await readFile(join(root, path), "utf8")).id, "mc_test");
	assert.equal((await listMacrosV2(root)).length, 1);
	assert.equal((await findMacroV2("SF-084", root)).id, "mc_test");
});

test("cleanup runs after a failure and doesn't change the verdict", async () => {
	const armed = [];
	const host = { sleep: async () => {}, mock: async (plan) => { armed.push(`${plan.endpoint}:${plan.enabled}`); if (plan.variant === "broken") throw new Error("no such variant"); } };
	const macro = {
		id: "mc_c", name: "c",
		steps: [
			{ id: "a", do: "mock", endpoint: "POST /gdn-oauth/token", variant: "500" },
			{ id: "b", do: "mock", endpoint: "POST /gdn-oauth/token", variant: "broken" },
			{ id: "c", do: "wait", seconds: 1 },
		],
		cleanup: [{ id: "z", do: "mock", endpoint: "POST /gdn-oauth/token", enabled: false }],
	};
	const result = await replayMacroV2(macro, { registry: { elements: {} }, send: async () => ({}), host });
	assert.equal(result.verdict, "FAIL");
	assert.equal(result.failedAt, 1);
	assert.deepEqual(armed, ["POST /gdn-oauth/token:true", "POST /gdn-oauth/token:true", "POST /gdn-oauth/token:false"]);
	assert.equal(result.results.at(-1).isCleanup, true);
	assert.equal(result.cleanupFailures, undefined);
});

test("retime moves every timestamp by one offset: earliest lands an hour before now", async () => {
	const { retimeBody } = await import("../lib/retime.js");
	const now = Date.UTC(2026, 9, 12, 2, 0, 0);
	const today = Date.UTC(2026, 9, 9, 0, 0, 0);
	const body = Buffer.from(JSON.stringify({ data: { schedules: [{ start: today, end: today + 36e6 }, { start: today + 90e6, end: today + 97e6, title: "x" }] }, code: 200 }));
	const { body: out, count } = retimeBody(body, now);
	const { data } = JSON.parse(out.toString("utf8"));
	assert.equal(count, 4);
	assert.equal(data.schedules[0].start, now - 3600e3);
	assert.equal(data.schedules[1].start - data.schedules[0].start, 90e6);
	assert.equal(data.schedules[1].title, "x");
	assert.equal(retimeBody(Buffer.from("not json"), now).count, 0);
});

test("relaunch ifNeeded: skipped while Home shows; forced once when an atLaunch mock changed", async () => {
	resetLaunchInputs();
	const openHome = { id: "mc_home", steps: [{ id: "r", do: "relaunch", ifNeeded: true, unless: "el_share" }, { id: "a", do: "assert", el: "el_share", exists: true, within: 1 }] };
	const app = (command) => (command.kind === "relaunchApp" ? { relaunched: true } : healthyApp(command));
	await withRunner(app, async ({ deps, runner }) => {
		const relaunches = () => runner.seen.filter((command) => command.kind === "relaunchApp").length;
		const mocked = { ...deps, host: { ...deps.host, mock: async () => ({ live: true }) } };
		assert.equal((await replayMacroV2(openHome, mocked)).results[0].skipped, true);
		assert.equal(relaunches(), 0);
		const armOn = { id: "m1", steps: [{ id: "m", do: "mock", endpoint: "GET /backend/configs", variant: "on", atLaunch: true }, { id: "h", do: "run", macro: "mc_home" }] };
		const withRoutine = { ...mocked, loadMacro: async () => openHome };
		assert.equal((await replayMacroV2(armOn, withRoutine)).verdict, "PASS");
		assert.equal(relaunches(), 1);
		// Same input again (e.g. the next case of a batch): the app already launched with it.
		await replayMacroV2(armOn, withRoutine);
		assert.equal(relaunches(), 1);
		// A case that sets no launch input doesn't relaunch for what an earlier case left armed.
		await replayMacroV2({ id: "m3", steps: [{ id: "m", do: "mock", endpoint: "GET /backend/configs", enabled: false, atLaunch: true }] }, withRoutine);
		await replayMacroV2(openHome, mocked);
		assert.equal(relaunches(), 1);
		// Turned off, then on again before any launch: back to what the app launched with — no relaunch.
		await replayMacroV2({ id: "m2", steps: [{ id: "m", do: "mock", endpoint: "GET /backend/configs", enabled: false, atLaunch: true }] }, withRoutine);
		await replayMacroV2(armOn, withRoutine);
		assert.equal(relaunches(), 1);
	});
	resetLaunchInputs();
});

test("one macro, N names: a reference in another module points by id; lint keeps ids unique", async () => {
	const root = await mkdtemp(join(tmpdir(), "test-forge-macros-"));
	await saveMacroV2({ ...sf084, links: { testCase: "SF-084" } }, { module: "Engagement", submodule: "FlashSale", root });
	const { path } = await saveMacroRef({ ref: "mc_test", name: "Home · Flash Sale tomorrow tab", links: { testCases: ["HM-012"] }, module: "Engagement", submodule: "Home", root });
	assert.equal(path, "Engagement/Home/macros/home-flash-sale-tomorrow-tab.ref.json");
	const [macro] = await listMacrosV2(root);
	assert.equal((await listMacrosV2(root)).length, 1, "a reference is not a second macro");
	assert.deepEqual(caseLinks(macro), ["SF-084", "HM-012"]);
	assert.equal((await findMacroV2("Home · Flash Sale tomorrow tab", root)).id, "mc_test");
	assert.deepEqual((await lintMacros(root)).errors, []);
	await assert.rejects(saveMacroRef({ ref: "mc_nope", module: "Engagement", root }), /no macro mc_nope/);
	// A copy under another name with the same id, and a copy with the same steps under a new id.
	await saveMacroV2({ ...sf084, name: "SF-084 copy" }, { module: "Engagement", submodule: "Home", root });
	await saveMacroV2({ ...sf084, id: "mc_other", name: "SF-084 twin" }, { module: "Engagement", submodule: "Home", root });
	const lint = await lintMacros(root);
	assert.match(lint.errors.join("\n"), /mc_test is defined 2 times/);
	assert.match(lint.warnings.join("\n"), /same steps/);
});

test("a screenshot the runner doesn't answer is taken by the host — no harness restart", async () => {
	const silentOnScreenshot = (command) => (command.kind === "screenshot" ? undefined : healthyApp(command));
	await withRunner(silentOnScreenshot, async ({ deps }) => {
		let restarts = 0;
		const result = await replayMacroV2({ id: "m", steps: [{ id: "s", do: "screenshot", name: "end" }, sf084.steps[3]] }, {
			...deps, restart: async () => restarts++, host: { ...deps.host, screenshot: async (name) => `/media/${name}.png` },
		});
		assert.equal(result.verdict, "PASS");
		assert.deepEqual([result.results[0].via, result.results[0].path, restarts], ["simctl", "/media/end.png", 0]);
	});
});

test("D-071: a label-only element can be checked for presence by its label", async () => {
	const { planStep } = await import("../lib/macro-v2.js");
	const registry = { elements: { el_title: { alias: "Sub-FS card title", locator: { fallbacks: [{ label: "QA Sub Flash Sale A", match: "==", type: "staticText" }] } } } };
	const shown = planStep({ do: "assert", el: "el_title", within: 5 }, registry);
	assert.deepEqual(shown.attempts[0].command, { kind: "waitForExists", anyOf: [{ label: "QA Sub Flash Sale A", labelMatch: "exact" }], elementType: "staticText", timeout: 5 });
	assert.equal(shown.attempts[0].check({ exists: true }).ok, true);
	assert.equal(shown.attempts[0].check({ exists: false }).ok, false);
	assert.equal(shown.isAssertion, true);
	const gone = planStep({ do: "assert", el: "el_title", exists: false, within: 5 }, registry);
	assert.equal(gone.attempts[0].command.kind, "waitForNotExists");
	// Its own label is the locator; reading any other text off it still needs an identifier.
	assert.equal(planStep({ do: "assert", el: "el_title", label: "QA Sub Flash Sale A" }, registry).attempts[0].command.kind, "waitForExists");
	assert.match(planStep({ do: "assert", el: "el_title", label: "Other" }, registry).error, /needs an identifier/);
});

test("D-079: assertRequested passes only when the app asked for the endpoint during this run", async () => {
	const macro = { steps: [{ id: "s1", do: "assertRequested", endpoint: "GET /backend/content-api/special-placement", within: 1 }] };
	const asked = [];
	const deps = (seen) => ({
		registry: { elements: {} },
		send: async () => {
			throw new Error("a request check never reaches the runner");
		},
		host: { requested: async (endpoint, options) => {
			asked.push({ endpoint, ...options });
			return seen;
		} },
	});
	const passed = await replayMacroV2(macro, deps({ recordedAt: "2026-10-13T12:00:00Z" }));
	assert.equal(passed.verdict, "PASS", "a request check is an assertion, not a driver-level pass");
	assert.equal(asked[0].endpoint, "GET /backend/content-api/special-placement");
	assert.equal(asked[0].withinS, 1);
	assert.ok(asked[0].sinceMs <= Date.now());
	const failed = await replayMacroV2(macro, deps(null));
	assert.equal(failed.verdict, "FAIL");
	assert.match(failed.reason, /was not requested during this run/);
	const noTrace = await replayMacroV2(macro, { ...deps(null), host: {} });
	assert.match(noTrace.reason, /NetworkLens trace/);
});
