import Combine
import Foundation

enum ResetPlanState: Equatable {
	case loading
	case loaded([ResetPlanItem])
	case failed(message: String)
}

enum ResetRunState: Equatable {
	case idle
	case running
	case finished(BuildActionResult)
}

/// Exactly what `ResetSectionView` reads and calls.
@MainActor
protocol ResetSectionPresenting: ObservableObject {
	var planState: ResetPlanState { get }
	var runState: ResetRunState { get }
	var logLines: [String] { get }
	var isConfirmationShown: Bool { get set }
	var canReset: Bool { get }
	var canRefresh: Bool { get }
	var resetButtonTitle: String { get }
	var confirmationMessage: String { get }
	var pendingDeleteItem: ResetPlanItem? { get set }
	var canDeleteOne: Bool { get }

	func load()
	func isSelected(item: ResetPlanItem) -> Bool
	func setSelected(item: ResetPlanItem, isSelected: Bool)
	func sizeText(of item: ResetPlanItem) -> String
	func requestReset()
	func confirmReset()
	func isDeleting(item: ResetPlanItem) -> Bool
	func requestDelete(item: ResetPlanItem)
	func confirmDelete()
	func deleteConfirmationMessage(for item: ResetPlanItem) -> String
}

struct ResetSectionDependencies {
	let reset: ResetActing
	let store: StateStore

	/// Called after every reset so the screen's other sections re-measure what was deleted.
	let onFinished: @MainActor () -> Void
}

/// Build › Free space and reset: one list; each row deletes on its own, or the ticked rows go together (D-214).
/// The server owns the paths and refuses while busy.
/// Whole-class `@MainActor`: it only orchestrates published state; the deleting happens on the server.
@MainActor
final class ResetSectionViewModel: ObservableObject, ResetSectionPresenting {
	private static let failurePrefix = "! "

	@Published private(set) var planState: ResetPlanState = .loading
	@Published private(set) var runState: ResetRunState = .idle
	@Published private(set) var logLines: [String] = []
	@Published private(set) var isLocked = false
	@Published private(set) var selectedIds: Set<String> = []
	@Published var isConfirmationShown = false
	@Published var pendingDeleteItem: ResetPlanItem?
	@Published private(set) var deletingIds: Set<String> = []

	private let dependencies: ResetSectionDependencies
	private var hasLoadedOnce = false
	private var planTask: Task<Void, Never>?
	private var runTask: Task<Void, Never>?
	private var cancellables = Set<AnyCancellable>()

	init(dependencies: ResetSectionDependencies) {
		self.dependencies = dependencies
		observeStore()
	}

	deinit {
		planTask?.cancel()
		runTask?.cancel()
	}

	var canReset: Bool {
		!isLocked && runState != .running && !selectedItems.isEmpty
	}

	var canRefresh: Bool {
		runState != .running && planState != .loading
	}

	var canDeleteOne: Bool {
		!isLocked && runState != .running
	}

	var resetButtonTitle: String {
		let total = Self.sizeText(megabytes: selectedTotalMb)
		return String(localized: "Reset selected (\(total))…")
	}

	var confirmationMessage: String {
		let titles = selectedItems.map(\.title).joined(separator: ", ")
		let total = Self.sizeText(megabytes: selectedTotalMb)
		let runnerNote = selectedItems.contains(where: \.stopsRunner) ? String(localized: " The test runner is stopped first.") : ""
		return String(localized: "Deletes \(titles) — about \(total). Your repo and uncommitted work are never touched.\(runnerNote)")
	}

	private var items: [ResetPlanItem] {
		guard case .loaded(let items) = planState else {
			return []
		}
		return items
	}

	private var selectedItems: [ResetPlanItem] {
		items.filter { !$0.isInfo && selectedIds.contains($0.id) }
	}

	private var selectedTotalMb: Int {
		selectedItems.reduce(0) { $0 + $1.sizeMb }
	}

	func load() {
		planTask?.cancel()
		planState = .loading
		let reset = dependencies.reset
		planTask = Task { [weak self] in
			do {
				let snapshot = try await reset.plan()
				self?.apply(snapshot: snapshot)
			} catch {
				self?.planState = .failed(message: error.localizedDescription)
			}
		}
	}

	func isSelected(item: ResetPlanItem) -> Bool {
		selectedIds.contains(item.id)
	}

	func setSelected(item: ResetPlanItem, isSelected: Bool) {
		guard !item.isInfo else {
			return
		}
		if isSelected {
			selectedIds.insert(item.id)
		} else {
			selectedIds.remove(item.id)
		}
	}

	func sizeText(of item: ResetPlanItem) -> String {
		Self.sizeText(megabytes: item.sizeMb)
	}

	func requestReset() {
		guard canReset else {
			return
		}
		isConfirmationShown = true
	}

	func confirmReset() {
		isConfirmationShown = false
		guard canReset else {
			return
		}
		start(itemIds: selectedItems.map(\.id))
	}

	func isDeleting(item: ResetPlanItem) -> Bool {
		runState == .running && deletingIds.contains(item.id)
	}

	func requestDelete(item: ResetPlanItem) {
		guard canDeleteOne,
			!item.isInfo
		else {
			return
		}
		pendingDeleteItem = item
	}

	func confirmDelete() {
		guard let item = pendingDeleteItem,
			canDeleteOne
		else {
			pendingDeleteItem = nil
			return
		}
		pendingDeleteItem = nil
		start(itemIds: [item.id])
	}

	func deleteConfirmationMessage(for item: ResetPlanItem) -> String {
		let size = Self.sizeText(megabytes: item.sizeMb)
		let runnerNote = item.stopsRunner ? String(localized: " The test runner is stopped first.") : ""
		return String(localized: "Deletes \(item.title) — about \(size). \(item.detail).\(runnerNote)")
	}

	private func start(itemIds: [String]) {
		let reset = dependencies.reset
		runState = .running
		deletingIds = Set(itemIds)
		logLines = []
		runTask = Task { [weak self] in
			do {
				let jobId = try await reset.start(itemIds: itemIds)
				await self?.follow(jobId: jobId)
			} catch {
				self?.finish(message: error.localizedDescription, isSuccess: false)
			}
		}
	}

	private func apply(snapshot: ResetPlanSnapshot) {
		planState = .loaded(snapshot.items)
		if !hasLoadedOnce {
			hasLoadedOnce = true
			let defaultIds = snapshot.items.filter { $0.isDefault && !$0.isInfo }.map(\.id)
			selectedIds = Set(defaultIds)
		}
		// A reset started before the app (re)opened is still the server's to finish; show its log.
		if snapshot.isRunning,
			let jobId = snapshot.jobId,
			runState != .running {
			runState = .running
			runTask = Task { [weak self] in
				await self?.follow(jobId: jobId)
			}
		}
	}

	private func follow(jobId: String) async {
		let reset = dependencies.reset
		do {
			try await reset.followLog(jobId: jobId) { [weak self] line in
				self?.append(line: line)
			}
			let isFailed = logLines.contains { $0.hasPrefix(Self.failurePrefix) }
			let lastLine = logLines.last ?? String(localized: "Reset finished.")
			finish(message: lastLine, isSuccess: !isFailed)
		} catch {
			finish(message: error.localizedDescription, isSuccess: false)
		}
	}

	private func append(line: String) {
		logLines.append(line)
		let overflow = logLines.count - TestForgeConstants.Build.logLineLimit
		if overflow > 0 {
			logLines.removeFirst(overflow)
		}
	}

	private func finish(message: String, isSuccess: Bool) {
		let title = String(localized: "Free space and reset")
		let result = BuildActionResult(title: title, message: message, isSuccess: isSuccess)
		runState = .finished(result)
		deletingIds = []
		load()
		dependencies.onFinished()
	}

	private func observeStore() {
		let store = dependencies.store
		store.$slices
			.receive(on: RunLoop.main)
			.sink { [weak self] _ in
				let isRunning = store.value(of: .queue, as: QueueState.self)?.hasActiveTask ?? false
				let isScanning = store.value(of: .scan, as: ScanState.self)?.isActive ?? false
				self?.isLocked = isRunning || isScanning
			}
			.store(in: &cancellables)
	}

	private static func sizeText(megabytes: Int) -> String {
		let bytes = Int64(megabytes) * 1_048_576
		return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
	}
}
