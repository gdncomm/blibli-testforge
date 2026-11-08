import SwiftUI

/// The running build's output, newest line kept in view.
struct BuildLogSectionView: View {
	let lines: [String]
	var title: LocalizedStringKey = "Build log"
	var accessibilityId = TestForgeConstants.Accessibility.buildLog

	var body: some View {
		if !lines.isEmpty {
			Section(title) {
				ScrollViewReader { proxy in
					ScrollView {
						LazyVStack(alignment: .leading, spacing: 0) {
							ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
								Text(line)
									.font(.system(.caption, design: .monospaced))
									.textSelection(.enabled)
									.frame(maxWidth: .infinity, alignment: .leading)
									.id(index)
							}
						}
					}
					.frame(height: TestForgeConstants.Build.logHeight)
					.onChange(of: lines.count) {
						proxy.scrollTo(lines.count - 1, anchor: .bottom)
					}
				}
			}
			.accessibilityIdentifier(accessibilityId)
		}
	}
}
