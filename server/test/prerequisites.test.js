import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPrerequisites, parseMcpList, parsePluginList, prerequisiteChecks } from "../lib/prerequisites.js";

const MCP = `Checking MCP server health…

claude.ai Atlassian Rovo: https://mcp.atlassian.com/v1/mcp/authv2 - ! Needs authentication
plugin:test-flow-recorder:test-forge-driver: /x/start.sh  - ✔ Connected
networklens: \${CLAUDE_PROJECT_DIR}/scripts/networklens/mcp-server.sh  - ✘ Failed to connect`;

const PLUGINS = `Installed plugins:

  ❯ test-flow-recorder@test-forge-tools
    Version: 0.9.1
    Scope: user
    Status: ✔ enabled

  ❯ blue-design-system@agent-plugins
    Version: 1.4.0
    Status: ✘ disabled`;

test("D-190: parses claude mcp list and plugin list", () => {
	assert.deepEqual(parseMcpList(MCP).map((server) => [server.name, server.status]), [
		["claude.ai Atlassian Rovo", "needs-auth"],
		["plugin:test-flow-recorder:test-forge-driver", "connected"],
		["networklens", "failed"],
	]);
	assert.deepEqual(parsePluginList(PLUGINS), [
		{ name: "test-flow-recorder", marketplace: "test-forge-tools", version: "0.9.1", isEnabled: true },
		{ name: "blue-design-system", marketplace: "agent-plugins", version: "1.4.0", isEnabled: false },
	]);
});

test("D-190: a failed required MCP blocks Claude runs only; a missing optional tool only warns in the detail", async () => {
	const run = async (command, args) => {
		if (command === "claude" && args[0] === "mcp") return { stdout: MCP };
		if (command === "claude" && args[0] === "plugin") return { stdout: PLUGINS };
		if (command === "ffmpeg") throw new Error("ENOENT");
		if (command === "node") return { stdout: "v20.11.0" };
		return { stdout: "1.2.3" };
	};
	const result = await checkPrerequisites({ run });
	const [tools, claude] = prerequisiteChecks(result);
	assert.equal(tools.ok, true);
	assert.match(tools.detail, /optional: ffmpeg/);
	assert.equal(tools.fix, "show-prerequisites");
	assert.equal(claude.ok, false);
	assert.equal(claude.scope, "claude");
	assert.match(claude.detail, /missing: NetworkLens MCP/);
	assert.equal(result.items.find((item) => item.id === "atlassian").detail, "claude.ai Atlassian Rovo · needs authentication");
});
