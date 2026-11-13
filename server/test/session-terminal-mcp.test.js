// D-222: Open in Terminal hands a conversation to `claude --resume`; `/mcp` lists and reconnects MCP servers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeSession, terminalCommand } from "../lib/claude-session.js";

async function sessionWith(fields) {
	const dataDir = await mkdtemp(join(tmpdir(), "terminal-mcp-"));
	const record = { id: "s1", title: "TestForge", projectDir: dataDir, status: "idle", meta: {}, ...fields };
	return new ClaudeSession(record, { dataDir, alwaysAllow: { add: async () => {}, allows: async () => false }, onChange: () => {} });
}

/** Stands in for the SDK query: already live, so the session never spawns `claude`. */
function liveQuery(servers) {
	const calls = { reconnected: [], closed: 0 };
	return {
		calls,
		mcpServerStatus: async () => servers,
		reconnectMcpServer: async (name) => {
			if (name === "broken") throw new Error("networklens: no checkout found");
			calls.reconnected.push(name);
		},
		close: () => calls.closed++,
		async *[Symbol.asyncIterator]() {},
	};
}

test("the terminal command goes to the folder and resumes the conversation, quoting both", () => {
	const command = terminalCommand({ projectDir: "/Users/me/It's here", claudeSessionId: "abc-123", model: "claude-sonnet-5-5" });
	assert.equal(command, "cd '/Users/me/It'\\''s here' && claude --resume 'abc-123' --model 'claude-sonnet-5-5'");
	assert.equal(terminalCommand({ projectDir: "/p", claudeSessionId: "x" }), "cd '/p' && claude --resume 'x'");
});

test("handing off ends the app's Claude process and returns the command", async () => {
	const session = await sessionWith({ claudeSessionId: "abc-123" });
	const fake = liveQuery([]);
	session.query = fake;
	const handoff = session.handOffToTerminal();
	assert.equal(handoff.claudeSessionId, "abc-123");
	assert.match(handoff.command, /claude --resume 'abc-123'/);
	assert.equal(fake.calls.closed, 1);
	assert.equal(session.isLive, false);
	assert.equal(session.record.status, "idle");
	assert.ok(session.events.some((event) => event.kind === "terminal"));
});

test("a conversation that never started, or one still working, is not handed off", async () => {
	const fresh = await sessionWith({});
	assert.throws(() => fresh.handOffToTerminal(), /Send a message first/);
	const busy = await sessionWith({ claudeSessionId: "abc", status: "waiting-approval" });
	assert.throws(() => busy.handOffToTerminal(), /Claude is working/);
});

test("MCP servers are listed with their status and error", async () => {
	const session = await sessionWith({ claudeSessionId: "abc" });
	session.query = liveQuery([
		{ name: "networklens", status: "failed", error: "no checkout", scope: "project", config: { type: "stdio" } },
		{ name: "test-forge-driver", status: "connected", serverInfo: { name: "d", version: "1" } },
	]);
	assert.deepEqual(await session.mcpServers(), [
		{ name: "networklens", status: "failed", error: "no checkout", scope: "project" },
		{ name: "test-forge-driver", status: "connected", error: undefined, scope: undefined },
	]);
});

test("reconnect reports the servers again, or throws with Claude's reason", async () => {
	const session = await sessionWith({ claudeSessionId: "abc" });
	const fake = liveQuery([{ name: "networklens", status: "connected" }]);
	session.query = fake;
	const servers = await session.reconnectMcpServer("networklens");
	assert.deepEqual(fake.calls.reconnected, ["networklens"]);
	assert.equal(servers[0].status, "connected");
	await assert.rejects(session.reconnectMcpServer("broken"), /no checkout found/);
});

test("a closed conversation can't list MCP servers until it is reopened", async () => {
	const session = await sessionWith({ claudeSessionId: "abc", status: "closed" });
	await assert.rejects(session.mcpServers(), /closed/);
});
