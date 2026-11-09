// D-120: the simulator tests run on. By default the "TestForge · " clone (D-053); the person can pick any other one
// ("Use for tests"), saved in `.data/test-device.json`. Every simctl call names this device by UDID instead of
// `booted`, so other simulators (another repo's work) can stay booted while tests run.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

let choiceFile = null;
let resolvedUdid = null;

export function configureTestDevice({ file }) {
	choiceFile = file;
}

/** The UDID the person chose, or null when the "TestForge · " clone is used. */
export function chosenTestDeviceUdid() {
	if (!choiceFile) return null;
	try {
		return JSON.parse(readFileSync(choiceFile, "utf8")).udid ?? null;
	} catch {
		return null;
	}
}

/** Saves the choice; null goes back to the "TestForge · " clone. */
export function chooseTestDevice(udid) {
	if (!choiceFile) throw new Error("test device store not configured");
	if (!udid) {
		rmSync(choiceFile, { force: true });
		return;
	}
	mkdirSync(dirname(choiceFile), { recursive: true });
	writeFileSync(choiceFile, JSON.stringify({ udid, chosenAt: new Date().toISOString() }, null, 2));
}

/** Called whenever the test device is resolved; NetworkLens's own lookup reads `NETWORKLENS_UDID`. */
export function noteTestDevice(udid) {
	resolvedUdid = udid ?? null;
	if (resolvedUdid) process.env.NETWORKLENS_UDID = resolvedUdid;
}

/** The simctl device argument: the test device's UDID once known, else `booted` (the old single-device rule). */
export function deviceArg() {
	return resolvedUdid ?? "booted";
}
