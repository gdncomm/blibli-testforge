// Local git repositories the dashboard can open Claude in. Depth-bounded scan (D-020): a recursive
// walk of ~/Projects would crawl every node_modules and DerivedData folder.
import { execFile } from "node:child_process";
import { existsSync, globSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const CACHE_MS = 30_000;
let cache = null;

function roots() {
	const configured = process.env.TEST_FORGE_PROJECT_ROOTS?.split(":").filter(Boolean);
	return configured?.length ? configured : [join(homedir(), "Projects")];
}

async function git(dir, args) {
	try {
		const { stdout } = await run("git", ["-C", dir, ...args], { timeout: 5000 });
		return stdout.trim();
	} catch {
		return "";
	}
}

/** Folders inside a repo where Claude should start: the root, plus any direct child that carries
 *  its own CLAUDE.md or .claude (e.g. BlibliMobile-iOS inside BlibliIOSApp-POC). */
function workspacesOf(repoDir) {
	const children = globSync("*/{CLAUDE.md,.claude}", { cwd: repoDir }).map((hit) => join(repoDir, dirname(hit)));
	return [repoDir, ...new Set(children)].map((dir) => ({ dir, label: dir === repoDir ? "(repo root)" : relative(repoDir, dir) }));
}

async function describe(repoDir) {
	const [branch, status] = await Promise.all([
		git(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
		git(repoDir, ["status", "--porcelain", "--untracked-files=no"]),
	]);
	return {
		id: repoDir,
		name: basename(repoDir),
		path: repoDir,
		branch,
		isDirty: Boolean(status),
		workspaces: workspacesOf(repoDir),
	};
}

export async function listProjects({ refresh = false } = {}) {
	if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.projects;
	const repoDirs = new Set();
	for (const root of roots()) {
		if (!existsSync(root)) continue;
		for (const pattern of ["*/.git", "*/*/.git"]) {
			for (const hit of globSync(pattern, { cwd: root })) repoDirs.add(join(root, dirname(hit)));
		}
	}
	const projects = await Promise.all([...repoDirs].map(describe));
	projects.sort((a, b) => a.name.localeCompare(b.name));
	cache = { at: Date.now(), projects };
	return projects;
}

/** True only for a folder the scan returned — the open-terminal / reveal routes run commands on it. */
export async function isKnownWorkspace(dir) {
	const projects = await listProjects();
	return projects.some((project) => project.workspaces.some((workspace) => workspace.dir === dir));
}

export async function openInTerminal(dir) {
	const shellPath = `'${dir.replace(/'/g, "'\\''")}'`;
	const command = `cd ${shellPath} && claude`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	await run("osascript", ["-e", `tell application "Terminal" to do script "${command}"`, "-e", 'tell application "Terminal" to activate']);
}

export async function revealInFinder(dir) {
	await run("open", ["-R", dir]);
}
