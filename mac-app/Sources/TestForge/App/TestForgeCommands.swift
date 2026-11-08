import SwiftUI

/// Xcode-style shortcuts: ⌘1–⌘8 sections, ⌘⇧Y console, ⌘R run, ⌘. stop; plus Simulator tools and server actions.
struct TestForgeCommands: Commands {
	@ObservedObject var viewModel: TestForgeViewModel
	@ObservedObject var preferences: TestForgePreferences
	@ObservedObject var updates: UpdateViewModel
	@Environment(\.openWindow) private var openWindow
	@Environment(\.openSettings) private var openSettings

	var body: some Commands {
		CommandGroup(after: .sidebar) {
			Button("Show or Hide Console") {
				viewModel.toggleConsole()
			}
			.keyboardShortcut("y", modifiers: [.command, .shift])
			Toggle("Show Claude Usage", isOn: $preferences.isUsageBarShown)
				.keyboardShortcut("u", modifiers: [.command, .option])
			Divider()
			ForEach(TestForgeSection.allCases) { section in
				Button {
					viewModel.selectedSection = section
				} label: {
					Text(section.title)
				}
				.keyboardShortcut(section.shortcutKey, modifiers: .command)
			}
		}
		CommandMenu("Test") {
			Button("Run Selected Case") {
				viewModel.selectedSection = .tests
				viewModel.testsViewModel.runSelectedCase()
			}
			.keyboardShortcut("r", modifiers: .command)
			Button("Stop Run") {
				viewModel.testsViewModel.stopActiveRun()
			}
			.keyboardShortcut(".", modifiers: .command)
			Divider()
			Button("Load Test Document…") {
				viewModel.selectedSection = .tests
				viewModel.testsViewModel.isLoadSheetPresented = true
			}
		}
		CommandMenu("Simulator") {
			Toggle("Outline Steps", isOn: $preferences.isStepOverlayOn)
				.keyboardShortcut("o", modifiers: [.command, .option])
			Button("Measure") {
				openWindow(id: TestForgeConstants.Window.measureWindowId)
			}
			.keyboardShortcut("m", modifiers: [.command, .option])
		}
		CommandGroup(after: .appInfo) {
			Button(updates.menuTitle) {
				UserDefaults.standard.set(SettingsTab.project.rawValue, forKey: SettingsTab.storageKey)
				openSettings()
				updates.check()
			}
			.disabled(viewModel.isSetupNeeded || updates.activity.isBusy)
			.accessibilityIdentifier(UpdateConstants.Accessibility.menuItem)
		}
		CommandGroup(after: .newItem) {
			Button("Open Markdown…") {
				openWindow(id: TestForgeConstants.Window.mainWindowId)
				viewModel.openMarkdownFiles()
			}
			.keyboardShortcut("o", modifiers: .command)
			.disabled(viewModel.isSetupNeeded)
			.accessibilityIdentifier(DocsConstants.Accessibility.openMenuItem)
			Button("Docs Window") {
				openWindow(id: DocsConstants.windowId)
			}
			.disabled(viewModel.isSetupNeeded)
		}
		CommandGroup(before: .help) {
			Button("Welcome to TestForge") {
				viewModel.onboardingViewModel.present()
			}
			.disabled(viewModel.isSetupNeeded)
			Button("TestForge Usage Guide") {
				openWindow(id: TestForgeConstants.Window.mainWindowId)
				viewModel.showDoc(atRepoPath: DocsCatalog.usageGuidePath)
			}
			.disabled(viewModel.isSetupNeeded)
			Button("TestForge Features") {
				openWindow(id: TestForgeConstants.Window.mainWindowId)
				viewModel.showDoc(atRepoPath: DocsCatalog.featuresPath)
			}
			.disabled(viewModel.isSetupNeeded)
		}
		CommandMenu("Server") {
			Button("Reconnect Live Updates") {
				viewModel.reconnect()
			}
			Button("Restart Server") {
				viewModel.restartServer()
			}
			.disabled(!viewModel.canRestartServer)
		}
	}

}
