// Session export (D-173): every loaded case with its text, local edit, recording, latest verdict and run
// history, as one .zip (session.json + report.md from session-report.js), optionally with the proof media.
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { finalVerdict, isProbeShot } from "./results.js";
import { effectiveResult } from "./result-overrides.js";
import { sessionMarkdown } from "./session-report.js";

const run = promisify(execFile);

export const SESSION_FORMAT = "test-forge-session";
export const SESSION_VERSION = 1;

const CASE_FIELDS = ["id", "scenario", "precondition", "steps", "expected", "api", "evidence", "iosStatus"];

const slug = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const sessionFileName = (title, now = new Date()) => `${slug(title) || "test-forge-session"}-${now.toISOString().slice(0, 10)}.zip`;

const keysFor = (testCase, macro) => new Set([String(testCase.id).toUpperCase(), macro?.id && String(macro.id).toUpperCase()].filter(Boolean));
const matches = (keys, ...ids) => ids.some((id) => id && keys.has(String(id).toUpperCase()));
const timeOf = (text) => Date.parse(text ?? 0) || 0;

/** One run of the case, from the run history Tests' "Last run" reads (a replay records the macro id). */
function historyEntry(record) {
	return {
		at: record.recordedAt ?? null,
		verdict: record.verdict ?? null,
		ranAs: record.mode ?? null,
		durationMs: record.durationMs ?? null,
		costUsd: record.costUsd ?? null,
		model: record.model ?? null,
		macroId: record.macroId ?? null,
		branch: record.build?.branch ?? null,
		codeId: record.build?.codeId ?? null,
		hasLocalChanges: record.build?.hasLocalChanges ?? null,
		steps: (record.steps ?? []).map((step) => (typeof step === "string" ? step : { text: step.text, ok: step.ok, ms: step.ms ?? null, reason: step.reason ?? null })),
	};
}

/** The same case inside batch runs (Results): review, re-run, triage and proof live only there. */
function batchEntries(keys, runs) {
	const found = [];
	for (const owner of runs) {
		(owner.items ?? []).forEach((item, index) => {
			if (matches(keys, item.caseId, item.macroId) && item.verdict) found.push({ owner, item, index });
		});
	}
	return found.sort((first, second) => timeOf(second.item.endedAt ?? second.owner.createdAt) - timeOf(first.item.endedAt ?? first.owner.createdAt));
}

function batchResult({ owner, item, index }) {
	return {
		runId: owner.id,
		index,
		at: item.endedAt ?? item.startedAt ?? owner.createdAt ?? null,
		verdict: finalVerdict(item),
		reportedVerdict: item.verdict ?? null,
		ranAs: item.mode ?? null,
		triage: item.triage ?? null,
		review: item.review ?? null,
		rerun: item.rerun ?? null,
		mocksServed: item.evidence?.mocksServed ?? null,
		summary: item.evidence?.summary ?? null,
		simulator: owner.manifest?.simulator ?? null,
	};
}

function proofPaths(item, record) {
	const evidence = item?.evidence ?? {};
	const screenshots = [...(evidence.screenshots ?? []), ...(record?.screenshots ?? [])].filter((path) => !isProbeShot(path));
	const videos = [...(evidence.videos ?? []), item?.videoPath].filter(Boolean);
	return { screenshots: [...new Set(screenshots)], videos: [...new Set(videos)] };
}

/**
 * Pure: the session's data. `doc` is the loaded document (cases carry `localEdit`); `history` the run history
 * (newest first, what Tests shows); `runs` the batch results; `macros` the `/api/macros` list (with `testCases`);
 * `demos` from `listDemoRecordings`. The newest run's verdict counts, as in Tests, unless a reviewer overrode it.
 * Media paths stay absolute; `writeSessionExport` copies them and rewrites each to its place in the zip.
 */
export function buildSession({ doc, history = [], runs = [], macros = [], demos = [], code = null, now = new Date() }) {
	const macroFor = (caseId) => macros.find((macro) => (macro.testCases ?? []).map((id) => String(id).toUpperCase()).includes(String(caseId).toUpperCase())) ?? null;
	const cases = (doc?.cases ?? []).map((testCase) => {
		const macro = macroFor(testCase.id);
		const keys = keysFor(testCase, macro);
		const records = history.filter((record) => matches(keys, record.caseId, record.macroId)).sort((first, second) => timeOf(second.recordedAt) - timeOf(first.recordedAt));
		const batches = batchEntries(keys, runs);
		const newest = records[0] ?? null;
		const newestBatch = batches[0] ?? null;
		// A batch result at least as new as the newest run record is that same run, possibly reviewed since.
		const sameRun = newestBatch && (!newest || timeOf(newestBatch.item.endedAt ?? newestBatch.owner.createdAt) >= timeOf(newest.recordedAt) - 60_000);
		const latest = newest ? historyEntry(newest) : newestBatch ? { ...batchResult(newestBatch), steps: newestBatch.item.evidence?.steps ?? [] } : null;
		// Only a person's override changes the verdict Tests shows; the batch's own verdict stays in batchResults.
		if (latest && sameRun) {
			const review = newestBatch.item.review ?? null;
			Object.assign(latest, { review, summary: newestBatch.item.evidence?.summary ?? null });
			if (review?.action === "override") latest.verdict = review.verdict;
		}
		// D-180: a Tests-page override at least as new as the latest run wins, as in Tests.
		const resultOverrides = testCase.resultOverrides ?? [];
		const { current: override } = effectiveResult(resultOverrides, latest);
		const shown = override ? { ...(latest ?? { at: null, ranAs: null, durationMs: null, steps: [] }), verdict: override.verdict, resultOverride: override } : latest;
		const proof = proofPaths(sameRun || !newest ? newestBatch?.item : null, newest);
		const demoVideos = demos.filter((demo) => String(demo.caseId).toUpperCase() === String(testCase.id).toUpperCase())
			.flatMap((demo) => Object.entries(demo.videos ?? {}).filter(([, path]) => path).map(([language, path]) => ({ language, path, recordedAt: demo.recordedAt ?? null })));
		return {
			...Object.fromEntries(CASE_FIELDS.map((field) => [field, testCase[field] ?? null])),
			localEdit: testCase.localEdit ?? null,
			resultOverrides,
			recording: macro ? { id: macro.id, name: macro.name, path: macro.path ?? null, usesMocks: Boolean(macro.usesMocks), hasExplanations: Boolean(macro.hasDemoNotes) } : null,
			latest: shown,
			history: records.map(historyEntry),
			batchResults: batches.map(batchResult),
			media: {
				screenshots: proof.screenshots.map((path) => ({ path })),
				videos: proof.videos.map((path) => ({ path })),
				demoVideos,
			},
		};
	});
	const count = (predicate) => cases.filter(predicate).length;
	const runIds = new Set(cases.flatMap((entry) => entry.batchResults.map((result) => result.runId)));
	return {
		format: SESSION_FORMAT,
		formatVersion: SESSION_VERSION,
		exportedAt: now.toISOString(),
		document: { title: doc?.title ?? null, source: doc?.source ?? null },
		code,
		summary: {
			cases: cases.length,
			recorded: count((entry) => entry.recording),
			editedLocally: count((entry) => entry.localEdit),
			overridden: count((entry) => entry.latest?.resultOverride),
			passed: count((entry) => String(entry.latest?.verdict ?? "").startsWith("PASS")),
			failed: count((entry) => String(entry.latest?.verdict ?? "").startsWith("FAIL")),
			undecided: count((entry) => entry.latest && !/^(PASS|FAIL)/.test(String(entry.latest.verdict ?? ""))),
			notRun: count((entry) => !entry.latest),
		},
		runs: runs.filter((entry) => runIds.has(entry.id)).map((entry) => ({
			id: entry.id,
			status: entry.status,
			createdAt: entry.createdAt ?? null,
			endedAt: entry.endedAt ?? null,
			counts: entry.counts ?? null,
			branch: entry.manifest?.branch ?? null,
			codeId: entry.manifest?.codeId ?? null,
			simulator: entry.manifest?.simulator ?? null,
			environment: entry.manifest?.environment ?? null,
		})),
		cases,
	};
}

async function exists(path) {
	return stat(path).then((info) => info.isFile()).catch(() => false);
}

/**
 * Writes the zip at `target`. With `includeMedia`, each case's latest proof and demo videos are copied to
 * `media/<case>/` and given a `file` path inside the zip; missing files are listed in `missingMedia`.
 */
export async function writeSessionExport(session, { target, includeMedia = false }) {
	const stage = await mkdtemp(join(tmpdir(), "test-forge-session-"));
	const folderName = basename(target, extname(target));
	const root = join(stage, folderName);
	const missingMedia = [];
	let mediaFiles = 0;
	let mediaBytes = 0;
	try {
		await mkdir(root, { recursive: true });
		for (const entry of session.cases) {
			const all = [...entry.media.screenshots, ...entry.media.videos, ...entry.media.demoVideos];
			if (!includeMedia) {
				for (const file of all) file.file = null;
				continue;
			}
			const folder = join("media", slug(entry.id) || "case");
			const used = new Set();
			for (const file of all) {
				if (!(await exists(file.path))) {
					missingMedia.push(file.path);
					file.file = null;
					continue;
				}
				let name = file.language ? `demo-${file.language}${extname(file.path)}` : basename(file.path);
				while (used.has(name)) name = `${basename(name, extname(name))}-1${extname(name)}`;
				used.add(name);
				await mkdir(join(root, folder), { recursive: true });
				await copyFile(file.path, join(root, folder, name));
				file.file = `${folder}/${name}`;
				mediaFiles += 1;
				mediaBytes += (await stat(file.path)).size;
			}
		}
		session.includesMedia = includeMedia;
		await writeFile(join(root, "session.json"), JSON.stringify(session, null, 2));
		await writeFile(join(root, "report.md"), sessionMarkdown(session, { imagePath: (file) => file.file }));
		await rm(target, { force: true });
		await run("ditto", ["-c", "-k", "--keepParent", root, target], { timeout: 600_000 });
		const { size } = await stat(target);
		return { path: target, bytes: size, cases: session.cases.length, mediaFiles, mediaBytes, missingMedia };
	} finally {
		await rm(stage, { recursive: true, force: true });
	}
}

/** Demo folders under `<mediaRoot>/demos`, each with its case and the per-language MP4s. */
export async function listDemoRecordings(mediaRoot, languages) {
	if (!mediaRoot) return [];
	const dir = join(mediaRoot, "demos");
	const recordings = [];
	for (const name of await readdir(dir).catch(() => [])) {
		const folder = join(dir, name);
		const timeline = await readFile(join(folder, "timeline.json"), "utf8").then(JSON.parse).catch(() => null);
		if (!timeline) continue;
		const files = await readdir(folder).catch(() => []);
		recordings.push({
			folder,
			caseId: timeline.caseId,
			recordedAt: timeline.recordedAt ?? null,
			videos: Object.fromEntries(languages.map((lang) => [lang, files.includes(`demo-${lang}.mp4`) ? join(folder, `demo-${lang}.mp4`) : null])),
		});
	}
	return recordings;
}
