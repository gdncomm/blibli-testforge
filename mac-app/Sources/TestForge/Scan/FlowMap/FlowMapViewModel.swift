import Combine
import Foundation

enum FlowRecordingState: Equatable {
	case idle
	case starting
	case recording
	case failed(message: String)
}

struct FlowMapDependencies {
	let locator: SimulatorLocating
	let simulatorControl: SimulatorControlling
	let store: FlowMapStoring
	let monitor: SimulatorGestureMonitoring
	let desktop: DesktopActing
	let screenReader: SimulatorScreenReading
	let notifier: FinishNotifying
	let stateStore: StateStore
	let macroService: MacroRecording
}

/// "Reached by" / "leads to" rows in the screen detail.
struct FlowEdgeRowModel: Equatable, Identifiable {
	let id: String
	let screenId: String
	let screenName: String
	let actionText: String
	let countText: String?
}

private struct PendingPress {
	let point: CGPoint
	let hit: SimulatorHit?
	let fallback: TapFallback?
}

/// Scan › Flow map (D-117): turns the person's Simulator taps into screens and moves, from the Simulator's accessibility tree alone.
/// Saved under `~/.test-forge/flows/`; needs no harness and no app change.
@MainActor
final class FlowMapViewModel: ObservableObject {
	@Published private(set) var state: FlowRecordingState = .idle
	@Published private(set) var map: FlowMap?
	@Published private(set) var folder: URL?
	@Published private(set) var currentScreenId: String?
	@Published private(set) var isReadingScreen = false
	@Published private(set) var lastEventText: String?
	@Published var selectedScreenId: String?
	/// D-171: a tap on something without an accessibility ID, shown until dismissed or the next one replaces it.
	@Published private(set) var missingIdentifierNotice: String?
	@Published var saveDraft: RecordedMacroDraft?
	@Published private(set) var isSavingMacro = false
	@Published var saveOutcome: RecordedMacroOutcome?
	/// D-174: Scan's saved-macros list, and the one just saved, which the list selects after End recording.
	@Published var savedMacros: [RecordedMacroSummary] = []
	@Published var selectedMacroId: String?
	@Published var savedNotice: RecordedMacroOutcome?
	@Published var libraryMessage: String?
	@Published var isDiscardConfirmationPresented = false
	@Published var isLoadingSavedMacros = false
	@Published var isStartingMacroReplay = false
	/// D-213: the flow map couldn't be written to disk, shown next to the rename field and the step list.
	@Published private(set) var mapSaveFailure: String?

	let dependencies: FlowMapDependencies
	let stepEditor: MacroStepEditorViewModel
	private var screenFrame: CGRect = .zero
	private var deviceUDID: String?
	private var pendingPress: PendingPress?
	private var processingTask: Task<Void, Never>?
	private var startTask: Task<Void, Never>?
	private var lastReading: FlowScreenReading?

	/// The settled screen's elements, so a tap on one without an identifier can be placed in its container (D-194).
	private var lastElements: [SimulatorElement] = []

	init(dependencies: FlowMapDependencies) {
		self.dependencies = dependencies
		stepEditor = MacroStepEditorViewModel(service: dependencies.macroService)
		if let saved = dependencies.store.latest() {
			map = saved.map
			folder = saved.folder
			selectedScreenId = saved.map.startScreenId
		}
		stepEditor.onSaved = { [weak self] macroId in
			self?.libraryMessage = String(localized: "Steps saved to the macro file.")
			self?.loadSavedMacros(selecting: macroId)
		}
	}

	deinit {
		startTask?.cancel()
		processingTask?.cancel()
	}

	var isRecording: Bool {
		state == .recording || state == .starting
	}

	var treeNodes: [FlowTreeNode] {
		map.map { FlowTreeBuilder.tree(map: $0) } ?? []
	}

	var selectedScreen: FlowScreen? {
		map?.screens.first { $0.id == selectedScreenId }
	}

	var selectedThumbnailURL: URL? {
		guard let file = selectedScreen?.thumbnailFile else {
			return nil
		}
		return folder?.appendingPathComponent(file)
	}

	var summaryText: String {
		guard let map else {
			return String(localized: "No flow recorded yet")
		}
		return String(localized: "\(map.screens.count) screens · \(map.edges.count) moves · \(map.gestureCount) gestures")
	}

	var incomingRows: [FlowEdgeRowModel] {
		edgeRows { $0.toScreenId == selectedScreenId } other: { $0.fromScreenId }
	}

	var outgoingRows: [FlowEdgeRowModel] {
		edgeRows { $0.fromScreenId == selectedScreenId } other: { $0.toScreenId }
	}

	func startRecording() {
		guard !isRecording else {
			return
		}
		guard dependencies.locator.isTrusted else {
			dependencies.locator.requestTrust()
			state = .failed(message: String(localized: "TestForge needs Accessibility permission (System Settings › Privacy & Security › Accessibility)."))
			return
		}
		// Each recording starts fresh; the previous flow stays on disk.
		if map != nil {
			startNewMap()
		}
		savedNotice = nil
		state = .starting
		startTask = Task { [weak self] in
			await self?.beginRecording()
		}
	}

	func stopRecording() {
		dependencies.monitor.stop()
		startTask?.cancel()
		pendingPress = nil
		state = .idle
		lastEventText = nil
		saveMap()
	}

	/// Keeps the saved map on disk and starts an empty one next time recording begins.
	func startNewMap() {
		guard !isRecording else {
			return
		}
		missingIdentifierNotice = nil
		lastReading = nil
		map = nil
		folder = nil
		currentScreenId = nil
		selectedScreenId = nil
	}

	func rename(screenId: String, to name: String) {
		let trimmed = name.trimmingCharacters(in: .whitespaces)
		guard !trimmed.isEmpty,
			let index = map?.screens.firstIndex(where: { $0.id == screenId })
		else {
			return
		}
		map?.screens[index].name = trimmed
		saveMap()
	}

	func dismissFailure() {
		if case .failed = state {
			state = .idle
		}
	}

	private func beginRecording() async {
		do {
			let locator = dependencies.locator
			let geometry = try await Task.detached { try locator.geometry() }.value
			screenFrame = geometry.screenFrame
			deviceUDID = await resolveDeviceUDID()
			if map == nil {
				try startMap()
			}
			let reading = try await settledReading(previous: nil)
			lastReading = reading
			let screen = await screenId(for: reading)
			if map?.startScreenId == nil {
				map?.startScreenId = screen
			}
			currentScreenId = screen
			selectedScreenId = selectedScreenId ?? screen
			saveMap()
			dependencies.monitor.start { [weak self] event in
				MainActor.assumeIsolated {
					self?.handle(event: event)
				}
			}
			state = .recording
			lastEventText = String(localized: "Recording — use the app in the Simulator")
		} catch {
			state = .failed(message: error.localizedDescription)
		}
	}

	private func startMap() throws {
		let now = Date()
		let title = (try? dependencies.locator.deviceWindowTitle()) ?? ""
		folder = try dependencies.store.makeFolder(now: now)
		map = FlowMap(createdAt: now, deviceName: title, startScreenId: nil, screens: [], edges: [], gestureCount: 0, recordedSteps: [])
	}

	/// Mouse-down names the element at once, before the app reacts; mouse-up decides tap or swipe and queues the read.
	private func handle(event: SimulatorPointerEvent) {
		guard state == .recording else {
			return
		}
		switch event {
			case .down(let point):
				guard screenFrame.contains(point) else {
					pendingPress = nil
					return
				}
				let hit = dependencies.locator.element(at: point)
				pendingPress = PendingPress(point: point, hit: hit, fallback: hit.flatMap { TapFallbackLocator.fallback(for: $0, in: lastElements) })
			case .up(let point):
				guard let press = pendingPress else {
					return
				}
				pendingPress = nil
				let action = Self.action(press: press, endPoint: point)
				enqueue(action: action)
		}
	}

	private func enqueue(action: FlowAction) {
		map?.gestureCount += 1
		if action.gesture == .tap,
			action.identifier.isEmpty,
			action.fallback == nil {
			warnMissingIdentifier(action: action)
		}
		let previous = processingTask
		processingTask = Task { [weak self] in
			await previous?.value
			await self?.process(action: action)
		}
	}

	private func process(action: FlowAction) async {
		guard let fromScreenId = currentScreenId else {
			return
		}
		isReadingScreen = true
		defer {
			isReadingScreen = false
		}
		do {
			let reading = try await settledReading(previous: nil)
			let toScreenId = await screenId(for: reading)
			currentScreenId = toScreenId
			let actionText = FlowTreeBuilder.actionText(action: action)
			let toName = map?.screens.first { $0.id == toScreenId }?.name ?? ""
			recordStep(action: action, from: fromScreenId, to: toScreenId, reading: reading)
			guard toScreenId != fromScreenId else {
				lastEventText = String(localized: "\(actionText) — stayed on \(toName)")
				saveMap()
				return
			}
			addEdge(from: fromScreenId, to: toScreenId, action: action)
			lastEventText = String(localized: "\(actionText) → \(toName)")
			saveMap()
		} catch {
			lastEventText = String(localized: "Couldn't read the screen: \(error.localizedDescription)")
		}
	}

	/// Reads until two reads agree (the screen has finished changing), or gives up after a few and takes the last.
	private func settledReading(previous: FlowScreenReading?) async throws -> FlowScreenReading {
		let locator = dependencies.locator
		let frame = screenFrame
		var last = previous
		for _ in 0..<TestForgeConstants.FlowMap.maximumReads {
			try await Task.sleep(nanoseconds: TestForgeConstants.FlowMap.settleNanoseconds)
			let elements = try await Task.detached { try locator.elements() }.value
			lastElements = elements
			let reading = FlowScreenMatcher.reading(elements: elements, screenFrame: frame)
			if let last, last.fingerprint == reading.fingerprint, last.title == reading.title {
				return reading
			}
			last = reading
		}
		guard let last else {
			throw SimulatorBridgeError.noWindow
		}
		return last
	}

	private func recordStep(action: FlowAction, from fromScreenId: String, to toScreenId: String, reading: FlowScreenReading) {
		let isNewScreen = toScreenId != fromScreenId
		let screenName = { (screenId: String) in self.map?.screens.first { $0.id == screenId }?.name ?? screenId }
		let step = RecordedStep(
			id: UUID().uuidString,
			action: action,
			screenId: fromScreenId,
			screenName: screenName(fromScreenId),
			anchorIdentifier: isNewScreen ? FlowScreenMatcher.anchorIdentifier(before: lastReading, after: reading) : nil,
			nextScreenId: isNewScreen ? toScreenId : nil,
			nextScreenName: isNewScreen ? screenName(toScreenId) : nil
		)
		map?.recordedSteps = (map?.recordedSteps ?? []) + [step]
		lastReading = reading
	}

	func setSaving(_ isSaving: Bool) {
		isSavingMacro = isSaving
	}

	func dismissMissingIdentifierNotice() {
		missingIdentifierNotice = nil
	}

	func removeStep(id: String) {
		map?.recordedSteps?.removeAll { $0.id == id }
		saveMap()
	}

	/// Shown in the Scan header and as a macOS banner, since the person is looking at the Simulator, not this window.
	private func warnMissingIdentifier(action: FlowAction) {
		let target = action.label.isEmpty ? String(localized: "an element with no label") : "“\(action.label)”"
		let consequence = action.label.isEmpty
			? String(localized: "Replay can't find it, so that step will ask a person to tap.")
			: String(localized: "Replay will find it by its text, which breaks when the copy or language changes.")
		missingIdentifierNotice = String(localized: "You tapped \(target), which has no accessibility ID. \(consequence)")
		let notice = FinishNotice(
			title: String(localized: "No accessibility ID on \(target)"),
			body: String(localized: "\(consequence) Ask a developer to add an accessibilityIdentifier."),
			isAlertOnly: true
		)
		dependencies.notifier.post(notice: notice)
	}

	private func screenId(for reading: FlowScreenReading) async -> String {
		let screens = map?.screens ?? []
		if let match = FlowScreenMatcher.match(reading: reading, screens: screens),
			let index = screens.firstIndex(of: match) {
			map?.screens[index].visitCount += 1
			map?.screens[index].fingerprint.formUnion(reading.fingerprint)
			return match.id
		}
		let number = screens.count + 1
		let screenId = String(format: "S%02d", number)
		let screen = FlowScreen(
			id: screenId,
			name: reading.suggestedName ?? String(localized: "Screen \(number)"),
			title: reading.title,
			fingerprint: reading.fingerprint,
			thumbnailFile: await captureThumbnail(screenId: screenId),
			visitCount: 1,
			firstSeenAt: Date()
		)
		map?.screens.append(screen)
		return screenId
	}

	private func addEdge(from fromScreenId: String, to toScreenId: String, action: FlowAction) {
		let edgeId = "\(fromScreenId)>\(toScreenId)>\(action.gesture.rawValue)>\(action.identifier)>\(action.label)"
		if let index = map?.edges.firstIndex(where: { $0.id == edgeId }) {
			map?.edges[index].count += 1
			return
		}
		map?.edges.append(FlowEdge(id: edgeId, fromScreenId: fromScreenId, toScreenId: toScreenId, action: action, count: 1))
	}

	private func captureThumbnail(screenId: String) async -> String? {
		guard let deviceUDID,
			let folder
		else {
			return nil
		}
		let fileName = "\(screenId).png"
		let path = folder.appendingPathComponent(fileName).path
		let output = try? await dependencies.simulatorControl.screenshot(udid: deviceUDID, path: path)
		return output == nil ? nil : fileName
	}

	private func resolveDeviceUDID() async -> String? {
		try? dependencies.screenReader.windowDevice().udid
	}

	func saveMap() {
		guard let map,
			let folder
		else {
			return
		}
		do {
			try dependencies.store.save(map: map, in: folder)
			mapSaveFailure = nil
		} catch {
			mapSaveFailure = String(localized: "Couldn't save the flow map: \(error.localizedDescription)")
		}
	}

	private func edgeRows(matching isIncluded: (FlowEdge) -> Bool, other: (FlowEdge) -> String) -> [FlowEdgeRowModel] {
		guard let map else {
			return []
		}
		return map.edges.filter(isIncluded).map { edge in
			let otherId = other(edge)
			let otherName = map.screens.first { $0.id == otherId }?.name ?? otherId
			return FlowEdgeRowModel(
				id: edge.id,
				screenId: otherId,
				screenName: otherName,
				actionText: FlowTreeBuilder.actionText(action: edge.action),
				countText: edge.count > 1 ? "×\(edge.count)" : nil
			)
		}
	}

	private static func action(press: PendingPress, endPoint: CGPoint) -> FlowAction {
		let deltaX = endPoint.x - press.point.x
		let deltaY = endPoint.y - press.point.y
		let gesture: FlowGestureKind
		if max(abs(deltaX), abs(deltaY)) < TestForgeConstants.FlowMap.swipeThreshold {
			gesture = .tap
		} else if abs(deltaY) >= abs(deltaX) {
			gesture = deltaY < 0 ? .swipeUp : .swipeDown
		} else {
			gesture = deltaX < 0 ? .swipeLeft : .swipeRight
		}
		return FlowAction(
			gesture: gesture,
			identifier: press.hit?.identifier ?? "",
			label: press.hit?.label ?? "",
			role: press.hit?.role ?? "",
			fallback: gesture == .tap ? press.fallback : nil
		)
	}
}
