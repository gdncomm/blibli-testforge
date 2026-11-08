import AppKit

/// Moves the separate Docs window to half of its screen, or into full screen (D-218).
@MainActor
protocol DocsWindowArranging {
	/// False when the window isn't open yet or its screen is unknown.
	func arrange(_ layout: DocsWindowLayout) -> Bool
}

@MainActor
struct DocsWindowArranger: DocsWindowArranging {
	func arrange(_ layout: DocsWindowLayout) -> Bool {
		guard let window = Self.docsWindow(),
			let screen = window.screen ?? NSScreen.main
		else {
			return false
		}
		let isFullScreen = window.styleMask.contains(.fullScreen)
		guard let frame = layout.frame(in: screen.visibleFrame) else {
			if !isFullScreen {
				window.toggleFullScreen(nil)
			}
			window.makeKeyAndOrderFront(nil)
			return true
		}
		// A full-screen window can't be resized; leave full screen first, then place it once it is back.
		if isFullScreen {
			window.toggleFullScreen(nil)
		}
		window.setFrame(frame, display: true, animate: !isFullScreen)
		window.makeKeyAndOrderFront(nil)
		return true
	}

	/// SwiftUI gives a `Window` scene's NSWindow an identifier that starts with the scene id.
	static func docsWindow() -> NSWindow? {
		NSApplication.shared.windows.first { window in
			window.identifier?.rawValue.hasPrefix(DocsConstants.windowId) == true && window.isVisible
		}
	}
}
