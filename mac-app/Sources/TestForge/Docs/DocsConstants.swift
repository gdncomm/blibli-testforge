import CoreGraphics
import Foundation

/// The Docs section and window (D-218).
enum DocsConstants {
	static let windowId = "docs"
	static let listWidth: CGFloat = 260
	static let listMinWidth: CGFloat = 200
	static let outlineWidth: CGFloat = 220
	static let outlineIndent: CGFloat = 12
	static let pageMinWidth: CGFloat = 360
	static let windowMinWidth: CGFloat = 480
	static let windowMinHeight: CGFloat = 400
	static let dropCornerRadius: CGFloat = 10
	static let dropBorderWidth: CGFloat = 2
	static let dropBackgroundOpacity: Double = 0.08

	static let recentLimit = 30
	static let folderDepth = 3
	static let folderFileLimit = 200
	static let titleProbeBytes = 4_096
	static let titleProbeLines = 20
	static let historyLimit = 50

	/// Tries to find the Docs window after asking SwiftUI to open it, before giving up on arranging it.
	static let windowLookupAttempts = 10
	static let windowLookupDelay: Duration = .milliseconds(100)

	enum Storage {
		static let recentFiles = "docs.recentFiles"
		static let selectedPath = "docs.selectedPath"
		static let readingMode = "docs.readingMode"
		static let isOutlineShown = "docs.isOutlineShown"
	}

	enum Accessibility {
		static let section = "TestForge_Docs_Section"
		static let list = "TestForge_Docs_List"
		static let listFilter = "TestForge_Docs_ListFilter"
		static let groupPrefix = "TestForge_Docs_Group_"
		static let rowPrefix = "TestForge_Docs_Row_"
		static let rowTitlePrefix = "TestForge_Docs_RowTitle_"
		static let rowSubtitlePrefix = "TestForge_Docs_RowSubtitle_"
		static let rowRemovePrefix = "TestForge_Docs_RowRemove_"
		static let openButton = "TestForge_Docs_OpenButton"
		static let reloadButton = "TestForge_Docs_ReloadButton"
		static let dropZone = "TestForge_Docs_DropZone"
		static let dropOverlay = "TestForge_Docs_DropOverlay"
		static let notice = "TestForge_Docs_Notice"
		static let page = "TestForge_Docs_Page"
		static let pageHeader = "TestForge_Docs_PageHeader"
		static let pageTitle = "TestForge_Docs_PageTitle"
		static let pagePath = "TestForge_Docs_PagePath"
		static let pageEmpty = "TestForge_Docs_PageEmpty"
		static let pageLoading = "TestForge_Docs_PageLoading"
		static let pageFailed = "TestForge_Docs_PageFailed"
		static let backButton = "TestForge_Docs_BackButton"
		static let modePicker = "TestForge_Docs_ModePicker"
		static let outlineToggle = "TestForge_Docs_OutlineToggle"
		static let outline = "TestForge_Docs_Outline"
		static let outlineRowPrefix = "TestForge_Docs_OutlineRow_"
		static let windowButton = "TestForge_Docs_WindowButton"
		static let windowMenuPrefix = "TestForge_Docs_WindowMenu_"
		static let moreMenu = "TestForge_Docs_MoreMenu"
		static let revealButton = "TestForge_Docs_RevealButton"
		static let openDefaultButton = "TestForge_Docs_OpenDefaultButton"
		static let copyPathButton = "TestForge_Docs_CopyPathButton"
		static let window = "TestForge_Docs_Window"
		static let windowLayoutPrefix = "TestForge_Docs_WindowLayout_"
		static let windowLayoutStatus = "TestForge_Docs_WindowLayoutStatus"
		static let openMenuItem = "TestForge_Docs_OpenMenuItem"
	}
}
