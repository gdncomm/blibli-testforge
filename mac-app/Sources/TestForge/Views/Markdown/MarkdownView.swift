import SwiftUI

/// Renders Markdown inside the app (D-176): parsed once per text, drawn natively, local images shown inline.
/// A `#heading` link scrolls to that heading; any other link goes to `openLink`, else to the system (D-218).
struct MarkdownView: View {
	let blocks: [MarkdownBlockItem]

	/// The heading anchor to scroll to; set it to jump, the view clears nothing so the caller owns it.
	var scrollTarget: Binding<String?> = .constant(nil)

	/// Links other than `#anchor`; nil lets the system open them.
	var openLink: ((URL) -> OpenURLAction.Result)?

	var body: some View {
		let headings = blocks.headings
		ScrollViewReader { proxy in
			ScrollView {
				LazyVStack(alignment: .leading, spacing: MarkdownConstants.blockSpacing) {
					ForEach(blocks) { item in
						MarkdownBlockView(block: item.block)
							.frame(maxWidth: .infinity, alignment: .leading)
							.id(item.id)
							.accessibilityIdentifier(MarkdownConstants.Accessibility.blockPrefix + String(item.id))
					}
				}
				.padding(TestForgeConstants.Spacing.extraLarge)
				.frame(maxWidth: MarkdownConstants.contentMaxWidth, alignment: .leading)
				.frame(maxWidth: .infinity, alignment: .leading)
			}
			.environment(\.openURL, OpenURLAction { url in
				if let anchor = Self.anchor(of: url) {
					scroll(to: anchor, headings: headings, proxy: proxy)
					return .handled
				}
				return openLink?(url) ?? .systemAction
			})
			.onChange(of: scrollTarget.wrappedValue) {
				guard let anchor = scrollTarget.wrappedValue else {
					return
				}
				scroll(to: anchor, headings: headings, proxy: proxy)
			}
			.onAppear {
				if let anchor = scrollTarget.wrappedValue {
					scroll(to: anchor, headings: headings, proxy: proxy)
				}
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(MarkdownConstants.Accessibility.viewer)
	}

	private func scroll(to anchor: String, headings: [MarkdownHeading], proxy: ScrollViewProxy) {
		guard let heading = headings.first(where: { $0.anchor == anchor }) else {
			return
		}
		withAnimation(.easeInOut(duration: MarkdownConstants.scrollAnimation)) {
			proxy.scrollTo(heading.blockId, anchor: .top)
		}
	}

	/// `#anchor` with no path; a link to another file's heading goes to `openLink`.
	static func anchor(of url: URL) -> String? {
		let text = url.relativeString
		guard text.hasPrefix("#"),
			text.count > 1
		else {
			return nil
		}
		return String(text.dropFirst()).removingPercentEncoding ?? String(text.dropFirst())
	}
}
