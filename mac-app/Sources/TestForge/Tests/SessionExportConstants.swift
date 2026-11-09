import CoreGraphics
import Foundation

/// Tests › Export session… (D-173).
enum SessionExportConstants {
	static let sheetWidth: CGFloat = 520

	/// Copying every proof video into the zip can take minutes on a long session.
	static let timeout: TimeInterval = 900

	enum Accessibility {
		static let sheet = "TestForge_SessionExport_Sheet"
		static let title = "TestForge_SessionExport_Title"
		static let progress = "TestForge_SessionExport_Progress"
		static let outcome = "TestForge_SessionExport_Outcome"
		static let mediaToggle = "TestForge_SessionExport_MediaToggle"
		static let reveal = "TestForge_SessionExport_RevealButton"
		static let cancel = "TestForge_SessionExport_CancelButton"
		static let button = "TestForge_SessionExport_ExportButton"
		static let done = "TestForge_SessionExport_DoneButton"
	}
}
