# TestForge — Android QA Driver Spec

_Status: draft, **parked** — docs only until the user picks Android development up (D-136, 2026-10-17). Keep this file
current as the iOS MVP changes. Basis: the iOS MVP as committed at `4f91abd94`._

The iOS MVP is the reference. The Android driver is a **port of the same contracts**, not a new design: the same
command protocol, the same macro files, the same server and the same Mac app. A test case recorded once should
replay on both platforms wherever the screen is the same. Only the parts that touch the phone change.

---

## 1. What the iOS MVP is made of

| Piece | iOS today | What it does |
|---|---|---|
| **Driver runner** | `TestForgeDriverKit/TestForgeDriverRunner.swift` (Blibli-Utility fork, ~1,100 lines), an XCUITest `XCTestCase`; the app repo adds a thin subclass in `BlibliMobile_XCUITest` | Polls the command queue, runs one command at a time against the app, posts a result. Reports outcomes instead of asserting, so one failed lookup never ends the session |
| **Command queue** | `lib/driver-host.js` in the server, `127.0.0.1:8789` | `GET /health`, `GET /commands`, `POST /result`. The runner is the client; the server hosts |
| **Runner lifecycle** | `harness.py` (test-flow-recorder plugin) → `xcodebuild test-without-building` | Start, health, restart, idle stop after 30 min (`TEST_FORGE_DRIVER_SESSION_MINUTES`) |
| **Macros v2** | `<UITestRoot>/<Module>/<Submodule>/macros/*.json` + `TestForgeMacros/elements.json` registry | Steps refer to elements by `el_…` id; the registry holds the locator chain (identifier, `within`, type, index, label fallbacks). Replay is deterministic, no Claude |
| **Host steps** | `lib/macro-v2.js` + `lib/app-defaults.js` | `relaunch`, `openDeeplink`, `setAppDefault` / `clearAppDefault`, `mock`, `assertRequested`, `wait`, `manual`, `run` (routine), `typeSecret` |
| **Device control** | `simctl` + CoreSimulator (`lib/test-forge-simulator.js`, `test-device.js`, Mac `SimulatorControl/`) | QA clone, boot, erase, deeplink, saved settings, permissions, Color Blended Layers, video |
| **Build** | `lib/test-forge-build.js` → `xcodebuild build-for-testing` on a QA copy | Builds app + runner from the prepared code; Install for testing |
| **Network** | NetworkLens in the app; trace + session files in the app container; control queue on 8788 | Live traffic, mocks, scenarios, breakpoints, replay, trackers (D-127…D-131) |
| **Readiness** | `lib/readiness.js` | server, stream, proof folder, test batch, code, simulator, app, installed build, harness, lens, device free, disk, Claude |
| **Mac app** | `tools/mac-app` | Every screen above, plus Measure, Arrange, Scan, Claude |

## 2. Decision: how the Android driver works

**UiAutomator in a self-instrumenting test APK, polling the same queue over `adb reverse`.**

- **UiAutomator, not Espresso.** XCUITest is black-box: it drives the app from outside, sees system alerts and
  never needs the app's code. UiAutomator is the Android equivalent (`androidx.test.uiautomator`, `UiDevice` +
  `By` selectors + `Until` waits). Espresso runs inside the app's process, cannot touch permission dialogs or other
  apps, and ties the driver to the app's build.
- **Self-instrumenting test APK** (`com.blibli.test-forge-driver`, `android:targetPackage` = itself). The driver is a
  separate app that drives Blibli from outside: installing or starting it never restarts the app under test, and
  one driver APK works with **any** build of the app, debug or release. On iOS the runner has to be built with the
  app; on Android "Build for testing" becomes "build the app" only. This is the biggest simplification the port gets.
- **Same queue, unchanged.** The runner polls `http://127.0.0.1:8789`. On a device, loopback is the device itself,
  so the host runs `adb reverse tcp:8789 tcp:8789` (and `tcp:8788` for NetworkLens, already in `lib/android.js`
  `openControlTunnel`). That works for emulators **and** physical phones — iOS can't reach a physical device this way.
- **Started with** `adb shell am instrument -w -e class com.blibli.test-forge-driver.LiveSession#runLiveSession
  -e TEST_FORGE_DRIVER_CONTROL_PORT 8789 -e TEST_FORGE_BUNDLE_ID com.blibli.mobile com.blibli.test-forge-driver/androidx.test.runner.AndroidJUnitRunner`.
  `-e` arguments replace the iOS environment variables, read through `InstrumentationRegistry.getArguments()`.
- **Where it lives:** a `qadriver-android` library (Kotlin) next to `TestForgeDriverKit` in the shared tools repo, published
  as an AAR; the Android app repo — or the plugin, since nothing in it is app-specific — adds a thin
  `LiveSession : TestForgeDriverRunner()` with the app's configuration, as the iOS `BlibliMobile_XCUITest` subclass does.

**Considered and rejected:** Appium (a separate server, slower, a second wire protocol to keep in step);
Maestro (its own YAML flows — the macros would have to be translated, and replay would leave our queue); Espresso
(above). Our protocol is small; a Kotlin port of one file is cheaper than adopting any of them.

## 3. The command protocol — parity table

Request and result JSON stay **byte-for-byte the same** (`{id, kind, …}` → `{id, value | error}`), including key
names. A shared golden file of commands and expected result shapes runs against both runners (§7).

| Kind | iOS (XCUITest) | Android (UiAutomator) | Notes |
|---|---|---|---|
| `tap` | element `tap()`; `force` taps the centre coordinate | `UiObject2.click()`; `force` → `UiDevice.click(x, y)` | "hittable": enabled + non-empty `visibleBounds`; `obscuredBy` from comparing `visibleBounds` with `bounds` |
| `type` | tap, `typeText`, read `value` back, dismiss keyboard unless `keepKeyboard` | click, `UiObject2.text = …` (or `input text` for IME-driven fields), read `text` back | iOS appends; `setText` replaces. Keep iOS meaning: append = read + set |
| `tapByLabel` | label predicate, `exact` / `contains` / `beginsWith` | `By.text` / `textContains` / `textStartsWith`, then `By.desc` variants | Label = text, else contentDescription |
| `scrollUntilExists` | swipe the scroll view until found (`maxAttempts`) | `UiObject2.scroll(Direction.DOWN, …)` on the scrollable, or `UiScrollable.scrollIntoView` | Same deep-swipe offsets (start 0.75, end 0.2) to avoid floating CTAs |
| `swipe` | `swipeUp/Down/Left/Right` | `UiDevice.swipe` / `UiObject2.swipe` | |
| `scrollToTop` | swipes down until an anchor shows | `fling(Direction.UP)` until the anchor shows | |
| `waitForExists` / `waitForNotExists` / `assertExists` | poll the query's count | `UiDevice.wait(Until.hasObject / gone, timeout)` | |
| `getLabel` / `getLabels` / `getElementCount` | | `text ?: contentDescription`; `findObjects(…).size` | |
| `getFrame` | frame in points | `visibleBounds` in px **÷ density** → dp, plus `scale` | dp is Android's point; Measure and the overlay already speak points |
| `dumpTree` | `debugDescription`, cut at 20,000 chars | `UiDevice.dumpWindowHierarchy` (XML), same cut | Server-side parsers learn one more format |
| `assertSpacing` | frames A and B, axis, tolerance | same from `visibleBounds` in dp | |
| `alertTap` | `app.alerts` / Springboard alerts | permission dialog (`com.android.permissioncontroller:id/permission_allow_*`), `AlertDialog` `android:id/button1/2/3`, else by text | Configured `dismissibleAlertTitles` work the same |
| `screenshot` | written straight to the host's `~/Documents/TestForge-Test` (the simulator shares the Mac's disk) | `UiDevice.takeScreenshot` to `/sdcard/Android/data/com.blibli.test-forge-driver/files/TestForge-Test/…`; result carries the device path; the **server pulls** it | A device can't write to the Mac — the one structural difference in the protocol's side effects |
| `dismissKeyboard` | taps the keyboard's own Done/Return | IME window present (`uiAutomation.windows`, `TYPE_INPUT_METHOD`) → `pressBack()` once | Never a blind Back: it would navigate |
| `relaunchApp` | `terminate()` + `launch()` | `am force-stop` + launch intent | |
| `deviceInfo` | name, OS, UDID, screen points | `Build.MODEL`, `Build.VERSION.RELEASE`, serial / AVD name, screen in dp | `device` keys identical |

**Locators.** iOS matches `accessibilityIdentifier`. Android matches **resource-id**: a View's `android:id`, and a
Compose node's `testTag` **when the app sets `Modifier.semantics { testTagsAsResourceId = true }` on its root**
(without it, Compose tags are invisible to UiAutomator). `within` → find the container, then search inside it.
`elementType` is matched loosely (class name / clickable / Compose role) and stays optional, as on iOS, where the
same identifier surfaces as different types.

## 4. Macros and the element registry

- **Macro files don't change.** Steps say `{"do": "tap", "el": "el_…"}`; only the registry knows how to find it.
- **The registry gets a per-platform locator:** `locator` (iOS, today's shape) plus an optional `android` block with
  the same shape (`chain` of `{identifier, type?, index?}`, `fallbacks` of `{label}`). An element without an
  `android` block is reported as "not mapped on Android" — the step fails clearly instead of guessing.
- **Shared identifiers make it free.** When both apps use the same id for the same control (e.g. `FS_Shared_TabRowContainer`
  as an iOS `accessibilityIdentifier` and an Android `testTag`), one locator serves both and the `android` block is
  just `"same": true`. Agreeing an id convention with the Android team is the highest-leverage decision here (§9).
- **Macros declare platforms:** `platforms: ["ios", "android"]` (default `["ios"]` for existing macros). A case is
  replayable on Android once every element it uses is mapped.
- **Host steps on Android:**

| Step | iOS | Android |
|---|---|---|
| `relaunch` | `simctl terminate` / `launch` | `am force-stop` + `monkey -p <pkg> 1` or the launch activity |
| `openDeeplink` | `simctl openurl` | `am start -a android.intent.action.VIEW -d <url> <pkg>` |
| `setAppDefault` / `clearAppDefault` | `simctl spawn defaults write` into the app's plist | SharedPreferences: a debug-only `BroadcastReceiver` in the QA build (`am broadcast -a com.blibli.qa.SET_PREF --es key … --es value …`); fallback `run-as` + edit the XML with the app stopped |
| `mock` / `assertRequested` | NetworkLens control queue + trace | Same — NetworkLens Android is byte-compatible (`PackGoldenTest`, `TraceGoldenTest`) |
| `typeSecret` | Keychain → `type` | Same server side |
| `wait`, `manual`, `run` | server only | unchanged |

## 5. Server changes (`tools/test-forge-server`)

One server, both platforms — the NetworkLens rule (`lib/android.js`: nothing Android runs unless asked).

- **`lib/platform/`**: a small interface the iOS code already implies — `devices()`, `testDevice()`, `boot/shutdown/erase`,
  `install(app)`, `launch/terminate`, `openUrl`, `setPreference`, `screenshot`, `recordVideo`, `appContainer`. `ios.js`
  wraps today's simctl code unchanged; `android.js` implements it with adb + `emulator` + `avdmanager`.
- **Test device = emulator or phone:** the D-120 test device gains `platform`. The Android "QA clone" is a dedicated
  AVD (`TestForge · Pixel 7 · API 34`) made from a chosen system image, so the developer's own emulator is left alone —
  the same rule as iOS. `ANDROID_SERIAL` pins adb to it (adb refuses to guess with two devices: keep that).
- **Runner lifecycle:** `lib/android-harness.js` — `adb reverse`, install the driver APK if missing or older,
  `am instrument …` in the background, health = the queue's `lastPolledAt`, stop = `am force-stop com.blibli.test-forge-driver`.
  Idle stop stays inside the runner (30 min).
- **Build:** Gradle on the QA copy — `./gradlew :app:assembleTestForgeDebug` (flavor per §9) with `ANDROID_HOME`/JDK from
  the environment; Install = `adb install -r`. "Build for testing" asks first, exactly as on iOS.
- **Proof:** screenshots pulled into the Test Batch folder as they arrive; video via `adb shell screenrecord`
  (180 s cap per file — chained, then the existing `trimToLast` cut keeps the last 60 s).
- **Readiness for Android:** `adb` found · emulator/phone chosen and booted · app installed · driver APK installed
  and current · `adb reverse` set for 8788 and 8789 · runner polling · NetworkLens polling (`isIdentified` by serial,
  as D-130 does by UDID) · disk · Claude. Same rows, same fix buttons where a fix exists.

## 6. Mac app changes (`tools/mac-app`)

- **Device picker** lists simulators and emulators/phones with a platform badge; tests run on the chosen one.
- **Simulator screen → Device screen:** the same cards backed by the platform interface — boot/shutdown (emulator),
  relaunch/kill, open link, saved settings (SharedPreferences), reset permissions (`pm reset-permissions`),
  erase (`pm clear` for the app; wipe-data for the AVD, confirm), **Show layout bounds** / **GPU overdraw**
  (`setprop debug.layout` / `debug.hwui.overdraw`) as the Color Blended Layers counterpart.
- **Measure:** screenshot via `adb exec-out screencap -p`, elements from `dumpWindowHierarchy` bounds ÷ density.
  The pixel-found container pass (D-091) and spacing scale (D-123) work on any screenshot unchanged.
- **Arrange / step outline:** the emulator is a Mac window too (`qemu-system-…`, "Android Emulator - <AVD>"). iOS
  Arrange uses the Simulator's own Window › Full Screen Tile › Right of Screen menu (D-140, D-141); the emulator needs the same check — if it
  has no such item, Arrange falls back to side by side (D-137); the step outline maps dp to the window's device area the way it maps points today.
  Physical phones get neither (no window) — said on screen, not hidden.
- **Network, Tests, Results, Reports, Claude:** no change; they read the server.

## 7. Verifying parity

- **Protocol golden tests:** one JSON file of commands against a tiny fixture app (one screen per command family:
  ids, labels, list, alert, keyboard, scroll). The iOS runner and the Android runner must return the same result
  shapes; the dashboard's `node:test` suite checks the server reads both.
- **Pilot cases:** port the Flash Sale cases already proven on iOS (SF-001, SF-006, SF-024 — tap, tabs, carousel +
  mock) once their elements are mapped. Each must PASS on an Android emulator with the same macro file.
- **Mark Verified** only after a run on a real emulator, per the docs rule.

## 8. Phases

| Phase | Scope | Done when |
|---|---|---|
| **A0** | Answers to §9; Android repo access; a QA build variant with NetworkLens and `testTagsAsResourceId` | Decisions recorded as D-entries |
| **A1** | `qadriver-android` runner: all 20 kinds, queue client, idle stop, screenshots to device storage | Golden protocol tests pass on an emulator |
| **A2** | Server platform interface + Android device, harness, build, readiness | Get ready green for an emulator; runner polls 8789 |
| **A3** | Registry `android` locators, `platforms`, host steps (prefs receiver, deeplink, relaunch) | One macro replays on both platforms |
| **A4** | Mac app: device picker, Device screen, Measure, Arrange for emulators | Same screens usable with an emulator chosen |
| **A5** | NetworkLens console parity checks on Android (phase E of `networklens-console.md`: scenarios, breakpoints, replay, trackers) | Console verified against the Android app |
| **A6** | Pilot: SF-001/006/024 on Android, report + proof | Three PASS on an emulator, from the same macros |

A1 and A2 can run in parallel once A0 is answered; A3 needs both.

## 9. Open questions for the Android team

1. **Repo and build:** where the Blibli Android app lives, its build variants, and which one QA should test (needs
   NetworkLens and a debug-only prefs receiver; release-signed is fine for the driver itself).
2. **UI toolkit mix:** share of Compose vs Views on the target screens (Flash Sale first). Compose needs
   `testTagsAsResourceId = true` at the root, once.
3. **Identifier convention:** adopt the iOS identifier names for the same controls (one registry entry for both),
   or keep Android's own and map them? Shared names make every recorded case cross-platform for free.
4. **NetworkLens Android in the app:** is the port integrated in the Blibli Android app, and on which branch?
   Phase D verbs (breakpoints, replay, bubble, scenario removal) exist only in the iOS QA fork so far.
5. **Devices:** emulators only for the MVP, or physical phones too? (`adb reverse` makes phones possible; Arrange and
   the outline don't apply to them.)
6. **Where `qadriver-android` is published:** next to `TestForgeDriverKit` in the shared tools repo, or the Android repo.
7. **Login and saved passwords:** iOS QA clones inherit AutoFill; Android emulators start empty. Use `typeSecret`
   from the Keychain (already supported), or a debug login shortcut in the QA build?

## 10. What carries over with no work

Macros' steps and verdict logic, the run engine (`lib/macro-v2.js`), Test Batches and proof folders, results,
reports and comparisons, Claude runs and triage (they call the same driver tools), the Claude section, NetworkLens
files and the control queue, the Mac app's Tests / Results / Reports / Network / Claude screens, the welcome tour.
Everything Android-specific sits behind the platform interface and the runner.
