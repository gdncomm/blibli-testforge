// D-153: preconditions per test case, from `<UITestRoot>/TestForgeMacros/case-requirements.json` (shared in the repo). A rule
// matches case ids by regex; every matching rule's `requires` is merged, and a recording's own `requires` wins over
// them. Used by replays (with the recording's) and by Claude runs (which have no recording).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function requirementsFor(caseId, rules = []) {
	if (!caseId) return {};
	return rules.reduce((merged, rule) => {
		try {
			return new RegExp(rule.match).test(caseId) ? { ...merged, ...rule.requires } : merged;
		} catch {
			return merged;
		}
	}, {});
}

export async function loadCaseRules(uiTestRoot) {
	try {
		const file = JSON.parse(await readFile(join(uiTestRoot, "TestForgeMacros", "case-requirements.json"), "utf8"));
		return Array.isArray(file.rules) ? file.rules : [];
	} catch {
		return [];
	}
}
