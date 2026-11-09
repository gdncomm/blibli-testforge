// HTTP surface for dashboard Claude sessions: create, message, answer approvals / questions,
// interrupt, close, and an SSE transcript stream per session.
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { openTestForgeSession } from "../lib/test-forge-session.js";

export function sse(res) {
	res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
	res.flushHeaders();
	const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
	res.on("close", () => clearInterval(keepAlive));
	return (event, data) => res.write(`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`);
}

/** `ctx`: { sessions: SessionManager, defaultProjectDir, captureScreenshot?: () => Promise<{base64, mediaType}> } */
export function registerSessionRoutes(app, ctx) {
	const { sessions } = ctx;
	const find = (req, res) => {
		const session = sessions.get(req.params.id);
		if (!session) res.status(404).json({ error: "no such session" });
		return session;
	};
	const attachmentsFor = async (body) => {
		if (!body.attachScreenshot || !ctx.captureScreenshot) return [];
		const { base64, mediaType } = await ctx.captureScreenshot();
		return [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }];
	};

	app.get("/api/sessions", (_req, res) => res.json({ sessions: sessions.list() }));

	app.post("/api/sessions", async (req, res) => {
		const { title, model, prompt, meta } = req.body;
		// Default: the QA copy "1 · What code?" prepared, so Claude reads the code under test (D-045).
		const projectDir = req.body.projectDir || (ctx.resolveProjectDir ? await ctx.resolveProjectDir() : ctx.defaultProjectDir);
		if (!isAbsolute(projectDir) || !existsSync(projectDir)) return res.status(400).json({ error: `project folder not found: ${projectDir}` });
		const session = sessions.create({ projectDir, title, model, meta });
		try {
			if (prompt?.trim()) session.send(prompt.trim(), { attachments: await attachmentsFor(req.body) });
		} catch (error) {
			return res.status(500).json({ error: error.message, session: session.summary() });
		}
		res.json({ session: session.summary() });
	});

	// D-133: the Mac app's Claude section — resumes its open session in the selected repo, or starts one.
	app.post("/api/sessions/testforge", (req, res) => {
		const projectDir = ctx.defaultProjectDir;
		if (!existsSync(projectDir)) return res.status(400).json({ error: `project folder not found: ${projectDir}` });
		const session = openTestForgeSession(sessions, { projectDir, fresh: req.body?.fresh === true });
		res.json({ session: session.summary() });
	});

	app.get("/api/sessions/:id", (req, res) => {
		const session = find(req, res);
		if (session) res.json({ session: session.summary() });
	});

	app.post("/api/sessions/:id/messages", async (req, res) => {
		const session = find(req, res);
		if (!session) return;
		const text = req.body.text?.trim();
		if (!text) return res.status(400).json({ error: "message is empty" });
		try {
			await session.loadHistory();
			session.send(text, { attachments: await attachmentsFor(req.body) });
			res.json({ ok: true, session: session.summary() });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	// D-147: the Mac app's Claude section talks to any session; a closed one is reopened first.
	app.post("/api/sessions/:id/reopen", (req, res) => {
		const session = find(req, res);
		if (!session) return;
		try {
			session.reopen();
			res.json({ session: session.summary() });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	app.post("/api/sessions/:id/answer", async (req, res) => {
		const session = find(req, res);
		if (!session) return;
		const { requestId, behavior, message, alwaysAllow, answers } = req.body;
		try {
			await session.answer(requestId, { behavior, message, alwaysAllow: Boolean(alwaysAllow), answers });
			res.json({ ok: true });
		} catch (error) {
			res.status(409).json({ error: error.message });
		}
	});

	app.post("/api/sessions/:id/interrupt", async (req, res) => {
		const session = find(req, res);
		if (!session) return;
		await session.interrupt();
		res.json({ ok: true });
	});

	app.post("/api/sessions/:id/close", (req, res) => {
		const session = find(req, res);
		if (!session) return;
		session.close();
		res.json({ ok: true });
	});

	app.delete("/api/sessions/:id", (req, res) => {
		if (!sessions.remove(req.params.id)) return res.status(404).json({ error: "no such session" });
		res.json({ ok: true });
	});

	/** Replays every event after `?after=<seq>`, then streams live ones. */
	app.get("/api/sessions/:id/stream", async (req, res) => {
		const session = find(req, res);
		if (!session) return;
		await session.loadHistory();
		const send = sse(res);
		const after = Number(req.query.after || 0);
		for (const event of session.events) if (event.seq > after) send(null, event);
		send("summary", session.summary());
		const onEvent = (event) => send(null, event);
		const onStatus = () => send("summary", session.summary());
		session.on("event", onEvent);
		session.on("status", onStatus);
		req.on("close", () => {
			session.off("event", onEvent);
			session.off("status", onStatus);
		});
	});
}
