#!/usr/bin/env node
// test-forge-fuzz — generate NetworkLens mock variants from a Swift Decodable model's field list (D-155):
// one variant per optional field absent, each enum case, an unknown enum value, an empty array —
// instead of hand-authoring them. Standalone: reads/writes local files directly, no dashboard server
// involved (TEST_FORGE_PROJECT_DIR points at a detached QA clone, D-032 — routing this through the server
// would risk fuzzing a stale copy of whatever Swift file you're actually editing). Run it from
// inside whichever checkout (dev or QA) you want fuzzed.
//
//   test-forge-fuzz fields --type <Name> [--file <path>] [--root .]
//   test-forge-fuzz generate --type <Name> --pack <path> [--baseline loaded] [--file <path>] [--root .]
//                      [--endpoint "<METHOD /path>"] [--rule-id <id>] [--at <dotPath>]
//                      [--out <path>] [--dry-run] [--json]

import { runFields, runGenerate, realDeps } from "../lib/model-fuzz-io.js";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map();
for (let index = 0; index < rest.length; index++) {
	const word = rest[index];
	if (!word.startsWith("--")) continue;
	const next = rest[index + 1];
	const hasValue = next !== undefined && !next.startsWith("--");
	flags.set(word.slice(2), hasValue ? next : true);
	if (hasValue) index++;
}

function printFieldTable(fields) {
	const header = ["field", "kind", "json key", "", "note"];
	const rows = fields.map((field) => [
		field.name,
		field.kind + (field.isArray ? "[]" : ""),
		field.jsonKey ?? "—",
		field.isOptional === null ? "" : field.isOptional ? "optional" : "required",
		field.skipReason ?? "",
	]);
	const widths = header.map((head, index) => Math.max(head.length, ...rows.map((row) => String(row[index]).length)));
	const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ").trimEnd();
	process.stdout.write(`${line(header)}\n`);
	for (const row of rows) process.stdout.write(`${line(row)}\n`);
}

async function main() {
	if (command === "fields") {
		if (!flags.get("type")) throw new Error("usage: test-forge-fuzz fields --type <Name> [--file <path>] [--root .]");
		const result = await runFields({ type: flags.get("type"), file: flags.get("file"), root: flags.get("root") }, realDeps());
		if (flags.has("json")) return result;
		process.stdout.write(`${result.swiftPath}\n\n`);
		printFieldTable(result.fields);
		return undefined;
	}

	if (command === "generate") {
		if (!flags.get("type") || !flags.get("pack")) {
			throw new Error('usage: test-forge-fuzz generate --type <Name> --pack <path> [--baseline loaded] [--file <path>] [--root .]'
				+ ' [--endpoint "<METHOD /path>"] [--rule-id <id>] [--at <dotPath>] [--out <path>] [--dry-run] [--json]');
		}
		const result = await runGenerate({
			type: flags.get("type"),
			file: flags.get("file"),
			root: flags.get("root"),
			pack: flags.get("pack"),
			baseline: flags.get("baseline"),
			endpoint: flags.get("endpoint"),
			ruleId: flags.get("rule-id"),
			at: flags.get("at"),
			out: flags.get("out"),
			dryRun: flags.has("dry-run"),
		}, realDeps());
		if (flags.has("json")) return result;
		process.stdout.write(`${result.swiftPath}\n\n`);
		printFieldTable(result.fields);
		process.stdout.write(`\n${result.fields.length} field(s) processed, ${result.written.length} variant(s) `
			+ `${result.dryRun ? "would be written to" : "written to"} ${result.outPath}\n`);
		process.stdout.write(`Untouched: ${result.untouched.join(", ")}\n`);
		return undefined;
	}

	throw new Error("commands: fields --type <Name> · generate --type <Name> --pack <path>");
}

main().then(
	(value) => {
		if (value !== undefined) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
	},
	(error) => {
		process.stderr.write(`test-forge-fuzz: ${error.message}\n`);
		process.exit(1);
	},
);
