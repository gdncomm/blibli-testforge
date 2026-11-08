import SwiftUI

struct TestCaseDetailActions {
	let canReplay: Bool
	let canRunWithClaude: Bool

	/// False while a run starts or runs, so editing waits for Stop or the end of the run.
	let canChange: Bool

	/// D-213: the request in flight, shown as a spinner on the button that started it.
	let busyAction: TestCaseAction?

	let replay: () -> Void
	let runWithClaude: () -> Void
	let edit: () -> Void
	let overrideResult: () -> Void
	let revertEdit: () -> Void
	let postToJira: () -> Void
	let replayMenu: TestCaseReplayActions
}

/// The panels under a case's fields, each observing its own model.
struct TestCaseDetailPanels {
	let media: TestCaseMediaViewModel
	let inputs: CaseInputsViewModel
}

struct TestCaseDetailView: View {
	let detail: TestCaseDetailModel
	let actions: TestCaseDetailActions
	let panels: TestCaseDetailPanels

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.large) {
				titleSection
				if let notice = detail.editNotice {
					TestCaseEditNoticeView(notice: notice, isReverting: actions.busyAction == .revert, revert: actions.revertEdit)
						.disabled(!actions.canChange)
				}
				actionBar
				lastRunSection
				ForEach(detail.fields) { field in
					fieldSection(field: field)
				}
				CaseInputsPanelView(viewModel: panels.inputs, macroId: detail.recordingId)
				TestCaseMediaPanelView(viewModel: panels.media)
			}
			.padding(TestForgeConstants.Spacing.extraLarge)
			.frame(maxWidth: .infinity, alignment: .leading)
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsDetail)
	}

	private var titleSection: some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			Text(detail.id)
				.font(.title2.monospaced().weight(.semibold))
			Text(detail.scenario)
				.font(.title3)
				.textSelection(.enabled)
			if let documentScenario = detail.documentScenario {
				documentTextLine(text: documentScenario, fieldId: "scenario")
			}
		}
	}

	private var actionBar: some View {
		HStack(spacing: TestForgeConstants.Spacing.medium) {
			if let recordingName = detail.recordingName {
				TestCaseReplayMenuView(recordingName: recordingName, hasExplanations: detail.hasExplanations, actions: actions.replayMenu)
			}
			let runWithClaudeBusyTitle = busyTitle(for: [.runWithClaude, .overrideAndRerun])
			Button {
				actions.runWithClaude()
			} label: {
				BusyActionLabel(title: String(localized: "Run with Claude…"), systemImage: "sparkles", busyTitle: runWithClaudeBusyTitle)
			}
			.disabled(!actions.canRunWithClaude)
			.help("Claude explores the app and judges the case. A pass counts once a replay of its saved recording passes too.")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRunClaudeButton)
			.tutorialAnchor(.testsRunClaudeButton)
			Button {
				actions.edit()
			} label: {
				Label("Edit…", systemImage: "pencil")
			}
			.keyboardShortcut("e", modifiers: .command)
			.disabled(!actions.canChange)
			.help("Correct this case's text for runs on this Mac — the document is never changed (⌘E)")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsEditButton)
			.tutorialAnchor(.testsEditButton)
			Button {
				actions.overrideResult()
			} label: {
				Label("Override result…", systemImage: "checkmark.seal")
			}
			.keyboardShortcut("o", modifiers: [.command, .shift])
			.disabled(!actions.canChange)
			.help("Set this case's result yourself, with a description of why; optionally rerun it with your notes (⇧⌘O)")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsOverrideButton)
			.tutorialAnchor(.testsOverrideButton)
			Button {
				actions.postToJira()
			} label: {
				Label("Post to Jira…", systemImage: "ticket")
			}
			.disabled(!actions.canChange || !detail.hasResult)
			.help("Post this case's result as a comment on its Jira ticket — you read and confirm it first")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsJiraButton)
			.tutorialAnchor(.testsJiraButton)
			if let recordingName = detail.recordingName {
				Text("Recording: \(recordingName)")
					.font(.caption)
					.foregroundStyle(.secondary)
					.lineLimit(1)
			}
		}
	}

	private var lastRunSection: some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			TestCaseReplayStatusView(badge: detail.replayBadge)
			Text("Last run")
				.font(.headline)
			HStack(spacing: TestForgeConstants.Spacing.medium) {
				VerdictBadgeView(text: detail.lastRunText, tone: detail.lastRunTone)
			}
			if let unconfirmedText = detail.unconfirmedText {
				Label(unconfirmedText, systemImage: "bolt.badge.clock")
					.font(.callout)
					.foregroundStyle(.orange)
					.fixedSize(horizontal: false, vertical: true)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsUnconfirmedText)
			}
			if let staleText = detail.staleText {
				Label(staleText, systemImage: "clock.arrow.circlepath")
					.font(.callout)
					.foregroundStyle(.orange)
					.fixedSize(horizontal: false, vertical: true)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsStaleText)
			}
			if let ticketsText = detail.ticketsText {
				Label(ticketsText, systemImage: "ticket")
					.font(.callout)
					.foregroundStyle(.secondary)
					.textSelection(.enabled)
					.help("From the test case document")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsTickets)
			}
			if let builtText = detail.builtText {
				Label(builtText, systemImage: "hammer")
					.font(.callout)
					.foregroundStyle(.secondary)
					.textSelection(.enabled)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsBuiltText)
			}
			if let setupText = detail.setupText {
				Label(setupText, systemImage: "iphone.gen3")
					.font(.callout)
					.foregroundStyle(.secondary)
					.help("Before step 1 a replay brings the app here; Claude sets this on the case's first run")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsSetup)
					.tutorialAnchor(.testsSetup)
			}
			if let overrideNote = detail.overrideNote {
				Text(overrideNote)
					.font(.callout)
					.foregroundStyle(.secondary)
					.textSelection(.enabled)
					.fixedSize(horizontal: false, vertical: true)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsOverrideNote)
			}
		}
	}

	private func busyTitle(for startingActions: [TestCaseAction]) -> String? {
		guard let busyAction = actions.busyAction,
			startingActions.contains(busyAction)
		else {
			return nil
		}
		return String(localized: "Starting…")
	}

	private func fieldSection(field: TestCaseField) -> some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			Text(field.title)
				.font(.headline)
			Text(field.text)
				.textSelection(.enabled)
				.fixedSize(horizontal: false, vertical: true)
			if let documentText = field.documentText {
				documentTextLine(text: documentText, fieldId: field.id)
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsFieldPrefix + field.id)
	}

	private func documentTextLine(text: String, fieldId: String) -> some View {
		let shownText = text.isEmpty ? String(localized: "(empty)") : text
		return Text("Document says: \(shownText)")
			.font(.callout)
			.foregroundStyle(.secondary)
			.strikethrough()
			.textSelection(.enabled)
			.fixedSize(horizontal: false, vertical: true)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsDocumentTextPrefix + fieldId)
	}
}
