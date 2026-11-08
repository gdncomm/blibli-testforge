import Foundation

/// A small CommonMark subset: headings, paragraphs, nested and task lists, quotes, fenced code, pipe tables,
/// image lines and rules. Enough for the reports the TestForge writes and the repo's docs (D-218); anything else
/// reads as a paragraph, and HTML comments are dropped.
enum MarkdownParser {
	private static let imagePattern = try? Regex<(Substring, Substring, Substring)>(#"!\[([^\]]*)\]\(([^)\s]+)\)\s*"#)
	private static let orderedPattern = try? Regex<(Substring, Substring)>(#"(\d{1,3})[.)]\s"#)

	/// Spaces one list level is indented by; a tab counts as one level.
	static let indentWidth = 2

	/// `baseURL` is the folder relative image paths resolve against: the open document's folder.
	static func parse(_ text: String, baseURL: URL? = nil) -> [MarkdownBlockItem] {
		var reader = LineReader(lines: text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n"))
		var blocks: [MarkdownBlock] = []
		while let line = reader.peek() {
			let trimmed = line.trimmingCharacters(in: .whitespaces)
			if trimmed.isEmpty {
				reader.advance()
			} else if trimmed.hasPrefix("<!--") {
				reader.skipComment()
			} else if trimmed.hasPrefix("```") {
				blocks.append(.code(reader.fencedCode()))
			} else if let heading = heading(in: trimmed) {
				reader.advance()
				blocks.append(heading)
			} else if trimmed == "---" || trimmed == "***" {
				reader.advance()
				blocks.append(.rule)
			} else if trimmed.hasPrefix("|") {
				blocks.append(reader.table())
			} else if let images = images(in: trimmed, startId: blocks.count * 100, baseURL: baseURL) {
				reader.advance()
				blocks.append(.images(images))
			} else if trimmed.hasPrefix("> ") || trimmed == ">" {
				blocks.append(.quote(reader.prefixedLines { quoteText(of: $0) }.joined(separator: "\n")))
			} else if listItem(in: line) != nil {
				blocks.append(.list(reader.listItems()))
			} else {
				blocks.append(.paragraph(reader.paragraph()))
			}
		}
		return blocks.enumerated().map { MarkdownBlockItem(id: $0.offset, block: $0.element) }
	}

	/// Splits a table row on unescaped pipes; `\|` stays a literal pipe in the cell.
	static func cells(of line: String) -> [String] {
		var trimmed = line.trimmingCharacters(in: .whitespaces)
		if trimmed.hasPrefix("|") {
			trimmed.removeFirst()
		}
		if trimmed.hasSuffix("|") && !trimmed.hasSuffix("\\|") {
			trimmed.removeLast()
		}
		var cells: [String] = []
		var current = ""
		var isEscaped = false
		for character in trimmed {
			if isEscaped {
				current.append(character == "|" ? "|" : "\\\(character)")
				isEscaped = false
			} else if character == "\\" {
				isEscaped = true
			} else if character == "|" {
				cells.append(current.trimmingCharacters(in: .whitespaces))
				current = ""
			} else {
				current.append(character)
			}
		}
		cells.append(current.trimmingCharacters(in: .whitespaces))
		return cells
	}

	static func isTableSeparator(_ line: String) -> Bool {
		let cells = cells(of: line)
		return !cells.isEmpty && cells.allSatisfy { cell in
			!cell.isEmpty && cell.allSatisfy { $0 == "-" || $0 == ":" }
		}
	}

	private static func heading(in line: String) -> MarkdownBlock? {
		let hashes = line.prefix { $0 == "#" }.count
		guard (1...6).contains(hashes),
			line.dropFirst(hashes).first == " "
		else {
			return nil
		}
		return .heading(level: hashes, text: String(line.dropFirst(hashes + 1)))
	}

	/// A list line with its depth, marker and task box; nil when the line is not a list item.
	static func listItem(in line: String) -> MarkdownListItem? {
		let leading = line.prefix { $0 == " " || $0 == "\t" }
		let width = leading.reduce(0) { $0 + ($1 == "\t" ? indentWidth : 1) }
		let trimmed = String(line.dropFirst(leading.count))
		let depth = width / indentWidth
		if let text = bulletText(of: trimmed) {
			return taskItem(text: text, depth: depth, marker: .bullet)
		}
		guard let pattern = orderedPattern,
			let match = try? pattern.prefixMatch(in: trimmed)
		else {
			return nil
		}
		let number = Int(match.output.1) ?? 1
		return taskItem(text: String(trimmed[match.range.upperBound...]), depth: depth, marker: .number(number))
	}

	private static func taskItem(text: String, depth: Int, marker: MarkdownListItem.Marker) -> MarkdownListItem {
		for (box, isChecked) in [("[ ] ", false), ("[x] ", true), ("[X] ", true)] where text.hasPrefix(box) {
			return MarkdownListItem(text: String(text.dropFirst(box.count)), depth: depth, marker: marker, isChecked: isChecked)
		}
		return MarkdownListItem(text: text, depth: depth, marker: marker)
	}

	/// A line made only of `![alt](url)` images becomes an image row; a relative path resolves against `baseURL`.
	private static func images(in line: String, startId: Int, baseURL: URL?) -> [MarkdownImage]? {
		guard line.hasPrefix("![") else {
			return nil
		}
		guard let pattern = imagePattern else {
			return nil
		}
		var images: [MarkdownImage] = []
		var rest = Substring(line)
		while let match = try? pattern.prefixMatch(in: rest) {
			let address = String(match.output.2)
			images.append(MarkdownImage(id: startId + images.count, alt: String(match.output.1), url: imageURL(address, baseURL: baseURL)))
			rest = rest[match.range.upperBound...]
		}
		return rest.isEmpty && !images.isEmpty ? images : nil
	}

	static func imageURL(_ address: String, baseURL: URL?) -> URL? {
		let encoded = address.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? address
		if let absolute = URL(string: address), absolute.scheme != nil {
			return absolute
		}
		if address.hasPrefix("/") {
			return URL(fileURLWithPath: address)
		}
		guard let baseURL else {
			return URL(string: address) ?? URL(string: encoded)
		}
		return (URL(string: address, relativeTo: baseURL) ?? URL(string: encoded, relativeTo: baseURL))?.absoluteURL
	}

	static func bulletText(of line: String) -> String? {
		for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
			return String(line.dropFirst(marker.count))
		}
		return nil
	}

	static func orderedText(of line: String) -> String? {
		guard let pattern = orderedPattern,
			let match = try? pattern.prefixMatch(in: line)
		else {
			return nil
		}
		return String(line[match.range.upperBound...])
	}

	/// Lines indented under a list item that are not items themselves continue that item's text.
	static func isContinuation(_ line: String) -> Bool {
		let leading = line.prefix { $0 == " " || $0 == "\t" }
		let trimmed = line.trimmingCharacters(in: .whitespaces)
		return !leading.isEmpty && !trimmed.isEmpty && !startsBlock(trimmed)
	}

	static func quoteText(of line: String) -> String? {
		if line == ">" {
			return ""
		}
		return line.hasPrefix("> ") ? String(line.dropFirst(2)) : nil
	}

	/// Lines that start another block end a paragraph.
	static func startsBlock(_ line: String) -> Bool {
		line.hasPrefix("#") || line.hasPrefix("```") || line.hasPrefix("|") || line.hasPrefix("![") || line.hasPrefix(">")
			|| line == "---" || bulletText(of: line) != nil || orderedText(of: line) != nil
	}
}

private struct LineReader {
	let lines: [String]
	var index = 0

	func peek() -> String? {
		lines[safe: index]
	}

	mutating func advance() {
		index += 1
	}

	mutating func fencedCode() -> String {
		advance()
		var code: [String] = []
		while let line = peek(), !line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
			code.append(line)
			advance()
		}
		advance()
		return code.joined(separator: "\n")
	}

	mutating func table() -> MarkdownBlock {
		var rows: [[String]] = []
		while let line = peek(), line.trimmingCharacters(in: .whitespaces).hasPrefix("|") {
			if !MarkdownParser.isTableSeparator(line) {
				rows.append(MarkdownParser.cells(of: line))
			}
			advance()
		}
		guard let header = rows.first else {
			return .paragraph("")
		}
		return .table(MarkdownTable(header: header, rows: Array(rows.dropFirst())))
	}

	/// Items until a blank line followed by a non-item, or any other block; indented text joins the item above it.
	mutating func listItems() -> [MarkdownListItem] {
		var items: [MarkdownListItem] = []
		while let line = peek() {
			if let item = MarkdownParser.listItem(in: line) {
				items.append(item)
				advance()
			} else if let last = items.last, MarkdownParser.isContinuation(line) {
				let text = last.text + " " + line.trimmingCharacters(in: .whitespaces)
				items[items.count - 1] = MarkdownListItem(text: text, depth: last.depth, marker: last.marker, isChecked: last.isChecked)
				advance()
			} else if line.trimmingCharacters(in: .whitespaces).isEmpty, nextNonBlankIsListItem() {
				advance()
			} else {
				break
			}
		}
		return items
	}

	private func nextNonBlankIsListItem() -> Bool {
		var probe = index
		while let line = lines[safe: probe], line.trimmingCharacters(in: .whitespaces).isEmpty {
			probe += 1
		}
		return lines[safe: probe].map { MarkdownParser.listItem(in: $0) != nil } ?? false
	}

	mutating func skipComment() {
		while let line = peek() {
			advance()
			if line.contains("-->") {
				return
			}
		}
	}

	mutating func prefixedLines(_ text: (String) -> String?) -> [String] {
		var items: [String] = []
		while let line = peek(), let item = text(line.trimmingCharacters(in: .whitespaces)) {
			items.append(item)
			advance()
		}
		return items
	}

	mutating func paragraph() -> String {
		var parts: [String] = []
		while let line = peek() {
			let trimmed = line.trimmingCharacters(in: .whitespaces)
			if trimmed.isEmpty || (!parts.isEmpty && MarkdownParser.startsBlock(trimmed)) {
				break
			}
			parts.append(trimmed)
			advance()
		}
		return parts.joined(separator: "\n")
	}
}
