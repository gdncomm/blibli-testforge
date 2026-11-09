// Thin I/O boundary for lib/model-fuzz.js + lib/swift-decodable.js (D-155): resolves a type name to
// its declaring file, reads the Swift source and the pack JSON, and writes the merged pack back
// atomically. Deliberately has no HTTP route and no dependency on the dashboard server's
// `TEST_FORGE_PROJECT_DIR` — that env var points at a detached QA clone (D-032: the developer's own working
// tree must never be read by the running server), so routing this through the server would risk
// silently fuzzing a stale copy of whatever Swift file someone is actively editing. This module
// resolves every path relative to wherever it's invoked from instead.
import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseDecodableFields } from "./swift-decodable.js";
import { locateInstances, decodeBaselineVariant, generateFieldVariants, mergeGeneratedVariants, selectRule } from "./model-fuzz.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "DerivedData", "build", ".build", "Pods", "Carthage"]);

async function walkSwiftFiles(root) {
	const out = [];
	async function walk(dir) {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (entry.name.endsWith(".swift")) out.push(full);
		}
	}
	await walk(root);
	return out;
}

/** The real filesystem, for the CLI. Tests inject a fake `deps` instead. */
export function realDeps() {
	return {
		readFile: (path, encoding) => readFile(path, encoding),
		writeFile: (path, data, encoding) => writeFile(path, data, encoding),
		rename: (from, to) => rename(from, to),
		findDeclaringFile: async (typeName, root = ".") => {
			const pattern = new RegExp(`\\b(?:struct|class|enum)\\s+${typeName}\\b`);
			const matches = [];
			for (const file of await walkSwiftFiles(root)) {
				const text = await readFile(file, "utf8").catch(() => "");
				if (pattern.test(text)) matches.push(file);
			}
			return matches;
		},
	};
}

async function resolveSwiftFile({ type, file, root }, deps) {
	if (file) return file;
	const matches = await deps.findDeclaringFile(type, root ?? ".");
	if (matches.length === 0) {
		throw new Error(`no file under "${root ?? "."}" declares a struct/class/enum named "${type}" — pass --file,`
			+ ` or resolve it first with the repo-index skill ("symbol query decl ${type}")`);
	}
	if (matches.length > 1) throw new Error(`more than one file declares "${type}": ${matches.join(", ")} — pass --file to pick one`);
	return matches[0];
}

/** `test-forge-fuzz fields` — parser-only preview, touches no pack file. */
export async function runFields(options, deps) {
	const swiftPath = await resolveSwiftFile(options, deps);
	const source = await deps.readFile(swiftPath, "utf8");
	const fields = parseDecodableFields(source, options.type);
	return { swiftPath, fields };
}

const fieldSummary = ({ name, jsonKey, kind, isOptional, isArray, swiftType, skipReason }) => ({ name, jsonKey, kind, isOptional, isArray, swiftType, skipReason });

/** `test-forge-fuzz generate` — the full pipeline: parse, locate, generate, merge, write (unless `dryRun`). */
export async function runGenerate(options, deps) {
	const { type, pack, baseline = "loaded", endpoint, ruleId, at, out, dryRun } = options;
	const swiftPath = await resolveSwiftFile(options, deps);
	const source = await deps.readFile(swiftPath, "utf8");
	const fields = parseDecodableFields(source, type);

	const packJson = JSON.parse(await deps.readFile(pack, "utf8"));
	const rule = selectRule(packJson, { endpointKey: endpoint, ruleId });
	const { bodyJson, statusCode, headers, delay, exhaustion } = decodeBaselineVariant(rule, baseline);
	const located = locateInstances(bodyJson, fields, at);
	const generated = generateFieldVariants(fields, bodyJson, located, { statusCode, headers, delay, exhaustion });
	const mergedPack = mergeGeneratedVariants(packJson, { ruleId: rule.id }, generated);

	const outPath = out ?? pack;
	if (!dryRun) {
		const temporary = `${outPath}.tmp-${process.pid}`;
		await deps.writeFile(temporary, `${JSON.stringify(mergedPack, null, 2)}\n`, "utf8");
		await deps.rename(temporary, outPath);
	}

	const updatedRule = mergedPack.mocks.find((entry) => entry.id === rule.id);
	return {
		swiftPath,
		packPath: pack,
		outPath,
		fields: fields.map(fieldSummary),
		written: generated.map((entry) => entry.name),
		untouched: updatedRule.variants.filter((entry) => !entry.name.startsWith("fuzz-")).map((entry) => entry.name),
		dryRun: Boolean(dryRun),
	};
}
