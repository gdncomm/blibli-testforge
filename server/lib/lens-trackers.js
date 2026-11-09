// D-129 (phase E of docs/networklens-console.md): tracker (TRMS ID) fires from the trace, checked against an optional
// expected-payload contract. A JS port of the test-flow-recorder `extract_trackers.py` the networklens MCP shells out to —
// same collapse, same contract rules, same DA markdown — so the console and `test-forge-lens` need neither Python nor the plugin.
// Pure: works on the records `Trace.entries()` returns (already collapsed by exchange id, last line wins).
import { decodeBody, statusOf } from "./trace.js";

const TRMS_KEY = "trms_id";
const TMS_DETAIL = "https://tracker-management-system.gdn-app.com/tracker-detail/";

/** Session ids in first-seen order; the last one is the most recent launch. */
export function sessionsIn(records) {
	return [...new Set(records.map((record) => record.sessionID).filter(Boolean))];
}

/** TRMS ID → every fire of it, oldest first. `allSessions` false keeps the latest launch only (the usual question). */
export function trackerFires(records, { allSessions = false } = {}) {
	const latest = sessionsIn(records).at(-1);
	const fires = new Map();
	const ordered = [...records].sort((lhs, rhs) => startedAt(lhs) - startedAt(rhs));
	for (const record of ordered) {
		if (!allSessions && latest && record.sessionID !== latest) continue;
		const text = decodeBody(record.exchange.request?.body)?.toString("utf8");
		if (!text?.includes(TRMS_KEY)) continue;
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			continue;
		}
		for (const unit of trackerUnits(parsed)) {
			const payload = isObject(unit.payload) ? unit.payload : {};
			for (const id of trmsIdsIn(unit)) {
				const hits = fires.get(id) ?? [];
				hits.push({
					exchangeId: record.exchange.id,
					endpoint: record.exchange.endpointKey ?? record.exchange.request?.url ?? "?",
					status: Number(statusOf(record.exchange)) || null,
					startedAt: record.exchange.startedAt ?? record.recordedAt,
					event: payload.event ?? null,
					originScreen: payload.origin_screen ?? null,
					body: unit,
				});
				fires.set(id, hits);
			}
		}
	}
	return fires;
}

/**
 * One fire per tracked event: an object whose `payload` holds `trms_id` (`{ app_version, payload: { trms_id, … } }`).
 * `/track-batch` sends many in `events[]`, each wrapped as `{ event, payload: <that object> }` — split, or every ID in
 * the batch would claim the whole body and none would have an event or screen. Anything else stays one fire.
 */
export function trackerUnits(node) {
	const units = [];
	const walk = (value) => {
		if (Array.isArray(value)) return value.forEach(walk);
		if (!isObject(value)) return;
		if (isObject(value.payload) && TRMS_KEY in value.payload) return units.push(value);
		Object.values(value).forEach(walk);
	};
	walk(node);
	return units.length ? units : [node];
}

/** Every `trms_id` at any depth — a nested per-item one is a finding, not something to miss. */
export function trmsIdsIn(node) {
	if (Array.isArray(node)) return node.flatMap(trmsIdsIn);
	if (!isObject(node)) return [];
	return Object.entries(node).flatMap(([key, value]) => {
		const own = key === TRMS_KEY && (typeof value === "string" || typeof value === "number") ? [String(value)] : [];
		return [...own, ...trmsIdsIn(value)];
	});
}

/** Values at a dotted path; `items[]` fans out so one item missing the key is caught. */
export function valuesAt(payload, path) {
	let nodes = [payload];
	for (const segment of path.split(".")) {
		const isFanned = segment.endsWith("[]");
		const key = isFanned ? segment.slice(0, -2) : segment;
		nodes = nodes.flatMap((node) => {
			if (!isObject(node) || !(key in node)) return [];
			const value = node[key];
			return isFanned ? (Array.isArray(value) ? value : [value]) : [value];
		});
		if (!nodes.length) return [];
	}
	return nodes;
}

/** Everything wrong with one fire against its rule `{ event?, origin_screen?, required?: [path], expect?: { path: value } }`. */
export function contractProblems(hit, rule) {
	if (!rule) return [];
	const payload = isObject(hit.body?.payload) ? hit.body.payload : {};
	const problems = [];
	if (rule.event && hit.event !== rule.event) problems.push(`event is \`${hit.event || "—"}\`, expected \`${rule.event}\``);
	if (rule.origin_screen && payload.origin_screen !== rule.origin_screen) {
		problems.push(`origin_screen is \`${payload.origin_screen || "—"}\`, expected \`${rule.origin_screen}\``);
	}
	for (const path of rule.required ?? []) {
		const values = valuesAt(payload, path);
		if (!values.length) problems.push(`missing \`${path}\``);
		else if (values.some(isBlank)) problems.push(`\`${path}\` is empty`);
	}
	for (const [path, wanted] of Object.entries(rule.expect ?? {})) {
		const values = valuesAt(payload, path);
		if (!values.length) problems.push(`missing \`${path}\` (expected \`${wanted}\`)`);
		else if (values.some((value) => !sameValue(value, wanted))) problems.push(`\`${path}\` is \`${values[0]}\`, expected \`${wanted}\``);
	}
	return problems;
}

/**
 * The console's view: one row per ID (expected ones in order, or everything that fired), plus missing / unexpected.
 * A non-2xx fire is counted apart — the collector rejected it, so it did not really land.
 */
export function trackerSummary(fires, { ids = [], contracts = {} } = {}) {
	const fired = [...fires.keys()].filter((id) => fires.get(id)?.length);
	const expected = ids.length ? ids : [...fired].sort();
	const rows = expected.map((id) => {
		const hits = fires.get(id) ?? [];
		const last = hits.at(-1);
		return {
			id,
			count: hits.length,
			rejected: hits.filter((hit) => !hit.status || hit.status < 200 || hit.status >= 300).length,
			event: last?.event ?? null,
			endpoint: last?.endpoint ?? null,
			status: last?.status ?? null,
			originScreen: last?.originScreen ?? null,
			lastFiredAt: last?.startedAt ?? null,
			problems: groupedProblems(hits, contracts[id]),
		};
	});
	return {
		expected: ids,
		rows,
		missing: ids.filter((id) => !fires.get(id)?.length),
		unexpected: ids.length ? fired.filter((id) => !ids.includes(id)) : [],
		contractIdsNotListed: ids.length ? Object.keys(contracts).filter((id) => !ids.includes(id)) : [],
	};
}

/** One ID's fires, newest first, with payloads — what the detail pane shows. */
export function trackerDetail(fires, id, rule) {
	const hits = fires.get(id) ?? [];
	return {
		id,
		fires: [...hits].reverse().map((hit) => ({
			exchangeId: hit.exchangeId,
			endpoint: hit.endpoint,
			status: hit.status,
			startedAt: hit.startedAt,
			event: hit.event,
			originScreen: hit.originScreen,
			problems: contractProblems(hit, rule),
			payload: JSON.stringify(hit.body, null, 2),
		})),
	};
}

/** The DA-format tracker validation page, same layout as `extract_trackers.py --format markdown`. */
export function trackerMarkdown(fires, { ids = [], contracts = {}, provenance = {}, platform = "iOS" } = {}) {
	const expected = ids.length ? ids : [...fires.keys()].sort();
	const hit = expected.filter((id) => fires.get(id)?.length);
	const missed = expected.filter((id) => !fires.get(id)?.length);
	const unexpected = [...fires.keys()].filter((id) => !expected.includes(id));
	const versions = [...new Set([...fires.values()].flat().map((one) => one.body?.app_version).filter(Boolean))].sort();
	const link = (id) => `[${id}](${TMS_DETAIL}${id})`;
	const invalid = hit.filter((id) => groupedProblems(fires.get(id), contracts[id]).length);

	const lines = ["# Trackers Validation", "", "| | |", "|---|---|", `| **Trackers** | ${expected.map(link).join(", ")} |`];
	for (const [label, value] of Object.entries(provenance)) lines.push(`| **${label}** | ${value} |`);
	lines.push("", `## ${platform}`, "", `Validated in **${versions.join(", ") || "<build_no>"}**`, "");
	lines.push(`${hit.length} of ${expected.length} trackers fired.`
		+ (missed.length ? ` Not seen: ${missed.map((id) => `\`${id}\``).join(", ")}` : "")
		+ (invalid.length ? ` Fired with payload problems: ${invalid.map((id) => `\`${id}\``).join(", ")}` : ""), "");
	lines.push("|  | **Event Name** | **Tracker Contract** | **Trigger point** | **Design** | **Sample Response** | **Tracker Payload** | **Status** | **DA Feedback** |");
	lines.push("|---|---|---|---|---|---|---|---|---|");
	expected.forEach((id, index) => {
		const hits = fires.get(id) ?? [];
		if (!hits.length) {
			lines.push(`| ${index + 1} | — | ${link(id)} | — |  |  | **Not fired in this session** | Need fix |  |`);
			return;
		}
		const [first] = hits;
		const payload = isObject(first.body?.payload) ? first.body.payload : {};
		const repeats = hits.length > 1 ? `<br><br>_Fired ${hits.length}× this session; first shown._` : "";
		const problems = groupedProblems(hits, contracts[id]);
		const status = problems.length ? `**Need fix**<br>${problems.join("<br>")}` : "Valid";
		lines.push(`| ${index + 1} | **${first.event || "—"}** | ${link(id)} | ${triggerPoint(payload)} |  |  `
			+ `| \`${first.endpoint}\` → HTTP ${first.status}<br><br>${cellJson(first.body)}${repeats} | ${status} |  |`);
	});
	lines.push("", "_Trigger points are derived from the payload and need a human check. Design and Sample Response are left blank — "
		+ "images and API responses are not in the tracker request._", "");
	if (unexpected.length) {
		lines.push("## Fired but not on the list", "", "Not a failure on its own, but an ID nobody asked to validate is worth a look.", "",
			"| TRMS ID | Event | Fires | Origin screen |", "|---|---|---|---|");
		for (const id of unexpected) {
			const hits = fires.get(id);
			const screens = [...new Set(hits.map((one) => one.originScreen).filter(Boolean))].sort();
			lines.push(`| ${link(id)} | \`${hits[0].event || "—"}\` | ${hits.length} | ${screens.join(", ") || "—"} |`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

/** The same missing key on six impressions is one bug: grouped by problem, naming which fires (1-based). */
function groupedProblems(hits, rule) {
	if (!rule || !hits?.length) return [];
	const grouped = new Map();
	hits.forEach((hit, index) => {
		for (const problem of contractProblems(hit, rule)) grouped.set(problem, [...(grouped.get(problem) ?? []), index + 1]);
	});
	return [...grouped].map(([problem, where]) => (hits.length === 1
		? problem
		: `${problem} (fire${where.length > 1 ? "s" : ""} ${where.join(", ")})`));
}

/** A guess from what the payload names itself by — the trace shows what was sent, never what was tapped. */
function triggerPoint(payload) {
	const screen = payload.origin_screen || "—";
	if (payload.button_name) return `On click/view ${payload.button_name} in ${screen}`;
	if (payload.section_name) return `On view ${payload.section_name} section in ${screen}`;
	if (payload.cp1) return `On view ${payload.cp1} section in ${screen}`;
	const promotion = Array.isArray(payload.items) ? payload.items[0]?.promotion_name : null;
	if (promotion) return `On view promotion ${promotion} in ${screen}`;
	return payload.component ? `On ${payload.event ?? "event"} of ${payload.component} in ${screen}` : `In ${screen}`;
}

/** JSON in a markdown table cell: newlines → `<br>`, indentation → `&nbsp;`, pipes escaped. */
function cellJson(value) {
	return JSON.stringify(value, null, 2).replace(/\|/g, "\\|").split("\n")
		.map((line) => "&nbsp;".repeat(line.length - line.trimStart().length) + line.trimStart())
		.join("<br>");
}

function startedAt(record) {
	return Date.parse(record.exchange.startedAt ?? record.recordedAt) || 0;
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Empty fails like missing — the app sends "" far more often than it drops the key. */
function isBlank(value) {
	return value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)
		|| (isObject(value) && !Object.keys(value).length);
}

function sameValue(lhs, rhs) {
	return JSON.stringify(lhs) === JSON.stringify(rhs);
}
