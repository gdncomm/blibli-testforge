import SwiftUI

/// What the last button did, what is running now, and why buttons are locked.
struct BuildStatusSectionView: View {
	@ObservedObject var viewModel: BuildSectionViewModel

	var body: some View {
		Section {
			if viewModel.isLocked {
				Label("A test or scan is using the phone. Building and cleaning unlock when it finishes.", systemImage: "lock")
					.foregroundStyle(.orange)
			}
			if let title = viewModel.runningActionTitle {
				HStack(spacing: TestForgeConstants.Spacing.medium) {
					ProgressView()
						.controlSize(.small)
					Text("\(title)…")
				}
			} else if let result = viewModel.lastResult {
				Label {
					Text("\(result.title): \(result.message)")
						.textSelection(.enabled)
						.lineLimit(TestForgeConstants.Build.resultLineLimit)
				} icon: {
					Image(systemName: result.isSuccess ? "checkmark.circle" : "exclamationmark.triangle")
						.foregroundStyle(result.isSuccess ? Color.green : Color.orange)
				}
			} else {
				Text("Xcode must be installed, but it never needs to be open. Every button here runs one command; the console shows it.")
					.foregroundStyle(.secondary)
			}
		}
		.accessibilityIdentifier(TestForgeConstants.Accessibility.buildStatus)
	}
}
