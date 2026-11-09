import Foundation

/// The simulator tests run on (D-120): the "TestForge · " clone unless the person chose another with "Use for tests".
struct TestDevice: Decodable, Equatable {
	let udid: String
	let name: String
	let runtime: String
	let isBooted: Bool
	let isChosen: Bool
}

private struct TestDeviceResponse: Decodable {
	let device: TestDevice?
}

protocol TestDeviceActing: Sendable {
	func current() async throws -> TestDevice?

	/// `nil` goes back to the "TestForge · " clone. The server refuses while a test runs and restarts the runner on the new device.
	func use(udid: String?) async throws -> TestDevice?

	/// D-197: iPhones paired with this Mac; `isFresh` skips the server's 15 s cache.
	func physicalDevices(isFresh: Bool) async throws -> PhysicalDeviceList
}

struct TestDeviceService: TestDeviceActing {
	let client: DashboardClient

	func current() async throws -> TestDevice? {
		let data = try await client.get(path: "api/test-device")
		return try JSONDecoder().decode(TestDeviceResponse.self, from: data).device
	}

	func use(udid: String?) async throws -> TestDevice? {
		let value: JSONValue = udid.map { .string($0) } ?? .null
		let data = try await client.post(path: "api/test-device", json: ["udid": value])
		return try JSONDecoder().decode(TestDeviceResponse.self, from: data).device
	}

	func physicalDevices(isFresh: Bool) async throws -> PhysicalDeviceList {
		let query = isFresh ? [URLQueryItem(name: "fresh", value: "1")] : []
		let data = try await client.get(path: "api/devices/physical", queryItems: query)
		return try JSONDecoder().decode(PhysicalDeviceList.self, from: data)
	}
}
