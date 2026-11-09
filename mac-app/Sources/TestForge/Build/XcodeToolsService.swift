import AppKit
import Foundation

/// Folders the Build screen may delete; nothing outside them is ever removed.
enum CleanTarget: String, CaseIterable, Identifiable {
	case testForgeBuildOutput
	case xcodeDerivedData
	case swiftPackageCache
	case swiftPackageData

	var id: String { rawValue }

	var url: URL {
		let home = FileManager.default.homeDirectoryForCurrentUser
		switch self {
			case .testForgeBuildOutput:
				return home.appendingPathComponent(".test-forge/derived", isDirectory: true)
			case .xcodeDerivedData:
				return home.appendingPathComponent("Library/Developer/Xcode/DerivedData", isDirectory: true)
			case .swiftPackageCache:
				return home.appendingPathComponent("Library/Caches/org.swift.swiftpm", isDirectory: true)
			case .swiftPackageData:
				return home.appendingPathComponent("Library/org.swift.swiftpm", isDirectory: true)
		}
	}
}

enum XcodeToolsError: LocalizedError {
	case xcodeStillOpen
	case cleanFailed(path: String, message: String)

	var errorDescription: String? {
		switch self {
			case .xcodeStillOpen:
				return String(localized: "Xcode is still open. Answer its save dialogs or quit it, then try again.")
			case .cleanFailed(let path, let message):
				return String(localized: "Couldn't delete \(path): \(message)")
		}
	}
}

struct XcodeInfo: Equatable {
	let version: String
	let developerDirectory: String
}

protocol XcodeToolsActing {
	func info() async throws -> XcodeInfo

	/// Size in bytes, or nil when the folder doesn't exist.
	func size(of target: CleanTarget) async -> Int64?

	func clean(_ target: CleanTarget) async throws -> CommandOutput
	func open(path: String) async throws -> CommandOutput

	/// Quit Xcode, delete DerivedData and both Swift package caches, then open the workspace (or Xcode) again.
	func resetSwiftPackages(reopening workspacePath: String?) async throws
}

/// Plain Xcode command-line tools; Xcode itself never needs to be open. Each command is echoed in the console.
struct XcodeToolsService: XcodeToolsActing {
	private static let xcodeBundleId = "com.apple.dt.Xcode"
	private static let quitWaitSeconds = 60

	let runner: CommandRunning

	func info() async throws -> XcodeInfo {
		let version = try await runner.run(CommandRequest(executable: "/usr/bin/xcodebuild", arguments: ["-version"]))
		let directory = try await runner.run(CommandRequest(executable: "/usr/bin/xcode-select", arguments: ["-p"]))
		let versionLine = version.summary.components(separatedBy: .newlines).joined(separator: " · ")
		return XcodeInfo(
			version: version.isSuccess ? versionLine : version.summary,
			developerDirectory: directory.summary
		)
	}

	func size(of target: CleanTarget) async -> Int64? {
		guard FileManager.default.fileExists(atPath: target.url.path) else {
			return nil
		}
		let request = CommandRequest(executable: "/usr/bin/du", arguments: ["-sk", target.url.path])
		guard let output = try? await runner.run(request),
			let kilobytes = output.output.split(separator: "\t").first.flatMap({ Int64($0) })
		else {
			return nil
		}
		return kilobytes * 1024
	}

	func clean(_ target: CleanTarget) async throws -> CommandOutput {
		try await runner.run(CommandRequest(executable: "/bin/rm", arguments: ["-rf", target.url.path]))
	}


	func open(path: String) async throws -> CommandOutput {
		try await runner.run(CommandRequest(executable: "/usr/bin/open", arguments: [path]))
	}

	func resetSwiftPackages(reopening workspacePath: String?) async throws {
		try await quitXcode()
		let targets: [CleanTarget] = [.xcodeDerivedData, .swiftPackageCache, .swiftPackageData]
		for target in targets {
			let output = try await clean(target)
			guard output.isSuccess else {
				throw XcodeToolsError.cleanFailed(path: target.url.path, message: output.summary)
			}
		}
		let openArguments = workspacePath.map { [$0] } ?? ["-a", "Xcode"]
		_ = try await runner.run(CommandRequest(executable: "/usr/bin/open", arguments: openArguments))
	}

	/// Like ⌘Q, so Xcode closes the project and can still ask to save; waits up to a minute for it to exit.
	private func quitXcode() async throws {
		let running = NSRunningApplication.runningApplications(withBundleIdentifier: Self.xcodeBundleId)
		guard !running.isEmpty else {
			return
		}
		running.forEach { $0.terminate() }
		for _ in 0..<Self.quitWaitSeconds {
			if running.allSatisfy(\.isTerminated) {
				return
			}
			try await Task.sleep(for: .seconds(1))
		}
		throw XcodeToolsError.xcodeStillOpen
	}
}
