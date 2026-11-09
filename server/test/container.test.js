import { test } from "node:test";
import assert from "node:assert/strict";
import { isListedInLaunchctl } from "../lib/container.js";

const runner = "18879\t0\tUIKitApplication:com.blibli.mobile.BlibliMobile-XCUITest.xctrunner[0eaf][rb-legacy]";
const app = "20011\t0\tUIKitApplication:com.blibli.mobile[ab12][rb-legacy]";

test("a UI-test runner whose bundle id extends the app's is not the app (NetworkInterceptor test-forge-driver-1)", () => {
	assert.equal(isListedInLaunchctl(runner, "com.blibli.mobile"), false);
	assert.equal(isListedInLaunchctl(`${runner}\n${app}`, "com.blibli.mobile"), true);
	assert.equal(isListedInLaunchctl("1\t0\tUIKitApplication:com.blibli.mobilex[1]", "com.blibli.mobile"), false);
});
