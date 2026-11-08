import Foundation

extension OnboardingCatalog {
	static let qaWorkflow = OnboardingPageContent(
		headline: String(localized: "A testing day, screen by screen"),
		intro: String(localized: "Top to bottom the first time; after that you mostly live in Tests, Network and Results."),
		cards: [],
		flow: [
			OnboardingFlowStep(
				number: 1,
				title: String(localized: "Get ready"),
				place: String(localized: "Get ready · ⌘1"),
				text: String(
					localized: "Follow it until green: server, proof folder and Test Batch, code, simulator, QA build. Test logins: Settings › Logins."
				),
				claudeNote: String(localized: "Its Claude sign-in check only matters for Claude runs")
			),
			OnboardingFlowStep(
				number: 2,
				title: String(localized: "Run the cases"),
				place: String(localized: "Tests · ⌘2"),
				text: String(localized: "Load cases (Confluence or a file). Replay recorded ones; Run with Claude asks first, and Auto picks the model."),
				needsClaude: true,
				claudeNote: String(localized: "Only to load cases from Confluence and to Run with Claude — replays don't")
			),
			OnboardingFlowStep(
				number: 3,
				title: String(localized: "Push the edge cases"),
				place: String(localized: "Network · ⌘9"),
				text: String(localized: "Watch calls live, switch an answer to empty, 500 or slow, hold a call and edit it, check the trackers fired.")
			),
			OnboardingFlowStep(
				number: 4,
				title: String(localized: "Check the UI"),
				place: String(localized: "Measure · ⌥⌘M"),
				text: String(localized: "Click any element for its size and spacing in points; snapshot it with numbered notes for design.")
			),
			OnboardingFlowStep(
				number: 5,
				title: String(localized: "Review the verdicts"),
				place: String(localized: "Results · ⌘4"),
				text: String(localized: "Each case shows its proof. Accept, Override with a reason, or mark Needs re-run.")
			),
			OnboardingFlowStep(
				number: 6,
				title: String(localized: "Report"),
				place: String(localized: "Reports · ⌘5"),
				text: String(
					localized: """
						Read the whole session's report in the app, export it (.md or Confluence HTML), or publish it to your Confluence page. \
						Demos plays recorded demo videos in English or Bahasa.
						"""
				),
				claudeNote: String(localized: "Publishing to Confluence goes through Claude")
			),
			OnboardingFlowStep(
				number: 7,
				title: String(localized: "Drive it from your phone"),
				place: String(localized: "Claude · ⌘0 › Remote Control"),
				text: String(localized: "Turn on Remote Control, scan the QR code, then ask from the Claude app: replay a case, show proof, approve a run."),
				needsClaude: true
			),
			OnboardingFlowStep(
				number: 8,
				title: String(localized: "Export the whole session"),
				place: String(localized: "Tests › Export session…"),
				text: String(localized: "One file with every case, its edits, recording, last verdict and run history. Add screenshots and videos if you like."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 9,
				title: String(localized: "Replay a developer's run"),
				place: String(localized: "Results › Import bundle…"),
				text: String(localized: "Open the bundle a developer sent. Its recorded tests replay without Claude, each next to the developer's verdict."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 10,
				title: String(localized: "Show anyone what a test checks"),
				place: String(localized: "Test Cases › Explain"),
				text: String(localized: "Replay with plain-words subtitles and pointers over the Simulator, or record a demo video in English or Bahasa."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 11,
				title: String(localized: "Correct a case the document got wrong"),
				place: String(localized: "Test Cases › Edit"),
				text: String(localized: "Fix its steps or expected result on this Mac. Runs use your text; the document is never changed."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 12,
				title: String(localized: "Override a result, with a reason"),
				place: String(localized: "Test Cases › Override result"),
				text: String(localized: """
					Set a case's verdict yourself with a required description. Save and rerun has Claude run it again with your \
					expected result, leniency and notes. Every change travels in exports.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 13,
				title: String(localized: "Know where each test starts"),
				place: String(localized: "Test Cases › Starts on"),
				text: String(localized: """
					Claude records each case's start screen and needs on its first run; replays bring the phone there first. \
					While it gets ready, Live steps shows it under System prep; a plain replay also shows a banner on the Simulator.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 14,
				title: String(localized: "Re-check results after a new build"),
				place: String(localized: "Test Cases › Replay stale"),
				text: String(localized: """
					Results record the branch, commit and build number. When a new build changes a case's code, its result turns stale; \
					Replay stale re-runs those recordings without Claude.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 15,
				title: String(localized: "Look back at any batch"),
				place: String(localized: "Reports › Batches"),
				text: String(localized: """
					Every Test Batch with its pass and fail counts and its report. Ending a batch opens its report here; \
					Reopen picks one up again, Remove tidies the list and keeps the files.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 16,
				title: String(localized: "Run a batch hands-free"),
				place: String(localized: "Test Cases › Run all"),
				text: String(localized: """
					Run all shows the plan first — replays grouped so each environment and login is set up once, then Claude runs — \
					and names anything that would stop it. In Claude, the top line says what a run is doing now and one click steers it.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 17,
				title: String(localized: "Tidy a recording, share its inputs"),
				place: String(localized: "Scan › Edit steps · Test Cases › Deeplinks and mocks"),
				text: String(localized: """
					Edit steps reorders, removes and adjusts a macro's steps without its JSON. Under a recorded case, \
					its deeplinks and mocked JSON are ready to copy or download for a developer.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 18,
				title: String(localized: "Keep your code up to date"),
				place: String(localized: "Get ready · ⌘1 › Git…"),
				text: String(localized: """
					Fetch, update or switch the branch of your own repo without Terminal. It stops before anything \
					would touch unsaved work.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 19,
				title: String(localized: "Re-run a whole batch on a new build"),
				place: String(localized: "Reports › Batches › Replay on this build"),
				text: String(localized: """
					Replays every recorded case of an earlier Test Batch on the build installed now, without Claude, \
					and compares each verdict with the old one.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 20,
				title: String(localized: "Open any screen by deeplink"),
				place: String(localized: "Simulator · ⌘7 › Deeplinks"),
				text: String(localized: """
					Search a screen by name, fill in its fields, add query parameters (min-version presets included) \
					and open it in the app, or save it for later.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 21,
				title: String(localized: "Work beside the Simulator"),
				place: String(localized: "Tests › Test list · Live steps"),
				text: String(localized: """
					In Split View, hide the sidebar, the test list (⌥⌘L) and Live steps; the window gets narrow enough \
					to leave the Simulator most of the screen.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 22,
				title: String(localized: "Switch priorities mid-batch"),
				place: String(localized: "Toolbar › Test Batch › Pause · Resume"),
				text: String(localized: """
					Pause the batch you're on, start or resume another for the urgent work, then Resume the first. \
					Nothing is ended or left half-filed; Reports › Batches shows which are paused.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 23,
				title: String(localized: "Update TestForge itself"),
				place: String(localized: "TestForge menu › Check for Updates… · Settings › Project"),
				text: String(localized: """
					Pulls the latest master of your TestForge checkout, rebuilds the app and reopens it. The menu item says \
					when an update is waiting. It stops, and says why, on another branch or with local changes.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 24,
				title: String(localized: "Read the guides in the app"),
				place: String(localized: "Docs · ⌘D · Help › TestForge Usage Guide"),
				text: String(localized: """
					The usage guide and the feature list, read in place: Half beside the list, Full for the whole window, \
					or its own window on half the screen. Drop any Markdown file, such as a test plan, to read it there too.
					"""),
				needsClaude: false
			),
		]
	)

	static let developerWorkflow = OnboardingPageContent(
		headline: String(localized: "Check your feature before the PR"),
		intro: String(localized: "The same tools QA uses, pointed at your branch."),
		cards: [],
		flow: [
			OnboardingFlowStep(
				number: 1,
				title: String(localized: "Point it at your code"),
				place: String(localized: "Get ready · ⌘1 · Build · ⌘8"),
				text: String(
					localized: "Prepare code… picks your branch or working copy in the iOS clone you chose at setup; Install for testing builds the QA copy and installs it with the test runner."
				)
			),
			OnboardingFlowStep(
				number: 2,
				title: String(localized: "Replay what you touched"),
				place: String(localized: "Tests · ⌘2"),
				text: String(localized: "Replay the cases for your feature. A failure comes with Claude's call: app bug, broken recording or environment."),
				claudeNote: String(localized: "When you're signed in, Claude explains a failure")
			),
			OnboardingFlowStep(
				number: 3,
				title: String(localized: "Reproduce edge cases"),
				place: String(localized: "Network · ⌘9"),
				text: String(localized: "Mock any endpoint, shift dates, hold a response and edit it, or replay a call — no backend help needed.")
			),
			OnboardingFlowStep(
				number: 4,
				title: String(localized: "Control the phone"),
				place: String(localized: "Simulator · ⌘7"),
				text: String(localized: """
					Pick the simulator tests use, see paired iPhones, boot, erase, relaunch, Blended Layers — no Xcode. \
					Deeplinks finds a screen by name and adds query parameters.
					""")
			),
			OnboardingFlowStep(
				number: 5,
				title: String(localized: "Ask Claude"),
				place: String(localized: "Claude · ⌘0"),
				text: String(localized: "Ask about the repo or a failing run. Every run's session is there too, in full — approve, answer, or tell it to fix."),
				needsClaude: true
			),
			OnboardingFlowStep(
				number: 6,
				title: String(localized: "Record a macro by hand"),
				place: String(localized: "Scan · ⌘3 · Advanced · ⌘6"),
				text: String(localized: "Start recording, tap through the app, End recording and save. Taps without IDs are flagged as you go.")
			),
			OnboardingFlowStep(
				number: 7,
				title: String(localized: "Drive it from your phone"),
				place: String(localized: "Claude · ⌘0 › Remote Control"),
				text: String(localized: "Turn on Remote Control and keep working from the Claude app: replay your cases, read failures, steer a run."),
				needsClaude: true
			),
			OnboardingFlowStep(
				number: 8,
				title: String(localized: "Export the whole session"),
				place: String(localized: "Tests › Export session…"),
				text: String(localized: "One file with every case, its edits, recording, last verdict and run history. Add screenshots and videos if you like."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 9,
				title: String(localized: "Hand your run to QA"),
				place: String(localized: "Results › Export bundle…"),
				text: String(localized: "Save the run as one file: tests, recordings, mocks and verdicts. QA replays it without paying for Claude again."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 10,
				title: String(localized: "Demo your story without a call"),
				place: String(localized: "Test Cases › Explain"),
				text: String(localized: "Write explanations once with Claude, then record a demo video anyone can follow. Post it on Teams, Jira or Confluence."),
				needsClaude: true
			),
			OnboardingFlowStep(
				number: 11,
				title: String(localized: "Align a case with what you built"),
				place: String(localized: "Test Cases › Edit"),
				text: String(localized: "When a case's expected result is out of date, correct it locally and tell the document's owner."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 12,
				title: String(localized: "Verify your branch before the PR"),
				place: String(localized: "Test Cases › Verify my changes · or /verify in Claude Code"),
				text: String(localized: """
					Compares your code with develop and picks the recorded cases that cover what changed; Replay opens the plan. \
					In Claude Code, /verify does the same and reports PASS or FAIL with proof.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 13,
				title: String(localized: "Switch branches from the TestForge"),
				place: String(localized: "Get ready · ⌘1 › Git…"),
				text: String(localized: "Fetch, update or switch your repo's branch; it stops before anything would touch unsaved work."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 14,
				title: String(localized: "Work beside the Simulator"),
				place: String(localized: "Tests › Test list · Live steps"),
				text: String(localized: "In Split View, hide the sidebar, the test list (⌥⌘L) and Live steps so the Simulator gets the room."),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 15,
				title: String(localized: "Update TestForge itself"),
				place: String(localized: "TestForge menu › Check for Updates… · Settings › Project"),
				text: String(localized: """
					Pulls the latest master of your TestForge checkout, rebuilds the app and reopens it. The menu item says \
					when an update is waiting. It stops, and says why, on another branch or with local changes.
					"""),
				needsClaude: false
			),
			OnboardingFlowStep(
				number: 16,
				title: String(localized: "Read docs beside your code"),
				place: String(localized: "Docs · ⌘D · File › Open Markdown… (⌘O)"),
				text: String(localized: """
					The README, the usage guide and the feature list, plus any Markdown you drop in, such as a README or a spec. \
					Links between docs open in place; open one in its own window on half the screen next to Xcode.
					"""),
				needsClaude: false
			),
		]
	)

	static let qaAdvantages = OnboardingPageContent(
		headline: String(localized: "What QA gains"),
		intro: String(localized: "Less repetition, more coverage, proof you don't have to collect."),
		cards: [
			OnboardingCard(
				symbolName: "bolt",
				title: String(localized: "Fast, free replays"),
				text: String(localized: "Recorded cases run on the driver in about 30 s each and cost no Claude credits.")
			),
			OnboardingCard(
				symbolName: "link",
				title: String(localized: "Verdicts you can trust"),
				text: String(localized: "Every result is tied to repo, branch, commit, build and simulator; an out-of-date build stops the run.")
			),
			OnboardingCard(
				symbolName: "tray.full",
				title: String(localized: "Proof collected for you"),
				text: String(localized: "Screenshots, and video when motion matters, land in your proof folder; ending a Test Batch writes its report.")
			),
			OnboardingCard(
				symbolName: "exclamationmark.triangle",
				title: String(localized: "Edge cases on demand"),
				text: String(localized: "Empty states, errors, slow networks and date-dependent screens without waiting for backend data.")
			),
			OnboardingCard(
				symbolName: "ruler",
				title: String(localized: "UI checked in points"),
				text: String(localized: "Measure shows real spacing and sizes, so a design mismatch is a number, not an opinion.")
			),
			OnboardingCard(
				symbolName: "chart.bar.doc.horizontal",
				title: String(localized: "Trackers verified"),
				text: String(localized: "Each analytics event is listed as it fires, with contract problems flagged.")
			),
			OnboardingCard(
				symbolName: "iphone.radiowaves.left.and.right",
				title: String(localized: "QA from anywhere"),
				text: String(localized: "Start replays, read verdicts with proof and approve waiting runs from your phone.")
			),
		],
		flow: []
	)

	static let developerAdvantages = OnboardingPageContent(
		headline: String(localized: "What developers gain"),
		intro: String(localized: "Catch it before review, reproduce it without anyone's help."),
		cards: [
			OnboardingCard(
				symbolName: "shield.lefthalf.filled",
				title: String(localized: "Your setup untouched"),
				text: String(localized: "Tests run on a QA copy and a separate simulator — your branches, DerivedData and simulator stay as they are.")
			),
			OnboardingCard(
				symbolName: "shippingbox",
				title: String(localized: "Recordings live in the repo"),
				text: String(localized: "Saved next to the code (BlibliMobile_XCUITest/QAMacros); anyone who pulls the branch can replay them.")
			),
			OnboardingCard(
				symbolName: "stethoscope",
				title: String(localized: "Triage, not noise"),
				text: String(localized: "A failed replay is sorted into app bug, broken recording or environment before you look.")
			),
			OnboardingCard(
				symbolName: "network.badge.shield.half.filled",
				title: String(localized: "Network control from the Mac"),
				text: String(localized: "Mock, hold, edit and replay calls without opening the in-app NetworkLens screen.")
			),
			OnboardingCard(
				symbolName: "tag",
				title: String(localized: "Accessibility IDs pay off"),
				text: String(localized: "Stable IDs make recordings work on any device and screen size — Scan › Record macro flags every tap that has none.")
			),
			OnboardingCard(
				symbolName: "rectangle.on.rectangle",
				title: String(localized: "One window"),
				text: String(localized: "Build, install, launch and reset without juggling Xcode, the Simulator and a terminal.")
			),
			OnboardingCard(
				symbolName: "eye",
				title: String(localized: "Nothing hidden"),
				text: String(localized: "Every Claude session shows each tool call and result in full, so you can see why a run did what it did.")
			),
		],
		flow: []
	)
}
