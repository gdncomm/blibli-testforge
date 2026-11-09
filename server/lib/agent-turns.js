// Driver first, Claude only on an issue (D-064). What a batch asks Claude when a replay fails
// (triage: app bug, broken macro, or environment — and repair the macro when it is the macro) and
// when a case Claude ran passes (save it as a macro the driver replays from then on). Also how the
// dashboard tells which macro files Claude changed, so a repair or a learned macro is visible in
// the results and an unproven one can be taken back.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIPPED_DIRS = new Set(["node_modules", ".git", "DerivedData", "build"]);
const SCHEMA_DOC = "tools/test-forge-server/docs/feasibility-macros.md §4.1–4.2";

/** Content hash of every macro, reference, registry and mock-pack file under the UI-test root. */
export async function snapshotMacroFiles(root) {
	const files = new Map();
	async function walk(dir) {
		for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
			if (SKIPPED_DIRS.has(entry.name)) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.name.endsWith(".json") && (/\/macros\//.test(path) || /\/TestForgeMacros\//.test(path))) {
				files.set(relative(root, path), createHash("sha1").update(await readFile(path)).digest("hex"));
			}
		}
	}
	await walk(root);
	return files;
}

/** Files added, changed or removed between two snapshots. */
export function changedFiles(before, after) {
	const changed = [];
	for (const [path, hash] of after) if (before.get(path) !== hash) changed.push({ path, change: before.has(path) ? "changed" : "added" });
	for (const path of before.keys()) if (!after.has(path)) changed.push({ path, change: "removed" });
	return changed;
}

const TRIAGE_LINE = /TRIAGE:\s*(APP_BUG|MACRO_BROKEN|ENVIRONMENT)\s*[—–-]?\s*(.*)/i;
const MACRO_LINE = /MACRO:\s*(mc_[0-9A-Z]{10})/;

/** Claude's last `TRIAGE:` line → {kind, summary}; unknown when it didn't give one. */
export function parseTriage(text) {
	const matches = [...String(text ?? "").matchAll(new RegExp(TRIAGE_LINE, "gi"))];
	const last = matches.at(-1);
	if (!last) return { kind: "UNKNOWN", summary: "Claude didn't classify the failure" };
	return { kind: last[1].toUpperCase(), summary: last[2].trim().replace(/[*`]+/g, "") };
}

export function parseLearnedMacroId(text) {
	return String(text ?? "").match(MACRO_LINE)?.[1] ?? null;
}

export function triagePrompt({ item, macro, root, log, screenshot }) {
	return [
		`A QA macro replay failed. Find out why — do not re-run the test. Only if the macro (not the app) is wrong, repair the macro.`,
		"",
		`Case: ${item.caseId}${item.scenario ? ` — ${item.scenario}` : ""}`,
		`Verdict: ${item.verdict}`,
		`Macro: “${macro.name}” (${macro.id}), file ${join(root, macro.path)}`,
		`Element registry: ${join(root, "TestForgeMacros", "elements.json")} — steps name elements by \`el_…\` id; fix a changed identifier or label there once and every macro gets it.`,
		`Macro format: ${SCHEMA_DOC}. Routines are other macros run by id (\`{"do":"run","macro":"mc_…"}\`) — fix the routine, not a copy.`,
		screenshot ? `What the simulator showed when it stopped: ${screenshot} (read it).` : "",
		"",
		"Replay log (last lines):",
		"```",
		log,
		"```",
		"",
		"How:",
		"1. Read the screenshot, the macro and the registry entries of the failing step. The app is still where the replay stopped: look with test_forge_dump_tree / test_forge_screenshot. Tap only to confirm a theory.",
		"2. Decide:",
		"   - APP_BUG — the app misbehaves (what the test exists to catch). Change nothing.",
		"   - MACRO_BROKEN — the app is fine but the macro or registry is stale: renamed identifier, changed label, a new sheet or screen in the way, timing. Make the smallest fix, only in",
		`     ${root}/**/macros/*.json and ${join(root, "TestForgeMacros", "elements.json")}. Keep every id. Never weaken or remove a check of the expected result to make it pass.`,
		"   - ENVIRONMENT — backend down, network, simulator or harness, account or login state. Change nothing.",
		"3. If you navigated, leave the app on Home.",
		"",
		"End your answer with exactly one line:",
		"TRIAGE: <APP_BUG|MACRO_BROKEN|ENVIRONMENT> — <one sentence why>",
	].filter((line) => line !== null).join("\n");
}

export function learnPrompt({ item, root, routines, example }) {
	return [
		`${item.caseId} passed. Save what you just did as a macro, so the next run is replayed by the driver with no Claude:`,
		"",
		`- Write one v2 macro to ${root}/<Module>/<Submodule>/macros/<slug>.json — Module/Submodule from the PR Label Taxonomy in CLAUDE.md (e.g. Engagement/FlashSale). Format: ${SCHEMA_DOC}; follow ${example} as an example.`,
		`- Set "links": {"testCases": ["${item.caseId}"]} and "requires" ({"environment": "prod"|"uatb", "session": "loggedIn"|"loggedOut", "startScreen": …}) to what the case needs — the START line you gave; the dashboard brings the app there before step 1.`,
		"  Only require what the case depends on: leave `session` out when the case works logged in or out (most screens do). A needless `session` makes the dashboard log in or out between cases.",
		"  `startScreen` is always set: \"anyScreen\" when the case opens its page with a deeplink (don't run Open Home then — the deeplink opens over any screen),",
		"  \"home\" when it starts on Home (start the steps with Open Home), \"freshLaunch\" when the macro relaunches the app itself.",
		"- Set \"covers\" to the repo-relative app folders whose code renders and drives this case (e.g. [\"BlibliMobile-iOS/BlibliMobile-iOS/CustomerExperience/Engagement/Promotions\"]), the narrowest that holds every screen the steps touch. A newer build that changes these marks the case's result stale.",
		"- Reuse routines by id instead of copying their steps. Routines:",
		...routines.map((routine) => `    ${routine.id}  ${routine.name}`),
		`- Reuse elements from ${join(root, "TestForgeMacros", "elements.json")}; add new ones there (identifier first; English and Bahasa label fallbacks when there is no identifier). New ids: \`mc_\` / \`el_\` / \`st_\` + 10 characters from 0-9A-Z (no I, L, O, U).`,
		"- If you mocked an API, arm it with `mock` steps and switch it back in `cleanup`.",
		"- Check the expected result with `assert` / `waitFor` steps, and end with a `screenshot` step.",
		"- Don't replay it — the dashboard replays it right after you finish, and keeps it only if that replay passes.",
		"",
		"End with exactly one line:",
		"MACRO: <mc_id> <path>",
	].join("\n");
}
