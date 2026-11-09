import CoreGraphics
import Foundation
import SwiftUI

enum TestForgeConstants {
	enum Window {
		static let mainWindowId = "main"
		static let measureWindowId = "measure"
		static let proofViewerWindowId = "proof"
		/// Tests panes (862) plus the sidebar counted twice: on macOS 26 the detail column runs under the sidebar and is inset by it.
		static let minWidth: CGFloat = 1240
		static let narrowestWidth: CGFloat = 480

		static let minHeight: CGFloat = 560
		static let sidebarMinWidth: CGFloat = 180
		static let sectionMinHeight: CGFloat = 360
		static let sectionIdealHeight: CGFloat = 640
	}

	enum Spacing {
		static let small: CGFloat = 4
		static let medium: CGFloat = 8
		static let large: CGFloat = 16
		static let extraLarge: CGFloat = 24
	}

	enum GetReady {
		static let rowIconSize: CGFloat = 18
		static let contentMaxWidth: CGFloat = 720
	}

	enum Console {
		static let minHeight: CGFloat = 140
		static let idealHeight: CGFloat = 220
		/// Without a cap the split gave every extra point of a taller window to the console.
		static let maxHeight: CGFloat = 420

		static let sourceTagWidth: CGFloat = 56
		static let searchFieldWidth: CGFloat = 200
	}

	enum Tests {
		static let listWidth: CGFloat = 340
		static let listMinWidth: CGFloat = 240
		static let listMaxWidth: CGFloat = 720
		static let detailMinWidth: CGFloat = 280
		static let inspectorWidth: CGFloat = 280
		static let inspectorMinWidth: CGFloat = 220
		static let inspectorMaxWidth: CGFloat = 560
		static let stepIconSize: CGFloat = 14
		static let loadSheetWidth: CGFloat = 480
		static let badgeVerticalPadding: CGFloat = 2
		static let badgeBackgroundOpacity: Double = 0.12
	}

	enum Scan {
		static let screenListWidth: CGFloat = 300
		static let lastScanListMaxHeight: CGFloat = 260
		static let identifierChipMinWidth: CGFloat = 180
		static let chipCornerRadius: CGFloat = 4
	}

	/// Results panes (260 + 300 + 320) fit the 1 240-pt window minimum, like Tests.
	enum Results {
		static let runListWidth: CGFloat = 260
		static let detailMinWidth: CGFloat = 300
		static let inspectorWidth: CGFloat = 320
		static let tileMinWidth: CGFloat = 64
		static let tileCornerRadius: CGFloat = 8
		static let tileBackgroundOpacity: Double = 0.08
		static let screenshotHeight: CGFloat = 220
		static let stepsMaxHeight: CGFloat = 240
		static let overrideSheetWidth: CGFloat = 440
		static let reasonLineRange = 3...6
		static let minimumReasonLength = 5
	}

	enum Reports {
		static let branchListWidth: CGFloat = 260
		static let contentMaxWidth: CGFloat = 900
		static let verdictColumnWidth: CGFloat = 150
		static let changeColumnWidth: CGFloat = 120
		static let pickerMaxWidth: CGFloat = 360
	}

	enum Simulator {
		static let bundleIdentifier = "com.apple.iphonesimulator"
		static let desktopSwitchTimeout: TimeInterval = 3
		static let tileTimeout: TimeInterval = 6
		static let desktopPollNanoseconds: UInt64 = 100_000_000
		static let clickStepNanoseconds: UInt64 = 100_000_000
	}

	enum Overlay {
		static let outlineLineWidth: CGFloat = 3
		static let outlineCornerRadius: CGFloat = 4
		static let badgeHeight: CGFloat = 20
		static let badgeMaxWidth: CGFloat = 260
		static let trackingInterval = Duration.milliseconds(400)

		/// The server lets the lease lapse after 90 s, so renewing every minute keeps it alive with room to spare.
		static let leaseRenewal = Duration.seconds(60)
	}

	enum FlowMap {
		/// Jaccard overlap of normalized identifiers that makes two reads the same screen.
		static let matchThreshold = 0.55

		/// Same nav title lowers the bar: a list screen keeps its title while its rows (and identifiers) change.
		static let sameTitleMatchThreshold = 0.3

		static let titleBandFraction: CGFloat = 0.18
		static let titleCentreFraction: CGFloat = 0.3
		static let titleMaximumLength = 32
		static let identifierParentDepth = 3
		static let identifierParentAreaRatio: CGFloat = 6
		static let minimumPrefixCount = 3
		static let maximumReads = 5
		static let settleNanoseconds: UInt64 = 600_000_000
		static let swipeThreshold: CGFloat = 12
		static let treeWidth: CGFloat = 360
		static let thumbnailMaxHeight: CGFloat = 420
		static let thumbnailCornerRadius: CGFloat = 8
	}

	enum MeasureSnapshot {
		/// Fixed colours, not system ones: the exported PNG must look the same in light and dark mode.
		static let elementColor = Color(red: 0.0, green: 0.48, blue: 1.0)

		static let gapColor = Color(red: 0.91, green: 0.12, blue: 0.39)
		static let pinColor = Color(red: 0.96, green: 0.45, blue: 0.0)

		static let elementLineWidth: CGFloat = 1.5
		static let gapLineWidth: CGFloat = 1
		static let labelFontSize: CGFloat = 10
		static let pinSize: CGFloat = 20
		static let pinFontSize: CGFloat = 11
		static let pinBorderWidth: CGFloat = 1.5
		static let titleFontSize: CGFloat = 13
		static let noteFontSize: CGFloat = 12
		static let footnoteFontSize: CGFloat = 10
		static let previewWidth: CGFloat = 520
		static let previewHeight: CGFloat = 520
		static let maximumPreviewScale: CGFloat = 2
		static let previewBackgroundOpacity: Double = 0.08
		static let notesWidth: CGFloat = 320

		/// Room kept around the selected view's parent so the spacing lines have context.
		static let cropMargin: CGFloat = 16
	}

	enum ProofViewer {
		static let windowMinWidth: CGFloat = 560
		static let windowMinHeight: CGFloat = 600
		static let zoomStep: CGFloat = 1.25
		static let minimumZoom: CGFloat = 0.05
		static let maximumZoom: CGFloat = 8

		/// Above this zoom, pixels are drawn as blocks so a 1-pt misalignment stays visible instead of being smoothed away.
		static let pixelatedZoom: CGFloat = 2

		static let controlBarHeight: CGFloat = 40
		static let barDividerHeight: CGFloat = 18
		static let zoomTextWidth: CGFloat = 52
		static let playButtonWidth: CGFloat = 18
		static let stripHeight: CGFloat = 88
		static let thumbnailWidth: CGFloat = 40
		static let thumbnailHeight: CGFloat = 72
		static let thumbnailCornerRadius: CGFloat = 4
		static let selectionBorderWidth: CGFloat = 2
		static let videoTileOpacity: Double = 0.08
		static let playbackRates: [Float] = [0.25, 0.5, 1, 1.5, 2]
		static let seekTimescale: Int32 = 600
		static let timeUpdateSeconds: Double = 0.1
		static let endTolerance: Double = 0.05
		static let minimumSliderRange: Double = 0.01
		static let magnificationTolerance: CGFloat = 0.001
	}

	enum SimulatorControl {
		static let resultLineLimit = 4
		static let contentMaxWidth: CGFloat = 1100
		static let cardMinWidth: CGFloat = 380
		static let cardCornerRadius: CGFloat = 12
		static let cardBorderOpacity: Double = 0.12
		static let headerIconSize: CGFloat = 26
		static let headerIconCornerRadius: CGFloat = 7
		static let headerIconOpacity: Double = 0.15
		static let deviceIconSize: CGFloat = 64
		static let deviceSymbolSize: CGFloat = 32
		static let deviceIconCornerRadius: CGFloat = 14
		static let stateDotSize: CGFloat = 7
		static let stateBadgeOpacity: Double = 0.14
		static let deeplinkListMaxHeight: CGFloat = 180
		static let deeplinkRecentLimit = 8
		static let deeplinkMatchDelayMilliseconds = 300
	}

	enum Build {
		static let logLineLimit = 200
		static let logHeight: CGFloat = 180
		static let resultLineLimit = 4
	}

	enum TestBatch {
		static let sheetWidth: CGFloat = 460
	}

	enum Demo {
		static let bannerTintOpacity: Double = 0.12
	}

	enum Measure {
		static let trackpadZoomRate: CGFloat = 0.01
		static let wheelZoomRate: CGFloat = 0.1
		/// The small end of the app's spacing scale, as raw values (D-123).
		static let spacingScale: [CGFloat] = [0, 1, 2, 4]

		/// Above the small end every spacing token (8, 12, 16, 24, 32) and every sum of them (20, 28…) is a multiple of 4.
		static let largeSpacingStep: CGFloat = 4

		/// A pixel this far from the text's background (largest channel difference) counts as ink.
		static let inkThreshold = 48

		static let windowMinWidth: CGFloat = 900
		static let windowMinHeight: CGFloat = 640
		static let canvasMinWidth: CGFloat = 420
		static let detailWidth: CGFloat = 380
		static let zoomSliderWidth: CGFloat = 120
		static let zoomLabelWidth: CGFloat = 44
		static let boxOpacity: Double = 0.45
		static let layerBoxOpacity: Double = 0.7
		static let boxLineWidth: CGFloat = 0.5
		static let selectedLineWidth: CGFloat = 2
		static let gapLineWidth: CGFloat = 1.5
		static let visibleLineWidth: CGFloat = 1.5
		static let visibleDash: [CGFloat] = [5, 3]
		static let hoveredLineWidth: CGFloat = 1.5
	}

	enum Advanced {
		static let pickerMaxWidth: CGFloat = 420
		static let ruleListWidth: CGFloat = 460
		static let macroListWidth: CGFloat = 340
		static let formWidth: CGFloat = 340
		static let historyHeight: CGFloat = 160
		static let variantPickerWidth: CGFloat = 150
		static let methodWidth: CGFloat = 48
		static let statusWidth: CGFloat = 40
		static let callListWidth: CGFloat = 360
		static let disabledRuleOpacity: Double = 0.6
	}

	enum Settings {
		static let width: CGFloat = 520
		static let minHeight: CGFloat = 300
	}

	enum Accessibility {
		static let window = "TestForge_Window"
		static let sidebar = "TestForge_Sidebar"
		static let sidebarRowPrefix = "TestForge_Sidebar_"
		static let connectionStatus = "TestForge_Toolbar_ConnectionStatus"
		static let reconnectButton = "TestForge_Toolbar_ReconnectButton"
		static let consoleToggleButton = "TestForge_Toolbar_ConsoleToggle"
		static let emptyState = "TestForge_EmptyState"
		static let getReady = "TestForge_GetReady"
		static let getReadyHeader = "TestForge_GetReady_Header"
		static let readinessRowPrefix = "TestForge_GetReady_Row_"
		static let fixButtonPrefix = "TestForge_GetReady_FixButton_"
		static let console = "TestForge_Console"
		static let consoleToolbar = "TestForge_Console_Toolbar"
		static let consoleFilter = "TestForge_Console_Filter"
		static let consoleSearch = "TestForge_Console_Search"
		static let consoleCopy = "TestForge_Console_CopyButton"
		static let consoleClear = "TestForge_Console_ClearButton"
		static let consoleLine = "TestForge_Console_Line"
		static let tests = "TestForge_Tests"
		static let testsHeader = "TestForge_Tests_Header"
		static let testsLoadButton = "TestForge_Tests_LoadButton"
		static let testsExportSessionButton = "TestForge_Tests_ExportSessionButton"
		static let testsFilterBar = "TestForge_Tests_FilterBar"
		static let testsFilter = "TestForge_Tests_Filter"
		static let testsList = "TestForge_Tests_List"
		static let testsRowPrefix = "TestForge_Tests_Row_"
		static let testsDetail = "TestForge_Tests_Detail"
		static let testsReplayButton = "TestForge_Tests_ReplayButton"
		static let testsRunClaudeButton = "TestForge_Tests_RunClaudeButton"
		static let testsInspector = "TestForge_Tests_Inspector"
		static let testsInspectorToggle = "TestForge_Tests_InspectorToggle"
		static let testsStopButton = "TestForge_Tests_StopButton"
		static let testsShowClaudeSessionButton = "TestForge_Tests_ShowClaudeSession"
		static let testsRunModelPrefix = "TestForge_Tests_RunModel_"
		static let testsStepRowPrefix = "TestForge_Tests_Step_"
		static let verdictBadge = "TestForge_Tests_VerdictBadge"
		static let loadSheet = "TestForge_Tests_LoadSheet"
		static let loadSheetField = "TestForge_Tests_LoadSheet_Source"
		static let loadSheetConfirm = "TestForge_Tests_LoadSheet_LoadButton"
		static let loadSheetCancel = "TestForge_Tests_LoadSheet_CancelButton"
		static let scan = "TestForge_Scan"
		static let scanIdle = "TestForge_Scan_Idle"
		static let scanHeader = "TestForge_Scan_Header"
		static let scanStartButton = "TestForge_Scan_StartButton"
		static let scanStopButton = "TestForge_Scan_StopButton"
		static let scanShowSimulatorButton = "TestForge_Scan_ShowSimulatorButton"
		static let scanRevealButton = "TestForge_Scan_RevealButton"
		static let scanCurrentScreen = "TestForge_Scan_CurrentScreen"
		static let scanMarkBar = "TestForge_Scan_MarkBar"
		static let scanNameField = "TestForge_Scan_NameField"
		static let scanMarkButton = "TestForge_Scan_MarkButton"
		static let scanSkipButton = "TestForge_Scan_SkipButton"
		static let scanScreenList = "TestForge_Scan_ScreenList"
		static let scanScreenRowPrefix = "TestForge_Scan_Screen_"
		static let results = "TestForge_Results"
		static let resultsRunList = "TestForge_Results_RunList"
		static let resultsRunRowPrefix = "TestForge_Results_Run_"
		static let resultsRunDetail = "TestForge_Results_RunDetail"
		static let resultsRunHeader = "TestForge_Results_RunHeader"
		static let resultsTilePrefix = "TestForge_Results_Tile_"
		static let resultsRerunFailedButton = "TestForge_Results_RerunFailedButton"
		static let resultsExportButton = "TestForge_Results_ExportButton"
		static let resultsCopyButton = "TestForge_Results_CopyButton"
		static let resultsCaseList = "TestForge_Results_CaseList"
		static let resultsCaseRowPrefix = "TestForge_Results_Case_"
		static let resultsInspector = "TestForge_Results_Inspector"
		static let resultsReviewBar = "TestForge_Results_ReviewBar"
		static let resultsAcceptButton = "TestForge_Results_AcceptButton"
		static let resultsOverrideButton = "TestForge_Results_OverrideButton"
		static let resultsNeedsRerunButton = "TestForge_Results_NeedsRerunButton"
		static let resultsScreenshots = "TestForge_Results_Screenshots"
		static let resultsNote = "TestForge_Results_Note"
		static let overrideSheet = "TestForge_Results_OverrideSheet"
		static let overrideVerdictPicker = "TestForge_Results_OverrideSheet_Verdict"
		static let overrideReasonField = "TestForge_Results_OverrideSheet_Reason"
		static let overrideSaveButton = "TestForge_Results_OverrideSheet_SaveButton"
		static let overrideCancelButton = "TestForge_Results_OverrideSheet_CancelButton"
		static let reports = "TestForge_Reports"
		static let reportsBranchList = "TestForge_Reports_BranchList"
		static let reportsBranchRowPrefix = "TestForge_Reports_Branch_"
		static let reportsPickerBar = "TestForge_Reports_PickerBar"
		static let reportsRunPicker = "TestForge_Reports_RunPicker"
		static let reportsComparePicker = "TestForge_Reports_ComparePicker"
		static let reportsComparison = "TestForge_Reports_Comparison"
		static let reportsComparisonRowPrefix = "TestForge_Reports_Compare_"
		static let reportsPreview = "TestForge_Reports_Preview"
		static let reportsExportButton = "TestForge_Reports_ExportButton"
		static let reportsCopyButton = "TestForge_Reports_CopyButton"
		static let reportsPublishButton = "TestForge_Reports_PublishButton"
		static let menuBar = "TestForge_MenuBar"
		static let menuBarLabel = "TestForge_MenuBar_Label"
		static let menuBarStatus = "TestForge_MenuBar_Status"
		static let menuBarStop = "TestForge_MenuBar_StopButton"
		static let menuBarContinue = "TestForge_MenuBar_ContinueButton"
		static let menuBarOpen = "TestForge_MenuBar_OpenButton"
		static let menuBarQuit = "TestForge_MenuBar_QuitButton"
		static let settingsMenuBarToggle = "TestForge_Settings_MenuBarToggle"
		static let settingsNotifyToggle = "TestForge_Settings_NotifyToggle"
		static let settings = "TestForge_Settings"
		static let settingsTabPrefix = "TestForge_Settings_Tab_"
		static let settingsProject = "TestForge_Settings_Project"
		static let settingsGeneral = "TestForge_Settings_General"
		static let settingsAppearance = "TestForge_Settings_Appearance"
		static let settingsOutlineToggle = "TestForge_Settings_OutlineToggle"
		static let settingsExplainLanguage = "TestForge_Settings_ExplainLanguage"
		static let simulatorToolbar = "TestForge_Toolbar_Simulator"
		static let measureButton = "TestForge_Toolbar_MeasureButton"
		static let outlineToggle = "TestForge_Toolbar_OutlineToggle"
		static let stepOutline = "TestForge_StepOutline"
		static let stepOutlineBadge = "TestForge_StepOutline_Badge"
		static let measure = "TestForge_Measure"
		static let measureRefreshButton = "TestForge_Measure_RefreshButton"
		static let measureCanvas = "TestForge_Measure_Canvas"
		static let measureElementPrefix = "TestForge_Measure_Element_"
		static let measureDetail = "TestForge_Measure_Detail"
		static let measureGlyphGaps = "TestForge_Measure_GlyphGaps"
		static let measureSnapshotButton = "TestForge_Measure_SnapshotButton"
		static let measureSnapshotSheet = "TestForge_MeasureSnapshot"
		static let measureSnapshotImage = "TestForge_MeasureSnapshot_Image"
		static let measureSnapshotPinPrefix = "TestForge_MeasureSnapshot_Pin_"
		static let measureSnapshotNotePrefix = "TestForge_MeasureSnapshot_Note_"
		static let measureSnapshotShowInFinder = "TestForge_Measure_Snapshot_ShowInFinder"
		static let measureSnapshotSave = "TestForge_MeasureSnapshot_Save"
		static let measureSnapshotCopy = "TestForge_MeasureSnapshot_Copy"
		static let measureSnapshotCancel = "TestForge_MeasureSnapshot_Cancel"
		static let measureZoomBar = "TestForge_Measure_ZoomBar"
		static let measureZoomInButton = "TestForge_Measure_ZoomInButton"
		static let measureZoomOutButton = "TestForge_Measure_ZoomOutButton"
		static let measureZoomFitButton = "TestForge_Measure_ZoomFitButton"
		static let measureZoomSlider = "TestForge_Measure_ZoomSlider"
		static let measureCopyButton = "TestForge_Measure_CopyButton"
		static let measureVisibleContainer = "TestForge_Measure_VisibleContainer"
		static let measureVisibleSection = "TestForge_Measure_VisibleSection"
		static let measureParentsSection = "TestForge_Measure_ParentsSection"
		static let measureComparisonSection = "TestForge_Measure_ComparisonSection"
		static let measureHoveredBox = "TestForge_Measure_HoveredBox"
		static let measureLayerBordersToggle = "TestForge_Measure_LayerBordersToggle"
		static let tutorialHelpButton = "TestForge_Tutorial_HelpButton"
		static let tutorialDemoItem = "TestForge_Tutorial_DemoItem"
		static let tutorialDemoStartButton = "TestForge_Tutorial_DemoStartButton"
		static let demoBanner = "TestForge_Demo_Banner"
		static let build = "TestForge_Build"
		static let buildStatus = "TestForge_Build_Status"
		static let buildTestForgeState = "TestForge_Build_TestForgeState"
		static let buildStartButton = "TestForge_Build_Start"
		static let buildConfirmButton = "TestForge_Build_Confirm"
		static let buildStopButton = "TestForge_Build_Stop"
		static let buildRefreshButton = "TestForge_Build_Refresh"
		static let buildLog = "TestForge_Build_Log"
		static let buildXcodeInfo = "TestForge_Build_XcodeInfo"
		static let buildOpenWorkspaceButton = "TestForge_Build_OpenWorkspace"
		static let buildInstallForTestingButton = "TestForge_Build_InstallForTesting"
		static let buildInstallConfirmButton = "TestForge_Build_InstallConfirm"
		static let buildLaunchSourcePicker = "TestForge_Build_LaunchSource"
		static let buildInstallLaunchButton = "TestForge_Build_InstallLaunch"
		static let buildPackageResetButton = "TestForge_Build_PackageReset"
		static let buildPackageResetConfirmButton = "TestForge_Build_PackageResetConfirm"
		static let buildRunnerStopButton = "TestForge_Build_RunnerStop"
		static let testBatchPill = "TestForge_TestBatch_Pill"
		static let testBatchStartItem = "TestForge_TestBatch_StartItem"
		static let testBatchEndItem = "TestForge_TestBatch_EndItem"
		static let testBatchRevealItem = "TestForge_TestBatch_RevealItem"
		static let testBatchChooseFolderItem = "TestForge_TestBatch_ChooseFolderItem"
		static let testBatchEndConfirmButton = "TestForge_TestBatch_EndConfirm"
		static let testBatchStartSheet = "TestForge_TestBatch_StartSheet"
		static let testBatchNameField = "TestForge_TestBatch_Name"
		static let testBatchStartButton = "TestForge_TestBatch_Start"
		static let testBatchCancelButton = "TestForge_TestBatch_Cancel"
		static let resultsVideos = "TestForge_Results_Videos"
		static let resultsShowInFinderButton = "TestForge_Results_ShowInFinder"
		static let scanModePicker = "TestForge_Scan_ModePicker"
		static let flowMap = "TestForge_FlowMap"
		static let flowMapHeader = "TestForge_FlowMap_Header"
		static let flowMapTree = "TestForge_FlowMap_Tree"
		static let flowMapNodePrefix = "TestForge_FlowMap_Node_"
		static let flowMapDetail = "TestForge_FlowMap_Detail"
		static let flowMapNameField = "TestForge_FlowMap_NameField"
		static let flowMapEdgePrefix = "TestForge_FlowMap_Edge_"
		static let flowMapEmpty = "TestForge_FlowMap_Empty"
		static let proofViewer = "TestForge_ProofViewer"
		static let proofViewerImage = "TestForge_ProofViewer_Image"
		static let proofViewerVideo = "TestForge_ProofViewer_Video"
		static let proofViewerPlayer = "TestForge_ProofViewer_Player"
		static let proofViewerZoomBar = "TestForge_ProofViewer_ZoomBar"
		static let proofViewerZoomIn = "TestForge_ProofViewer_ZoomIn"
		static let proofViewerZoomOut = "TestForge_ProofViewer_ZoomOut"
		static let proofViewerFit = "TestForge_ProofViewer_Fit"
		static let proofViewerActualSize = "TestForge_ProofViewer_ActualSize"
		static let proofViewerPlaybackBar = "TestForge_ProofViewer_PlaybackBar"
		static let proofViewerPlay = "TestForge_ProofViewer_Play"
		static let proofViewerStop = "TestForge_ProofViewer_Stop"
		static let proofViewerFrameBack = "TestForge_ProofViewer_FrameBack"
		static let proofViewerFrameForward = "TestForge_ProofViewer_FrameForward"
		static let proofViewerSpeed = "TestForge_ProofViewer_Speed"
		static let proofViewerScrubber = "TestForge_ProofViewer_Scrubber"
		static let proofViewerPrevious = "TestForge_ProofViewer_Previous"
		static let proofViewerNext = "TestForge_ProofViewer_Next"
		static let proofViewerStrip = "TestForge_ProofViewer_Strip"
		static let simulatorTestDeviceBadge = "TestForge_SimulatorControl_TestDeviceBadge"
		static let simulatorUseForTestsButton = "TestForge_SimulatorControl_UseForTests"
		static let simulatorUseTestForgeCloneButton = "TestForge_SimulatorControl_UseTestForgeClone"
		static let proofViewerThumbnailPrefix = "TestForge_ProofViewer_Thumb_"
		static let proofViewerOpenExternally = "TestForge_ProofViewer_OpenExternally"
		static let proofViewerShowInFinder = "TestForge_ProofViewer_ShowInFinder"
		static let reset = "TestForge_Reset"
		static let resetItemPrefix = "TestForge_Reset_Item_"
		static let resetStartButton = "TestForge_Reset_Start"
		static let resetConfirmButton = "TestForge_Reset_Confirm"
		static let resetRefreshButton = "TestForge_Reset_Refresh"
		static let resetLog = "TestForge_Reset_Log"
		static let simulatorControl = "TestForge_SimulatorControl"
		static let simulatorStatus = "TestForge_SimulatorControl_Status"
		static let simulatorDevicePicker = "TestForge_SimulatorControl_DevicePicker"
		static let simulatorBootButton = "TestForge_SimulatorControl_Boot"
		static let simulatorShutdownButton = "TestForge_SimulatorControl_Shutdown"
		static let simulatorShowButton = "TestForge_SimulatorControl_Show"
		static let simulatorRefreshButton = "TestForge_SimulatorControl_Refresh"
		static let simulatorBlendedToggle = "TestForge_SimulatorControl_BlendedToggle"
		static let simulatorBundleField = "TestForge_SimulatorControl_BundleField"
		static let simulatorRelaunchButton = "TestForge_SimulatorControl_Relaunch"
		static let simulatorKillButton = "TestForge_SimulatorControl_Kill"
		static let simulatorLinkField = "TestForge_SimulatorControl_LinkField"
		static let simulatorOpenLinkButton = "TestForge_SimulatorControl_OpenLink"
		static let deeplinks = "TestForge_Deeplinks"
		static let deeplinkRouteSearchField = "TestForge_Deeplinks_RouteSearch"
		static let deeplinkRoutePicker = "TestForge_Deeplinks_RoutePicker"
		static let deeplinkParamFieldPrefix = "TestForge_Deeplinks_Param_"
		static let deeplinkParamFields = "TestForge_Deeplinks_ParamFields"
		static let deeplinkLinkRow = "TestForge_Deeplinks_LinkRow"
		static let deeplinkSaveButton = "TestForge_Deeplinks_Save"
		static let deeplinkEntryList = "TestForge_Deeplinks_EntryList"
		static let deeplinkEntryRowPrefix = "TestForge_Deeplinks_Entry_"
		static let deeplinkEntryOpenSuffix = "_Open"
		static let deeplinkEntryRemoveSuffix = "_Remove"
		static let simulatorDefaultKeyField = "TestForge_SimulatorControl_DefaultKey"
		static let simulatorDefaultTypePicker = "TestForge_SimulatorControl_DefaultType"
		static let simulatorDefaultValueField = "TestForge_SimulatorControl_DefaultValue"
		static let simulatorDefaultReadButton = "TestForge_SimulatorControl_DefaultRead"
		static let simulatorDefaultWriteButton = "TestForge_SimulatorControl_DefaultWrite"
		static let simulatorDefaultDeleteButton = "TestForge_SimulatorControl_DefaultDelete"
		static let simulatorResetPrivacyButton = "TestForge_SimulatorControl_ResetPrivacy"
		static let simulatorResetKeychainButton = "TestForge_SimulatorControl_ResetKeychain"
		static let simulatorEraseButton = "TestForge_SimulatorControl_Erase"
		static let simulatorEraseConfirmButton = "TestForge_SimulatorControl_EraseConfirm"
		static let simulatorStateBadge = "TestForge_SimulatorControl_StateBadge"
		static let simulatorCopyUDIDButton = "TestForge_SimulatorControl_CopyUDID"
		static let simulatorCardPrefix = "TestForge_SimulatorControl_Card_"
		static let simulatorCardHeaderSuffix = "_Header"
		static let demoNextButton = "TestForge_Demo_NextButton"
		static let demoStopButton = "TestForge_Demo_StopButton"
		static let tutorialMenuItemPrefix = "TestForge_Tutorial_MenuItem_"
		static let tutorialAutoShowToggle = "TestForge_Tutorial_AutoShowToggle"
		static let tutorialResetButton = "TestForge_Tutorial_ResetButton"
		static let tutorialReplayPrefix = "TestForge_Tutorial_Replay_"
		static let settingsTutorials = "TestForge_Settings_Tutorials"
		static let measureLayerBorderColor = "TestForge_Measure_LayerBorderColor"
		static let measureLayerPass = "TestForge_Measure_LayerPass"
		static let advanced = "TestForge_Advanced"
		static let advancedPanelPicker = "TestForge_Advanced_PanelPicker"
		static let fakeData = "TestForge_Advanced_FakeData"
		static let fakeDataStatus = "TestForge_Advanced_FakeData_Status"
		static let fakeDataMasterSwitch = "TestForge_Advanced_FakeData_MasterSwitch"
		static let fakeDataNetworkLensButton = "TestForge_Advanced_FakeData_NetworkLensButton"
		static let fakeDataRuleList = "TestForge_Advanced_FakeData_RuleList"
		static let fakeDataRulePrefix = "TestForge_Advanced_FakeData_Rule_"
		static let fakeDataRuleTogglePrefix = "TestForge_Advanced_FakeData_RuleToggle_"
		static let fakeDataVariantPickerPrefix = "TestForge_Advanced_FakeData_VariantPicker_"
		static let fakeDataVariantDetail = "TestForge_Advanced_FakeData_VariantDetail"
		static let fakeDataCallList = "TestForge_Advanced_FakeData_CallList"
		static let fakeDataCallPrefix = "TestForge_Advanced_FakeData_Call_"
		static let fakeDataCallBody = "TestForge_Advanced_FakeData_CallBody"
		static let recordedSteps = "TestForge_Advanced_RecordedSteps"
		static let recordedStepsSearch = "TestForge_Advanced_RecordedSteps_Search"
		static let recordedStepsReloadButton = "TestForge_Advanced_RecordedSteps_ReloadButton"
		static let recordedStepsLint = "TestForge_Advanced_RecordedSteps_Lint"
		static let recordedStepsList = "TestForge_Advanced_RecordedSteps_List"
		static let recordedStepsRowPrefix = "TestForge_Advanced_RecordedSteps_Row_"
		static let recordedStepsDetail = "TestForge_Advanced_RecordedSteps_Detail"
		static let recordedStepsReplayButton = "TestForge_Advanced_RecordedSteps_ReplayButton"
		static let phoneRemote = "TestForge_Advanced_PhoneRemote"
		static let phoneRemoteHost = "TestForge_Advanced_PhoneRemote_Host"
		static let phoneRemoteKindPicker = "TestForge_Advanced_PhoneRemote_KindPicker"
		static let phoneRemoteFieldPrefix = "TestForge_Advanced_PhoneRemote_Field_"
		static let phoneRemoteSendButton = "TestForge_Advanced_PhoneRemote_SendButton"
		static let phoneRemoteResult = "TestForge_Advanced_PhoneRemote_Result"
		static let phoneRemoteHistory = "TestForge_Advanced_PhoneRemote_History"
		static let phoneRemoteHistoryRowPrefix = "TestForge_Advanced_PhoneRemote_History_"
	}
}
