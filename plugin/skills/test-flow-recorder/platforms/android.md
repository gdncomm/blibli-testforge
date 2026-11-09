# Android driver — contract to satisfy

Not built. This file exists so the work is scoped rather than guessed at, and so the iOS
implementation stops accumulating assumptions that only hold for XCUITest.

Everything platform-neutral is already shared: `contracts/commands.md` (the command vocabulary and
queue protocol), `contracts/evidence.md` (cases/results/media shapes), `contracts/healing.md` (fault
classes and bounds), the report generator, and the fixture scripts. An Android run reuses all of it.

## Host-project skills required

**Required: no**

No requirement declared — this driver isn't built yet (see above). `scripts/audit_platform_skills.py
--platform android` still runs and reports what it finds in the host project, for visibility, but
nothing here blocks `/test-forge-init` or a run. The moment a driver and an actual dependency land for this
platform, the same mechanism ios.md already uses picks it up unchanged — no script change needed,
only this section.

## What has to be written

| Piece | iOS equivalent | Android approach |
|---|---|---|
| Collector | `TestForgeDriverSession.testLiveSession`, a persistent XCUITest case polling the queue | an instrumented UiAutomator test doing the same, launched by `gradle connectedAndroidTest` |
| Element addressing | accessibility identifier + element type | `resource-id` / `content-desc` + class name |
| Tree dump | `debugDescription` of the app snapshot | `UiDevice.dumpWindowHierarchy` |
| Frames | `XCUIElement.frame`, in points | `Rect` in pixels — **must be divided by density** before it leaves the driver, so an assertion compares against a design spec unchanged |
| Screenshot | `XCUIScreen.main.screenshot()` | `UiDevice.takeScreenshot` |
| Recording | `simctl io recordVideo` | `adb shell screenrecord`, chunked — it caps at 3 minutes per file |
| Relaunch | `XCUIApplication.launch()` | `am force-stop` then a fresh launch intent |
| Data layer | NetworkLens interceptor + `networklens` MCP | an OkHttp interceptor exposing the same four verbs (arm variant, push body, report live reachability, prove mock-served) |

## Constraints to carry over

- **Points, not pixels.** The single most important thing to get right. Every geometry assertion in
  the existing reports is in points; an Android driver reporting pixels makes every shared expectation
  wrong by the density factor and the mistake looks like a layout bug.
- **`screenrecord` has a hard duration cap** and does not capture audio or secure surfaces. A case
  whose attempt runs long needs chunk stitching, and the evidence contract's one-file-per-attempt
  naming must survive that.
- **The queue must be reachable from the device.** A physical device cannot see the host's
  `127.0.0.1`; it needs `adb reverse tcp:<port> tcp:<port>`. An emulator reaches the host at
  `10.0.2.2`. Preflight has to check this, because a driver that cannot see the queue looks exactly
  like a driver that is not running.
- **Prove mock-served.** Not optional, for the same reason as on iOS: a data channel that reports
  success while the app talks to the real backend is the most expensive failure mode there is.

## Publishing is not platform-specific

An Android run publishes exactly as an iOS run does, through the same script and to the same default
parent — the mobile team's own page — with a new page restricted to whoever ran it. Nothing about
where evidence lands or who can see it changes with the platform, and an Android driver has nothing
to implement here.

## What is genuinely easier

`resource-id` is compiled from the layout, so the identifier-retrofit problem that blocks iOS
SwiftUI surfaces (a view with no accessibility identifier is unaddressable, and adding one is a
gated production edit) mostly does not arise. Expect fewer `tapByLabel` fallbacks.

## Legacy scope

`scan_scope.py` parses Swift, so Android needs its own inventory producing the same JSON shape
(`posture`, `documents`, `addressability`, `endpointLiterals`) — the report reads those keys, not the
scanner. Parse `.kt`/`.java` for `Activity`/`Fragment`/`@Composable` declarations, and count
`android:id` in layout XML alongside `testTag`/`contentDescription` in Compose.

Addressing degrades differently than on iOS: a View-system screen almost always has an
`android:id` even when nobody planned for testing, because the layout inflater needs one — so
legacy XML scope is usually *more* addressable than legacy Compose, where a container without a
`testTag` is as unreachable as a SwiftUI `VStack`.

Entry-point discovery has a shortcut iOS lacks: `adb shell dumpsys activity activities` names the
resumed activity, and the manifest's `intent-filter` blocks list every deeplink the screen accepts
without reading a line of code.
