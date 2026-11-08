import Combine
import Foundation

enum TestCaseFilter: String, CaseIterable, Identifiable {
	case all
	case recorded
	case needsClaude
	case failedLast
	case stale
	case neverRun

	var id: String { rawValue }

	var title: LocalizedStringResource {
		switch self {
			case .all:
				return "All"
			case .recorded:
				return "Free replay"
			case .needsClaude:
				return "Needs Claude"
			case .failedLast:
				return "Failed last"
			case .stale:
				return "Stale"
			case .neverRun:
				return "Never run"
		}
	}
}

enum VerdictTone: Equatable {
	case passed
	case failed
	case neutral
	case notRun
}

struct TestCaseRowModel: Equatable, Identifiable {
	let id: String
	let scenario: String
	let verdictText: String
	let verdictTone: VerdictTone
	let replayBadge: TestCaseReplayBadge
	let isEditedLocally: Bool
	let proofBadges: [TestCaseProofBadge]

	/// Why the last result no longer speaks for the build under test (D-188); nil when it still does.
	let staleHelpText: String?
}

/// D-182: what proof a run left, shown as an icon on the case's row.
struct TestCaseProofBadge: Equatable, Identifiable {
	let id: String
	let systemImage: String
	let countText: String?
	let helpText: String
}

struct TestCaseDetailModel: Equatable {
	let id: String
	let scenario: String

	/// The document's scenario when it was edited locally.
	let documentScenario: String?

	let fields: [TestCaseField]
	let recordingName: String?
	let recordingId: String?

	/// Explanations exist, so an explained replay or demo video has subtitles in plain words.
	let hasExplanations: Bool

	/// D-220: free replay, not confirmed, needs repair, or needs Claude.
	let replayBadge: TestCaseReplayBadge

	/// Why a Claude pass shows as unconfirmed; nil otherwise.
	let unconfirmedText: String?

	let lastRunText: String
	let lastRunTone: VerdictTone

	/// Set when the case runs with local corrections instead of the document's text (D-166).
	let editNotice: TestCaseEditNotice?

	/// The person's reason when their override gives the shown verdict (D-180).
	let overrideNote: String?

	/// "Starts on Home · Needs UAT B, Logged in" (D-185); nil until a recording states it.
	let setupText: String?

	/// "Ran on develop @ 9ec4017 · 15.0.0 (150006)" (D-188).
	let builtText: String?

	/// Why the result is stale and which covered files changed (D-188).
	let staleText: String?

	/// "Jira: SEA-59531" from the test case document (D-193).
	let ticketsText: String?

	/// A run or a person's override gave the case a result, so there is something to post.
	let hasResult: Bool
}

struct TestCaseEditNotice: Equatable {
	let text: String
	let isDocumentChanged: Bool
}

struct TestCaseField: Equatable, Identifiable {
	let id: String
	let title: LocalizedStringResource
	let text: String

	/// The document's own text when this field was edited locally; shown underneath for comparison.
	let documentText: String?
}

enum TestListState: Equatable {
	case notLoaded
	case loading
	case loaded([TestCaseRowModel])
	case noMatches
}

struct TestDocumentHeaderActions {
	let onLoad: () -> Void
	let onExport: () -> Void
	let onReplayStale: () -> Void
	let onRunAll: () -> Void
	let onVerify: () -> Void

	/// D-213: Replay stale was clicked and the server hasn't listed the run yet.
	let isStartingStaleReplay: Bool
}

struct TestDocumentHeader: Equatable {
	let title: String
	let caseCountText: String
	let isReloading: Bool

	/// "Testing develop @ 9ec4017 · 15.0.0 (150006)" (D-188); nil when no QA copy is linked.
	let buildText: String?

	let isBuildUnverified: Bool

	/// Stale cases a replay can re-check without Claude.
	let staleCount: Int
}

struct LiveStepRowModel: Equatable, Identifiable {
	let id: Int
	let text: String
	let status: LiveStepStatus
	let durationText: String?
	let reason: String?
}

enum LiveStepStatus: Equatable {
	case working
	case done
	case failed
	case skipped
}

/// What the TestForge did to get the phone ready for this run; shown in the Mac app only, never to viewers (D-206).
struct LivePrepModel: Equatable {
	let current: String?
	let since: Date?
	let earlier: [String]
}

struct LiveRunModel: Equatable {
	let jobId: String
	let title: String
	let statusText: String
	let isRunning: Bool
	let steps: [LiveStepRowModel]

	/// Set for a Claude run: the Tests pane offers its full session in the Claude section (D-147).
	let sessionId: String?

	/// A Claude run's model and why it was picked or switched, e.g. "Sonnet · auto · needs mocked server data" (D-158).
	let modelText: String?

	var prep: LivePrepModel? = nil
}

enum LiveStepsState: Equatable {
	case idle
	case showing(LiveRunModel)
}

struct PendingClaudeRun: Identifiable, Equatable {
	let id: String
	let scenario: String
}

/// Writing explanations spends one Claude turn, so the user confirms it first.
struct PendingExplanationWrite: Identifiable, Equatable {
	let id: String
	let recordingId: String
	let isRewrite: Bool
}

/// Board C3: the loaded cases, the selected case, and the live steps of the newest run.
/// Whole-class `@MainActor`: every method only maps slices to published state; requests run in the service.
@MainActor
final class TestsSectionViewModel: ObservableObject {
	@Published private(set) var listState: TestListState = .notLoaded
	@Published private(set) var header: TestDocumentHeader?
	@Published private(set) var detail: TestCaseDetailModel?
	@Published private(set) var liveSteps: LiveStepsState = .idle
	@Published private(set) var actionMessage: String?
	@Published var pendingClaudeRun: PendingClaudeRun?
	@Published var pendingExplanationWrite: PendingExplanationWrite?
	@Published var editingDraft: TestCaseDraft?
	@Published var overrideDraft: CaseResultOverrideDraft?
	@Published var pendingRevertCaseId: String?
	@Published private(set) var isWritingExplanations = false
	/// D-213: the request in flight; a run start stays set until the server lists the run, so no second click slips through.
	@Published private(set) var busyAction: TestCaseAction?
	@Published private(set) var sheetFailureMessage: String?
	/// Shows the sheet that asks for a Confluence link or a file path.
	@Published var isLoadSheetPresented = false

	/// The live-steps inspector on the right; open by default so a run is visible as it happens.
	@Published var isInspectorPresented = true
	@Published var isListPresented = true

	@Published var searchText = "" {
		didSet { refresh() }
	}
	@Published var filter: TestCaseFilter = .all {
		didSet { refresh() }
	}
	@Published var selectedCaseId: String? {
		didSet { refresh() }
	}

	/// D-183: the selected case's proof under its detail.
	let media: TestCaseMediaViewModel

	private let store: StateStore
	private let service: TestCaseActing
	private var mediaKey: String?
	private var document: TestCaseDocument?
	private var activeRun: NarratedRun?
	private var newestRunIdBeforeStart: String?
	private var stoppingRunId: String?
	private var prepLog: (jobId: String, messages: [String])?
	private var cancellables = Set<AnyCancellable>()
	private var actionTask: Task<Void, Never>?

	var documentSource: String {
		document?.source ?? ""
	}

	/// The server runs one test at a time, so a run started from the web UI also blocks Run and Replay here.
	var isRunInProgress: Bool {
		activeRun != nil || isStartingRun
	}

	var isStartingRun: Bool {
		busyAction?.completion == .runListed
	}

	/// The cases the list shows now (its filter and search), for Run all.
	var visibleCaseIds: [String] {
		guard case .loaded(let rows) = listState else {
			return []
		}
		return rows.map(\.id)
	}

	var canRunSelected: Bool {
		detail != nil && !isRunInProgress && busyAction == nil
	}

	var canReplaySelected: Bool {
		canRunSelected && detail?.recordingName != nil && detail?.replayBadge.canReplay == true
	}

	init(store: StateStore, service: TestCaseActing, media: TestCaseMediaViewModel) {
		self.store = store
		self.service = service
		self.media = media
		observeStore()
	}

	deinit {
		actionTask?.cancel()
	}

	func replayStaleCases() {
		perform(.replayStale) { service in
			try await service.replayStale()
		}
	}

	/// ⌘R: a recording replays for free; a case without one asks before spending Claude usage.
	func runSelectedCase() {
		if canReplaySelected {
			replaySelectedCase()
		} else {
			requestClaudeRun()
		}
	}

	func replaySelectedCase() {
		guard canReplaySelected,
			let recordingId = selectedSummary?.recording?.id
		else {
			return
		}
		perform(.replay) { service in
			try await service.replay(recordingId: recordingId)
		}
	}

	/// D-165: a slow replay with cards, subtitles and pointers over the Simulator; no Claude usage.
	func replaySelectedWithExplanations() {
		guard canReplaySelected,
			let recordingId = selectedSummary?.recording?.id
		else {
			return
		}
		perform(.replayWithExplanations) { service in
			try await service.replayWithExplanations(recordingId: recordingId)
		}
	}

	/// Films an explained replay and renders English and Bahasa videos with subtitles burned in.
	func recordSelectedDemo() {
		guard canReplaySelected,
			let recordingId = selectedSummary?.recording?.id
		else {
			return
		}
		perform(.recordDemo) { service in
			try await service.recordDemo(recordingId: recordingId)
		}
	}

	func requestExplanationWrite() {
		guard let detail,
			let recordingId = selectedSummary?.recording?.id,
			!isWritingExplanations,
			!isRunInProgress
		else {
			return
		}
		pendingExplanationWrite = PendingExplanationWrite(id: detail.id, recordingId: recordingId, isRewrite: detail.hasExplanations)
	}

	func confirmExplanationWrite() {
		guard let pending = pendingExplanationWrite else {
			return
		}
		pendingExplanationWrite = nil
		isWritingExplanations = true
		let service = service
		Task { [weak self] in
			do {
				try await service.writeExplanations(recordingId: pending.recordingId, isRewrite: pending.isRewrite)
			} catch {
				self?.actionMessage = error.localizedDescription
			}
			self?.isWritingExplanations = false
		}
	}

	func beginEditingSelected() {
		guard let selectedSummary,
			!isRunInProgress
		else {
			return
		}
		sheetFailureMessage = nil
		editingDraft = TestCaseDraft(testCase: selectedSummary)
	}

	/// The sheet stays open showing Saving… and closes once the server saved; a failure shows inside it.
	func saveEdit(draft: TestCaseDraft) {
		guard draft.canSave else {
			return
		}
		perform(.saveEdit) { service in
			try await service.saveEdit(caseId: draft.id, draft: draft)
		}
	}

	func beginOverrideSelected() {
		guard let selectedSummary,
			!isRunInProgress
		else {
			return
		}
		sheetFailureMessage = nil
		overrideDraft = TestsSectionMapper.overrideDraft(for: selectedSummary)
	}

	/// Rerunning starts a Claude run that reads the new expected result, the leniency and every override reason.
	func saveOverride(draft: CaseResultOverrideDraft, shouldRerun: Bool) {
		guard draft.canSave else {
			return
		}
		let action: TestCaseAction = shouldRerun ? .overrideAndRerun : .saveOverride
		perform(action) { service in
			try await service.overrideResult(draft: draft, shouldRerun: shouldRerun)
		}
	}

	func requestRevertSelected() {
		guard detail?.editNotice != nil,
			!isRunInProgress
		else {
			return
		}
		pendingRevertCaseId = detail?.id
	}

	func confirmRevert() {
		guard let caseId = pendingRevertCaseId else {
			return
		}
		pendingRevertCaseId = nil
		perform(.revert) { service in
			try await service.revertEdit(caseId: caseId)
		}
	}

	func requestClaudeRun() {
		guard canRunSelected,
			let detail
		else {
			return
		}
		pendingClaudeRun = PendingClaudeRun(id: detail.id, scenario: detail.scenario)
	}

	func confirmClaudeRun(model: ClaudeRunModel) {
		guard let caseId = pendingClaudeRun?.id else {
			return
		}
		pendingClaudeRun = nil
		perform(.runWithClaude) { service in
			try await service.runWithClaude(caseId: caseId, model: model)
		}
	}

	/// Set by the TestForge, which owns navigation: opens a run's Claude session in the Claude section (D-147).
	var openClaudeSession: ((String) -> Void)?

	func showClaudeSession(_ sessionId: String) {
		openClaudeSession?(sessionId)
	}

	/// Stays Stopping… until the server no longer lists the run as running.
	func stopActiveRun() {
		guard let jobId = activeRun?.id else {
			return
		}
		perform(.stop) { service in
			try await service.cancelRun(jobId: jobId)
		}
	}

	func loadDocument(source: String) {
		let trimmedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmedSource.isEmpty else {
			return
		}
		isLoadSheetPresented = false
		perform(.loadDocument) { service in
			try await service.loadDocument(source: trimmedSource)
		}
	}

	func dismissMessage() {
		actionMessage = nil
	}

	private var selectedSummary: TestCaseSummary? {
		document?.cases.first { $0.id == selectedCaseId }
	}

	/// One request at a time: a second click while one is in flight is ignored rather than cancelling the first.
	private func perform(_ action: TestCaseAction, request: @escaping (TestCaseActing) async throws -> Void) {
		guard busyAction == nil else {
			return
		}
		busyAction = action
		actionMessage = nil
		sheetFailureMessage = nil
		switch action.completion {
			case .runListed:
				newestRunIdBeforeStart = store.value(of: .narration, as: NarrationState.self)?.runs.first?.id
			case .runStopped:
				stoppingRunId = activeRun?.id
			case .requestReturned:
				break
		}
		let service = service
		actionTask = Task { [weak self] in
			do {
				try await request(service)
				self?.finish(action: action)
			} catch {
				self?.fail(action: action, message: error.localizedDescription)
			}
		}
	}

	private func finish(action: TestCaseAction) {
		switch action {
			case .saveEdit:
				editingDraft = nil
			case .saveOverride, .overrideAndRerun:
				overrideDraft = nil
			case .replay, .replayWithExplanations, .recordDemo, .runWithClaude, .replayStale, .stop, .revert, .loadDocument:
				break
		}
		if action.completion == .requestReturned,
			busyAction == action {
			busyAction = nil
		}
	}

	private func fail(action: TestCaseAction, message: String) {
		if busyAction == action {
			busyAction = nil
		}
		if action.isSheetSave {
			sheetFailureMessage = message
		} else {
			actionMessage = message
		}
	}

	/// A run start ends once the server lists the run; Stop ends once that run no longer runs.
	private func settleBusyAction(narration: NarrationState?) {
		switch busyAction?.completion {
			case .runListed:
				if activeRun != nil || narration?.runs.first?.id != newestRunIdBeforeStart {
					busyAction = nil
				}
			case .runStopped:
				if activeRun?.id != stoppingRunId {
					busyAction = nil
				}
			case .requestReturned, .none:
				break
		}
	}

	private func observeStore() {
		store.$slices
			.receive(on: DispatchQueue.main)
			.sink { [weak self] _ in
				self?.readSlices()
			}
			.store(in: &cancellables)
	}

	private func readSlices() {
		document = store.value(of: .testcases, as: TestCaseDocument.self)
		let narration = store.value(of: .narration, as: NarrationState.self)
		// The server lists runs newest first.
		activeRun = narration?.runs.first { $0.isRunning }
		settleBusyAction(narration: narration)
		if let shownRun = activeRun ?? narration?.runs.first {
			var liveRun = TestsSectionMapper.liveRun(from: shownRun)
			liveRun.prep = recordPrep(run: shownRun)
			liveSteps = .showing(liveRun)
		} else {
			liveSteps = .idle
		}
		refresh()
	}

	/// The server only sends the current prep message, so earlier ones are kept here for the run on show.
	private func recordPrep(run: NarratedRun) -> LivePrepModel? {
		var messages = prepLog?.jobId == run.id ? prepLog?.messages ?? [] : []
		if let message = run.busy?.message,
			!message.isEmpty,
			messages.last != message {
			messages.append(message)
		}
		prepLog = (run.id, messages)
		return TestsSectionMapper.prep(run: run, messages: messages)
	}

	private func refresh() {
		guard let document,
			!document.cases.isEmpty
		else {
			header = nil
			detail = nil
			listState = (document?.isLoading ?? false) ? .loading : .notLoaded
			return
		}
		header = TestsSectionMapper.header(for: document)
		let rows = TestsSectionMapper.rows(for: document.cases, filter: filter, searchText: searchText)
		listState = rows.isEmpty ? .noMatches : .loaded(rows)
		detail = selectedSummary.map { TestsSectionMapper.detail(for: $0) }
		refreshMedia()
	}

	/// Lists the proof again when another case is selected or a run files new screenshots or videos.
	private func refreshMedia() {
		let proof = selectedSummary?.proof
		let key = selectedCaseId.map { "\($0)|\(proof?.screenshotCount ?? 0)|\(proof?.videoCount ?? 0)" }
		guard key != mediaKey else {
			return
		}
		let isSameCase = mediaKey?.hasPrefix("\(selectedCaseId ?? "")|") ?? false
		mediaKey = key
		if !isSameCase {
			media.stopPlayback()
		}
		media.load(caseId: selectedCaseId, keepingSelection: isSameCase)
	}
}
