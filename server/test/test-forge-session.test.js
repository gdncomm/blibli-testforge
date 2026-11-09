// D-133: the TestForge resumes its own session per project; fresh closes it and starts another.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openTestForgeSession, pickTestForgeSession } from "../lib/test-forge-session.js";

function fakeSessions() {
	const records = new Map();
	let next = 0;
	const wrap = (record) => ({ id: record.id, summary: () => record, close: () => (record.status = "closed") });
	return {
		records,
		list: () => [...records.values()],
		get: (id) => (records.has(id) ? wrap(records.get(id)) : undefined),
		create: ({ projectDir, title, meta }) => {
			const record = { id: `s${++next}`, projectDir, title, meta, status: "idle", updatedAt: `2026-10-17T00:00:0${next}Z` };
			records.set(record.id, record);
			return wrap(record);
		},
	};
}

test("opens one session and resumes it on the next call", () => {
	const sessions = fakeSessions();
	const first = openTestForgeSession(sessions, { projectDir: "/repo" });
	const again = openTestForgeSession(sessions, { projectDir: "/repo" });
	assert.equal(again.id, first.id);
	assert.equal(sessions.records.size, 1);
	assert.equal(first.summary().meta.testforge, true);
});

test("fresh closes the open one and starts another", () => {
	const sessions = fakeSessions();
	const first = openTestForgeSession(sessions, { projectDir: "/repo" });
	const fresh = openTestForgeSession(sessions, { projectDir: "/repo", fresh: true });
	assert.notEqual(fresh.id, first.id);
	assert.equal(sessions.records.get(first.id).status, "closed");
});

test("other folders, closed and non-TestForge sessions are never picked", () => {
	const summaries = [
		{ id: "a", projectDir: "/other", meta: { testforge: true }, status: "idle", updatedAt: "3" },
		{ id: "b", projectDir: "/repo", meta: {}, status: "idle", updatedAt: "4" },
		{ id: "c", projectDir: "/repo", meta: { testforge: true }, status: "closed", updatedAt: "5" },
		{ id: "d", projectDir: "/repo", meta: { testforge: true }, status: "idle", updatedAt: "1" },
		{ id: "e", projectDir: "/repo", meta: { testforge: true }, status: "running", updatedAt: "2" },
	];
	assert.equal(pickTestForgeSession(summaries, "/repo").id, "e");
	assert.equal(pickTestForgeSession(summaries, "/nowhere"), null);
});
