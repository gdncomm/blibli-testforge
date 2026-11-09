// D-119: a replay finds its element on any screen size — placement is relative, scrolling is relative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placement, swipeToward, bringIntoView, viewportOf } from "../lib/viewport.js";
import { replayMacroV2 } from "../lib/macro-v2.js";

const tall = { width: 430, height: 932 };
const small = { width: 375, height: 667 };

test("placement is judged against fractions of the window, not points", () => {
	const frame = { x: 20, y: 700, width: 100, height: 44 };
	assert.equal(placement(frame, tall), "inView");
	assert.equal(placement(frame, small), "below");
	assert.equal(placement({ x: 20, y: -300, width: 100, height: 44 }, small), "above");
	assert.equal(placement({ x: 20, y: 30, width: 100, height: 20 }, tall), "above", "under the nav bar band");
	assert.equal(placement(null, tall), "unknown");
	assert.deepEqual([swipeToward("below"), swipeToward("above"), swipeToward("inView")], ["up", "down", null]);
	assert.deepEqual(viewportOf({ value: { screenPoints: "375x667" } }), small);
});

/** A page whose content moves by the runner's relative swipe: 55 % of the window per gesture. */
function fakeDevice(viewport, { elementY, pageHeight = 4000 }) {
	let offset = 0;
	const seen = [];
	const frame = () => ({ x: 20, y: elementY - offset, width: 120, height: 44 });
	const isInView = () => placement(frame(), viewport) === "inView";
	const send = async (command) => {
		seen.push(command.kind);
		switch (command.kind) {
			case "deviceInfo":
				return { screenPoints: `${viewport.width}x${viewport.height}` };
			case "dismissKeyboard":
				return { keyboardVisible: false };
			case "getFrame":
				return frame();
			case "swipe": {
				const step = viewport.height * 0.55;
				const next = offset + (command.direction === "up" ? step : -step);
				offset = Math.max(0, Math.min(pageHeight - viewport.height, next));
				return { isDone: true };
			}
			case "tap":
				return isInView() ? { found: true, hittable: true } : { error: "'Buy' exists and is laid out, but is not hittable after 10s" };
			default:
				return { error: `unexpected ${command.kind}` };
		}
	};
	return { send, seen, frame };
}

test("bringIntoView scrolls toward the element and stops when it is in view", async () => {
	const device = fakeDevice(small, { elementY: 1500 });
	const result = await bringIntoView({ identifier: "Buy" }, { send: device.send, viewport: small });
	assert.equal(result.inView, true);
	assert.ok(result.nudges >= 2);
	assert.equal(placement(device.frame(), small), "inView");
});

test("bringIntoView gives up when the frame stops moving (end of the page)", async () => {
	const device = fakeDevice(small, { elementY: 5000, pageHeight: 1200 });
	const result = await bringIntoView({ identifier: "Buy" }, { send: device.send, viewport: small });
	assert.equal(result.inView, false);
	assert.equal(result.where, "below");
});

const registry = { elements: { el_buy: { alias: "Buy button", quality: "identifier", locator: { chain: [{ identifier: "Buy" }] } } } };
const macro = { name: "tap buy", steps: [{ id: "buy", do: "tap", el: "el_buy" }] };

test("the same macro passes on a tall and a small phone; only the small one scrolls", async () => {
	for (const [viewport, shouldScroll] of [[tall, false], [small, true]]) {
		const device = fakeDevice(viewport, { elementY: 700 });
		const result = await replayMacroV2(macro, { registry, send: device.send, host: {} });
		assert.equal(result.verdict, "PASS (driver-level)", `${viewport.height}-pt screen`);
		assert.equal(device.seen.includes("swipe"), shouldScroll, `${viewport.height}-pt screen scrolling`);
		assert.equal(Boolean(result.results[0].nudges), shouldScroll);
	}
});

test("an anchored locator (container + child by type and position) goes to the runner as `within`, never as text", async () => {
	const { planStep } = await import("../lib/macro-v2.js");
	const anchored = {
		elements: {
			el_tomorrow: { alias: "Tomorrow schedule tab", quality: "identifier", locator: { chain: [{ identifier: "FS_Shared_TabRowContainer" }, { type: "button", index: 1 }] } },
			el_title: { alias: "Sub-FS card 2 title", quality: "identifier", locator: { chain: [{ identifier: "FS_SubFlashSaleCard_1" }, { identifier: "FS_Shared_SectionHeaderTitle" }] } },
		},
	};
	const tap = planStep({ do: "tap", el: "el_tomorrow" }, anchored);
	assert.deepEqual(tap.attempts[0].command, { kind: "tap", within: "FS_Shared_TabRowContainer", elementType: "button", index: 1 });
	const read = planStep({ do: "assert", el: "el_title", label: "QA Sub Flash Sale B" }, anchored);
	assert.deepEqual(read.attempts[0].command, { kind: "getLabel", identifier: "FS_Shared_SectionHeaderTitle", within: "FS_SubFlashSaleCard_1", timeout: 10 });
});

test("D-120: the chosen test device wins over the QA clone, and simctl calls name it", async () => {
	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { configureTestDevice, chooseTestDevice, deviceArg } = await import("../lib/test-device.js");
	const { findTestForgeSimulator } = await import("../lib/test-forge-simulator.js");
	configureTestDevice({ file: join(await mkdtemp(join(tmpdir(), "test-forge-device-")), "test-device.json") });
	const devices = [{ udid: "QA1", name: "TestForge · iPhone 12 Pro Max", state: "Booted" }, { udid: "P17", name: "iPhone 17 Pro Max", state: "Booted" }];
	assert.equal((await findTestForgeSimulator(devices)).udid, "QA1");
	assert.equal(deviceArg(), "QA1");
	chooseTestDevice("P17");
	assert.equal((await findTestForgeSimulator(devices)).udid, "P17");
	assert.equal(deviceArg(), "P17");
	chooseTestDevice(null);
	assert.equal((await findTestForgeSimulator(devices)).udid, "QA1");
});
