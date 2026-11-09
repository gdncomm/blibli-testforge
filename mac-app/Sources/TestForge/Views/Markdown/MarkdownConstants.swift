import CoreGraphics

/// The in-app Markdown viewer (D-176).
enum MarkdownConstants {
	static let blockSpacing: CGFloat = 12
	static let listItemSpacing: CGFloat = 4
	static let bulletWidth: CGFloat = 18
	static let wideBulletWidth: CGFloat = 26
	static let listIndent: CGFloat = 20
	static let scrollAnimation: Double = 0.25
	static let quoteBarWidth: CGFloat = 3
	static let codeCornerRadius: CGFloat = 6
	static let tableCellPadding: CGFloat = 6
	static let tableMinColumnWidth: CGFloat = 60
	static let imageMaxWidth: CGFloat = 240
	static let imageMaxHeight: CGFloat = 480
	static let imageCornerRadius: CGFloat = 6
	static let contentMaxWidth: CGFloat = 980
	static let backgroundOpacity: Double = 0.08

	enum Accessibility {
		static let viewer = "TestForge_Markdown_Viewer"
		static let blockPrefix = "TestForge_Markdown_Block_"
		static let imagePrefix = "TestForge_Markdown_Image_"
	}
}
