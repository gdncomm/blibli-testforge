// F3 (D-190): what this Mac needs before the TestForge can test — tools on PATH, the Claude Code plugin and MCP
// servers Claude runs drive — each with its state and the one thing to do about it. `claude mcp list` health-checks
// every server (~6 s), so a result is kept for a while and refreshed on request.

/** Tools the server shells out to. `isRequired: false` only loses a feature (ffmpeg trims long videos). */
export const TOOLS = [
	{ id: "node", label: "Node.js 18+", command: "node", args: ["--version"], minMajor: 18, isRequired: true, howTo: "brew install node" },
	{ id: "git", label: "git", command: "git", args: ["--version"], isRequired: true, howTo: "xcode-select --install" },
	{ id: "xcrun", label: "Xcode command line tools", command: "xcrun", args: ["--version"], isRequired: true, howTo: "xcode-select --install" },
	{ id: "python3", label: "Python 3", command: "python3", args: ["--version"], isRequired: true, howTo: "xcode-select --install" },
	{ id: "claude", label: "Claude Code CLI", command: "claude", args: ["--version"], isRequired: true, howTo: "npm install -g @anthropic-ai/claude-code" },
	{ id: "ffmpeg", label: "ffmpeg (trims long screen recordings)", command: "ffmpeg", args: ["-version"], isRequired: false, howTo: "brew install ffmpeg" },
];

/** MCP servers, matched by name; any one spelling in `names` satisfies it. */
export const MCP_SERVERS = [
	{ id: "test-forge-driver", label: "test-forge-driver MCP (drives the simulator)", names: ["plugin:test-flow-recorder:test-forge-driver", "test-forge-driver"], isRequired: true, howTo: "claude plugin enable test-flow-recorder" },
	{ id: "networklens", label: "NetworkLens MCP (mocks and traces)", names: ["networklens"], isRequired: true, howTo: "Registered in BlibliMobile-iOS/.mcp.json — open Claude Code in BlibliMobile-iOS once and approve it" },
	{ id: "atlassian", label: "Atlassian MCP (loads Confluence test cases, posts to Jira)", names: ["claude.ai Atlassian Rovo", "plugin:atlassian:atlassian"], isRequired: false, howTo: "In Claude Code run /mcp and sign in to Atlassian" },
];

export const PLUGINS = [
	{ id: "test-flow-recorder", label: "test-flow-recorder plugin (test-forge-run, test-forge-macro skills)", name: "test-flow-recorder", isRequired: true, howTo: "claude plugin enable test-flow-recorder" },
];

/** `claude mcp list` lines: "name: target - ✔ Connected" / "! Needs authentication" / "✘ Failed to connect". */
export function parseMcpList(text) {
	const servers = [];
	for (const line of String(text).split("\n")) {
		const match = line.match(/^(.+?):\s.*\s-\s(✔|✓|!|✘|✗)\s*(.+)$/u);
		if (!match) continue;
		const [, name, mark, words] = match;
		const status = ["✔", "✓"].includes(mark) ? "connected" : mark === "!" ? "needs-auth" : "failed";
		servers.push({ name: name.trim(), status, words: words.trim() });
	}
	return servers;
}

/** `claude plugin list` blocks: "❯ name@marketplace", then "Version:", "Status: ✔ enabled". */
export function parsePluginList(text) {
	const plugins = [];
	let current = null;
	for (const line of String(text).split("\n")) {
		const header = line.match(/^\s*❯\s+([^@\s]+)@(\S+)/u);
		if (header) {
			current = { name: header[1], marketplace: header[2], version: null, isEnabled: false };
			plugins.push(current);
			continue;
		}
		if (!current) continue;
		const version = line.match(/^\s*Version:\s*(\S+)/);
		if (version) current.version = version[1];
		if (/^\s*Status:/.test(line)) current.isEnabled = /enabled/i.test(line) && !/disabled/i.test(line);
	}
	return plugins;
}

function toolItem(tool, output) {
	if (output === null) return { ...pick(tool), kind: "tool", ok: false, detail: "not found on PATH" };
	const version = (String(output).match(/\d+\.\d+(\.\d+)?/) ?? [""])[0];
	if (tool.minMajor && Number(version.split(".")[0]) < tool.minMajor) return { ...pick(tool), kind: "tool", ok: false, detail: `${version} — needs ${tool.minMajor}+` };
	return { ...pick(tool), kind: "tool", ok: true, detail: version || "found" };
}

function mcpItem(server, servers) {
	if (servers === null) return { ...pick(server), kind: "mcp", ok: false, detail: "couldn't ask Claude Code (claude mcp list)" };
	const found = servers.find((entry) => server.names.includes(entry.name));
	if (!found) return { ...pick(server), kind: "mcp", ok: false, detail: "not registered" };
	const detail = found.status === "connected" ? `${found.name} · connected` : `${found.name} · ${found.words.toLowerCase()}`;
	return { ...pick(server), kind: "mcp", ok: found.status === "connected", detail };
}

function pluginItem(plugin, plugins) {
	if (plugins === null) return { ...pick(plugin), kind: "plugin", ok: false, detail: "couldn't ask Claude Code (claude plugin list)" };
	const found = plugins.find((entry) => entry.name === plugin.name);
	if (!found) return { ...pick(plugin), kind: "plugin", ok: false, detail: "not installed" };
	return { ...pick(plugin), kind: "plugin", ok: found.isEnabled, detail: `${found.version ?? "?"} · ${found.isEnabled ? "enabled" : "disabled"}` };
}

const pick = ({ id, label, isRequired, howTo }) => ({ id, label, isRequired, howTo });

/** Every prerequisite with its state. `run(command, args)` resolves stdout or throws; injected for tests. */
export async function checkPrerequisites({ run, cwd }) {
	const ask = (command, args, timeout = 15_000) => run(command, args, { timeout, cwd }).then((result) => `${result.stdout ?? ""}${result.stderr ?? ""}`).catch(() => null);
	const [toolOutputs, mcpText, pluginText] = await Promise.all([
		Promise.all(TOOLS.map((tool) => ask(tool.command, tool.args))),
		ask("claude", ["mcp", "list"], 60_000),
		ask("claude", ["plugin", "list"], 30_000),
	]);
	const servers = mcpText === null ? null : parseMcpList(mcpText);
	const plugins = pluginText === null ? null : parsePluginList(pluginText);
	return {
		checkedAt: new Date().toISOString(),
		items: [
			...TOOLS.map((tool, index) => toolItem(tool, toolOutputs[index])),
			...PLUGINS.map((plugin) => pluginItem(plugin, plugins)),
			...MCP_SERVERS.map((server) => mcpItem(server, servers)),
		],
	};
}

/** Two Get Ready rows: tools block everything; the plugin and MCP servers only block Claude runs. */
export function prerequisiteChecks(result) {
	if (!result) return [];
	const missing = (items) => items.filter((item) => !item.ok && item.isRequired);
	const optionalMissing = (items) => items.filter((item) => !item.ok && !item.isRequired);
	const summary = (items, okText) => {
		const required = missing(items);
		const optional = optionalMissing(items);
		if (required.length) return `missing: ${required.map((item) => item.label.split(" (")[0]).join(", ")}`;
		if (optional.length) return `${okText}; optional: ${optional.map((item) => `${item.label.split(" (")[0]} (${item.detail})`).join(", ")}`;
		return okText;
	};
	const tools = result.items.filter((item) => item.kind === "tool");
	const claude = result.items.filter((item) => item.kind !== "tool");
	return [
		{ id: "prereq-tools", label: "Tools on this Mac", ok: missing(tools).length === 0, detail: summary(tools, "all found"), fix: missing(tools).length || optionalMissing(tools).length ? "show-prerequisites" : undefined },
		{ id: "prereq-claude", label: "Claude Code plugin + MCP servers", scope: "claude", ok: missing(claude).length === 0, detail: summary(claude, "all connected"), fix: missing(claude).length || optionalMissing(claude).length ? "show-prerequisites" : undefined },
	];
}
