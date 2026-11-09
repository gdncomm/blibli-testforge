#!/usr/bin/env node
// test-forge-lens — NetworkLens from a terminal, a CI job or a Claude run (D-127). Talks to the QA dashboard's /api/lens, so it
// needs nothing but Node; no MCP. Every command prints JSON.
//
//   test-forge-lens state                                  health (queue owner, app polling) + mocking + rules and variants
//   test-forge-lens mocking on|off                         the master switch
//   test-forge-lens mock "<METHOD /path>" <variant> [--retime]   turn a rule on with that variant (repo pack variants included)
//   test-forge-lens off "<METHOD /path>"                   turn a rule off
//   test-forge-lens calls [--grep text] [--limit n]        captured calls, newest first
//   test-forge-lens call <id> [--curl]                     one call: headers, bodies, curl (or just the curl)
//   test-forge-lens mock-call <id>                         make a rule from that call's real response (+ empty/500/slow…)
//   test-forge-lens trackers [ID,ID…] [--contract file.json] [--all-sessions]   which TRMS IDs fired, missing, payload problems
//   test-forge-lens tracker <ID> [--contract file.json]    one ID's fires, newest first, with payloads
//   test-forge-lens trackers-report [ID,ID…] [--contract file.json] [--out file.md]   the DA-format markdown page (D-129)
//   test-forge-lens breakpoints                            breakpoints set + what is held right now (D-130, phase-D app build)
//   test-forge-lens hold "<METHOD /path>" [--stage request|response|both] [--once]   hold matching calls
//   test-forge-lens unhold ["<METHOD /path>"]              remove that endpoint's breakpoint (none = all)
//   test-forge-lens release <heldId> [--status 500] [--body '{}'] [--fail offline]   continue (edited) or fail a held call
//   test-forge-lens release-all
//   test-forge-lens replay <call id>                       send a captured request again from the app
//   test-forge-lens bubble hide|show                       the NetworkLens bubble, out of the way of a test
//
// TestForge_DASHBOARD (default http://127.0.0.1:4545) points at another dashboard.

const base = (process.env.TestForge_DASHBOARD || "http://127.0.0.1:4545").replace(/\/$/, "");
const [command, ...rest] = process.argv.slice(2);
const flags = new Map();
const words = [];
for (let index = 0; index < rest.length; index++) {
	const word = rest[index];
	if (!word.startsWith("--")) {
		words.push(word);
		continue;
	}
	const next = rest[index + 1];
	const hasValue = next !== undefined && !next.startsWith("--");
	flags.set(word.slice(2), hasValue ? next : true);
	if (hasValue) index++;
}

async function call(method, path, body) {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: body ? { "content-type": "application/json" } : {},
		body: body ? JSON.stringify(body) : undefined,
	}).catch((error) => {
		throw new Error(`no QA dashboard at ${base} (${error.message}) — start TestForge or tools/test-forge-server/start.sh`);
	});
	const answer = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(answer.error ?? `HTTP ${response.status}`);
	return answer;
}

async function trackerAsk(ids) {
	const contractPath = flags.get("contract");
	let contract;
	if (typeof contractPath === "string") {
		const { readFile } = await import("node:fs/promises");
		contract = JSON.parse(await readFile(contractPath, "utf8"));
	}
	return { ids: String(ids ?? "").split(",").filter(Boolean), contract, allSessions: flags.has("all-sessions") };
}

async function main() {
	switch (command) {
		case "state":
			return call("GET", "/api/lens/state");
		case "mocking":
			if (!["on", "off"].includes(words[0])) throw new Error("usage: test-forge-lens mocking on|off");
			return call("POST", "/api/lens/mocking", { enabled: words[0] === "on" });
		case "mock":
			if (words.length < 2) throw new Error("usage: test-forge-lens mock \"GET /backend/…\" <variant> [--retime]");
			return call("POST", "/api/lens/rule", { endpoint: words[0], variant: words[1], retime: flags.has("retime") });
		case "off":
			if (!words[0]) throw new Error("usage: test-forge-lens off \"GET /backend/…\"");
			return call("POST", "/api/lens/rule", { endpoint: words[0], enabled: false });
		case "calls": {
			const query = new URLSearchParams({ limit: String(flags.get("limit") ?? 30), grep: String(flags.get("grep") ?? "") });
			return call("GET", `/api/lens/calls?${query}`);
		}
		case "call": {
			if (!words[0]) throw new Error("usage: test-forge-lens call <id> [--curl]");
			const detail = await call("GET", `/api/lens/calls/${encodeURIComponent(words[0])}`);
			return flags.has("curl") ? { curl: detail.curl } : detail;
		}
		case "mock-call":
			if (!words[0]) throw new Error("usage: test-forge-lens mock-call <id>");
			return call("POST", `/api/lens/calls/${encodeURIComponent(words[0])}/mock`);
		case "trackers":
			return call("POST", "/api/lens/trackers", await trackerAsk(words[0]));
		case "tracker":
			if (!words[0]) throw new Error("usage: test-forge-lens tracker <TRMS ID> [--contract file.json]");
			return call("POST", `/api/lens/trackers/${encodeURIComponent(words[0])}`, await trackerAsk(words[0]));
		case "trackers-report": {
			const { markdown } = await call("POST", "/api/lens/trackers-report", await trackerAsk(words[0]));
			const out = flags.get("out");
			if (typeof out !== "string") return { markdown };
			const { writeFile } = await import("node:fs/promises");
			await writeFile(out, `${markdown}\n`);
			return { wrote: out };
		}
		case "breakpoints":
			return call("GET", "/api/lens/breakpoints");
		case "hold":
			if (!words[0]) throw new Error("usage: test-forge-lens hold \"GET /backend/…\" [--stage request|response|both] [--once]");
			return call("POST", "/api/lens/breakpoints", { endpoint: words[0], stage: flags.get("stage") ?? "response", oneShot: flags.has("once") });
		case "unhold":
			return call("DELETE", `/api/lens/breakpoints${words[0] ? `?endpoint=${encodeURIComponent(words[0])}` : ""}`);
		case "release": {
			if (!words[0]) throw new Error("usage: test-forge-lens release <heldId> [--status n] [--body text] [--fail offline|timedOut|…]");
			const edit = {
				...(flags.has("status") && { status: Number(flags.get("status")) }),
				...(typeof flags.get("body") === "string" && { body: flags.get("body") }),
				...(typeof flags.get("fail") === "string" && { failure: flags.get("fail") }),
			};
			return call("POST", `/api/lens/held/${encodeURIComponent(words[0])}/resume`, edit);
		}
		case "release-all":
			return call("POST", "/api/lens/held/resume-all", {});
		case "replay":
			if (!words[0]) throw new Error("usage: test-forge-lens replay <call id>");
			return call("POST", `/api/lens/calls/${encodeURIComponent(words[0])}/replay`, {});
		case "bubble":
			if (!["hide", "show"].includes(words[0])) throw new Error("usage: test-forge-lens bubble hide|show");
			return call("POST", "/api/lens/bubble", { hidden: words[0] === "hide" });
		default:
			throw new Error("commands: state · mocking on|off · mock <endpoint> <variant> · off <endpoint> · calls · call <id> · mock-call <id>"
				+ " · trackers [ids] · tracker <id> · trackers-report [ids] · breakpoints · hold <endpoint> · unhold [endpoint]"
				+ " · release <heldId> · release-all · replay <call id> · bubble hide|show");
	}
}

main().then(
	(value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
	(error) => {
		process.stderr.write(`test-forge-lens: ${error.message}\n`);
		process.exit(1);
	},
);
