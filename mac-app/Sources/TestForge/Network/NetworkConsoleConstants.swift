import CoreGraphics
import Foundation

enum NetworkConsoleConstants {
	enum Refresh {
		static let tickInterval: Duration = .seconds(2)
		/// Rules come back with every body (about 1 MB live), so they refresh every third tick; any change refreshes at once.
		static let slowTickEvery = 3

		static let callLimit = 200
	}

	enum Traffic {
		static let listWidth: CGFloat = 440
		static let methodWidth: CGFloat = 52
		static let statusWidth: CGFloat = 40
		static let durationWidth: CGFloat = 64
		static let searchFieldWidth: CGFloat = 220
	}

	enum Rules {
		static let listWidth: CGFloat = 520
		static let variantPickerWidth: CGFloat = 170
		static let disabledRuleOpacity: Double = 0.55
	}

	enum Editor {
		static let sheetWidth: CGFloat = 720
		static let sheetHeight: CGFloat = 620
		static let numberFieldWidth: CGFloat = 80
		static let timeShiftListHeight: CGFloat = 140
		static let bodyMinHeight: CGFloat = 240
	}

	enum Scenarios {
		static let nameFieldWidth: CGFloat = 220
		static let menuWidth: CGFloat = 240
	}

	enum Trackers {
		static let listWidth: CGFloat = 520
		static let idsFieldMinWidth: CGFloat = 260
		static let countWidth: CGFloat = 120
		static let payloadMaxHeight: CGFloat = 320
		static let reportFileName = "trackers-validation.md"
	}

	enum Breakpoints {
		static let listWidth: CGFloat = 460
		static let barDividerHeight: CGFloat = 18
	}

	enum Surface {
		static let stripOpacity: Double = 0.5
		static let warningOpacity: Double = 0.08
	}

	enum Badge {
		static let horizontalPadding: CGFloat = 6
		static let verticalPadding: CGFloat = 2
		static let backgroundOpacity: Double = 0.15
	}

	enum Accessibility {
		static let page = "TestForge_Network"
		static let healthStrip = "TestForge_Network_Health"
		static let mockingToggle = "TestForge_Network_MockingToggle"
		static let guardrailsBanner = "TestForge_Network_Guardrails"
		static let allOffButton = "TestForge_Network_AllOffButton"
		static let resetToPackButton = "TestForge_Network_ResetToPackButton"
		static let tabPicker = "TestForge_Network_TabPicker"
		static let traffic = "TestForge_Network_Traffic"
		static let searchField = "TestForge_Network_SearchField"
		static let mockedOnlyToggle = "TestForge_Network_MockedOnlyToggle"
		static let callRowPrefix = "TestForge_Network_CallRow_"
		static let callDetail = "TestForge_Network_CallDetail"
		static let mockCallButton = "TestForge_Network_MockCallButton"
		static let copyCurlButton = "TestForge_Network_CopyCurlButton"
		static let rules = "TestForge_Network_Rules"
		static let ruleRowPrefix = "TestForge_Network_RuleRow_"
		static let ruleTogglePrefix = "TestForge_Network_RuleToggle_"
		static let variantPickerPrefix = "TestForge_Network_VariantPicker_"
		static let variantPreview = "TestForge_Network_VariantPreview"
		static let editVariantButton = "TestForge_Network_EditVariantButton"
		static let scenariosBar = "TestForge_Network_Scenarios"
		static let scenarioNameField = "TestForge_Network_ScenarioNameField"
		static let saveScenarioButton = "TestForge_Network_SaveScenarioButton"
		static let applyScenarioMenu = "TestForge_Network_ApplyScenarioMenu"
		static let deleteScenarioMenu = "TestForge_Network_DeleteScenarioMenu"
		static let editorSheet = "TestForge_Network_Editor"
		static let editorNameField = "TestForge_Network_Editor_NameField"
		static let editorKindPicker = "TestForge_Network_Editor_KindPicker"
		static let editorStatusField = "TestForge_Network_Editor_StatusField"
		static let editorDelayField = "TestForge_Network_Editor_DelayField"
		static let editorFailurePicker = "TestForge_Network_Editor_FailurePicker"
		static let editorBody = "TestForge_Network_Editor_Body"
		static let editorSaveButton = "TestForge_Network_Editor_SaveButton"
		static let editorSaveCopyButton = "TestForge_Network_Editor_SaveCopyButton"
		static let editorDeleteButton = "TestForge_Network_Editor_DeleteButton"
		static let editorCancelButton = "TestForge_Network_Editor_CancelButton"
		static let timeShift = "TestForge_Network_Editor_TimeShift"
		static let timeShiftSecondsField = "TestForge_Network_Editor_TimeShiftSeconds"
		static let timeShiftButton = "TestForge_Network_Editor_TimeShiftButton"
		static let placeholder = "TestForge_Network_Placeholder"
		static let trackers = "TestForge_Network_Trackers"
		static let trackerIdsField = "TestForge_Network_Trackers_IdsField"
		static let trackerAllSessionsToggle = "TestForge_Network_Trackers_AllSessionsToggle"
		static let trackerCheckButton = "TestForge_Network_Trackers_CheckButton"
		static let trackerContractButton = "TestForge_Network_Trackers_ContractButton"
		static let trackerClearContractButton = "TestForge_Network_Trackers_ClearContractButton"
		static let trackerCopyReportButton = "TestForge_Network_Trackers_CopyReportButton"
		static let trackerSaveReportButton = "TestForge_Network_Trackers_SaveReportButton"
		static let trackerRowPrefix = "TestForge_Network_TrackerRow_"
		static let trackerFires = "TestForge_Network_Trackers_Fires"
		static let trackerFirePrefix = "TestForge_Network_TrackerFire_"
		static let breakpoints = "TestForge_Network_Breakpoints"
		static let breakpointEndpointField = "TestForge_Network_Breakpoints_EndpointField"
		static let breakpointStagePicker = "TestForge_Network_Breakpoints_StagePicker"
		static let breakpointOnceToggle = "TestForge_Network_Breakpoints_OnceToggle"
		static let breakpointAddButton = "TestForge_Network_Breakpoints_AddButton"
		static let breakpointRowPrefix = "TestForge_Network_BreakpointRow_"
		static let breakpointRemovePrefix = "TestForge_Network_BreakpointRemove_"
		static let bubbleMenu = "TestForge_Network_Breakpoints_BubbleMenu"
		static let heldRowPrefix = "TestForge_Network_HeldRow_"
		static let heldContinueAllButton = "TestForge_Network_Breakpoints_ContinueAllButton"
		static let heldEditor = "TestForge_Network_HeldEditor"
		static let heldStatusField = "TestForge_Network_HeldEditor_StatusField"
		static let heldBodyEditor = "TestForge_Network_HeldEditor_Body"
		static let heldFailurePicker = "TestForge_Network_HeldEditor_FailurePicker"
		static let heldFailButton = "TestForge_Network_HeldEditor_FailButton"
		static let heldContinueButton = "TestForge_Network_HeldEditor_ContinueButton"
		static let replayCallButton = "TestForge_Network_ReplayCallButton"
		static let holdCallButton = "TestForge_Network_HoldCallButton"
	}
}
