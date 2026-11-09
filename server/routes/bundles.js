// Run bundles (D-162): export a finished run as one file; import one, replay it with the driver only,
// and compare the replay's verdicts with the run that made the bundle.
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import { compareRuns } from "../lib/results.js";
import { BundleStore, withLaterResults, bundleAsRun, bundleFileName, bundleSummary, buildBundle, installBundle, inspectBundle, validateBundle } from "../lib/run-bundle.js";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

const expandHome = (path) => resolvePath(String(path).replace(/^~(?=\/|$)/, homedir()));

async function readBundleFile(path) {
	const full = expandHome(path);
	if (!full.endsWith(".json")) throw new Error("pick a .test-forge-bundle.json file");
	const info = await stat(full);
	if (info.size > MAX_BUNDLE_BYTES) throw new Error("that file is too big to be a bundle");
	return validateBundle(JSON.parse(await readFile(full, "utf8")));
}

/**
 * `deps`: `results` (ResultsStore), `testcases()` → {cases, title, source}, `acceptImported(bundle)` → {mode, added},
 * `currentCode()` → the prepared QA copy's manifest, `deviceRules()` → the device's mock rules,
 * `traceRecords()` → the NetworkLens trace, `armMock({endpoint, variant, enabled})`,
 * `launchReplay({items, bundleId})` → batch view, `guard(res, items)` → true when it already answered.
 * Returns the store, so a run's detail can show the verdicts of the bundle it replayed.
 */
export function registerBundleRoutes(app, { dataDir, deps }) {
	const store = new BundleStore(`${dataDir}/bundles`);
	const handle = (route) => async (req, res) => {
		try {
			await route(req, res);
		} catch (error) {
			if (/ENOENT|bad bundle id/.test(error.message)) return res.status(404).json({ error: "no such bundle or file" });
			res.status(error.status ?? 400).json({ error: error.message });
		}
	};

	/** `merge` (default on) takes each case's newest result from later runs of the same code. */
	async function makeBundle(runId, { thumbnails, merge = true }) {
		const found = deps.results.get(runId);
		if (!found) throw Object.assign(new Error("no such run"), { status: 404 });
		const run = merge ? withLaterResults(deps.results.runs, found) : found;
		if (["running", "paused"].includes(run.status)) throw new Error("the run is still going — export it when it ends");
		const doc = deps.testcases();
		const [deviceRules, traceRecords] = await Promise.all([deps.deviceRules().catch(() => []), deps.traceRecords().catch(() => [])]);
		return buildBundle({ run, cases: doc.cases ?? [], title: doc.title, source: doc.source, techDoc: run.techDocPath, deviceRules, traceRecords, thumbnails });
	}

	app.get("/api/results/:id/bundle", handle(async (req, res) => {
		const bundle = await makeBundle(req.params.id, { thumbnails: req.query.proof !== "0", merge: req.query.merge !== "0" });
		res.set({ "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${bundleFileName(bundle)}"` }).send(JSON.stringify(bundle));
	}));

	/** Writes the bundle where the Mac's save panel pointed. */
	app.post("/api/results/:id/bundle", handle(async (req, res) => {
		const target = req.body?.path;
		if (!target) return res.status(400).json({ error: "path is required" });
		const bundle = await makeBundle(req.params.id, { thumbnails: req.body?.proof !== false, merge: req.body?.merge !== false });
		const full = expandHome(target);
		const text = JSON.stringify(bundle);
		await writeFile(full, text);
		res.json({ ok: true, path: full, bytes: Buffer.byteLength(text), fileName: bundleFileName(bundle), cases: bundle.items.length, replayable: bundle.items.filter((item) => item.macroId).length, mergedFrom: bundle.run.mergedFrom, warnings: bundle.warnings });
	}));

	app.post("/api/bundles/inspect", handle(async (req, res) => {
		const bundle = req.body?.path ? await readBundleFile(req.body.path) : validateBundle(req.body?.bundle);
		res.json({ bundle: bundleSummary(bundle), plan: await inspectBundle(bundle, { currentCode: await deps.currentCode() }) });
	}));

	app.post("/api/bundles/import", handle(async (req, res) => {
		const bundle = req.body?.path ? await readBundleFile(req.body.path) : validateBundle(req.body?.bundle);
		const report = await installBundle(bundle, { overwrite: req.body?.overwrite === true });
		const previous = await store.get(bundle.id).catch(() => null);
		await store.save(bundle, { replayRunIds: previous?.replayRunIds ?? [] });
		const cases = bundle.cases.length ? deps.acceptImported(bundle) : null;
		res.json({ ok: true, cases, bundle: bundleSummary(await store.get(bundle.id)), plan: { ...report, code: (await inspectBundle(bundle, { currentCode: await deps.currentCode() })).code } });
	}));

	app.get("/api/bundles", handle(async (_req, res) => res.json({ bundles: (await store.list()).map(bundleSummary) })));

	app.get("/api/bundles/:id", handle(async (req, res) => {
		const bundle = await store.get(req.params.id);
		res.json({
			bundle: bundleSummary(bundle),
			items: bundle.items.map(({ proofJpeg, ...item }) => ({ ...item, hasProof: Boolean(proofJpeg) })),
			plan: await inspectBundle(bundle, { currentCode: await deps.currentCode() }),
			warnings: bundle.warnings ?? [],
		});
	}));

	app.get("/api/bundles/:id/proof/:caseId.jpg", handle(async (req, res) => {
		const bundle = await store.get(req.params.id);
		const item = bundle.items.find((entry) => String(entry.caseId) === req.params.caseId);
		if (!item?.proofJpeg) return res.status(404).end();
		res.set({ "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).send(Buffer.from(item.proofJpeg, "base64"));
	}));

	/** Replays the bundle's cases that have a macro — driver only: a failure is reported, never sent to Claude. */
	app.post("/api/bundles/:id/replay", handle(async (req, res) => {
		const bundle = await store.get(req.params.id);
		const wanted = Array.isArray(req.body?.caseIds) ? new Set(req.body.caseIds.map(String)) : null;
		const items = bundle.items
			.filter((item) => item.macroId && (!wanted || wanted.has(String(item.caseId))))
			.map((item) => ({ caseId: item.caseId, scenario: item.scenario, mode: "replay", macroId: item.macroId, macroName: item.macroName }));
		if (items.length === 0) return res.status(400).json({ error: "none of those cases has a macro to replay" });
		if (await deps.guard(res, items)) return;
		const view = await deps.launchReplay({ items, bundleId: bundle.id });
		await store.update(bundle.id, { replayRunIds: [view.batch?.id, ...(bundle.replayRunIds ?? [])].filter(Boolean).slice(0, 20) });
		res.json(view);
	}));

	/**
	 * Switches on the mock variants one case ran with, so a person can test it by hand without Claude.
	 * Rules come from the device or the repo's pack (import put them there).
	 */
	app.post("/api/bundles/:id/cases/:caseId/arm", handle(async (req, res) => {
		const bundle = await store.get(req.params.id);
		const item = bundle.items.find((entry) => String(entry.caseId) === req.params.caseId);
		if (!item) return res.status(404).json({ error: "no such case in the bundle" });
		const mocks = (item.mocksUsed ?? []).filter((entry) => entry.variant);
		if (mocks.length === 0) return res.status(400).json({ error: `case ${item.caseId} ran without a known mock variant` });
		const armed = [];
		for (const { endpoint, variant } of mocks) {
			const outcome = await deps.armMock({ endpoint, variant, enabled: true });
			armed.push({ endpoint, variant, live: outcome?.live !== false, note: outcome?.note });
		}
		res.json({ ok: true, caseId: item.caseId, armed, ...(mocks.length > 1 && { note: "the case switched variants during its run; the last one listed is what is on now" }) });
	}));

	/** The bundle's verdicts (base) against a replay (`?run=`, else its latest). */
	app.get("/api/bundles/:id/compare", handle(async (req, res) => {
		const bundle = await store.get(req.params.id);
		const runId = req.query.run ? String(req.query.run) : bundle.replayRunIds?.[0];
		const head = runId ? deps.results.get(runId) : null;
		if (!head) return res.status(404).json({ error: "this bundle hasn't been replayed yet" });
		res.json(compareRuns(bundleAsRun(bundle), head));
	}));

	return store;
}
