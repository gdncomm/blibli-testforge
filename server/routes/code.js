// Question 1 — "What code?" (workflow-plan §4 ①). Prepare runs as a job so the page shows the
// progress list live and can re-attach after a reload.
import { listProjects } from "../lib/projects.js";
import { currentManifest, listBranches, localDrift, prepareBranch, snapshotLocal } from "../lib/test-forge-copy.js";
import { appendLine, createJob, finishJob } from "../lib/jobs.js";
import { fastForward, fetchOrigin, repoStatus, restoreStash, switchBranch } from "../lib/git-control.js";

/** Only repos the project scan found may be read — every route below runs git against the path. */
async function knownRepo(path) {
	const projects = await listProjects();
	return projects.find((project) => project.path === path) ?? null;
}

export function registerCodeRoutes(app, { isCopyInUse = () => null, testForgeDir = null } = {}) {
	let activePrepare = null;

	app.get("/api/code/repos", async (req, res) => {
		const projects = await listProjects({ refresh: req.query.refresh === "1" });
		res.json({ repos: projects.map(({ name, path, branch, isDirty }) => ({ name, path, branch, isDirty })) });
	});

	app.get("/api/code/branches", async (req, res) => {
		const repo = await knownRepo(String(req.query.repo || ""));
		if (!repo) return res.status(404).json({ error: "unknown repository — pick one from the list" });
		try {
			res.json({ branches: await listBranches(repo.path, { refresh: req.query.refresh === "1" }), checkedAt: new Date().toISOString() });
		} catch (error) {
			res.status(502).json({ error: req.query.refresh === "1" ? "Can't reach GitHub — is the VPN on?" : error.message, detail: error.tail });
		}
	});

	app.get("/api/code/current", async (_req, res) => {
		const manifest = await currentManifest();
		const drift = manifest ? await localDrift(manifest).catch(() => ({ applies: false })) : { applies: false };
		res.json({ manifest, drift });
	});

	/**
	 * Starts preparing the QA copy as a job; `{error, status}` when it can't start. Shared by the
	 * Question 1 button and a saved setup's Run again (P9).
	 */
	async function startPrepare({ source, branch, repo: repoPath }) {
		const repo = await knownRepo(String(repoPath || ""));
		if (!repo) return { status: 404, error: "unknown repository — pick one from the list" };
		if (source !== "github" && source !== "local") return { status: 400, error: "source must be github or local" };
		if (source === "github" && !branch) return { status: 400, error: "pick a branch" };
		// Branch-switch lock: the QA copy can't move while a build or a test is using it.
		const inUse = isCopyInUse();
		if (inUse) return { status: 409, error: `${inUse} — the code can't change until it finishes.` };
		if (activePrepare?.status === "running") return { status: 409, error: "the code is already being prepared", jobId: activePrepare.id };

		const job = createJob({ kind: "prepare", source, repo: repo.path, branch });
		activePrepare = job;
		const controller = new AbortController();
		job.onCancel = () => controller.abort();
		const onLine = (line) => appendLine(job, line);
		const prepare = source === "github"
			? prepareBranch({ repoPath: repo.path, branch, onLine, signal: controller.signal })
			: snapshotLocal({ repoPath: repo.path, onLine, signal: controller.signal });
		prepare.then((manifest) => {
			job.meta.manifest = manifest;
			appendLine(job, `● Ready: ${manifest.branch} @ ${manifest.snapshotId}${manifest.hasLocalChanges ? " (with local changes)" : ""}`);
			finishJob(job, { status: "done", verdict: manifest.snapshotId });
		}).catch((error) => {
			if (job.isCancelled) return finishJob(job, { status: "cancelled", verdict: "CANCELLED" });
			if (error.hint) appendLine(job, `! ${error.hint}`);
			appendLine(job, `! ${error.message}`);
			if (error.tail) error.tail.split("\n").forEach((line) => appendLine(job, `  ${line}`));
			finishJob(job, { status: "error", verdict: error.hint || error.message });
		});
		return { job };
	}

	app.post("/api/code/prepare", async (req, res) => {
		const { job, status, error, jobId } = await startPrepare(req.body ?? {});
		if (error) return res.status(status).json({ error, ...(jobId && { jobId }) });
		res.json({ ok: true, jobId: job.id });
	});

	/** The manifest a finished prepare produced (the SSE stream only carries lines and the verdict). */
	app.get("/api/code/prepare/:jobId", (req, res) => {
		if (activePrepare?.id !== req.params.jobId) return res.status(404).json({ error: "no such prepare" });
		res.json({ status: activePrepare.status, verdict: activePrepare.verdict, manifest: activePrepare.meta.manifest ?? null });
	});

	// --- Git control (D-200): the developer's own working repo ------------------------------------------

	/** Runs one git-control action on a scanned repo; a guarded refusal is a 409 with its `code`, git's own failure a 502. */
	const gitAction = (action) => async (req, res) => {
		const repo = await knownRepo(String(req.query.repo || req.body?.repo || ""));
		if (!repo) return res.status(404).json({ error: "unknown repository — pick one from the list" });
		if (req.method === "POST" && activePrepare?.status === "running") return res.status(409).json({ error: "the code is being prepared — wait for it to finish", code: "preparing" });
		try {
			res.json({ status: await action(repo.path, req.body ?? {}) });
		} catch (error) {
			const body = { error: error.hint ?? error.message, code: error.code ?? null, detail: error.tail ?? null, files: error.files ?? null, stashed: error.stashed ?? null };
			res.status(error.refused ? 409 : 502).json(body);
		}
	};

	app.get("/api/git/status", gitAction((path) => repoStatus(path)));
	app.post("/api/git/fetch", gitAction((path) => fetchOrigin(path)));
	app.post("/api/git/fast-forward", gitAction((path) => fastForward(path)));
	app.post("/api/git/switch", gitAction((path, body) => switchBranch(path, { branch: String(body.branch ?? ""), stash: body.stash === true, testForgeDir })));
	app.post("/api/git/restore-stash", gitAction((path) => restoreStash(path)));

	return { startPrepare };
}
