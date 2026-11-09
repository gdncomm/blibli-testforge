// Which tool calls run without asking, which always ask, and which are refused outright, for
// dashboard Claude sessions. The CLI applies the user's / project's own allow rules first; this only
// decides what reaches the dashboard's approval card.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Production test-case document: read-only, never commented on (see context-resumption.md). */
export const PROTECTED_CONFLUENCE_PAGES = ["2396520535"];

export const TEST_FORGE_DRIVER_TOOL = /^mcp__plugin_test-flow-recorder_test-forge-driver__/;

const PRE_ALLOWED = [
	/^(Read|Grep|Glob|ToolSearch|WebSearch|WebFetch|LS|TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet)$/,
	TEST_FORGE_DRIVER_TOOL,
	// Read-only NetworkLens tools; the plugin's `test-forge-mock` server is gone, the project `networklens` MCP is the only mock channel (D-072).
	/^mcp__networklens__lens_(list|mocks|stats|status)$/,
	/^mcp__claude_ai_Atlassian_Rovo__(get|search|fetch|lookup|atlassianUserInfo)/,
];

const CONFLUENCE_WRITE = /^mcp__(claude_ai_Atlassian_Rovo|plugin_atlassian_atlassian)__(update|create)Confluence/;

/** A reason string when the call must be refused whatever the user approves; null otherwise. */
export function hardDenyReason(toolName, input) {
	if (CONFLUENCE_WRITE.test(toolName)) {
		const target = JSON.stringify(input ?? {});
		const hit = PROTECTED_CONFLUENCE_PAGES.find((pageId) => target.includes(pageId));
		if (hit) return `Confluence page ${hit} is a production document — the dashboard never edits or comments on it.`;
	}
	return null;
}

export function isPreAllowed(toolName) {
	return PRE_ALLOWED.some((pattern) => pattern.test(toolName));
}

/** Per-project "Always allow" rules, persisted so they survive restarts. Shape: { [projectDir]: [toolName] }. */
export class AlwaysAllowStore {
	constructor(path) {
		this.path = path;
		this.rules = null;
	}

	async #load() {
		if (this.rules) return this.rules;
		try {
			this.rules = JSON.parse(await readFile(this.path, "utf8"));
		} catch {
			this.rules = {};
		}
		return this.rules;
	}

	async allows(projectDir, toolName) {
		const rules = await this.#load();
		return (rules[projectDir] ?? []).includes(toolName);
	}

	async add(projectDir, toolName) {
		const rules = await this.#load();
		rules[projectDir] = [...new Set([...(rules[projectDir] ?? []), toolName])];
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, JSON.stringify(rules, null, 2));
	}

	async list() {
		return this.#load();
	}
}
