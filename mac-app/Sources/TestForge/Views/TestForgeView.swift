import SwiftUI

/// Main window: sidebar, the selected section, and the bottom console (board C1 layout).
struct TestForgeView: View {
	@ObservedObject var viewModel: TestForgeViewModel
	@ObservedObject var preferences: TestForgePreferences
	@Environment(\.openWindow) private var openWindow

	var body: some View {
		if viewModel.isSetupNeeded {
			SetupView(viewModel: viewModel.setupViewModel)
		} else {
			testforge
				.runPromptSheet(viewModel: viewModel.runPromptViewModel)
		}
	}

	@ViewBuilder
	private var testforge: some View {
		NavigationSplitView(columnVisibility: $viewModel.sidebarVisibility) {
			SidebarView(selection: $viewModel.selectedSection, badges: viewModel.sidebarBadges)
				.navigationSplitViewColumnWidth(min: TestForgeConstants.Window.sidebarMinWidth, ideal: TestForgeConstants.Window.sidebarMinWidth)
		} detail: {
			// VSplitView is AppKit-backed and lays its panes out under the toolbar; the reader's inset puts them below it.
			GeometryReader { proxy in
				detailSplit
					.padding(.top, proxy.safeAreaInsets.top)
			}
			.ignoresSafeArea(.container, edges: .top)
		}
		.toolbar {
			ToolbarItemGroup(placement: .primaryAction) {
				TestBatchToolbarView(viewModel: viewModel.testBatchViewModel)
				SimulatorToolbarView(isOutlineOn: $preferences.isStepOverlayOn, actions: simulatorActions)
				ConnectionStatusView(status: viewModel.connectionStatus) {
					viewModel.reconnect()
				}
				consoleToggleButton
				TutorialHelpMenuView(
					features: viewModel.tutorialFeaturesOnScreen,
					start: { feature in viewModel.startTutorial(feature) },
					startDemo: { viewModel.demoViewModel.start() },
					showWelcome: { viewModel.onboardingViewModel.present() }
				)
			}
		}
		.safeAreaInset(edge: .bottom, spacing: 0) {
			if preferences.isUsageBarShown {
				VStack(spacing: 0) {
					Divider()
					UsageBarView(viewModel: viewModel.usageBarViewModel)
				}
			}
		}
		.modifier(OnboardingSheetModifier(viewModel: viewModel.onboardingViewModel))
		.onAppear {
			viewModel.onboardingViewModel.presentIfFirstTime()
			viewModel.sectionDidAppear()
		}
		.onChange(of: viewModel.selectedSection) {
			viewModel.sectionDidAppear()
		}
		.onReceive(viewModel.advancedViewModel.$selectedPanel.removeDuplicates().dropFirst()) { _ in
			viewModel.sectionDidAppear()
		}
		.navigationTitle(Text(viewModel.selectedSection.title))
		.accessibilityIdentifier(TestForgeConstants.Accessibility.window)
	}

	@ViewBuilder
	private var detailSplit: some View {
		VSplitView {
			sectionContent
				.safeAreaInset(edge: .top, spacing: 0) {
					DemoBannerContainerView(viewModel: viewModel.demoViewModel)
				}
				.frame(
					maxWidth: .infinity,
					minHeight: TestForgeConstants.Window.sectionMinHeight,
					idealHeight: TestForgeConstants.Window.sectionIdealHeight,
					maxHeight: .infinity
				)
				.layoutPriority(1)
			if viewModel.isConsoleVisible {
				ConsoleSectionView(viewModel: viewModel.consoleViewModel)
					.frame(
						minHeight: TestForgeConstants.Console.minHeight,
						idealHeight: TestForgeConstants.Console.idealHeight,
						maxHeight: TestForgeConstants.Console.maxHeight
					)
			}
		}
	}

	@ViewBuilder
	private var sectionContent: some View {
		switch viewModel.selectedSection {
			case .getReady:
				GetReadySectionView(viewModel: viewModel.getReadyViewModel, companions: viewModel.getReadyCompanions)
			case .claude:
				ClaudeSectionView(viewModel: viewModel.claudeViewModel, remoteControl: viewModel.remoteControlViewModel)
			case .tests:
				TestsSectionView(viewModel: viewModel.testsViewModel, companions: viewModel.testsCompanions)
			case .scan:
				ScanContainerView(scanViewModel: viewModel.scanViewModel, flowMapViewModel: viewModel.flowMapViewModel)
			case .results:
				ResultsSectionView(
					viewModel: viewModel.resultsViewModel,
					bundleImport: viewModel.resultsViewModel.bundleImportViewModel,
					proofViewer: viewModel.proofViewerViewModel
				)
			case .reports:
				ReportsSectionView(
					viewModel: viewModel.reportsViewModel,
					sessionReport: viewModel.sessionReportViewModel,
					demoLibrary: viewModel.demoLibraryViewModel,
					batchReports: viewModel.batchReportsViewModel,
					navigator: viewModel.reportsNavigator
				)
			case .advanced:
				AdvancedSectionView(viewModel: viewModel.advancedViewModel)
			case .network:
				NetworkConsoleView(viewModel: viewModel.networkConsoleViewModel)
			case .simulator:
				SimulatorControlSectionView(viewModel: viewModel.simulatorControlViewModel)
			case .build:
				BuildSectionView(viewModel: viewModel.buildViewModel, resetViewModel: viewModel.resetViewModel)
			case .docs:
				DocsSectionView(viewModel: viewModel.docsViewModel)
		}
	}

	private var simulatorActions: SimulatorToolbarActions {
		SimulatorToolbarActions(
			measure: { openWindow(id: TestForgeConstants.Window.measureWindowId) }
		)
	}

	private var consoleToggleButton: some View {
		Button {
			viewModel.toggleConsole()
		} label: {
			Label("Console", systemImage: "rectangle.bottomthird.inset.filled")
		}
		.help("Show or hide the console (⌘⇧Y)")
		.accessibilityIdentifier(TestForgeConstants.Accessibility.consoleToggleButton)
		.tutorialAnchor(.consoleToggle)
	}
}
