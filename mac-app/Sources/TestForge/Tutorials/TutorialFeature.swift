import Foundation

/// One tutorial per feature; the main window's sections and panels map onto these.
enum TutorialFeature: String, CaseIterable, Identifiable {
	case getReady
	case tests
	case besideSimulator
	case console
	case scan
	case results
	case reports
	case fakeData
	case recordedSteps
	case phoneRemote
	case measure
	case simulatorControl
	case build
	case network
	case claude
	case docs

	var id: String { rawValue }

	var title: LocalizedStringResource {
		switch self {
			case .getReady:
				return "Get ready"
			case .tests:
				return "Choosing and running tests"
			case .besideSimulator:
				return "Working beside the Simulator"
			case .console:
				return "The console"
			case .scan:
				return "Scan"
			case .results:
				return "Results and proof"
			case .reports:
				return "Reports"
			case .fakeData:
				return "Network Mocks"
			case .recordedSteps:
				return "Recorded steps"
			case .phoneRemote:
				return "Simulator Driver"
			case .measure:
				return "Measure"
			case .simulatorControl:
				return "Simulator controls"
			case .build:
				return "Building the app"
			case .network:
				return "The network console"
			case .claude:
				return "Claude in the TestForge"
			case .docs:
				return "Reading the docs"
		}
	}

	/// Tutorials reachable from a section's ? menu, the section's own first.
	static func features(for section: TestForgeSection, panel: AdvancedPanel) -> [TutorialFeature] {
		switch section {
			case .getReady:
				return [.getReady, .console]
			case .claude:
				return [.claude, .console]
			case .tests:
				return [.tests, .besideSimulator, .console]
			case .scan:
				return [.scan, .console]
			case .results:
				return [.results, .console]
			case .reports:
				return [.reports]
			case .advanced:
				return [panel.tutorialFeature, .console]
			case .network:
				return [.network, .console]
			case .simulator:
				return [.simulatorControl, .console]
			case .build:
				return [.build, .console]
			case .docs:
				return [.docs]
		}
	}
}

extension AdvancedPanel {
	var tutorialFeature: TutorialFeature {
		switch self {
			case .fakeData:
				return .fakeData
			case .recordedSteps:
				return .recordedSteps
			case .phoneRemote:
				return .phoneRemote
		}
	}
}
