import Foundation

/// `usage` → the bar's segments, laid out like the CLI line: ctx, hr used/elapsed (reset), wk used/elapsed (reset).
enum UsageBarMapper {
	private static let criticalPct = 90
	private static let staleNoticeAfterS = 60

	static func state(from usage: UsageState?) -> UsageBarState {
		guard let usage,
			usage.fiveHour != nil || usage.sevenDay != nil || usage.contextPct != nil
		else {
			return .noData
		}
		var segments: [UsageSegment] = []
		if let contextPct = usage.contextPct {
			let level: UsageLevel = contextPct >= criticalPct ? .critical : .normal
			segments.append(UsageSegment(id: "ctx", label: String(localized: "ctx"), value: "\(contextPct)%", level: level))
		}
		if let fiveHour = usage.fiveHour {
			segments.append(windowSegment(id: "hr", label: String(localized: "hr"), window: fiveHour))
		}
		if let sevenDay = usage.sevenDay {
			segments.append(windowSegment(id: "wk", label: String(localized: "wk"), window: sevenDay))
		}
		return .showing(segments: segments, model: usage.model, freshness: freshness(ageS: usage.ageS, isStale: usage.isStale), isStale: usage.isStale)
	}

	private static func windowSegment(id: String, label: String, window: UsageWindow) -> UsageSegment {
		let elapsed = window.elapsedPct.map { "/\($0)%" } ?? ""
		let reset = window.resetsInS.map { " (\(duration(seconds: $0)))" } ?? ""
		let level: UsageLevel = window.usedPct >= criticalPct ? .critical : (window.isAhead ? .ahead : .normal)
		return UsageSegment(id: id, label: label, value: "\(window.usedPct)%\(elapsed)\(reset)", level: level)
	}

	/// "3h9m", "45m" — the CLI's compact form.
	static func duration(seconds: Int) -> String {
		let hours = seconds / 3600
		let minutes = (seconds % 3600) / 60
		return hours > 0 ? "\(hours)h\(minutes)m" : "\(minutes)m"
	}

	private static func freshness(ageS: Int?, isStale: Bool) -> String? {
		guard let ageS,
			ageS >= staleNoticeAfterS
		else {
			return nil
		}
		let age = duration(seconds: ageS)
		return isStale ? String(localized: "last seen \(age) ago — may be out of date") : String(localized: "\(age) ago")
	}

	static func accountSummary(account: ClaudeAccountState?, cli: ClaudeCliState?) -> ClaudeAccountSummary {
		let accountText: String
		if let account,
			account.isLoggedIn {
			let plan = account.plan.map { " · \($0)" } ?? ""
			accountText = "\(account.email ?? String(localized: "signed in"))\(plan)"
		} else {
			accountText = String(localized: "not signed in")
		}
		let onSessions = cli?.sessions.filter(\.isRemoteControl) ?? []
		let remoteControlText: String
		if let cli,
			cli.isReadable {
			remoteControlText = onSessions.isEmpty ? String(localized: "off") : String(localized: "on (\(onSessions.count)/\(cli.sessions.count))")
		} else {
			remoteControlText = String(localized: "unknown")
		}
		let help = (cli?.sessions ?? []).map { "\($0.name): \($0.isRemoteControl ? "on" : "off")" }.joined(separator: "\n")
		return ClaudeAccountSummary(
			accountText: accountText,
			isSignedIn: account?.isLoggedIn ?? false,
			remoteControlText: remoteControlText,
			remoteControlHelp: help.isEmpty ? String(localized: "No Claude Code CLI session is running") : help,
			isRemoteControlOn: !onSessions.isEmpty
		)
	}
}
