import CoreGraphics

/// D-162 run bundles; kept apart so the main constants enum stays under the type-length limit.
extension TestForgeConstants.Results {
	static let bundleSheetWidth: CGFloat = 560
	static let bundleMockListMaxHeight: CGFloat = 220
}

extension TestForgeConstants.Accessibility {
	static let resultsExportBundleButton = "TestForge_Results_ExportBundleButton"
	static let resultsImportBundleButton = "TestForge_Results_ImportBundleButton"
	static let resultsBundleSheet = "TestForge_Results_BundleSheet"
	static let resultsBundleImportButton = "TestForge_Results_BundleImportButton"
	static let resultsBundleReplayButton = "TestForge_Results_BundleReplayButton"
	static let resultsBundleMockList = "TestForge_Results_BundleMockList"
	static let resultsBundleArmPrefix = "TestForge_Results_BundleArm_"
}
