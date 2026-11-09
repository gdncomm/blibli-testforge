import { test } from "node:test";
import assert from "node:assert/strict";
import { createStepFrames, frameOf } from "../lib/step-frames.js";
import { screenOf } from "../lib/device.js";
import { stepIdentifier } from "../lib/macro-v2.js";
import { Narrator } from "../lib/narration.js";

const registry = {
	elements: {
		el_back: { locator: { chain: [{ identifier: "CommonNavBar_BackButton", type: "button" }] } },
		el_text: { locator: { chain: [{ type: "staticText" }], fallbacks: [{ label: "Lihat Semua" }] } },
	},
};

test("R3d: a step's identifier comes from the registry; label-only and host steps have none", () => {
	assert.equal(stepIdentifier({ do: "tap", el: "el_back" }, registry), "CommonNavBar_BackButton");
	assert.equal(stepIdentifier({ do: "tap", el: "el_text" }, registry), null);
	assert.equal(stepIdentifier({ do: "wait", seconds: 1 }, registry), null);
});

test("R3d: frames are read only under a live lease, only for on-screen action steps", async () => {
	let clock = 1_000;
	const asked = [];
	const frames = createStepFrames({
		now: () => clock,
		fetchFrame: async (identifier, timeout) => {
			asked.push([identifier, timeout]);
			return { value: { x: 16, y: 57, width: 24, height: 24 } };
		},
	});
	assert.equal(await frames.frameFor({ do: "tap", identifier: "A" }), null, "no lease, no read");
	frames.lease(true);
	assert.deepEqual(await frames.frameFor({ do: "tap", identifier: "A" }), { x: 16, y: 57, width: 24, height: 24 });
	assert.equal(await frames.frameFor({ do: "waitFor", identifier: "A" }), null, "waiting steps are not delayed");
	assert.equal(await frames.frameFor({ do: "tap", identifier: null }), null);
	clock += 91_000;
	assert.equal(await frames.frameFor({ do: "tap", identifier: "A" }), null, "lease expired");
	frames.lease(true);
	frames.lease(false);
	assert.equal(await frames.frameFor({ do: "tap", identifier: "A" }), null, "lease released");
	assert.deepEqual(asked, [["A", 2]]);
});

test("R3d: runner answers that are errors or empty give no frame or screen", () => {
	assert.equal(frameOf({ error: "no element 'X' after 0.5s" }), null);
	assert.equal(frameOf({ value: { x: 0, y: 0, width: 0, height: 0 } }), null);
	assert.deepEqual(screenOf({ value: { deviceName: "TestForge · iPhone 12 Pro Max", udid: "U", screenPoints: "428x926" } }), { deviceName: "TestForge · iPhone 12 Pro Max", udid: "U", width: 428, height: 926 });
	assert.equal(screenOf({ error: "timeout" }), null);
});

test("R3d: the working step carries its target and, once read, its frame", () => {
	const narrator = new Narrator();
	narrator.begin("job", { caseId: "SF-011", title: "SF-011" });
	narrator.stepStarted("job", { index: 2, do: "tap", text: "Tap “Back”", identifier: "CommonNavBar_BackButton" });
	narrator.stepFrame("job", { index: 2, frame: { x: 16, y: 57, width: 24, height: 24 }, screen: { width: 428, height: 926 } });
	const [run] = narrator.view().runs;
	assert.equal(run.steps[0].target, "CommonNavBar_BackButton");
	assert.deepEqual(run.steps[0].frame, { x: 16, y: 57, width: 24, height: 24 });
	assert.deepEqual(run.screen, { width: 428, height: 926 });
});
