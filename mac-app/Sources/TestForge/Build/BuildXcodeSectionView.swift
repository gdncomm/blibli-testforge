import SwiftUI

/// Which Xcode the builds use, plus opening the workspace, launching a built app and fixing Swift packages.
struct BuildXcodeSectionView: View {
	@ObservedObject var viewModel: BuildSectionViewModel

	var body: some View {
		Section {
			infoRows
			HStack {
				Button(action: viewModel.openWorkspace) {
					ActionProgressLabel(
						title: String(localized: "Open workspace in Xcode"),
						busyTitle: String(localized: "Opening Xcode…"),
						isBusy: viewModel.isRunning(.openWorkspace)
					)
				}
					.disabled(!viewModel.canOpenWorkspace)
					.help(viewModel.workspacePath ?? "")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.buildOpenWorkspaceButton)
					.tutorialAnchor(.buildXcodeSection)
			}
			HStack {
				Picker("Last build", selection: $viewModel.launchSource) {
					Text("QA build").tag(LaunchSource.testForgeBuild)
					Text("My Xcode build").tag(LaunchSource.xcodeBuild)
				}
				.fixedSize()
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildLaunchSourcePicker)
				Button(action: viewModel.installAndLaunchLastBuild) {
					ActionProgressLabel(
						title: String(localized: "Install & launch"),
						busyTitle: String(localized: "Installing…"),
						isBusy: viewModel.isRunning(.installAndLaunch)
					)
				}
					.disabled(!viewModel.canAct)
					.help("Installs the newest built app on the Simulator screen's device (else the QA simulator) and launches it; Xcode can be closed")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.buildInstallLaunchButton)
			}
			Button {
				viewModel.isPackageResetConfirmationShown = true
			} label: {
				ActionProgressLabel(
					title: String(localized: "Fix Swift package errors…"),
					busyTitle: String(localized: "Cleaning and reopening Xcode…"),
					isBusy: viewModel.isRunning(.packageReset)
				)
			}
			.disabled(!viewModel.canAct)
			.help("For errors after a Swift package or plugin was updated or changed")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.buildPackageResetButton)
		} header: {
			Text("Xcode")
		} footer: {
			Text("Open workspace opens your own clone. Install & launch puts a built app on the Simulator screen's device for a quick look.")
				.foregroundStyle(.secondary)
		}
		.confirmationDialog("Fix Swift package errors?", isPresented: $viewModel.isPackageResetConfirmationShown) {
			Button("Quit Xcode and clean", role: .destructive, action: viewModel.confirmPackageReset)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildPackageResetConfirmButton)
		} message: {
			Text("1. Quits Xcode (it may ask to save). 2. Deletes Xcode DerivedData. 3. Deletes the Swift package cache and settings.")
			+ Text(" 4. Opens the workspace again. Packages download again on open, which may need the VPN.")
		}
	}

	@ViewBuilder
	private var infoRows: some View {
		switch viewModel.xcodeState {
			case .loading:
				ProgressView()
					.controlSize(.small)
			case .failed(let message):
				Label(message, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.orange)
			case .loaded(let info):
				Group {
					LabeledContent("Version", value: info.version)
					LabeledContent("Selected", value: info.developerDirectory)
				}
				.textSelection(.enabled)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.buildXcodeInfo)
		}
	}
}
