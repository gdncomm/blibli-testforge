import SwiftUI

struct TestCaseRowView: View {
	let row: TestCaseRowModel

	var body: some View {
		HStack(alignment: .firstTextBaseline, spacing: TestForgeConstants.Spacing.medium) {
			VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
				HStack(spacing: TestForgeConstants.Spacing.small) {
					Text(row.id)
						.font(.body.monospaced().weight(.semibold))
					TestCaseReplayBadgeView(badge: row.replayBadge)
					if row.isEditedLocally {
						Image(systemName: "pencil")
							.foregroundStyle(.secondary)
							.help("Edited locally")
							.accessibilityLabel("Edited locally")
							.accessibilityIdentifier(TestForgeConstants.Accessibility.testsEditedIcon)
					}
					if let staleHelpText = row.staleHelpText {
						Image(systemName: "clock.arrow.circlepath")
							.foregroundStyle(.orange)
							.help(staleHelpText)
							.accessibilityLabel(staleHelpText)
							.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRowStaleBadge)
					}
					ForEach(row.proofBadges) { badge in
						TestCaseProofBadgeView(badge: badge)
					}
				}
				Text(row.scenario)
					.font(.callout)
					.foregroundStyle(.secondary)
					.lineLimit(2)
					.help(row.scenario)
			}
			Spacer()
			VerdictBadgeView(text: row.verdictText, tone: row.verdictTone)
		}
		.padding(.vertical, TestForgeConstants.Spacing.small)
		.accessibilityElement(children: .combine)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.testsRowPrefix + row.id)
	}
}
