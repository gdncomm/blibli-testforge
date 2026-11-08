import SwiftUI

/// The app and tests built from the prepared code for the QA simulator: state, Build for testing and Stop.
struct BuildQASectionView: View {
	@ObservedObject var viewModel: BuildSectionViewModel

	var body: some View {
		Section {
			stateRow
				.tutorialAnchor(.buildQASection)
			if let code = viewModel.preparedCodeText {
				LabeledContent("Code", value: code)
					.textSelection(.enabled)
			}
			if let scheme = viewModel.schemeText {
				LabeledContent("Scheme", value: scheme)
			}
			HStack {
				Button(action: viewModel.installForTesting) {
					ActionProgressLabel(
						title: String(localized: "Install for testing"),
						busyTitle: String(localized: "Installing…"),
						isBusy: viewModel.isRunning(.installForTesting)
					)
				}
					.buttonStyle(.borderedProminent)
					.disabled(!viewModel.canBuild)
					.help("Builds first if needed, then installs the QA app and test runner on the QA simulator")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.buildInstallForTestingButton)
				Button {
					viewModel.isBuildConfirmationShown = true
				} label: {
					ActionProgressLabel(
						title: String(localized: "Build for testing…"),
						busyTitle: String(localized: "Starting build…"),
						isBusy: viewModel.isRunning(.build)
					)
				}
				.disabled(!viewModel.canBuild)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildStartButton)
				.tutorialAnchor(.buildStartButton)
				if viewModel.isBuilding {
					Button(role: .destructive, action: viewModel.stopBuild) {
						ActionProgressLabel(
							title: String(localized: "Stop build"),
							busyTitle: String(localized: "Stopping…"),
							isBusy: viewModel.isStoppingBuild
						)
					}
					.disabled(viewModel.isStoppingBuild)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.buildStopButton)
				}
				Spacer()
				checkAgainButton
			}
			if let failure = viewModel.failureMessage(for: .stopBuild) {
				Label(failure, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.orange)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.buildStopFailure)
			}
		} header: {
			Text("App and tests for the QA simulator")
		} footer: {
			Text("Puts the QA app and test runner on the QA simulator, building first when needed. Your own folder and Xcode builds stay untouched.")
				.foregroundStyle(.secondary)
		}
		.confirmationDialog("Build first?", isPresented: $viewModel.isBuildBeforeInstallShown) {
			Button("Build and install", action: viewModel.confirmBuildThenInstall)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildInstallConfirmButton)
		} message: {
			Text("The QA app isn't built from the prepared code yet. Build it (10–25 min the first time, may need VPN), then install it?")
		}
		.confirmationDialog("Build for testing?", isPresented: $viewModel.isBuildConfirmationShown) {
			Button("Build", action: viewModel.confirmBuild)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildConfirmButton)
		} message: {
			Text("Builds the prepared code for the QA simulator. A first build takes 10–25 min and may need the VPN; the test runner stops while it builds.")
		}
	}

	@ViewBuilder
	private var checkAgainButton: some View {
		if viewModel.isCheckingStatus {
			HStack(spacing: TestForgeConstants.Spacing.small) {
				ProgressView()
					.controlSize(.small)
				Text("Checking…")
					.foregroundStyle(.secondary)
			}
			.accessibilityElement(children: .combine)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.buildRefreshProgress)
		} else {
			Button("Check again", systemImage: "arrow.clockwise", action: viewModel.loadStatus)
				.labelStyle(.iconOnly)
				.help("Read the build state again")
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildRefreshButton)
		}
	}

	@ViewBuilder
	private var stateRow: some View {
		switch viewModel.statusState {
			case .loading:
				ProgressView()
					.controlSize(.small)
			case .failed(let message):
				Label(message, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.orange)
			case .loaded:
				if let presentation = viewModel.presentation {
					BuildStateRowView(presentation: presentation)
				}
		}
	}
}
