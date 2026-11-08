import Foundation

/// One row of `/api/reset/plan`: something a test cycle leaves behind, with its size.
struct ResetPlanItem: Decodable, Equatable, Identifiable {
	let id: String
	let title: String
	let detail: String
	let sizeMb: Int
	let isDefault: Bool
	let stopsRunner: Bool

	/// Shown only (your repo); the server never deletes it and refuses its id.
	let isInfo: Bool

	private enum CodingKeys: String, CodingKey {
		case id
		case title
		case detail
		case sizeMb
		case isDefault
		case stopsRunner
		case isInfo
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = try container.decode(String.self, forKey: .id)
		title = (try? container.decodeIfPresent(String.self, forKey: .title)) ?? id
		detail = (try? container.decodeIfPresent(String.self, forKey: .detail)) ?? ""
		sizeMb = (try? container.decodeIfPresent(Int.self, forKey: .sizeMb)) ?? 0
		isDefault = (try? container.decodeIfPresent(Bool.self, forKey: .isDefault)) ?? false
		stopsRunner = (try? container.decodeIfPresent(Bool.self, forKey: .stopsRunner)) ?? false
		isInfo = (try? container.decodeIfPresent(Bool.self, forKey: .isInfo)) ?? false
	}
}

struct ResetPlanSnapshot: Decodable, Equatable {
	let items: [ResetPlanItem]
	let isRunning: Bool
	let jobId: String?

	private enum CodingKeys: String, CodingKey {
		case items
		case isRunning
		case jobId
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		items = (try? container.decodeIfPresent([ResetPlanItem].self, forKey: .items)) ?? []
		isRunning = (try? container.decodeIfPresent(Bool.self, forKey: .isRunning)) ?? false
		jobId = try? container.decodeIfPresent(String.self, forKey: .jobId)
	}
}

struct ResetJobStart: Decodable {
	let jobId: String

	private enum CodingKeys: String, CodingKey {
		case jobId
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		jobId = try container.decode(String.self, forKey: .jobId)
	}
}
