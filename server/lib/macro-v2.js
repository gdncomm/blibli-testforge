// Macro schema v2 (feasibility-macros.md §4.1–4.2, D-040): steps reference elements by a generated
// id (`el_…`) held in one registry, so a renamed accessibility identifier is repaired once for every
// macro. Replay is deterministic — no Claude — and every step reports its own result.
//
// Storage (D-038): macros at `<UITestRoot>/<Module>/<Submodule>/macros/<slug>.json`, the registry at
// `<UITestRoot>/TestForgeMacros/elements.json`. Both are data files next to the UI tests, never target
// members. v1 macros (macro_cli.py) keep replaying through lib/macro.js.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readCredentialField } from "./credentials.js";
import { mailOtp } from "./mail-otp.js";
import { prompts } from "./prompts.js";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { bringIntoView, viewportOf } from "./viewport.js";
import { deviceArg } from "./test-device.js";
import { DEFAULT_BUNDLE_ID, deleteAppDefault, writeAppDefault } from "./app-defaults.js";

const run = promisify(execFile);
const MAX_ROUTINE_DEPTH = 5;
const DEFAULT_WAIT_S = 10;
/** Added to a step's own wait so a slow-but-alive runner is not mistaken for a frozen app. */
const ANSWER_GRACE_S = 20;
const SKIPPED_DIRS = new Set(["node_modules", ".git", "DerivedData", "build"]);

export function uiTestRoot() {
	return process.env.TEST_FORGE_UITEST_ROOT || `${process.env.TEST_FORGE_PROJECT_DIR || "."}/${process.env.TEST_FORGE_UITEST_TARGET || "BlibliMobile_XCUITest"}`;
}

/** Time-ordered, never derived from content, never reused: `el_` / `mc_` / `st_` + 10 base32 chars. */
export function newId(prefix) {
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	const time = Date.now().toString(32).toUpperCase().padStart(9, "0").slice(-6);
	const random = [...randomBytes(4)].map((byte) => alphabet[byte % 32]).join("");
	return `${prefix}_${time}${random}`;
}

// --- Storage ------------------------------------------------------------------

export function registryPath(root = uiTestRoot()) {
	return join(root, "TestForgeMacros", "elements.json");
}

export async function loadRegistry(root = uiTestRoot()) {
	try {
		const parsed = JSON.parse(await readFile(registryPath(root), "utf8"));
		return { schemaVersion: 1, elements: {}, ...parsed };
	} catch (error) {
		if (error.code === "ENOENT") return { schemaVersion: 1, elements: {} };
		throw new Error(`element registry unreadable: ${error.message}`);
	}
}

async function writeJsonAtomically(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.tmp-${process.pid}`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, path);
}

/** Rewrites a listed macro at its own path (D-195), dropping the listing-only `path` and `aliases`. */
export async function saveMacroInPlace(macro, root = uiTestRoot()) {
	const { path, aliases, ...stored } = macro;
	if (!path || path.startsWith("..") || path.startsWith("/")) throw new Error("macro has no path under the UI test root");
	await writeJsonAtomically(join(root, path), stored);
}

export const saveRegistry = (registry, root = uiTestRoot()) => writeJsonAtomically(registryPath(root), registry);

async function* macroFiles(directory) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) yield* macroFiles(join(directory, entry.name));
		else if (entry.isFile() && entry.name.endsWith(".json") && directory.endsWith("/macros")) yield join(directory, entry.name);
	}
}

/** Every v2 macro under the root, with its path. v1 files are skipped (macro_cli.py lists those). */
/**
 * One macro = one file, in the module that owns it, identified by its `mc_` id (D-064). Another
 * module reuses it through a reference file (`<slug>.ref.json`: `{ref, name, links}`) that points by
 * id, so renaming or moving the macro never breaks it. Each macro comes back with its `aliases`
 * (the references to it); references themselves are not listed as macros.
 */
export async function listMacrosV2(root = uiTestRoot()) {
	const { macros } = await scanMacros(root);
	return macros;
}

async function scanMacros(root) {
	const macros = [];
	const refs = [];
	const unreadable = [];
	for await (const path of macroFiles(root)) {
		try {
			const entry = { ...JSON.parse(await readFile(path, "utf8")), path: relative(root, path) };
			if (entry.schemaVersion !== 2) continue;
			(entry.ref ? refs : macros).push(entry);
		} catch (error) {
			// An unreadable file is not a macro; listing must not fail because of one bad file.
			unreadable.push({ path: relative(root, path), error: error.message });
		}
	}
	const byId = new Map(macros.map((macro) => [macro.id, macro]));
	for (const macro of macros) macro.aliases = [];
	for (const ref of refs) byId.get(ref.ref)?.aliases.push({ name: ref.name, path: ref.path, links: ref.links });
	return { macros, refs, unreadable };
}

/** Every test case a macro answers for: its own links plus its references'. Upper-case ids. */
export function caseLinks(macro) {
	const ids = [];
	for (const links of [macro.links, ...(macro.aliases ?? []).map((alias) => alias.links)]) {
		if (!links) continue;
		for (const id of [links.testCase, ...(links.testCases ?? [])]) if (id) ids.push(String(id).toUpperCase());
	}
	return [...new Set(ids)];
}

export async function findMacroV2(idOrName, root = uiTestRoot()) {
	const macros = await listMacrosV2(root);
	return macros.find((macro) => macro.id === idOrName)
		?? macros.find((macro) => macro.name === idOrName)
		?? macros.find((macro) => macro.aliases.some((alias) => alias.name === idOrName))
		?? null;
}

/** Writes a reference to an existing macro into another module's `macros/` folder. */
export async function saveMacroRef({ ref, name, links, module, submodule = "General", root = uiTestRoot() }) {
	if (!module) throw new Error("module is required to place a reference");
	const target = (await listMacrosV2(root)).find((macro) => macro.id === ref);
	if (!target) throw new Error(`no macro ${ref} to refer to`);
	const entry = { schemaVersion: 2, ref, name: name || target.name, ...(links ? { links } : {}) };
	const path = join(root, module, submodule, "macros", `${macroSlug(entry.name)}.ref.json`);
	await writeJsonAtomically(path, entry);
	return { ref: entry, path: relative(root, path) };
}

/**
 * Keeps "one instance per id" true: two files with one id and references to nothing are errors;
 * two macros with the same steps, or one test case linked to two macros, are warnings.
 */
export async function lintMacros(root = uiTestRoot()) {
	const { macros, refs, unreadable } = await scanMacros(root);
	const errors = unreadable.map(({ path, error }) => `${path}: unreadable (${error})`);
	const warnings = [];
	const paths = new Map();
	for (const macro of macros) paths.set(macro.id, [...(paths.get(macro.id) ?? []), macro.path]);
	for (const [id, list] of paths) if (list.length > 1) errors.push(`${id} is defined ${list.length} times (${list.join(", ")}) — keep one file and refer to it from the others`);
	for (const ref of refs) if (!paths.has(ref.ref)) errors.push(`${ref.path} refers to ${ref.ref}, which no macro has`);
	const bySteps = new Map();
	for (const macro of macros) {
		const key = JSON.stringify((macro.steps ?? []).map(({ id, note, ...rest }) => rest));
		bySteps.set(key, [...(bySteps.get(key) ?? []), macro]);
	}
	for (const same of bySteps.values()) {
		if (same.length > 1) warnings.push(`same steps in ${same.map((macro) => `“${macro.name}” (${macro.path})`).join(" and ")} — keep one and make the others references`);
	}
	const owners = new Map();
	for (const macro of macros) for (const caseId of caseLinks(macro)) owners.set(caseId, [...(owners.get(caseId) ?? []), macro.name]);
	for (const [caseId, names] of owners) if (names.length > 1) warnings.push(`${caseId} is linked to ${names.length} macros (${names.join(", ")}) — a batch replays only the first`);
	return { errors, warnings, macros: macros.length, references: refs.length };
}

export function macroSlug(name) {
	return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "macro";
}

/** Writes `<root>/<module>/<submodule>/macros/<slug>.json`; module/submodule follow the PR label table. */
export async function saveMacroV2(macro, { module, submodule = "General", root = uiTestRoot() }) {
	if (!module) throw new Error("module is required to place a macro");
	const complete = { schemaVersion: 2, id: macro.id || newId("mc"), ...macro };
	const path = join(root, module, submodule, "macros", `${macroSlug(complete.name)}.json`);
	await writeJsonAtomically(path, complete);
	return { macro: complete, path: relative(root, path) };
}

// --- Resolution ----------------------------------------------------------------

/** How a registry entry will be targeted today: the chain's leaf identifier, else its label fallbacks. */
export function targetOf(element) {
	const chain = element?.locator?.chain ?? [];
	const leaf = chain.at(-1);
	const labels = element?.locator?.fallbacks?.filter((fallback) => fallback.label) ?? [];
	// D-119: a two-link chain is "the child inside this container" — the container by identifier, the child by its
	// own identifier or by type + position. Still identifier-anchored: no text, no coordinates.
	const within = chain.length > 1 ? chain.at(-2)?.identifier : undefined;
	if (leaf?.identifier || (within && leaf?.type)) {
		return { by: "identifier", identifier: leaf.identifier, within, elementType: leaf.type, index: leaf.index, labels };
	}
	if (labels.length) return { by: "label", labels };
	return null;
}

/** The accessibility identifier a step acts on, or null (host steps, label-only elements). */
export function stepIdentifier(step, registry) {
	if (!step?.el) return null;
	const target = targetOf(registry?.elements?.[step.el]);
	return target?.by === "identifier" ? target.identifier ?? target.within : null;
}

function elementName(element, id) {
	return element?.alias || id;
}

/** Plain-words step text for the map and the run view ("Tap “Tomorrow” tab (by text ⚠)"). */
export function describeStep(step, registry) {
	const element = step.el ? registry.elements[step.el] : null;
	const target = targetOf(element);
	const name = step.el ? `“${elementName(element, step.el)}”` : "";
	const quality = target?.by === "label" ? " (by text ⚠)" : "";
	switch (step.do) {
		case "openDeeplink": return `Open ${step.url}`;
		case "relaunch": return step.ifNeeded ? "Relaunch the app if needed" : "Relaunch the app";
		case "setAppDefault": return `Set app setting ${step.key} = ${step.value}`;
		case "mock": return step.enabled === false ? `Mock off: ${step.endpoint}` : `Mock ${step.endpoint} → “${step.variant}”${step.retime ? " (times moved to now)" : ""}`;
		case "tap": return `${Number(step.taps) > 1 ? `Tap ${step.taps}× on` : "Tap"} ${name}${quality}${step.force ? " (forced — lands on whatever covers it)" : ""}${step.optional ? " (if shown)" : ""}`;
		case "type": return `Type “${step.text}” into ${name}${quality}`;
		case "waitFor": return `Wait for ${name} (up to ${step.timeout ?? DEFAULT_WAIT_S} s)${quality}${step.optional ? " (if shown)" : ""}`;
		case "waitForGone": return `Wait for ${name} to disappear${quality}`;
		case "assert":
			if (step.label !== undefined) return `Check ${name} reads “${step.label}”${quality}`;
			return `Check ${name} ${step.exists === false ? "is gone" : "appears"} within ${step.within ?? DEFAULT_WAIT_S} s${quality}`;
		case "scrollTo": return `Scroll to ${name}${quality}`;
		case "swipe": return `Swipe ${step.direction}`;
		case "scrollToTop": return `Scroll back to the top (until ${name} shows)`;
		case "alertTap": return `Tap “${step.button}” on the alert${step.optional ? " (if shown)" : ""}`;
		case "screenshot": return `Screenshot “${step.name}”`;
		case "wait": return `Wait ${step.seconds} s`;
		case "assertRequested": return `Check the app requested ${step.endpoint}`;
		case "clearAppDefault": return `Reset app setting “${step.key}” (app closed first)`;
		case "run": return `Run routine ${step.macro}`;
		case "manual": return `Ask a person: ${step.say}`;
		// The value is never part of the text — this line lands in run output and history.
		case "typeSecret": return `Type ‹${step.credential ? `${step.credential} ` : ""}${step.field}› into ${step.el ? `${name}${quality}` : "the focused field"}`;
		default: return `Unknown step “${step.do}”`;
	}
}

/** The macro as the review map shows it: one row per step with its element and quality. */
export function macroMap(macro, registry) {
	return macro.steps.map((step) => {
		const element = step.el ? registry.elements[step.el] ?? null : null;
		return {
			id: step.id,
			do: step.do,
			text: describeStep(step, registry),
			el: step.el ?? null,
			screen: element?.screen ?? null,
			quality: step.el ? (targetOf(element)?.by ?? "missing") : null,
		};
	});
}

/** "9/10 steps anchored on IDs" — only steps that target an element count. */
export function anchorSummary(macro, registry) {
	const targeted = macroMap(macro, registry).filter((row) => row.el);
	return { anchored: targeted.filter((row) => row.quality === "identifier").length, targeted: targeted.length };
}

// --- Step → action -------------------------------------------------------------

const passed = () => ({ ok: true });
const failed = (reason) => ({ ok: false, reason });

function checkGesture(outcome) {
	if (outcome?.found === false) return failed("element not found");
	// A forced tap lands on the element's coordinate whatever covers it — that is its purpose.
	if (outcome?.hittable === false && !outcome?.forced) return failed("element exists but can't be tapped (covered or off screen)");
	return passed();
}

function identifierCommand(kind, target, extra = {}) {
	const command = { kind, ...(target.identifier && { identifier: target.identifier }), ...(target.within && { within: target.within }), ...extra };
	if (target.elementType) command.elementType = target.elementType;
	if (Number.isInteger(target.index)) command.index = target.index;
	return command;
}

/**
 * The runner commands one step needs, in the order to try them (label fallbacks follow the
 * identifier), plus how to judge each outcome. Host-side steps return `host` instead.
 */
export function planStep(step, registry) {
	if (step.do === "openDeeplink") return { host: { action: "openUrl", url: step.url } };
	if (step.do === "wait") return { host: { action: "sleep", seconds: Number(step.seconds) || 1 } };
	// D-079: proves a screen state came from the faked answer — the app really asked for it during this run.
	if (step.do === "assertRequested") return { host: { action: "requested", endpoint: step.endpoint, withinS: Number(step.within ?? DEFAULT_WAIT_S) } };
	// Arms a NetworkLens rule variant live (D-049): the macro sets up its own network precondition.
	if (step.do === "mock") return { host: { action: "mock", endpoint: step.endpoint, variant: step.variant, enabled: step.enabled !== false, retime: Boolean(step.retime) } };
	if (step.do === "setAppDefault") return { host: { action: "setDefault", bundleId: step.bundleId, key: step.key, value: Boolean(step.value) } };
	if (step.do === "clearAppDefault") return { host: { action: "clearDefault", bundleId: step.bundleId, key: step.key } };
	if (step.do === "manual") return { human: { title: step.title ?? "Your turn on the simulator", text: step.say } };
	// No element: type into whatever already has focus (e.g. unlabeled OTP boxes that auto-focus).
	if (step.do === "typeSecret" && !step.el) {
		return { attempts: [], waitS: DEFAULT_WAIT_S, secret: { ref: step.credential, field: step.field, submit: Boolean(step.submit) } };
	}
	if (step.do === "relaunch") return { attempts: [{ command: { kind: "relaunchApp" }, check: passed }], waitS: 30 };
	if (step.do === "swipe") {
		return { attempts: [{ command: { kind: "swipe", direction: step.direction, scrollViewIdentifier: step.scrollView }, check: passed }], waitS: 5 };
	}
	if (step.do === "alertTap") {
		const check = (outcome) => (outcome?.found ? passed() : failed(`no alert button “${step.button}”`));
		const waitS = Number(step.timeout ?? DEFAULT_WAIT_S);
		// The runner (test-forge-driver-3+) also looks in SpringBoard, so system alerts are reachable.
		return { attempts: [{ command: { kind: "alertTap", buttonTitle: step.button, timeout: waitS }, check }], waitS };
	}
	if (step.do === "screenshot") {
		return { attempts: [{ command: { kind: "screenshot", label: step.name, caseId: step.caseId }, check: passed }], waitS: 10 };
	}

	const element = registry.elements[step.el];
	if (!element) return { error: `element ${step.el} is not in the registry` };
	const target = targetOf(element);
	if (!target) return { error: `element ${elementName(element, step.el)} has no identifier or label to find it by` };
	const needsIdentifier = (what) => failedPlan(`${what} needs an identifier; ${elementName(element, step.el)} only has a label`);
	const waitS = Number(step.within ?? step.timeout ?? DEFAULT_WAIT_S);

	switch (step.do) {
		// Swipes down until the top marker is on screen; none when it already is (D-064).
		case "scrollToTop": {
			if (target.by !== "identifier") return needsIdentifier("Scroll to top");
			const check = (outcome) => (outcome?.found ? passed() : failed(`${elementName(element, step.el)} didn't come back into view`));
			return { attempts: [{ command: identifierCommand("scrollToTop", target, { maxAttempts: Number(step.maxAttempts ?? 12) }), check }], waitS: 40 };
		}
		case "tap": {
			const attempts = [];
			const extra = step.timeout === undefined ? {} : { timeout: Number(step.timeout) };
			// One multi-tap gesture (test-forge-driver-4+), for `onTapGesture(count:)` handlers.
			if (Number(step.taps) > 1) extra.taps = Number(step.taps);
			// `force`: tap the element's coordinate even when something covers it — how a macro taps
			// "outside" a sheet (on the dimmed area over a known element). The runner records `forced`.
			if (step.force) extra.force = true;
			if (target.by === "identifier") attempts.push({ command: identifierCommand("tap", target, extra), check: checkGesture });
			const sameType = new Set(target.labels.map((fallback) => fallback.type ?? "any")).size === 1;
			if (target.labels.length > 1 && sameType) {
				// One OR-ed query, as a hand-written XCUITest would (`anyOf`, test-forge-driver-3+); `label`
				// keeps an older runner working on the first spelling.
				const [first] = target.labels;
				const anyOf = target.labels.map((fallback) => ({ label: fallback.label, labelMatch: runnerLabelMatch(fallback.match) }));
				const command = { kind: "tapByLabel", anyOf, label: first.label, labelMatch: runnerLabelMatch(first.match), elementType: first.type, ...extra };
				attempts.push({ command, check: checkGesture, viaLabel: true });
			} else {
				for (const fallback of target.labels) {
					const command = { kind: "tapByLabel", label: fallback.label, labelMatch: runnerLabelMatch(fallback.match), elementType: fallback.type, index: fallback.index, ...extra };
					attempts.push({ command, check: checkGesture, viaLabel: true });
				}
			}
			// Several locators: cycle them with short probes rather than spending the full wait on each
			// (a Bahasa-first fallback list cost ~11 s on an English device before trying "Tomorrow").
			return { attempts, waitS: Number(step.timeout ?? DEFAULT_WAIT_S), isRoundRobin: attempts.length > 1 };
		}
		case "type":
			if (target.by !== "identifier") return needsIdentifier("Typing");
			return { attempts: [{ command: identifierCommand("type", target, { text: step.text }), check: checkGesture }], waitS: DEFAULT_WAIT_S };
		case "typeSecret": {
			// The runner only focuses the field; the value goes in as host keystrokes, so it never
			// reaches the queue, the runner, or XCTest's activity log.
			const focus = [];
			if (target.by === "identifier") focus.push({ command: identifierCommand("tap", target), check: checkGesture });
			for (const fallback of target.labels) {
				focus.push({ command: { kind: "tapByLabel", label: fallback.label, labelMatch: runnerLabelMatch(fallback.match), elementType: fallback.type, force: step.force }, check: checkGesture, viaLabel: true });
			}
			return { attempts: focus, waitS: DEFAULT_WAIT_S, secret: { ref: step.credential, field: step.field, submit: Boolean(step.submit) } };
		}
		case "scrollTo":
			if (target.by !== "identifier") return needsIdentifier("Scrolling");
			return { attempts: [{ command: identifierCommand("scrollUntilExists", target), check: checkGesture }], waitS: 30 };
		case "waitFor":
		case "waitForGone": {
			const isGone = step.do === "waitForGone";
			const kind = isGone ? "waitForNotExists" : "waitForExists";
			// Label-only elements wait on one OR-ed predicate query (test-forge-driver-5+).
			const command = target.by === "identifier"
				? identifierCommand(kind, target, { timeout: waitS })
				: { kind, anyOf: target.labels.map((fallback) => ({ label: fallback.label, labelMatch: runnerLabelMatch(fallback.match) })), elementType: target.labels[0].type, timeout: waitS };
			const check = (outcome) => (outcome?.exists === !isGone ? passed() : failed(isGone ? `still there after ${waitS} s` : `didn't appear within ${waitS} s`));
			return { attempts: [{ command, check }], waitS };
		}
		case "assert": {
			if (target.by !== "identifier") {
				// A label-only element is found by its label, so checking it means checking it is (or
				// isn't) on screen — the same OR-ed label query `waitFor` uses (D-071). Reading a
				// different label off it needs an identifier.
				const isLocatorLabel = step.label === undefined || target.labels.some((fallback) => fallback.label === step.label);
				if (!isLocatorLabel) return needsIdentifier("Reading a label");
				const expected = step.exists !== false;
				const kind = expected ? "waitForExists" : "waitForNotExists";
				const anyOf = target.labels.map((fallback) => ({ label: fallback.label, labelMatch: runnerLabelMatch(fallback.match) }));
				const command = { kind, anyOf, elementType: target.labels[0].type, timeout: waitS };
				const check = (outcome) => (outcome?.exists === expected ? passed() : failed(expected ? `didn't appear within ${waitS} s` : `still there after ${waitS} s`));
				return { attempts: [{ command, check }], waitS, isAssertion: true };
			}
			if (step.label !== undefined) {
				const check = (outcome) => (outcome?.label === step.label ? passed() : failed(`reads “${outcome?.label}”, expected “${step.label}”`));
				return { attempts: [{ command: identifierCommand("getLabel", target, { timeout: waitS }), check }], waitS };
			}
			const expected = step.exists !== false;
			const command = identifierCommand("assertExists", target, { expected, timeout: waitS });
			const check = (outcome) => (outcome?.pass === true ? passed() : failed(expected ? `didn't appear within ${waitS} s` : `still there after ${waitS} s`));
			return { attempts: [{ command, check }], waitS, isAssertion: true };
		}
		default:
			return { error: `unknown step “${step.do}”` };
	}
}

/** The registry reads like a predicate (`==`, `CONTAINS`, `BEGINSWITH`); TestForgeDriverRunner's own names differ. */
function runnerLabelMatch(match) {
	const normalized = String(match ?? "==").toUpperCase();
	if (normalized === "CONTAINS") return "contains";
	if (normalized === "BEGINSWITH") return "beginsWith";
	return "exact";
}

function failedPlan(message) {
	return { error: message };
}

// --- Replay --------------------------------------------------------------------

async function openUrlOnSimulator(url) {
	await run("xcrun", ["simctl", "openurl", deviceArg(), url], { timeout: 20_000 });
}

/**
 * Deletes one key from the app's own settings on the test simulator — how a macro gets back to a first-launch state
 * (e.g. `tutorialDone`) without reinstalling. The app is terminated first, or it would write its in-memory value back.
 */
async function clearDefaultOnSimulator(bundleId = DEFAULT_BUNDLE_ID, key) {
	if (!/^[\w.-]+$/.test(String(key))) throw new Error("bad key");
	await run("xcrun", ["simctl", "terminate", deviceArg(), bundleId], { timeout: 20_000 }).catch(() => {});
	await new Promise((resolve) => setTimeout(resolve, 1000));
	await deleteAppDefault({ udid: deviceArg(), bundleId, key });
}

/**
 * Types into whatever has focus in the Simulator window, as host keystrokes. The script — value
 * included — goes to osascript on stdin, never on its command line. Needs the dashboard's terminal
 * to have Accessibility permission (System Settings → Privacy & Security → Accessibility).
 */
function keystrokeIntoSimulator(text, { submit = false } = {}) {
	const literal = `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	const script = [
		'tell application "Simulator" to activate',
		"delay 0.4",
		`tell application "System Events" to keystroke ${literal}`,
		...(submit ? ['tell application "System Events" to key code 36'] : []),
	].join("\n");
	return new Promise((resolve, reject) => {
		const child = spawn("osascript", ["-"], { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `osascript exited ${code}`))));
		child.stdin.end(script);
	});
}

// --- Launch-time inputs (D-064) -------------------------------------------------
// Some inputs only take effect when the app launches: app defaults, and mocks of endpoints the app
// reads once at start (a `mock` step marked `atLaunch`, e.g. the home config that gates a feature).
// The tracker remembers what is armed now and what the app last launched with. A `relaunch` step
// marked `ifNeeded` relaunches only when an input the current replay itself set differs from what the
// app launched with, so cases share one app session; what an earlier case left armed (its cleanup) is
// not this case's concern unless it sets that input too.
const launchInputs = { armed: new Map(), launchedWith: null };

export function noteLaunchInput(key, value) {
	launchInputs.armed.set(key, JSON.stringify(value ?? null));
}

/** Call after any relaunch (a step, the harness, a crash recovery): the app now runs with what is armed. */
export function noteAppLaunched() {
	launchInputs.launchedWith = new Map(launchInputs.armed);
}

/** `keys`: the inputs to consider (those the current replay set); all armed inputs when omitted. */
export function needsRelaunch(keys = [...launchInputs.armed.keys()]) {
	const launched = launchInputs.launchedWith;
	return keys.some((key) => launchInputs.armed.has(key) && launched?.get(key) !== launchInputs.armed.get(key));
}

/** What is armed now vs. what the app last launched with (shown in the dashboard; useful when a relaunch surprises). */
export function launchInputState() {
	return { armed: Object.fromEntries(launchInputs.armed), launchedWith: launchInputs.launchedWith && Object.fromEntries(launchInputs.launchedWith), needsRelaunch: needsRelaunch() };
}

export function resetLaunchInputs() {
	launchInputs.armed.clear();
	launchInputs.launchedWith = null;
}

export const defaultHost = {
	openUrl: openUrlOnSimulator,
	clearDefault: clearDefaultOnSimulator,
	// Takes effect on the next launch (e.g. NetworkLensEnabled, wiped by an environment switch).
	setDefault: (bundleId = DEFAULT_BUNDLE_ID, key, value) => writeAppDefault({ udid: deviceArg(), bundleId, key, type: "bool", value: value ? "YES" : "NO" }),
	sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
	keystroke: keystrokeIntoSimulator,
	secret: (ref, field) => readCredentialField(ref, field),
	otpFromEmail: (since) => mailOtp.fetchOtp({ since }),
	ask: (question) => prompts.ask(question),
};

/** A person's answer to a `manual` step: done → passed, "not shown" → skipped, stop/timeout → BLOCKED. */
function judgeHumanAnswer(answer) {
	if (answer.action === "done") return { ok: true, byPerson: true };
	if (answer.action === "skip") return { ok: true, skipped: true, reason: "a person said it wasn't shown" };
	return { ok: false, blocked: true, reason: answer.action === "timeout" ? "nobody answered the popup within 10 min" : "stopped by a person" };
}

/** A stored OTP, else the one mailed to the linked Outlook inbox (D-048), else null. */
async function otpFromEmail(host, startedAt) {
	try {
		return (await host.otpFromEmail?.(startedAt)) ?? null;
	} catch {
		return null;
	}
}

async function typeSecretValue(secret, host) {
	const startedAt = new Date();
	// No credential: nothing stored to read (e.g. an OTP after an AutoFill login) — email, then a person.
	let value = secret.ref ? await host.secret(secret.ref, secret.field) : null;
	let via = "keychain";
	if (value === null && secret.field === "otp") {
		value = await otpFromEmail(host, startedAt);
		via = "email";
	}
	if (value === null) {
		via = "person";
		const answer = await host.ask({ kind: "input", secret: true, title: `Enter the ${secret.field.toUpperCase()}`, text: `Type the ${secret.field}${secret.ref ? ` for ${secret.ref}` : ""} — it is typed into the simulator and never saved.` });
		if (answer.action !== "done" || !answer.value) return judgeHumanAnswer({ action: answer.action === "done" ? "stop" : answer.action });
		value = answer.value;
	}
	await host.keystroke(value, { submit: secret.submit });
	return { ok: true, via };
}

/** Expands `run` steps into the routine's own steps, guarding against cycles. */
export async function flattenSteps(macro, loadMacro, depth = 0, trail = [], routineName = undefined) {
	if (depth > MAX_ROUTINE_DEPTH) throw new Error(`routines nest deeper than ${MAX_ROUTINE_DEPTH}: ${trail.join(" → ")}`);
	const steps = [];
	for (const step of macro.steps ?? []) {
		if (step.do !== "run") {
			steps.push({ ...step, from: trail.length ? trail.join(" → ") : undefined, routineName });
			continue;
		}
		if (trail.includes(step.macro)) throw new Error(`routine cycle: ${[...trail, step.macro].join(" → ")}`);
		const routine = await loadMacro(step.macro);
		if (!routine) throw new Error(`routine ${step.macro} not found`);
		steps.push(...(await flattenSteps(routine, loadMacro, depth + 1, [...trail, step.macro], routineName ?? routine.name)));
	}
	return steps;
}

/** TestForgeDriverRunner answers `{id, value: {...}, at}` on success and `{id, error}` on failure. */
function unwrapOutcome(raw) {
	if (raw && typeof raw.value === "object" && raw.value !== null && raw.error === undefined) return raw.value;
	return raw;
}

const isNoAnswer = (outcome) => typeof outcome?.error === "string" && outcome.error.startsWith("timeout waiting for");

/**
 * The first of a guard's elements already on screen, or null — e.g. Home is up, so skip onboarding.
 * A guard (`unless` / `onlyIf`) names one element or several (any one showing counts, D-064). Label
 * elements of one type go out as a single OR-ed probe; anything else is probed one by one.
 */
async function showingElement(guard, registry, send, timeout = GUARD_PROBE_S) {
	const ids = Array.isArray(guard) ? guard : [guard];
	const targets = ids.map((id) => ({ id, target: targetOf(registry.elements[id]) }));
	const labelTypes = new Set(targets.map(({ target }) => (target?.by === "label" ? target.labels[0].type ?? "" : null)));
	if (ids.length > 1 && !labelTypes.has(null) && labelTypes.size === 1) {
		const anyOf = targets.flatMap(({ target }) => target.labels.map((fallback) => ({ label: fallback.label, labelMatch: runnerLabelMatch(fallback.match) })));
		const probe = unwrapOutcome(await send({ kind: "waitForExists", anyOf, elementType: targets[0].target.labels[0].type, timeout }, { timeoutMs: 25_000 }));
		return probe?.exists === true ? ids[0] : null;
	}
	for (const { id, target } of targets) if (await isShowing(target, send, timeout)) return id;
	return null;
}

async function isShowing(target, send, timeout) {
	if (target?.by === "identifier") {
		const probe = unwrapOutcome(await send(identifierCommand("waitForExists", target, { timeout }), { timeoutMs: 25_000 }));
		return probe?.exists === true;
	}
	if (target?.by !== "label") return false;
	// Label-only: one OR-ed `hasMatch` query (test-forge-driver-5+). Never `getLabels` — reading each
	// label off a live login web page raised an XCTest failure that ended the runner session.
	const [first] = target.labels;
	const anyOf = target.labels.map((fallback) => ({ label: fallback.label, labelMatch: runnerLabelMatch(fallback.match) }));
	const probe = unwrapOutcome(await send({ kind: "waitForExists", anyOf, elementType: first.type, timeout }, { timeoutMs: 25_000 }));
	return probe?.exists === true;
}

// A guard asks "is it already there?", so a short look is enough; a relaunch guard looks longer, since a
// false "not there" costs a needless relaunch.
const GUARD_PROBE_S = 1;
const RELAUNCH_GUARD_PROBE_S = 2;

/**
 * What one replay pass already learned about the screen, valid until a step acts on the app: a guard's answer
 * (Open Home's nine steps share one "is Home up?" look) and optional steps that found nothing (the 2nd and 3rd
 * Back taps after the 1st found no Back button).
 */
export function createScreenMemo() {
	const guards = new Map();
	const misses = new Set();
	return {
		guard: (guard) => guards.get(JSON.stringify(guard)),
		rememberGuard: (guard, showing) => guards.set(JSON.stringify(guard), showing),
		hasMissed: (key) => misses.has(key),
		rememberMiss: (key) => misses.add(key),
		forget() {
			guards.clear();
			misses.clear();
		},
	};
}

const missKey = (step) => (step.optional && step.el && !step.unless && !step.onlyIf ? `${step.do}:${JSON.stringify(step.el)}` : null);
const guardedMissKey = (step) => (step.optional && step.el ? `${step.do}:${JSON.stringify(step.el)}:${JSON.stringify(step.unless ?? null)}` : null);

const guardName = (guard, registry) => (Array.isArray(guard) ? guard : [guard]).map((id) => elementName(registry.elements[id], id)).join(" / ");

const ROUND_ROBIN_PROBE_S = 1;

/**
 * Tries every locator with a 1 s probe, round after round, until one lands or the step's wait runs out.
 * An optional step keeps its own wait even when a locator is found covered: "if shown" means don't linger.
 */
async function runRoundRobin(plan, send, { isOptional = false } = {}) {
	const deadline = Date.now() + plan.waitS * 1000;
	let last = null;
	do {
		for (const attempt of plan.attempts) {
			const command = { ...attempt.command, timeout: ROUND_ROBIN_PROBE_S };
			const outcome = unwrapOutcome(await send(command, { timeoutMs: (ROUND_ROBIN_PROBE_S + ANSWER_GRACE_S) * 1000 }));
			if (isNoAnswer(outcome)) {
				return { ok: false, noAnswer: true, outcome, reason: `no answer within ${ROUND_ROBIN_PROBE_S + ANSWER_GRACE_S} s — the app may be frozen` };
			}
			// Found but not tappable yet (still laying out): this is the locator — give it the rest of the wait.
			if (/exists but/i.test(String(outcome?.error ?? ""))) return commitTo(attempt, deadline, send, isOptional ? 0 : MIN_COMMIT_WAIT_S);
			const verdict = outcome?.error ? failed(outcome.error) : attempt.check(outcome);
			last = { ...verdict, outcome, resolvedBy: attempt.viaLabel ? "label" : "identifier", command };
			if (verdict.ok) return last;
		}
	} while (Date.now() < deadline);
	return last ?? { ok: false, reason: "nothing to try" };
}

const MIN_COMMIT_WAIT_S = 5;

async function commitTo(attempt, deadline, send, minWaitS) {
	const remainingS = Math.max(minWaitS, 1, Math.ceil((deadline - Date.now()) / 1000));
	const command = { ...attempt.command, timeout: remainingS };
	const outcome = unwrapOutcome(await send(command, { timeoutMs: (remainingS + ANSWER_GRACE_S) * 1000 }));
	if (isNoAnswer(outcome)) return { ok: false, noAnswer: true, outcome, reason: `no answer within ${remainingS + ANSWER_GRACE_S} s — the app may be frozen` };
	const verdict = outcome?.error ? failed(outcome.error) : attempt.check(outcome);
	return { ...verdict, outcome, resolvedBy: attempt.viaLabel ? "label" : "identifier", command };
}

async function runStep(step, registry, { send, host, ignoreLaunchInputs = false, touched = new Set(), runStartedAt = Date.now(), device = {}, memo = null }) {
	// A conditional relaunch: always when a launch-time input changed, otherwise only when its
	// `unless` element isn't showing (the app is not where the macro needs it). A probe that only
	// needs Home (preconditions) ignores launch inputs: the case's own steps decide on those.
	if (step.do === "relaunch" && step.ifNeeded) {
		const isNeeded = !ignoreLaunchInputs && needsRelaunch([...touched]);
		if (!isNeeded && !step.unless) return { ok: true, skipped: true, reason: "nothing the app reads at launch changed" };
		if (isNeeded) step = { ...step, unless: undefined };
	}
	if (step.unless) {
		const known = memo?.guard(step.unless);
		const showing = known !== undefined ? known : await showingElement(step.unless, registry, send, step.do === "relaunch" ? RELAUNCH_GUARD_PROBE_S : GUARD_PROBE_S);
		memo?.rememberGuard(step.unless, showing);
		if (showing) return { ok: true, skipped: true, guarded: true, reason: `${elementName(registry.elements[showing], showing)} already showing` };
	}
	const repeatKey = guardedMissKey(step) ?? missKey(step);
	if (repeatKey && memo?.hasMissed(repeatKey)) return { ok: false, skipped: true, guarded: true, reason: "not there a moment ago" };
	// The inverse guard: a recovery step that only runs while its element is still on screen.
	if (step.onlyIf && !(await showingElement(step.onlyIf, registry, send))) {
		return { ok: true, skipped: true, reason: `${guardName(step.onlyIf, registry)} not showing` };
	}
	const plan = planStep(step, registry);
	if (plan.error) return { ok: false, reason: plan.error, blocked: true };
	if (plan.human) {
		const answer = await host.ask({ kind: "manual", title: plan.human.title, text: plan.human.text });
		return judgeHumanAnswer(answer);
	}
	if (plan.host) {
		try {
			if (plan.host.action === "openUrl") await host.openUrl(plan.host.url);
			else if (plan.host.action === "clearDefault") {
				await host.clearDefault(plan.host.bundleId, plan.host.key);
				noteLaunchInput(`default:${plan.host.key}`, null);
				touched.add(`default:${plan.host.key}`);
			} else if (plan.host.action === "setDefault") {
				await host.setDefault(plan.host.bundleId, plan.host.key, plan.host.value);
				noteLaunchInput(`default:${plan.host.key}`, plan.host.value);
				touched.add(`default:${plan.host.key}`);
			} else if (plan.host.action === "requested") {
				if (!host.requested) throw new Error("request checks need the dashboard's NetworkLens trace");
				const seen = await host.requested(plan.host.endpoint, { sinceMs: runStartedAt, withinS: plan.host.withinS });
				if (!seen) return { ok: false, isAssertion: true, reason: `${plan.host.endpoint} was not requested during this run (checked ${plan.host.withinS} s)` };
				return { ok: true, isAssertion: true, requestedAt: seen.recordedAt ?? null };
			} else if (plan.host.action === "mock") {
				if (!host.mock) throw new Error("mock steps need the dashboard's NetworkLens connection");
				await host.mock(plan.host);
				if (step.atLaunch) {
					noteLaunchInput(`mock:${plan.host.endpoint}`, plan.host.enabled ? plan.host.variant : "off");
					touched.add(`mock:${plan.host.endpoint}`);
				}
			}
			else await host.sleep(plan.host.seconds);
			return { ok: true };
		} catch (error) {
			return { ok: false, reason: `host step failed: ${error.message}` };
		}
	}
	if (plan.secret && plan.attempts.length === 0) {
		try {
			return await typeSecretValue(plan.secret, host);
		} catch (error) {
			return { ok: false, blocked: true, reason: `couldn't type the ${plan.secret.field}: ${error.message}` };
		}
	}
	if (plan.isRoundRobin) return runRoundRobin(plan, send, { isOptional: Boolean(step.optional) });
	let last = null;
	for (const attempt of plan.attempts) {
		let outcome = unwrapOutcome(await send(attempt.command, { timeoutMs: (plan.waitS + ANSWER_GRACE_S) * 1000 }));
		// D-119: an element that exists but is off screen on this device (below the fold on a smaller phone, above
		// after earlier scrolling, under the keyboard) is scrolled into view by relative rules and tried once more.
		let nudged = null;
		if (isOffScreenMiss(attempt.command, outcome)) {
			nudged = await nudgeIntoView(attempt.command, { send, device });
			if (nudged.inView) outcome = unwrapOutcome(await send(attempt.command, { timeoutMs: (plan.waitS + ANSWER_GRACE_S) * 1000 }));
		}
		if (isNoAnswer(outcome)) {
			// A screenshot is evidence, not a check: when the runner doesn't answer, take it from the
			// host instead of restarting the harness and replaying the whole macro (D-064).
			if (step.do === "screenshot" && host.screenshot) {
				try {
					return { ok: true, via: "simctl", path: await host.screenshot(step.name) };
				} catch {
					// Fall through to the usual no-answer handling.
				}
			}
			return { ok: false, noAnswer: true, outcome, reason: `no answer within ${plan.waitS + ANSWER_GRACE_S} s — the app may be frozen` };
		}
		const verdict = outcome?.error ? failed(outcome.error) : attempt.check(outcome);
		last = { ...verdict, outcome, resolvedBy: attempt.viaLabel ? "label" : "identifier", command: attempt.command, ...(nudged && { nudges: nudged.nudges, scrolledFrom: nudged.where }) };
		if (verdict.ok && plan.secret) {
			try {
				return { ...last, ...(await typeSecretValue(plan.secret, host)) };
			} catch (error) {
				return { ...last, ok: false, blocked: true, reason: `couldn't type the ${plan.secret.field}: ${error.message}` };
			}
		}
		if (verdict.ok) {
			if (step.do === "relaunch") noteAppLaunched();
			return { ...last, isAssertion: Boolean(plan.isAssertion) };
		}
	}
	return last ?? { ok: false, reason: "nothing to try" };
}

const NUDGE_KINDS = new Set(["tap", "type", "scrollUntilExists"]);

/** True when an identifier step reached a real element that just wasn't hittable — the case scrolling can fix. */
function isOffScreenMiss(command, outcome) {
	if (!(command?.identifier || command?.within) || !NUDGE_KINDS.has(command.kind) || isNoAnswer(outcome)) return false;
	if (outcome?.forced) return false;
	return outcome?.hittable === false || /not hittable/i.test(String(outcome?.error ?? ""));
}

async function nudgeIntoView(command, { send, device }) {
	const ask = async (nudgeCommand) => unwrapOutcome(await send(nudgeCommand, { timeoutMs: 25_000 }));
	device.viewport ??= viewportOf(await ask({ kind: "deviceInfo" }).catch(() => null));
	const locator = { ...(command.identifier && { identifier: command.identifier }), ...(command.within && { within: command.within }), ...(command.elementType && { elementType: command.elementType }), ...(Number.isInteger(command.index) && { index: command.index }) };
	return bringIntoView(locator, { send: ask, viewport: device.viewport });
}

/**
 * Replays a v2 macro step by step. When a step gets no answer at all (runner session died, or the
 * app is frozen), the harness is restarted and the macro runs once more from the top — preconditions
 * included, so the app is back in a known state (feasibility G7). A second silence is the verdict.
 *
 * `send(command, {timeoutMs})` posts to the driver queue; `restart()` brings the harness back; both
 * are injected so tests can use a fake runner.
 */
export async function replayMacroV2(macro, { registry, send, restart, loadMacro, host = defaultHost, onStep, onStepStart, isCancelled = () => false, maxRuns = 2, ignoreLaunchInputs = false }) {
	const startedAt = Date.now();
	let steps;
	try {
		steps = await flattenSteps(macro, loadMacro ?? (async () => null));
	} catch (error) {
		return { ok: false, verdict: "BLOCKED", reason: error.message, results: [], attempts: 0, durationMs: 0 };
	}
	// `cleanup` runs after the steps whatever the verdict — a mock left armed (a failing auth call,
	// a forced config) would break every later run.
	const cleanupSteps = await flattenSteps({ steps: macro.cleanup ?? [] }, loadMacro ?? (async () => null)).catch(() => []);
	let results = [];
	const touched = new Set();
	// The device's window size, read once per replay the first time a step needs it (D-119).
	const device = {};
	const memo = createScreenMemo();
	for (let attempt = 1; attempt <= maxRuns; attempt++) {
		results = [];
		memo.forget();
		let stoppedOnNoAnswer = false;
		for (const [index, step] of steps.entries()) {
			if (isCancelled()) return finish("CANCELLED", { cancelledAt: index });
			await onStepStart?.({ index, id: step.id, do: step.do, text: describeStep(step, registry), attempt, identifier: stepIdentifier(step, registry), from: step.from, routineName: step.routineName });
			const stepStartedAt = Date.now();
			const result = await runStep(step, registry, { send, host, ignoreLaunchInputs, touched, runStartedAt: startedAt, device, memo });
			rememberOutcome(memo, step, result);
			const row = { index, id: step.id, do: step.do, text: describeStep(step, registry), from: step.from, attempt, ms: Date.now() - stepStartedAt, ...result };
			// An optional step (a first-launch screen, a system prompt) may legitimately not be there.
			if (!result.ok && step.optional && !result.noAnswer && !result.blocked) Object.assign(row, { ok: true, skipped: true });
			results.push(row);
			// Awaited: a demo replay pauses here so its subtitle can be read (D-164).
			await onStep?.(row);
			if (row.ok) continue;
			if (result.blocked) return finish("BLOCKED", { failedAt: index, reason: result.reason });
			if (result.noAnswer && attempt < maxRuns) {
				stoppedOnNoAnswer = true;
				break;
			}
			return finish("FAIL", { failedAt: index, reason: result.reason });
		}
		if (!stoppedOnNoAnswer) {
			const hasAssertion = results.some((row) => row.isAssertion);
			return finish(hasAssertion ? "PASS" : "PASS (driver-level)", {});
		}
		const restarted = await restart?.();
		if (restarted && restarted.ok === false) {
			return finish("BLOCKED", { failedAt: results.length - 1, reason: "the harness stopped answering and could not be restarted" });
		}
		onStep?.({ note: "no answer — harness restarted, running the macro again from the top", attempt });
	}
	return finish("FAIL", { reason: "no answer after a restart" });

	async function finish(verdict, extra) {
		const attempts = results.at(-1)?.attempt ?? 1;
		const cleanupFailures = [];
		for (const step of cleanupSteps) {
			await onStepStart?.({ index: results.length, id: step.id, do: step.do, text: describeStep(step, registry), attempt: attempts, isCleanup: true, identifier: stepIdentifier(step, registry) });
			const stepStartedAt = Date.now();
			const result = await runStep(step, registry, { send, host, ignoreLaunchInputs, touched, device });
			const row = { index: results.length, id: step.id, do: step.do, text: describeStep(step, registry), from: step.from, attempt: attempts, ms: Date.now() - stepStartedAt, isCleanup: true, ...result, isAssertion: false };
			if (!row.ok && step.optional) Object.assign(row, { ok: true, skipped: true });
			if (!row.ok) cleanupFailures.push(`${row.text}: ${row.reason}`);
			results.push(row);
			await onStep?.(row);
		}
		return {
			ok: verdict.startsWith("PASS"),
			verdict,
			results,
			attempts,
			durationMs: Date.now() - startedAt,
			...(cleanupFailures.length ? { cleanupFailures } : {}),
			...extra,
		};
	}
}

/** A step that changed nothing (skipped by a guard, or an optional element that wasn't there) keeps what the memo knows. */
function rememberOutcome(memo, step, result) {
	if (result.guarded) return;
	const repeatKey = guardedMissKey(step) ?? missKey(step);
	const isMiss = !result.ok && step.optional && !result.noAnswer && !result.blocked;
	if (isMiss && ["tap", "waitFor", "assert", "alertTap"].includes(step.do)) {
		if (repeatKey) memo.rememberMiss(repeatKey);
		return;
	}
	memo.forget();
}

/** True when the Xcode project references macro data — it must stay out of every target (D-038). */
export async function macroDataInProject(projectFile) {
	try {
		const text = await readFile(projectFile, "utf8");
		return /\/macros\/[^"]*\.json|TestForgeMacros/.test(text);
	} catch {
		return false;
	}
}
