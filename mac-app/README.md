# TestForge for Mac (v4: R2 shell, R3a Tests, Scan, R3b Results + Reports, R3c menu bar, R3d Simulator bridge, R3e Advanced)

This is the native SwiftUI front end for the QA dashboard in `../server`. It starts the Node server itself, or connects to one that is already running, so you don't need a terminal. It reads all state from a single live stream, `/api/state/stream`. The design and phases are in `../server/docs/redesign-plan.md`.

## Build and open

```bash
cd mac-app
./scripts/make-app.sh          # → build/TestForge.app (release, ad-hoc signed)
# Signs with the identity in TEST_FORGE_SIGN_IDENTITY or ~/.test-forge/sign-identity (here: a local
# self-signed certificate), else ad-hoc. A stable identity keeps the Accessibility grant
# across rebuilds; an ad-hoc build needs it granted again after every rebuild. Don't use a revoked Apple
# certificate: macOS blocks the app as malware.
open "build/TestForge.app"
./scripts/make-dmg.sh          # → build/TestForge-<version>.dmg to share (D-132)
```

You can also open `Package.swift` in Xcode and run the `TestForge` scheme, or use `swift run` for a debug launch.

- **Needs:** macOS 14 or later, the Swift 5.10+ toolchain from Xcode, and Node for the server. `start.sh` finds Node the same way the web launcher does.
- **Location:** the app searches the folders above itself for `server/start.sh`. Installed anywhere else (from the DMG), it shows **Setup** first: choose your blibli-testforge clone and your BlibliIOSApp clone, fix any red tool check, **Continue** (the app reopens on them). Settings › Project › **Change checkout…** switches the TestForge checkout later.

## What R2 does

| Area | Behaviour |
|---|---|
| Server | If the port already answers, the app connects to that server and never stops it. Otherwise it runs `start.sh`, with the output going to `.data/dashboard.log`, and waits for the server to answer. |
| Server stops on its own | The **Start the QA server** row turns red and shows a **Restart server** button. Server › Restart Server does the same. |
| Quitting the app | The app stops a server it started, except when a test is in progress. A server mid-test keeps running, and reopening the app reconnects to it and takes it back (`.data/app-server.json`), so the next idle quit still stops it. |
| Live updates | One SSE connection gets a snapshot, then patches. If it drops, the app reconnects automatically with backoff (1–10 s), and the toolbar pill offers **Reconnect**. |
| Get ready | Shows the server, live-update and readiness checks in plain words, with overall progress. Checks the server reused because nothing they depend on changed say "unchanged since …". Fixes that change something ask for confirmation first. **Prepare code…** and **Run queue…** sit above the checks (D-199); test logins are in Settings › Logins, and a run that needs a person opens a sheet over any section. |
| Setup (D-132) | Shown instead of the TestForge when no repo is found (a DMG install): choose the repo, see Xcode / Node.js 18+ / Claude Code / Claude sign-in, each red one with a fix (**Sign in** opens Terminal once for `claude auth login`), then **Continue**. |
| Welcome tour (D-134) | Opens once on the first TestForge launch (after Setup): why the app exists, how its parts fit, a six-step workflow (each step marked **Needs Claude ✓/✗**) and the gains for **QA** or **Developer**, what it never does, and Start buttons (Get ready, demo run, Claude, screen tips). Help › Welcome to TestForge or ? › Welcome tour reopens it; screen tips wait until it closes. |
| Claude (D-133, ⌘0) | The app's own Claude session in the repo, opened when the server is up and resumed across restarts: conversation, approval cards (Approve / Always allow / Deny), question cards, message box (⌘↩, optional phone **Screenshot**), **Stop**, **New conversation**. A switcher shows every run / triage session too (waiting on you first), **Details** opens each tool call and result in full, quick replies and the message box steer any session (a closed one is reopened), and a badge + notification flag any approval or question (D-147). |
| Remote Control (D-150) | Claude section header: **Remote Control** (status dot) → panel with Turn on / off, same folder or own worktree per session, and when connected a QR code, **Open session** and **Copy link** — drive QA from the Claude mobile app (Code → session) or claude.ai/code. |
| Claude usage bar (D-149) | Bottom of the window, like the CLI status line: model, ctx %, hr and wk used/elapsed with time to reset (amber ahead of time, red ≥ 90 %), the signed-in account and Remote Control on/off. View › Show Claude Usage (⌥⌘U). **Connect Claude Code status line…** (asks first) makes it follow your CLI live. |
| Console | Shows the server log and the app's own lines. You can filter by All · Server · App, search, copy and clear it. Toggle it with ⌘⇧Y. |
| Tests (R3a) | The loaded test document with search (toolbar) and a Show filter (All · Recorded · Failed last · Never run). A case shows its precondition, steps, expected result and last run. **Replay** runs its recording without Claude; **Run with Claude…** asks first, since it uses your Claude plan. The right pane shows the live steps of the running (else newest) run, with **Stop**. The ⤓ button loads another document (Confluence link or file path). |
| Scan (D-086) | Watches the simulator while you navigate it by hand: what is on screen now (elements, identifiers, a warning when only the top was read), a name field with **Mark** and **Skip**, and the screens marked so far. **Stop scan** saves the map; the idle view shows the last scan with **Show in Finder**. Tests can't run during a scan. |
| Results (R3b) | Every kept batch run with its counts and review progress. A run shows what was tested (code, simulator, server, time) and its cases; a case shows its verdict history, proof screenshots (click to open), the fake data that answered, Claude's notes and steps. Review each case with **Accept**, **Override…** (PASS or FAIL plus a reason, which goes in the report) or **Needs re-run**; the run turns **Validated** when every case is accepted or overridden. **Re-run failed…** asks first (cases without a recording use Claude). **Export report…** saves the Markdown report; **Copy report** copies it. |
| Reports (R3b) | History by branch. Pick a run and what to **Compare with** (Automatic = the newest earlier develop run sharing a case, else the run before); the table shows newly failing, fixed and unchanged cases. The report preview has **Export Markdown…**, **Copy report** and **Publish to my Confluence page…**, which asks first and only ever creates a page under your personal page. |
| Menu bar, notifications (R3c) | A menu-bar item shows what is running (batch progress, case, current step) with **Stop**, plus **Open TestForge** and **Quit**. When a run finishes you get a notification (click it to open Results) and the Dock badge shows the number of failing cases until you open Results or Tests. Both can be turned off in Settings › General. macOS asks once for notification permission. On a notched screen with many menu-bar items, macOS may hide the item behind the notch. |
| Simulator (R4d, ⌘7) | Control the phone without Xcode: pick the device (the QA one is preselected), Boot / Shut down / Show Simulator, **Color Blended Layers** switch, Relaunch / Kill the app or open a link, read / write / delete a saved setting (UserDefaults, then relaunch), Reset permissions, Reset keychain, Erase device (asks first). Locked while a test or scan runs; each button's command shows in the console. |
| Build (R4e, ⌘8) | Xcode work without opening Xcode: whether the QA app is built from the prepared code, **Install for testing** (one click to get the QA simulator ready for tests: builds first when needed — asks — then installs the QA app and test runner), **Build for testing…** (asks first; the log follows it here) and **Stop build**, the Xcode in use, **Open workspace in Xcode** (your own clone), **Install & launch** (no Xcode: pick **QA build** or **My Xcode build**, installs the newest built app on the device picked on the Simulator screen, else the QA simulator, and launches it), **Fix Swift package errors…** (after a package or plugin update: quits Xcode, deletes DerivedData and the Swift package caches, reopens the workspace; asks first), **Clean** QA build output, Xcode DerivedData or the Swift package caches (shows sizes, asks first), test runner **Stop**. Locked while a test or scan runs; each command shows in the console. |
| Tutorials (R4a, D-151) | Every screen has one — including Network and Claude — and each starts the first time you open it (short tips with **Next**, **Skip tutorial**, **Done**). The **Tutorial** (?) menu in the toolbar replays the ones for what is on screen; **Settings › Tutorials** shows each one's progress, replays it, turns automatic tutorials off, or resets all. **Demo run** (in the same menu and in Settings › Tutorials): about 3 minutes, no Claude — runs the recorded SF-001 and SF-006 beside the Simulator, then walks through Results and Reports; it won't start until Get ready is green. |
| Simulator tools (R3d) | Toolbar and **Simulator** menu (⌥⌘A Arrange, ⌥⌘O Outline Steps, ⌥⌘M Measure): **Arrange** (a labelled toggle: macOS Split View with the Simulator full screen on the right and this window on the left; asks which Simulator when several windows are open, test device first; press again to leave Split View; side by side on a macOS without Full Screen Tile — D-137…D-141), **Outline steps** (draws on the Simulator the element each replay tap or check acts on — adds about 2 s per such step, off by default), **Measure** (a window with the simulator screen; zoom 100–800 % with ⌘− ⌘= ⌘0, pinch, or ⌥ + scroll; click an element for its frame, spacing to neighbours and container and ancestor path, with a Copy button). After each capture a loader shows **Finding views without identifiers…**: Measure briefly turns on Color Blended Layers for the device (no focus change; your setting is put back), finds every layer's box and adds them as "View without id" elements — never pieces of text or icons: boxes that cut a line of text, and pieces, edge strips and specks of an icon, are dropped (D-143, D-145) — you can select and measure against (turn on **Views without IDs** in the toolbar to see their dashed borders; a colour picker next to it changes the border colour) (skipped while a test or scan uses the simulator). When the element sits in a card the app doesn't report (no accessibility identifier), Measure finds the card in the screenshot, draws its edges dashed purple, measures spacing to it and estimates its corner radius (≈); edges hidden under an overlay aren't claimed. The details list the element's inset inside **each parent** out to the screen; with an element selected, **point at** another element or empty space to see blue distance lines and a **Compared with** section (like Option-hover in Figma). Spacing is shown in whole points on the device pixel grid, halves rounding to the even number (16.5 → 16, 17.5 → 18); thin bars such as page indicators and tab underlines can be selected too. All three need **Accessibility** permission (System Settings › Privacy & Security › Accessibility › TestForge). Constraint constants are not available. **Snapshot** (camera button) saves or copies the selected view with numbered notes burnt in; after saving, the sheet shows the file name and **Show in Finder** (D-124, D-146). |
| Advanced (R3e) | Three panels. **Fake data**: the **Fake data** switch (off = the app talks to the real servers), one row per rule with a checkbox and the **Answer** it gives (click a row to read that answer, body decoded), and the app's recent calls (click one for the server's response). **Turn NetworkLens on…** relaunches the app with NetworkLens on and asks first. **Recorded steps**: search by name, id or test case; the check line says whether every recording is valid; a recording shows its steps (⚠ = found by visible text only) and **Replay**. **Phone remote**: pick a command, fill its details (Send stays off until required ones are filled), press Send; the verdict, the raw answer and this session's history appear on the right. **Relaunch app** asks first. Commands wait while a test or scan holds the simulator. |
| Shortcuts | ⌘1–⌘6 switch sections; ⌘⇧Y toggles the console; ⌘R runs the selected case (replay if recorded, else asks to run with Claude); ⌘. stops the run. |
| Settings | Tabs: General · Project · Phone · Claude · Tutorials · Advanced. General has **Show in menu bar**, **Notify when a run finishes**, **Outline steps on the Simulator** and **Appearance** (System · Light · Dark); Project shows real data. |

## Troubleshooting

- **Columns clipped or the sidebar squeezed:** the window remembers its split sizes. Quit the app and run
  `defaults delete com.blibli.test-forge "NSSplitView Subview Frames main, SidebarNavigationSplitView"`.
  The window needs at least 1 240 pt (macOS 26 insets the content by the sidebar).

## Configuration

| Variable | Default | Use |
|---|---|---|
| `TEST_FORGE_SERVER_DIR` | found by searching the folders above the app | The `server/` folder to run |
| `TEST_FORGE_PROJECT_DIR` | the app clone chosen in Setup | The app under test: the `BlibliMobile-iOS` folder with the `.xcworkspace`. Passed to the server |
| `TEST_FORGE_SERVER_PORT` | `4545` | The port to look for, or to start the server on |

To try the app without touching the live server, run a copy of the dashboard on another port:

```bash
TEST_FORGE_SERVER_DIR=/path/to/copy TEST_FORGE_SERVER_PORT=4646 "build/TestForge.app/Contents/MacOS/TestForge"
```

## Code layout

`Sources/TestForge/` is organised as:

- `App/`: entry point, menu commands, `TestForgeOpening` (the factory), `TestForgeViewModel` (the page) and constants.
- `Server/`: `ServerSupervisor` and `ReadinessFixService`.
- `State/`: `StateStreamClient` (SSE), `StateStore` (the single source of truth) and the models.
- `GetReady/`, `Tests/`, `Console/`, `Settings/`, `Views/`: one view per file; each section has its own view model.
- `Scan/`: scan mode views, view model and mapper.
- `Activity/`: run activity (menu bar, finish notice, Dock badge).
- `Simulator/`: Accessibility bridge, Arrange, step outline panel. `Measure/`: the Measure window and its maths.
- `Results/`, `Reports/`: R3b screens; `ResultsFormatting` holds the wording both share.
- `Server/DashboardClient.swift` (POST + `{error}` decoding), `TestCaseService.swift`, `ScanService.swift`, `ResultsService.swift`.

Lint with the iOS app's config: `../swiftlint/swiftlint lint --config ../../BlibliMobile-iOS/.swiftlint.yml Sources`.

## App icon

`swift scripts/make-icon.swift Assets/AppIcon-1024.png` redraws the icon; `make-app.sh` builds `AppIcon.icns` from it.
