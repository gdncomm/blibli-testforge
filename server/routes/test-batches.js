// Test Batch + proof folder endpoints (R4j, D-109). Starting, pausing, resuming or ending a batch, or changing the proof
// folder, is refused while a test runs, so a run never splits its proof across two folders. D-212: switching to another
// batch pauses the active one instead of ending it.
import { buildReport as buildRunReport } from "../lib/results.js";
import { batchProgress, compareBatches } from "../lib/test-batches.js";

const KIND_TITLES = { run: "Test runs", replay: "Test replays", "replay-v2": "Macro replays", "test-forge-run": "Claude test runs", claude: "Claude tasks", "claude-chat": "Claude chats", scan: "Scans" };

export function registerTestBatchRoutes(app, { testBatches, readiness, isTestInFlight, isRunQueueBusy = () => false, results, tasks }) {
	const refuseWhileTesting = (res) => {
		const busy = isTestInFlight();
		if (!busy) return false;
		res.status(409).json({ error: `“${busy.title}” is running — wait for it to finish.` });
		return true;
	};
	// D-212: a run of several cases (even one paused between cases) would land its later cases in the wrong batch.
	const refuseWhileRunQueued = (res) => {
		if (!isRunQueueBusy()) return false;
		res.status(409).json({ error: "A run of several cases is still going — let it finish or cancel it on Tests first." });
		return true;
	};
	/** Pauses the active batch unless it is `keepId`; returns what was paused. */
	const pauseActive = async (keepId = null) => {
		const active = testBatches.active;
		return active && active.id !== keepId ? testBatches.pause(active.id) : null;
	};
	const changed = () => readiness.invalidate();
	testBatches.on("change", changed);

	app.get("/api/test-batches", (_req, res) => res.json(testBatches.view()));

	app.post("/api/settings/proof-root", async (req, res) => {
		if (refuseWhileTesting(res)) return;
		try {
			res.json(await testBatches.setProofRoot(String(req.body?.path ?? "")));
		} catch (error) {
			res.status(400).json({ error: error.message });
		}
	});

	// D-212: `pauseActive: true` sets the active batch aside first, so a new priority doesn't end the old one.
	app.post("/api/test-batches", async (req, res) => {
		if (refuseWhileTesting(res)) return;
		const isSwitching = req.body?.pauseActive === true && testBatches.active;
		if (isSwitching && refuseWhileRunQueued(res)) return;
		try {
			const paused = isSwitching ? await pauseActive() : null;
			res.json({ batch: await testBatches.start(req.body?.name), paused });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	app.post("/api/test-batches/:id/end", async (req, res) => {
		if (refuseWhileTesting(res)) return;
		try {
			res.json({ batch: await testBatches.end(req.params.id, { buildReport: (batch) => batchReport(batch, { results, tasks, testBatches }) }) });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	// D-184: an ended batch becomes active again. D-212: a batch active at that moment is paused, not ended.
	app.post("/api/test-batches/:id/reopen", async (req, res) => {
		if (refuseWhileTesting(res) || refuseWhileRunQueued(res)) return;
		try {
			if (testBatches.get(req.params.id)?.status !== "ended") return res.json({ batch: await testBatches.reopen(req.params.id) });
			const paused = await pauseActive(req.params.id);
			res.json({ batch: await testBatches.reopen(req.params.id), paused });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	// D-212: set the active batch aside to work on something else.
	app.post("/api/test-batches/:id/pause", async (req, res) => {
		if (refuseWhileTesting(res) || refuseWhileRunQueued(res)) return;
		try {
			res.json({ batch: await testBatches.pause(req.params.id) });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	// D-212: pick a paused batch up again; the batch active at that moment is paused in its place.
	app.post("/api/test-batches/:id/resume", async (req, res) => {
		if (refuseWhileTesting(res) || refuseWhileRunQueued(res)) return;
		try {
			if (testBatches.get(req.params.id)?.status !== "paused") return res.json({ batch: await testBatches.resume(req.params.id) });
			const paused = await pauseActive(req.params.id);
			res.json({ batch: await testBatches.resume(req.params.id), paused });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	// F2 (D-189): off the list only — the proof folder and its report stay on disk.
	app.delete("/api/test-batches/:id", async (req, res) => {
		try {
			res.json(await testBatches.remove(req.params.id));
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	app.get("/api/test-batches/:id/report.md", async (req, res) => {
		const batch = testBatches.get(req.params.id);
		if (!batch) return res.status(404).json({ error: "no such Test Batch" });
		res.type("text/markdown").send(await batchReport(batch, { results, tasks, testBatches }));
	});
}

const CHANGE_WORDS = { regressed: "**regressed**", fixed: "fixed", same: "same", missing: "no result" };

/** D-201: a replay batch's case-by-case comparison with the batch it replayed. */
function comparisonLines(comparison, replayOf) {
	const lines = [
		`## Compared with “${comparison.sourceName}”`,
		"",
		`Replayed on ${replayOf.build}: ${comparison.regressed} regressed · ${comparison.fixed} fixed · ${comparison.same} same · ${comparison.missing} without a result`,
		"",
		"| Case | Scenario | Before | Now | Change |",
		"|---|---|---|---|---|",
	];
	for (const entry of comparison.cases) {
		lines.push(`| ${cell(entry.caseId)} | ${cell(entry.scenario ?? "—")} | ${entry.was ?? "—"} | ${entry.is ?? "—"} | ${CHANGE_WORDS[entry.change]} |`);
	}
	return lines;
}

function endedText(batch) {
	if (batch.endedAt) return `**Ended:** ${new Date(batch.endedAt).toLocaleString("en-GB")}`;
	return batch.status === "paused" ? `**Paused since:** ${new Date(batch.pausedAt).toLocaleString("en-GB")}` : "**Ended:** still active";
}

/** D-212: how often the batch was set aside for other work. */
function pausesText(batch) {
	const count = batch.pauses?.length ?? 0;
	return count ? ` · **Paused:** ${count} time(s)` : "";
}

/** D-189: per case, the latest result counts. */
function progressLine({ cases, passed, failed, undecided, running }) {
	if (!cases && !running) return "**Results:** none yet";
	return `**Results:** ${cases} case(s) — ${passed} passed · ${failed} failed · ${undecided} undecided${running ? ` · ${running} running` : ""}`;
}

/** One Markdown report for the batch: a summary of everything attached, then each test run's own report. */
export async function batchReport(batch, { results, tasks, testBatches = null }) {
	const lines = [
		`# Test Batch — ${batch.name}`,
		"",
		`**Started:** ${new Date(batch.startedAt).toLocaleString("en-GB")} · ${endedText(batch)}${pausesText(batch)}`,
		`**Proof folder:** \`${batch.folder}\``,
		progressLine(batchProgress(batch, { runCases: (runId) => results.get(runId)?.items ?? [] })),
		"",
		"## What this batch holds",
		"",
		"| When | Kind | What | Outcome |",
		"|---|---|---|---|",
	];
	for (const item of batch.items) {
		const task = item.kind === "run" ? null : tasks.get(item.refId);
		const run = item.kind === "run" ? results.get(item.refId) : null;
		const outcome = run ? run.status : task ? `${task.status}${task.verdict ? ` · ${task.verdict}` : ""}` : "—";
		lines.push(`| ${new Date(item.at).toLocaleTimeString("en-GB")} | ${KIND_TITLES[item.kind] ?? item.kind} | ${cell(item.title)} | ${cell(outcome)} |`);
	}
	if (!batch.items.length) lines.push("| — | — | nothing was run | — |");
	const source = batch.replayOf && testBatches?.get(batch.replayOf.id);
	if (source) lines.push("", ...comparisonLines(compareBatches(source, batch, { runCases: (runId) => results.get(runId)?.items ?? [] }), batch.replayOf));
	for (const item of batch.items.filter((entry) => entry.kind === "run")) {
		const run = results.get(item.refId);
		if (run) lines.push("", "---", "", buildRunReport(run).replace(/^(#+) /gm, "#$1 "));
	}
	return `${lines.join("\n")}\n`;
}

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
