import Foundation

enum SimulatorWindowScreenError: LocalizedError {
	case unknownDevice(windowTitle: String)

	var errorDescription: String? {
		switch self {
			case .unknownDevice(let windowTitle):
				return String(localized: "No booted simulator matches the Simulator window “\(windowTitle)”.")
		}
	}
}

/// The device the Simulator window shows, read from the window and CoreSimulator — any simulator, any app, no test runner (D-120).
protocol SimulatorScreenReading: Sendable {
	func windowDevice() throws -> DeviceScreen
	func screenshot(udid: String) async throws -> Data
}

struct WindowSimulatorScreen: SimulatorScreenReading {
	let locator: SimulatorLocating

	/// Exact window title first: a "TestForge · " clone and its source can share a device name and runtime.
	func windowDevice() throws -> DeviceScreen {
		let title = try locator.deviceWindowTitle()
		let booted = try CoreSimulatorDevices.all().filter(\.isBooted)
		let exact = booted.first { $0.windowTitle == title }
		let named = booted.filter { title.hasPrefix($0.name) }
		guard let device = exact ?? (named.count == 1 ? named.first : nil) ?? (booted.count == 1 ? booted.first : nil) else {
			throw SimulatorWindowScreenError.unknownDevice(windowTitle: title)
		}
		return DeviceScreen(deviceName: device.name, size: device.screenPoints, udid: device.udid)
	}

	func screenshot(udid: String) async throws -> Data {
		try await SimctlScreenshot.png(udid: udid)
	}
}

/// `simctl io <udid> screenshot` as PNG data — always a named device, never `booted`.
enum SimctlScreenshot {
	static func png(udid: String) async throws -> Data {
		let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("test-forge-screen-\(UUID().uuidString).png")
		defer {
			try? FileManager.default.removeItem(at: fileURL)
		}
		let process = Process()
		process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
		process.arguments = ["simctl", "io", udid, "screenshot", "--type=png", fileURL.path]
		let errorPipe = Pipe()
		process.standardError = errorPipe
		process.standardOutput = Pipe()
		try process.run()
		await withCheckedContinuation { continuation in
			process.terminationHandler = { _ in
				continuation.resume()
			}
		}
		guard process.terminationStatus == 0,
			let data = try? Data(contentsOf: fileURL)
		else {
			let message = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
			throw LayerCaptureError.screenshotFailed(message.trimmingCharacters(in: .whitespacesAndNewlines))
		}
		return data
	}
}
