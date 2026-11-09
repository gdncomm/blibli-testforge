import CoreGraphics
import Foundation

/// D-195: the shared loading style and Tests › What this case feeds the app.
extension TestForgeConstants.Accessibility {
	static let loadingState = "TestForge_LoadingState"
	static let testsInputsPanel = "TestForge_Tests_InputsPanel"
	static let testsInputsDeeplinkPrefix = "TestForge_Tests_InputsDeeplink_"
	static let testsInputsMockPrefix = "TestForge_Tests_InputsMock_"
	static let testsInputsCopyPrefix = "TestForge_Tests_InputsCopy_"
	static let testsInputsDownloadPrefix = "TestForge_Tests_InputsDownload_"
	static let testsInputsDownloadAll = "TestForge_Tests_InputsDownloadAll"
}

extension TestForgeConstants.Tests {
	static let inputsBodyMaxHeight: CGFloat = 240
}

extension TestForgeConstants {
	enum Loading {
		/// Below this, the elapsed time is noise; past it, it tells a person the work hasn't stalled.
		static let showElapsedAfter: TimeInterval = 4
		static let tick: TimeInterval = 1
	}
}

/// D-196: Tests › Verify my changes.
extension TestForgeConstants.Accessibility {
	static let testsVerifyButton = "TestForge_Tests_VerifyButton"
	static let verifySheet = "TestForge_Verify_Sheet"
	static let verifyBase = "TestForge_Verify_Base"
	static let verifyIncludeLocal = "TestForge_Verify_IncludeLocal"
	static let verifyList = "TestForge_Verify_List"
	static let verifyCaseRowPrefix = "TestForge_Verify_Case_"
	static let verifyUncovered = "TestForge_Verify_Uncovered"
	static let verifyCheck = "TestForge_Verify_Check"
	static let verifyReplay = "TestForge_Verify_Replay"
	static let verifyCancel = "TestForge_Verify_Cancel"
}

extension TestForgeConstants.Tests {
	static let verifyListHeight: CGFloat = 220
}

/// D-197: Simulator › Real devices.
extension TestForgeConstants.Accessibility {
	static let physicalDevices = "TestForge_PhysicalDevices"
	static let physicalDevicesRefresh = "TestForge_PhysicalDevices_Refresh"
	static let physicalDevicePicker = "TestForge_PhysicalDevices_Picker"
	static let physicalDeviceRowPrefix = "TestForge_PhysicalDevices_Row_"
	static let physicalDeviceBlockers = "TestForge_PhysicalDevices_Blockers"
	static let physicalDeviceUseButton = "TestForge_PhysicalDevices_Use"
}
