import AppKit
import ApplicationServices

/// Where the Simulator's window and its device screen are, in Accessibility coordinates (top-left origin, points).
struct SimulatorGeometry: Equatable {
	let windowFrame: CGRect
	let screenFrame: CGRect

	/// The window server's number for the window, so an overlay can be ordered just above it.
	let windowNumber: Int?

	/// False when the window is on another Space or hidden; an overlay must not show then.
	let isWindowOnScreen: Bool
}

private struct WindowListEntry {
	let number: Int
	let isOnScreen: Bool
}

struct SimulatorElement: Equatable, Identifiable {
	let id: Int
	let identifier: String
	let role: String
	let label: String
	let frame: CGRect

	/// Child indexes from the device screen down to this element, so its attributes can be read again later.
	let path: [Int]

	let parentId: Int?
	let childCount: Int
}

private struct WalkPosition {
	let path: [Int]
	let parentId: Int?
}

enum SimulatorBridgeError: LocalizedError {
	case notTrusted
	case notRunning
	case noWindow
	case notMoved

	var errorDescription: String? {
		switch self {
			case .notTrusted:
				return String(localized: "TestForge needs Accessibility permission (System Settings › Privacy & Security › Accessibility).")
			case .notRunning:
				return String(localized: "Simulator isn't open.")
			case .noWindow:
				return String(localized: "Simulator has no device window open.")
			case .notMoved:
				return String(localized: "Simulator didn't accept the new window position.")
		}
	}
}

/// Reads and moves the Simulator through the Accessibility API; its tree also exposes the device screen and the app's elements.
protocol SimulatorLocating: Sendable {
	var isTrusted: Bool { get }

	/// Shows the system's Accessibility prompt once; macOS decides whether to show it again.
	func requestTrust()

	/// `windowTitle` names one device window; nil = the preferred, else the first.
	func geometry(windowTitle: String?) throws -> SimulatorGeometry

	func moveWindow(to frame: CGRect, windowTitle: String?) throws

	/// Puts that device window above the Simulator's other windows (another device's window can sit in the same spot).
	func raiseWindow(windowTitle: String?) throws

	/// Presses the first enabled item among `paths` in the Simulator's menu bar (e.g. Window › Full Screen Tile ›
	/// Left of Screen); returns whether one was pressed. The Simulator must be the active app for its items to enable.
	func pressMenuItem(anyOf paths: [[String]]) -> Bool

	/// Titles of the open device windows ("TestForge · iPhone 12 Pro Max"), in the Simulator's window order.
	func deviceWindowTitles() -> [String]

	/// Walks the whole device tree (~10 ms per element over IPC), so call it off the main actor.
	func elements() throws -> [SimulatorElement]

	/// The app element under a point in Accessibility coordinates, read at once (3–26 ms) so a tap is named before the
	/// screen changes; nil when the point isn't on the Simulator.
	func element(at point: CGPoint) -> SimulatorHit?

	/// "iPhone 17 Pro Max – iOS 26.2": names which booted device the window shows.
	func deviceWindowTitle() throws -> String

	/// With several devices open, the window whose title starts with this name wins (the test device, D-137); nil = first.
	func prefer(deviceName: String?)
}

extension SimulatorLocating {
	func geometry() throws -> SimulatorGeometry {
		try geometry(windowTitle: nil)
	}

	func moveWindow(to frame: CGRect) throws {
		try moveWindow(to: frame, windowTitle: nil)
	}
}

struct SimulatorHit: Equatable {
	let identifier: String
	let label: String
	let role: String
	let frame: CGRect
}

final class AXSimulatorLocator: SimulatorLocating, @unchecked Sendable {
	private let bundleIdentifier = "com.apple.iphonesimulator"
	/// Written from the main actor, read by element walks off it.
	private let preferenceLock = NSLock()
	private var preferredDeviceName: String?

	func prefer(deviceName: String?) {
		preferenceLock.lock()
		preferredDeviceName = deviceName
		preferenceLock.unlock()
	}

	var isTrusted: Bool {
		AXIsProcessTrusted()
	}

	func requestTrust() {
		let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
		let options = [promptKey: true] as CFDictionary
		_ = AXIsProcessTrustedWithOptions(options)
	}

	func geometry(windowTitle: String?) throws -> SimulatorGeometry {
		let window = try deviceWindow(titled: windowTitle)
		guard let screen = screenGroup(in: window) else {
			throw SimulatorBridgeError.noWindow
		}
		let windowFrame = frame(of: window)
		let entry = windowListEntry(matching: windowFrame)
		return SimulatorGeometry(
			windowFrame: windowFrame,
			screenFrame: frame(of: screen),
			windowNumber: entry?.number,
			isWindowOnScreen: entry?.isOnScreen ?? false
		)
	}

	func moveWindow(to frame: CGRect, windowTitle: String?) throws {
		let window = try deviceWindow(titled: windowTitle)
		var origin = frame.origin
		guard let position = AXValueCreate(.cgPoint, &origin) else {
			throw SimulatorBridgeError.notMoved
		}
		let result = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, position)
		guard result == .success else {
			throw SimulatorBridgeError.notMoved
		}
	}

	func elements() throws -> [SimulatorElement] {
		let window = try deviceWindow()
		guard let screen = screenGroup(in: window) else {
			throw SimulatorBridgeError.noWindow
		}
		var collected: [SimulatorElement] = []
		let root = WalkPosition(path: [], parentId: nil)
		let screenChildren = children(of: screen)
		collect(siblings: screenChildren, at: root, into: &collected)
		return collected
	}

	func element(at point: CGPoint) -> SimulatorHit? {
		guard isTrusted,
			let simulator = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first
		else {
			return nil
		}
		let systemWide = AXUIElementCreateSystemWide()
		var hit: AXUIElement?
		guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &hit) == .success,
			let hit
		else {
			return nil
		}
		var processIdentifier: pid_t = 0
		AXUIElementGetPid(hit, &processIdentifier)
		guard processIdentifier == simulator.processIdentifier else {
			return nil
		}
		let named = identifiedAncestor(of: hit)
		let hitLabel = label(of: hit)
		return SimulatorHit(
			identifier: named.flatMap { attribute(of: $0, named: "AXIdentifier") as? String } ?? "",
			label: hitLabel.isEmpty ? named.map { label(of: $0) } ?? "" : hitLabel,
			role: role(of: hit),
			frame: frame(of: hit)
		)
	}

	/// The tapped element, or a close parent that carries the identifier: SwiftUI often puts it on the button while
	/// the pointer lands on its text. A parent much larger than the hit is a container, not the thing tapped.
	private func identifiedAncestor(of hit: AXUIElement) -> AXUIElement? {
		let hitFrame = frame(of: hit)
		let hitArea = max(hitFrame.width * hitFrame.height, 1)
		var current: AXUIElement? = hit
		for _ in 0...TestForgeConstants.FlowMap.identifierParentDepth {
			guard let element = current else {
				return nil
			}
			let elementFrame = frame(of: element)
			if elementFrame.width * elementFrame.height > hitArea * TestForgeConstants.FlowMap.identifierParentAreaRatio {
				return nil
			}
			if let identifier = attribute(of: element, named: "AXIdentifier") as? String,
				!identifier.isEmpty {
				return element
			}
			current = parent(of: element)
		}
		return nil
	}

	private func parent(of element: AXUIElement) -> AXUIElement? {
		guard let value = attribute(of: element, named: kAXParentAttribute),
			CFGetTypeID(value) == AXUIElementGetTypeID()
		else {
			return nil
		}
		return unsafeBitCast(value, to: AXUIElement.self)
	}

	func deviceWindowTitle() throws -> String {
		let window = try deviceWindow()
		return attribute(of: window, named: kAXTitleAttribute) as? String ?? ""
	}

	func raiseWindow(windowTitle: String?) throws {
		let window = try deviceWindow(titled: windowTitle)
		AXUIElementSetAttributeValue(window, kAXMainAttribute as CFString, kCFBooleanTrue)
		AXUIElementPerformAction(window, kAXRaiseAction as CFString)
	}

	func pressMenuItem(anyOf paths: [[String]]) -> Bool {
		guard isTrusted,
			let runningApplication = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first,
			let menuBar = attribute(of: AXUIElementCreateApplication(runningApplication.processIdentifier), named: kAXMenuBarAttribute),
			CFGetTypeID(menuBar) == AXUIElementGetTypeID()
		else {
			return false
		}
		let root = unsafeBitCast(menuBar, to: AXUIElement.self)
		for path in paths {
			guard let item = menuItem(in: root, path: path),
				attribute(of: item, named: kAXEnabledAttribute) as? Bool ?? false
			else {
				continue
			}
			return AXUIElementPerformAction(item, kAXPressAction as CFString) == .success
		}
		return false
	}

	/// Menu items sit inside an `AXMenu` under each titled item, so the walk steps through untitled menus.
	private func menuItem(in element: AXUIElement, path: [String]) -> AXUIElement? {
		guard let title = path.first else {
			return element
		}
		for child in children(of: element) {
			if attribute(of: child, named: kAXTitleAttribute) as? String == title {
				return menuItem(in: child, path: Array(path.dropFirst()))
			}
			if role(of: child) == kAXMenuRole as String,
				let found = menuItem(in: child, path: path) {
				return found
			}
		}
		return nil
	}

	func deviceWindowTitles() -> [String] {
		let reachable = (try? openDeviceWindows())?.compactMap { attribute(of: $0, named: kAXTitleAttribute) as? String } ?? []
		// The main and focused window are often the same window, reached twice when `AXWindows` comes back empty;
		// windows on other desktops (a full-screen one too) appear only in the Window menu.
		var seen = Set<String>()
		return (reachable + windowMenuTitles()).filter { seen.insert($0).inserted }
	}

	/// The Window menu ends with one item per open window, after its last separator, whichever desktop each is on.
	private func windowMenuTitles() -> [String] {
		guard isTrusted,
			let runningApplication = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first,
			let menuBar = attribute(of: AXUIElementCreateApplication(runningApplication.processIdentifier), named: kAXMenuBarAttribute),
			CFGetTypeID(menuBar) == AXUIElementGetTypeID()
		else {
			return []
		}
		let root = unsafeBitCast(menuBar, to: AXUIElement.self)
		guard let windowMenuItem = children(of: root).first(where: { attribute(of: $0, named: kAXTitleAttribute) as? String == "Window" }),
			let windowMenu = children(of: windowMenuItem).first
		else {
			return []
		}
		let titles = children(of: windowMenu).map { attribute(of: $0, named: kAXTitleAttribute) as? String ?? "" }
		guard let lastSeparator = titles.lastIndex(of: "") else {
			return []
		}
		return titles[titles.index(after: lastSeparator)...].filter { !$0.isEmpty }
	}

	private func openDeviceWindows() throws -> [AXUIElement] {
		guard isTrusted else {
			throw SimulatorBridgeError.notTrusted
		}
		let runningApplication = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first
		guard let runningApplication else {
			throw SimulatorBridgeError.notRunning
		}
		let application = AXUIElementCreateApplication(runningApplication.processIdentifier)
		return windows(of: application).filter { screenGroup(in: $0) != nil }
	}

	private func deviceWindow(titled windowTitle: String? = nil) throws -> AXUIElement {
		let deviceWindows = try openDeviceWindows()
		if let windowTitle,
			let titled = deviceWindows.first(where: { (attribute(of: $0, named: kAXTitleAttribute) as? String) == windowTitle }) {
			return titled
		}
		preferenceLock.lock()
		let preferredName = preferredDeviceName
		preferenceLock.unlock()
		let preferred = preferredName.flatMap { name in
			deviceWindows.first { (attribute(of: $0, named: kAXTitleAttribute) as? String)?.hasPrefix(name) ?? false }
		}
		guard let window = preferred ?? deviceWindows.first else {
			throw SimulatorBridgeError.noWindow
		}
		return window
	}

	/// `AXWindows` (and the app's children) sometimes answer without the device window while it is on screen; the main and
	/// focused window attributes still name it.
	private func windows(of application: AXUIElement) -> [AXUIElement] {
		let listed = attribute(of: application, named: kAXWindowsAttribute) as? [AXUIElement] ?? []
		guard listed.isEmpty else {
			return listed
		}
		let children = children(of: application).filter { role(of: $0) == kAXWindowRole as String }
		let named = [kAXMainWindowAttribute, kAXFocusedWindowAttribute].compactMap { name -> AXUIElement? in
			guard let value = attribute(of: application, named: name),
				CFGetTypeID(value) == AXUIElementGetTypeID()
			else {
				return nil
			}
			return unsafeBitCast(value, to: AXUIElement.self)
		}
		return children + named
	}

	/// Window-list bounds share the Accessibility coordinate space, so the Simulator window is the one with the same frame.
	/// Reads all windows, not only on-screen ones, so a window on another Space is found and reported as off screen.
	private func windowListEntry(matching windowFrame: CGRect) -> WindowListEntry? {
		let processIdentifier = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first?.processIdentifier
		let windowList = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
		let match = windowList.first { info in
			guard let ownerIdentifier = info[kCGWindowOwnerPID as String] as? pid_t,
				ownerIdentifier == processIdentifier,
				let boundsInfo = info[kCGWindowBounds as String] as? NSDictionary,
				let bounds = CGRect(dictionaryRepresentation: boundsInfo as CFDictionary)
			else {
				return false
			}
			return bounds.insetBy(dx: -1, dy: -1).contains(windowFrame)
		}
		guard let number = match?[kCGWindowNumber as String] as? Int else {
			return nil
		}
		let isOnScreen = match?[kCGWindowIsOnscreen as String] as? Bool ?? false
		return WindowListEntry(number: number, isOnScreen: isOnScreen)
	}

	/// The device screen is the window's largest direct `AXGroup`; the bezel buttons sit beside it.
	private func screenGroup(in window: AXUIElement) -> AXUIElement? {
		let groups = children(of: window).filter { role(of: $0) == kAXGroupRole as String }
		return groups.max { frame(of: $0).area < frame(of: $1).area }
	}

	/// Takes the already-read children so each element costs one children read, not two.
	private func collect(siblings: [AXUIElement], at position: WalkPosition, into collected: inout [SimulatorElement]) {
		for (index, child) in siblings.enumerated() {
			let grandchildren = children(of: child)
			let elementId = collected.count
			let childPath = position.path + [index]
			let element = SimulatorElement(
				id: elementId,
				identifier: attribute(of: child, named: "AXIdentifier") as? String ?? "",
				role: role(of: child),
				label: label(of: child),
				frame: frame(of: child),
				path: childPath,
				parentId: position.parentId,
				childCount: grandchildren.count
			)
			collected.append(element)
			let childPosition = WalkPosition(path: childPath, parentId: elementId)
			collect(siblings: grandchildren, at: childPosition, into: &collected)
		}
	}

	private func label(of element: AXUIElement) -> String {
		let description = attribute(of: element, named: kAXDescriptionAttribute) as? String ?? ""
		let title = attribute(of: element, named: kAXTitleAttribute) as? String ?? ""
		return description.isEmpty ? title : description
	}

	private func role(of element: AXUIElement) -> String {
		attribute(of: element, named: kAXRoleAttribute) as? String ?? ""
	}

	private func children(of element: AXUIElement) -> [AXUIElement] {
		attribute(of: element, named: kAXChildrenAttribute) as? [AXUIElement] ?? []
	}

	private func frame(of element: AXUIElement) -> CGRect {
		var rect = CGRect.zero
		guard let value = attribute(of: element, named: "AXFrame"),
			CFGetTypeID(value) == AXValueGetTypeID()
		else {
			return rect
		}
		let axValue = unsafeBitCast(value, to: AXValue.self)
		AXValueGetValue(axValue, .cgRect, &rect)
		return rect
	}

	private func attribute(of element: AXUIElement, named name: String) -> AnyObject? {
		var value: AnyObject?
		AXUIElementCopyAttributeValue(element, name as CFString, &value)
		return value
	}
}

extension CGRect {
	var area: CGFloat {
		width * height
	}
}
