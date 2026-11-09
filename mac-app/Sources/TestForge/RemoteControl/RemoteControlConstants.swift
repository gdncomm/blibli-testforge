import Foundation

enum RemoteControlConstants {
	enum Layout {
		static let panelWidth: CGFloat = 420
		static let qrSide: CGFloat = 132
	}

	enum Copy {
		static let footnote = String(
			localized: """
			Sessions run here in the repo with your plugins. Approvals and questions come to your phone; pushing, \
			building for testing and erasing a simulator always ask first.
			"""
		)
	}

	enum Accessibility {
		static let button = "TestForge_RemoteControl_Button"
		static let panel = "TestForge_RemoteControl_Panel"
		static let qrCode = "TestForge_RemoteControl_QR"
		static let openButton = "TestForge_RemoteControl_Open"
		static let copyButton = "TestForge_RemoteControl_Copy"
		static let spawnModePicker = "TestForge_RemoteControl_SpawnMode"
		static let startButton = "TestForge_RemoteControl_Start"
		static let stopButton = "TestForge_RemoteControl_Stop"
	}
}
