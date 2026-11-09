import Foundation

struct TutorialStep {
	let anchor: TutorialAnchor
	let title: LocalizedStringResource
	let message: LocalizedStringResource
}

/// The scripts from tutorials.md (R4 revision): at most 6 tips each, plain words, no internal names.
enum TutorialCatalog {
	static func steps(for feature: TutorialFeature) -> [TutorialStep] {
		switch feature {
			case .getReady:
				return getReady
			case .tests:
				return tests
			case .besideSimulator:
				return besideSimulator
			case .console:
				return console
			case .scan:
				return scan
			case .results:
				return results
			case .reports:
				return reports
			case .fakeData:
				return fakeData
			case .recordedSteps:
				return recordedSteps
			case .phoneRemote:
				return phoneRemote
			case .measure:
				return measure
			case .simulatorControl:
				return simulatorControl
			case .build:
				return build
			case .network:
				return network
			case .claude:
				return claude
			case .docs:
				return docsSteps
		}
	}

	private static let getReady = prerequisiteSteps + toolSteps + [
		TutorialStep(
			anchor: .getReadyHeader,
			title: "This page checks everything",
			message: "Before tests can run, your Mac, the project and the phone must be ready. Green means ready."
		),
		TutorialStep(
			anchor: .getReadyHeader,
			title: "Only changes are checked again",
			message: "After the first launch, a check runs again only when something it depends on has changed."
		),
		TutorialStep(
			anchor: .getReadyChecks,
			title: "Every check says why",
			message: "Each line says what was checked and what was found. When something needs you, its Fix button does the work."
		),
		TutorialStep(
			anchor: .testBatchToolbar,
			title: "Proof goes into a Test Batch",
			message: """
				Every run and its screenshots are filed into the active Test Batch. Start one here; Pause sets it aside to switch \
				to other work and Resume picks it up again; End writes its report; Reopen picks up an ended one.
				"""
		),
		TutorialStep(
			anchor: .consoleToggle,
			title: "Want the details?",
			message: "The console at the bottom shows the real commands and their output. ⌘⇧Y shows or hides it."
		)
	]

	private static let tests = [
		TutorialStep(
			anchor: .testsLoadButton,
			title: "Load your test document",
			message: "Paste the link of the Confluence page with your test cases. The list fills from its table."
		),
		TutorialStep(
			anchor: .testsExportSessionButton,
			title: "Export the whole session",
			message: "One .zip with every case: its text, local edits, recording, last verdict and run history. Tick the box to add screenshots and videos."
		),
		TutorialStep(
			anchor: .testsFilterBar,
			title: "Find a test",
			message: "Search by id or words, or show only the tests that failed or have never run."
		),
		TutorialStep(
			anchor: .testsList,
			title: "Recorded or first run",
			message: "A test with recorded steps replays by itself. A test that never ran needs one first run with Claude."
		),
		TutorialStep(
			anchor: .testsList,
			title: "Proof at a glance",
			message: """
				After a run, icons beside the case id show its proof: 📷 screenshots with a count, 🎥 a screen recording, \
				and 👁 when the result is evidence only and needs your eye.
				"""
		),
		TutorialStep(
			anchor: .testsMediaPanel,
			title: "See the proof here",
			message: """
				A selected case shows its screenshots and videos below its text. Zoom and pan screenshots, play videos, \
				or Annotate a screenshot with a pen, arrow or box, then save it over the original or as a copy.
				"""
		),
		TutorialStep(
			anchor: .testsReplayStatus,
			title: "Free replay or Claude",
			message: """
				The icon by each case says what a run costs. ⚡ green: free replay, its last replay passed. ⚡ orange: \
				recorded but not confirmed, replay it once. ⚠︎ red: the recording needs Claude to repair it. ✨: no \
				recording, only Claude can run it. A Claude pass shows UNCONFIRMED until a replay of its saved recording passes.
				"""
		),
		TutorialStep(
			anchor: .testsReplayButton,
			title: "Replay recorded steps",
			message: """
				Click Replay to run the saved steps on the phone, with no Claude usage. Press and hold it for Replay with \
				explanations (subtitles and pointers over the Simulator), Record demo video in English and Bahasa, and \
				writing the explanations once with Claude (✨). Replay is off when the recording can't run without Claude.
				"""
		),
	] + buildSteps + inputSteps + verifySteps + [
		TutorialStep(
			anchor: .testsSetup,
			title: "Where a test starts",
			message: """
				Starts on … · Needs … is the screen and app state a replay brings the phone to before step 1. \
				Claude decides it on the case's first run; a case that opens its own page starts on any screen.
				"""
		),
		TutorialStep(
			anchor: .testsEditButton,
			title: "Fix a case's text",
			message: """
				If the document's steps or expected result are wrong, Edit corrects them on this Mac. Runs and Claude use your text, \
				the document stays untouched, and Revert brings its text back.
				"""
		),
		TutorialStep(
			anchor: .testsOverrideButton,
			title: "Override a result",
			message: """
				Override result sets a case's verdict yourself, with a required description. Save and rerun has Claude run it again \
				with your expected result, leniency and description. Every change is kept and travels in exports.
				"""
		),
		TutorialStep(
			anchor: .testsRunClaudeButton,
			title: "First run with Claude",
			message: """
			Claude reads the test, drives the phone and saves the steps. Auto picks the model by how hard the case looks \
			and moves up if it gets stuck.
			"""
		),
		TutorialStep(
			anchor: .testsInspector,
			title: "Follow every step",
			message: """
			Each step appears here in plain words as it runs, with System prep above it while the phone gets ready. \
			Stop or ⌘. ends the run and cleans up the phone. A Claude run has a Claude session button to watch or steer it.
			"""
		)
	]

	private static let besideSimulator = [
		TutorialStep(
			anchor: .testsListToggle,
			title: "Make room for the Simulator",
			message: """
			Test list (⌥⌘L) hides the case list. With it, Live steps and the sidebar hidden, the window gets narrow enough \
			to share Split View with a wide Simulator.
			"""
		),
		TutorialStep(
			anchor: .outlineToggle,
			title: "See the step on the phone",
			message: "When on, the element each step acts on is outlined on the Simulator. It adds about 2 seconds per step."
		),
		TutorialStep(
			anchor: .testsInspector,
			title: "Each step in plain words",
			message: "As the robot works on the phone, each step appears here with its time and result."
		),
		TutorialStep(
			anchor: .measureButton,
			title: "Measure the screen",
			message: "Measure opens the phone's screen with the size of every element and the spacing between them."
		)
	]

	private static let console = [
		TutorialStep(
			anchor: .console,
			title: "Raw logs live here",
			message: "Everything the app, the phone and Claude do is written here as it happens."
		),
		TutorialStep(
			anchor: .consoleFilter,
			title: "Show one source",
			message: "Pick one source to see only its lines."
		),
		TutorialStep(
			anchor: .consoleSearch,
			title: "Find a line",
			message: "Type a word to keep only the lines that contain it."
		),
		TutorialStep(
			anchor: .consoleCopy,
			title: "Share a log",
			message: "Copy puts the visible lines on the clipboard, ready for a bug report."
		)
	]

	private static let scan = stepEditorSteps + [
		TutorialStep(
			anchor: .scanRecordButton,
			title: "Record a macro by hand",
			message: """
				Start recording, tap through the app in the Simulator, then End recording and name it. Each tap is found by the \
				accessibility ID of what you tapped; a tap without one is flagged at once, so a developer can add it.
				"""
		),
		TutorialStep(
			anchor: .scanSavedMacros,
			title: "Your saved macros",
			message: "Every macro recorded here, newest first. A saved one is selected for you: replay it, or find its file."
		),
		TutorialStep(
			anchor: .scanSection,
			title: "Scan the app by hand",
			message: "You move through the app in the Simulator and name each screen. Its elements are saved for later tests."
		),
		TutorialStep(
			anchor: .scanStartButton,
			title: "Start a scan",
			message: "While a scan runs the phone is kept for you, so tests wait until you stop."
		)
	]

	private static let results = [
		TutorialStep(
			anchor: .resultsRunList,
			title: "Every run is here",
			message: "The newest run is on top. Pick one to see how each test went."
		),
		TutorialStep(
			anchor: .resultsRunHeader,
			title: "How the run went",
			message: "Passed, failed and flaky at a glance, with the branch it ran on."
		),
		TutorialStep(
			anchor: .resultsCaseList,
			title: "One row per test",
			message: "Pick a test to see where it broke, the screenshots taken, and to accept or override the verdict."
		),
		TutorialStep(
			anchor: .resultsRerunFailedButton,
			title: "Run failures again",
			message: "Runs only the tests that failed. A test that passes the second time is marked flaky."
		),
		TutorialStep(
			anchor: .resultsExportBundleButton,
			title: "Hand the run on",
			message: "Saves the run as one file: its tests, recordings, mocks and verdicts. Send it to whoever checks next."
		),
		TutorialStep(
			anchor: .resultsImportBundleButton,
			title: "Replay someone's run",
			message: """
				Open a bundle, add its recordings and mocks, then replay its recorded tests without Claude. A bundle of the document \
				you have loaded only adds its missing cases. Tests without a recording list their mocked responses; Set up mocks switches them on.
				"""
		)
	]

	private static let reports = batchSteps + [
		TutorialStep(
			anchor: .sessionReportViewer,
			title: "The whole session in one report",
			message: "Every case of the loaded document: summary, what needs attention, results, then each case with its runs and proof."
		),
		TutorialStep(
			anchor: .sessionReportPublish,
			title: "Share it",
			message: "Export it as Markdown or Confluence-ready HTML, or publish a new page under your personal Confluence page; it asks first."
		),
		TutorialStep(
			anchor: .demoLibrary,
			title: "Watch recorded demos",
			message: """
				Reports › Demos lists every demo video you recorded. Click one to open it, then press ▶ when ready; \
				pause and drag the bar under the video.
				"""
		),
		TutorialStep(
			anchor: .demoLanguage,
			title: "English or Bahasa",
			message: "Switch the language while a demo plays; it carries on from the same moment in the other language."
		),
		TutorialStep(
			anchor: .demoPlayer,
			title: "Watch it full screen",
			message: "Hover the video and press ⤢ at the bottom right for full screen; Esc comes back."
		),
		TutorialStep(
			anchor: .reportsBranchList,
			title: "Runs by branch",
			message: "Each branch lists the runs made on it, newest first."
		),
		TutorialStep(
			anchor: .reportsPickerBar,
			title: "Pick what to compare",
			message: "Choose a run, and a run to compare it with. By default it is develop, else the run before."
		),
		TutorialStep(
			anchor: .reportsComparison,
			title: "What changed",
			message: "Tests that started failing or were fixed between the two runs are listed here."
		)
	]

	private static let fakeData = [
		TutorialStep(
			anchor: .advancedPanelPicker,
			title: "Three tools",
			message: "Network mocks, recorded steps and the Simulator Driver live here."
		),
		TutorialStep(
			anchor: .fakeDataMasterSwitch,
			title: "Choose what the server answers",
			message: "Make the app see no campaigns, an error or a slow answer, without touching the real server."
		),
		TutorialStep(
			anchor: .fakeDataRuleList,
			title: "One switch per answer",
			message: "Turn on a mock for one call, then pick its answer such as Empty or Server error."
		),
		TutorialStep(
			anchor: .fakeDataCallList,
			title: "See it happen",
			message: "Every request the app makes is listed; select one to see what it was answered."
		)
	]

	private static let recordedSteps = [
		TutorialStep(
			anchor: .recordedStepsList,
			title: "Saved steps per test",
			message: "Each test that passed with Claude has its steps saved here."
		),
		TutorialStep(
			anchor: .recordedStepsDetail,
			title: "Readable steps",
			message: "Each step is in plain words. The clean-up steps run even when a test fails, so the next test starts clean."
		),
		TutorialStep(
			anchor: .recordedStepsList,
			title: "Try it now",
			message: "Pick a recording and press Replay to run just its steps on the phone."
		)
	]

	private static let phoneRemote = [
		TutorialStep(
			anchor: .phoneRemoteKindPicker,
			title: "Drive the simulator yourself",
			message: "Send the test driver one command — tap, type, scroll, open a link — without writing a test."
		),
		TutorialStep(
			anchor: .phoneRemoteSendButton,
			title: "Send it",
			message: "Fill in the fields, then Send. Commands wait while a test is running."
		),
		TutorialStep(
			anchor: .phoneRemoteResult,
			title: "See the answer",
			message: "The driver's reply is shown here, including what it sees on screen."
		),
		TutorialStep(
			anchor: .phoneRemoteHistory,
			title: "Everything you sent",
			message: "Earlier commands are kept here so you can check what happened."
		)
	]

	private static let measure = [
		TutorialStep(
			anchor: .measureCanvas,
			title: "Click any element",
			message: "Its size, the spacing to its neighbours and its inset inside every parent show on the right."
		),
		TutorialStep(
			anchor: .measureCanvas,
			title: "Point to compare",
			message: "With an element selected, point at another one, or at empty space, to see the distance to it in blue."
		),
		TutorialStep(
			anchor: .measureLayerBorders,
			title: "Views without IDs",
			message: "Views the app doesn't name are found from the screen. Turn this on to see their dashed borders."
		),
		TutorialStep(
			anchor: .measureZoomBar,
			title: "Zoom in",
			message: "Zoom up to 800% to check small gaps — or hold ⌥ and scroll. ⌘0 fits the whole screen again."
		),
		TutorialStep(
			anchor: .measureSnapshotButton,
			title: "Snapshot with notes",
			message: "Snapshot the selected view with its spacing, pin numbered notes, then save or copy the image. After saving, Show in Finder opens it."
		),
		TutorialStep(
			anchor: .measureRefreshButton,
			title: "Capture again",
			message: "After the phone's screen changes, capture again (⌘R)."
		)
	]

	private static let simulatorControl = physicalDeviceSteps + [
		TutorialStep(
			anchor: .simulatorDevicePicker,
			title: "Pick the simulator",
			message: "The one marked Used by tests runs your tests. Pick another and press Use for tests to switch."
		),
		TutorialStep(
			anchor: .simulatorBlendedToggle,
			title: "See the layers",
			message: "Color Blended Layers tints the screen to show how views are drawn. Switch it here without menus."
		),
		TutorialStep(
			anchor: .simulatorAppControls,
			title: "Restart the app",
			message: "Relaunch or kill the app without touching the phone."
		),
		TutorialStep(
			anchor: .simulatorDeeplinks,
			title: "Open any screen by link",
			message: "Search a screen and click it, or type a link. Fill its blanks, add query parameters if needed, then Open in app over the current screen."
		),
		TutorialStep(
			anchor: .simulatorDefaults,
			title: "Change a saved setting",
			message: "Read, write or delete one of the app's settings. Writing relaunches the app so it takes effect."
		),
		TutorialStep(
			anchor: .simulatorReset,
			title: "Start clean",
			message: "Reset permissions or saved logins, or erase the whole phone. Erase asks first."
		)
	]

	private static let build = [
		TutorialStep(
			anchor: .buildTestForgeSection,
			title: "Is the app built?",
			message: "Tests need the app built from the code you prepared. Green means it is; orange says what is missing."
		),
		TutorialStep(
			anchor: .buildStartButton,
			title: "Ready for tests in one click",
			message: "Install for testing builds when needed (it asks first), then puts the app and test runner on the QA simulator."
		),
		TutorialStep(
			anchor: .buildXcodeSection,
			title: "Xcode stays closed",
			message: "See which Xcode is used, open your workspace, or install and launch a built app for a quick look."
		),
		TutorialStep(
			anchor: .buildCleanSection,
			title: "Free up space",
			message: "Each row's Delete… removes just that after asking; tick several for Reset selected. Runner screenshots clear after runs."
		)
	]

	private static let network = [
		TutorialStep(
			anchor: .networkHealthStrip,
			title: "Is the app listening?",
			message: "Green means the app on the test simulator is connected. Mocks, holds and replays only reach that app."
		),
		TutorialStep(
			anchor: .networkTabs,
			title: "Four views",
			message: """
			Traffic shows every call live. Mocks sets the answers and saves them as scenarios. Breakpoints holds a call so \
			you can edit it. Trackers checks analytics events.
			"""
		),
		TutorialStep(
			anchor: .networkTraffic,
			title: "Open a call",
			message: "Pick a call for its headers, body and curl — then mock it, replay it, or hold the next one."
		)
	]

	private static let claude = claudeRunSteps + [
		TutorialStep(
			anchor: .claudeSessionMenu,
			title: "Every Claude session",
			message: "The assistant and each run or triage has its own session. One waiting on you is listed first, and Claude in the sidebar shows a badge."
		),
		TutorialStep(
			anchor: .claudeDetailsToggle,
			title: "See everything",
			message: "Details opens every tool call and result in full — what Claude sent and what came back."
		),
		TutorialStep(
			anchor: .claudeMcp,
			title: "MCP servers",
			message: "MCP, or typing /mcp, lists the servers Claude sees and why one failed. Reconnect starts one again once its setup is fixed."
		),
		TutorialStep(
			anchor: .claudeOpenInTerminal,
			title: "Take it to Terminal",
			message: "Open in Terminal continues this conversation with claude --resume, for /plugin and every other terminal command. Send a message here later to pick it up again."
		),
		TutorialStep(
			anchor: .claudeComposer,
			title: "Tell Claude what to do",
			message: "Message the session you're looking at, or pick a quick reply such as 'Investigate what went wrong and fix it'. ⌘↩ sends."
		),
		TutorialStep(
			anchor: .remoteControlButton,
			title: "From your phone",
			message: "Remote Control lets you run QA here from the Claude app's Code tab or claude.ai/code. Turn it on and scan the QR code."
		)
	]
}
