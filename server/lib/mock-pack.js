// Mock pack in the repo (D-064): the NetworkLens rules macros arm live inside the app's container, so
// a reinstalled app or another tester's simulator had none of them. Each rule a macro uses is kept as
// `<UITestRoot>/TestForgeMacros/mocks/<endpoint-slug>.networklens-pack.json` — the same format as
// `lens_export_pack`, so the overlay and `lens_import_pack` read it too — redacted, since it is
// committed. A macro's `mock` step imports its rule from here when the device doesn't have it.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redacted } from "./redact.js";
import { uiTestRoot } from "./macro-v2.js";

const PACK_SUFFIX = ".networklens-pack.json";

export const mocksDir = (root = uiTestRoot()) => join(root, "TestForgeMacros", "mocks");

export function packFileName(endpointKey) {
	const slug = String(endpointKey).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
	return `${slug || "rule"}${PACK_SUFFIX}`;
}

/** The pack's ISO date (the session file stores a different one; packs always carry ISO). */
const isoNow = () => new Date().toISOString();

/** Writes one pack per rule; returns the files written. Rules are redacted unless `redact` is false. */
export async function exportRules(rules, { root = uiTestRoot(), redact = true } = {}) {
	const dir = mocksDir(root);
	await mkdir(dir, { recursive: true });
	const written = [];
	for (const rule of rules) {
		const name = packFileName(rule.endpointKey);
		// Exported switched off: a pack never arms anything by itself; the macro picks the variant.
		const stored = { ...(redact ? redacted(rule) : rule), isEnabled: false };
		const pack = { formatVersion: 1, name: rule.endpointKey, notes: "Kept by the TestForge for the macros that arm this rule.", createdAt: isoNow(), mocks: [stored], scenarios: [] };
		const path = join(dir, name);
		const temporary = `${path}.tmp-${process.pid}`;
		await writeFile(temporary, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
		await rename(temporary, path);
		written.push(name);
	}
	return written;
}

/** Every rule kept in the repo, by endpoint key. */
export async function loadPackRules(root = uiTestRoot()) {
	const rules = new Map();
	const names = await readdir(mocksDir(root)).catch(() => []);
	for (const name of names.filter((entry) => entry.endsWith(PACK_SUFFIX))) {
		try {
			const pack = JSON.parse(await readFile(join(mocksDir(root), name), "utf8"));
			if ((pack.formatVersion ?? 1) > 1) continue;
			for (const rule of pack.mocks ?? []) rules.set(rule.endpointKey, { rule, file: name });
		} catch {
			// One unreadable pack must not hide the others.
		}
	}
	return rules;
}

/**
 * The rule a `mock` step needs: the device's own when it has the variant, else the repo's pack.
 * `imported` tells the caller the rule must be added to (or replaced on) the device.
 */
export function resolveRule(deviceRules, packRules, endpoint, variant) {
	const matches = (rule) => rule.endpointKey === endpoint;
	const loose = (rule) => rule.endpointKey.includes(endpoint);
	const hasVariant = (rule) => variant === undefined || rule.variants.some((entry) => entry.name === variant);
	const onDevice = deviceRules.find(matches) ?? deviceRules.find(loose);
	if (onDevice && hasVariant(onDevice)) return { rule: onDevice, imported: false };
	const packed = packRules.get(endpoint)?.rule ?? [...packRules.values()].map((entry) => entry.rule).find(loose);
	if (packed && hasVariant(packed)) {
		// Keep the device's rule id when replacing, so live edits and scenarios still line up.
		return { rule: structuredClone(onDevice ? { ...packed, id: onDevice.id } : packed), imported: true, replaces: Boolean(onDevice) };
	}
	return { rule: onDevice ?? null, imported: false, missingVariant: Boolean(onDevice) };
}
