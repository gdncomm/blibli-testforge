import SwiftUI

/// Claude section: status bar, the conversation, and the message box (D-133).
struct ClaudeSectionView<ViewModel: ClaudeSectionPresenting, RemoteControl: RemoteControlPresenting>: View {
	@ObservedObject var viewModel: ViewModel

	/// Remote Control (D-150) lives in this header: it hosts the same kind of sessions, driven from a phone.
	let remoteControl: RemoteControl

	var body: some View {
		VStack(spacing: 0) {
			header
			Divider()
			if let activity = viewModel.activity {
				ClaudeActivityStripView(activity: activity)
				Divider()
			}
			content
				.frame(maxWidth: .infinity, maxHeight: .infinity)
			Divider()
			if !viewModel.quickReplies.isEmpty {
				ClaudeQuickRepliesView(replies: viewModel.quickReplies, isAwaitingReply: viewModel.isAwaitingReply) { reply in
					viewModel.sendQuickReply(reply)
				}
			}
			ClaudeComposerView(viewModel: viewModel)
		}
		.onAppear(perform: viewModel.open)
		.sheet(isPresented: $viewModel.isShowingMcp) {
			ClaudeMcpSheetView(viewModel: viewModel.mcp) {
				viewModel.isShowingMcp = false
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(ClaudeConstants.Accessibility.section)
	}

	@ViewBuilder
	private var header: some View {
		HStack(spacing: TestForgeConstants.Spacing.medium) {
			ClaudeSessionSwitcherView(choices: viewModel.sessionChoices) { sessionId in
				viewModel.show(sessionId: sessionId)
			}
			Label(viewModel.statusTitle, systemImage: "sparkles")
			if case .ready(let summary) = viewModel.state {
				Text(summary.projectDir)
					.foregroundStyle(.secondary)
					.lineLimit(1)
					.truncationMode(.head)
			}
			Spacer()
			if let terminalError = viewModel.terminalErrorMessage {
				Label(terminalError, systemImage: "exclamationmark.triangle")
					.font(.caption)
					.foregroundStyle(.red)
					.lineLimit(1)
					.truncationMode(.tail)
					.help(terminalError)
					.accessibilityIdentifier(ClaudeConstants.Accessibility.terminalFailure)
			}
			Button(action: viewModel.openInTerminal) {
				ActionProgressLabel(title: String(localized: "Open in Terminal"), busyTitle: String(localized: "Opening…"), isBusy: viewModel.isOpeningTerminal)
			}
			.disabled(!viewModel.canOpenInTerminal)
			.help("Continue this conversation in a terminal (claude --resume) for /mcp, /plugin and every other terminal command. Send a message here later to pick it up again, terminal turns included.")
			.accessibilityIdentifier(ClaudeConstants.Accessibility.openInTerminalButton)
			.tutorialAnchor(.claudeOpenInTerminal)
			Button("MCP", systemImage: "server.rack", action: viewModel.showMcp)
				.disabled(!isReady)
				.help("MCP servers this conversation's Claude sees, with Reconnect. Typing /mcp does the same.")
				.accessibilityIdentifier(ClaudeConstants.Accessibility.mcpButton)
				.tutorialAnchor(.claudeMcp)
			RemoteControlButtonView(viewModel: remoteControl)
			Toggle("Details", isOn: $viewModel.showsDetails)
				.toggleStyle(.switch)
				.controlSize(.small)
				.help("Open every tool call and result in full — what Claude sent and what came back")
				.accessibilityIdentifier(ClaudeConstants.Accessibility.detailsToggle)
				.tutorialAnchor(.claudeDetailsToggle)
			if let stopError = viewModel.stopErrorMessage {
				Label(stopError, systemImage: "exclamationmark.triangle")
					.font(.caption)
					.foregroundStyle(.red)
					.lineLimit(1)
					.truncationMode(.tail)
					.help(stopError)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.claudeStopFailure)
			}
			Button(action: viewModel.stop) {
				ActionProgressLabel(
					title: String(localized: "Stop"),
					busyTitle: String(localized: "Stopping…"),
					isBusy: viewModel.isStopping
				)
			}
			.disabled(!viewModel.canStop || viewModel.isStopping)
			.accessibilityIdentifier(ClaudeConstants.Accessibility.stopButton)
			Button("New conversation", systemImage: "square.and.pencil", action: viewModel.startNewConversation)
				.help("Close this conversation and start a fresh one in the same repo")
				.accessibilityIdentifier(ClaudeConstants.Accessibility.newConversationButton)
		}
		.padding(TestForgeConstants.Spacing.medium)
	}

	@ViewBuilder
	private var content: some View {
		switch viewModel.state {
			case .notStarted, .opening:
				ProgressView(viewModel.statusTitle)
			case .failed(let reason):
				VStack(spacing: TestForgeConstants.Spacing.medium) {
					Text(reason)
						.foregroundStyle(.secondary)
					Button("Try again", action: viewModel.open)
						.accessibilityIdentifier(ClaudeConstants.Accessibility.retryButton)
				}
			case .ready:
				transcript
		}
	}

	@ViewBuilder
	private var transcript: some View {
		if viewModel.items.isEmpty {
			Text("Ask Claude anything about this repo or the app under test — runs, failures, mocks, code. It works in your repo with your plugins.")
				.foregroundStyle(.secondary)
				.multilineTextAlignment(.center)
				.padding(TestForgeConstants.Spacing.large)
		} else {
			ScrollViewReader { proxy in
				ScrollView {
					LazyVStack(alignment: .leading, spacing: TestForgeConstants.Spacing.medium) {
						ForEach(viewModel.items) { item in
							ClaudeTranscriptRowView(item: item, requests: viewModel.requestStates, showsDetails: viewModel.showsDetails, actions: requestActions)
						}
						Color.clear
							.frame(height: 1)
							.id(ClaudeConstants.Transcript.bottomAnchorId)
					}
					.padding(TestForgeConstants.Spacing.large)
				}
				.onChange(of: viewModel.items.count) {
					proxy.scrollTo(ClaudeConstants.Transcript.bottomAnchorId, anchor: .bottom)
				}
				.onAppear {
					proxy.scrollTo(ClaudeConstants.Transcript.bottomAnchorId, anchor: .bottom)
				}
			}
			.accessibilityIdentifier(ClaudeConstants.Accessibility.transcript)
		}
	}

	private var isReady: Bool {
		guard case .ready = viewModel.state else {
			return false
		}
		return true
	}

	private var requestActions: ClaudeRequestActions {
		let viewModel = viewModel
		return ClaudeRequestActions(
			approve: { requestId, isAlways in viewModel.approve(requestId: requestId, isAlways: isAlways) },
			deny: { requestId in viewModel.deny(requestId: requestId) },
			answer: { requestId, picks in viewModel.answer(requestId: requestId, picks: picks) }
		)
	}
}
