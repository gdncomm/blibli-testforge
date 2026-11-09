import SwiftUI

/// Proof screenshots are local files under `TEST_FORGE_MEDIA_ROOT`; clicking one opens it in Preview.
struct ResultScreenshotStripView: View {
	let urls: [URL]
	let openScreenshot: (URL) -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			Text("Proof (\(urls.count))")
				.font(.headline)
			ScrollView(.horizontal) {
				LazyHStack(spacing: TestForgeConstants.Spacing.medium) {
					ForEach(urls, id: \.self) { url in
						thumbnail(url: url)
					}
				}
			}
			.frame(height: TestForgeConstants.Results.screenshotHeight)
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.resultsScreenshots)
	}

	private func thumbnail(url: URL) -> some View {
		Button {
			openScreenshot(url)
		} label: {
			AsyncImage(url: url) { phase in
				switch phase {
					case .success(let image):
						image
							.resizable()
							.scaledToFit()
					case .failure:
						Label("Not on disk any more: \(url.lastPathComponent)", systemImage: "photo.badge.exclamationmark")
							.font(.caption)
							.foregroundStyle(.secondary)
					default:
						ProgressView()
				}
			}
			.frame(maxHeight: TestForgeConstants.Results.screenshotHeight)
		}
		.buttonStyle(.plain)
		.help(url.lastPathComponent)
		.accessibilityLabel(url.lastPathComponent)
	}
}
