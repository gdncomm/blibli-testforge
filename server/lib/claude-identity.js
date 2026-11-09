// Who Claude runs as, and which code its sessions open in — shown in the header so a run can't
// silently use the wrong account or the developer's repo instead of the QA copy (D-045).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { currentManifest, TEST_FORGE_HOME } from "./test-forge-copy.js";

const run = promisify(execFile);
const ACCOUNT_TTL_MS = 60_000;
let cachedAccount = null;
let cachedAt = 0;

/** `claude auth status` — the same account every Claude session this dashboard starts uses. */
export async function claudeAccount({ refresh = false } = {}) {
	if (!refresh && cachedAccount && Date.now() - cachedAt < ACCOUNT_TTL_MS) return cachedAccount;
	try {
		const { stdout } = await run("claude", ["auth", "status"], { timeout: 15_000 });
		const status = JSON.parse(stdout);
		cachedAccount = { loggedIn: Boolean(status.loggedIn), email: status.email ?? null, orgName: status.orgName ?? null, plan: status.subscriptionType ?? null, method: status.authMethod ?? null };
	} catch (error) {
		cachedAccount = { loggedIn: false, error: (error.stderr || error.message || "").trim().split("\n")[0] };
	}
	cachedAt = Date.now();
	return cachedAccount;
}

/** The QA copy "1 · What code?" prepared — its folder, repo, branch and commit. */
export async function testingTarget() {
	const manifest = await currentManifest();
	if (!manifest?.path && !manifest?.repo) return null;
	const projectDir = manifest.path && existsSync(manifest.path) ? manifest.path : null;
	return {
		repo: basename(manifest.repo ?? ""),
		branch: manifest.branch ?? null,
		sha: manifest.sha?.slice(0, 9) ?? null,
		source: manifest.source,
		hasLocalChanges: Boolean(manifest.hasLocalChanges),
		projectDir,
	};
}

/**
 * Folder a new Claude session opens in: the prepared QA copy (its project subfolder when the repo
 * nests one, like BlibliIOSApp-POC/BlibliMobile-iOS), else `fallback`.
 */
export async function sessionProjectDir(fallback) {
	const target = await testingTarget();
	if (!target?.projectDir) return fallback;
	const nested = join(target.projectDir, basename(fallback));
	return existsSync(nested) ? nested : target.projectDir;
}

export { TEST_FORGE_HOME };
