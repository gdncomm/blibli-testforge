import Foundation

struct MarkdownImage: Equatable, Identifiable {
	let id: Int
	let alt: String
	let url: URL?
}

struct MarkdownTable: Equatable {
	let header: [String]
	let rows: [[String]]
}

/// One line of a list; `depth` 0 is the outer list, each level of indent adds one (D-218).
struct MarkdownListItem: Equatable {
	enum Marker: Equatable {
		case bullet
		case number(Int)
	}

	let text: String
	let depth: Int
	let marker: Marker

	/// `- [ ]` and `- [x]` task items; nil for a plain item.
	let isChecked: Bool?

	init(text: String, depth: Int = 0, marker: Marker = .bullet, isChecked: Bool? = nil) {
		self.text = text
		self.depth = depth
		self.marker = marker
		self.isChecked = isChecked
	}
}

/// The block kinds the in-app viewer draws (D-176, D-218); inline formatting stays in the text and is rendered by SwiftUI.
enum MarkdownBlock: Equatable {
	case heading(level: Int, text: String)
	case paragraph(String)
	case list([MarkdownListItem])
	case quote(String)
	case code(String)
	case table(MarkdownTable)
	case images([MarkdownImage])
	case rule
}

struct MarkdownBlockItem: Equatable, Identifiable {
	let id: Int
	let block: MarkdownBlock
}

/// A heading as the outline lists it, with the anchor a `#…` link jumps to.
struct MarkdownHeading: Equatable, Identifiable {
	let blockId: Int
	let level: Int
	let title: String
	let anchor: String

	var id: Int { blockId }
}

extension Array where Element == MarkdownBlockItem {
	/// Headings in order with GitHub-style anchors; a repeated title gets `-1`, `-2`… like GitHub.
	var headings: [MarkdownHeading] {
		var seen: [String: Int] = [:]
		return compactMap { item in
			guard case .heading(let level, let text) = item.block else {
				return nil
			}
			let title = MarkdownAnchor.plainText(of: text)
			let base = MarkdownAnchor.slug(of: title)
			let count = seen[base, default: 0]
			seen[base] = count + 1
			let anchor = count == 0 ? base : "\(base)-\(count)"
			return MarkdownHeading(blockId: item.id, level: level, title: title, anchor: anchor)
		}
	}
}

enum MarkdownAnchor {
	/// GitHub's rule: lowercase, drop punctuation except `-` and `_`, spaces become `-`.
	static func slug(of title: String) -> String {
		var slug = ""
		for character in title.lowercased() {
			if character.isLetter || character.isNumber || character == "-" || character == "_" {
				slug.append(character)
			} else if character == " " {
				slug.append("-")
			}
		}
		return slug
	}

	/// The heading's words without inline Markdown, so `**Tests** (⌘2)` lists as "Tests (⌘2)".
	static func plainText(of text: String) -> String {
		let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
		guard let attributed = try? AttributedString(markdown: text, options: options) else {
			return text
		}
		return String(attributed.characters)
	}
}
