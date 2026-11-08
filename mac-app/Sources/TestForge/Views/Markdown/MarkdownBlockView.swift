import SwiftUI

struct MarkdownBlockView: View {
	let block: MarkdownBlock

	var body: some View {
		switch block {
			case .heading(let level, let text):
				MarkdownInlineText(text: text)
					.font(Self.headingFont(level: level))
					.padding(.top, level <= 2 ? MarkdownConstants.blockSpacing : 0)
			case .paragraph(let text):
				MarkdownInlineText(text: text)
			case .list(let items):
				listView(items: items)
			case .quote(let text):
				quoteView(text: text)
			case .code(let code):
				Text(code)
					.font(.system(.callout, design: .monospaced))
					.textSelection(.enabled)
					.padding(MarkdownConstants.tableCellPadding)
					.frame(maxWidth: .infinity, alignment: .leading)
					.background(Color.secondary.opacity(MarkdownConstants.backgroundOpacity), in: codeShape)
			case .table(let table):
				MarkdownTableView(table: table)
			case .images(let images):
				imageRow(images)
			case .rule:
				Divider()
		}
	}

	private var codeShape: RoundedRectangle {
		RoundedRectangle(cornerRadius: MarkdownConstants.codeCornerRadius)
	}

	private func listView(items: [MarkdownListItem]) -> some View {
		VStack(alignment: .leading, spacing: MarkdownConstants.listItemSpacing) {
			ForEach(Array(items.enumerated()), id: \.offset) { _, item in
				HStack(alignment: .firstTextBaseline, spacing: 0) {
					marker(for: item)
						.foregroundStyle(.secondary)
						.frame(width: markerWidth(for: item), alignment: .leading)
					MarkdownInlineText(text: item.text)
				}
				.padding(.leading, CGFloat(item.depth) * MarkdownConstants.listIndent)
			}
		}
	}

	@ViewBuilder
	private func marker(for item: MarkdownListItem) -> some View {
		if let isChecked = item.isChecked {
			Image(systemName: isChecked ? "checkmark.square" : "square")
				.accessibilityLabel(isChecked ? Text("Done") : Text("Not done"))
		} else {
			switch item.marker {
				case .bullet:
					Text(item.depth == 0 ? "•" : "◦")
				case .number(let number):
					Text("\(number).")
						.monospacedDigit()
			}
		}
	}

	private func markerWidth(for item: MarkdownListItem) -> CGFloat {
		if case .number(let number) = item.marker, number >= 10, item.isChecked == nil {
			return MarkdownConstants.wideBulletWidth
		}
		return MarkdownConstants.bulletWidth
	}

	private func quoteView(text: String) -> some View {
		HStack(alignment: .top, spacing: MarkdownConstants.tableCellPadding) {
			Rectangle()
				.fill(Color.accentColor)
				.frame(width: MarkdownConstants.quoteBarWidth)
			MarkdownInlineText(text: text)
				.foregroundStyle(.secondary)
		}
		.fixedSize(horizontal: false, vertical: true)
	}

	private func imageRow(_ images: [MarkdownImage]) -> some View {
		ScrollView(.horizontal) {
			HStack(alignment: .top, spacing: MarkdownConstants.blockSpacing) {
				ForEach(images) { image in
					MarkdownImageView(image: image)
				}
			}
		}
	}

	private static func headingFont(level: Int) -> Font {
		switch level {
			case 1:
				return .title.weight(.bold)
			case 2:
				return .title2.weight(.semibold)
			case 3:
				return .title3.weight(.semibold)
			default:
				return .headline
		}
	}
}
