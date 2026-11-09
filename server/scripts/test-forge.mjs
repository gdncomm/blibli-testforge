#!/usr/bin/env node
// test-forge — the TestForge from a terminal or a Claude session (D-150: what a Remote Control session driven from the Claude
// mobile app uses to run QA on this Mac). Talks to the QA dashboard's API; needs only Node. Every command prints JSON.
//
//   test-forge status                        ready to test? what needs attention, the active Test Batch, what is running
//   test-forge cases [text]                  loaded test cases (id, scenario, recorded or not), filtered by text
//   test-forge case <id>                     one case: precondition, steps, expected, last result
//   test-forge replay <id> [<id>…]           replay recorded cases on the driver (no Claude); refuses unrecorded ones
//   test-forge wait                          waits for the running batch to finish, then prints each case's verdict
//   test-forge stop                          cancels the running batch
//   test-forge resume                        continues a paused batch (after a crash or Claude's usage limit)
//   test-forge results [n]                   the latest n runs (default 5) with counts
//   test-forge result <runId|latest>         a run's cases: verdict, reason, proof (screenshot / video paths)
//   test-forge report <runId|latest>         the run's Markdown report
//   test-forge screenshot [file]             the test simulator's screen as JPEG (default: a temp file); prints the path
//   test-forge batch                         the active Test Batch and the proof folder
//   test-forge batch start "<name>"          starts a Test Batch (everything run after goes into it)
//   test-forge batch end                     ends it and writes its report
//   test-forge batch pause                   sets the active Test Batch aside (D-212); nothing joins it until resumed
//   test-forge batch resume ["<name>"]       resumes a paused Test Batch (the newest, or the one named); pauses the active one
//   test-forge sessions                      the TestForge's own Claude sessions (runs, triage, assistant) and what waits on you
//   test-forge pending                       every approval / question waiting, with what it wants to do
//   test-forge approve <session> <request>   approve it   ·   test-forge deny <session> <request> ["why"]
//   test-forge answer <session> <request> "<answer>"   answer a question (one answer per question, in order, separated by |)
//   test-forge session <id> [n]              the last n lines of a session (default 15)
//   test-forge tell <id> "<message>"         message a session — e.g. tell a run to investigate and fix (reopens a closed one)
//   test-forge bundle export <runId|latest> <file>   saves a run as a bundle (cases, macros, elements, mocks, verdicts) for the next person
//   test-forge bundle import <file> [--overwrite]    installs a bundle's macros, elements and mocks and loads its cases
//   test-forge bundle replay <bundleId> [<id>…]      replays the bundle's recorded cases on the driver only (no Claude)
//   test-forge bundle compare <bundleId>             the bundle's verdicts against its latest replay
//   test-forge bundle mocks <bundleId>               which mock variant each case ran with
//   test-forge bundle arm <bundleId> <caseId>        switches on that case's mock variants, to test it by hand
//   test-forge demo notes <macroId> [--overwrite]    Claude writes the plain-words notes (English + Bahasa) once, into the macro
//   test-forge demo record <macroId>                 replays slowly, films it and renders demo-en/id.mp4 + .vtt (no Claude)
//   test-forge verify [--base develop] [--range a..b] [--no-local]  cases whose recordings cover the diff (D-196); read-only
//   test-forge demo list                             recorded demos, newest first, with their video and subtitle files
//
// TestForge_DASHBOARD (default http://127.0.0.1:4545) points at another dashboard. Network mocks: see test-forge-lens.
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.env.TestForge_DASHBOARD || "http://127.0.0.1:4545").replace(/\/$/, "");
const [command, ...words] = process.argv.slice(2);

async function call(method, path, body) {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: body ? { "content-type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	}).catch(() => {
		throw new Error(`the QA dashboard isn't answering at ${base} — open TestForge on the Mac`);
	});
	const text = await response.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	if (!response.ok) throw new Error(json?.error ?? `${method} ${path} → HTTP ${response.status}`);
	return json;
}

/** The cases with their recordings and last run joined in (the `testcases` slice — `/api/testcases` has neither). */
async function loadedCases() {
	const state = await call("GET", "/api/state");
	const view = state.slices?.testcases?.value ?? {};
	return { list: view.cases ?? [], title: view.title ?? null };
}

const print = (value) => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
const isRecorded = (testCase) => Boolean(testCase.macro?.id);

async function latestRunId(word) {
	if (word && word !== "latest") return word;
	const { runs } = await call("GET", "/api/results");
	if (!runs?.length) throw new Error("no runs yet");
	return runs[0].id;
}

async function status() {
	const [readiness, batch, testBatch] = await Promise.all([
		call("GET", "/api/readiness"),
		call("GET", "/api/batch"),
		call("GET", "/api/test-batches"),
	]);
	const checks = readiness.checks ?? [];
	return {
		isReadyToTest: Boolean(readiness.ready),
		isReadyForClaudeRuns: Boolean(readiness.readyForClaude),
		needsAttention: checks.filter((check) => !check.ok).map((check) => ({ check: check.label, detail: check.detail })),
		testBatch: testBatch.active ? { name: testBatch.active.name, folder: testBatch.active.folder } : null,
		running: batch.batch && !["done", "cancelled"].includes(batch.batch.status)
			? { status: batch.batch.status, cases: (batch.batch.items ?? []).map((item) => `${item.caseId}: ${item.status}${item.verdict ? ` ${item.verdict}` : ""}`) }
			: null,
	};
}

async function cases(text) {
	const { list, title } = await loadedCases();
	const needle = (text ?? "").toLowerCase();
	const matches = list.filter((entry) => !needle || `${entry.id} ${entry.scenario}`.toLowerCase().includes(needle));
	return { document: title ?? null, count: matches.length, cases: matches.map((entry) => ({ id: entry.id, scenario: entry.scenario, recorded: isRecorded(entry) })) };
}

async function oneCase(id) {
	const { list } = await loadedCases();
	const found = list.find((entry) => entry.id === id);
	if (!found) throw new Error(`no loaded case ${id} — test-forge cases lists them`);
	const { macro, ...rest } = found;
	return { ...rest, recorded: isRecorded(found), recording: macro?.name ?? null };
}

async function replay(ids) {
	if (!ids.length) throw new Error("test-forge replay <id> [<id>…]");
	const { list } = await loadedCases();
	const unrecorded = ids.filter((id) => !isRecorded(list.find((entry) => entry.id === id) ?? {}));
	if (unrecorded.length) {
		throw new Error(`no recording for ${unrecorded.join(", ")} — drive it yourself with the test-forge-driver tools (and test-forge-lens for mocks), or record it first`);
	}
	await call("POST", "/api/batch", { caseIds: ids, approval: "ask" });
	return { started: ids, next: "test-forge wait" };
}

async function wait() {
	for (;;) {
		const { batch } = await call("GET", "/api/batch");
		if (!batch) return { running: false };
		if (["done", "cancelled"].includes(batch.status)) {
			return { status: batch.status, cases: (batch.items ?? []).map((item) => ({ caseId: item.caseId, verdict: item.verdict ?? item.status, reason: item.reason ?? null })) };
		}
		await new Promise((resolve) => setTimeout(resolve, 3_000));
	}
}

async function result(word) {
	const runId = await latestRunId(word);
	const answer = await call("GET", `/api/results/${runId}`);
	const run = answer.run ?? answer;
	return {
		runId,
		status: run.status,
		counts: run.counts,
		cases: (run.items ?? []).map((item) => ({
			caseId: item.caseId,
			verdict: item.verdict ?? item.status,
			reason: item.reason ?? item.failureNote ?? null,
			screenshots: item.evidence?.screenshots ?? [],
			videos: item.evidence?.videos ?? [],
		})),
	};
}

async function screenshot(file) {
	const response = await fetch(`${base}/api/device/screenshot.jpg`).catch(() => null);
	if (!response?.ok) throw new Error("couldn't read the test simulator's screen");
	const path = file ?? join(tmpdir(), `test-forge-screen-${Date.now()}.jpg`);
	await writeFile(path, Buffer.from(await response.arrayBuffer()));
	return { path };
}

async function batch([action, name]) {
	if (action === "start") return call("POST", "/api/test-batches", { name: name ?? `Remote ${new Date().toISOString().slice(0, 16)}` });
	if (action === "end") {
		const { active } = await call("GET", "/api/test-batches");
		if (!active) throw new Error("no Test Batch is active");
		return call("POST", `/api/test-batches/${active.id}/end`);
	}
	if (action === "pause") {
		const { active } = await call("GET", "/api/test-batches");
		if (!active) throw new Error("no Test Batch is active");
		return call("POST", `/api/test-batches/${active.id}/pause`);
	}
	if (action === "resume") {
		const { paused = [] } = await call("GET", "/api/test-batches");
		const target = name ? paused.find((entry) => entry.name === name) : paused[0];
		if (!target) throw new Error(name ? `no paused Test Batch is named “${name}”` : "no Test Batch is paused");
		return call("POST", `/api/test-batches/${target.id}/resume`);
	}
	const view = await call("GET", "/api/test-batches");
	return { active: view.active ?? null, paused: (view.paused ?? []).map((entry) => entry.name), proofRoot: view.proofRoot ?? null };
}

/** A session's recorded events: the stream replays them all, then the summary — read until the summary, then stop. */
async function sessionEvents(sessionId) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8_000);
	const events = [];
	try {
		const response = await fetch(`${base}/api/sessions/${sessionId}/stream`, { signal: controller.signal });
		if (!response.ok) throw new Error(`no session ${sessionId}`);
		const decoder = new TextDecoder();
		let buffer = "";
		let eventName = "message";
		for await (const chunk of response.body) {
			buffer += decoder.decode(chunk, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop();
			for (const line of lines) {
				if (line.startsWith("event:")) eventName = line.slice(6).trim();
				else if (line.startsWith("data:")) {
					if (eventName === "summary") return events;
					events.push(JSON.parse(line.slice(5)));
					eventName = "message";
				}
			}
		}
	} catch (error) {
		if (error.name !== "AbortError") throw error;
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
	return events;
}

function eventLine(event) {
	if (event.type === "dashboard" && event.kind === "user") return `you: ${event.text}`;
	if (event.type === "dashboard" && ["approval", "question"].includes(event.kind)) return `waiting: ${event.kind} ${event.toolName} (${event.requestId})`;
	if (event.type === "assistant") {
		const parts = event.message?.content ?? [];
		const text = parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
		const tools = parts.filter((part) => part.type === "tool_use").map((part) => part.name);
		return text ? `claude: ${text.slice(0, 300)}` : tools.length ? `tool: ${tools.join(", ")}` : null;
	}
	return null;
}

async function sessionsList() {
	const state = await call("GET", "/api/state");
	return (state.slices?.queue?.value?.sessions ?? []).slice(0, 15).map((session) => ({
		id: session.id,
		title: session.title,
		status: session.status,
		kind: session.meta?.test-forge ? "assistant" : session.meta?.taskId ? "run" : "chat",
		waiting: (session.pending ?? []).map((request) => `${request.kind} ${request.toolName} (${request.requestId})`),
	}));
}

async function pending() {
	const sessions = (await sessionsList()).filter((session) => session.waiting.length);
	const out = [];
	for (const session of sessions) {
		const events = await sessionEvents(session.id);
		const open = events.filter((event) => event.type === "dashboard" && ["approval", "question"].includes(event.kind));
		const resolved = new Set(events.filter((event) => /-resolved$/.test(event.kind ?? "")).map((event) => event.requestId));
		for (const request of open.filter((event) => !resolved.has(event.requestId))) {
			out.push({
				session: session.id,
				title: session.title,
				request: request.requestId,
				kind: request.kind,
				tool: request.toolName,
				wants: request.kind === "question" ? request.input?.questions?.map((question) => question.question) : request.input?.command ?? request.input?.file_path ?? request.input,
			});
		}
	}
	return out.length ? out : { pending: 0 };
}

async function answerQuestion(sessionId, requestId, text) {
	const events = await sessionEvents(sessionId);
	const request = events.find((event) => event.requestId === requestId && event.kind === "question");
	if (!request) throw new Error(`no open question ${requestId} in ${sessionId}`);
	const parts = String(text ?? "").split("|").map((part) => part.trim());
	const answers = Object.fromEntries((request.input?.questions ?? []).map((question, index) => [question.question, parts[index] ?? parts[0] ?? ""]));
	return call("POST", `/api/sessions/${sessionId}/answer`, { requestId, behavior: "allow", answers });
}

async function tell(sessionId, text) {
	if (!text) throw new Error('test-forge tell <id> "<message>"');
	const { session } = await call("GET", `/api/sessions/${sessionId}`);
	if (session.status === "closed") await call("POST", `/api/sessions/${sessionId}/reopen`);
	await call("POST", `/api/sessions/${sessionId}/messages`, { text });
	return { sent: true, session: sessionId, next: `test-forge session ${sessionId}` };
}

const commands = {
	status: () => status(),
	cases: () => cases(words.join(" ")),
	case: () => oneCase(words[0]),
	replay: () => replay(words),
	// D-196: the dev face — which loaded cases a diff touches; replay them with `test-forge replay <ids>`.
	verify: () => {
		const flag = (name) => (words.includes(name) ? words[words.indexOf(name) + 1] : undefined);
		return call("POST", "/api/verify/plan", { base: flag("--base"), range: flag("--range"), includeLocal: !words.includes("--no-local") });
	},
	wait: () => wait(),
	stop: () => call("POST", "/api/batch/cancel"),
	resume: () => call("POST", "/api/batch/resume"),
	results: async () => {
		const { runs = [] } = await call("GET", "/api/results");
		return runs.slice(0, Number(words[0] ?? 5)).map((run) => ({ runId: run.id, at: run.createdAt, status: run.status, cases: run.caseIds, counts: run.counts, branch: run.branch }));
	},
	result: () => result(words[0]),
	report: async () => call("GET", `/api/results/${await latestRunId(words[0])}/report.md`),
	screenshot: () => screenshot(words[0]),
	batch: () => batch(words),
	sessions: () => sessionsList(),
	pending: () => pending(),
	approve: () => call("POST", `/api/sessions/${words[0]}/answer`, { requestId: words[1], behavior: "allow" }),
	deny: () => call("POST", `/api/sessions/${words[0]}/answer`, { requestId: words[1], behavior: "deny", message: words.slice(2).join(" ") || "Denied from the phone." }),
	answer: () => answerQuestion(words[0], words[1], words.slice(2).join(" ")),
	session: async () => (await sessionEvents(words[0])).map(eventLine).filter(Boolean).slice(-Number(words[1] ?? 15)),
	tell: () => tell(words[0], words.slice(1).join(" ")),
	// D-157: deeplinks — `link routes [text]`, `link match <url>`, `link open <url>` (no relaunch, pushes over the current screen).
	link: () => link(words[0], words.slice(1).join(" ")),
	// D-162: run bundles — one person pays for the Claude runs, the next replays them free.
	bundle: () => bundle(words[0], words.slice(1)),
	// D-164: self-explaining demo videos.
	demo: () => demo(words[0], words.slice(1)),
};

async function demo(verb, rest) {
	if (verb === "notes") return call("POST", `/api/demo/${rest[0]}/notes`, { overwrite: rest.includes("--overwrite") });
	if (verb === "record") return call("POST", `/api/demo/${rest[0]}/record`, {});
	if (verb === "list" || !verb) return (await call("GET", "/api/demo/recordings")).recordings;
	throw new Error("test-forge demo notes <macroId> [--overwrite] | record <macroId> | list");
}

async function bundle(verb, rest) {
	if (verb === "export") {
		if (!rest[1]) throw new Error("test-forge bundle export <runId|latest> <file>");
		return call("POST", `/api/results/${await latestRunId(rest[0])}/bundle`, { path: rest[1] });
	}
	if (verb === "import") return call("POST", "/api/bundles/import", { path: rest[0], overwrite: rest.includes("--overwrite") });
	if (verb === "replay") return call("POST", `/api/bundles/${rest[0]}/replay`, rest.length > 1 ? { caseIds: rest.slice(1) } : {});
	if (verb === "compare") return call("GET", `/api/bundles/${rest[0]}/compare`);
	if (verb === "mocks") return (await call("GET", `/api/bundles/${rest[0]}`)).plan.caseMocks;
	if (verb === "arm") return call("POST", `/api/bundles/${rest[0]}/cases/${rest[1]}/arm`);
	if (verb === "list" || !verb) return call("GET", "/api/bundles");
	throw new Error("test-forge bundle list | export <runId|latest> <file> | import <file> [--overwrite] | replay <bundleId> [<id>…] | compare <bundleId> | mocks <bundleId> | arm <bundleId> <caseId>");
}

async function link(verb, rest) {
	if (verb === "open") return call("POST", "/api/deeplinks/open", { url: rest });
	if (verb === "match") return call("POST", "/api/deeplinks/match", { url: rest });
	if (verb === "routes") {
		const { routes } = await call("GET", "/api/deeplinks");
		const text = rest.toLowerCase();
		return routes.filter((route) => !text || `${route.description} ${route.template}`.toLowerCase().includes(text))
			.map((route) => ({ description: route.description, template: route.template, ...(route.isAdvanced && { note: "type the link yourself" }) }));
	}
	throw new Error('test-forge link routes [text] | match <url> | open <url>');
}

const run = commands[command];
if (!run) {
	console.error("usage: test-forge status | cases [text] | case <id> | replay <id>… | verify [--base b] [--range a..b] [--no-local] | wait | stop | resume | results [n] | result <runId|latest> | report <runId|latest> | screenshot [file] | batch [start|end] | sessions | pending | approve|deny <session> <request> | answer <session> <request> \"…\" | session <id> [n] | tell <id> \"…\" | link routes [text]|match <url>|open <url> | bundle list|export|import|replay|compare|mocks|arm | demo notes|record|list");
	process.exit(2);
}
try {
	print(await run());
} catch (error) {
	console.error(JSON.stringify({ error: error.message }));
	process.exit(1);
}
