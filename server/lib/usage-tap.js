// D-149: the "usage tap" — one line in the Claude Code status-line script that copies the JSON Claude Code hands it to
// ~/.test-forge/usage.json, so the TestForge shows the same context / 5-hour / weekly figures as the CLI line.
// Opt-in from the Mac app (it asks first); idempotent; marked so it can be found and removed.
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TAP_PATH } from "./usage.js";

export const TAP_MARKER = "# testforge usage tap (D-149)";

/** The script a `statusLine` command runs (`bash /path/x.sh`, `/path/x.sh`, `~/x.sh`), else null. */
export function scriptPathFrom(command, home = homedir()) {
	const match = String(command ?? "").match(/(~?\/[^\s'"]+\.(?:sh|bash|zsh))/);
	return match ? match[1].replace(/^~(?=\/)/, home) : null;
}

/** The script with the tap line after the line that reads stdin; unchanged when already tapped. */
export function withTap(script, tapPath = TAP_PATH) {
	if (script.includes(TAP_MARKER)) return { script, isChanged: false };
	const lines = script.split("\n");
	const readIndex = lines.findIndex((line) => /^\s*\w+=\$\(cat\)\s*$/.test(line));
	if (readIndex === -1) throw new Error("couldn't find where the status-line script reads its input (expected a line like input=$(cat))");
	const variable = lines[readIndex].trim().split("=")[0];
	const tap = `${TAP_MARKER}\nmkdir -p "${tapPath.replace(/\/[^/]+$/, "")}" && printf '%s' "$${variable}" > "${tapPath}.tmp" && mv "${tapPath}.tmp" "${tapPath}"`;
	lines.splice(readIndex + 1, 0, tap);
	return { script: lines.join("\n"), isChanged: true };
}

export async function installTap({ settingsPath = join(homedir(), ".claude", "settings.json"), tapPath = TAP_PATH } = {}) {
	const settings = JSON.parse(await readFile(settingsPath, "utf8"));
	const scriptPath = scriptPathFrom(settings.statusLine?.command);
	if (!scriptPath) throw new Error("Claude Code has no status-line script set (statusLine in ~/.claude/settings.json)");
	const { script, isChanged } = withTap(await readFile(scriptPath, "utf8"), tapPath);
	if (isChanged) await writeFile(scriptPath, script);
	return { scriptPath, isChanged };
}
