import Foundation

protocol ResetActing {
	func plan() async throws -> ResetPlanSnapshot

	/// Starts deleting the chosen items; the server refuses while a run, scan or build is going.
	func start(itemIds: [String]) async throws -> String

	func followLog(jobId: String, onLine: @escaping @MainActor (String) -> Void) async throws
}

/// The dashboard's reset pipeline (`/api/reset*`); job output streams like a build's.
struct ResetServerService: ResetActing {
	let client: DashboardClient
	let jobStream: TestForgeBuildActing

	func plan() async throws -> ResetPlanSnapshot {
		let data = try await client.get(path: "api/reset/plan")
		return try JSONDecoder().decode(ResetPlanSnapshot.self, from: data)
	}

	func start(itemIds: [String]) async throws -> String {
		let values = itemIds.map { JSONValue.string($0) }
		let ids = JSONValue.array(values)
		let data = try await client.post(path: "api/reset", json: ["ids": ids])
		let start = try JSONDecoder().decode(ResetJobStart.self, from: data)
		return start.jobId
	}

	func followLog(jobId: String, onLine: @escaping @MainActor (String) -> Void) async throws {
		try await jobStream.followLog(jobId: jobId, onLine: onLine)
	}
}
