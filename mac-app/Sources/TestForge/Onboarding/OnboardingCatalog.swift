import Foundation

/// The tour's words (D-134); shared pages here, the role pages in `OnboardingCatalog+Roles`.
enum OnboardingCatalog {
	static func page(_ step: OnboardingStep, role: OnboardingRole) -> OnboardingPageContent {
		switch step {
			case .welcome:
				return welcome
			case .why:
				return why
			case .howItWorks:
				return howItWorks
			case .workflow:
				return role == .qa ? testForgeWorkflow : developerWorkflow
			case .advantages:
				return role == .qa ? testForgeAdvantages : developerAdvantages
			case .safety:
				return safety
			case .start:
				return start
		}
	}

	private static let welcome = OnboardingPageContent(
		headline: String(localized: "Test the Blibli iOS app from one window"),
		intro: String(localized: """
		TestForge builds the code you choose, runs test cases on a simulator, mocks the APIs behind any screen, \
		measures the UI and keeps the proof — with Claude for the parts that need judgement. Pick your role to see \
		the tour that fits you; you can switch later.
		"""),
		cards: [],
		flow: []
	)

	private static let why = OnboardingPageContent(
		headline: String(localized: "Four problems it removes"),
		intro: String(localized: "Testing an iOS feature well used to mean a dozen tools and a lot of repetition."),
		cards: [
			OnboardingCard(
				symbolName: "arrow.triangle.2.circlepath",
				title: String(localized: "Regression by hand is slow"),
				text: String(localized: "A case Claude has passed once is saved as a recording and replayed by the driver in about 30 s — no Claude, no credits.")
			),
			OnboardingCard(
				symbolName: "network",
				title: String(localized: "Bugs hide behind backend states"),
				text: String(localized: "Empty lists, errors, slow or timed-out calls and date-dependent screens are one click away, without a backend change.")
			),
			OnboardingCard(
				symbolName: "photo.on.rectangle",
				title: String(localized: "Proof is scattered"),
				text: String(localized: "Every verdict keeps its screenshots (and a video when motion matters), tied to the branch, commit and build it tested.")
			),
			OnboardingCard(
				symbolName: "square.stack.3d.up",
				title: String(localized: "Too many tools"),
				text: String(localized: "Xcode builds, the Simulator, a network inspector, Confluence test cases and Claude — driven from here, no terminal.")
			),
		],
		flow: []
	)

	private static let howItWorks = OnboardingPageContent(
		headline: String(localized: "The parts and how they talk"),
		intro: String(localized: "This window is the control panel. Everything else runs on your Mac and is started for you."),
		cards: [
			OnboardingCard(
				symbolName: "macwindow",
				title: String(localized: "TestForge (this app)"),
				text: String(localized: "Shows what is ready, runs tests, edits mocks and reviews results. Live — nothing to refresh.")
			),
			OnboardingCard(
				symbolName: "server.rack",
				title: String(localized: "QA server"),
				text: String(localized: "A small local server (server/ in your TestForge checkout) that the app starts. It keeps runs, results and mocks.")
			),
			OnboardingCard(
				symbolName: "iphone.gen3",
				title: String(localized: "Test simulator + QA build"),
				text: String(localized: "A QA copy of the code is built in ~/.test-forge for the test simulator. Your own project and simulator stay put.")
			),
			OnboardingCard(
				symbolName: "hand.tap",
				title: String(localized: "TestForgeDriver"),
				text: String(localized: "A test runner on the phone that taps, types and checks — it replays recordings and does Claude's clicking.")
			),
			OnboardingCard(
				symbolName: "antenna.radiowaves.left.and.right",
				title: String(localized: "NetworkLens"),
				text: String(localized: "Inside the QA build: records every call and trackers, and answers with the mocks you choose in Network.")
			),
			OnboardingCard(
				symbolName: "sparkles",
				title: String(localized: "Claude"),
				text: String(localized: "Optional: runs new cases from their steps, explains failures, answers you. Replays and every screen work without it.")
			),
			OnboardingCard(
				symbolName: "gauge.with.dots.needle.33percent",
				title: String(localized: "Claude usage, always in view"),
				text: String(localized: "The bottom bar shows context, 5-hour and weekly limits like the CLI, your account and Remote Control.")
			),
			OnboardingCard(
				symbolName: "iphone.radiowaves.left.and.right",
				title: String(localized: "Your phone (optional)"),
				text: String(localized: "Remote Control lets you run QA here from the Claude app's Code tab or claude.ai/code — replays, results, mocks, approvals.")
			),
		],
		flow: []
	)

	private static let safety = OnboardingPageContent(
		headline: String(localized: "Guard rails you can rely on"),
		intro: String(localized: "These hold no matter who asks — you, a recording or Claude."),
		cards: [
			OnboardingCard(
				symbolName: "folder.badge.minus",
				title: String(localized: "Your project stays yours"),
				text: String(localized: "Tests build a QA copy. Your folder, branches, unsaved work and own simulator are never changed.")
			),
			OnboardingCard(
				symbolName: "arrow.triangle.branch",
				title: String(localized: "No git changes"),
				text: String(localized: "It never commits, pushes or rebases anything.")
			),
			OnboardingCard(
				symbolName: "doc.badge.ellipsis",
				title: String(localized: "Team pages are read-only"),
				text: String(localized: "The team's test-case page in Confluence is only read. Reports go under your personal page, and only after you confirm.")
			),
			OnboardingCard(
				symbolName: "hammer",
				title: String(localized: "No surprise builds or spend"),
				text: String(localized: "Builds start only when you press the button, and a Claude run asks first because it uses your plan.")
			),
			OnboardingCard(
				symbolName: "hand.raised",
				title: String(localized: "You approve Claude's actions"),
				text: String(localized: "Anything Claude wants to do that isn't already allowed comes to you as a card: Approve, Always allow or Deny.")
			),
			OnboardingCard(
				symbolName: "iphone.gen3.badge.exclamationmark",
				title: String(localized: "Phone sessions keep the rules"),
				text: String(localized: "From your phone too: the team's page is never written; pushing, building for testing or erasing a phone asks first.")
			),
		],
		flow: []
	)

	private static let start = OnboardingPageContent(
		headline: String(localized: "Where to go first"),
		intro: String(localized: "You can reopen this tour any time from Help › Welcome to TestForge."),
		cards: [],
		flow: []
	)
}
