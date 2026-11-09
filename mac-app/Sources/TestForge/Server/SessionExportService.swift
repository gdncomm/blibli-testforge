import Foundation

/// D-173: the loaded document's cases with all their metadata, as one .zip the server writes.
protocol SessionExporting {
	func preview() async throws -> SessionExportPreview

	/// `includeMedia` copies each case's latest proof screenshots, videos and demo videos into the zip.
	func export(to fileURL: URL, includeMedia: Bool) async throws -> SessionExportOutcome
}

struct SessionExportSummary: Decodable, Equatable {
	let cases: Int
	let recorded: Int
	let editedLocally: Int
	let passed: Int
	let failed: Int
	let undecided: Int
	let notRun: Int

	private enum CodingKeys: String, CodingKey {
		case cases
		case recorded
		case editedLocally
		case passed
		case failed
		case undecided
		case notRun
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		cases = (try? container.decodeIfPresent(Int.self, forKey: .cases)) ?? 0
		recorded = (try? container.decodeIfPresent(Int.self, forKey: .recorded)) ?? 0
		editedLocally = (try? container.decodeIfPresent(Int.self, forKey: .editedLocally)) ?? 0
		passed = (try? container.decodeIfPresent(Int.self, forKey: .passed)) ?? 0
		failed = (try? container.decodeIfPresent(Int.self, forKey: .failed)) ?? 0
		undecided = (try? container.decodeIfPresent(Int.self, forKey: .undecided)) ?? 0
		notRun = (try? container.decodeIfPresent(Int.self, forKey: .notRun)) ?? 0
	}
}

struct SessionExportPreview: Decodable, Equatable {
	let fileName: String
	let summary: SessionExportSummary
	let runs: Int
	let mediaFiles: Int
	let mediaBytes: Int64

	private enum CodingKeys: String, CodingKey {
		case fileName
		case summary
		case runs
		case mediaFiles
		case mediaBytes
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		fileName = (try? container.decodeIfPresent(String.self, forKey: .fileName)) ?? "test-forge-session.zip"
		summary = try container.decode(SessionExportSummary.self, forKey: .summary)
		runs = (try? container.decodeIfPresent(Int.self, forKey: .runs)) ?? 0
		mediaFiles = (try? container.decodeIfPresent(Int.self, forKey: .mediaFiles)) ?? 0
		mediaBytes = (try? container.decodeIfPresent(Int64.self, forKey: .mediaBytes)) ?? 0
	}
}

struct SessionExportOutcome: Decodable, Equatable {
	let path: String
	let bytes: Int64
	let cases: Int
	let mediaFiles: Int
	let missingMedia: [String]

	private enum CodingKeys: String, CodingKey {
		case path
		case bytes
		case cases
		case mediaFiles
		case missingMedia
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		path = try container.decode(String.self, forKey: .path)
		bytes = (try? container.decodeIfPresent(Int64.self, forKey: .bytes)) ?? 0
		cases = (try? container.decodeIfPresent(Int.self, forKey: .cases)) ?? 0
		mediaFiles = (try? container.decodeIfPresent(Int.self, forKey: .mediaFiles)) ?? 0
		missingMedia = (try? container.decodeIfPresent([String].self, forKey: .missingMedia)) ?? []
	}
}

struct SessionExportService: SessionExporting {
	private let client: DashboardClient
	private let decoder: JSONDecoder

	init(client: DashboardClient, decoder: JSONDecoder = JSONDecoder()) {
		self.client = client
		self.decoder = decoder
	}

	func preview() async throws -> SessionExportPreview {
		let data = try await client.get(path: "api/session/export")
		return try decoder.decode(SessionExportPreview.self, from: data)
	}

	func export(to fileURL: URL, includeMedia: Bool) async throws -> SessionExportOutcome {
		let body: [String: JSONValue] = ["path": .string(fileURL.path), "includeMedia": .bool(includeMedia)]
		let data = try await client.post(path: "api/session/export", json: body, timeout: SessionExportConstants.timeout)
		return try decoder.decode(SessionExportOutcome.self, from: data)
	}
}
