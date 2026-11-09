#!/usr/bin/env node
// TestForge guard for Remote Control sessions (TestForge D-150). A session the TestForge started carries
// TEST_FORGE_REMOTE=1; anywhere else this hook does nothing. It keeps the TestForge's rules when QA is driven from the
// Claude mobile app: the production test-case page is never written, and pushing, building for testing or erasing a
// simulator always asks the person first (the approval arrives on their phone).
import { readFileSync } from "node:fs";

if (process.env.TEST_FORGE_REMOTE !== "1") process.exit(0);

/** Mirrors PROTECTED_CONFLUENCE_PAGES in tools/test-forge-server/lib/permissions.js. */
const PROTECTED_CONFLUENCE_PAGES = ["2396520535"];
const CONFLUENCE_WRITE = /^mcp__.*(atlassian|Atlassian).*__(update|create).*Confluence/;
const ASK_COMMANDS = [
	[/\bgit\s+push\b/, "Pushing leaves this Mac — confirm you want it"],
	[/\bxcodebuild\b[^\n]*\bbuild-for-testing\b/, "A build for testing takes 15–25 min and uses the QA simulator — the TestForge only builds when asked"],
	[/\bsimctl\s+erase\b/, "Erasing a simulator deletes its apps and data"],
];

let input = {};
try {
	input = JSON.parse(readFileSync(0, "utf8"));
} catch {
	process.exit(0);
}
const toolName = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};

function decide(permissionDecision, reason) {
	process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason: reason } }));
	process.exit(0);
}

if (CONFLUENCE_WRITE.test(toolName)) {
	const hit = PROTECTED_CONFLUENCE_PAGES.find((pageId) => JSON.stringify(toolInput).includes(pageId));
	if (hit) decide("deny", `Confluence page ${hit} is a production document — TestForge never edits or comments on it.`);
}
if (toolName === "Bash") {
	const command = String(toolInput.command ?? "");
	for (const [pattern, reason] of ASK_COMMANDS) if (pattern.test(command)) decide("ask", reason);
}
process.exit(0);
