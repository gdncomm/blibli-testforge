import Foundation

/// Turns server slices into the Tests screen's ready-to-render rows, so views never branch on verdict strings.
enum TestsSectionMapper {
	private static let prepHistoryLimit = 6

	static func header(for document: TestCaseDocument) -> TestDocumentHeader {
		let freeCount = document.cases.filter { $0.replay.kind == .free }.count
		let claudeCount = document.cases.filter { $0.replay.kind == .claude || $0.replay.kind == .broken }.count
		let caseCountText = String(localized: "\(document.cases.count) cases · \(freeCount) free replays · \(claudeCount) need Claude")
		let title = document.title ?? document.source ?? String(localized: "Test document")
		return TestDocumentHeader(
			title: title,
			caseCountText: caseCountText,
			isReloading: document.isLoading,
			buildText: document.build.map { String(localized: "Testing \($0)") },
			isBuildUnverified: document.isBuildUnverified,
			staleCount: document.staleCaseIds.count
		)
	}

	static func rows(for cases: [TestCaseSummary], filter: TestCaseFilter, searchText: String) -> [TestCaseRowModel] {
		let query = searchText.trimmingCharacters(in: .whitespaces)
		return cases
			.filter { matches(testCase: $0, filter: filter) }
			.filter { query.isEmpty || $0.id.localizedCaseInsensitiveContains(query) || ($0.scenario ?? "").localizedCaseInsensitiveContains(query) }
			.map { testCase in
				let verdictText = testCase.lastRun?.verdict ?? String(localized: "Not run")
				let verdictTone = tone(for: testCase.lastRun?.verdict)
				let scenario = testCase.scenario ?? ""
				return TestCaseRowModel(
					id: testCase.id,
					scenario: scenario,
					verdictText: verdictText,
					verdictTone: verdictTone,
					replayBadge: TestCaseReplayBadge(status: testCase.replay),
					isEditedLocally: testCase.localEdit != nil,
					proofBadges: proofBadges(for: testCase),
					staleHelpText: testCase.lastRun?.stale.map { String(localized: "Stale: \($0.reason)") }
				)
			}
	}

	/// Only a case that has run shows proof; evidence-only means a person judges the screenshots.
	private static func proofBadges(for testCase: TestCaseSummary) -> [TestCaseProofBadge] {
		guard let lastRun = testCase.lastRun else {
			return []
		}
		var badges: [TestCaseProofBadge] = []
		if lastRun.verdict?.uppercased().hasPrefix("EVIDENCE_ONLY") == true {
			let helpText = String(localized: "Evidence only: no pass or fail, check the screenshots by eye")
			badges.append(TestCaseProofBadge(id: "evidence", systemImage: "eye", countText: nil, helpText: helpText))
		}
		if let screenshotCount = testCase.proof?.screenshotCount,
			screenshotCount > 0 {
			let helpText = String(localized: "\(screenshotCount) screenshot(s)")
			badges.append(TestCaseProofBadge(id: "screenshots", systemImage: "photo", countText: "\(screenshotCount)", helpText: helpText))
		}
		if let videoCount = testCase.proof?.videoCount,
			videoCount > 0 {
			let helpText = String(localized: "\(videoCount) screen recording(s)")
			badges.append(TestCaseProofBadge(id: "video", systemImage: "video.fill", countText: nil, helpText: helpText))
		}
		return badges
	}

	static func detail(for testCase: TestCaseSummary) -> TestCaseDetailModel {
		let candidateFields: [(String, LocalizedStringResource, String?)] = [
			("precondition", "Precondition", testCase.precondition),
			("steps", "Steps", testCase.steps),
			("expected", "Expected result", testCase.expected),
			("api", "API", testCase.api),
		]
		let localEdit = testCase.localEdit
		let fields = candidateFields.compactMap { id, title, text -> TestCaseField? in
			let isEdited = localEdit?.fields.contains(id) ?? false
			guard let text,
				!text.isEmpty || isEdited
			else {
				return nil
			}
			let documentText = isEdited ? (localEdit?.documentText[id] ?? "") : nil
			return TestCaseField(id: id, title: title, text: text, documentText: documentText)
		}
		let lastRunText = lastRunDescription(for: testCase.lastRun)
		let lastRunTone = tone(for: testCase.lastRun?.verdict)
		return TestCaseDetailModel(
			id: testCase.id,
			scenario: testCase.scenario ?? "",
			documentScenario: (localEdit?.fields.contains("scenario") ?? false) ? (localEdit?.documentText["scenario"] ?? "") : nil,
			fields: fields,
			recordingName: testCase.recording?.name,
			recordingId: testCase.recording?.id,
			hasExplanations: testCase.recording?.hasDemoNotes ?? false,
			replayBadge: TestCaseReplayBadge(status: testCase.replay),
			unconfirmedText: unconfirmedText(for: testCase),
			lastRunText: lastRunText,
			lastRunTone: lastRunTone,
			editNotice: localEdit.map { editNotice(for: $0) },
			overrideNote: testCase.lastRun?.resultOverride.map { overrideNote(for: $0) },
			setupText: testCase.recording?.setup.flatMap { setupText(for: $0) },
			builtText: testCase.lastRun?.build.map { String(localized: "Ran on \($0)") },
			staleText: testCase.lastRun?.stale.map { staleText(for: $0) },
			ticketsText: testCase.tickets.isEmpty ? nil : String(localized: "Jira: \(testCase.tickets.map(\.key).joined(separator: ", "))"),
			hasResult: testCase.lastRun?.verdict != nil
		)
	}

	/// D-220: a Claude pass counts once a replay of the saved recording passes; until then it says what is missing.
	static func unconfirmedText(for testCase: TestCaseSummary) -> String? {
		guard testCase.lastRun?.resultOverride == nil,
			let claudeVerdict = testCase.lastRun?.claudeVerdict
		else {
			return nil
		}
		let shownVerdict = claudeVerdict.split(separator: " ").first.map(String.init) ?? claudeVerdict
		guard testCase.recording != nil else {
			return String(localized: "Claude said \(shownVerdict), but no recording was saved. It counts as passed once Claude saves a recording and its replay passes: Run with Claude again.")
		}
		return String(localized: "Claude said \(shownVerdict). It counts as passed once a replay of the recording passes: press Replay.")
	}

	static func setupText(for setup: TestCaseSetup) -> String? {
		let parts = [
			setup.startScreen.map { String(localized: "Starts on \($0)") },
			setup.needs.isEmpty ? nil : String(localized: "Needs \(setup.needs.joined(separator: ", "))"),
		].compactMap { $0 }
		return parts.isEmpty ? nil : parts.joined(separator: " · ")
	}

	static func staleText(for stale: TestCaseStale) -> String {
		let shownFiles = stale.files.prefix(3).map { ($0 as NSString).lastPathComponent }
		let moreCount = stale.files.count - shownFiles.count
		let filesText = shownFiles.isEmpty ? "" : ": " + shownFiles.joined(separator: ", ") + (moreCount > 0 ? String(localized: " and \(moreCount) more") : "")
		return String(localized: "Stale — \(stale.reason)\(filesText). Replay to check it on this build.")
	}

	/// D-180: the Override result sheet starts from the shown verdict and the expected result runs use now.
	static func overrideDraft(for testCase: TestCaseSummary) -> CaseResultOverrideDraft {
		let shownVerdict = testCase.lastRun?.verdict
		let verdict = shownVerdict.flatMap { CaseResultOverrideVerdict(rawValue: $0.uppercased()) } ?? .pass
		let leniency = testCase.resultOverrides.last.flatMap { CaseResultOverrideLeniency(rawValue: $0.leniency) } ?? .strict
		let history = testCase.resultOverrides.enumerated().reversed().map { index, change in
			historyRow(index: index, change: change)
		}
		return CaseResultOverrideDraft(
			id: testCase.id,
			scenario: testCase.scenario ?? "",
			currentVerdictText: shownVerdict ?? String(localized: "Not run"),
			history: history,
			verdict: verdict,
			leniency: leniency,
			reason: "",
			expected: testCase.expected ?? ""
		)
	}

	private static func historyRow(index: Int, change: TestCaseResultOverride) -> CaseResultOverrideHistoryRow {
		let changeText = change.previousVerdict.map { String(localized: "\($0) → \(change.verdict)") } ?? change.verdict
		let leniencyText = change.leniency == CaseResultOverrideLeniency.lenient.rawValue ? String(localized: "lenient") : String(localized: "strict")
		let dateText = change.changedAt?.formatted(date: .abbreviated, time: .shortened)
		let detailText = [dateText, leniencyText].compactMap { $0 }.joined(separator: " · ")
		return CaseResultOverrideHistoryRow(id: index, changeText: changeText, detailText: detailText, reason: change.reason)
	}

	private static func overrideNote(for change: TestCaseResultOverride) -> String {
		let dateText = change.changedAt?.formatted(date: .abbreviated, time: .shortened)
		return dateText.map { String(localized: "Set by you on \($0): \(change.reason)") } ?? String(localized: "Set by you: \(change.reason)")
	}

	private static func editNotice(for localEdit: TestCaseLocalEdit) -> TestCaseEditNotice {
		guard !localEdit.isDocumentChanged else {
			let text = String(localized: "Edited locally. The document has changed these fields since, so check your edit still applies.")
			return TestCaseEditNotice(text: text, isDocumentChanged: true)
		}
		let editedText = localEdit.editedAt.map { $0.formatted(date: .abbreviated, time: .shortened) }
		let text = editedText.map { String(localized: "Edited locally on \($0). Runs use your text; the document is unchanged.") }
			?? String(localized: "Edited locally. Runs use your text; the document is unchanged.")
		return TestCaseEditNotice(text: text, isDocumentChanged: false)
	}

	static func liveRun(from run: NarratedRun) -> LiveRunModel {
		let statusText = run.isRunning ? String(localized: "Running…") : (run.verdict ?? String(localized: "Finished"))
		let steps = run.steps.map { step in
			let status = stepStatus(for: step.status)
			let durationText = step.durationMs.map { durationDescription(milliseconds: $0) }
			return LiveStepRowModel(id: step.id, text: step.text, status: status, durationText: durationText, reason: step.reason)
		}
		let modelText = modelDescription(for: run)
		return LiveRunModel(
			jobId: run.id,
			title: run.title,
			statusText: statusText,
			isRunning: run.isRunning,
			steps: steps,
			sessionId: run.sessionId,
			modelText: modelText
		)
	}

	static func prep(run: NarratedRun, messages: [String]) -> LivePrepModel? {
		guard !messages.isEmpty else {
			return nil
		}
		let busyMessage = run.busy?.message ?? ""
		let current = run.isRunning && !busyMessage.isEmpty ? busyMessage : nil
		let earlier = current == nil ? messages : Array(messages.dropLast())
		return LivePrepModel(current: current, since: current == nil ? nil : run.busy?.since, earlier: Array(earlier.suffix(prepHistoryLimit)))
	}

	private static func modelDescription(for run: NarratedRun) -> String? {
		guard let model = run.model else {
			return nil
		}
		let name = model.prefix(1).uppercased() + model.dropFirst()
		guard let reason = run.modelReason,
			!reason.isEmpty
		else {
			return name
		}
		return "\(name) · \(reason)"
	}

	private static func matches(testCase: TestCaseSummary, filter: TestCaseFilter) -> Bool {
		switch filter {
			case .all:
				return true
			case .recorded:
				return testCase.replay.kind == .free
			case .needsClaude:
				return testCase.replay.kind == .claude || testCase.replay.kind == .broken
			case .failedLast:
				return tone(for: testCase.lastRun?.verdict) == .failed
			case .stale:
				return testCase.lastRun?.stale != nil
			case .neverRun:
				return testCase.lastRun == nil
		}
	}

	private static func tone(for verdict: String?) -> VerdictTone {
		switch verdict?.uppercased() {
			case .none:
				return .notRun
			case "PASS":
				return .passed
			case "FAIL", "BLOCKED":
				return .failed
			default:
				return .neutral
		}
	}

	private static func stepStatus(for status: String) -> LiveStepStatus {
		switch status {
			case "done":
				return .done
			case "failed":
				return .failed
			case "skipped", "cancelled":
				return .skipped
			default:
				return .working
		}
	}

	private static func lastRunDescription(for lastRun: TestCaseLastRun?) -> String {
		guard let lastRun else {
			return String(localized: "Never run")
		}
		if lastRun.resultOverride != nil {
			return [lastRun.verdict ?? String(localized: "No verdict"), String(localized: "set by you")].joined(separator: " · ")
		}
		let mode = lastRun.mode == "replay" ? String(localized: "replay") : String(localized: "Claude run")
		var parts = [lastRun.verdict ?? String(localized: "No verdict"), mode]
		if let finishedAt = lastRun.finishedAt {
			let finishedText = finishedAt.formatted(date: .abbreviated, time: .shortened)
			parts.append(finishedText)
		}
		if let durationMs = lastRun.durationMs {
			let durationText = durationDescription(milliseconds: durationMs)
			parts.append(durationText)
		}
		return parts.joined(separator: " · ")
	}

	private static func durationDescription(milliseconds: Double) -> String {
		let duration = Duration.milliseconds(Int64(milliseconds))
		let unitsStyle = Duration.UnitsFormatStyle(allowedUnits: [.minutes, .seconds], width: .narrow, fractionalPart: .hide)
		return duration.formatted(unitsStyle)
	}
}
