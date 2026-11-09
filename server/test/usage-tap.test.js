// D-149: the tap line goes right after the status-line script reads stdin, once, and names the script's own variable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TAP_MARKER, scriptPathFrom, withTap } from "../lib/usage-tap.js";

const script = "#!/usr/bin/env bash\n\ninput=$(cat)\n\necho \"$input\" | jq .\n";

test("inserts the tap after the stdin read, using the script's variable", () => {
	const { script: tapped, isChanged } = withTap(script, "/Users/me/.test-forge/usage.json");
	assert.equal(isChanged, true);
	const lines = tapped.split("\n");
	const read = lines.indexOf("input=$(cat)");
	assert.equal(lines[read + 1], TAP_MARKER);
	assert.match(lines[read + 2], /printf '%s' "\$input" > "\/Users\/me\/\.test-forge\/usage\.json\.tmp" && mv/);
	assert.match(lines[read + 2], /mkdir -p "\/Users\/me\/\.test-forge"/);
});

test("is idempotent", () => {
	const once = withTap(script, "/t/usage.json").script;
	const twice = withTap(once, "/t/usage.json");
	assert.equal(twice.isChanged, false);
	assert.equal(twice.script, once);
});

test("refuses a script that doesn't read stdin into a variable", () => {
	assert.throws(() => withTap("#!/bin/bash\necho hi\n"), /couldn't find where/);
});

test("finds the script path in the statusLine command", () => {
	assert.equal(scriptPathFrom("bash /Users/me/.claude/statusline-command.sh"), "/Users/me/.claude/statusline-command.sh");
	assert.equal(scriptPathFrom("~/.claude/s.sh", "/Users/me"), "/Users/me/.claude/s.sh");
	assert.equal(scriptPathFrom("npx ccstatusline"), null);
});
