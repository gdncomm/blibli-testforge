// Turns a parsed Decodable field list (lib/swift-decodable.js) plus one existing NetworkLens pack
// variant into a set of field-mutation variants — one per contract edge the model allows
// (field absent, empty array, each enum case, an enum value matching no known case) — and merges
// them into the pack, touching only variants this module generated before (D-155). No field-level
// mutation primitive existed anywhere in this codebase prior to this: every other tool (screen-sweep,
// `lens_set_variant_body`, `derive: "empty"|"500"`) treats a response body as one opaque blob.
import { newID, step } from "./variants.js";

const GENERATED_PREFIX = "fuzz-";
const UNKNOWN_ENUM_VALUE = "__TestForge_FUZZ_UNKNOWN__";

function slug(value) {
	return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}

function isCandidateObject(value, wireKeys) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const present = Object.keys(value).filter((key) => wireKeys.has(key)).length;
	return present >= Math.max(2, Math.ceil(wireKeys.size / 2));
}

export function readAtPath(root, path) {
	if (!path) return root;
	return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), root);
}

export function writeAtPath(root, path, value) {
	const clone = structuredClone(root);
	if (!path) return value;
	const keys = path.split(".");
	let cursor = clone;
	for (let i = 0; i < keys.length - 1; i++) cursor = cursor[keys[i]];
	cursor[keys[keys.length - 1]] = value;
	return clone;
}

/**
 * Where instances of the target struct live inside a baseline body. The body itself, then its
 * `data` field (an envelope is the common real shape — `{code, status, data: [...]}`), then a
 * breadth-first search of its own keys to depth 3. `atPath` (a dot path) skips the search entirely.
 * Throws when the search finds zero or more than one place that looks right, listing what it found
 * so the caller can pass `--at` instead of guessing.
 */
export function locateInstances(bodyJson, fields, atPath) {
	const wireKeys = new Set(fields.filter((field) => field.jsonKey).map((field) => field.jsonKey));
	if (atPath !== undefined && atPath !== null) {
		const value = readAtPath(bodyJson, atPath);
		if (value === undefined) throw new Error(`no value at path "${atPath}"`);
		return { path: atPath, kind: Array.isArray(value) ? "array" : "single" };
	}
	if (isCandidateObject(bodyJson, wireKeys)) return { path: "", kind: "single" };
	const data = bodyJson && typeof bodyJson === "object" ? bodyJson.data : undefined;
	if (Array.isArray(data) && data.length && isCandidateObject(data[0], wireKeys)) return { path: "data", kind: "array" };
	if (isCandidateObject(data, wireKeys)) return { path: "data", kind: "single" };

	const found = [];
	const queue = [{ value: bodyJson, path: "", depth: 0 }];
	while (queue.length) {
		const { value, path, depth } = queue.shift();
		if (depth > 3) continue;
		if (Array.isArray(value)) {
			if (value.length && isCandidateObject(value[0], wireKeys)) found.push({ path, kind: "array" });
			else value.forEach((item, index) => queue.push({ value: item, path: path ? `${path}.${index}` : String(index), depth: depth + 1 }));
		} else if (value && typeof value === "object") {
			if (isCandidateObject(value, wireKeys)) found.push({ path, kind: "single" });
			else for (const [key, nested] of Object.entries(value)) queue.push({ value: nested, path: path ? `${path}.${key}` : key, depth: depth + 1 });
		}
	}
	if (found.length === 1) return found[0];
	const topKeys = bodyJson && typeof bodyJson === "object" ? Object.keys(bodyJson).join(", ") : "(not an object)";
	if (found.length === 0) throw new Error(`couldn't find where these fields live in this body — pass --at <dotPath>. Top-level keys: ${topKeys}`);
	throw new Error(`more than one place in this body looks right: ${found.map((entry) => entry.path || "(root)").join(", ")} — pass --at <dotPath> to pick one`);
}

/** Applies `mutateOne` to every instance at `located.path` (not just the first), so the render
 *  difference a variant proves is never masked by other, untouched rows. */
function withMutatedInstances(bodyJson, located, mutateOne) {
	const current = readAtPath(bodyJson, located.path);
	const mutated = located.kind === "array" ? current.map((item) => mutateOne({ ...item })) : mutateOne({ ...current });
	return writeAtPath(bodyJson, located.path, mutated);
}

/** The baseline variant's body (decoded), status/headers/delay/exhaustion — everything a generated
 *  variant copies through unchanged except the body. */
export function decodeBaselineVariant(rule, baselineName) {
	const variant = rule.variants.find((entry) => entry.name === baselineName);
	if (!variant) throw new Error(`no variant named "${baselineName}" on this rule. Variants: ${rule.variants.map((entry) => entry.name).join(", ")}`);
	const step = variant.steps[0];
	if (!step?.respond) {
		const kinds = variant.steps.map((entry) => Object.keys(entry)[0]).join(", ");
		throw new Error(`variant "${baselineName}" doesn't respond with a body (steps: ${kinds}) — pick one that does, e.g. --baseline loaded`);
	}
	const { body, statusCode, headers, delay } = step.respond._0;
	let bodyJson;
	try {
		bodyJson = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
	} catch (error) {
		throw new Error(`variant "${baselineName}"'s body isn't JSON: ${error.message}`);
	}
	return { bodyJson, statusCode, headers, delay, exhaustion: variant.exhaustion };
}

/**
 * One generated NetworkLens variant per field mutation: the field removed (every field with a
 * resolved `jsonKey` — `"unparsed"` fields are skipped, their key isn't trustworthy), the field
 * emptied (arrays, in addition to removed), one per enum case plus one unknown-value case (enum
 * fields only). A mutation targets `field.jsonKey`, never `field.name` — a property whose
 * `CodingKeys` wire key differs from its Swift name (e.g. `isTimeBased` -> `timeBased`) would
 * otherwise produce a "missing" variant that doesn't actually remove anything.
 */
export function generateFieldVariants(fields, bodyJson, located, baseline) {
	const makeVariant = (name, mutatedBody) => ({
		id: newID(),
		name,
		steps: [step({ bodyBytes: Buffer.from(JSON.stringify(mutatedBody), "utf8"), statusCode: baseline.statusCode, headers: baseline.headers, delay: baseline.delay })],
		exhaustion: baseline.exhaustion,
	});
	const variants = [];
	for (const field of fields) {
		if (!field.jsonKey) continue;
		const key = field.jsonKey;
		variants.push(makeVariant(`${GENERATED_PREFIX}missing-${field.name}`, withMutatedInstances(bodyJson, located, (instance) => {
			delete instance[key];
			return instance;
		})));
		if (field.isArray) {
			variants.push(makeVariant(`${GENERATED_PREFIX}empty-${field.name}`, withMutatedInstances(bodyJson, located, (instance) => {
				instance[key] = [];
				return instance;
			})));
		}
		if (field.kind === "enum" && field.enumCases?.length) {
			for (const enumCase of field.enumCases) {
				variants.push(makeVariant(`${GENERATED_PREFIX}enum-${field.name}-${slug(enumCase.raw)}`, withMutatedInstances(bodyJson, located, (instance) => {
					instance[key] = enumCase.raw;
					return instance;
				})));
			}
			variants.push(makeVariant(`${GENERATED_PREFIX}enum-${field.name}-unknown-value`, withMutatedInstances(bodyJson, located, (instance) => {
				instance[key] = UNKNOWN_ENUM_VALUE;
				return instance;
			})));
		}
	}
	return variants;
}

/** The one rule `generate` targets: the pack's only rule (optionally checked against `endpointKey`),
 *  or a rule picked by `endpointKey`/`ruleId` when the pack holds more than one. */
export function selectRule(pack, { endpointKey, ruleId } = {}) {
	const mocks = pack.mocks ?? [];
	if (ruleId) {
		const rule = mocks.find((entry) => entry.id === ruleId);
		if (!rule) throw new Error(`no rule with id "${ruleId}" in this pack`);
		return rule;
	}
	if (mocks.length === 1) {
		if (endpointKey && mocks[0].endpointKey !== endpointKey) {
			throw new Error(`this pack's only rule is for "${mocks[0].endpointKey}", not "${endpointKey}"`);
		}
		return mocks[0];
	}
	const endpoints = mocks.map((entry) => entry.endpointKey).join(", ");
	if (!endpointKey) throw new Error(`this pack has ${mocks.length} rules — pass --endpoint or --rule-id. Endpoints: ${endpoints}`);
	const matches = mocks.filter((entry) => entry.endpointKey === endpointKey);
	if (matches.length === 0) throw new Error(`no rule for "${endpointKey}" in this pack. Endpoints: ${endpoints}`);
	if (matches.length > 1) throw new Error(`more than one rule for "${endpointKey}" — pass --rule-id to pick one`);
	return matches[0];
}

/**
 * Appends/replaces `generatedVariants` into the selected rule's `variants`, touching only variants
 * previously generated by this tool (name starts with `fuzz-`): a recurring name reuses its old id
 * (so a tester's `activeVariantID` pointing at a regenerated variant never dangles), a new name gets
 * a fresh one. Every hand-authored/standard variant, and every other field on the rule/pack
 * (`activeVariantID`, `isEnabled`, `match`, `name`, `notes`, `createdAt`, `scenarios`), passes
 * through byte-identical.
 */
export function mergeGeneratedVariants(pack, selector, generatedVariants) {
	const rule = selectRule(pack, selector);
	const oldGenerated = new Map(rule.variants.filter((entry) => entry.name.startsWith(GENERATED_PREFIX)).map((entry) => [entry.name, entry]));
	const keep = rule.variants.filter((entry) => !entry.name.startsWith(GENERATED_PREFIX));
	const placed = generatedVariants.map((entry) => {
		const existing = oldGenerated.get(entry.name);
		return existing ? { ...entry, id: existing.id } : entry;
	});
	const updatedRule = { ...rule, variants: [...keep, ...placed] };
	return { ...pack, mocks: pack.mocks.map((entry) => (entry.id === rule.id ? updatedRule : entry)) };
}
