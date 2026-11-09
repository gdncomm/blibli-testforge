# TestForge server

The **QA server** behind the **TestForge** Mac app (`../mac-app`): TestForgeDriver runs, macro replays,
NetworkLens mocking, Claude sessions and test cases from Confluence. The Mac app starts it and is its only UI;
`test-forge` (`scripts/test-forge.mjs`) and Claude Code skills talk to the same HTTP API. The browser UI was removed in D-199.

> **Status:** POC tooling. Localhost only — binds `127.0.0.1`. One live state stream (`/api/state/stream`, D-077).

| Doc | Read it for |
|---|---|
| [`docs/usage.md`](docs/usage.md) | **how to use it** — step-by-step guide for QA and developers (v3, ✅ / 🚧 marked) |
| [`docs/redesign-plan.md`](docs/redesign-plan.md) | **v4 redesign:** native Mac app (mockup C), approved recommendations, phases R0–R4 (D-075; design only) |
| [`docs/tutorials.md`](docs/tutorials.md) | v4 tutorial scripts per feature + demo run (R0, D-076) |
| [`docs/walkthrough-v4.md`](docs/walkthrough-v4.md) | v4 design gate: tasks and observation sheet (R0) |
| [`docs/workflow-plan.md`](docs/workflow-plan.md) | v3 guided-workflow design spec (signed off, D-039; P1 built) |
| [`docs/walkthrough.md`](docs/walkthrough.md) | Walkthrough kit for the design sign-off gate (tasks, script, observation sheet) |
| [`docs/feasibility-macros.md`](docs/feasibility-macros.md) | Feasibility study: TestForgeDriver macros with element IDs + prompt section |
| [`docs/context-resumption.md`](docs/context-resumption.md) | current state, hard constraints, next steps — **start here in a new session** |
| [`docs/design.md`](docs/design.md) | architecture, ports, routes, file map |
| [`docs/decision.md`](docs/decision.md) | why things are the way they are (append-only log) |
| [`docs/progress.md`](docs/progress.md) | what is built vs. verified, open items |

---

## Quick start

Open **TestForge** (`tools/mac-app`, build with `./scripts/make-app.sh`). It runs `start.sh`, which
installs `node_modules` on first run and starts `node server.js` on port 4545. Without the app:
`tools/test-forge-server/start.sh` (then drive it with `test-forge` or Claude Code).

Needs Node 22+ and `python3`.

### First-time setup

1. `cp tools/test-forge-server/.env.local.example tools/test-forge-server/.env.local` and fill in what you need
   (autonomous flag — see below). Confluence needs no token: loads go through Claude and your
   Atlassian connector.
2. In TestForge, follow **Get Ready** until green: **Prepare code…** picks the branch or working copy,
   then build and install for testing.
3. Test logins (Keychain) and the Outlook OTP link are in **Settings › Logins**.
4. **Get Ready › Git…** fetches, fast-forwards and switches your own working copy (D-200). It never forces or
   resets; uncommitted work stops a switch unless you choose **Stash and switch**, and **Restore stash** brings it
   back. A branch without TestForge (e.g. `develop`) can't be switched to here; use Prepare code to test it.

### Regression on a new build (D-201)

1. Prepare code with the new branch or commit, then build and install for testing (Get Ready goes green).
2. Reports › Batches → choose the batch that passed → **Replay on this build**.
3. Every case of that batch with a recording replays with the driver only (no Claude) into a new Test Batch. Its
   header shows regressed / fixed / same against the original; End it for the report with the full comparison table.

Cases without a recording are left out and listed; run them with Claude once to record them. For one changed area
instead of a whole batch, Tests › Replay stale (D-188) replays only cases whose code changed.

### Where the old browser tabs went (D-199)

| Was in the browser | Now in TestForge |
|---|---|
| Test Cases › 1 · What code? | **Get Ready › Prepare code…** (also the Code prepared fix) |
| Queue | **Get Ready › Run queue…** (also the Simulator free fix) |
| Logins, Email OTP | **Settings › Logins** |
| Popups a run raises (tap a system popup, type an OTP) | A sheet over the main window, whichever section is showing |
| Sessions, Mocking, Driver Console, Macros, Test Cases | Claude, Network, Advanced, Scan, Tests sections |
| Home › Saved setups, Projects | Removed; the `/api/setups` and `/api/projects` routes remain for scripts |

The HTTP API is listed in [`docs/design.md`](docs/design.md#http-api).

---

## Configuration

`start.sh` sources `.env.local` (gitignored), then applies these defaults.

| Variable | Default | Purpose |
|---|---|---|
| `TEST_FORGE_HOME` | `~/.test-forge` | QA copies (`checkouts/`) and `state.json` |
| `TEST_FORGE_DRIVER_PORT` | `8789` | port the dashboard hosts the TestForgeDriver queue on |
| `TEST_FORGE_SERVER_PORT` | `4545` | dashboard port |
| `NETWORKLENS_BUNDLE_ID` | `com.blibli.mobile` | app whose container holds `session.json` / `trace.ndjson` |
| `NETWORKLENS_CONTROL_PORT` | `8788` | live mock-control queue (hosted by the dashboard) |
| `TEST_FORGE_GRAPH_CLIENT_ID` | Microsoft Graph command-line tools client | app used for the Outlook OTP sign-in (D-048); set it if IT issues a dedicated registration |
| `TEST_FORGE_GRAPH_TENANT` | `organizations` | Microsoft tenant for that sign-in |
| `TEST_FORGE_OTP_SENDER` | `noreply@bliblitiket.com` | only mail from this sender is read for OTPs |
| `TEST_FORGE_DRIVER_URL` | `http://127.0.0.1:8789` | TestForgeDriver queue the dashboard posts commands to |
| `TEST_FORGE_PROJECT_DIR` | `../../BlibliMobile-iOS` | Xcode project dir; `cwd` for `claude`, `xcodebuild`, `harness.py` |
| `TEST_FORGE_BUILD_IGNORED_PATHS` | `tools/**,**/.claude/**,BlibliMobile-iOS/BlibliMobile_XCUITest/**/*.json,BlibliMobile-iOS/BlibliMobile_XCUITest/**/*.md` | Comma-separated git globs whose changes leave the QA build current (D-069) |
| `TEST_FORGE_SCHEME` | `BlibliMobile-iOS-PerfTest` | scheme the driver runs on |
| `TEST_FORGE_CONFIGURATION` | `PerformanceTest` | its build configuration |
| `TEST_FORGE_UITEST_TARGET` | `BlibliMobile_XCUITest` | UI test target; macro search root |
| `TEST_FORGE_UITEST_ROOT` | `$TEST_FORGE_PROJECT_DIR/$TEST_FORGE_UITEST_TARGET` | where `/test-forge-macro` saves macros |
| `TEST_FORGE_HARNESS_SCRIPT` / `TEST_FORGE_MACRO_SCRIPT` | auto-discovered | test-flow-recorder `harness.py` / `macro_cli.py` |
| `CONFLUENCE_EMAIL` / `CONFLUENCE_TOKEN` | — | optional REST fast path for Confluence loads; without them loads go through Claude |
| `TEST_FORGE_LOADER_MODEL` | `haiku` | model for the Claude-driven Confluence load (it only fetches, never writes) |
| `TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE` | `0` | `1` adds `--dangerously-skip-permissions` to ▶ Run |
| `TEST_FORGE_GENERAL_CONCURRENCY` | `3` | general-lane tasks running at once |
| `TEST_FORGE_PROJECT_ROOTS` | `~/Projects` | `:`-separated roots scanned (2 levels) for git repos |

### Headless runs and permissions

`claude -p` cannot answer permission prompts. With `TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE=0`, a ▶ Run stops at
the first tool not allowlisted in `BlibliMobile-iOS/.claude/settings.json`. With `1`, `/test-forge-run`
runs every tool unprompted — set it only in your own `.env.local`. Each ▶ Run consumes Claude
usage; ⚡ Replay does not.

## Test setup is automatic

A macro states what it needs, e.g. `"requires": {"environment": "uatb", "session": "loggedIn"}`. The setup is applied before the test runs:

- the environment is switched only if it is wrong;
- NetworkLens is turned on whenever the macro mocks;
- the app is logged in or out only if needed.

On the Test Cases tab, the macro is found through its `links.testCase`; there is nothing to pick. Only one test runs at a time, and a second click is refused until the first finishes. Queue → **Clear finished** tidies the list.

## QA simulator and QA build

QA runs use their own simulator, **TestForge · <model>**. It is cloned from the one you test with, so the app and the saved passwords come along. They also use their own build of the code prepared in Question 1, under `~/.test-forge/`.

The setup banner offers each step with a confirm:

- **Create QA simulator**
- **Shut down the others**: QA runs need the QA simulator alone.
- **Build the app**: 10–25 min the first time; may need the VPN.
- **Start harness**

When the prepared code changes, the build is out of date and runs are blocked until you rebuild. Changes that never go into the app don't count (D-069): `tools/` (the dashboard itself), and the macros, element registry and mock packs (the JSON under `BlibliMobile_XCUITest/`), and the run notes Claude writes there (`*-notes.md`, D-198). The Code prepared warning names the first app file that changed. So learning or repairing a macro never forces a rebuild (`TEST_FORGE_BUILD_IGNORED_PATHS`). **Test the installed app anyway…** needs a reason, and runs are then stamped UNVERIFIED BUILD.

Each build:
- stops the runner first;
- re-checks out a Swift package whose cached checkout is on another revision than `Package.resolved`;
- builds once more with a cleared package cache if SwiftPM's cache is broken (D-066).

## Tests are disabled?

The setup banner on Test Cases and Macros shows the checklist (**Checklist** expands every item; ⚠ items are notes and don't block). ▶ Run also needs Claude signed in, while ⚡ Replay doesn't. Run and Replay stay disabled until the setup is ready:

- a simulator is booted;
- the app is installed;
- the test bundle is built;
- the harness answers.

The banner on Test Cases and on Macros lists what is missing and has a button for each fix: **Build test bundle**, **Start harness**, or **Re-check**. A runner that only stopped answering doesn't disable anything: the next test restarts it (D-066).

## Results and Reports (Mac app)

The Mac app's **Results** section (⌘4) lists every kept run; review each case there (Accept,
Override with a reason, Needs re-run), re-run failures, and export or copy the Markdown report.
**Reports** (⌘5) shows history by branch and compares a run with any other run (newly failing,
fixed, unchanged): `GET /api/results/:id/compare?with=<runId>`. Publishing to Confluence asks first
and only creates a page under the personal page.

## Menu bar, notifications, Dock badge (Mac app)

The Mac app adds a menu-bar item showing what is running (batch progress, case, current step) with
**Stop**. When a run finishes it posts a notification (click opens Results) and the Dock badge shows
the failing-case count until you open Results or Tests. It reads the existing `results` and
`narration` slices; no new endpoint. Toggle both in Settings › General.

## Simulator tools (Mac app)

**Outline steps** and **Measure** read the Simulator through the Accessibility API (one permission).
Server side: `GET /api/device/screen` (device size in points), `GET /api/device/screenshot.jpg`, and
`POST /api/overlay {on}` — while a Mac app renews that lease, replay steps that act on an element carry its
`frame` in the `narration` slice (about 2 s extra per such step). Measure also finds cards the app doesn't report
(no accessibility identifier) in the screenshot pixels, measures spacing to them and estimates their corner radius.
It lists the inset inside every parent out to the screen, and hovering another element shows the distance to it.
Spacing is whole points on the device pixel grid (halves to even); thin bars (page indicators, underlines) are selectable.
Dashed borders for views without identifiers are off by default (toolbar **Views without IDs**, with a colour picker).

The Mac app has built-in tutorials (R4a): each screen explains itself on first use; replay from the toolbar's
Tutorial menu or Settings › Tutorials. The same menu has a 3-minute **Demo run** (recorded SF-001 + SF-006, no
Claude, then Results and Reports). Sidebar › **Simulator** (⌘7) controls the phone: devices, Color Blended Layers, app
relaunch/kill, saved settings, permission/keychain reset and erase. Sidebar › **Build** (⌘8) runs the Xcode work:
Install for testing (build if needed, then install the QA app + test runner), Build for testing (asks first, live log), Stop, Xcode version, Open workspace, Install & launch last build (simctl, no Xcode), Fix Swift
package errors (quit Xcode, clear DerivedData + SwiftPM caches, reopen), Free space and reset, test runner Start/Stop. Xcode must be installed but never needs to be open.

**Proof folder and Test Batches** (before any test): choose a proof folder once (toolbar pill › Choose proof
folder…, or Get ready's row), then start a **Test Batch** named after what you test (a ticket, build or feature).
Tests and macros can't start without both. Everything you start while the batch is active — runs, replays, Claude
runs, Claude chats, scans — is collected in it, and its screenshots/videos land in `<proof folder>/<date>_<name>/`.
End Test Batch writes `report.md` into that folder. Runs also save a video there automatically when a screenshot can't prove the case — its words mention motion or timing (countdown, scroll, sticky, appears automatically…). A replay is filmed only over the case's own action, from the check just before it to the last check; a longer clip is cut to its last 60 s (ffmpeg, when installed); a Claude run is told when to film itself (`recordVideo` "auto"; `true` records the whole run, `false` none) — shown as "Video proof" in Results (~1.7 MB/s). The proof folder can only change when no batch is active.

**Free space and reset** (Build; D-214 merged the old Clean section into it): one list with sizes — QA build output,
old QA copies, test runner screenshots and proof screenshots/videos are ticked; run history, Xcode DerivedData, the
Swift package cache and Swift package settings are optional. Each row's **Delete…** removes just that row after a
confirm; **Reset selected** deletes the ticked rows together (the test runner is stopped first when needed); the log
streams below. The test runner's own screenshots (XCTest Attachments on the QA simulator) are never used for proof —
the server also empties them a few seconds after each finished test once nothing else is testing.
Your repo is shown for information only — no git command runs, uncommitted work is never touched. After deleting
QA build output, the next run needs Install for testing. Refused while a test, scan or build is running.
After each capture it also runs a short background pass with **Color Blended Layers** switched on (through
CoreSimulator, no focus change, state restored) and adds every layer box it finds as a dashed purple element.

## Deeplinks (Mac app › Simulator)

The **Deeplinks** card builds a link from the app's own route list (`DeeplinkList.txt`): type in **Find a screen**, click a
match listed under it (Change screen starts over), fill its blanks, add **query parameters** (name = value rows, encoded for
you, shown as the full link; the list button offers `androidMinVersion` / `iosminversion` and the # button a version
around the installed build, in each key's format) (`{value}`, optional `{rest}`), or type any `blibli://` link. It says which route would catch the link, then
**Open in app** sends it to the running app on the test simulator — no relaunch; the screen opens over the current one
and Back returns there. Disabled while a test or scan holds the phone. **Save** keeps a link; saved links and the last
opens can be re-opened in one click. `https://www.blibli.com/…` links work too — they're universal links, so the
simulator hands them to the app (no Safari, no prompt). A UAT-B link (`https://wwwuatb.gdn-app.com/…`) opens as
`blibli://…` with the same path, shown as "Opens as …". Other `https://` hosts are refused (they'd open Safari).
If iOS asks "Open in “Blibli”?", the harness taps Open when it's running.
From a terminal or Remote Control: `scripts/test-forge.mjs link routes cart`, `link match <url>`, `link open <url>`.

## Run bundles: hand a run to the next person (D-162)

The person who runs a document first pays for Claude; everyone after replays it for free.

- **Export:** Results › pick a run › **Export bundle…** saves one `*.test-forge-bundle.json`: the cases, the recordings
  (macros and the routines they use), the elements they tap, the mocks they arm (redacted), the code it tested, the
  verdicts and a small proof picture per case. Later runs of the same code fill in cases they finished.
- **Import:** Results › **Import bundle…** shows what it adds and whether your prepared code is the code it tested,
  then **Import** (keeps your own copies where they differ) or **Replace mine and import**. If the bundle is from the
  document already loaded, its missing cases are added and the rest stay as they are (D-181). A bundle from another
  document, or with nothing loaded, loads as the test document.
- **Replay:** **Replay N case(s) without Claude** — driver only, a failure is reported and never sent to Claude. Each
  case row shows "Bundle said PASS"; the header says how many agree. Cases without a recording (blocked, undecided)
  are left for a person or a Claude run.
- **Mocked responses per case:** the sheet lists which mock variant each case ran with (e.g. "21 → mt-anchor").
  Recorded cases switch theirs on when replayed; for the rest, **Set up mocks** switches them on so you can test by
  hand. Runs record the variant from D-163 on; older runs read it back from the NetworkLens trace while it still
  has them.
- Prepare the bundle's branch first (Test Cases › 1 · What code?). A bundle made from uncommitted changes says so.
- Terminal: `test-forge bundle export latest ~/Desktop/run.test-forge-bundle.json`, `test-forge bundle import <file> [--overwrite]`,
  `test-forge bundle replay <bundleId> [case…]`, `test-forge bundle compare <bundleId>`, `test-forge bundle list`,
  `test-forge bundle mocks <bundleId>`, `test-forge bundle arm <bundleId> <case>`.

## Export the whole session (D-173)

**Tests › Export session…** (the share icon beside the document title) saves one `.zip` for the loaded document:

- `session.json` — every case with its scenario, precondition, steps, expected result, API, local edit, linked
  recording, its latest verdict (as Tests shows it; a reviewer's override wins), every run of it (when, verdict,
  replay or Claude, duration, cost, model, branch/code, steps) and its batch reviews, plus document, code and summary.
- `report.md` — one table: case, scenario, verdict, how it ran, when, recording, media links.
- **Include screenshots and videos** (optional; the sheet shows how many files and MB) copies each case's latest proof
  and its demo videos into `media/<case>/`, linked from both files. Files no longer on disk are skipped and counted.

API: `GET /api/session/export` (what it would hold), `POST /api/session/export {path, includeMedia}`.

The **Test Cases** list and the live steps inspector are resizable: drag either divider. Hover a case for its full title.

## Split View and desktops (D-208, D-209)

To give the Simulator more room, hide the sidebar, the test list (Tests › **Test list**, ⌥⌘L) and Live steps; the
TestForge window can then shrink to 480 pt. When the list is narrow, its buttons show icons only (hover for what each
does).

The overlay over the Simulator follows you to every desktop, so putting the TestForge and the Simulator side by side in
Split View no longer makes macOS jump to another desktop during a replay. If it still jumps, check System Settings ›
Desktop & Dock › "When switching to an application, switch to a Space with open windows for the application" — with it
on, anything that brings the Simulator forward (Show Simulator, a test runner starting) goes to the desktop holding a
Simulator window.

## Start screens and the busy banner (D-185, D-186)

Every recording states where it starts (`requires.startScreen`: `home`, `anyScreen` for cases that open their page by
deeplink, `freshLaunch`). A replay brings the app there first, then runs the steps; Tests shows "Starts on … · Needs …".
While the phone is busy with setup or loading, Tests › live steps shows it under **System prep** (the current message
with a timer, then the earlier ones). A plain replay also shows it as a spinner banner over the Simulator (needs
Accessibility access for the TestForge, same as step outlines); a replay with explanations does not, so people watching
the explanation see only what the test checks (D-206). In an explained replay the subtitle is a rounded box placed next
to the element each step points at (below, above or beside, wherever it fits without covering it), with a small tail
and a dashed line from the tail to the element (D-207).

## Reopen a Test Batch (D-184)

Ended a Test Batch too early? Open the Test Batch pill in the toolbar › **Reopen Test Batch ▸** and pick it. It becomes
active again with its folder and everything already in it; a batch active at that moment is paused (D-212). Ending it
again rewrites its `report.md`. API: `POST /api/test-batches/:id/reopen`.

## Every click shows what it's doing (D-213)

A button that starts work shows a spinner and what it's doing ("Deleting…", "Starting…", "Saving…") on itself until it
finishes; a failure shows next to it. Sheets stay open while saving. If a button only greys out with nothing else, that's
a bug — report it.

## Pause a Test Batch to switch priorities (D-212)

Something urgent comes up mid-batch? Test Batch pill › **Pause Test Batch**. The batch keeps everything it holds but
collects nothing until you come back; proof goes to the proof folder root meanwhile. Then **Start another Test Batch…**
(the active one is paused, not ended) or **Resume Test Batch ▸** a paused one. Resuming pauses whatever is active at that
moment, so switching back and forth never ends a batch. Reports › Batches shows paused batches with an orange ⏸ and
**Resume** / **End** buttons; the start sheet lists them too. A paused batch can be ended (its report says how often it
was paused) but not removed. Pausing or resuming waits while a test or a run of several cases is going. Replay on this
build pauses the active batch too. API: `POST /api/test-batches/:id/pause`, `…/resume`, `POST /api/test-batches` with
`pauseActive: true`; CLI: `test-forge batch pause`, `test-forge batch resume ["<name>"]`.

## Proof under the selected case (D-183)

Select a case in Tests: its screenshots and videos from the active test batch show under its text. Screenshots zoom
(bar, ⌘+/⌘−, pinch, double-click) and pan; videos play with the bar under them. **Annotate** draws a pen line, arrow or
box in red, yellow or green (⌘Z undoes). **Save as copy** writes `<name>-annotated.png` beside the original; **Save…**
replaces the original after you confirm. Open in Preview / QuickTime or Show in Finder from the panel's header.

## Proof icons on Tests rows (D-182)

Once a case has run, icons after its id show the proof in the active test batch folder: 📷 + count = screenshots,
🎥 = screen recording, 👁 = evidence only (no pass/fail; check the screenshots yourself). Hover for details.

## Override a test result (D-180)

Tests › select a case › **Override result…** (⇧⌘O). Pick Pass / Fail / Blocked / Undecided and write why (required).
You can also correct the expected result and choose **Strict** or **Lenient** judging. **Save** records it;
**Save and rerun** also starts a Claude run that uses your expected result, leniency and comments. Every change is kept
(shown under "Earlier changes"), goes into exported bundles and session exports, and comes back on import. A newer run
replaces the shown result; your comments keep guiding later Claude runs.

API: `PUT /api/testcases/:id/result {verdict, reason, leniency, expected, rerun}`.

## Demo library (D-177)

Demos render at 1080 px wide in high quality (D-178). A demo made before 2 Nov 2026 is blurry (220×480); re-render it
with `"tools/mac-app/build/TestForge.app/Contents/MacOS/TestForge" --render-demo <demo folder>`.

**Reports › Demos** lists every demo video recorded with Tests › Record demo video, newest first: test name, case,
verdict and date. Click a demo (anywhere on its row) to open it on the right, paused; press the big ▶ (or Space) when ready. It plays in the macOS player (play/pause, drag the bar to seek, full screen).
Pick **English** or **Bahasa Indonesia** above the video; switching mid-play carries on from the same moment.
Hover the video and press **⤢** (bottom right) for full screen; **Esc** comes back. **Show in Finder** opens the video file. Empty? Record a demo first (Tests › Explain › Record demo video).

## Test session report (D-176)

**Reports › Session report** (⌘5, the default tab) shows the loaded document's report inside the app: summary and pass
rate, **Needs attention** (failed first, then blocked/undecided), the results table, then each case with its text, last
run's steps (✓/✗), run history and proof screenshots (click one to open it). **Refresh** rebuilds it from the latest runs.

- **Copy** — the Markdown, for chat or a PR.
- **Export › Markdown (.md)…** — images point at the proof files on this Mac. For a portable copy with the images
  inside, use Tests › Export session… (its `report.md` links `media/`).
- **Export › For Confluence (.html)…** — Confluence-ready HTML: open it in a browser, select all, paste into a page.
- **Publish to my Confluence page…** — after a confirm, a Claude session creates one new page under your personal
  page (2437316839) with the same HTML. Screenshots aren't uploaded; each case names its proof files. Production
  test-case and tech-doc pages are never touched.

API: `GET /api/session/report.md`, `GET /api/session/report.html`, `POST /api/session/publish`.

## Edit a test case (D-166)

When the document has a case wrong, select it in **Test Cases** and choose **Edit…** (⌘E). Change the scenario,
precondition, steps, expected result or API and Save.

- Runs, Claude, recordings and explanations on this Mac use your text. The test document itself is never changed —
  tell its owner so it gets fixed there too.
- Edited cases show a pencil in the list and an "Edited locally" notice; each edited field shows the document's text
  struck through underneath. **Revert to document…** drops your edits.
- Edits survive reloading the document. If the document later rewords a field you edited, the notice turns orange so
  you can check your edit still applies.
- Run bundles carry the edits; whoever imports the bundle sees the same notice.

## Explained replays and demo videos (D-164, D-165)

In **Test Cases**, pick a test with a recording and open **Explain**:

- **Write explanations with Claude…** — once per test; plain words in English and Bahasa Indonesia (about a minute).
- **Replay with explanations** — replays slowly with an opening card, a subtitle per step, a pointer on the element
  and the result, drawn over the Simulator. No Claude. Language: Settings › General › Explanation language.
- **Record demo video** — the same, filmed: `demo-en.mp4` / `demo-id.mp4` + `.vtt` in `<proof folder>/demos/`.

Check the overlay's drawing without a Simulator on screen:
`"TestForge.app/Contents/MacOS/TestForge" --preview-explain <demo folder> [en|id]`.

### Demo videos from the command line

A recorded demo explains itself: an opening card (what is checked, why it matters, how the page is set up),
subtitles for each step, a pointer on the exact element, "✓ As expected" on each check, and the result — in English
and Bahasa Indonesia. Share the MP4 on Teams or Jira, or with its `.vtt` subtitles on Confluence.

```bash
scripts/test-forge.mjs demo notes mc_MTA18NCHR4     # once per case: Claude writes the plain-words notes into the recording
scripts/test-forge.mjs demo record mc_MTA18NCHR4    # replays slowly, films it, renders demo-en.mp4 / demo-id.mp4 + .vtt
scripts/test-forge.mjs demo list                    # where the videos are (<proof folder>/demos/<case>-<time>/)
```

Recording a demo needs no Claude; the notes travel in bundles, so the next person records the same demo for free.
Re-render a folder after editing notes: `"TestForge.app/Contents/MacOS/TestForge" --render-demo <folder>`.

## When Claude's usage limit is reached

A case the limit stops is not marked failed: it goes back in the queue and the batch pauses with Claude's message
(e.g. "resets 11am"). After the reset press **Continue** — menu bar (Mac app), the web page, or `test-forge resume`.

## Model for Claude runs

**Run with Claude** asks which model to start on: **Auto** (default) scores the case — steps, mocked data, timing or
motion, screens crossed, and how earlier Claude runs of it went — and starts on Haiku, Sonnet or Opus; it moves up a
tier mid-run when the run gets stuck (three failed steps in a row, or 6 min on Haiku / 12 min on Sonnet). Or pick a
model yourself; a hand-picked model never changes. The live steps show the model and why; the run's history record
keeps the pick and any switches. API: `model` (`auto` | `haiku` | `sonnet` | `opus`) on `POST /api/testcases/:id/run` and
`POST /api/batch`; `TEST_FORGE_RUN_MODEL` sets the server default.

**Post to Jira (D-193):** a case's *Post to Jira…* fills the ticket from the test document and writes the result comment; you edit it and confirm before anything is posted.

**Real devices (D-197):** Simulator › *Real devices* lists iPhones paired with this Mac and, for the one you pick, what's missing before tests can run on it. Its **Use for tests** stays disabled until a device-signed QA build exists (D-213).

**Verify my changes (D-196):** Tests › *Verify my changes…* (or `/verify` / `test-forge verify` in Claude Code) picks the loaded cases whose recordings cover the code your branch changes and hands them to the Run-all plan.

**Edit steps (D-195):** Scan › a saved macro › *Edit steps…* reorders, removes and adjusts steps (wait, Skip if not there, typed text) and saves the macro file. Taps on elements without an accessibility ID are recorded by their position inside the nearest identified container; system alert taps become optional alert answers (D-194).

**Deeplinks and mocks (D-195):** a recorded case's detail lists the deeplinks it opens and the mocked JSON it arms, to copy or download.

**Prerequisites (D-190):** Get Ready checks tools, the test-flow-recorder plugin and the test-forge-driver / networklens / Atlassian MCP servers; *Show what's missing* lists the fix for each.

**Run all (D-191):** Tests › Run all… shows the batch plan (order, environment switches, anything that would stop it) before it starts.

**Reports › Batches (D-189):** every Test Batch with pass/fail counts and its report; End in the toolbar opens it there; Pause / Resume (D-212), Reopen, or Remove (folder and report stay on disk).

**Stale results (D-188):** every result records branch, commit and build number. When a newer build changes the code a case covers (its macro's `covers`, else its module folder), the Tests row shows a clock badge; **Replay stale (N)** in the Tests header re-runs those recordings without Claude (`POST /api/batch/stale`).

## Advanced (Mac app)

The Mac app's **Advanced** section (⌘6) has three panels. **Network Mocks**: the master switch, each NetworkLens rule
(on/off and which answer it gives, with the answer body decoded), and the app's recent calls with their response
bodies; **Turn NetworkLens on…** relaunches the app, so it asks first. **Recorded steps**: every saved recording,
searchable, with the check summary, its steps and **Replay**. **Simulator Driver**: any driver command as a small
form, its answer as a verdict plus JSON, and this session's history. Existing endpoints only.

## Network (Mac app, ⌘9)

The **Network** section is the NetworkLens console. The top strip says whether the app is connected (changes are live)
or not (they apply on its next launch), with the master **Mocks** switch. While any mock is on, an orange banner lists
them — with **All off** and **Reset to repo pack** — so a fake answer is never mistaken for a bug.

- **Traffic:** the app's calls, newest first. Filter by URL or **Mocked only**; pick one for its response, request,
  headers and curl. **Mock this call** turns its real response into a rule (loaded, empty, 500, slow, timeout).
- **Rules & scenarios:** turn rules on or off and pick the answer each gives (picking one turns the rule on). **Edit**
  an answer: status, delay, failure, body (checked as JSON), **Save as copy** to keep the original, **Delete**, and
  **Time-shift** — pick a time in the body and say how many seconds from now it should land; the others move with it.
  Save the current set of rules as a **scenario** and apply it later in one click. Deleting a scenario restarts the app
  (NetworkLens can't drop one while it runs).

## NetworkLens from a terminal: `test-forge-lens`

`scripts/test-forge-lens.mjs` drives NetworkLens through the running dashboard — no MCP needed. JSON out.

```bash
scripts/test-forge-lens.mjs state                                   # queue owner, is the app polling, rules + variants
scripts/test-forge-lens.mjs mocking on|off
scripts/test-forge-lens.mjs mock "GET /backend/content-api/flashsale" empty [--retime]
scripts/test-forge-lens.mjs off "GET /backend/content-api/flashsale"
scripts/test-forge-lens.mjs calls --grep flashsale --limit 10
scripts/test-forge-lens.mjs call 1BF04EE3 --curl                    # an id or its first characters
scripts/test-forge-lens.mjs mock-call 1BF04EE3                      # its real response becomes a rule
scripts/test-forge-lens.mjs trackers ENG1047-0001,ENG1015-0001       # fired / missing / payload problems (no ids = all)
scripts/test-forge-lens.mjs tracker ENG1047-0001 --contract c.json   # each fire with its payload, checked
scripts/test-forge-lens.mjs trackers-report ENG1047-0001 --out report.md   # the DA-format markdown page
scripts/test-forge-lens.mjs hold "GET /backend/content-api/flashsale" --once  # its next response waits (phase-D app build)
scripts/test-forge-lens.mjs breakpoints                               # what is held now, with ids
scripts/test-forge-lens.mjs release 1A2B… --status 500 --body '{}'     # continue edited  (or --fail offline)
scripts/test-forge-lens.mjs replay 1BF04EE3                          # send a captured request again from the app
scripts/test-forge-lens.mjs bubble hide                               # NetworkLens bubble out of a test's way
```

Breakpoints, replay and the bubble (D-130) work only while an app built with the phase-D NetworkLens is running; an
older build answers "this app build predates NetworkLens phase D". Commands go only to the test simulator's app.

Trackers (D-129) are also the **Trackers** tab in the Mac app's Network section. A contract is optional JSON:
`{ "ENG1047-0001": { "event": "view_promotion", "origin_screen": "retail-home", "required": ["items[].promotion_id"],
"expect": { "component": "USP" } } }`. Only the latest app launch counts unless `--all-sessions` / "All launches".

Changes are live when the app polls the dashboard's queue (port 8788), otherwise saved for the next launch — each
answer says which. `TestForge_DASHBOARD=http://host:4545` targets another dashboard.

## Test simulator (Mac app › Simulator)

Tests run on the **test simulator**: the "TestForge · " clone by default. On the Simulator screen, pick any simulator and press
**Use for tests** to run tests there instead (**Back to the QA clone** undoes it); the device in use shows **Used by
tests**. Every command names that device, so other simulators — e.g. another repo's — can stay booted. A newly chosen
device needs **Build › Install for testing** once. **Measure** works on whatever device the Simulator window shows, with
no test build or runner.

## Scan mode (Mac app)

The Mac app's **Scan** section (⌘3) watches the simulator while you navigate by hand: it shows what
is on screen now and lets you name and **Mark** each screen (mark again after scrolling to add the
rest of a long screen). The map is saved under `.data/scans/`. A scan holds the simulator, so tests
can't run until you stop it. API: `GET /api/scan`, `POST /api/scan/{start,mark,skip,stop}`.

**Record macro** (the default tab in Scan, D-171, D-174) has one button that reads **Start recording**, then
**End recording**:

1. **Start recording** and tap through the app in the Simulator. Every tap or swipe becomes a step, found on replay by
   the accessibility ID of what you tapped. A tap on something without an ID raises an orange banner and a macOS
   notification at once (replay falls back to its text, or asks a person when it has no text either). The left column
   shows the **Steps** (delete any you don't want) or the **Screens** reached; the right side the selected screen.
2. **End recording** opens **Save as macro** straight away: name it, link a test case, choose module/submodule and
   whether replay starts from a fresh launch. The sheet lists every tap without an ID first. Cancel leaves the
   recording waiting with **Save as macro…** and **Discard**; Start recording waits until you choose one.
3. After saving you land on **Saved macros**: every macro recorded in Scan, newest first, with the new one selected and
   a green "Saved" note. A row's icon is green when every tap has an ID, orange otherwise. The detail shows steps,
   linked case, how replay starts, ID coverage and the file, with **Replay** (driver only, no Claude) and **Show in
   Finder**.

The macro lands in `<UITestRoot>/<Module>/<Submodule>/macros/` (never overwriting another), reuses registry elements,
waits for each new screen and screenshots it; a linked case replays from Tests. Each recording starts fresh; the
screen map behind it is still saved as `~/.test-forge/flows/<time>/flow.json` + thumbnails. Needs only the
Accessibility permission — no harness, no app change, and it doesn't hold the simulator. Taps made by tests aren't
recorded (they aren't mouse clicks).
API: `GET /api/macros/v2/recorded` (the list), `POST /api/macros/v2/recorded {name, caseIds, module, submodule,
startFresh, gestures}`.

## Install from a DMG (Mac app)

Share `tools/mac-app/build/TestForge-<version>.dmg` (make it with `./scripts/make-dmg.sh`). The person:

1. Drags TestForge into Applications and opens it (first time: System Settings › Privacy & Security › Open Anyway —
   the app is not notarised).
2. **Setup** asks for their clone of this repo (any folder inside it) and checks Xcode, Node.js 18+, Claude Code and
   the Claude sign-in. **Sign in** opens Terminal once for `claude auth login`; everything else stays in the app.
3. **Continue** reopens the app on that repo: it starts the QA server and shows Get ready. To switch repos later:
   Settings › Project › Change repo….

## QA from your phone — Remote Control (Mac app › Claude)

**Claude › Remote Control › Turn on** starts Claude Code's Remote Control in this repo. Scan the QR code (or open the
Claude app › Code and pick "TestForge · <repo>") and drive QA from your phone: "status", "replay SF-001 and
SF-006", "mock the flash sale as empty and screenshot it", "anything waiting on me?". Claude works on this Mac through
`test-forge` (`tools/test-forge-server/scripts/test-forge.mjs`), `test-forge-lens` and the driver tools, following the `test-forge-remote`
skill. Approvals and questions come to your phone; pushing, building for testing and erasing a simulator always ask
first, and the production test-case page is never written. Pick **Own worktree per session** to keep parallel sessions
apart. It keeps running if the QA server restarts; **Turn off** stops it and its sessions.

## Claude usage bar (Mac app)

A thin bar along the bottom of the window shows the same figures as the Claude Code CLI status line — model, context
used, the 5-hour and weekly limits (used / time elapsed, time to reset) — plus the signed-in account and whether Remote
Control is on in your CLI sessions. **View › Show Claude Usage** (⌥⌘U) hides or shows it. To have it follow your CLI
live, click **Connect Claude Code status line…** once: it adds one marked line to your status-line script (it asks
first); delete that line to undo.

## Welcome tour (Mac app)

The first time the TestForge opens it shows a short tour: what the app is for, how its parts fit together, a
screen-by-screen workflow and the gains for **QA** or **Developer** (pick one; switch any time), the guard rails, and
where to start. Reopen it from Help › Welcome to TestForge or the ? menu › Welcome tour.

## Claude (Mac app, ⌘0)

The app's own Claude session in the chosen repo (`BlibliMobile-iOS`, with its CLAUDE.md, skills and your plugins). It
is ready as soon as the server is up and resumes the same conversation after the app or the server restarts. Approvals
and Claude's questions appear as cards in the conversation; **Stop** interrupts, **New conversation** starts fresh.
Tick **Screenshot** to attach the test phone's screen to a message. The web Sessions tab shows the same session.

Runs and triage have their own sessions: pick one from the switcher at the top left of Claude (a session waiting on
you is listed first), or press **Claude session** on a run's live steps in Tests. **Details** opens every tool call and
result in full. You can message any session — quick replies like "Investigate what went wrong and fix it" are one
click — and a finished or cancelled one picks up where it left off. When any session needs an approval or an answer,
Claude gets a badge in the sidebar and you get a notification that opens it.

## Android (planned)

The Android QA driver is specified in [`docs/android-driver-spec.md`](docs/android-driver-spec.md): the same
command protocol, macros, server and Mac app, with a UiAutomator runner in place of XCUITest. Not built yet.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Bundle import says "prepared X, the bundle tested Y" | Prepare the bundle's branch (Test Cases › 1 · What code?), rebuild if asked, then replay. It's a warning: replaying anyway tests your code with their recordings. |
| Bundle replay case fails where the bundle passed | Driver-only by design: no Claude triage. Check the failing step in Results; run that case with Claude yourself if the recording went stale (D-162). |
| Banner "Launch the app to pick this up" | App not polling the control queue (not running / NetworkLens off). The edit went to `session.json`; relaunch the app. |
| Banner "App is running but not reachable live yet" | Wait a few seconds, or quit the app before editing. |
| Live traffic empty | No booted simulator, NetworkLens off, or nothing captured yet. |
| "Link Outlook" fails with "admin approval required" / AADSTS65001 | The company tenant blocks user consent for `Mail.Read`. Ask IT to approve it, or for a dedicated app registration (`TEST_FORGE_GRAPH_CLIENT_ID`). Until then, prod OTPs come from the popup. |
| Prod run still shows the OTP popup with Outlook linked | No mail from `TEST_FORGE_OTP_SENDER` within 60 s (check Junk, or the sender address). Type it in the popup; the run carries on. |
| A change in `lib/` has no effect | Node caches modules: restart with `./start.sh`. |
| “no mock rule for … on the device or in the repo's mock pack” | The rule exists nowhere yet. Create it on the Mocking tab, then Macros tab → **💾 Save mocks to repo** and commit `TestForgeMacros/mocks/` (D-064). |
| A case shows “🔧 macro repaired” | Claude found the macro or an element stale and fixed it; the driver's replay after the fix decided the verdict. Review the listed files (`git diff BlibliMobile_XCUITest`) before committing (D-064). |
| Mocks aren't served / “NetworkLens isn't answering” | An environment switch turns NetworkLens off. Mocking tab → **Turn NetworkLens on** (relaunches the app). |
| A Claude run says a case was BLOCKED because "no test bundle built", or it uses `test-forge-mock` tools (deleted from the plugin, D-072) | The session loaded a stale cached copy of the `test-flow-recorder` plugin. Reinstall it from source: `claude plugin marketplace update test-flow-recorder-local`, then `claude plugin uninstall test-flow-recorder@test-flow-recorder-local` and `claude plugin install test-flow-recorder@test-flow-recorder-local` (D-071). |
| A learned macro's proving replay is BLOCKED with "… needs an identifier" | Only typing, scrolling, scroll-to-top and reading a *different* label off an element need an identifier; checking that a label-only element is shown (or gone) works by its label (D-071). Add an accessibility identifier in the app for the others. |
| Need a NetworkLens MCP change | Edit `NetworkLens/Tools/networklens-mcp/src` in the worktree `~/Projects/Tools/NetworkInterceptor-qa` (branch `darshan/innovation/test-forge-driver`), commit, tag `test-forge-driver-N`, push (no force-push: the repository refuses it — to move the branch onto a new upstream, rebase, tag, then merge the tag into the branch, D-065), then `scripts/sync-networklens.sh ~/Projects/Tools/NetworkInterceptor-qa` and re-pin the app's revision (D-050). |
| Harness "no test bundle built" | **Build test bundle**, then **Ensure**. |
| A replay is stuck at "Ask a person" | A system popup needs you: answer the dashboard popup (Done / It wasn't shown / Stop). It times out after 10 min. |
| `typeSecret` step: "couldn't type …" | Give your terminal app **Accessibility** permission (System Settings → Privacy & Security → Accessibility), and keep the Simulator's hardware keyboard connected. |
| "no login uatb/internal in the Keychain" | Add it in the rail's **Test logins** panel. Values go to your macOS Keychain, never to a file. Prod OTPs are always asked live. |
| Header "Testing: no QA copy" | Prepare code in **Test Cases → 1 · What code?**. Until then, Claude sessions open in the developer repo. |
| Harness "queue server unreachable at …:8789" | Harness not running → **Ensure**. |
| Driver command `timeout waiting for …` | Harness died; one automatic restart+retry already happened. **Tail logs**. |
| Checklist: "the runner isn't answering — the next test restarts it first" | Nothing to do: the next run or replay restarts the runner before step 1 and logs "↻ … restarting it" (D-066). If that restart fails, the case is BLOCKED; then **Ensure** and **Tail logs**. |
| A ▶ Run (Claude) drives the wrong simulator, or `/test-forge-run` preflight reports a device mismatch | Fixed in D-068: dashboard runs pass the QA simulator and build as flag settings, which outrank your `.claude/settings.local.json` `TEST_FORGE_DEVICE_UDID`. Restart the dashboard if it predates this. |
| Claude's own NetworkLens/test-forge-driver tools (not ▶ Run/Replay) target the wrong device, or a fresh clone's "Claude Code set up for this Mac" check never turns green | **Get ready**'s Fix writes your project folder, QA simulator and proof folder into `.claude/settings.local.json`'s `env` block (D-156) — kept out of git, seeded from the committed `.claude/settings.local.json.example`. Fix again after the QA simulator changes; `.claude/settings.json` itself should never carry personal values. |
| Claude Code: `networklens` MCP server "failed to connect" | `scripts/networklens/resolve-checkout.sh` found no NetworkInterceptor checkout. It looks at `$NETWORKINTERCEPTOR_PATH`, then Xcode's DerivedData for this workspace, then the TestForge build (`~/.test-forge/derived`), then a sibling clone. Build once (in Xcode or with the dashboard's QA build), then `/mcp` → reconnect. |
| Load: `Claude could not read Confluence page …` | Atlassian connector not connected in Claude (claude.ai → Settings → Connectors), or no access to the page. Transcript is in Run output. |
| Load: `Confluence answered HTTP 401/403` | Wrong email/token, or no access to that space. |
| Load: 0 cases | No table whose headers look like ID / Scenario / Steps / Expected. |
| Replay `BLOCKED (macro not resolved)` | No macro by that name (or it exists in two modules). Record with `/test-forge-macro record <name>`. |
| ▶ Run hangs silently | Permission prompt — see *Headless runs and permissions*. |
| Red bar "Dashboard server is not responding" | The server stopped. Run `start.sh` (or double-click the app); the page reconnects on its own. |
| "A case is already running" / "harness … already in progress" | One case and one harness action at a time — wait, or use **Cancel**. |
| Case badge `UNKNOWN` | The page lost the output stream; the run may have finished on the server — check History. |
| Port 4545 in use | `lsof -ti :4545 \| xargs kill` |
| Session stuck on "needs your approval" / "has a question" | Open it in Sessions and answer the card (Home and the tab title show the count). |
| Session "waiting for the device" | Another task holds the simulator — see the device rail / Queue. |
| Driver command → `device busy — … is driving it` | A queued run or a chat is using the simulator; wait or cancel it in Queue. |
| Build test bundle stops at "Validate plug-in …" | Fixed: the button passes `-skipPackagePluginValidation -skipMacroValidation`. Restart the dashboard if it predates that. |
| Rail: "Driver: runner not connected" | The queue is up but the XCUITest runner isn't polling — **Ensure** in Driver Console (needs a built test bundle). |
| Rail: "Driver queue: not running" | Nothing answers on `:8789` — restart the dashboard (it hosts the queue). |
| Prepare: "Can't reach GitHub — is the VPN on?" | Connect the VPN; the branch fetch and ↻ Check GitHub need it. |
| Prepare: "the code is already being prepared" | One prepare at a time — the page re-attaches to the running one. |
| A branch isn't in the list | Click **↻ Check GitHub** (lists branches straight from GitHub). A branch only on your Mac: use **A local repository**. |
| Disk filling up | QA copies live in `~/.test-forge/checkouts/` (≈ 0.7 GB GitHub copy, ≈ 0.35 GB local snapshot for this repo); delete a folder there to reclaim it. |

---

## Roadmap

**Dropped:** Jira and PR views (D-030) — they distracted from the TestForgeDriver-first goal.

**Done through P6 (D-064):** driver first, Claude only on an issue. A failed replay is triaged and
repaired by Claude, then replayed by the driver; a case Claude passes is saved as a macro. Macros,
references (`*.ref.json`) and mock packs (`TestForgeMacros/mocks/`) live in the repo.

**Next:** the v4 native Mac app redesign — `docs/redesign-plan.md` (D-075). The R2 shell is in
`../mac-app` (D-081; build with `./scripts/make-app.sh`, see its README) — it attaches to
this server when running, or starts it. Current state: `docs/context-resumption.md`. The live mirror was removed (D-033); the browser UI was removed in D-199.

### Tests

`npm test` — node:test, no simulator needed: the queue host and macro v2 replay run against a fake
runner, the QA copy against throwaway git repos.

**Proposed extras:** scenario library (save/apply rule sets), simulator picker, inline report
viewer, light/dark toggle, confirm dialogs for clear-all / stop-harness.
