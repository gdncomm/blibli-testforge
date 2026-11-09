import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedCases, diffCommands } from "../lib/verify-plan.js";

const promo = "BlibliMobile-iOS/BlibliMobile-iOS/CustomerExperience/Engagement/Promotions";
const macros = [
	{ id: "mc_1", name: "MT-004", path: "Engagement/Promo/macros/mt-004.json", links: { testCases: ["4", "5"] } },
	{ id: "mc_2", name: "Login", path: "Authentication/General/macros/login.json", links: { testCase: "L1" } },
	{ id: "mc_3", name: "Odd", path: "General/General/macros/odd.json", links: { testCase: "9" } },
];

test("D-196: a diff picks the cases whose recordings cover the changed app code", () => {
	const plan = affectedCases({ changed: [`${promo}/Tabs.swift`, "tools/test-forge-server/x.js", "BlibliMobile-iOS/BlibliMobile-iOS/Payment/P.swift"], macros, caseIds: ["4", "L1"] });
	assert.deepEqual(plan.cases, [{ caseId: "4", macroId: "mc_1", macroName: "MT-004", files: [`${promo}/Tabs.swift`] }]);
	assert.deepEqual(plan.uncoveredFiles, ["BlibliMobile-iOS/BlibliMobile-iOS/Payment/P.swift"]);
	assert.equal(plan.unknownCoverage, 1);
	assert.equal(plan.isSharedChange, false);
});

test("D-196: a dependency change picks every recorded case; diff commands per mode", () => {
	const plan = affectedCases({ changed: ["BlibliMobile-iOS/Podfile.lock"], macros });
	assert.deepEqual(plan.cases.map((entry) => entry.caseId), ["4", "5", "L1"]);
	assert.equal(plan.isSharedChange, true);
	assert.deepEqual(diffCommands({ range: "a..b" }), [["diff", "--name-only", "a..b"]]);
	assert.equal(diffCommands({ base: "develop" }).length, 3);
	assert.equal(diffCommands({ base: "develop", isIncludingLocal: false }).length, 1);
});
