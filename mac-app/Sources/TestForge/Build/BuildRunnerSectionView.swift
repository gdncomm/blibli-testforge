import SwiftUI

/// The test runner on the QA simulator, which drives the app during runs.
struct BuildRunnerSectionView: View {
	@ObservedObject var viewModel: BuildSectionViewModel

	var body: some View {
		Section {
			Button(action: viewModel.stopRunner) {
				ActionProgressLabel(
					title: String(localized: "Stop test runner"),
					busyTitle: String(localized: "Stopping…"),
					isBusy: viewModel.isRunning(.stopRunner)
				)
			}
				.disabled(!viewModel.canAct)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildRunnerStopButton)
		} header: {
			Text("Test runner")
		} footer: {
			Text("Runs and Install for testing start it. Stop it to free the phone.")
				.foregroundStyle(.secondary)
		}
	}
}
