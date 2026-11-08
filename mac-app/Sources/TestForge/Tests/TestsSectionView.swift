import SwiftUI

/// Board C3: cases on the left, the selected case in the middle, live steps in the inspector.
struct TestsSectionView: View {
	@ObservedObject var viewModel: TestsSectionViewModel
	let companions: TestsCompanions

	var body: some View {
		// Dragging either divider resizes the case list or the inspector, so long titles can be read in full.
		HSplitView {
			if viewModel.isListPresented {
				listColumn
					.frame(
						minWidth: TestForgeConstants.Tests.listMinWidth,
						idealWidth: TestForgeConstants.Tests.listWidth,
						maxWidth: TestForgeConstants.Tests.listMaxWidth,
						maxHeight: .infinity
					)
			}
			detailColumn
				.frame(minWidth: TestForgeConstants.Tests.detailMinWidth, maxWidth: .infinity, maxHeight: .infinity)
			if viewModel.isInspectorPresented {
				LiveStepsInspectorView(state: viewModel.liveSteps, actions: liveStepsActions)
				.frame(
					minWidth: TestForgeConstants.Tests.inspectorMinWidth,
					idealWidth: TestForgeConstants.Tests.inspectorWidth,
					maxWidth: TestForgeConstants.Tests.inspectorMaxWidth,
					maxHeight: .infinity
				)
			}
		}
		.accessibilityElement(children: .contain)
		.searchable(text: $viewModel.searchText, placement: .toolbar, prompt: Text("Search id or scenario"))
		.toolbar {
			ToolbarItem(placement: .primaryAction) {
				listToggleButton
			}
			ToolbarItem(placement: .primaryAction) {
				inspectorToggleButton
			}
		}
		.modifier(TestsSheetsModifier(batchPlan: companions.batchPlan, jiraPost: companions.jiraPost))
		.modifier(VerifyChangesSheetModifier(viewModel: companions.verifyChanges))
		.sheet(isPresented: $viewModel.isLoadSheetPresented) {
			LoadDocumentSheetView(initialSource: viewModel.documentSource) { source in
				viewModel.loadDocument(source: source)
			} onCancel: {
				viewModel.isLoadSheetPresented = false
			}
		}
		.modifier(SessionExportSheetModifier(viewModel: companions.sessionExport))
		.sheet(item: $viewModel.editingDraft) { draft in
			let actions = EditTestCaseSheetActions(
				save: { editedDraft in viewModel.saveEdit(draft: editedDraft) },
				cancel: { viewModel.editingDraft = nil }
			)
			EditTestCaseSheetView(draft: draft, actions: actions, status: viewModel.sheetStatus)
		}
		.sheet(item: $viewModel.overrideDraft) { draft in
			let actions = OverrideResultSheetActions(
				save: { savedDraft, shouldRerun in viewModel.saveOverride(draft: savedDraft, shouldRerun: shouldRerun) },
				cancel: { viewModel.overrideDraft = nil }
			)
			OverrideResultSheetView(draft: draft, actions: actions, status: viewModel.sheetStatus)
		}
		.confirmationDialog(revertTitle, isPresented: isRevertConfirmationPresented, presenting: viewModel.pendingRevertCaseId) { _ in
			Button("Revert to document", role: .destructive) {
				viewModel.confirmRevert()
			}
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRevertEditConfirm)
			Button("Cancel", role: .cancel) {
				viewModel.pendingRevertCaseId = nil
			}
		} message: { caseId in
			Text("Your edits to \(caseId) are deleted and runs use the document's text again. This can't be undone.")
		}
		.confirmationDialog(claudeRunTitle, isPresented: isClaudeRunConfirmationPresented, presenting: viewModel.pendingClaudeRun) { _ in
			ForEach(ClaudeRunModel.allCases) { model in
				Button {
					viewModel.confirmClaudeRun(model: model)
				} label: {
					Text(model.buttonTitle)
				}
				.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRunModelPrefix + model.rawValue)
			}
			Button("Cancel", role: .cancel) {
				viewModel.pendingClaudeRun = nil
			}
		} message: { pendingRun in
			Text("Claude explores the app to judge \(pendingRun.id). It uses your Claude plan and can take several minutes. Auto starts on the cheapest model that fits and moves up if the run gets stuck.")
		}
		.confirmationDialog(explanationWriteTitle, isPresented: isExplanationWritePresented, presenting: viewModel.pendingExplanationWrite) { pending in
			Button(pending.isRewrite ? "Rewrite explanations" : "Write explanations") {
				viewModel.confirmExplanationWrite()
			}
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsWriteExplanationsConfirm)
			Button("Cancel", role: .cancel) {
				viewModel.pendingExplanationWrite = nil
			}
		} message: { pending in
			Text("Claude writes plain-words subtitles for \(pending.id) in English and Bahasa Indonesia, once. Explained replays and demo videos reuse them without Claude, and they travel in run bundles.")
		}
		.alert(actionFailedTitle, isPresented: isActionMessagePresented) {
			Button("OK") {
				viewModel.dismissMessage()
			}
		} message: {
			Text(viewModel.actionMessage ?? "")
		}
		.accessibilityIdentifier(TestForgeConstants.Accessibility.tests)
	}

	private var headerActions: TestDocumentHeaderActions {
		TestDocumentHeaderActions(
			onLoad: { viewModel.isLoadSheetPresented = true },
			onExport: { companions.sessionExport.begin() },
			onReplayStale: { viewModel.replayStaleCases() },
			onRunAll: { companions.batchPlan.request(caseIds: viewModel.visibleCaseIds) },
			onVerify: { companions.verifyChanges.begin() },
			isStartingStaleReplay: viewModel.isBusy(.replayStale)
		)
	}

	private var listColumn: some View {
		VStack(spacing: 0) {
			if let header = viewModel.header {
				TestDocumentHeaderView(header: header, actions: headerActions)
				.disabled(viewModel.isRunInProgress)
				Divider()
				TestCaseFilterBarView(filter: $viewModel.filter)
				Divider()
			}
			listContent
		}
	}

	@ViewBuilder
	private var listContent: some View {
		switch viewModel.listState {
			case .notLoaded:
				EmptyStateView(content: Self.noDocumentContent) {
					loadDocumentButton
				}
			case .loading:
				LoadingStateView(text: "Loading the test document…")
					.frame(maxWidth: .infinity, maxHeight: .infinity)
			case .loaded(let rows):
				TestCaseListView(rows: rows, selection: $viewModel.selectedCaseId)
			case .noMatches:
				ContentUnavailableView.search(text: viewModel.searchText)
		}
	}

	@ViewBuilder
	private var detailColumn: some View {
		if let detail = viewModel.detail {
			let actions = TestCaseDetailActions(
				canReplay: viewModel.canReplaySelected,
				canRunWithClaude: viewModel.canRunSelected,
				canChange: viewModel.canRunSelected,
				busyAction: viewModel.busyAction,
				replay: { viewModel.replaySelectedCase() },
				runWithClaude: { viewModel.requestClaudeRun() },
				edit: { viewModel.beginEditingSelected() },
				overrideResult: { viewModel.beginOverrideSelected() },
				revertEdit: { viewModel.requestRevertSelected() },
				postToJira: { companions.jiraPost.begin(caseId: detail.id) },
				replayMenu: replayMenuActions
			)
			let panels = TestCaseDetailPanels(media: viewModel.media, inputs: companions.caseInputs)
			TestCaseDetailView(detail: detail, actions: actions, panels: panels)
		} else {
			EmptyStateView(content: Self.noSelectionContent)
		}
	}

	private var loadDocumentButton: some View {
		Button("Load test document…") {
			viewModel.isLoadSheetPresented = true
		}
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsLoadButton)
		.tutorialAnchor(.testsLoadButton)
	}

	private var listToggleButton: some View {
		Button {
			viewModel.isListPresented.toggle()
		} label: {
			Label("Test list", systemImage: "sidebar.squares.leading")
		}
		.keyboardShortcut("l", modifiers: [.command, .option])
		.help("Show or hide the test list (⌥⌘L). Hide it, the live steps and the sidebar to make room for the Simulator.")
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsListToggle)
		.tutorialAnchor(.testsListToggle)
	}

	private var inspectorToggleButton: some View {
		Button {
			viewModel.isInspectorPresented.toggle()
		} label: {
			Label("Live steps", systemImage: "sidebar.trailing")
		}
		.help("Show or hide live steps")
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsInspectorToggle)
	}

	private static let noDocumentContent = EmptyStateContent(
		title: "No test document",
		systemImage: "doc.text.magnifyingglass",
		message: "Load the Confluence page or file that lists your test cases."
	)

	private static let noSelectionContent = EmptyStateContent(
		title: "Select a case",
		systemImage: "list.bullet.rectangle",
		message: "Its steps, expected result and last run show here."
	)

	private var claudeRunTitle: Text {
		Text("Run with Claude?")
	}

	private var revertTitle: Text {
		Text("Revert to the document's text?")
	}

	private var explanationWriteTitle: Text {
		Text("Write explanations with Claude?")
	}

	private var actionFailedTitle: Text {
		Text("That didn't work")
	}

	private var replayMenuActions: TestCaseReplayActions {
		let viewModel = viewModel
		return TestCaseReplayActions(
			canReplay: viewModel.canReplaySelected,
			isWriting: viewModel.isWritingExplanations,
			canWrite: viewModel.canRunSelected,
			busyAction: viewModel.busyAction,
			replay: { viewModel.replaySelectedCase() },
			replayExplained: { viewModel.replaySelectedWithExplanations() },
			recordDemo: { viewModel.recordSelectedDemo() },
			writeExplanations: { viewModel.requestExplanationWrite() }
		)
	}

	private var isExplanationWritePresented: Binding<Bool> {
		Binding {
			viewModel.pendingExplanationWrite != nil
		} set: { isPresented in
			if !isPresented {
				viewModel.pendingExplanationWrite = nil
			}
		}
	}

	private var isRevertConfirmationPresented: Binding<Bool> {
		Binding {
			viewModel.pendingRevertCaseId != nil
		} set: { isPresented in
			if !isPresented {
				viewModel.pendingRevertCaseId = nil
			}
		}
	}

	private var isClaudeRunConfirmationPresented: Binding<Bool> {
		Binding {
			viewModel.pendingClaudeRun != nil
		} set: { isPresented in
			if !isPresented {
				viewModel.pendingClaudeRun = nil
			}
		}
	}

	private var isActionMessagePresented: Binding<Bool> {
		Binding {
			viewModel.actionMessage != nil
		} set: { isPresented in
			if !isPresented {
				viewModel.dismissMessage()
			}
		}
	}

	private var liveStepsActions: LiveStepsActions {
		let viewModel = viewModel
		return LiveStepsActions(
			isStopping: viewModel.isStopping,
			stop: { viewModel.stopActiveRun() },
			showClaudeSession: { sessionId in viewModel.showClaudeSession(sessionId) }
		)
	}
}
