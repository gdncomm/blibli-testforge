import Foundation

/// Opens what a tutorial points at before it starts, so its first tip has a control to attach to.
extension TestForgeViewModel {
	var tutorialFeaturesOnScreen: [TutorialFeature] {
		TutorialFeature.features(for: selectedSection, panel: advancedViewModel.selectedPanel)
	}

	func startTutorial(_ feature: TutorialFeature) {
		prepareScreen(for: feature)
		tutorials.start(feature)
	}

	/// A section's own tutorial starts on its first visit; the console and Simulator ones only from the ? menu.
	func sectionDidAppear() {
		// Screen tips wait while the welcome tour is open; closing it calls back in here.
		guard !onboardingViewModel.isPresented else {
			return
		}
		if let activeFeature = tutorials.activeFeature,
			!tutorialFeaturesOnScreen.contains(activeFeature) {
			tutorials.pause()
		}
		guard let feature = tutorialFeaturesOnScreen.first else {
			return
		}
		prepareScreen(for: feature)
		tutorials.autoStart(feature)
	}

	func makeOnboardingActions() -> OnboardingActions {
		OnboardingActions(
			perform: { [weak self] action in
				self?.performOnboarding(action)
			},
			didClose: { [weak self] in
				self?.sectionDidAppear()
			}
		)
	}

	private func performOnboarding(_ action: OnboardingStartAction) {
		switch action {
			case .getReady:
				show(section: .getReady)
			case .demo:
				demoViewModel.start()
			case .claude, .remote:
				show(section: .claude)
			case .tips:
				tutorials.isAutoShowOn = true
				sectionDidAppear()
		}
	}

	private func prepareScreen(for feature: TutorialFeature) {
		switch feature {
			case .getReady:
				show(section: .getReady)
				isConsoleVisible = true
			case .tests, .besideSimulator:
				show(section: .tests)
				testsViewModel.isInspectorPresented = true
				testsViewModel.isListPresented = true
				selectFirstTestIfNone()
			case .console:
				isConsoleVisible = true
			case .scan:
				show(section: .scan)
			case .results:
				show(section: .results)
			case .reports:
				show(section: .reports)
			case .fakeData:
				showAdvanced(panel: .fakeData)
			case .recordedSteps:
				showAdvanced(panel: .recordedSteps)
			case .phoneRemote:
				showAdvanced(panel: .phoneRemote)
			case .measure:
				break
			case .simulatorControl:
				show(section: .simulator)
			case .build:
				show(section: .build)
			case .network:
				show(section: .network)
				networkConsoleViewModel.selectedTab = .traffic
			case .claude:
				show(section: .claude)
			case .docs:
				show(section: .docs)
				docsViewModel.readingMode = .half
		}
	}

	/// Assigns only on change: a published panel re-fires the view's listener, which would call back in here.
	private func showAdvanced(panel: AdvancedPanel) {
		show(section: .advanced)
		if advancedViewModel.selectedPanel != panel {
			advancedViewModel.selectedPanel = panel
		}
	}

	private func show(section: TestForgeSection) {
		if selectedSection != section {
			selectedSection = section
		}
	}

	/// The Replay and First run tips point at the selected test's buttons.
	private func selectFirstTestIfNone() {
		guard testsViewModel.selectedCaseId == nil,
			case .loaded(let rows) = testsViewModel.listState
		else {
			return
		}
		testsViewModel.selectedCaseId = rows.first?.id
	}
}
