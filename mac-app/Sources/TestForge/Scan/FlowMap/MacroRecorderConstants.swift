import CoreGraphics

/// Scan › Record macro (D-171).
enum MacroRecorderConstants {
	static let sheetWidth: CGFloat = 520
	static let warningListMaxHeight: CGFloat = 160
	static let bannerCornerRadius: CGFloat = 8
	static let bannerBackgroundOpacity: Double = 0.14
	static let libraryListMinWidth: CGFloat = 280
	static let libraryListIdealWidth: CGFloat = 360
	static let libraryListMaxWidth: CGFloat = 600
	static let libraryDetailMinWidth: CGFloat = 320
	static let rowIconSize: CGFloat = 28

	enum Accessibility {
		static let saveButton = "TestForge_RecordMacro_SaveButton"
		static let leftPicker = "TestForge_RecordMacro_LeftPicker"
		static let steps = "TestForge_RecordMacro_Steps"
		static let stepPrefix = "TestForge_RecordMacro_Step_"
		static let stepWarningPrefix = "TestForge_RecordMacro_StepWarning_"
		static let stepDeletePrefix = "TestForge_RecordMacro_StepDelete_"
		static let stepsEmpty = "TestForge_RecordMacro_StepsEmpty"
		static let banner = "TestForge_RecordMacro_MissingIdBanner"
		static let bannerText = "TestForge_RecordMacro_MissingIdBannerText"
		static let bannerDismiss = "TestForge_RecordMacro_MissingIdBannerDismiss"
		static let sheet = "TestForge_RecordMacro_Sheet"
		static let sheetName = "TestForge_RecordMacro_SheetName"
		static let sheetCase = "TestForge_RecordMacro_SheetCase"
		static let sheetModule = "TestForge_RecordMacro_SheetModule"
		static let sheetSubmodule = "TestForge_RecordMacro_SheetSubmodule"
		static let sheetFreshStart = "TestForge_RecordMacro_SheetFreshStart"
		static let sheetWarnings = "TestForge_RecordMacro_SheetWarnings"
		static let sheetSave = "TestForge_RecordMacro_SheetSave"
		static let sheetCancel = "TestForge_RecordMacro_SheetCancel"
		static let startButton = "TestForge_RecordMacro_StartButton"
		static let endButton = "TestForge_RecordMacro_EndButton"
		static let discardButton = "TestForge_RecordMacro_DiscardButton"
		static let discardConfirm = "TestForge_RecordMacro_DiscardConfirm"
		static let summary = "TestForge_RecordMacro_Summary"
		static let library = "TestForge_RecordMacro_Library"
		static let libraryTitle = "TestForge_RecordMacro_LibraryTitle"
		static let libraryEmpty = "TestForge_RecordMacro_LibraryEmpty"
		static let libraryList = "TestForge_RecordMacro_LibraryList"
		static let libraryRowPrefix = "TestForge_RecordMacro_LibraryRow_"
		static let libraryRefresh = "TestForge_RecordMacro_LibraryRefresh"
		static let macroDetail = "TestForge_RecordMacro_MacroDetail"
		static let macroDetailName = "TestForge_RecordMacro_MacroDetailName"
		static let macroReplay = "TestForge_RecordMacro_MacroReplay"
		static let macroReveal = "TestForge_RecordMacro_MacroReveal"
		static let savedNotice = "TestForge_RecordMacro_SavedNotice"
		static let savedNoticeDismiss = "TestForge_RecordMacro_SavedNoticeDismiss"
		static let macroEditSteps = "TestForge_RecordMacro_MacroEditSteps"
		static let stepEditorSheet = "TestForge_StepEditor_Sheet"
		static let stepEditorList = "TestForge_StepEditor_List"
		static let stepEditorRowPrefix = "TestForge_StepEditor_Row_"
		static let stepEditorRemovePrefix = "TestForge_StepEditor_Remove_"
		static let stepEditorTimeoutPrefix = "TestForge_StepEditor_Timeout_"
		static let stepEditorOptionalPrefix = "TestForge_StepEditor_Optional_"
		static let stepEditorTextPrefix = "TestForge_StepEditor_Text_"
		static let stepEditorSave = "TestForge_StepEditor_Save"
		static let stepEditorRevert = "TestForge_StepEditor_Revert"
		static let stepEditorCancel = "TestForge_StepEditor_Cancel"
		static let stepEditorStatus = "TestForge_StepEditor_Status"
	}

	enum StepEditor {
		static let width: CGFloat = 640
		static let listHeight: CGFloat = 420
		static let numberFieldWidth: CGFloat = 56
		static let timeoutRange: ClosedRange<Double> = 0.5...120
	}
}
