import Foundation

enum OnboardingConstants {
	enum Layout {
		static let width: CGFloat = 880
		static let height: CGFloat = 600
		static let stepListWidth: CGFloat = 190
		static let cardMinWidth: CGFloat = 240
		static let cardSymbolWidth: CGFloat = 28
		static let cardCornerRadius: CGFloat = 10
		static let numberDiameter: CGFloat = 26
		static let roleCardHeight: CGFloat = 120
		static let selectedBorderWidth: CGFloat = 2
		static let borderWidth: CGFloat = 1
		static let borderOpacity = 0.3
		static let surfaceOpacity = 0.06
	}

	enum Accessibility {
		static let sheet = "TestForge_Onboarding"
		static let stepPrefix = "TestForge_Onboarding_Step_"
		static let rolePrefix = "TestForge_Onboarding_Role_"
		static let rolePicker = "TestForge_Onboarding_RolePicker"
		static let cardPrefix = "TestForge_Onboarding_Card_"
		static let flowStepPrefix = "TestForge_Onboarding_Flow_"
		static let claudeMarkerPrefix = "TestForge_Onboarding_ClaudeMarker_"
		static let startActionPrefix = "TestForge_Onboarding_Start_"
		static let backButton = "TestForge_Onboarding_Back"
		static let nextButton = "TestForge_Onboarding_Next"
		static let skipButton = "TestForge_Onboarding_Skip"
		static let helpMenuItem = "TestForge_Onboarding_HelpMenuItem"
	}
}
