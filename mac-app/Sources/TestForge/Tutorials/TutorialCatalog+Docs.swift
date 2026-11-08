import Foundation

/// R40 (D-218): the Docs section.
extension TutorialCatalog {
	static let docsSteps = [
		TutorialStep(
			anchor: .docsList,
			title: "The guides, right here",
			message: """
				The usage guide and the feature list come first, then the TestForge's other docs. \
				Files you drop or open stay under Your files.
				"""
		),
		TutorialStep(
			anchor: .docsOpenButton,
			title: "Read any Markdown file",
			message: "Drop .md files or a folder of them anywhere on this page, or press Open… (⌘O)."
		),
		TutorialStep(
			anchor: .docsPage,
			title: "Links work in place",
			message: "A link to another doc opens it here, at the right heading; Back returns. Web links open in your browser."
		),
		TutorialStep(
			anchor: .docsOutlineToggle,
			title: "Jump to a heading",
			message: "The outline lists this page's headings. Click one to go there."
		),
		TutorialStep(
			anchor: .docsModePicker,
			title: "Half or Full",
			message: "Half keeps the list beside the page. Full gives the page the whole window, hiding the sidebar and console until you switch back."
		),
		TutorialStep(
			anchor: .docsWindowButton,
			title: "Its own window",
			message: "Open the page in a separate window on the left or right half of the screen, or full screen, beside the Simulator or Xcode."
		),
	]
}
