import SwiftUI

struct ProjectSettingsView<Setup: SetupPresenting, Updates: UpdatePresenting>: View {
	let dashboardDirectory: URL
	@ObservedObject var setup: Setup
	@ObservedObject var updates: Updates

	var body: some View {
		Form {
			LabeledContent("QA server folder") {
				Text(dashboardDirectory.path)
					.textSelection(.enabled)
					.foregroundStyle(.secondary)
			}
			LabeledContent("TestForge checkout") {
				Button("Change checkout…", action: setup.changeRepo)
					.accessibilityIdentifier(SetupConstants.Accessibility.changeRepoButton)
			}
			if let message = setup.message {
				Text(message)
					.font(.callout)
					.foregroundStyle(.red)
			}
			Text("TestForge reopens with the checkout you choose. TEST_FORGE_SERVER_DIR and TEST_FORGE_PROJECT_DIR, when set, still win.")
				.font(.callout)
				.foregroundStyle(.secondary)
			UpdateSettingsSectionView(viewModel: updates)
		}
		.formStyle(.grouped)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.settingsProject)
	}
}
