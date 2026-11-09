# TestForge v4 — Native Mac app redesign

_Status: R0 design delivered (D-076; walkthrough not yet run). R1 built (D-077): the state stream, lifecycle, narration and usage feed; the web UI no longer polls._

## Why

QA, the Engineering Manager and the Technology VP all reported the same thing about the web
dashboard: _"The UI and workflow is extremely confusing — no way for a user to understand where to
start or what the dashboard does."_ It is the blocker for presenting the tool to leadership.

Causes, from the current UI:

- **Tabs named after internals.** Home, Sessions, Queue, Projects, Mocking, Driver Console, Test
  Cases and Macros say how the tool is built, not what a person wants to do.
- **No obvious first step**, and no single place that says "ready / not ready".
- **State arrives by polling at five rates** (1, 2, 10, 15 and 30 s) on top of two SSE streams.
  Buttons lag or disagree with each other, and a cancel looks like nothing happened.
- **Raw logs and plain-language status are mixed** in the same panels.

## Who uses it

| Person | Uses it for |
|---|---|
| Developer | Dev testing, re-running a bug fix several times, validating test cases before the QA build |
| QA | Re-validating delivered cases with replays; adding and testing missing and corner cases |
| Leadership | A demo they can follow without explanation |

## Direction (user's choice: mockup C)

A **native macOS app**, written in SwiftUI and following Apple's Human Interface Guidelines, with
SF Symbols throughout. Mockups: private Design artifact
<https://claude.ai/artifact/EPisTUsbZ1rTuov3qvKfwW>, boards C1–C5.

| Board | Screen |
|---|---|
| C1 | Main window with a test running: sidebar, toolbar, test list, "Now running" inspector, console |
| C2 | First launch: plain-words readiness checks, overall progress, console with raw commands |
| C3 | App beside the real Simulator; the current step is outlined on the Simulator with the same number |
| C4 | First-run tutorial tip, Settings › Tutorials, finish notification, Dock badge |
| C5 | SF Symbol map and the recommendation list with each one's status |

### What the app does

1. **Starts everything itself.** It launches the Node server (today's backend, unseen), starts
   Claude sessions in the project folder, starts the test robot, and checks that the scheme,
   build and simulator are set up correctly.
2. **Narrates, never mirrors.** The user pins the Simulator next to the app. While the driver acts
   on the real UI, the app lists each step in plain words with an SF Symbol, its time and its
   status: _Launched app → Home loaded → Tapped Flash Sale "See all" → Landed on Flash Sale →
   Scrolled to Sub Flash Sale → Observing background colour → Validating invert mode_. Live
   rendering of the simulator inside the app is out of scope (an unnecessary burden).
3. **Shows raw logs in a bottom console**, like Xcode's debug area, hidden or shown with ⌘⇧Y.
4. **Opens with a loading screen** in plain words with overall progress; the console shows the raw
   commands behind it.
5. **Has a tutorial for every feature**, shown on first use and replayable from Settings.
6. **Shows Claude usage live**: the same numbers as the Claude Code CLI status line.

### Recommendations and their status

| # | Recommendation | Status |
|---|---|---|
| 1 | SwiftUI app that starts and stops the existing Node server; no backend rewrite | Approved |
| 2 | Standard Mac layout: sidebar, unified toolbar, main area, right inspector, bottom console; light + dark; VoiceOver labels | Approved |
| 3 | Xcode shortcuts: ⌘R run, ⌘. stop, ⌘⇧Y console, ⌘1–4 sections | Approved |
| 4 | Each live step: icon, time, status; a failed step shows its screenshot | Approved |
| 5 | Plain-words steps from macro step names (replay) and translated Claude tool calls (first run) | Approved |
| 6 | Click a step → console jumps to its raw lines; filters All · Claude · Phone · Build · Fake data; search, copy, clear; opens on failure | Approved |
| 7 | "Arrange with Simulator": app left, Simulator right, one click | Approved |
| 8 | Fast re-launch: only changed items re-check; each check has plain words, details and a Fix button | Approved |
| 9 | Reconnect to an in-progress run after the app quits or crashes | Approved |
| 10 | Menu-bar status item, finish notification, Dock badge with failure count | Approved |
| 11 | TipKit tutorials: automatic on first use; replay and reset in Settings | Approved |
| 12 | Free demo run: recorded tests + fake data, no Claude, about 3 min; doubles as the leadership demo | Approved |
| 13 | A ? button on every panel opens that panel's tutorial | Approved |
| 14 | Settings tabs: General · Project · Phone · Claude · Tutorials · Advanced | Approved |
| 15 | ~~Cost guard + monthly cap~~ → **live Claude usage**: context %, 5-hour and weekly limits with reset times; toolbar pill + inspector card | Changed by user |
| 16 | Run history by branch with "compare with develop" | Approved |
| 17 | Step outline drawn over the real Simulator window (C3) | Approved |

## Architecture

```
TestForge.app (SwiftUI, macOS 14+)
 ├─ ServerSupervisor ── spawns `node server.js` (127.0.0.1:4545), restarts it, stops it on quit
 ├─ StateStore ──────── one SSE connection: GET /api/state/stream (snapshot, then patches)
 ├─ Screens ─────────── Get ready · Tests · Results · Reports · History* · Advanced (Fake data,
 │                      Recorded steps, Phone remote) · Settings
 ├─ Console ─────────── raw log lines from the same stream, tagged by source
 ├─ SimulatorBridge ─── window lookup, Arrange (Accessibility API), step-outline overlay panel
 └─ MenuBarExtra, notifications, Dock badge, TipKit tips
Node server (unchanged role) ── jobs, Claude sessions, queue, macros, driver, NetworkLens
```


- **Minimum macOS 14** (Sonoma): TipKit and `MenuBarExtra` need it. The iOS-16 rule in the iOS
  app's `CLAUDE.md` applies to the Blibli app, not to this Mac tool.
- **Location:** `tools/mac-app/` — a Swift package (D-081: user chose it over an .xcodeproj), beside `tools/test-forge-server/`.
- **The web UI stays** at `http://127.0.0.1:4545` while the Mac app reaches parity, then moves to
  `/classic`. Both read the same stream.

### One state stream (removes all polling)

- `GET /api/state/stream` sends a full snapshot, then JSON patches. It carries: readiness checks,
  the device (simulator, robot, lock), jobs and runs, the queue, per-step narration, and Claude
  usage.
- **Every action has one lifecycle:** `waiting → working → done | failed`, plus
  `cancelling → cancelled`. Every button renders one of these; nothing infers state from a timer.
- **Narration event:** `{runId, step, total, icon, text, detail, source: macro|claude, status,
  startedAt, endedAt, logRange}`. `logRange` lets a step jump the console to its raw lines (#6).
- **Readiness checks** are named steps with a fingerprint (branch head, build id, simulator UDID,
  plugin version…). A re-launch re-runs only checks whose fingerprint changed (#8). Each failed
  check carries a `fix` action id.

### Plain words (#5)

- **Replay:** each macro step already has a label (e.g. "Tap Home Flash Sale 'Show all'"). A small
  vocabulary file maps step kinds to an SF Symbol and a verb (tap → `hand.tap`, scroll →
  `arrow.up.and.down`, assert colour → `paintpalette`, screenshot → `camera`, cleanup → `trash`).
- **Claude first run:** TestForgeDriver and NetworkLens tool calls are translated with the same
  vocabulary; Claude's own messages go to the console, tagged `[claude]`.

### Live Claude usage (#15)

Shown as a toolbar pill (`ctx 23% · 5h 7% · wk 42%`) and an inspector card with bars: used %, a
tick for time elapsed in the window, reset time, and orange when use runs ahead of time. A replay
shows "no Claude used".

**Source (user, 2026-10-13: "read from same source").** The CLI status line is a command
(`~/.claude/statusline-command.sh`) that Claude Code feeds JSON on stdin. The fields it shows:

| Shown | JSON field |
|---|---|
| ctx % | `context_window.used_percentage` |
| 5-hour used %, reset | `rate_limits.five_hour.used_percentage`, `.resets_at` (epoch s) |
| weekly used %, reset | `rate_limits.seven_day.used_percentage`, `.resets_at` |
| time elapsed % | computed by the script: 5-hour over 18 000 s; weekly counts Mon–Fri only against 5 working days |

Findings that shape the design:

- Claude Code renders the status line only in interactive sessions. The dashboard's headless
  `stream-json` sessions do not run it.
- Headless sessions emit `rate_limit_event` with the same data (`unifiedWindows.five_hour` /
  `.seven_day` → `utilization` 0–1, `resetsAt`), **but only when a threshold is crossed or a request
  is rejected**: 28 `allowed_warning` + 2 `rejected` events in `.data/sessions`, none in the 5 latest
  sessions.
- Headless `result` events carry `modelUsage.<model>.contextWindow` (e.g. 1 000 000), so a dashboard
  session's own ctx % = its latest input + cache tokens ÷ `contextWindow`.

**Correction (D-077):** the dashboard itself dropped every `rate_limit_event` whose status was `allowed`
(`claude-session.js`), which is why only warnings were on disk. A probe run showed every headless run
emits one with both windows. So dashboard runs are the primary source and the tap is optional.

Design:

1. **Usage tap (optional; for when no dashboard run happened lately).** One line added to the status line command copies its stdin
   JSON to `~/.test-forge/usage.json` (atomic write). The app watches that file. Values are exactly
   the CLI's, refreshed whenever any interactive Claude Code session renders its status line. The
   tap is offered as a Get ready check with a **Connect** button and an explicit consent sheet; the
   app never edits the user's Claude settings silently.
2. **Dashboard sessions.** `rate_limit_event`s update the same 5-hour/weekly figures when newer than
   the tap file; ctx % for a running Claude session comes from its own token counts.
3. **Freshness.** Every figure shows its age ("updated 2 min ago"); older than 15 min turns grey.
   The elapsed-time tick reuses the script's rules (weekly = Mon–Fri only).

### Simulator bridge (#7, #17)

- **Arrange:** finds the Simulator window and moves both windows side by side through the
  Accessibility API. Accessibility permission becomes a Get ready check with a Fix button that opens
  System Settings.
- **Step outline overlay:** a borderless, click-through, transparent panel kept above the Simulator
  window. It draws the numbered outline using the element frame the robot already reads
  (`test_forge_get_frame`), mapped from device points to the Simulator's screen area.
  - Risk: the bezel, zoom and window size vary. The bridge calibrates from the device's screen size
    and the window's content area, and hides the outline when calibration is not confident rather
    than drawing it in the wrong place.
  - The overlay never captures the screen; it only draws.

### Tutorials (#11, #12, #13)

- TipKit tips, about 6 per feature: Get ready, Choosing and running tests, Live steps beside the
  Simulator, Console, A first run with Claude, Results and proof, Fake server data, Recorded steps.
- Settings › Tutorials: auto-show switch (on by default), replay any feature, reset all.
- **Demo run:** 2 recorded tests with fake data and no Claude; each screen explains itself. It is
  the leadership demo.

## Phases

| Phase | Delivers | Exit |
|---|---|---|
| **R0** Design completion | High-fidelity boards for every remaining screen and state: Get ready (all green, failure with Fix), Results (pass, fail with proof, flaky), Reports, Fake data, Recorded steps, Phone remote, each Settings tab, dark mode; tutorial scripts; walkthrough with 1 developer + 1 QA on the mockups | User sign-off; open question on usage source answered |
| **R1** State stream | `/api/state/stream`, the lifecycle model, narration events, readiness fingerprints and fix ids, usage feed; the web UI switched to it with all `setInterval` polling removed | Web UI works with zero polling; tests green |
| **R2** Mac app shell — built (D-081) | SwiftUI app: ServerSupervisor, StateStore, first-launch screen (C2), console, reconnect (#9), Settings skeleton | Cold start → ready on a clean Mac without a terminal (D-082: verified from a fresh clone-shaped folder opened via `open`, npm install included; a truly clean Mac is still open) |
| **R3** Core screens — R3a built (D-085): Tests + live steps; Scan mode + Appearance built (D-086; Measure overlay feasibility → R3d); R3b Results + Reports built (D-087); R3c menu bar/notifications/Dock built (D-088); R3d Arrange + step outline + Measure built (D-089); R3e Advanced built (D-090); Measure polish D-091…D-097 (visible container, layer pass, parent insets, hover compare, pixel-grid rounding, thin bars, border toggle, attributes section removed) — R3 complete, next R4 | Tests, inspector live steps, Results, Reports, Advanced panels, Arrange, step overlay, menu bar, notifications, Dock badge | Parity with the web UI on the P8 Flash Sale cases |
| **R4** Tutorials + demo — R4a tutorials built (D-098); R4b demo run verified end to end (D-099, D-107); R4d Simulator screen built (D-100); R4e Build screen built (D-101…D-105: Install for testing, Install & launch, Fix Swift package errors); runner video off (D-106); next R4f Reset, R4g logo, R4h docs, R4i approvals, R4c installer | TipKit tutorials, ? buttons, demo run, signed build | Leadership demo run end to end by someone new to the tool |
| **R5** Confluence docs (after R4 **and** the user's review; requested 2026-10-14) | (1) a page for the Mac app: what it is, how to open it, how to use each feature, one screenshot per feature; (2) review and update the plugin page 2402746618 "QA Mocker How the Plugin Works" (personal space) with the latest plugin behaviour. Both visual first: truth tables, flow diagrams, images; no long paragraphs. Second page link to confirm. Production page 2396520535 stays untouched | The user approves both pages |

Each phase updates this file, `progress.md`, `context-resumption.md`, `decision.md`, `design.md` and
`README.md` (docs travel with code).

## Unchanged constraints

- Confluence page 2396520535 stays read-only; reports go to page 2437316839.
- `xcodebuild build-for-testing` runs only on an explicit click.
- `lib/{session,variants,trace,container,redact,control,control-queue}.js` stay synced copies.
- Driver first: Claude only for a case's first run and for failures (D-064).
