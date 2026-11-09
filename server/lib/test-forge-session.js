// D-133: the Mac app's own Claude session — one per project folder, resumed across app and server restarts,
// so the TestForge is the one place a person talks to Claude (no terminal). Its Claude process starts on the
// first message, so keeping one ready costs nothing.

/** The newest open TestForge session for `projectDir`, else null. `summaries` come from SessionManager.list(). */
export function pickTestForgeSession(summaries, projectDir) {
	return summaries
		.filter((session) => session.meta?.testforge && session.projectDir === projectDir && !["closed", "error"].includes(session.status))
		.sort((lhs, rhs) => rhs.updatedAt.localeCompare(lhs.updatedAt))[0] ?? null;
}

/** `fresh`: close the current one and start a new conversation. */
export function openTestForgeSession(sessions, { projectDir, fresh = false }) {
	const current = pickTestForgeSession(sessions.list(), projectDir);
	if (current && !fresh) return sessions.get(current.id);
	if (current) sessions.get(current.id)?.close();
	return sessions.create({ projectDir, title: "TestForge", meta: { testforge: true } });
}
