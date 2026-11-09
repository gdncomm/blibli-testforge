// D-127 (phase A): captured calls for the console and `test-forge-lens` — list rows, one call's detail, and a curl command a
// backend developer can paste. Pure: works on the records `Trace.entries()` returns.
import { decodeBody, durationMs, preview, statusOf } from "./trace.js";

const BODY_PREVIEW_CHARS = 20_000;

/** Newest first; `grep` matches the URL (case-insensitive), `limit` caps the rows. */
export function callRows(records, { grep = "", limit = 50 } = {}) {
	const needle = String(grep).toLowerCase();
	return records
		.filter((record) => !needle || String(record.exchange.request?.url ?? "").toLowerCase().includes(needle))
		.sort((lhs, rhs) => new Date(rhs.recordedAt).getTime() - new Date(lhs.recordedAt).getTime())
		.slice(0, limit)
		.map((record) => ({
			id: record.exchange.id,
			method: record.exchange.request?.method ?? "?",
			url: record.exchange.request?.url ?? "?",
			status: statusOf(record.exchange),
			durationMs: durationMs(record.exchange),
			isMocked: isMocked(record.exchange),
			recordedAt: record.recordedAt,
		}));
}

/** NetworkLens marks a served mock as `isMockServed` with `source: { mocked: {} }` (`{ network: {} }` otherwise). */
export function isMocked(exchange) {
	return Boolean(exchange?.isMockServed || exchange?.source?.mocked);
}

export function callDetail(record) {
	const { exchange } = record;
	return {
		id: exchange.id,
		method: exchange.request?.method ?? "?",
		url: exchange.request?.url ?? "?",
		status: statusOf(exchange),
		durationMs: durationMs(exchange),
		isMocked: isMocked(exchange),
		recordedAt: record.recordedAt,
		requestHeaders: exchange.request?.headers ?? {},
		responseHeaders: exchange.response?.headers ?? {},
		requestBody: bodyText(exchange.request?.body),
		responseBody: bodyText(exchange.response?.body),
		curl: curlCommand(exchange),
	};
}

/** The response as a mock source: status code and raw body bytes. */
export function responseOf(record) {
	const decoded = decodeBody(record.exchange.response?.body);
	return { statusCode: Number(statusOf(record.exchange)) || 200, body: decoded ?? Buffer.from("") };
}

/** Single-quoted for zsh/bash; redacted values stay redacted (NetworkLens redacts before anything is stored). */
export function curlCommand(exchange) {
	const request = exchange?.request ?? {};
	const quote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
	const parts = ["curl", "-X", request.method ?? "GET", quote(request.url ?? "")];
	for (const [name, value] of Object.entries(request.headers ?? {})) parts.push("-H", quote(`${name}: ${value}`));
	const body = decodeBody(request.body);
	if (body?.length) parts.push("--data-raw", quote(body.toString("utf8")));
	return parts.join(" ");
}

function bodyText(raw) {
	const decoded = decodeBody(raw);
	if (!decoded) return null;
	const text = decoded.toString("utf8");
	// Protobuf, images, gzip: not text — say so instead of printing bytes.
	if (text.includes("\uFFFD") || /[\u0000-\u0008\u000E-\u001F]/.test(text)) return `(binary body, ${decoded.length} bytes)`;
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return preview(text, BODY_PREVIEW_CHARS);
	}
}
