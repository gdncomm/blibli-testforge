// Turns `claude -p --output-format stream-json --verbose` events into readable console lines, so a
// ▶ Run shows each tool call and result as it happens instead of one block of text at the end.
// Event shapes were taken from a real run (Claude Code CLI): system/init, assistant (text,
// thinking, tool_use), user (tool_result), rate_limit_event, result.

const MAX_DETAIL = 160;

function clip(text, max = MAX_DETAIL) {
	const single = String(text ?? "").replace(/\s+/g, " ").trim();
	return single.length > max ? `${single.slice(0, max)}…` : single;
}

/** Splits a byte stream into complete lines; a JSON event can arrive split across chunks. */
export function lineSplitter(onLine) {
	let buffer = "";
	return {
		push(chunk) {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop();
			for (const line of lines) if (line.trim()) onLine(line);
		},
		flush() {
			if (buffer.trim()) onLine(buffer);
			buffer = "";
		},
	};
}

/** One-line summary of a tool call — the argument a human would want to see for that tool. */
function describeToolUse(name, input = {}) {
	const pick = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.skill
		?? input.url ?? input.kind ?? input.query ?? input.description ?? input.prompt;
	if (name.startsWith("mcp__")) {
		const [, server, tool] = name.split("__");
		const args = Object.keys(input).length ? ` ${clip(JSON.stringify(input), 120)}` : "";
		return `${server.replace(/^plugin_[^_]+_/, "")} · ${tool}${args}`;
	}
	if (name === "Skill") return `Skill ${input.skill}${input.args ? ` ${clip(input.args, 80)}` : ""}`;
	if (name === "Agent" || name === "Task") return `${name} — ${clip(input.description || input.prompt, 100)}`;
	return pick !== undefined ? `${name} ${clip(pick, 140)}` : name;
}

function toolResultText(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join(" ");
	}
	return JSON.stringify(content);
}

function formatDuration(ms) {
	const seconds = Math.round((ms ?? 0) / 1000);
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/**
 * Formats one stream-json line. Returns `{ lines, result? }` — `lines` to print (possibly empty, for
 * events not worth showing), and `result` only for the final `result` event.
 */
export function formatEvent(rawLine) {
	let event;
	try {
		event = JSON.parse(rawLine);
	} catch {
		return { lines: [rawLine] };
	}
	const indent = event.parent_tool_use_id ? "    ↳ " : "";

	switch (event.type) {
		case "system": {
			if (event.subtype !== "init") return { lines: [] };
			const servers = event.mcp_servers ?? [];
			const unhealthy = servers.filter((server) => server.status !== "connected");
			const lines = [`● Claude session started · ${event.model} · permissions: ${event.permissionMode} · ${servers.length - unhealthy.length}/${servers.length} MCP servers connected`];
			// Only a failed server is an error; pending / needs-auth servers are usually ones /test-forge-run never calls.
			for (const server of unhealthy) {
				lines.push(`${server.status === "failed" ? "!" : "  ·"} MCP ${server.name}: ${server.status}`);
			}
			return { lines };
		}
		case "assistant": {
			const lines = [];
			for (const part of event.message?.content ?? []) {
				if (part.type === "text" && part.text.trim()) {
					for (const textLine of part.text.trim().split("\n")) lines.push(`${indent}${textLine}`);
				} else if (part.type === "tool_use") {
					lines.push(`${indent}→ ${describeToolUse(part.name, part.input)}`);
				}
			}
			return { lines };
		}
		case "user": {
			const lines = [];
			for (const part of event.message?.content ?? []) {
				if (part.type !== "tool_result") continue;
				const text = clip(toolResultText(part.content));
				lines.push(`${indent}  ${part.is_error ? "✗" : "←"} ${text || "(no output)"}`);
			}
			return { lines };
		}
		case "rate_limit_event": {
			const info = event.rate_limit_info ?? {};
			if (info.status === "allowed") return { lines: [] };
			const resets = info.resetsAt ? ` until ${new Date(info.resetsAt * 1000).toLocaleTimeString()}` : "";
			return { lines: [`! rate limited (${info.rateLimitType ?? "limit"})${resets}`] };
		}
		case "result": {
			const result = {
				isError: Boolean(event.is_error),
				subtype: event.subtype,
				text: event.result ?? "",
				turns: event.num_turns,
				durationMs: event.duration_ms,
				costUsd: event.total_cost_usd,
				permissionDenials: (event.permission_denials ?? []).map((denial) => denial.tool_name ?? denial.toolName ?? "?"),
			};
			const cost = typeof result.costUsd === "number" ? ` · $${result.costUsd.toFixed(2)}` : "";
			const lines = [`■ ${result.isError ? "Claude stopped with an error" : "Claude finished"} (${result.subtype}) · ${result.turns ?? "?"} turns · ${formatDuration(result.durationMs)}${cost}`];
			if (result.permissionDenials.length) {
				lines.push(`! ${result.permissionDenials.length} tool call(s) were denied permission: ${[...new Set(result.permissionDenials)].join(", ")} — allow them in .claude/settings.json or set TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE=1`);
			}
			return { lines, result };
		}
		default:
			return { lines: [] };
	}
}

// Only a line that states the verdict counts (`VERDICT: PASS`, `**Verdict:** FAIL`). A bare word
// anywhere did not: "skill-audit FAIL" in a case that never ran was read as FAIL, and a PASS
// report that mentioned an earlier BLOCKED gate as BLOCKED (D-070).
const VERDICT_LINE = /^[\s>*_#-]*verdict[\s*_]*[:—–-]+[\s*_]*(PASS|FAIL|EVIDENCE_ONLY|UNDECIDED|BLOCKED)\b/gim;

/** The last stated verdict in Claude's final answer (authoritative), else in the streamed tail. */
export function extractVerdict(finalText, lines) {
	for (const source of [finalText ?? "", lines.slice(-40).join("\n")]) {
		const matches = [...source.matchAll(VERDICT_LINE)];
		if (matches.length) return matches.at(-1)[1].toUpperCase();
	}
	return null;
}
