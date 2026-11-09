// Live Claude usage (D-076, D-077): the same figures the Claude Code CLI status line shows — context
// used, the 5-hour and weekly limits and when they reset.
//
// Source 1: every headless Claude run the dashboard starts streams a `rate_limit_event` whose
// `unifiedWindows` carry both windows (`utilization` 0–1, `resetsAt` epoch s), status "allowed" or not.
// Context used comes from the run's own token counts and its model's `contextWindow`.
// Source 2 (optional): the "usage tap" — the status line command's stdin JSON copied to a file — for
// when no dashboard run has happened lately. The newer of the two wins.
import { EventEmitter } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** `TEST_FORGE_USAGE_TAP` points a test server at its own file (D-149). */
export const TAP_PATH = process.env.TEST_FORGE_USAGE_TAP || join(homedir(), ".test-forge", "usage.json");
const FIVE_HOURS_S = 5 * 3600;
const WEEK_S = 7 * 86400;
const WORK_WEEK_S = 5 * 86400;
const STALE_AFTER_S = 15 * 60;

/** Share of the window's time already gone, as the status line script counts it: the 5-hour window
 *  by the clock; the weekly one by Mon–Fri seconds only, against 5 working days. */
export function elapsedPct(resetsAt, windowS, { nowS = Date.now() / 1000, weekdaysOnly = false } = {}) {
	if (!resetsAt) return null;
	const start = resetsAt - windowS;
	const end = Math.min(nowS, resetsAt);
	if (!weekdaysOnly) return clampPct(((end - start) / windowS) * 100);
	let elapsed = 0;
	let cursor = start;
	for (let day = 0; cursor < end && day < 10; day++) {
		const midnight = new Date(cursor * 1000);
		midnight.setHours(24, 0, 0, 0);
		const segmentEnd = Math.min(midnight.getTime() / 1000, end);
		const weekday = new Date(cursor * 1000).getDay(); // 0 Sun … 6 Sat
		if (weekday !== 0 && weekday !== 6) elapsed += segmentEnd - cursor;
		cursor = midnight.getTime() / 1000;
	}
	return clampPct((elapsed / WORK_WEEK_S) * 100);
}

const clampPct = (value) => Math.round(Math.max(0, Math.min(100, value)));

export class UsageFeed extends EventEmitter {
	constructor({ tapPath = TAP_PATH, now = () => Date.now() } = {}) {
		super();
		this.tapPath = tapPath;
		this.now = now;
		this.limits = null; // { fiveHour: {usedPct, resetsAt}, sevenDay: {…}, at, source }
		this.contexts = new Map(); // sessionKey → { usedTokens, window, at }
	}

	/** Feed every stream-json message of a dashboard Claude run here. `key` names the run. */
	noteMessage(message, key = "run") {
		if (!message || typeof message !== "object") return;
		const at = this.now();
		if (message.type === "rate_limit_event") {
			const windows = message.rate_limit_info?.unifiedWindows;
			if (!windows) return;
			this.#setLimits({
				fiveHour: windowFrom(windows.five_hour),
				sevenDay: windowFrom(windows.seven_day),
				at,
				source: "claude-run",
			});
			return;
		}
		if (message.type === "assistant" && message.message?.usage && !message.parent_tool_use_id) {
			const usage = message.message.usage;
			const usedTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
			const known = this.contexts.get(key);
			this.contexts.set(key, { usedTokens, window: known?.window ?? null, model: message.message.model ?? known?.model ?? null, at });
			this.emit("change");
			return;
		}
		if (message.type === "result" && message.modelUsage) {
			const known = this.contexts.get(key);
			const main = known?.model && message.modelUsage[known.model] ? message.modelUsage[known.model] : Object.values(message.modelUsage).sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0))[0];
			if (main?.contextWindow) {
				this.contexts.set(key, { ...(known ?? { usedTokens: null, model: null }), window: main.contextWindow, at });
				this.emit("change");
			}
		}
	}

	/** Reads the usage tap if it is newer than what the runs reported. Missing tap → no-op. */
	async readTap() {
		let info;
		let text;
		try {
			[info, text] = await Promise.all([stat(this.tapPath), readFile(this.tapPath, "utf8")]);
		} catch {
			return false;
		}
		const at = info.mtimeMs;
		if (this.limits && this.limits.at >= at) return false;
		let json;
		try {
			json = JSON.parse(text);
		} catch {
			return false;
		}
		const limits = json.rate_limits;
		if (!limits) return false;
		this.#setLimits({
			fiveHour: limits.five_hour ? { usedPct: Math.round(limits.five_hour.used_percentage), resetsAt: limits.five_hour.resets_at ?? null } : null,
			sevenDay: limits.seven_day ? { usedPct: Math.round(limits.seven_day.used_percentage), resetsAt: limits.seven_day.resets_at ?? null } : null,
			at,
			source: "status-line",
			tapContextPct: json.context_window?.used_percentage ?? null,
			tapModel: json.model?.id ?? json.model?.display_name ?? null,
		});
		return true;
	}

	/** What the stream shows. `ageS` lets the UI grey out old figures. */
	view() {
		const nowMs = this.now();
		const nowS = nowMs / 1000;
		const limits = this.limits;
		const decorate = (window, windowS, weekdaysOnly) => {
			if (!window) return null;
			const elapsed = elapsedPct(window.resetsAt, windowS, { nowS, weekdaysOnly });
			return { ...window, elapsedPct: elapsed, isAhead: elapsed !== null && window.usedPct > elapsed, resetsInS: window.resetsAt ? Math.max(0, Math.round(window.resetsAt - nowS)) : null };
		};
		const [key, latest] = [...this.contexts.entries()].sort((a, b) => b[1].at - a[1].at)[0] ?? [];
		const runContext = latest?.usedTokens != null && latest.window ? { pct: Math.round((latest.usedTokens / latest.window) * 100), key, model: latest.model, at: latest.at } : null;
		const context = runContext ?? (limits?.tapContextPct != null ? { pct: Math.round(limits.tapContextPct), key: "status-line", model: null, at: limits.at } : null);
		const ageS = limits ? Math.round((nowMs - limits.at) / 1000) : null;
		return {
			fiveHour: limits ? decorate(limits.fiveHour, FIVE_HOURS_S, false) : null,
			sevenDay: limits ? decorate(limits.sevenDay, WEEK_S, true) : null,
			context,
			// D-149: the Mac status bar names the model like the CLI line does.
			model: latest?.model ?? limits?.tapModel ?? null,
			source: limits?.source ?? null,
			updatedAt: limits ? new Date(limits.at).toISOString() : null,
			ageS,
			isStale: ageS === null || ageS > STALE_AFTER_S,
		};
	}

	/**
	 * D-149: the tap changes on every CLI status-line render, so it is polled (a `stat` each `intervalMs`) and the
	 * stream updates live instead of only when another slice is read.
	 */
	watchTap(intervalMs = 5_000) {
		let lastMtime = 0;
		const timer = setInterval(async () => {
			try {
				const { mtimeMs } = await stat(this.tapPath);
				if (mtimeMs === lastMtime) return;
				lastMtime = mtimeMs;
				await this.readTap();
			} catch {
				// No tap yet — nothing to show from the CLI.
			}
		}, intervalMs);
		timer.unref?.();
		return () => clearInterval(timer);
	}

	#setLimits(limits) {
		this.limits = limits;
		this.emit("change");
	}
}

function windowFrom(window) {
	if (!window || typeof window.utilization !== "number") return null;
	return { usedPct: Math.round(window.utilization * 100), resetsAt: window.resetsAt ?? null };
}

/** The one feed the server and the Claude runners share. */
export const usageFeed = new UsageFeed();
