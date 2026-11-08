import SwiftUI

struct TestCaseReplayActions {
	/// The recording runs without Claude (D-220) and nothing else is running.
	let canReplay: Bool

	/// Claude is writing the explanations right now; the menu waits for it.
	let isWriting: Bool

	/// False while a run starts or runs.
	let canWrite: Bool

	/// D-213: the request in flight; a spinner beside the button shows it while the replay starts.
	let busyAction: TestCaseAction?

	let replay: () -> Void
	let replayExplained: () -> Void
	let recordDemo: () -> Void
	let writeExplanations: () -> Void
}

/// D-220: one Replay button. A click replays; press and hold (or the arrow) lists the other replays (D-165) and,
/// last and marked with sparkles, the one choice that uses Claude.
struct TestCaseReplayMenuView: View {
	let recordingName: String
	let hasExplanations: Bool
	let actions: TestCaseReplayActions

	var body: some View {
		// A menu label can't show a spinner on macOS, so it sits beside the menu while the menu's work starts.
		HStack(spacing: TestForgeConstants.Spacing.small) {
			menu
			if busyTitle != nil {
				ProgressView()
					.controlSize(.small)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.testsBusyLabel)
			}
		}
	}

	private var menu: some View {
		Menu {
			Button {
				actions.replay()
			} label: {
				Label("Replay", systemImage: "play.fill")
			}
			.disabled(!actions.canReplay)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayMenuReplay)
			Button {
				actions.replayExplained()
			} label: {
				Label("Replay with explanations", systemImage: "captions.bubble")
			}
			.disabled(!actions.canReplay)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsExplainedReplayButton)
			Button {
				actions.recordDemo()
			} label: {
				Label("Record demo video", systemImage: "film")
			}
			.disabled(!actions.canReplay)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRecordDemoButton)
			Divider()
			Button {
				actions.writeExplanations()
			} label: {
				Label(hasExplanations ? "Rewrite explanations with Claude…" : "Write explanations with Claude…", systemImage: "sparkles")
			}
			.disabled(actions.isWriting || !actions.canWrite)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsWriteExplanationsButton)
		} label: {
			Label(busyTitle ?? String(localized: "Replay"), systemImage: "play.fill")
		} primaryAction: {
			actions.replay()
		}
		.menuStyle(.button)
		.buttonStyle(.borderedProminent)
		.fixedSize()
		.disabled(!actions.canReplay)
		.help("Replay “\(recordingName)” with no Claude usage (⌘R). Press and hold for explained replays and demo videos.")
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayButton)
		.tutorialAnchor(.testsReplayButton)
	}

	private var busyTitle: String? {
		switch actions.busyAction {
			case .replay:
				return String(localized: "Starting replay…")
			case .replayWithExplanations:
				return String(localized: "Starting explained replay…")
			case .recordDemo:
				return String(localized: "Starting demo video…")
			default:
				return actions.isWriting ? String(localized: "Writing explanations…") : nil
		}
	}
}
