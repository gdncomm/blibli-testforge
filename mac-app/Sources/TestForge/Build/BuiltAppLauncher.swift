import Foundation

/// Which build "Install & launch last build" takes its app from.
enum LaunchSource: String, CaseIterable, Identifiable {
	case qaBuild
	case xcodeBuild

	var id: String { rawValue }
}

struct BuiltApp: Equatable {
	let path: String
	let bundleId: String
	let builtAt: Date
}

enum BuiltAppError: LocalizedError {
	case noApp(source: LaunchSource)
	case noSimulator

	var errorDescription: String? {
		switch self {
			case .noApp(.qaBuild):
				return String(localized: "No QA build yet. Use Build for testing first.")
			case .noApp(.xcodeBuild):
				return String(localized: "No simulator build in Xcode's DerivedData. Build once in Xcode (⌘B).")
			case .noSimulator:
				return String(localized: "No simulator to install on. Pick one on the Simulator screen.")
		}
	}
}

protocol BuiltAppLaunching {
	/// The newest simulator app (not a test runner) under these DerivedData folders.
	func latestApp(inDerivedData folders: [URL]) async -> BuiltApp?

	func installAndLaunch(_ app: BuiltApp, udid: String) async throws -> CommandOutput
}

/// Xcode's "Run Without Building" without Xcode: `simctl install` the built app, then `simctl launch` it.
struct BuiltAppLauncher: BuiltAppLaunching {
	private static let xcrun = "/usr/bin/xcrun"
	private static let simulatorProductsSuffix = "-iphonesimulator"
	private static let testRunnerSuffix = "-Runner.app"

	let runner: CommandRunning

	/// Every DerivedData folder Xcode made for this workspace (named `<workspace>-<hash>`).
	static func xcodeDerivedData(workspaceName: String) -> [URL] {
		let root = CleanTarget.xcodeDerivedData.url
		let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
		return names
			.filter { $0.hasPrefix("\(workspaceName)-") }
			.map { root.appendingPathComponent($0, isDirectory: true) }
	}

	func latestApp(inDerivedData folders: [URL]) async -> BuiltApp? {
		let apps = folders.flatMap(Self.apps(inDerivedData:))
		return apps.max { $0.builtAt < $1.builtAt }
	}

	func installAndLaunch(_ app: BuiltApp, udid: String) async throws -> CommandOutput {
		let installed = try await simctl(["install", udid, app.path])
		guard installed.isSuccess else {
			return installed
		}
		return try await simctl(["launch", "--terminate-running-process", udid, app.bundleId])
	}

	private func simctl(_ arguments: [String]) async throws -> CommandOutput {
		try await runner.run(CommandRequest(executable: Self.xcrun, arguments: ["simctl"] + arguments))
	}

	private static func apps(inDerivedData folder: URL) -> [BuiltApp] {
		let fileManager = FileManager.default
		let products = folder.appendingPathComponent("Build/Products", isDirectory: true)
		let configurations = (try? fileManager.contentsOfDirectory(atPath: products.path)) ?? []
		return configurations
			.filter { $0.hasSuffix(simulatorProductsSuffix) }
			.flatMap { configuration -> [BuiltApp] in
				let configurationURL = products.appendingPathComponent(configuration, isDirectory: true)
				let names = (try? fileManager.contentsOfDirectory(atPath: configurationURL.path)) ?? []
				return names
					.filter { $0.hasSuffix(".app") && !$0.hasSuffix(testRunnerSuffix) }
					.compactMap { builtApp(at: configurationURL.appendingPathComponent($0, isDirectory: true)) }
			}
	}

	/// Only real apps: a test runner or an extension has another package type.
	private static func builtApp(at url: URL) -> BuiltApp? {
		let infoURL = url.appendingPathComponent("Info.plist")
		guard let info = NSDictionary(contentsOf: infoURL),
			info["CFBundlePackageType"] as? String == "APPL",
			let bundleId = info["CFBundleIdentifier"] as? String
		else {
			return nil
		}
		let attributes = try? FileManager.default.attributesOfItem(atPath: infoURL.path)
		let builtAt = attributes?[.modificationDate] as? Date ?? .distantPast
		return BuiltApp(path: url.path, bundleId: bundleId, builtAt: builtAt)
	}
}
