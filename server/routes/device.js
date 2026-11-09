// Device rail: the booted simulator, who is driving it, and the TestForgeDriver queue. No screen mirror
// (D-033) — the Simulator window itself is the live view; "Show Simulator window" brings it forward.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bootedDevice, deviceScreen, noteDeviceInfo } from "../lib/device.js";

const run = promisify(execFile);

export function registerDeviceRoutes(app, { deviceLock, driverHost, stepFrames, postCommand, captureFrame }) {
	app.get("/api/device", async (_req, res) => {
		const [device, queue] = await Promise.all([bootedDevice(), driverHost.status()]);
		res.json({ device, lock: deviceLock.status(), queue });
	});

	/** Screen size in points (R3d): the last one the runner reported, else asked now if nobody drives the device. */
	app.get("/api/device/screen", async (_req, res) => {
		const known = deviceScreen();
		if (known) return res.json(known);
		if (!deviceLock.tryAcquire("device-screen", "Screen size")) return res.status(409).json({ error: `device busy — ${deviceLock.holder.label} is driving it` });
		try {
			const screen = noteDeviceInfo(await postCommand({ kind: "deviceInfo" }, { timeoutMs: 8_000, recover: false }));
			return screen ? res.json(screen) : res.status(503).json({ error: "the test runner didn't report a screen size — start the harness" });
		} finally {
			deviceLock.release("device-screen");
		}
	});

	/** One JPEG of the booted simulator (simctl, not the runner), for Measure. */
	app.get("/api/device/screenshot.jpg", async (_req, res) => {
		try {
			const { buffer } = await captureFrame();
			res.type("image/jpeg").set("cache-control", "no-store").send(buffer);
		} catch (error) {
			res.status(503).json({ error: `couldn't capture the simulator: ${error.message}` });
		}
	});

	/** Step outline lease (D-089): frames are read per replay step only while a Mac app renews this. */
	app.post("/api/overlay", (req, res) => {
		res.json(stepFrames.lease(Boolean(req.body?.on)));
	});

	app.post("/api/device/show", async (_req, res) => {
		try {
			await run("open", ["-a", "Simulator"], { timeout: 10_000 });
			res.json({ ok: true });
		} catch (error) {
			res.status(500).json({ error: `couldn't open Simulator: ${error.message}` });
		}
	});
}
