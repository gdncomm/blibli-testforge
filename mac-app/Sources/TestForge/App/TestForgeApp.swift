import AppKit
import SwiftUI
import TipKit

struct TestForgeApp: App {
	@StateObject private var viewModel: TestForgeViewModel
	@StateObject private var appearance: AppearanceModel
	@StateObject private var preferences: TestForgePreferences

	init() {
		// `swift run` launches a bare executable; a regular policy gives it a Dock icon and menu bar.
		NSApplication.shared.setActivationPolicy(.regular)
		try? Tips.configure([.displayFrequency(.immediate)])
		let testForgePreferences = TestForgePreferences()
		_preferences = StateObject(wrappedValue: testForgePreferences)
		let testForgeViewModel = Self.makeInitialViewModel(preferences: testForgePreferences)
		_viewModel = StateObject(wrappedValue: testForgeViewModel)
		let appearanceModel = AppearanceModel(application: NSApplication.shared)
		_appearance = StateObject(wrappedValue: appearanceModel)
	}

	var body: some Scene {
		Window("TestForge", id: TestForgeConstants.Window.mainWindowId) {
			TestForgeView(viewModel: viewModel, preferences: preferences)
				.frame(minWidth: viewModel.windowMinWidth, minHeight: TestForgeConstants.Window.minHeight)
				.environmentObject(viewModel.tutorials)
				.onAppear {
					viewModel.start()
				}
		}
		.commands {
			TestForgeCommands(viewModel: viewModel, preferences: preferences, updates: viewModel.updateViewModel)
		}
		Window("Measure", id: TestForgeConstants.Window.measureWindowId) {
			MeasureView(viewModel: viewModel.measureViewModel)
				.environmentObject(viewModel.tutorials)
		}
		Window("Docs", id: DocsConstants.windowId) {
			DocsWindowView(viewModel: viewModel.docsViewModel)
				.environmentObject(viewModel.tutorials)
		}
		Window("Proof", id: TestForgeConstants.Window.proofViewerWindowId) {
			ProofViewerView(viewModel: viewModel.proofViewerViewModel)
				.frame(minWidth: TestForgeConstants.ProofViewer.windowMinWidth, minHeight: TestForgeConstants.ProofViewer.windowMinHeight)
		}
		Settings {
			SettingsView(viewModel: viewModel, appearance: appearance)
		}
		MenuBarExtra(isInserted: menuBarInsertion) {
			MenuBarStatusView(viewModel: viewModel.runActivityViewModel, actions: menuBarActions)
		} label: {
			MenuBarLabelView(viewModel: viewModel.runActivityViewModel)
		}
	}

	/// `MenuBarExtra` writes its insertion state back on every update; passing that write through re-publishes the
	/// preference, re-evaluates this body and loops at full CPU, so only a real change is stored.
	private var menuBarInsertion: Binding<Bool> {
		let preferences = preferences
		return Binding {
			preferences.isMenuBarItemShown
		} set: { isShown in
			guard preferences.isMenuBarItemShown != isShown else {
				return
			}
			preferences.isMenuBarItemShown = isShown
		}
	}

	private var menuBarActions: MenuBarActions {
		let application = NSApplication.shared
		return MenuBarActions(
			openTestForge: { application.activate(ignoringOtherApps: true) },
			quit: { application.terminate(nil) }
		)
	}

	@MainActor
	private static func makeInitialViewModel(preferences: TestForgePreferences) -> TestForgeViewModel {
		let opener = TestForgeOpener()
		return opener.makeTestForgeViewModel(preferences: preferences)
	}
}

/// `@StateObject` must be created before `self` exists, so the factory runs on this stateless conformer.
private struct TestForgeOpener: TestForgeOpening {}
