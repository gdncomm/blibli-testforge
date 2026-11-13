import SwiftUI

/// A thin bar along the bottom of the window, like the Claude Code CLI status line (D-149).
struct UsageBarView<ViewModel: UsageBarPresenting>: View {
	@ObservedObject var viewModel: ViewModel

	var body: some View {
		HStack(spacing: TestForgeConstants.Spacing.large) {
			Image(systemName: "sparkles")
				.foregroundStyle(.secondary)
			content
			Spacer()
			accountContent
		}
		.font(.callout.monospaced())
		.padding(.horizontal, TestForgeConstants.Spacing.medium)
		.padding(.vertical, TestForgeConstants.Spacing.small)
		.background(.bar)
		.confirmationDialog("Connect Claude Code's status line?", isPresented: $viewModel.isConnectConfirmationPresented) {
			Button("Connect", action: viewModel.connect)
			Button("Cancel", role: .cancel) {
				viewModel.isConnectConfirmationPresented = false
			}
		} message: {
			Text("One marked line is added to your status-line script so it also copies its figures to ~/.test-forge/usage.json. Remove that line to undo.")
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(UsageBarConstants.Accessibility.bar)
	}

	@ViewBuilder
	private var accountContent: some View {
		let summary = viewModel.accountSummary
		Label(summary.accountText, systemImage: summary.isSignedIn ? "person.crop.circle.badge.checkmark" : "person.crop.circle.badge.xmark")
			.foregroundStyle(summary.isSignedIn ? Color.secondary : Color.red)
			.lineLimit(1)
			.accessibilityIdentifier(UsageBarConstants.Accessibility.account)
		HStack(spacing: TestForgeConstants.Spacing.small) {
			Text("rc:")
				.bold()
			Text(summary.remoteControlText)
		}
		.foregroundStyle(summary.isRemoteControlOn ? Color.green : Color.secondary)
		.help(summary.remoteControlHelp)
		.accessibilityElement(children: .combine)
		.accessibilityIdentifier(UsageBarConstants.Accessibility.remoteControl)
	}

	@ViewBuilder
	private var connectControl: some View {
		if viewModel.isConnecting {
			HStack(spacing: TestForgeConstants.Spacing.small) {
				ProgressView()
					.controlSize(.small)
				Text("Connecting…")
					.foregroundStyle(.secondary)
			}
			.accessibilityElement(children: .combine)
			.accessibilityIdentifier(UsageBarConstants.Accessibility.connecting)
		} else {
			Button(isShowingFigures ? "Reconnect status line…" : "Connect Claude Code status line…", action: viewModel.askToConnect)
				.buttonStyle(.link)
				.accessibilityIdentifier(UsageBarConstants.Accessibility.connectButton)
			if let connectError = viewModel.connectError {
				Label(connectError, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.orange)
					.lineLimit(1)
					.help(connectError)
					.accessibilityIdentifier(UsageBarConstants.Accessibility.connectFailure)
			}
		}
	}

	private var isShowingFigures: Bool {
		if case .showing = viewModel.state {
			return true
		}
		return false
	}

	@ViewBuilder
	private var content: some View {
		switch viewModel.state {
			case .noData:
				Text(viewModel.message ?? String(localized: "Claude usage — nothing reported yet"))
					.foregroundStyle(.secondary)
					.lineLimit(1)
				if viewModel.message == nil {
					connectControl
				}
			case .showing(let segments, let model, let freshness, let isStale):
				if let model {
					Text(model)
						.foregroundStyle(.teal)
						.accessibilityIdentifier(UsageBarConstants.Accessibility.model)
				}
				ForEach(segments) { segment in
					UsageSegmentView(segment: segment)
				}
				if let freshness {
					Text(freshness)
						.foregroundStyle(.secondary)
						.help("Figures come from Claude Code's status line. They stop updating when no terminal Claude is open, or when the status-line script was replaced and lost its TestForge line.")
						.accessibilityIdentifier(UsageBarConstants.Accessibility.freshness)
				}
				if isStale {
					connectControl
				}
		}
	}
}
