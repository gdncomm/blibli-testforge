import SwiftUI

/// D-220: one icon per case that tells a free replay from a run that needs Claude.
struct TestCaseReplayBadge: Equatable {
	let kind: TestCaseReplayKind
	let title: String
	let helpText: String

	init(status: TestCaseReplayStatus) {
		kind = status.kind
		helpText = status.text
		switch status.kind {
			case .free:
				title = String(localized: "Free replay")
			case .unconfirmed:
				title = String(localized: "Replay not confirmed")
			case .broken:
				title = String(localized: "Recording needs repair")
			case .claude:
				title = String(localized: "Needs Claude")
		}
	}

	/// Replay is offered only for a recording that runs without Claude.
	var canReplay: Bool {
		kind == .free || kind == .unconfirmed
	}

	/// A bolt for the driver (no AI); sparkles, Apple's AI symbol, wherever Claude is needed.
	var systemImage: String {
		switch kind {
			case .free:
				return "bolt.circle.fill"
			case .unconfirmed:
				return "bolt.badge.clock"
			case .broken:
				return "bolt.trianglebadge.exclamationmark"
			case .claude:
				return "sparkles"
		}
	}

	var tint: Color {
		switch kind {
			case .free:
				return .green
			case .unconfirmed:
				return .orange
			case .broken:
				return .red
			case .claude:
				return .purple
		}
	}
}

struct TestCaseReplayBadgeView: View {
	let badge: TestCaseReplayBadge

	var body: some View {
		Image(systemName: badge.systemImage)
			.symbolRenderingMode(.hierarchical)
			.foregroundStyle(badge.tint)
			.help("\(badge.title): \(badge.helpText)")
			.accessibilityLabel(badge.title)
			.accessibilityValue(badge.helpText)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayBadgePrefix + badge.kind.rawValue)
	}
}

/// The case's replay status in words under its actions, with the same icon as its row.
struct TestCaseReplayStatusView: View {
	let badge: TestCaseReplayBadge

	var body: some View {
		HStack(alignment: .firstTextBaseline, spacing: TestForgeConstants.Spacing.small) {
			TestCaseReplayBadgeView(badge: badge)
			Text(badge.title)
				.font(.callout.weight(.semibold))
				.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayStatusTitle)
			Text(badge.helpText)
				.font(.callout)
				.foregroundStyle(.secondary)
				.fixedSize(horizontal: false, vertical: true)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayStatusText)
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsReplayStatus)
		.tutorialAnchor(.testsReplayStatus)
	}
}
