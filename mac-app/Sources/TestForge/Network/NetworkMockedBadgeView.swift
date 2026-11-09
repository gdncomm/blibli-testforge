import SwiftUI

/// "Mocked" vs "Real": which answers came from NetworkLens rather than the backend.
struct NetworkMockedBadgeView: View {
	let isMocked: Bool

	var body: some View {
		Text(isMocked ? "Mocked" : "Real")
			.font(.caption2.bold())
			.foregroundStyle(tint)
			.padding(.horizontal, NetworkConsoleConstants.Badge.horizontalPadding)
			.padding(.vertical, NetworkConsoleConstants.Badge.verticalPadding)
			.background(tint.opacity(NetworkConsoleConstants.Badge.backgroundOpacity), in: Capsule())
			.accessibilityIdentifier(Self.badgeIdentifier)
	}

	private var tint: Color {
		isMocked ? .purple : .secondary
	}
}

private extension NetworkMockedBadgeView {
	static let badgeIdentifier = "TestForge_Network_MockedBadge"
}
