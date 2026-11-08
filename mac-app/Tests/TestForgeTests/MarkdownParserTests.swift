import Foundation
import Testing
@testable import TestForge

struct MarkdownParserTests {
	private func blocks(_ text: String, baseURL: URL? = nil) -> [MarkdownBlock] {
		MarkdownParser.parse(text, baseURL: baseURL).map(\.block)
	}

	@Test func nestedBulletsKeepTheirDepth() {
		let parsed = blocks("- One\n  - Two\n    - Three\n- Four")
		#expect(parsed == [.list([
			MarkdownListItem(text: "One", depth: 0),
			MarkdownListItem(text: "Two", depth: 1),
			MarkdownListItem(text: "Three", depth: 2),
			MarkdownListItem(text: "Four", depth: 0),
		])])
	}

	@Test func orderedItemsKeepTheirNumberAndNestBullets() {
		let parsed = blocks("1. First\n   - detail\n2. Second")
		#expect(parsed == [.list([
			MarkdownListItem(text: "First", depth: 0, marker: .number(1)),
			MarkdownListItem(text: "detail", depth: 1),
			MarkdownListItem(text: "Second", depth: 0, marker: .number(2)),
		])])
	}

	@Test func taskItemsCarryTheirBox() {
		let parsed = blocks("- [ ] Open\n- [x] Done")
		#expect(parsed == [.list([
			MarkdownListItem(text: "Open", isChecked: false),
			MarkdownListItem(text: "Done", isChecked: true),
		])])
	}

	@Test func indentedTextContinuesTheItemAbove() {
		let parsed = blocks("- First line\n  carries on\n- Next")
		#expect(parsed == [.list([
			MarkdownListItem(text: "First line carries on"),
			MarkdownListItem(text: "Next"),
		])])
	}

	@Test func aBlankLineBetweenItemsKeepsOneList() {
		let parsed = blocks("1. One\n\n2. Two\n\nAfter")
		#expect(parsed == [
			.list([MarkdownListItem(text: "One", marker: .number(1)), MarkdownListItem(text: "Two", marker: .number(2))]),
			.paragraph("After"),
		])
	}

	@Test func htmlCommentsAreDropped() {
		#expect(blocks("<!-- note\nmore -->\nText") == [.paragraph("Text")])
	}

	@Test func boldTextIsNotABullet() {
		#expect(blocks("**Bold** start") == [.paragraph("**Bold** start")])
	}

	@Test func relativeImagesResolveAgainstTheDocumentFolder() throws {
		let base = URL(fileURLWithPath: "/tmp/docs/", isDirectory: true)
		let parsed = blocks("![Shot](images/a%20b.png)", baseURL: base)
		guard case .images(let images) = parsed.first else {
			Issue.record("Expected an image row")
			return
		}
		let url = try #require(images.first?.url)
		#expect(url.path == "/tmp/docs/images/a b.png")
	}

	@Test func headingsGetGitHubAnchors() {
		let items = MarkdownParser.parse("# Usage guide\n## 4. Tests\n## **Get ready** (⌘1)\n## 4. Tests")
		#expect(items.headings.map(\.anchor) == ["usage-guide", "4-tests", "get-ready-1", "4-tests-1"])
		#expect(items.headings[2].title == "Get ready (⌘1)")
	}

	@Test func onlyBareHashLinksAreAnchors() throws {
		#expect(MarkdownView.anchor(of: try #require(URL(string: "#what-it-is"))) == "what-it-is")
		#expect(MarkdownView.anchor(of: try #require(URL(string: "Features.md#menus"))) == nil)
		#expect(MarkdownView.anchor(of: try #require(URL(string: "https://example.com/#x"))) == nil)
	}
}
