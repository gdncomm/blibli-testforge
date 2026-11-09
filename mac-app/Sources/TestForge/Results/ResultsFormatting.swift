import Foundation

/// Wording shared by the Results and Reports screens, so a run reads the same in both.
enum ResultsFormatting {
	/// Server verdicts carry detail after the keyword ("FAIL at step 7"), so only the prefix decides the tone.
	static func tone(for verdict: String?) -> VerdictTone {
		guard let verdict else {
			return .notRun
		}
		let keyword = verdict.uppercased()
		if keyword.hasPrefix("PASS") {
			return .passed
		}
		let failingPrefixes = ["FAIL", "BLOCKED", "INTERRUPTED", "CRASH", "ERROR"]
		if failingPrefixes.contains(where: { keyword.hasPrefix($0) }) {
			return .failed
		}
		let pendingKeywords = ["—", "QUEUED", "RUNNING", "SKIPPING"]
		return pendingKeywords.contains(keyword) ? .notRun : .neutral
	}

	/// Passed first, then flaky, failed, blocked, then anything else in name order.
	static func countsText(counts: [String: Int]) -> String {
		let order = ["PASS", "FLAKY", "FAIL", "BLOCKED"]
		let sortedKeys = counts.keys.sorted { left, right in
			let leftRank = order.firstIndex(of: left) ?? order.count
			let rightRank = order.firstIndex(of: right) ?? order.count
			return leftRank == rightRank ? left < right : leftRank < rightRank
		}
		let parts = sortedKeys.map { key -> String in
			let count = counts[key] ?? 0
			return "\(count) \(label(forCountKey: key))"
		}
		return parts.joined(separator: " · ")
	}

	static func passedText(summary: ResultRunSummary) -> String {
		let passedCount = summary.counts["PASS"] ?? 0
		return String(localized: "\(passedCount) of \(summary.caseCount) passed")
	}

	static func runTitle(summary: ResultRunSummary) -> String {
		guard let createdAt = summary.createdAt else {
			return String(localized: "Run")
		}
		return createdAt.formatted(date: .abbreviated, time: .shortened)
	}

	static func codeText(summary: ResultRunSummary) -> String {
		let branch = summary.branch ?? String(localized: "unknown branch")
		let code = summary.codeId.map { " @ \($0)" } ?? ""
		let localChanges = summary.hasLocalChanges ? String(localized: " (local changes)") : ""
		return branch + code + localChanges
	}

	static func reviewText(summary: ResultRunSummary) -> String {
		if summary.isValidated {
			return String(localized: "Validated")
		}
		return String(localized: "\(summary.reviewedCount) of \(summary.caseCount) reviewed")
	}

	static func isRunning(summary: ResultRunSummary) -> Bool {
		["running", "paused"].contains(summary.status)
	}

	/// `.test-forge-bundle.json`: still JSON, so the save and open panels accept it; the middle word says what it is.
	static func bundleFileName(summary: ResultRunSummary) -> String {
		let reportName = reportFileName(summary: summary)
		return reportName.replacingOccurrences(of: ".md", with: ".test-forge-bundle.json")
	}

	static func reportFileName(summary: ResultRunSummary) -> String {
		let stamp = summary.createdAt.map { date -> String in
			let formatter = DateFormatter()
			formatter.dateFormat = "yyyy-MM-dd-HH-mm"
			return formatter.string(from: date)
		}
		return "test-forge-run-\(stamp ?? summary.id).md"
	}

	static func durationText(milliseconds: Double) -> String {
		let duration = Duration.milliseconds(Int64(milliseconds))
		let unitsStyle = Duration.UnitsFormatStyle(allowedUnits: [.minutes, .seconds], width: .narrow, fractionalPart: .hide)
		return duration.formatted(unitsStyle)
	}

	private static func label(forCountKey key: String) -> String {
		switch key {
			case "PASS":
				return String(localized: "passed")
			case "FAIL":
				return String(localized: "failed")
			case "FLAKY":
				return String(localized: "flaky")
			case "BLOCKED":
				return String(localized: "blocked")
			default:
				return key.lowercased()
		}
	}
}
