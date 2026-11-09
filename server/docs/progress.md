# TestForge server — Progress

Status per phase and per feature. **Verified** = exercised against the real app / simulator /
Confluence page. **Built** = code complete, syntax-checked, not yet exercised end to end.

_Last updated: 2026-11-05 (D-216 plugin renamed test-flow-recorder; D-215 renamed to TestForge; R0 + R0b complete; D-214 Free space and reset + runner screenshots swept; D-213 feedback at every control; D-212 paused Test Batch; D-211 onboarding catches up + feature checklist; D-210 window min fix + narrow list header; D-209 hide test list + window shrinks; D-208 overlay panel on every Space; D-207 subtitle placed per step + tail; D-206 system prep in the Mac app only; D-205 min-version presets + slot labels; D-204 Deeplinks query parameters; D-203 Deeplinks one screen search; D-202 busy banner off the explain cards, MT alert step dropped; D-200 Git sheet: fetch, update, switch your own repo, guarded; D-201 Replay a Test Batch on this build with a case-by-case comparison; D-199 browser UI removed, Prepare code + Run queue + Logins + run popups in the Mac app; D-198 run notes no longer trip Code prepared; D-197 real devices in the device picker; D-196 /verify + Verify my changes, pilot on IOS-47345; D-194 tap fallback + alert answers; D-195 Scan step editor, deeplinks + mocks panel, one loading style; D-193 Post to Jira, tickets from the document; D-190 prerequisites; D-191 Run all hands-free plan; D-192 Claude activity strip + steering; D-189 Reports › Batches, end opens report, durable batch progress; D-188 build stamp + stale results + Replay stale; D-187 optional taps keep their own timeout, MT-028 replay 115.8 s → 28.4 s; D-186 start screen + base UI needs per case; D-185 fast replay start, busy banner, subtitle connector; D-184 reopen a Test Batch; D-183 proof media panel with annotations; D-182 proof icons on Tests rows; D-181 bundle import merges cases; D-180 Tests › Override result with required reason, history in exports, Save and rerun; D-179 Demos row click opens paused + big ▶; D-178 sharp demo videos + full screen; D-177 Reports › Demos: recorded demos with native player + EN/ID; D-176 test session report + in-app Markdown viewer + Confluence export/publish; D-172 Brief and Arrange removed; D-173 session export; D-174 Scan Start/End recording + saved macros; D-175 resizable Tests columns; D-171 Scan › Record macro; D-170 Brief screen fits narrow windows; D-169 Arrange under Stage Manager + colored sidebar; D-168 result card check/cross in color; D-167 Tests buttons lock during a run, thinner explain pointers; D-166 edit a loaded case locally; D-165 live explained overlay + Explain menu; D-164 self-explaining demo videos, EN + Bahasa; D-163 mock variant per case, recorded and bundled; D-162 run bundles: export a run, import + replay it without Claude; D-161 usage limit pauses a batch; D-160 Query Brief Mac screen built; D-160 Query Brief server MVP; D-159 parser for the MICROSITE_TABBING page; D-158 Claude runs pick their model and escalate; D-157 deeplinks over the current screen; develop merged, Utility tag -7; D-156 personal Claude Code settings never risk a commit again; D-155 model-driven NetworkLens fuzzing — live-render payoff verified end to end; D-154 Claude-run proof into the Test Batch; D-153 SF cases log in + reload Home first; D-152 .claude/ not a build input; D-151 tutorials + tour cover every feature; D-150 Remote Control; D-149 Claude usage bar; D-148 tour Needs Claude markers; D-147 watch and steer every Claude session; D-146 snapshot Show in Finder; D-145 Measure never splits icons; D-144 ⌥-scroll zoom; D-143 Measure never splits text; D-142 item 3 deferred to develop integration; D-141 Simulator on the right; D-140 Arrange = Split View; D-139 Arrange from full screen / other desktops; D-138 Simulator chooser; D-137 Arrange toggle; D-136 Android driver spec; D-135 fix refusal reason + lens pinned at start; D-134 welcome tour; D-133 Claude section in the Mac app; D-132 DMG + first-run Setup; D-131 phase D live on the QA app, tags -3/-4; D-130 phase D fork verbs + console v2; D-129 trackers tab + toolbar overlap fix; D-128 Mac Network console; D-127 NetworkLens API + qaw-lens + app-settings fix; D-126 bubble parked; D-123 Measure accuracy; D-122 Network Mocks rename; D-121 Simulator Driver rename; D-120 test device + runner-free Measure; D-114…D-118 uncommitted, user testing 2026-10-16; D-118 in-app proof viewer; D-115 Show in Finder; D-116 Simulator revamp; D-117 scan flow-map feasibility; D-114 case row in Claude prompt, SF-062 learned; D-113 video only when needed, over the action window; D-112 auto video, SF-054/SF-061 learned; D-111 R4g app icon; D-110 R4k video proof; D-109 R4j proof folder + Test Batches; D-108 R4f Reset for a fresh run; D-107 Install for testing + demo run verified end to end; D-106 runner screen recordings off; D-105 Install for testing, ⌃⌘R removed; D-104 Install & launch last build, ⌃⌘R brings Xcode forward; D-103 Run without building, pods removed; D-102 Fix Swift package errors; D-101 R4e Build screen; D-100 R4d Simulator screen; D-099 R4b demo run; D-098 R4a tutorials; D-097 labelled toggle, attributes section removed; D-096 dashed-border toggle + colour picker; D-095 spacing half-to-even on the pixel grid + thin bars; D-094 Measure relations to every parent + hover compare; D-093 Measure layer pass from Color Blended Layers; D-092 routes; D-091 Measure spacing to the visible card + corner radius; D-090 R3e Advanced: Fake data, Recorded steps, Phone remote; D-089 R3d Arrange + step outline + Measure; D-088 R3c menu bar + notifications + Dock badge; D-087 R3b Results + Reports; D-086 scan mode + appearance + overlay feasibility; D-085 R3a Tests screen; D-084 probes without screenshots; D-083 code-prepared drift; D-082 readiness fingerprints + R2 checks; D-081 R2 Mac app shell; D-080 Confluence load via plugin; D-077 R1 live state stream; D-076 R0 started; D-075 v4 Mac app redesign: design direction signed off; D-074 SF-006/010/025/026/027 learned; D-073 SF-011/SF-012 learned; D-072 qa-mock leftovers; P8 pilot complete D-071; earlier: P7 D-066, P9 D-067, D-068, D-069, D-070)_


## Hand-over to module-owner devs (proposed, not started)

- **Open:** user to choose where the test-flow-recorder plugin lives (this branch, recommended, or a new repo) and whether to add a Send feedback item; then build `tools/testforge/setup.sh`. Details in `context-resumption.md` "Resume here".

## Free space and reset (D-214)

- **Built:** Build › Clean merged into Reset: one "Free space and reset" list where each row has its size, a switch for Reset selected and its own Delete… (confirm, "Deleting…" on the row); Swift package settings joined the list. The server empties the test runner's own screenshots 5 s after each finished test when nothing else is testing (retries every 60 s). `npm test` 357/357, `swift build` + lint clean.
- **Open:** delete one row on screen; watch Test runner screenshots drop to ~0 after a replay.

## Visual feedback for every action (D-213)

- **Built:** an audit of the Mac app found 66 controls that started work with no progress at the control (only disabled buttons, a status strip scrolled away, or nothing), swallowed errors, or results that didn't refresh. All fixed: each screen's `perform` records which action runs, the clicked control shows a spinner + "…ing" (`Views/ActionProgressLabel`, `Views/BusyActionLabel`, `SimulatorActionLabel`), failures show next to it, double taps are ignored instead of cancelling the first request, and sheets stay open while saving. Notable: Build › Clean row "Deleting…" + Reset sizes refresh after Clean; Get ready Fix rows; Run all start error no longer swallowed; Claude Send keeps the draft on failure; Simulator cards show their own progress/result (Read value in its card); Test Batch pill shows "Pausing…/Ending…" and failures; Results Copy/Export show "Copied"/"Saved"; Outlook poll retries; Use for tests (real device) disabled with the reason (no device-signed build, D-197). `swift build` + lint clean. Rule added to the Mac feature checklist in `BlibliMobile-iOS/CLAUDE.md`.
- **Open:** click through on screen (Build › Clean first).

## Paused Test Batch (D-212)

- **Built:** Test Batch status active → paused ⇄ active → ended. Pill: Pause Test Batch, Start another (pauses the active one), Resume ▸; start sheet lists paused batches; Reports › Batches ⏸ rows with Resume / End. Switching (start another, resume, reopen, Replay on this build) pauses instead of ending. Refused while a test or a multi-case run is going. Report shows pauses; readiness names paused batches. `qaw batch pause|resume`. Tip "Switch priorities without ending a batch", tour line, onboarding QA step 22, tutorials R35. `npm test` 356/356 (2 new), `swift build` + lint clean.
- **Open:** pause → start another → resume on screen.

## Onboarding catches up (D-211)

- **Built:** welcome role flows cover D-200…D-210 (QA 13, 18–21; developer 4, 13–14); feature checklist (tip + tour, onboarding, `tutorials.md`) in `BlibliMobile-iOS/CLAUDE.md`. Tutorials R34. `swift build` + lint clean.
- **Open:** read the new steps in the welcome screen (toolbar ? › Welcome tour).

## Window min fix + narrow list header (D-210)

- **Verified (2026-11-04):** user narrowed the TestForge in Split View on the restarted build: works. The sidebar's toolbar button never updated `sidebarVisibility`, so the window stayed at 1240 pt in Split View (user screenshot: TestForge exactly 1240 wide). Min width now comes from the Tests panes only (880 → 640 → 480); the split view adds the sidebar itself while shown (checked in a probe app: toggleSidebar leaves the binding at `.all`; with the sidebar shown the window still keeps the sidebar's width). The list header puts its buttons on their own row and drops their titles when narrow, instead of wrapping "Run all…" letter by letter. `swift build` + lint clean.

## Hide the test list (D-209)

- **Verified (2026-11-04, with D-210):** Tests › Test list toggle (⌥⌘L); main window min width 1240 → down to 480 as the sidebar, test list and live steps are hidden. Tip "Make room for the Simulator". `swift build` + lint clean.

## Overlay panel on every Space (D-208)

- **Verified (2026-11-03):** step overlay `NSPanel` gets `.canJoinAllSpaces`, so ordering it no longer switches desktops when the Simulator is in Split View. User confirmed in Split View on the restarted build: no more desktop switching. `swift build` + lint clean.

## Subtitle placement + tail (D-207)

- **Built:** `ExplainCaptionPlacer` places the explained replay's subtitle per step around the focused element (below/above/beside, narrowed beside, fallback with no tail); rounded box with a tail and pointer-colored border; connector from the tail tip. Harness over 8 layouts: on screen, no overlap (except a full-screen element). `swift build` + lint clean.
- **Open:** watch a replay with explanations on screen (no recorded demo to render previews from).

## System prep in the Mac app only (D-206)

- **Built:** a replay with explanations has no spinner banner over the Simulator; Tests › live steps has a System prep section (current message + spinner + timer, earlier messages of the run). Plain replays keep their Simulator banner. Tips updated. `swift build` + lint clean.
- **Open:** watch a replay with explanations on screen.

## Min-version presets + slot labels (D-205)

- **Built:** query row key menu (`androidMinVersion`, `iosminversion`, spelled as `BlibliBonusManager` does); version menu in each key's format from the installed build (`appVersion` now in `/api/deeplinks`); `{rest}` field labelled "More path (optional)" with its prefix. Version list printed by script for 15.0.0; `npm test` 354/354; `swift build` + lint clean.
- **Open:** confirm on screen; whether the web page treats these keys case-insensitively is unknown (not in this repo).

## Deeplinks query parameters (D-204)

- **Built:** Add query parameter rows under the link field, for screen-built and typed links; full link preview; Open/Save/match use it. Encoding checked with a script (space → %20, `&`/`=` in values encoded, existing `?a=1` extended, `#fragment` kept last). `swift build` + lint clean.
- **Open:** open a link with a parameter on the simulator.

## Deeplinks screen search (D-203)

- **Built:** Simulator › Deeplinks has one "Find a screen" search with clickable matches under it; picked screen shows with Change screen; link field says "or type a link yourself". Tip text updated. `swift build` + lint clean.
- **Open:** click through on screen.

## Busy banner layout + MT alert step (D-202)

- **Built:** busy banner sits in its own row under the intro/result card, and on the far edge from a subtitle. `swift build` + lint clean.
- **Built:** optional `alertTap "Open"` removed after `openDeeplink` in 22 MT macros; server reads them, macro lint 0 errors over 75.
- **Open:** see an explained replay on screen; replay MT-015 once.

## Git control + batch replay (D-200, D-201)

- **Built:** Get Ready › Git… (fetch, fast-forward, switch with stash guard, restore stash, searchable branches);
  `lib/git-control.js` + `/api/git/*`. Reports › Batches › Replay on this build → new Test Batch, driver only, compared
  per case (`replayOf`, `comparison`, report table). Server 354/354 (7 new git-control tests in temp repos, 1 compare
  test); Mac build + lint clean (only the old ReadinessFixService warning).
- **Verified (restarted TestForge, 2026-11-03):** `/api/git/status` on BlibliIOSApp-POC → darshan/innovation/qa-mocker,
  338 ahead / 0 behind, 320 changes, 3 stashes, last fetch 2026-10-30; switch to `develop` → 409 `removes-testforge`,
  `--force` → `bad-name`, HEAD and working tree unchanged; branches 969 (40 `isLocal`); every batch summary has
  `comparison`. Not clicked through by a person: the Git sheet, a real fetch/switch, a real batch replay.

## Browser UI removed (D-199)

- **Built:** Get Ready › Prepare code… and Run queue… sheets, Settings › Logins (test logins + Outlook OTP), run popup
  sheet over the main window (new `prompts` state slice). `public/`, `QA Dashboard.app`, the launcher, static serving,
  `marked`/`dompurify` removed. Server 346/346, Mac build + lint clean (only the old ReadinessFixService warning).
- **Verified (restarted TestForge, 2026-11-03):** `/` → 404 (no web UI); `/api/code/repos` 5+ repos, `/api/code/branches` 969
  branches, `/api/code/current` darshan/innovation/qa-mocker @ 9ec4017+64e6 with `appFiles: []`; `/api/credentials` (no
  logins stored, static OTP for uatb); `/api/mail-otp` unlinked; `prompts` slice `{prompts: []}`; Get Ready `code` check
  green (D-198). Not clicked through by a person: the four sheets/tab, a real prepare, a real run popup.

## Code prepared ignores run notes (D-198)

- **Verified:** Claude-run `*-notes.md` beside the macros no longer count as app code; drift is judged file by file
  against the prepared copy and the warning names the file. Live: current snapshot `hasAppInputsChanged: false`.
  Test `D-198` in `test/readiness.test.js` (346/346).

## Fast replay start, busy banner, connector line (D-185)

**Complete (2026-11-04):** marked complete by the user (R0 / R0b); rows below keep their original evidence.

| Item | State | Evidence |
|---|---|---|
| Screen memo: one look per guard, no retry of a missed optional step | **Built** | 2 new tests in `test/macro-v2.test.js` (324/324); not yet timed live — no Test Batch active |
| Guard look 1 s (relaunch 2 s); Open Home Back tries 1 s + promo page Back | **Built** | routine JSON updated; diagnosis from runs.json (case 15: 37 s steps of a 95 s run) |
| Explain/demo + step outline skip routine steps (no frame, no pause) | **Built** | `test/demo.test.js` holds only the page and the check |
| Busy banner over the Simulator (narrator `busy`, Mac `StepBusyBannerView`) | **Built** | narrator test; `swift build` + SwiftLint clean; not seen on screen yet |
| Dashed connector subtitle → element (`ExplainConnectorView`) | **Built** | build clean; not seen on screen yet |

## Real devices (D-197)

**Built** 2026-11-03. `GET /api/devices/physical` verified live (2 paired iPhones, not connected, blockers listed);
`test/physical-devices.test.js`. Simulator › Real devices card built, not clicked through. Running on hardware: open
(needs a device-signed QA build + runner).

## /verify — developer pre-PR check (D-196)

**Verified** 2026-11-03 for the server + skill path: `qaw verify --range dadb803de^..dadb803de` → 24 cases, 4 uncovered
Home files; `qaw replay 4 28` → PASS, PASS (driver-level). Mac sheet *Verify my changes…* **Built** (build + lint clean,
not clicked through). `test/verify-plan.test.js`.

## Scan step editor, case inputs, tap fallback (D-194/D-195)

| Feature | State | Evidence |
|---|---|---|
| Tap without an ID → container + type + index chain; system alert → optional `alertTap` | **Built** | `test/recorded-macro.test.js`; not recorded live yet |
| Scan › Edit steps (reorder, remove, timeout, optional, text) → `PUT /api/macros/v2/:id/steps` | **Built** | `test/step-edits.test.js`; live PUT on `mc_E1OT41AYHE` wrote the file, restored after |
| Tests › Deeplinks and mocks (Copy, Download, Download all) ← `GET /api/macros/v2/:id/inputs` | **Built** | live: MT case 11 → 1 deeplink, 2 variants with device bodies |
| `LoadingStateView` everywhere (elapsed after 4 s) | **Built** | `swift build` + SwiftLint clean |

Open: the sheets and panel need a person's click-through; a live Scan recording of an un-identified tap and an alert.

## Post to Jira (D-193)

**Built** 2026-11-03. Verified: `GET /api/testcases/24/jira` builds the comment (result, build, batch, expected, 4 proof
names); POST without `confirmed` → 400. Not verified: an actual post (needs the person's go-ahead) and ticket extraction
on the live page (the loaded MICROSITE_TABBING doc predates D-193 — reload it once).

## Prerequisites, hands-free Run all, Claude activity (D-190…D-192)

**Built**; server **Verified** 2026-11-02: `/api/prerequisites` reads 6 tools, the plugin and 3 MCP servers correctly; both
Get Ready rows green; `/api/batch/plan` for MICROSITE_TABBING orders 24 replays (UAT B case first, 1 switch to PROD) then
5 Claude runs, no stops. Mac sheet, Run all and the Claude activity strip built and launched, not clicked through.

## Reports › Batches + durable batch progress (D-189)

**Built**; server side **Verified** 2026-11-02 (`/api/test-batches` progress: MICROSITE_TABBING 29 cases · 24 pass · 2 fail ·
3 undecided; report header line). Mac screen built and launched, not yet clicked through by a person.

## Build stamp + stale results (D-188)

**Built** 2026-11-02; partly verified. Live: the Tests slice shows `darshan/innovation/qa-mocker @ 9ec4017+local · 15.0.0 (150006)`,
the current snapshot's local-edit hashes are recorded, and 0 cases are stale (all results ran on this build) — correct.
The stale path itself (a newer build changing covered code) is covered by `test/staleness.test.js` only; it needs a second
build to see live. Also: 23 Promo deeplink macros' optional "Open" alert wait cut 4 s → 2 s.

## Optional taps keep their own timeout (D-187)

**Verified** 2026-11-02 on the QA sim (MICROSITE_TABBING batch): MT-028 plain replay 28.4 s (was 115.8 s), explained 42.9 s,
both PASS; D-185 skips seen live (Open Home guarded once, repeated Back misses skipped). Busy banner and connector: built, not yet
seen on screen. Test: `test/macro-v2.test.js` covered-fallback case (325/325).

## Start screen + base UI needs per case (D-186)

**Complete (2026-11-04):** marked complete by the user (R0 / R0b); rows below keep their original evidence.

| Item | State | Evidence |
|---|---|---|
| `requires.startScreen` (home / anyScreen / freshLaunch) met before step 1 | **Built** | `test/preconditions.test.js` start-screen test |
| Macros migrated: 24 anyScreen (Open Home removed), 27 home, 6 freshLaunch | **Built** | script over `**/macros/*.json`, formatting unchanged |
| Claude first run states `START:`; learn turn writes it | **Built** | prompt text only; not run |
| Tests detail "Starts on … · Needs …" | **Built** | `testcaseView` `macro.setup` test; build clean |

## Reopen a Test Batch (D-184)

| Item | State | Evidence |
|---|---|---|
| `TestBatchStore.reopen`, `POST /api/test-batches/:id/reopen` (ends the active one first) | **Verified** | unit test (319/319); live reopen of MICROSITE_TABBING after restart |
| Mac pill menu › Reopen Test Batch ▸ + confirmation | **Built** | app builds, lint clean; not clicked on screen |

## Proof media panel in Tests (D-183)

| Item | State | Evidence |
|---|---|---|
| `caseProofFiles` + `GET /api/testcases/:id/media` | **Verified** | unit test (318/318); live list for the selected case after restart |
| Panel: image zoom/pan, video playback, thumbnails, Open / Show in Finder | **Built** | app builds, lint clean; not clicked on screen |
| Annotate (pen / arrow / box, 3 colours, undo, clear) + Save as copy / Replace original (confirmed) | **Built** | `AnnotationRenderer` run on case 18's 1284×2778 screenshot: box, arrow, pen drawn at full size (scratch output, proof untouched) |

## Proof indicators on Tests rows (D-182)

| Item | State | Evidence |
|---|---|---|
| `lib/case-proof.js` counts screenshots/videos per case from the batch folder; `proof` in the `testcases` slice | **Built** | 2 unit tests (318/318) |
| Mac row icons: 📷 count, 🎥, 👁 evidence only (`TestCaseProofBadgeView`, IDs `QAW_Tests_ProofBadge_*`) | **Built** | app builds, lint clean |

## Bundle import merges (D-181)

| Item | State | Evidence |
|---|---|---|
| Import of the loaded document's bundle adds missing cases (`mergeImportedCases`, `acceptImported`); other bundles load as before | **Built** | unit test (316/316); not imported live |
| Mac import sheet "Test document" fact: added count or "Loaded as the test document" | **Built** | app builds, lint clean |

## Result overrides on the Tests page (D-180)

| Item | State | Evidence |
|---|---|---|
| `lib/result-overrides.js` store + history; `PUT /api/testcases/:id/result {verdict, reason, leniency, expected?, rerun?}` | **Verified** | 6 unit tests (315/315); live: empty reason → 400 "a description … is required", bad verdict → 400 |
| Tests slice shows the override (`lastRun.override`, `resultOverrides`); newer run replaces it | **Built** | unit tests; not yet seen on screen |
| History in bundle export/import, session export (`summary.overridden`) and session report ("Result changes") | **Built** | unit tests (bundle import path via `acceptLoaded`, not run live) |
| Mac: Tests › **Override result…** (⇧⌘O) sheet: verdict, required description, expected result, Strict/Lenient, earlier changes; Save / Save and rerun | **Built** | app builds, lint clean, TestForge restarted; not yet clicked on screen |
| Rerun prompt carries comments + leniency (`reviewerNotesText`); expected saved as a local edit | **Built** | unit test of the prompt text; no live rerun yet |

## Demo library (D-177)

| Item | State | Evidence |
|---|---|---|
| D-178 demos rendered sharp: HighestQuality preset, 1080 px wide (was MediumQuality → 220×480 @ 625 kbps) | **Verified** | case 18 re-rendered: 1080×2336, frame at 20 s checked (text and subtitles crisp); EN 42 MB, ID 42 MB for 46 s |
| D-179 whole row is the click target (List selection); demo opens paused with a big ▶ overlay (Space) until playing | **Built** | app builds, lint clean; not yet clicked on screen |
| D-178 full screen: `AVPlayerView` with its ⤢ toggle (SwiftUI `VideoPlayer` has none on macOS) | **Built** | app builds, lint clean; not yet clicked on screen |
| Reports › **Demos**: recorded demos listed with ▶, AVKit `VideoPlayer` (play/pause/scrub), English / Bahasa Indonesia picker, Show in Finder | **Built** | app builds, lint clean; the app's `DemoRecording` decoder read live `GET /api/demo/recordings` (case 18 MT-018, PASS, EN + ID files present). Not yet seen on screen: switching to the Demos tab needs a click |

## Test session report, Markdown viewer, Confluence (D-176)

| Item | State | Evidence |
|---|---|---|
| `lib/session-report.js` Markdown + Confluence HTML; routes `report.md`, `report.html`, `publish` | **Verified** | 4 unit tests (309/309); live `GET /api/session/report.md` on MICROSITE_TABBING (26 cases, 89 KB; HTML 22 KB) |
| Mac Markdown viewer (`Views/Markdown/`) | **Verified** | real report parsed: 31 headings, 26 tables, 78 image rows, 28 lists, 9 code blocks; Reports › Session report rendered live (window capture: title, summary table, needs-attention list, results table) |
| Proof images inline in the viewer | **Built** | file URLs in the report; not scrolled to on screen |
| Copy / Export .md / Export .html | **Built** | builds; save panels not clicked |
| Publish to personal Confluence page | **Built** | not run — writes to Confluence, needs the user's go-ahead |
| Brief/Arrange archives deleted | **Done** | `.data/archive/` removed; `.data/briefs/` (1 saved brief, data) kept |

## Brief and Arrange removed; session export; Scan Start/End + saved macros; resizable Tests (D-172…D-175)

| Item | State | Evidence |
|---|---|---|
| Brief + Arrange removed (Mac, server, tutorials, tour) | **Verified** | app builds, lint clean; running TestForge shows neither (window capture) |
| Session export: `lib/session-export.js`, `GET/POST /api/session/export` | **Verified** | 7 unit tests (306/306); live on MICROSITE_TABBING: 26 cases, 18 pass / 2 fail / 6 undecided — matches Tests; zip without media 29 KB; with media 105 files, 425 MB in 7 s, none missing |
| Mac Export session… sheet (summary, media toggle with count/size, save panel, Show in Finder) | **Built** | builds; sheet not opened live |
| Scan saved-macros list `GET /api/macros/v2/recorded` | **Verified** | 1 test; live route lists the user's "Recorded: profile screen to Home screen" (3 steps, 1 by text, 1 manual) |
| Scan Start/End recording → save → land on the saved macro | **Built** | builds; review state seen live (leftover 3-step recording shows Discard + Save); library view not seen live |
| Tests list + inspector resizable, title tooltips | **Built** | builds; not dragged live |

## Scan › Record macro (D-171)

| Item | State | Evidence |
|---|---|---|
| Server: `lib/recorded-macro.js`, `POST /api/macros/v2/recorded` | **Verified** | 4 unit tests (304/304); live save of a 3-tap recording |
| Mac: steps captured with anchors, Steps list, Save as macro sheet | **Verified** | live on QA sim: Account → Settings → Language, saved, replay PASS 10/10 |
| Missing-ID alerts: banner, orange step, Save sheet list | **Verified** | Language row (no ID) flagged live |
| Missing-ID macOS notification | **Built** | posted; banner not observed |
| Typing / long-press / edge back-swipe | Not built | |

## Arrange under Stage Manager; colored sidebar (D-169)

**Verified** on this Mac (Stage Manager on, two displays): Arrange and restore both work; sidebar has colored tiles
with a bigger, bold selected row.

## Result card: check or cross, verdict in color (D-168)

**Verified** in rendered previews (live-overlay preview + demo video outro, pass and fail); not yet seen live. Green
check + "Test passed", red cross + "Test failed", orange triangle + "Couldn't decide"; EN and Bahasa.

## Tests buttons lock during a run; thinner explain pointers (D-167)

**Built** (compiles, lint clean; not clicked through on screen). Clicking Replay / Replay with explanations / Record
demo / Run with Claude disables every Tests action (Replay, Explain menu, Write explanations, Run with Claude, Edit…,
Revert, Load) until the run is stopped or ends. Explain pointer outline width halved (live overlay and demo videos).

## Edit a loaded test case locally (D-166)

**Built** (server verified: 300/300 tests, live slice carries case 15's edit after a restart; Mac sheet and notice not
yet clicked through). Test Cases › Edit… (⌘E) corrects scenario, precondition, steps, expected or API on this Mac;
`.data/case-edits.json` keeps edits beside the document and lays them over it on every load. Runs tell Claude the
edit overrides the document. Pencil in the list, "Edited locally" notice with Revert, "Document says: …" under each
edited field, orange when the document changed since. Bundles carry edits. Case 15's correction moved into an edit.

## Live explained overlay + Explain menu (D-165)

**Built** (state machine verified live on case 18; drawing verified headless with `--preview-explain`; not yet seen over
a visible Simulator). **Not built:** demos list in the app, editing explanations in the app, reel.

- Server: recorder `onFocus` + `notedStepIds`; `Narrator.explain` / `explainFocus` (card held through routines);
  replay-v2 `explain` payload; `POST /api/macros/v2/:id/replay {explain:true}`; `/api/macros` `hasDemoNotes`.
- Mac: `Simulator/ExplainOverlay.swift` (models + `ExplainOverlayMapper`), `ExplainOverlayView`, `ExplainCardView`,
  `ExplainCaptionView`, `ExplainPointerView`, `StepOverlayContentView`, `ExplainOverlayConstants`;
  `StepOverlayViewModel` tracks explained runs without the outline toggle; `Tests/TestCaseExplainMenuView`;
  Settings › Explanation language; `--preview-explain`; tutorial tip + tour step 10.

## Self-explaining demo videos (D-164)

**Verified** (server, CLI, headless renderer on the QA simulator, case 18). **Not built:** Mac UI for it, reel, live overlay.

- Server: `lib/demo.js` (notes prompt/parse, mock notes store, demo recorder), `routes/demo.js`
  (`POST /api/demo/:macroId/notes`, `POST /api/demo/:macroId/record`, `GET /api/demo/recordings`), replay-v2 `demo`
  payload (whole-macro video + `timeline.json`, then the Mac binary renders), `replayMacroV2` awaits `onStep` and
  passes `from`. `qaw demo notes|record|list`. Bundles carry `mockNotes`; macros carry `demo`.
- Mac: `Demo/` (`DemoTimeline`, `DemoScript`, `DemoOverlayBuilder` + `DemoPainter`, `DemoRenderer`, `DemoSubtitles`),
  `App/TestForgeMain.swift` (`--render-demo <folder>`).
- Evidence: 3 new tests (292/292); case 18 demo rendered EN + ID, 46 s, 3.6 MB, frames checked.

## Mock variant per case (D-163)

**Verified** (server + CLI on the QA simulator), **Built** (Mac list + Set up mocks; build + lint clean, not clicked).

- `lib/mock-variants.js` (match served response → variant: exact / size / failure / timing tie-break / ambiguous),
  run evidence `mocksUsed`, bundle items `mocksUsed` (recorded → trace → macro), `plan.caseMocks`,
  `POST /api/bundles/:id/cases/:caseId/arm`, `qaw bundle mocks|arm`. Mac: "Mocked responses per case" in the import
  sheet with **Set up mocks**; Results inspector shows `endpoint → variant`.
- Evidence: 7 new tests (289/289); re-export resolved 4, 13, 27 exact and 29 by timing; arm 29 live; fresh replay of 4
  recorded `mt-null-image`.
- Open: cases from the trace-less part of the MICROSITE_TABBING batch have no variant (1, 2, 7, 15, 20, 21, 24, 28).

## Run bundles (D-162)

**Verified** (server + CLI on the QA simulator), **Built** (Mac buttons and sheet; build + lint clean, not clicked
through yet).

- `lib/run-bundle.js` (build / inspect / install / merge later runs / store), `routes/bundles.js`
  (`GET|POST /api/results/:id/bundle`, `POST /api/bundles/inspect|import`, `GET /api/bundles[/:id]`,
  `GET /api/bundles/:id/proof/<case>.jpg`, `POST /api/bundles/:id/replay`, `GET /api/bundles/:id/compare`), batch
  `noClaude` + `bundleId`, `bundleVerdict` on run detail. `qaw bundle list|export|import|replay|compare`.
- Mac: Results › **Export bundle…** (run header) and **Import bundle…** (above the run list) → sheet: preview (cases,
  tested code + match, what it adds, Claude spend it saves, logins it types, conflicts, warnings) → Import / Replace
  mine and import → **Replay N case(s) without Claude**. Case rows show the bundle's verdict. 2 tutorial tips, tour
  step 9 for QA and Developer.
- Evidence: 8 unit tests (282/282); MICROSITE_TABBING export 26 cases / 17 replayable / 3.6 MB; import into an empty
  folder + the real repo; replay of 4 and 13 → PASS, PASS, $0, agree with the bundle.
- Open: click the Mac flow through once; proof JPEG viewer in the app; optional auto-Prepare of the bundle's branch.

## Usage limit pauses a batch (D-161)

| Item | State | Evidence |
|---|---|---|
| Limit → case requeued, batch paused with reason | **Verified** (unit) | run-batch test: B hits the limit → queued + paused → resume → A, B, B, C all PASS (274/274) |
| Mac menu bar Continue + pause reason; `qaw resume` | **Built** | `swift build` + lint clean |

## Query Brief MVP (D-160)

| Item | State | Evidence |
|---|---|---|
| Server: store, prompt, schema validation, chat summary, routes | **Verified** | 6 unit tests (273/273); real brief on a :4646 copy — 4-bullet query + screenshot + 2 pins → Sonnet truth table (5 rows, "?" cells), 4 asks tagged by role/pin, 12 s, $0.17 |
| Jira comment route | **Built** | not posted (needs a real key + confirm); outcome now recorded on the brief as `jiraPost` (posting/posted/error) so the app polls one endpoint |
| Mac Brief screen, ⌘B (list, composer, number/letter pins, 4 renderers, copy text / copy image / save PNG / Jira with confirm) | **Built** | `swift build` clean, SwiftLint clean; the app's models decode the real :4646 brief (truth table, 4 asks) and sample annotatedScreenshot / sequence / eventMatrix / `jiraPost` JSON. Seen in the running app 2026-11-01: composer was clipped in a normal-width window, fixed in D-170 (stacks below 780 pt). Analyse, the 4 visuals and sharing still not exercised live |
| Brief tutorial (6 tips) + tour step 8 (QA + Dev) | **Built** | |

## MICROSITE_TABBING batch — parser (D-159)

| Item | State | Evidence |
|---|---|---|
| Blank first header = id, "Test cases" = scenario | **Verified** | unit test on the page's header shape |
| Load GDNIT 2446558056 into the TestForge | **Verified** | live :4545, 29 cases (before the `\_` fix — reload to pick it up) |
| Auto-pick: configure-steps / JSON API body = mocked data; sticky/collapse = motion | **Verified** | unit test; 6 Haiku / 23 Sonnet on the 29 |
| Mock pack: `promotions/blibli-histeria` + MICROSITE_TABBING, 13 variants; scenario "MICROSITE_TABBING on Histeria" | **Verified** | tab bar rendered on the QA clone (mt-anchor) |
| Run notes for Claude (`BlibliMobile_XCUITest/Engagement/Promo/MICROSITE_TABBING-run-notes.md`) as techDoc | **Verified** | smoke runs armed the right variants |
| Smoke 3 / 9 / 18 | **Verified** | EVIDENCE_ONLY / PASS / BLOCKED (tabs hidden from the driver) |
| App fix: MicrositeTabsBarView container `ignoreSubviews: false` + tab labels | **Verified** | dumpTree shows `MicrositeTabbing_Tab_image_1…4`; case 18 rerun **PASS** (target flush at 165 pt, iPhone selected), macro `mc_MTA18NCHR4` saved (not replayed) |
| Auto-pick cost on the rerun | **Built** (fix) | prior BLOCKED (+2) → score 7 → Opus ($1.90) and the macro-save turn stayed on Opus ($2.37) — see D-158 follow-up |

## Deeplinks over the current screen (D-157)

| Item | State | Evidence |
|---|---|---|
| `lib/deeplinks.js` — route list → templates, match, scheme check, saved + recent store | **Verified** | 6 unit tests; 112/113 routes self-match (1 flagged advanced) |
| `routes/deeplinks.js` — `GET /api/deeplinks`, `POST …/match`, `POST …/open` (lock + refuse while testing), saved CRUD | **Verified** | exercised on a :4646 copy; open on the shut-down QA clone returns the clear "isn't booted" message |
| `qaw link routes|match|open` | **Verified** | `qaw link match` against :4646 |
| Successful open on a booted QA clone (screen pushed over the current one, no relaunch) | **Verified** | 2026-10-31: promo pushed over Home; iOS "Open in Blibli?" tapped via harness `alertTap` |
| Auto-tap of that prompt inside `/api/deeplinks/open` (`isConfirmed`) | **Built** | needs a TestForge restart |
| `https://www.blibli.com/…` universal links allowed; UAT-B links rewritten to `blibli://` ("Opens as …") | **Built** | https open Verified by hand (`simctl openurl` → iPhone Duo in app); route needs a restart |
| Mac Simulator › Deeplinks card (route search + picker, slot fields, link row, caught-by, saved + recent); old App-card Link field removed | **Built** | `swift build` + SwiftLint clean; not yet seen on screen |
| Tutorial tip "Open any screen by link" + tour line | **Built** | compiles |

## Claude runs pick their model (D-158)

| Item | State | Evidence |
|---|---|---|
| `lib/model-pick.js` — `pickModel` (case words + history) + `watchForEscalation` | **Verified** | 6 unit tests; scored the 96 loaded cases (26 Haiku / 69 Sonnet / 1 Opus) |
| `ClaudeSession.setModel` → SDK `query.setModel` mid-session | **Verified** | real SDK run: haiku answer, then sonnet after `setModel` |
| qa-run executor: pick at session start, log + narration + history, escalate while the turn runs | **Built** | `node --check`; not yet a real Auto `/qa-run` |
| Mac: Run with Claude dialog Auto/Haiku/Sonnet/Opus; live-steps model line | **Built** | `swift build` clean; not yet on screen |

**Open (both):** restart :4545 (ask first) so the live TestForge serves the new routes; one real Auto run and one real
deeplink open on the booted QA clone; see the Mac card + dialog on screen.

## Personal Claude Code settings never risk a commit again (D-156)

| Item | State | Evidence |
|---|---|---|
| `.claude/settings.local.json` untracked, `.example` committed as the shared baseline | **Verified** | `git rm --cached` + `.gitignore`; diffed `.example` against the real file's non-`env` keys — byte-identical |
| `lib/claude-local-env.js` — `detectLocalEnv`/`diffLocalEnv`/`readLocalEnv`/`writeLocalEnv` | **Verified** | 14 unit tests; `detectLocalEnv` run live against this Mac (real `findQaSimulator()`) |
| New **Get ready** check "Claude Code set up for this Mac" (warn-level, never blocks Run/Replay) | **Verified** | unit test (`readiness.test.js`); `claudeEnvCheck()` run live, read-only, correctly reported not-set-up before the fix |
| Fix `POST /api/claude-env/configure` — detailed confirm, then writes `env` into `settings.local.json` | **Verified** | ran for real: detected `QA_DEVICE_UDID` = today's actual QA simulator (caught a stale UDID that had been hand-typed into the old `settings.json`), merged into `settings.local.json` leaving permissions/hooks/MCP toggles untouched |
| Mac (`ReadinessFixService.swift`) + web (`public/js/readiness.js`) fix-id wiring, same confirmation text both places | **Verified** | `swift build` compiles clean; same `FIXES` entry shape as every other Get ready fix |
| `settings.json` itself carries no personal values | **Verified** | diffed against the tracked baseline — only the (unrelated, pre-existing) `qaSkillAudit` fingerprint remains |

**Open:** nothing deferred — this closes the gap the session itself created. A teammate's first "Claude Code set up for this Mac" Fix is the only other path that's never been run for real (verified here on an already-configured Mac, i.e. overwriting an existing `env` block, not a from-scratch `.example` seed).

## Install + Claude in the app (items 1 + 6: D-132, D-133)

| Feature | State | Evidence |
|---|---|---|
| `scripts/make-dmg.sh` → `build/TestForge-<version>.dmg` (app, Applications link, read-me) (D-132) | Verified | built 3.9 MB, mounted, app copied out and launched |
| First-run Setup when no repo is found: choose repo, tool checks with fixes, Continue → relaunch (D-132) | Built (screen + checks Verified) | DMG copy showed Setup, 4/4 checks green; folder panel + Continue not driven (shared defaults) |
| Settings › Project › Change repo… (D-132) | Built | `swift build` + lint 0; not clicked |
| `POST /api/sessions/testforge` — resume or start the repo's TestForge session (D-133) | Verified | same id on repeat; `fresh` closes + replaces; 3 new tests, 187/187 |
| Mac Claude section ⌘0: transcript, approvals, questions, Stop, New conversation, reconnect (D-133) | Verified | on :4646 copy: round trip, Deny honoured (file absent), question answered "Blue", relaunch resumes, server restart reconnects |

## Model-driven NetworkLens fuzzing (D-155)

| Item | State | Evidence |
|---|---|---|
| `lib/swift-decodable.js` parses `init(from decoder:)` — explicit `decodeIfPresent(Type.self, forKey:)` form | **Verified** | unit fixtures from the real `FSSubFlashsaleRangeItemResponse`; piloted live against the real file, all 9 fields correct |
| Same parser, the `KeyedDecodingContainer` subscript form (`values[.x]`, type from the property's own declaration) | **Verified** | unit fixtures from real `AttachProductL3Info` / `DigitalMobileConfig` shapes (user flagged this pattern mid-build — it wasn't in the original plan) |
| CodingKeys wire-key remap honoured when mutating (never the Swift property name) | **Verified** | unit test + live pilot: renaming `isTimeBased`'s wire key and regenerating tracked the new key, dropped nothing stale |
| `lib/model-fuzz.js` — locate instances in an envelope body, generate `fuzz-missing-*`/`fuzz-empty-*`/`fuzz-enum-*` variants, merge without touching hand-authored variants/`activeVariantID`/`isEnabled` | **Verified** | unit tests; live pilot on the real sub-flashsale/range pack: 10 variants generated, 9 originals byte-identical |
| Enum-case + unknown-enum-value variant generation | Built (unit-verified only) | the pilot struct has no top-level enum field — never exercised against a real pack |
| Regeneration is idempotent and drops a variant whose field was removed from the model | **Verified** | live pilot: re-run byte-identical; removing `end` dropped `fuzz-missing-end` on regenerate |
| `scripts/qaw-fuzz.mjs fields\|generate` CLI, no dashboard/HTTP route | **Verified** | ran live against the real Swift file + a scratch copy of the real pack |
| `npm test` | **Verified** | 237/237 (37 new) |
| End-to-end payoff: generated variant imported + armed live + observed on-device | **Verified** | `fuzz-missing-background` armed live on `GET /backend/content-api/sub-flashsale/range` (device: QA · iPhone 12 Pro Max), Flash Sale revamp screen → "QA Sub Flash Sale A" card rendered cleanly with no background image and no layout break — graceful degradation confirmed, not just a generated-JSON check. Rule disarmed afterward, scratch pack discarded. |

**Open:** no `/api/lens/fuzz` route or Mac Network console button (CLI-only in v1, by design — see D-155); no recursion into nested/array-of-struct fields; enum-variant generation unverified against a real pack (no real struct piloted has a top-level enum field).

**Environment note (found during the live-render verification, not a D-155 defect):** `tools/networklens-mcp`'s own device resolution (`lens_status`/`lens_mocks`/`lens_import_pack` MCP tools) got stuck pinned to a stale, since-shutdown simulator while two simulators were briefly booted at once, and didn't self-correct after only one remained booted — `bootedAppContainer`'s "most recently written trace wins" tie-break (`tools/networklens-mcp/dist/container.js`) appears to be read once and not refreshed per-call in practice. The qa-dashboard server's own device resolution (`/api/lens/state`, `armVariant`) stayed correct throughout and is what this verification actually went through. Workaround used: the dashboard's HTTP API (`/api/lens/rule`, `/api/macros/v2/:id/replay`) instead of the `networklens` MCP tools. Not re-filed as a tracked bug here since it's upstream of this plan's scope — worth a look if `lens_status`/`lens_mocks` ever again disagree with `/api/lens/state` on a live device.

## Case requirements — SF cases log in first (D-153)

- **Built:** `QAMacros/case-requirements.json` (`^SF-` → logged in + `reloadHome`), `lib/case-requirements.js`,
  `reloadHome` in `resolvePreconditions`, shared `meetPreconditions` used by `replay-v2` and `qa-run` (Claude told
  preconditions are met). Tests: `case-requirements.test.js`, 2 new in `preconditions.test.js`; suite 200/200.
- **Verified (Claude run, 2026-10-17):** SF-020 from logged out → preconditions logged in + relaunched (2 m 47 s), Claude
  told so and skipped its own login checks: PASS in 4 m 16 s / 29 turns / $1.06 vs 13 m 48 s / 94 turns / $3.82 before.
- **Verified (replay, 2026-10-18):** SF-001 from logged out (via `mc_FD3GLFFJWN`) → `replay-v2` precondition logged in
  on PROD + relaunched Home, then the case's own mocks/steps ran: PASS in 150.6 s.
- D-154 **Verified:** single Claude runs file proof into `<batch>/<case>/` (SF-020 screenshot 03).
- D-152 **Verified:** "Code prepared" green again after ignoring `**/.claude/**` and re-preparing.

## Tutorials and tour coverage (D-151)

| Feature | State | Evidence |
|---|---|---|
| Network and Claude tutorials (auto on first visit, in the ? menu) | Verified | both started in a separate instance |
| Updated tips: Test Batch, Split View, ⌥ + scroll, Snapshot, Claude session | Built | build + lint; catalog reviewed |
| Tour: phone, usage bar, session watching, phone guard rails, step 7, Start action | Verified | read back over AX in the tour |

## QA from the Claude mobile app — Remote Control (D-150)

| Feature | State | Evidence |
|---|---|---|
| Server supervises `claude remote-control` (start/stop, status, links, survives server restart) | Verified | live: connected 1/32, links; restart → adopted |
| Plugin guard + session note for TestForge-started sessions | Verified | real marked sessions: note received; `git push` stopped |
| `qaw` (runs, results, proof, screenshot, batch, TestForge sessions: pending/approve/deny/answer/tell) | Verified | read commands on :4545; approval flow on :4646 copy |
| Repo skill `testforge-remote` | Built | loaded by the session note; not exercised from a phone |
| Mac Remote Control button + panel (QR, Open, Copy, mode, on/off) | Built | build + lint 0; panel not seen on screen |
| TestForge sessions joining the Claude app (hand-off) | Deferred | SDK bridge is alpha + needs the access token |

## Claude usage bar (D-149)

| Feature | State | Evidence |
|---|---|---|
| Bottom bar: model, ctx, hr, wk like the CLI line; amber/red levels; View › Show Claude Usage | Verified | sample tap on :4646 copy; live edit reflected; toggle works |
| Account (email · plan) + Remote Control on/off per CLI session | Verified | real identity + `~/.claude/sessions`: rc on (1/2) |
| Tap polled every 5 s; Connect adds the tap line to the status-line script (asks first) | Built | install logic tested (195/195) and dry-run on the real script; not installed |

## Claude sessions in the app (D-147)

| Feature | State | Evidence |
|---|---|---|
| Session switcher (assistant + runs/triage), waiting-first | Verified | :4646 copy: a waiting task listed and opened |
| Details switch / expandable tool input + result | Verified | Bash call expanded to its full JSON input |
| Approvals / questions for any session; sidebar badge | Verified | badge 1 → Deny → nothing pending, file not created |
| Message / quick replies to a run's session; reopen a closed one | Verified | "Explain…" answered; closed → reopened → answered with context; 189/189 |
| Notification per new request, click opens the session | Built | banner not observed |
| Tests › live steps "Claude session" button | Built | needs a real Claude run |

## Measure fixes (D-143)

| Feature | State | Evidence |
|---|---|---|
| Snapshot sheet: "Saved as …" + Show in Finder after saving (D-146) | Built | build + lint; save panel not driven |
| Icon pieces, edge strips and specks never become "views without id" (D-145) | Verified (merger on a live capture) | iPhone 17 Pro Home: 207 → 56 boxes; icons whole, pieces dropped |
| ⌥ + scroll zooms the Measure canvas (D-144) | Built | build + lint; waits for a real ⌥-scroll |
| Layer pass drops boxes that cut a text line read by Vision (text never split into "views without id") | Built | detection verified on the QA clone's screen (user's box dropped); full Measure capture not re-run |

## Accessibility IDs in codegen skills (item 3: D-142)

| Feature | State | Evidence |
|---|---|---|
| IDs on every view, children never collapsed (`ignoreSubviews: false`, SwiftUI `.contain`), review check | Deferred — until the setup is integrated into develop (user) | scope and open choices in D-142 |

## Arrange with Simulator (item 7: D-137)

| Feature | State | Evidence |
|---|---|---|
| Labelled Arrange toggle (toolbar + menu ⌥⌘A); off restores both windows and the sidebar | Verified | separate instance: frames before / on / off measured, exact restore |
| Arrange = macOS Split View: Simulator full-screen **right**, TestForge left; off leaves it (D-140, D-141) | Verified | user's TestForge, from a stuck full-screen QA clone: on → QA 892–1512 pt right, TestForge 0–880 left; off → both back on the desktop |
| Arrange leaves full screen (and returns to it), joins the Simulator's desktop (D-139) | Verified (as part of D-140) | full screen → Split View → off ran on the user's screen |
| "Which Simulator?" prompt when several windows are open; off restores the picked one (D-138) | Built | dialog + Cancel seen; two-window list + pick not yet (windows were on another desktop) |
| Simulator bridge prefers the test device's window (Arrange, Measure, outline) | Verified (Arrange) | with iPhone 17 Pro + QA clone open, only the QA clone moved |

## Android QA driver (item 5: D-136)

| Feature | State | Evidence |
|---|---|---|
| Spec `docs/android-driver-spec.md`: architecture, 20-command parity table, registry + host steps, server/Mac changes, phases A0–A6, open questions | Written — parked, docs only until development is picked up | Built from QADriverRunner.swift, driver-host.js, macro-v2.js, readiness.js, android.js; nothing Android runnable on this Mac (no adb) |

## Onboarding (item 4: D-134)

| Feature | State | Evidence |
|---|---|---|
| Welcome tour sheet: 7 pages, QA / Developer role, start actions (D-134) | Verified | separate instance on :4646: auto-shown on first launch, 7 pages screenshotted, Ask Claude → Claude section + seen flag, reopened from ? menu and Help, not shown on relaunch |
| Get ready shows the server's reason for a refused fix; clears when ready (D-135) | Built | `swift build` + lint 0; not yet seen in the user's app |
| NetworkLens pinned to the test simulator at server start (D-135) | Verified | :4646 copy, fresh start + immediate calls read: no "2 booted simulators" guess |
| Tour workflow steps carry "Needs Claude ✓/✗" with notes (D-148) | Verified | Developer page rendered in a separate instance |
| Screen tips wait for the tour (D-134) | Built | guard in `sectionDidAppear`; no tip appeared under the sheet in the run above |

## NetworkLens console (D-125 plan, D-126…)

| Phase | Feature | State | Evidence |
|---|---|---|---|
| C | Bubble parked over the status bar before every replay / Claude run | Verified | SF-024 PASS after the bubble was put back on the carousel arrow; 150/150 |
| A | Dashboard owns 8788, `/api/lens/*`, `qaw-lens` CLI, app-defaults fix (D-127) | Verified | health polling, 6 rules, calls + curl, live mock → restore on the QA clone; app-defaults probe; 157/157 |
| A | Claude run prompt uses `qaw-lens` first | Built | not yet exercised in a Claude run |
| A | Mac Simulator › Saved settings on the app's own plist | Built | `swift build` + lint clean; app not relaunched |
| B | Network section: health strip, traffic + call detail, rules + answers, editor (D-128) | Verified | driven over AX on the QA clone: health, rows, detail, rule on/off live, editor Save as copy → Delete |
| B | Scenarios bar (save / apply / delete with app restart) | Built | API verified on the clone; not clicked in the UI |
| B | Mock this call, time-shift, All off / Reset to pack | Built | API verified on the clone; not clicked in the UI |
| E | Trackers: `/api/lens/trackers*`, `qaw-lens trackers`, Mac Trackers tab (D-129) | Built | lib verified on a real 12 MB trace (21 IDs, batch split, contract problems, markdown); 173/173; tab rendered + Check → server answer seen on screen; full live run needs the test simulator booted (QA clone was shut down) |
| — | Section tops no longer under the toolbar (D-129) | Verified | screenshots: Network strip + Simulator cards below the toolbar |
| E | Android lens | Not built | no adb on this Mac — can't be verified here |
| D | Fork verbs: breakpoints, replay, ui.bubble, scenario removal, poll identity (D-130, D-131) | Verified | QA clone on `qa-mocker-testing-4`: hold → release edited (500 landed) / fail offline (transport), replay 200, held replay → in flight then 503, bubble hide/show by screenshot; live scenario delete not yet exercised |
| D | Queue targets the test simulator; health names an unidentified / other-simulator app (D-130, D-131) | Verified | `isIdentified true` on the clone, old iPhone 17 Pro app listed as other and no longer able to take its commands; 180/180 |
| D | Mac Breakpoints tab, Replay + Hold this call, strip identity warning (D-130) | Built | `swift build` + lint 0; bundle rebuilt; not seen on screen (window on another Space) — the server routes behind it are verified |

## Measure accuracy (D-123)

| Feature | State | Evidence |
|---|---|---|
| Spacing on the scale (0, 1, 2, 4, multiples of 4), raw numbers | Verified | Flash Sale Sub-FS title: 12 / 12 inside the card, 28 from the screen (code: 12, 12, 16 + 12) |
| "Spacing to glyphs" for text | Verified | same title: top 16 to glyphs vs 12 to the line box |
| Snapshot + numbered notes on the image + Save / Copy PNG (D-124) | Verified (partly) | Copy image → 1259 × 693 PNG with crop, outline, 12/12/20/252, title + time. Pins + Save not driven |

## Test device + runner-free Measure (D-120)

| Feature | State | Evidence |
|---|---|---|
| Test device choice (`/api/test-device`), every simctl call by UDID, other booted sims allowed | Verified | switched to the dev sim and back via the API; readiness followed both ways; `npm test` 147/147 |
| Simulator screen opens on the test device, "Used by tests" / "Use for tests" / "Back to the QA clone" | Verified (partly) | relaunched app: opens on "QA · iPhone 12 Pro Max" with "Used by tests". The two buttons not pressed in the UI (same API as above) |
| Measure + flow map read the window's device from CoreSimulator (no runner) | Verified | Measure on the dev simulator (no runner): 428 × 926, 17 elements, layer pass |
| A full test run on a non-clone device | Not yet | needs Install for testing on that device |

## Device-independent replays (D-119)

| Feature | State | Evidence |
|---|---|---|
| Relative placement + nudge-into-view on "not hittable" (tap / type / scrollTo), both directions | Built | `test/viewport.test.js` 4/4 (same macro on 932-pt and 667-pt windows), `npm test` 145/145. Not yet run on a second simulator |
| Runner `within` (container-scoped lookups, child by type + position) | Built | Blibli-Utility `ac1740b`, tag `qa-mocker-testing-6` pushed, app re-pinned; typecheck clean; not installed (Install for testing on 2026-10-16) |
| Flash Sale app ids: `FS_SubFlashSaleCard_<n>`, `FS_SubFlashSaleProduct_<n>`, `FS_SpecialPlacementProduct_<n>`; merchant row `.contain` | Built | SwiftLint clean; not built into the QA app yet |
| Engine: anchored chain → `within` | Built | `test/viewport.test.js`, `npm test` 146/146 |
| Flash Sale registry switch (below) | Pending | after tag `qa-mocker-testing-6` + re-pin + Install for testing; then re-run SF-011/024/025/026/027/035/054/061/062/084/090 |

Planned Flash Sale locators (apply after the rebuild; verify each order with one `dumpTree`):

| Element (registry id) | Today (text) | New locator |
|---|---|---|
| Onboarding Skip (`el_S24SK1P5MD`) | Skip / Lewati | `fsOnboardingTooltip` › button #0 (secondary button — check order) |
| Today tab (`el_SF90TDAY01`, `el_SF090TDAY1`) | Today / Hari ini | `FS_Shared_TabRowContainer` › button #0 |
| Tomorrow tab (`el_E5INNIBXH7`) | Besok / Tomorrow | `FS_Shared_TabRowContainer` › button #1 |
| Refresh prompt button (`el_6EFTHBJJGW`) | Refresh / Muat ulang | `FS_RefreshPromptContainer` › button #0 |
| Sub-FS card titles A / B / C / SF062 | fixture text | `FS_SubFlashSaleCard_<n>` › `FS_Shared_SectionHeaderTitle`; macros change `waitFor <title>` → `assert` label = fixture text |
| Mini card price (`el_S54PC1M7QX`) | Rp1.640 #0 | `FS_SubFlashSaleCard_0` › `FS_SubFlashSaleProduct_0` |
| Special Placement first product (`el_S35C8RD6HN`) | merchant row image #1 | `FS_SpecialPlacementProduct_0` |
| Empty state "No products here yet" (`el_FFPOSE3Z7Y`) | text | container id still to find (product grid empty state) |
| Product card "Beli sekarang" (`el_FFPOSEF79Y`) | text | needs a product-grid card id (`FSProductGridView`) — not added yet |

Text-only / index locators by area (uses): Flash Sale — onboarding Skip (5), Today/Tomorrow tabs (3), Sub-FS card
titles A/B/C/SF062 (13, mock fixture text), Refresh button (1), product card "Beli sekarang" (1), empty state (3),
Special Placement first product (index, 1), mini card price (text+index, 1). Login — error sheet title / Try again /
Continue as guest (11), "Lanjut dengan nomor HP" (1), "Lanjutkan" (1), skip-login Continue (2), AutoFill (1, system UI).
Onboarding Skip (2). About Blibli — logo/version card, PROD / PRE PROD / UAT B options, sheet title (3). Settings —
"Log out now?" confirm (index, 1).

## Waiting on the user (2026-10-16)

| Item | State | What is needed |
|---|---|---|
| D-117 flow map: tap → element, screen match/name, edges, tree | Built | user records 4–5 screens by hand; then review `flow.json` |
| D-118 proof viewer: pinch, double-click, speed, open/reveal | Built | user tries them; zoom buttons + playback already Verified |
| Commit D-114…D-118 | — | user says "commit" |

## R4g: App icon (D-111)

| Feature | State | Evidence |
|---|---|---|
| 1024 icon drawn by `scripts/make-icon.swift` → `Assets/AppIcon-1024.png` | Verified | rendered and checked visually |
| `make-app.sh` → `AppIcon.icns` (16–1024) + `CFBundleIconFile` | Verified | 487 KB icns in the bundle; app reopened on :4545 |

## R4k: Video proof for runs (D-110)

| Feature | State | Evidence |
|---|---|---|
| `POST /api/batch {recordVideo}` → one .mp4 per case in `<batch>/<case>/`, evidence `videos` | Verified | live :4545, B1: SF-001 + SF-006 PASS; 67 s 1284×2778 H.264 (115 MB), 128 MB; frame at 60 s = Flash Sale page |
| Recorder SIGINT / no-movie handling | Verified | `test/video-recorder.test.js` (2 tests) |
| Mac Results "Video proof (N)" links | Verified | AX: Results › run 8:12 AM › SF-001 → "Video proof (1)", link `SF-001-…mp4` |
| report.md video lines | Built | not opened yet |
| Record-video toggle on Mac Tests | Not built | Tests has no multi-case run yet (offer) |
| Auto video (Claude runs + interactive replays), D-112 | Superseded by D-113 | SF-054 + SF-061 (Claude) recorded without asking: 3 videos in B1 |
| Video only when needed, filmed over the action window (`lib/video-plan.js`), D-113 | Verified | `npm test` 141/141; dry run: SF-061 films steps 22–27, SF-084 16–20, other 13 SF macros none. Live :4545 SF-061 replay PASS: 1st run exposed the front cap (96 s wait → 60 s clip ended at countdown 00:00:40, no sheet) → fixed with trim-to-end; 2nd run PASS, 58.5 s clip from countdown 00:00:50 to the sheet still up after the swipe |
| Claude films itself per `videoGuidance` (D-113) | Verified | SF-062: 22 s `SF-062.mov`, prompt → reload → new timer fired |
| Case row in the Claude run prompt (`caseRowText`), D-114 | Verified | SF-062 BLOCKED without it (doc unreadable); PASS + learned with it |
| Trim to last 60 s (`trimToLast`, ffmpeg `-sseof -c copy`) | Verified | real simctl clip 60 s → 20.0 s; not hit live (2nd run under 60 s) |
| SF-054, SF-061 learned as macros; repo packs carry `sf061-soon`, `valid-control` | Verified | both replays passed after learning; macro lint 45 macros, 0 errors |

## R4j: Proof folder + Test Batches (D-109)

| Feature | State | Evidence |
|---|---|---|
| Readiness: "Proof folder chosen" + "Test Batch active" block runs | Verified | :4646 copy: both ✗, `ready: false`; macro replay → 423 |
| `POST /api/settings/proof-root` (validation) | Verified | `/Users` → "too broad"; scratchpad folder accepted |
| Start / attach / end → `report.md` in `<root>/<batch folder>/` | Verified | :4646 copy: batch "R4j check: flash sale", a Claude chat attached (1 item), end wrote report.md with the table |
| `QA_MEDIA_ROOT` follows the active batch; Reset keeps the active folder | Built | unit tests (`test/test-batches.test.js`, 4 tests) |
| Attach: runs + task replays | Verified | live :4545, user's batch "B1": 5-case replay run (SF-001/006/010/011/012) → B1 holds 1 run + 5 macro replays per run |
| Runner proof copied into `<batch>/<case>/`, Results evidence per case | Verified | 3rd run: 5/5 PASS, each case exactly its own screenshot under `2026-10-15_07-35-44_B1/<case>/` (1st run: 0 screenshots, 2nd: SF-012 also claimed SF-011's — both fixed) |
| Attach: Claude runs, scans | Built | same hooks; not yet exercised |
| Mac toolbar pill, start sheet, folder panel, Get ready fixes | Verified | app on :4646 via AX: Get ready › Choose folder… → NSOpenPanel at the suggested root → Choose → server saved it, start sheet opened by itself; Get ready › Start Test Batch… → name "R4j UI check" → Start → folder `2026-10-15_00-45-34_R4j-UI-check`, row ✓, pill "R4j UI check · 0"; pill › End Test Batch… → confirm → report.md written + revealed, pill "No Test Batch" |
| Web fixes (typed path / name prompts) | Built | not exercised |

## R4f: Reset for a fresh run (D-108)

| Feature | State | Evidence |
|---|---|---|
| `GET /api/reset/plan` — 7 items + repo info row, sizes, defaults | Verified | :4646 copy (fake testforge home + media root): qa-derived 30 MB, qa-copies 5 MB, sim-attachments 138 MB, proof-media 2 MB, Xcode DerivedData 24 GB, SwiftPM 2.4 GB, repo "darshan/innovation/qa-mocker · 16 uncommitted file(s) — left alone"; ~9 s |
| `POST /api/reset` refusals (unknown id, empty) | Verified | `{"error":"unknown items: ../etc"}`, `{"error":"choose at least one item"}` |
| Reset job: old QA copies + run history | Verified | :4646 copy: fake copy deleted (5 MB), 20 result runs / 16 tasks / 2 sessions / 307 history entries cleared, `/api/results` → `[]` |
| Runner-stopping items (QA build output, runner screenshots, proof media) | Built | unit test (fake runner stop + fake media root); not pressed on the live QA sim |
| Too-broad `QA_MEDIA_ROOT` refused + not measured | Verified | `test/reset.test.js` (3 tests) |
| Mac app Build › Reset section (checklist, sizes, confirm, log, result) | Verified | app on :4646 via AX: 4 ticked / 3 not / repo lock, "Reset (179.3 MB)…"; unticked the runner-stopping items, ticked run history → confirm "Deletes Old QA copies, Run history…" → Reset log + "✓ Run history — 0 MB freed"; no runner stop |

## R4e: Build screen (D-101)

| Feature | State | Evidence |
|---|---|---|
| Sidebar › Build (⌘8), QA build state, prepared code, scheme | Verified | live :4545: "Not built, The build output is gone", `darshan/innovation/qa-mocker @ 3616003+72b4`, `BlibliMobile-iOS-PerfTest · PerformanceTest` |
| Build for testing… (confirm dialog → `POST /api/build/qa`) | Built | dialog shown and cancelled; the build itself waits for the user |
| Build log (follows `/api/jobs/:id/stream`), Stop build | Built | needs a running build |
| Xcode info: version, selected developer folder | Verified | "Xcode 26.3 · Build version 17C529", `/Applications/Xcode.app/Contents/Developer` |
| Open workspace in Xcode | Built | not pressed: it opens Xcode |
| Runner no longer records video (QADriver.xctestplan: screenshots, keepNever), D-106 | Verified | after the new build: Attachments 3 MB idle, no growth over 60 s idle; the two demo replays added 151 screenshots (~138 MB, ~70 MB per test) instead of multi-GB video |
| Install for testing (build if needed → restart runner → QA app + runner installed), D-105 | Verified | pressed via AX on the user's go-ahead: "Build first?" → Build and install → TEST BUILD SUCCEEDED 88ac715+b354 in 1006 s → install ran by itself → "The QA app and test runner are installed…"; readiness: installed matches build, runner answers |
| Run without building (⌃⌘R), D-103/D-104 — **removed in D-105** | Verified, then removed | after the user's Xcode run: app relaunched on Xcode's destination (iPhone 12 Pro Max, pid none → 76825), no build; focus back on TestForge. Refusal with no workspace open also verified |
| Install & launch last build (QA build / My Xcode build), D-104 | Verified (My Xcode build) | dev simulator picked on the Simulator screen: `BliBliMobile.app (com.blibli.mobile)` from Xcode DerivedData, `simctl install` + `launch`, pid 76825 → 79563; QA simulator untouched. QA build source waits for Build for testing |
| Clean: QA build output and Xcode DerivedData with sizes, confirm | Built | sizes shown ("empty" for both after the 14 Oct cleanup); delete dialog shown and cancelled |
| Test runner Stop (Start folded into Install for testing, D-105) | Verified | "Stop test runner: Stopped" |
| Fix Swift package errors… (quit Xcode → delete DerivedData + both SwiftPM caches → reopen workspace), D-102 | Built | confirm dialog shown and cancelled (Xcode was open); caches untouched |
| Clean list: Swift package cache, Swift package settings | Verified | rows with paths and sizes (`du -sk` in the console) |
| Tutorial "Building the app" (4 tips), scrolls each tip's section into view | Verified | all 4 shown in order |

## Results: Show in Finder (D-115)

| Feature | State | Evidence |
|---|---|---|
| Evidence `folder` per case (its own `<batch>/<case>/` only, else null) | Built | `npm test` 141/141; :4545 restarted on it; no new run since |
| Mac Results › inspector "Show in Finder" + case-row context menu | Verified | relaunched app (user OK), AX: SF-061 (PASS run) → `…/B1/SF-061` and pressing it opened that folder in Finder; SF-062 (BLOCKED run, proof only in `failures/`) → its failure PNG, shown selected |

## Proof viewer (D-118)

| Feature | State | Evidence |
|---|---|---|
| Proof window from Results (click a screenshot or video) with the case's files, ← / → and a thumbnail strip | Verified | SF-061 PASS run: video link → "SF-061 proof – …mp4 · 2 of 2"; thumbnail 0 → the PNG, Previous greyed on 1 of 2 |
| Image: fit, zoom in/out (×1.25), actual size, pinch, double-click, scroll to pan | Verified | AX: fit 17 % → in ×2 26 % → actual 100 % → out 80 % (scroll bars shown) → fit 17 %. Pinch/double-click not driven |
| Video: play/pause (space), stop, frame steps (, .), scrubber, speed, zoom | Verified | play 2 s → position 2.1 s, button reads Pause; pause holds; frame + → 2.77 s (simctl movies are variable-frame-rate: a "frame" on a still screen is ~0.5 s); stop → 0; zoom in ×2 shown in the capture. Speed menu not changed |
| Open in default app / Show in Finder from the viewer | Built | not pressed |

## Simulator screen revamp (D-116)

| Feature | State | Evidence |
|---|---|---|
| Device card, state badge, Copy UDID, symbol cards in an adaptive grid, icon buttons | Verified | relaunched app: window capture shows the device card (iPhone 17 Pro Max · iOS 26.2 · Booted) and two-column cards; AX lists every old identifier plus the new card/header/badge/Copy UDID ones. Buttons not pressed (they change the phone) |

## Scan flow map (D-117) — feasibility

| Feature | State | Evidence |
|---|---|---|
| Tap → element under it from the Simulator's AX tree | Verified (spike) | `AXUIElementCopyElementAtPosition` on 10 Home elements: 10/10 exact identifier, 3–26 ms each; full tree read 1.1 s |
| Flow map: Record/Stop, first-screen read, device + thumbnail, saved flow.json | Verified | relaunched app, AX: Scan › Flow map › Record → node S01 "Screen 1" (the app's splash: no identifiers, so the fallback name), device "iPhone 17 Pro Max – iOS 26.2", `S01.png` via simctl, `~/.testforge/flows/2026-10-15_16-35-35/flow.json`; Stop → "Continue recording" |
| Tap capture → element, screen settle/match/name, edges, tree, detail, rename | Built | needs real mouse clicks on the Simulator — handed to the user (recording listens to their pointer, so I don't post synthetic clicks on their Mac) |

## R4d: Simulator screen (D-100)

| Feature | State | Evidence |
|---|---|---|
| Device list, QA device preselected | Verified | "QA · iPhone 12 Pro Max · iOS 17.5 · Booted" |
| Color Blended Layers toggle | Verified | on → off → on via the toggle; CoreSimulator read matches; left on |
| UserDefaults read | Verified | `AppleLanguages` in the app domain → "does not exist" shown without the tool's timestamp prefix |
| Write and relaunch, Delete, Relaunch / Kill / Open link, Boot / Shut down, Reset permissions / keychain, Erase | Built | not pressed in testing: they change the phone the user is using |
| Locked during a test or scan | Built | `queue` / `scan` slices |
| Tutorial (5 tips), scroll to top on start | Verified | all 5 shown after the form was scrolled down |

## R4b: demo run (D-099)

| Feature | State | Evidence |
|---|---|---|
| Entry points: Tutorial menu item, Settings › Tutorials › Start demo run | Built | menu item `QAW_Tutorial_DemoItem` pressed via AX |
| Stops when Get ready isn't green, names the check | Verified | live :4545: "Get ready isn't green yet: App + tests built. Use its Fix button…", Get ready opened |
| Batch of SF-001 + SF-006 (replay), banner, Results → Reports | Verified | live :4545 after Install for testing + Shut down the others: SF-001 PASS, SF-006 PASS; banner Demo 1 → 2 (Results) → 3 (Reports, "That is the whole flow") |
| Stop demo cancels the batch | Built | |

## R4a: tutorials (D-098)

| Feature | State | Evidence |
|---|---|---|
| TipKit engine: one tip at a time, Next / Skip tutorial / Done | Verified | AX: popover headings in order, Done → "seen" in defaults |
| Auto-show on first visit | Verified | Get ready, Tests (6), Scan (2), Results (4), Reports (3), Fake data (4), Phone remote (4), Measure (5) |
| ? Tutorial menu per window | Verified | Get ready replay (fresh run number), Console (4), Working beside the Simulator (4), Fake data |
| Settings › Tutorials: auto-show, status, Replay, Reset all | Verified | statuses "Seen"; Recorded steps replayed (3); Reset → 11 × "Not seen" |
| Pause when leaving a tutorial's screen | Built | an unfinished Recorded steps no longer blocks Phone remote's auto-show |
| Advanced panel loop fix | Verified | CPU 99 % → ~1 % after opening Advanced |
| Blended Layers restored after an interrupted pass | Verified | switched off with the pending note → next launch turned it on, note cleared |

## Measure: dashed-border toggle + colour (D-096)

| Feature | State | Evidence |
|---|---|---|
| "Views without IDs" toggle, off by default | Verified | AX value 0 on open; window captures: no dashed boxes when off, dashed boxes when on |
| Colour picker shown only while on | Verified | `QAW_Measure_LayerBorderColor` appears after the toggle, gone when off |
| Picked colour applied to borders | Built | binding into the box style; colour change not driven by automation |
| Views stay selectable while hidden | Verified | canvas element buttons unchanged (75 views) |
| Toggle labelled "Views without IDs" (D-097) | Verified | toolbar checkbox 146 pt wide with title, on the live :4545 app |
| Accessibility attributes section removed (D-097) | Verified | details headings: Screen, Element, Geometry, Spacing to nearest, Hierarchy, Inside each parent, Compared with, Visible container |

## Measure: pixel-grid spacing, thin bars (D-095)

| Feature | State | Evidence |
|---|---|---|
| Spacing snapped to device pixels, halves to even | Verified | Flash Sale card right inset 24.5 → **24** (24.33 on the 3× grid); parent insets and nearest rows use it |
| Thin bars found (`ThinBarDetector`) | Verified | pager pill x 20 · y 431 · 12 × 4, tab underline x 16 · y 128 · 198 × 2, category underlines; 48 → 75 views |
| Pager pill measurable | Verified | 4 inside `FS_Shared_ArrowCarouselPageIndicator`, left **20** to Screen |
| Icon strokes dropped (button/image ≤ 48 pt) | Verified | arrow shafts in the carousel buttons not added |
| 2 pt click slack for thin elements | Built | selection in testing was via AX press |

## Measure: relations to every parent, hover compare (D-094)

| Feature | State | Evidence |
|---|---|---|
| Card with a covered side found (occluded-side fallback) | Verified | Flash Sale card x 16 · y 264 · 387.5 × 150 now a selectable "View without id"; 47 → 48 added |
| Corner radius from the arc walk | Verified | card 0 → ≈ 10 (blendcheck harness) |
| Inset to every parent out to Screen | Verified | card: Left **16** to Screen, Right **24.5** to Screen; "Inside each parent": Visible container, Screen (`QAW_Measure_ParentsSection`) |
| Hover compare: blue lines + "Compared with" section | Verified | checked by the user in the app ("works almost up to 90 % as expected"); not driven by automation (no pointer control) |
| Color Blended Layers state kept | Verified | on before, on after |

## Measure: views without identifiers from Color Blended Layers (D-093)

| Feature | State | Evidence |
|---|---|---|
| Switch Color Blended Layers without bringing the Simulator forward (CoreSimulator `setCADebugOption:enabled:`, option 2) | Verified | instant; front app unchanged; the Simulator's menu press does nothing in the background |
| Background pass with loader: plain + tinted PNG, state put back as it was | Verified | started on → back on; started off → back off |
| Layer boxes from the tinted capture (nearest equal-span sides, top/bottom confirmed, corner arc checked) | Verified | 270 ms on the Flash Sale screen; product images, banner, category tiles, search field, filter button, list images |
| Merge with accessibility elements (radius lent to matches, glyph boxes inside text dropped) | Verified | 85 → 132 elements, 47 added; Measure shows the clean screenshot even when the device is tinted |
| Measuring a view without an id | Verified | "Diskon 90%" box: 4.5 to the title above, 7.5 to the image (itself found from layers) |
| Skipped while a test or scan holds the simulator | Built | guard on `queue` / `scan` slices; not yet exercised during a run |

## Measure: spacing to the visible parent (D-091)

| Feature | State | Evidence |
|---|---|---|
| Visible container found in the screenshot pixels (cards the accessibility tree doesn't report) | Verified | Flash Sale card: x 16 · y 264, edges top/left/bottom; right edge hidden under the NetworkLens bubble, so not claimed |
| Spacing measured to it; neighbours outside it ignored | Verified | first product image: left 28 → **12**, bottom 25 (to the pager) → **12**, top 8, right 8 |
| Corner radius estimate | Verified | ≈ 12 (same value from two different elements in the card) |
| Dashed purple outline of found edges + details section | Verified | `QAW_Measure_VisibleContainer`, `QAW_Measure_VisibleSection` |
| Detector cost | Verified | ≤ 2 ms per selection; no false card for the search field, logo or list rows |
| Off-screen elements hidden (< 50 % on screen), drawing clipped to the screenshot | Verified | 88 → 85 elements; carousel cards past the right edge gone |
| Feasibility: real view tree without identifiers via lldb attach | Verified (probe only) | attached to the app, read `UIWindow` subviews; ≈ 45 s with the app frozen (first expression ≈ 28 s) → not used; see D-092 |

## R3e Advanced: Fake data, Recorded steps, Phone remote (D-090)

| Feature | State | Evidence |
|---|---|---|
| Advanced section with a panel picker (replaces the placeholder) | Verified | three panels switch; ids `QAW_Advanced_*` |
| Fake data: status line + master switch (`status` slice) | Verified | "Fake data is on · 6 rules · app running · changes apply live" |
| Fake data: rule on/off | Verified | sub-flashsale/range off → on → off; server `isEnabled` followed each click |
| Fake data: answer (variant) picker | Verified | invert-mode → timeout → invert-mode; detail read "Fails the request: timed out (-1001)" |
| Fake data: answer detail with the base64 body decoded + pretty-printed | Verified | sub-flashsale/range invert-mode JSON shown |
| Fake data: recent calls (`trace` slice) + response body | Verified | conversion-value call body loaded (`coarse_value`, `lock`) |
| Fake data: Turn NetworkLens on (asks first; relaunches the app) | Built | not pressed — it relaunches the app |
| Recorded steps: list, search, check (lint) | Verified | 43 recordings; "All 43 recordings pass the check"; search SF-011 → 1 |
| Recorded steps: detail (steps, weak targets) + Replay | Verified | SF-011: 15 steps, 2 found by text only; Replay queued → PASS |
| Phone remote: host line, form per command, required fields gate Send | Verified | "Answered by testforge · 0 waiting"; getLabel Send off until identifier filled |
| Phone remote: send + verdict + JSON + history | Verified | deviceInfo OK (QA · iPhone 12 Pro Max, 17.5); missing id → failed "no element … after 10.0s" |
| Phone remote: Relaunch app asks first | Verified | confirmation shown, nothing sent |

Recorded steps and Phone remote were checked by running their view models from Terminal against :4646 (the
window had moved to another Space, where Accessibility can't reach it); Fake data was checked in the window.

## R3d Simulator bridge: Arrange, step outline, Measure (D-089)

| Feature | State | Evidence |
|---|---|---|
| Server: step `target` + `frame` under a lease; run `screen` | Verified | SF-011 replay: 6 elements framed, PASS |
| `GET /api/device/screen`, `GET /api/device/screenshot.jpg`, `POST /api/overlay` | Verified | 428×926; 492 KB JPEG; lease until +90 s |
| Simulator bridge (window, screen group, elements, window number) | Verified | from Terminal: calibrated, 178 elements / 1.7 s; matches dumpTree |
| Measure maths (selectable, container, gaps) | Verified | Back 16/57/24×24, 8 pt to title, Share 12 pt to cart |
| Arrange (sidebar hidden when it doesn't fit) | Verified | window 42→1 053, Simulator at 1 061 (8-pt gap) |
| Step outline panel on the Simulator | Verified | drew step 8 on the Home tab {2,844,82,48}; hidden while the Simulator is on another Space |
| Measure window | Verified | 87 elements; Back 16/57/24×24, gaps drawn; selection via accessibility action |
| Measure zoom (100–800 %, pinch, ⌘−/⌘=/⌘0) | Verified | Login 61 → 135 pt at 225 % |
| Measure details: every accessibility attribute + copy | Verified | Login: identity, geometry, hierarchy, 25+ attributes |
| Simulator menu (⌥⌘A / ⌥⌘O / ⌥⌘M) | Verified | Arrange, Outline toggle, Measure driven from the menu |
| Stable local signing (local certificate) | Verified | grant survived a rebuild |

## R3c Menu bar, finish notification, Dock badge (D-088)

| Feature | State | Evidence |
|---|---|---|
| Menu-bar item: progress (batch + single run), Stop, Open, Quit | Verified | SF-011 replay and a 2-case batch read live from the menu's AX items |
| Finish detection (baseline on launch, batch items not double-announced) | Verified | batch ended with one batch notice, none per case |
| Finish notification (click opens Results) | Built | posted; banner not yet seen — one-time permission needs the user |
| Dock badge = failures, cleared on Results/Tests | Built | passing runs leave it empty (checked via Dock AX); no failing run in the check |
| Settings › General: Show in menu bar, Notify when a run finishes | Verified | toggle removes/restores the item; defaults persisted |
| `MenuBarExtra` binding loop (99 % CPU) | Fixed | binding writes only on change; CPU 0 % |

## R3b Results + Reports (D-087)

| Feature | State | Evidence |
|---|---|---|
| `results` slice (run summaries, branch history, `updatedAt`) | Verified | 2 unit tests; 19 runs streamed to the app |
| `GET /api/results/:id/compare` (auto base: develop, else earlier run sharing a case) | Verified | unit test; app: auto → 2 unchanged, manual → 2 fixed |
| Proof only (probe shots + deleted files filtered) | Verified | run 0c632fbd: 42 → 1 screenshot, shown and opens |
| Mac Results: runs, header, cases, inspector | Verified | screenshots light + dark |
| Review: Accept / Override sheet / Needs re-run | Verified | override with reason + accept → Validated live |
| Re-run failed (confirm) | Built | dialog shown and cancelled; enables on failures or Needs re-run |
| Export report (save panel) | Built | not driven (save panel); Copy report verified |
| Mac Reports: history by branch, compare, preview | Verified | screenshots |
| Publish to my Confluence page (confirm) | Built | dialog shown, cancelled, nothing queued — publish not run (user rule) |
| Console takes extra height in tall windows | Open | `VSplitView` limitation, D-087 |

## Scan mode, appearance, overlay feasibility (D-086)

| Feature | State | Evidence |
|---|---|---|
| `scan_mode.py --events` (plugin) | Verified | EVENT lines streamed live from the QA simulator |
| `scan` slice + `/api/scan/*` + device lock | Verified | 4 unit tests (118/118); lock held during scan, released on stop; replay refused |
| Mac Scan section (⌘3): live screen, Mark/Skip, marked list, last scan | Verified | Start → 185 elements / 13 ids; Mark "Home"; Stop → summary; map saved |
| Settings › General › Appearance (System/Light/Dark) | Verified | dark + light screenshots |
| Layout "Measure" overlay | Not built | feasibility in D-086; recommended for R3d |

## R3a Tests screen + live steps (D-085)

| Feature | State | Evidence |
|---|---|---|
| Loaded document persists (`.data/testcases.json`) | Verified | copy restart restored 96 cases, then a 2-case file |
| `testcases` slice (recording + last run per case) | Verified | 3 unit tests; 13 recorded, last runs shown |
| Mac Tests list: toolbar search, Show filter | Verified | search by id/scenario; "Failed last" → SF-001, SF-060 |
| Case detail + Replay / Run with Claude (confirm) | Verified | SF-001 replay ran; Claude dialog dismissed, nothing queued |
| Live steps pane (narration) | Verified | steps streamed; verdict FAIL shown in list, detail, pane |
| Stop + ⌘R / ⌘. (Test menu) | Verified | Stop → CANCELLED via button and menu; ⌘R started a replay |
| Load document sheet | Verified | local Markdown loaded live |
| Window minimum 1 240 pt (macOS 26 sidebar inset) | Verified | AX frames: split = window width |

## Probes without screenshots (D-084)

| Feature | State | Evidence |
|---|---|---|
| Readiness + harness probes use `deviceInfo` (no PNG per probe) | Verified | harness PASS; session folder count unchanged across 4 probes |
| Old probe PNGs removed | Verified | 3,886 files, 2.6 GB → 192 MB |

## Code-prepared drift = app build inputs (D-083)

| Feature | State | Evidence |
|---|---|---|
| "Code prepared" warns only when app build inputs changed | Verified | 4 tests; :4545 row ✓ "only files outside the app changed since" |
| Age (24 h) warning only for GitHub-branch prepares | Verified | unit test |

## Readiness fingerprints + R2 open checks (D-082)

| Feature | State | Evidence |
|---|---|---|
| Fingerprint memo for the install checks (`.data/readiness-memo.json`) | Verified | 4 unit tests; :4545 6.2 s → 2.2 s, `reused=app,installed` |
| Independent readiness reads in parallel; per-check `durationMs` | Verified | :4646 copy 4.2 s → 2.0–4.0 s |
| Mac app: reused rows say "unchanged since …" | Verified | screenshot on :4646 |
| Mac app re-adopts the server it started (`.data/app-server.json`) | Verified | quit mid-task → server kept; relaunch "reconnected…"; idle quit stopped it |
| Console tail creates `.data/` (first-launch npm output visible) | Verified | clean-folder re-run shows "added 139 packages" |
| VoiceOver labels on console Copy/Clear | Verified | AX: "Copy the lines shown", "Clear the console" |

## v4 R2 — Mac app shell (D-081)

| Feature | State | Evidence |
|---|---|---|
| Swift package + `make-app.sh` → `TestForge.app` | Verified | builds clean, 0 SwiftLint violations (30 files) |
| ServerSupervisor: attach to a running server | Verified | :4545 pid 28243 unchanged; window Live |
| ServerSupervisor: cold start via start.sh | Verified | isolated copy on :4646 → "server up", live |
| Owned server dies → red row + Restart server | Verified | kill → exit code 15 shown; Server › Restart → live |
| Quit stops only an owned, idle server | Verified | ⌘Q stopped :4646; quitting the attached app left :4545 |
| Quit keeps the server when a run is active (#9) | Verified | D-082: Claude task on :4646 kept running across quit + relaunch |
| StateStore: snapshot + patches, reconnect backoff | Verified | 14 slices; reconnect 1→10 s after drop |
| Get ready (C2): checks, progress, Fix buttons | Verified | screenshots; Fix routes = web UI ids |
| Console: tail dashboard.log, filter/search/copy/clear, ⌘⇧Y | Verified | D-082: driven via the Accessibility API |
| Settings skeleton (6 tabs) | Verified | D-082: all tabs opened; Project shows the found folder |
| Readiness fingerprints (#8) | Verified | D-082 |

## Confluence load via Atlassian plugin (D-080)

| Feature | State | Evidence |
|---|---|---|
| Load reads with plugin `getConfluenceContent`, Rovo fallback; write tools denied | Verified | :4545 load of page 2396520535 → 96 cases |
| `parseConfluencePage` handles plugin + Rovo envelopes | Verified | `test/testcases.test.js`; 103/103 |

## SF-028 evidence fix (D-079)

| Feature | State | Evidence |
|---|---|---|
| `assertRequested` macro step (trace since run start) | Verified | Unit test; SF-028 replay: special-placement requested 13:02:40, body `{"data":null}` |
| SF-028 fakes range `loaded` + checks the request; range off in cleanup | Verified | Replay PASS 76 s on :4545 |

## v4 R1 — Live state stream (D-077)

| Feature | State | Evidence |
|---|---|---|
| `/api/state/stream`: snapshot + per-slice patches; probes only while a page is connected | Verified | Isolated copy on :4646: all 15 slices pushed, no errors; unchanged slices not re-sent |
| Page panels from the stream (status/control chips, harness, Claude + target chips, device, mocks, traffic) | Verified | Headless Chrome over CDP on :4646: every panel filled from the stream, no console errors from the page |
| Data polling removed (`app.js`, `device.js`, `identity.js`, `code.js`, `batch.js`); `/api/events` removed | Built | Only display clocks remain on timers (grep) |
| One action lifecycle (phases on tasks, jobs, batch, items) | Verified | SF-028 replay: task and job phase working → done on the stream |
| Plain-words live steps (replay steps) | Verified | :4545 after restart, SF-028 replay PASS: 25 steps narrated live (27 patches, 25 showing the step in progress), skipped steps and 4 cleanup steps marked |
| Plain-words live steps (Claude tool calls) | Verified | SF-028 first run with Claude on :4545: 25 phone/fake-data steps narrated live (D-078); wording fixed for `enabled:false`, `lens_set_mocking` endpoints and `exists:"false"` |
| Claude usage from run events | Verified | Same run: 5-hour 11 % (10 % of window gone), weekly 49 % (35 %), context 7 %, source `claude-run` |
| Optional usage tap file | Built | Unit tests |
| Tests | Verified | `npm test` 99/99 |

## v4 — Native Mac app redesign (D-075)

Design only; no code. Plan: `redesign-plan.md`.

| Item | State | Evidence |
|---|---|---|
| Four direction mockups (A–D) | Done | Design artifact `EPisTUsbZ1rTuov3qvKfwW`; user picked C |
| Option C refined: C1 main window, C2 first launch, C3 beside Simulator, C4 tutorials/settings, C5 symbols + recommendations | Done | Same artifact, boards C1–C5 |
| Recommendations | Decided | All 17 approved; 15 → live Claude usage (D-075, D-076) |
| Usage source found | Done | Status line stdin JSON; headless `rate_limit_event` only near limits → usage tap design (D-076) |
| R0 tutorial scripts (`tutorials.md`) and walkthrough kit (`walkthrough-v4.md`) | Done | Written; walkthrough not yet run |
| R0 boards C6–C14 | Done | Published to the Design artifact (version 9); not yet reviewed by the user |
| R1–R4 build phases | Not started | — |

## P8 — Macro coverage pilot, Flash Sale page (D-070)

| Case | Result | Macro (proven by a driver replay) |
|---|---|---|
| SF-001 one schedule → tabs hidden | PASS | `mc_1RDWNX0B8D` — replay PASS 71 s |
| SF-028 Special Placement null → hidden | PASS | `mc_YHBBZV33R8` — replay PASS 49 s |
| SF-035 Special Placement product → PDP | PASS (re-run; first run stopped at the plugin's skill-audit gate) | `mc_S35P7DQ4K2` — replay PASS 54 s |
| SF-090 Today/Tomorrow labels | PASS (D-071, authored `/flashsale` fixture, retimed) | `mc_SF090TAB01` — replay PASS |
| SF-024 right chevron | PASS (D-071, authored `sub-flashsale/range` fixture) | `mc_S24RCHVN7K` — replay PASS |
| SF-011 inverse toolbar on `invertMode` | PASS (D-073, range `invert-mode` variant) | `mc_SF11K3XQ7M` — replay PASS 183 s (one runner restart) |
| SF-012 single campaign → switching controls hidden | PASS (D-073, range `single` variant) | `mc_S12XQ5V7ZA` — replay PASS 59 s after the cleanup fix |
| SF-006 range fails → only Sub-FS hidden | PASS (D-074, range `500`) | `mc_S006R4N9QX` — replay PASS |
| SF-010 non-inverse toolbar on `invertMode=false` | PASS (D-074, range `loaded`) | `mc_S10NV4R9TZ` — replay PASS |
| SF-025 left chevron → previous campaign | PASS (D-074, range `loaded`) | `mc_S25PRVC3QK` — replay PASS |
| SF-026 circular pager last → first | PASS (D-074, range `loaded`) | `mc_S26WRAPCR1` — replay PASS |
| SF-027 circular pager first → last | PASS (D-074, range `loaded`) | `mc_S27CWR8K3P` — replay PASS |

| Feature | State | Evidence |
|---|---|---|
| Verdict read from a stated `VERDICT:` line only; the run prompt asks for it | Verified | Unit test with the pilot's texts; the re-run's BLOCKED is read correctly |
| Claude batch → learn → prove, unattended | Verified | 3 macros learned and proven; about $10 in total |
| Learn prompt: no needless `requires.session` | Built | 2 learned macros had `loggedOut` by accident; fixed by hand |
| Range fixture pack + `sf090-today-tomorrow-other` in the repo (D-071) | Verified | Both cases PASS on PROD with them |
| Run prompt `MOCK_HINT`: networklens only, repo packs, learned routes; batch passes the tech doc (D-071) | Verified | Batch `7071a759`: Claude armed the range/flashsale variants and entered via Show all |
| Label-only `assert` in macros (D-071) | Verified | Unit test; both proving replays PASS |
| Read-only `networklens` lens tools pre-allowed; `qa-mock` names gone from allow-list and run prompt (D-072) | Verified | Batch `bb616d35`: both Claude runs armed mocks through `networklens`, no qa-mock errors |
| Plugin reinstalled from source; `qa-mock` removed from the plugin (D-071) | Built | `harness.py` honours `QA_DERIVED_DATA`; no run yet without qa-mock |

## P9 — Saved setups + ▶ Run again (D-067)

| Feature | State | Evidence |
|---|---|---|
| 💾 Save as setup… (Test Cases) → `.data/setups.json`; same name replaces | Verified | "Home smoke (HM-901)" saved; a case that isn't loaded is refused |
| Home "Saved setups" card, ▶ Run again, 🗑 | Verified | Headless page: card + button render, no JS errors |
| Run again: prepare if needed → reload document → gate → batch | Verified | Re-prepared + reloaded → HM-901 PASS (156 s); the card shows the last run |
| Run again stops on a stale build, never builds | Verified | After a code change: "press Build", job ends with the gate's reason |
| Fresh readiness request never reuses an older in-flight check | Verified | Unit test; it was letting a stale build through |

## D-068 / D-069 — Claude runs and build staleness

| Feature | State | Evidence |
|---|---|---|
| `qa-run` sessions drive the QA simulator + QA build (flag settings beat local `QA_DEVICE_UDID`) | Verified | The pilot sessions' `qa_status`: `target device: AC2A1B55…` (the QA simulator) |
| A `/qa-run` with no verdict line → UNDECIDED | Verified | SF-024 in the pilot |
| Build stays current when only `tools/` changed (`buildInputId`) | Verified | Unit test; live: build `+5b6d`, then a `tools/` edit → code `+06c6`, build still current, ready |

## P7 — Hardening (D-066)

| Feature | State | Evidence |
|---|---|---|
| A frozen runner no longer blocks a test: the `harness` check warns (`selfHeals`), and the device lane restarts the runner before step 1 | Verified | Runner stopped → Open Home replay logged "↻ … restarting it", then PASS in 5.7 s |
| Client waits 45 s on run/replay/batch/re-run (the gate's probe can take 25 s) | Built | — |
| networklens MCP finds the TestForge build of NetworkInterceptor | Verified | `resolve-checkout.sh` → `~/.testforge/derived/…/NetworkInterceptor`; `mcp-server.sh` answered `initialize` |
| Unit test: a harness check that can't be probed still blocks | Verified | 79/79 |
| QA build re-checks out a package whose cached checkout ≠ `Package.resolved`; one retry with a cleared package cache (chmod first); runner stopped before building | Verified | The rebuild on `0bfd92e` hit all three (stale `280a4e1` checkout, read-only half-deleted cache, runner racing SwiftPM); after the fixes: TEST BUILD SUCCEEDED in 952 s |
| Rebuilt on NetworkInterceptor `0bfd92e` (1.0.0 + QA fix) | Verified | Open Home, SF-084, Demo 3 (500), mocked auth 500, skip-login Continue, Log out: 6/6 PASS; the mock pack is intact on the device; the heal restarted a frozen runner mid-sequence |

## Dry run — 2026-10-12, after D-065 (installed build `ec16344+ac99`, not yet rebuilt on `0bfd92e`)

| Check | Result |
|---|---|
| Unit tests | 78/78 pass |
| All 8 tabs (headless Chrome) | Render, no JS errors. Fixed: the readiness banner printed a literal `null` (`replaceChildren` given `null`; now filtered) — Verified |
| Readiness, macro lint (31 macros, 0 errors), `/api/launch-inputs`, mock pack (4/4 in repo + on device) | OK |
| Driver replays, one app session | 12/12 PASS: Open Home 4.9 s, HM-901, SF-084, Demos 1–5, mocked auth 500, skip-login Continue / tap-outside, Log out. No needless relaunch. $0 |
| Batch (replay mode) → results → Accept → report.md | HM-901 PASS, run Validated, report correct. Publish not run (user rule) |
| Not exercised (cost Claude) | Claude-mode case, triage follow-up, learn follow-up |
| Fixed in P7 (D-066) | The runner wedged once after 11 replays (alive, 0% CPU, collecting nothing); not reproduced by repeating Log out. The next test now restarts it itself. |
| Fixed in P7 (D-066) | The networklens MCP (`.mcp.json`) failed to start: `resolve-checkout.sh` found no NetworkInterceptor checkout. It now also finds the TestForge build. |

## Phase 1 — Live control, driver console, launcher — ✅ done

| Feature | State | Evidence |
|---|---|---|
| Live mock control via :8788 (toggle, arm, variant, enable, delete) | Verified | Master toggle + variant switch returned `live: true` against the running app |
| File fallback when app unreachable | Verified (v1) | Create/delete round trip on `session.json`, 5 existing rules untouched |
| Live traffic table + "Mock this" | Verified | Trace entries read from the app container |
| Driver Console — all 22 command kinds | Built | Error path verified (harness down → clean JSON error); no live command yet — harness not built |
| Harness status / ensure / stop / logs | Verified | Ensure correctly reported the missing test bundle |
| `QA Dashboard.app` launcher | Verified | Cold launch from Finder starts server, dialog shows status, browser opens |

## Phase 2 — Test cases — ✅ built, partially verified

| Feature | State | Evidence |
|---|---|---|
| Markdown table parser | Verified | Synthetic table |
| HTML / Confluence table parser | Verified | Real page 2396520535 → 96 cases, all 9 columns mapped |
| Load from Confluence URL — via headless Claude + Atlassian connector (no token) | Verified | Page 2396520535 → 96 cases, all 9 columns, 9 s, $0.07; read-only tool allowlist |
| Load from Confluence URL — REST fast path | Built | Only when `CONFLUENCE_EMAIL` / `CONFLUENCE_TOKEN` set (not set) |
| ▶ Run (headless `/qa-run`) + SSE streaming | Built | SSE plumbing verified via Replay; no real Run executed yet (consumes usage) |
| ⚡ Replay (macro) | Built | Unresolved-macro path verified (`BLOCKED`); no macros recorded in repo yet |
| Run selected (sequential) | Built | — |
| Run history (`.data/runs.json`) | Verified | Entry written and listed |

## Post-Phase-2 hardening (2026-10-07)

| Change | State |
|---|---|
| `.env.local` sourced by `start.sh`; `.env.local.example` committed | Done |
| `QA_ALLOW_AUTONOMOUS_CLAUDE=1` on author's machine | Done — confirmed in server env |
| Scheme defaults → `BlibliMobile-iOS-PerfTest` / `PerformanceTest` | Done — confirmed in server env |
| "Build test bundle" button (streamed `build-for-testing`) | Built — not run (slow; user's click) |
| `/api/media` for screenshot previews | Verified (200 for png, 400 for non-media / traversal) |
| GUI-launch PATH fix in `start.sh` | Verified (cold launch) |
| `activate me` in launcher | Verified (dialog appears in front) |

## Loading & status states (2026-10-07) — ✅ verified

Verified in headless Chrome over CDP against the live server and running app: no JS exceptions, no
horizontal overflow at 1400 px or 390 px.

| Feature | State | Evidence |
|---|---|---|
| Header chips (server / app / control / harness) + tab dots | Verified | Settled to `online / running / live / stopped`; Driver tab shows warn dot |
| Offline bar + auto-recovery | Built | Logic in `request()`; not exercised by stopping the server |
| Skeletons → rows / specific empty / error + Retry (mocks, traffic, history, cases) | Verified | Skeletons rendered, then rows / "No runs yet" |
| Mocking toggle busy + revert-on-failure, live vs. relaunch toasts | Built | Toggle disabled until first status (verified); not toggled in this pass |
| Arm mock inline JSON validation | Verified | Invalid JSON → inline error, no request sent |
| Mock row busy / revert / remove confirm | Built | — |
| Harness buttons locked with elapsed timers; concurrent lifecycle 409 | Verified | Second concurrent Ensure → 409 "already in progress" |
| Build test bundle — streamed, cancellable | Built | Not run |
| Driver commands — one at a time, outcome toasts, "Ensure first" hint | Verified | Device info with harness down → error toast + hint |
| Load — progress text, skeleton, specific error hints, success summary | Verified | Missing file → hint; sample → "Loaded 2 case(s) · 0 macro(s)" in 103 ms |
| Case badges, button locking, n-of-m progress, Cancel (also clears queue) | Built | Needs a real Run |
| Replay without macro → guidance toast | Verified | "No macros are recorded yet — record one with /qa-macro." |
| Reload restores tab, paths, loaded cases; re-attaches to running jobs | Verified (restore) | "2 case(s) still loaded on the server"; job re-attach not exercised |
| `POST /api/jobs/:id/cancel`, `GET /api/jobs/active` | Verified | 404 for unknown job; `[]` when idle |

Fixed along the way: XSS via captured URLs in the traffic table (D-019); slow first plugin-script
lookup (D-020); `[hidden]` busy lines rendering anyway; stretched checkbox; grid overflow.

## Streaming ▶ Run (2026-10-07) — ✅ built

| Feature | State | Evidence |
|---|---|---|
| `claude -p --output-format stream-json --verbose`, stdin ignored | Built | Server restarted on new code; no real `/qa-run` yet (consumes usage) |
| `lib/claude-stream.js` formatter + line splitter | Verified | Real CLI stream (haiku probe) fed in 37-byte chunks → session/MCP line, `→ Bash echo probe-ok`, `← probe-ok`, `■ finished · 2 turns · 4s · $0.06` |
| Verdict from `result` event, fallback to tail | Verified | Probe → `PASS` |
| History `turns · duration · $cost`; progress line shows current tool | Built | — |
| Markdown parser picks best-scoring table (page has a metadata table first), handles `<br>` and `\|` | Verified | Same page via Rovo markdown → 96 cases |
| Load progress UI: live Claude step + elapsed in load status, transcript in Run output; resumes after reload | Built | Server side verified via SSE; UI not driven in Chrome yet |
| Load error for missing Confluence credentials: one short message + token link (was repeated twice with full URL) | Verified | `POST /api/testcases/load` with page URL → `could not load Confluence page 2396520535: Confluence credentials not set …` |

## v2 TestForge (2026-10-07) — ✅ built, mostly verified

Replaces the planned Phase 3 context panel. Plan: `~/.claude/plans/partitioned-strolling-pearl.md`.

| Feature | State | Evidence |
|---|---|---|
| Live Agent SDK session, multi-turn context | Verified | Session in scratchpad: turn 2 recalled turn 1's filename |
| Approval card → Deny honoured | Verified | Bash `touch` → `waiting-approval` → deny → file not created |
| Resume after dashboard restart | Verified | Same session, new process, answered "RESUMED: engine-test-file.txt" |
| Claude's questions (AskUserQuestion) as option cards | Verified (Chrome) | Picked "Blue" → "You picked Blue." |
| Hard deny of Confluence writes on page 2396520535 | Built | Unit logic only — not exercised against Claude |
| Always-allow per project | Built | — |
| Sessions UI (list, transcript, tool cards, markdown, composer, interrupt, close) | Verified (Chrome) | No JS errors; 1400 / 390 px no overflow |
| Task queue: device lane serial, general ≤ N, move / cancel / retry, FIFO device lock | Verified | Unit test with fake executors: maxDevice 1, maxGeneral 2, chat waited for D1, console `tryAcquire` false while held |
| Queued `claude` task end to end | Verified | haiku task → session → "QUEUE OK", $0.016 |
| ▶ Run / ⚡ Replay via device lane, session mirrored into Run output | Built | No real `/qa-run` (harness not built) |
| Driver Console 409 while device held | Verified (unit) | — |
| Projects tab (19 repos, workspaces, branch, dirty) — replaced the Work tab | Verified (Chrome) | 19 rows; tabs Home · Sessions · Queue · Projects |
| Open in Terminal / Reveal in Finder | Built | Not clicked (opens windows on the desktop) |
| Device rail: booted device, live mirror, holder — **mirror to be removed in P1 (D-033)** | Verified (Chrome) | iPhone 17 Pro Max · iOS 26.1, frame rendered |
| Ask Claude about this screen (image attachment) | Verified (Chrome) | haiku described the home screen |
| Deeplink / Dump tree / Relaunch from rail | Built | Harness not running |
| Home overview + desktop notifications | Verified (render) / Built (notifications) | Cards: Needs you, Tasks, QA results, Sessions |
| Jira + PR views removed (D-030) | Done | `/api/jira` → 404; no JS errors |

| Simple loader: one ring spinner everywhere; tables show a centred "Loading…" row instead of shimmer skeletons | Verified (Chrome) | Table, header chip and busy button rendered; no JS errors |
| Busy lines (harness / driver / run progress): no spinner, text left-aligned — the old `span:first-of-type { flex: 1 }` stretched the spinner into a huge spinning diagonal | Verified (Chrome) | Harness busy line: text 812 px, Cancel 63 px, no spinner |

## v3 Guided workflow — ✅ design signed off (D-039); P1 + M0 in progress

| Item | State |
|---|---|
| `docs/workflow-plan.md` — 7-step flow, linkage chain, checklist, validation, failure catalogue, phases P1–P6 | Written — awaiting review |
| `docs/usage.md` — amateur guide (✅ today / 🚧 designed) | Written — awaiting review |
| Static clickable prototype `docs/prototype/index.html` (gate §10.1) | **Built, v6** — v6 adds the Home tab (opens by default; start actions, Needs you, Recent runs, Macros) and renames the local source to "A local repository (git working copy)" (D-037); Home exercised in headless Chrome at 1400/390 px (start actions, tab switching, open a recent run, replay from Home, Running-now card), earlier flows re-run; no JS errors, no overflow. v4 adds the prompt section + Macros (D-036), exercised in headless Chrome at 1400/390 px: prompt validation (text + ticket), run records 6 steps, verdict change needs a reason, Save-as-macro blocked until reviewed, replay without Claude, repair → approve → continue; no JS errors, no overflow. private Artifact https://claude.ai/artifact/PG3DEEYHbW1mh2ojvSJHkt. v1: 7 step cards. v2: mirror removed (D-033). v3: redesigned after the user could not tell how to start v2 — three questions (GitHub branch **or local folder**, D-034) + one Run button + automatic progress list that skips done stages and stops only when needed (D-035). Exercised in headless Chrome at 1400 px and 390 px: first run → approval card → 8 results; repeat run skips code/build/device; VPN retry, build-fail retry, disk fix, busy auto-wait, unclear columns, local drift; no JS errors, no horizontal overflow. Not yet reviewed by a human |
| Task walkthrough with 1 amateur QA + 1 developer (gate §10.2) | **Waived by the user (D-039)** — kit `docs/walkthrough.md` ready; used at the end of each phase instead |
| Open decisions §11 answered | ✅ Done (D-032): isolated QA copy (independent clone + QA simulator), deps auto, overrides with reason, file + personal Confluence, remote branches, one device |
| Sign-off decision entry | ✅ D-039 (2026-10-08) |
| Implementation P1–P6 | **P1 built; closure items built (walkthrough open)**; **P2 verified**; **P3 verified (D-055)**; P4–P6 not started |
| Feasibility study: QADriver macros with generated element IDs + prompt section (`docs/feasibility-macros.md`) | **Written; §8 answered (D-038)** — macros in the repo (not the app), QADriverKit via qa-mocker-testing tags, Load Jira (Bug only), visual macro map before saving. Prototype v8 shows both new UI pieces; exercised in headless Chrome at 1400/390 px (Improvement ticket rejected, Bug ticket loads and pre-fills, map 6 steps / 3 screens, Map → Replay; no JS errors, no overflow) |

## v3 P1 — Question 1 "What code?" (2026-10-08, D-041)

| Item | State | Evidence |
|---|---|---|
| `lib/qa-copy.js`: GitHub branch → `~/.testforge/checkouts/<repo>` (clone `--reference --dissociate`, detached checkout) | **Verified** | Real repo: `darshan/innovation/qa-mocker` prepared in 48 s at `bee7d07` (GitHub tip; local-only commits correctly absent) |
| Local repository snapshot → `<repo>-local`, uncommitted + untracked included, ignored excluded | **Verified** | Real repo: 11,421 files, 22 uncommitted included, id `28f5c17+9650`; repeat run "already up to date" in 4 s; developer repo HEAD / status / index mtime unchanged |
| Dependencies only when needed (Swift packages, CocoaPods, Carthage) | **Verified** | Real repo: `SwiftPackages.sh download` ran once per copy, Pods skipped (manifest = lock) |
| Branch list (local refs) + ↻ Check GitHub (`ls-remote`) | **Verified** | 875 branches from the real repo; refresh path unit-tested against a local origin |
| Local drift warning ("your working copy changed since this snapshot") | Built + unit-tested | `test/qa-copy.test.js` |
| Routes `/api/code/{repos,branches,current,prepare}` | **Verified** | curl + UI |
| UI: Question 1 card on Test Cases (source toggle, repository, branch search, prepare progress list, ready summary, LOCAL CHANGES chip) | **Verified (Chrome)** | Headless Chrome at 1400 / 390 px against the live dashboard: branch search → pick → Prepare label; local snapshot ran end to end; no JS errors, no overflow |
| Simulator mirror removed (D-033): `/api/device/mirror.jpg` gone (404), mirror client code + CSS removed | **Verified** | curl 404; rail shows no mirror |
| Rail = "QA simulator" status panel: device, driver-queue / runner chip, who drives it, **Show Simulator window** (`open -a Simulator`) | **Verified (Chrome)** | Chip read "Driver: runner not connected" with the harness down |
| Dedicated QA simulator (clone of the developer's, D-053) | **Verified** | `QA · iPhone 12 Pro Max` created; app + data + saved passwords carried; readiness ✓ |
| Branch-switch lock while a build/test uses the copy | Built | prepare → 409 with the reason |
| Free disk space (14 days, `~/.testforge/` only) | Built + unit-tested | `test/qa-build.test.js` |
| P1 walkthrough with a person | Open | — |
| Questions 2–3 / Run button / pipeline wiring | Not started (P2+) | — |

## v3 P2 — Build the QA copy (2026-10-09, D-054)

| Item | State | Evidence |
|---|---|---|
| Repo profile (workspace auto-detect; scheme/config/target saved per repo) | **Verified** | `/api/build/status` → `BlibliMobile-iOS-PerfTest / PerformanceTest` in the local copy |
| `build-for-testing` in the QA copy, own DerivedData, QA simulator; build → code id in `builds.json`; first error | Built + unit-tested | First real build pending the confirmed click |
| Staleness blocks runs; reasoned override → `UNVERIFIED BUILD` stamp | Built + unit-tested | readiness: `28f5c17+7a71 isn't built yet` |
| harness.py `QA_DERIVED_DATA` / `QA_SIMULATOR_UDID`; dashboard passes the QA build | Built | plugin working tree, uncommitted |
| Run records carry code + build | Built | — |

## v3 M0 — Macro replay without Claude (2026-10-08, D-040)

| Item | State | Evidence |
|---|---|---|
| `lib/driver-host.js`: dashboard hosts `:8789` (`hostedBy: testforge`), client mode when taken, 2 s re-host watchdog | **Verified** (host) / unit-tested (takeover) | Live: `/health` answers `testforge`; tests: round-trip via fake runner, destructive drain, port-taken → client → takeover |
| `lib/macro-v2.js`: schema v2, element registry, plain-words map, anchor summary, routines, replay with per-step results, restart + rerun on silence | Built + unit-tested | 8 tests against a fake runner (pass, label fallback order, frozen app → 1 restart → FAIL, failed assertion, unknown element BLOCKED, routines + cycle, cancel, storage) |
| SF-084 macro `BlibliMobile_XCUITest/Engagement/FlashSale/macros/sf-084-tomorrow-tab-must-not-freeze.json` + `QAMacros/elements.json` (3/4 steps by ID, Tomorrow tab by text) | Written | Not a target member (pbxproj has 0 references) |
| Routes `/api/driver/host`, `/api/macros` (v1 + v2), `/api/macros/v2/:id` (map), `POST /api/macros/v2/:id/replay` (device lane) | **Verified** (read routes) | curl: list, map; replay route not yet exercised |
| Test bundle built; harness on iPhone 12 Pro Max iOS 17.5; runner polls the dashboard-hosted queue | **Verified** | `TEST BUILD SUCCEEDED` (with `-skipPackagePluginValidation`); `/health` `lastPolledSecondsAgo: 0` (D-042) |
| Replay engine end to end on device (relaunch, host steps, runner waits/taps/asserts, optional / unless, skipped marker) | **Verified** | Onboarding flow PASS 15.6 s; routine PASS 19.5 s (onboarded, 3 steps skipped) and 18.6 s (fresh first launch) |
| Onboarding macros (routine + first-launch flow, `SplashScreen/General/macros/`) | **Verified** | As above |
| SF-084 replay | **Verified (PASS)** | With the `flashsale?display=app` schedules mock (Today + Tomorrow) armed live: PASS in 36.9 s; re-anchored on `FS_Shared_TabRowContainer`. Tomorrow tap took 12.5 s (watch in go/no-go) |
| `CommonNavBar` IDs only on buttons / title / title icon / title image (app code) | Built | Lint-clean; needs an app rebuild before the registry's `CommonNavBar_ShareButton` anchor resolves |
| Keychain test logins (`lib/credentials.js`, `routes/credentials.js`, rail panel) — D-044 | **Verified** (Keychain) / Built (UI) | Real Keychain round trip (quotes/backslash/space), delete; prod OTP refused; 8 unit tests |
| Manual popups + `typeSecret` steps (`lib/prompts.js`, `public/js/prompts.js`) — D-044 | Built + unit-tested | Not yet exercised on device |
| Login routines `log-in-uatb-internal` / `log-in-prod-internal` | Built | Needs a logged-out app + a saved `uatb/internal` login to verify |
| Header identity chips + sessions open in QA copy (`lib/claude-identity.js`) — D-045 | **Verified** (API) | `/api/identity`: logged-in account, target `BlibliIOSApp-POC · darshan/innovation/qa-mocker @ 28f5c17c9`, sessionDir in the QA copy |
| Failed replay → NetworkLens interceptor check (`lib/lens-check.js`, D-043) | **Verified** | SF-084 FAIL run printed `ℹ NetworkLens (running app): mocking OFF, 0 rule(s), 0 enabled`; history row carries `interceptor`; 5 unit tests |
| M0 go/no-go (≥ 95 % of 20 replays, ≤ 2 s/step, fails on buggy build, passes on fixed) | **Reliability: Verified** / timing: 2 taps at app-idle floor / buggy build: not run | Final run on the tag -3 runner, with the Tomorrow selection asserted: **20/20 PASS**, 26.3–28.0 s per run, max-min spread under 2 s. Engine steps ~0.41 s. Tap Tomorrow 2.03 s, tap Show all 2.43 s: both are XCTest's wait-for-idle after the tap (app animations). Earlier: run 1 20/20 with Tomorrow tap at 12.5 s; run 3 20/20 at 4.9 s |
| QADriverKit `tapByLabel anyOf` + SpringBoard `alertTap` (tag `qa-mocker-testing-3`) — D-046 | **Verified** (anyOf) / Built (SpringBoard alertTap) | Package refreshed and rebuilt; the anyOf tap is in the final 20× run. SpringBoard alertTap not yet exercised (needs a logged-out login run) |
| Login routines: saved (iOS AutoFill) + not saved (Keychain; uatb/prod × popups/automatic alerts) — D-047 | **Verified** (saved, SpringBoard alertTap) / Built (Keychain variants) | Saved-password PASS 55.4 s; SpringBoard consent alert tapped in 1.2 s. Keychain variants wait for a saved `uatb/internal` login |
| Environment-switch routines (`Enticement/AboutBlibli/macros/`, triple-tap `assets_logo`) — D-047 | **Verified** (opener, → UAT B) / Built (→ PROD, → PRE PROD) | Tag `qa-mocker-testing-4` pushed + rebuilt; opener PASS 33.7 s (sheet screenshot); Switch → UAT B PASS 69.7 s (onboarding reappeared = reset) |
| Prod OTP from Outlook via Microsoft Graph (`lib/mail-otp.js`, Email OTP row in Test logins) — D-048 | Built + unit-tested | 5 tests (code extraction, sender/window pick, device-code link → Keychain → fetch, unlinked → popup, timeout + token rotation). **Blocked:** tenant needs admin consent — request sent to IT 2026-10-09 |
| Prod round: Switch → PROD + saved-password login with OTP step (`mc_FBUF38V8MA`) — D-048 | **Verified** | Switch → PROD PASS; login PASS 200.2 s (prod skipped the OTP for an ecosystem account; popup answered “skip”). OTP popup now has “It wasn't asked” |
| Macros tab: repo scan, search, kind filter, steps, ▶ Replay (+ rail panel) — D-049 | **Verified** (headless browser) | 21 macros in 4 module groups; search “empty state” → 3; steps expand; no console errors. Replay button not yet clicked by a person |
| `mock` / `setAppDefault` steps, label waits via `anyOf` (tag `qa-mocker-testing-5`) — D-049 | **Verified** | Demo 0–5 all PASS on device (31–161 s); mock steps arm live in ~2 s |
| Logout + prod no-OTP flow — D-049 | **Verified** | Log out PASS 46.5 s; prod switch + login PASS 155 s through the full login page |
| NetworkLens MCP `isAppRunning` fix (NetworkInterceptor `qa-mocker-testing-1`), app pinned to it, `sync-networklens.sh`, Turn NetworkLens on — D-050 | **Verified** (save + resolve) / Built (enable button) | Mock save refused before → `ok, live` with harness up; packages resolved to `280a4e1`; 38 tests |
| Macros UI: Save as macro, edit | Not started (M3) | — |

`npm test` runs all 38 tests (node:test, ~10 s).

## One test at a time + automatic preconditions (2026-10-09, D-051) — ✅ verified

- ✅ Server 409 while a test is queued or running; UI follows its own job; global Replay lock + banner. Verified: second click → 409.
- ✅ `requires` → env switch / NetworkLens on + relaunch / login or logout, only when needed (`lib/preconditions.js`, 6 tests). Verified: SF-084 PROD→UAT B→login→PASS; Demo 2 lens on→PASS.
- ✅ Test Cases: "Pick macro" removed; macro matched by `links.testCase`, setup chips.
- 🟡 Login outside-tap recovery (`onlyIf`): built; the happy path verified (recovery steps skipped). The outside-tap path itself is not yet exercised.
- ✅ Queue "Clear finished" (cleared 135 entries).

## Setup readiness gate (2026-10-09, D-052) — ✅ built, server side verified

- ✅ `/api/readiness` checks: simulator, app, test bundle, harness. Run/replay routes refuse with 423 when it isn't ready. Verified against the missing PerformanceTest bundle.
- 🟡 UI: buttons disabled + banner with fixes on Test Cases / Macros. Built; not yet checked in a browser.

## v3 P3 — Check: full readiness checklist (2026-10-11, D-055) — ✅ verified

| Item | State | Evidence |
|---|---|---|
| 10 checks with block/warn levels and a Claude-only scope; fixes for each | **Verified** | All ✓ live on QA · iPhone 12 Pro Max; unit tests for warn/scope/disk |
| Installed app = this build (Mach-O UUID) | **Verified** | "matches build 28f5c17+7a71" |
| ▶ Run gated on Claude; ⚡ Replay not | Built | `readyForClaude` |
| Checklist UI (always-on banner, Checklist toggle, Re-check) | Built | not yet checked in a browser |

P2 update: the first real QA-copy build (10 Oct, `28f5c17+7a71`) is **verified**. The harness runs from it on the QA simulator, and run records carry the build stamp.

## Build error capture + login error-sheet macros (2026-10-11, D-056, D-057)

| Item | State | Evidence |
|---|---|---|
| Build failure records every error line as it streams (`errors`, `firstError`); cache noise ignored | **Verified** | NetworkInterceptor resolution failure named the package; unit test for the noise filter |
| `Package.resolved` pins NetworkInterceptor by revision `280a4e1` | **Verified** | QA build `ec16344+ac99` succeeded (592 s); login `alertTap` works with Utility `-5` |
| Flow `mc_LR6KURC8CF`: login error sheet shows Try again + Continue as guest | **Verified** | PASS 29.1 s during the UAT B auth outage |
| Routines Try again (`mc_LR6KUR4AP6`) / Continue as guest (`mc_LR6KURXYR9`), `onlyIf` the sheet | **Verified** | Guest path in the flow; login routine fails with "still there after 8 s" |
| Outside-tap login recovery (#106) | Built | waits for UAT B |

## Mocked auth failure + Flash Sale on PROD (2026-10-12, D-058) — ✅ verified

| Item | State | Evidence |
|---|---|---|
| Flow `mc_MPVN5016NR`: token call mocked 500 → error sheet → Continue as guest (PROD) | **Verified** | PASS 93 s; trace `POST account.blibli.com/gdn-oauth/token → 500` |
| Routine `mc_MR92KFNMPS`: revamp forced on via mocked home config batch | **Verified** | Revamp tab row opened on PROD (app 14.9.0, real gate 114.8.0 + internal) |
| Demos 1–5 + SF-084 on PROD (revamp routine, cleanup, scroll to "Show all") | **Verified** | All PASS, 40–44 s each |
| Macro `cleanup` (runs whatever the verdict) | **Verified** | Mock switched off after a FAIL; unit test |
| `retime` on mock steps | **Verified** | Tomorrow tab back with the 10-09 capture; unit test |
| Preconditions read settings from cfprefsd, not the plist file | **Verified** | Read `prod` while the file still said UAT B |
| Login web sign-in split into routine `mc_MQBTF5GGFA` | **Verified** | Login precondition on PROD passed through it |

## Failure notes + #106 (2026-10-12, D-059) — ✅ verified

| Item | State | Evidence |
|---|---|---|
| Failure note lists only mocks that answered during the run (trace `isMockServed`), and says who set them up | **Verified** | Failing temp macro: "armed but not called … no mocked response during this run"; 4 unit tests |
| `tap {force: true}` (tap outside a sheet) | **Verified** | Forced tap on the Home search button behind the dim closed the sheet, stayed on Home |
| #106 flow `mc_MSFL3T25BT`: skip-login sheet dismissed outside → still logged in | **Verified** | PASS 140 s on PROD; screenshots 135, 139 |
| #106 sibling flow `mc_MT0JR95CYS`: skip-login sheet → Continue → logged in (D-060) | **Verified** | PASS 75.8 s on PROD |
| Login finish split into routine `mc_MSFK2HNFM1` | **Verified** | Used by the #106 flow; same steps as before |

## v3 P4 — Run step (2026-10-12, D-061) — ✅ verified (crash path built)

| Item | State | Evidence |
|---|---|---|
| Server-side batch for "Run selected": macro replay when linked, else Claude `/qa-run` | **Verified** (replay mode) | 3× and 2× SF-084 batches on PROD; Claude mode not run (credits) |
| Pause (finish current, hold) · Continue · Skip case · Cancel | **Verified** | API and UI (headless Chrome): "Pausing after SF-084" → paused → Continue → next case ran; skip → SKIPPED |
| Live view: modes, verdicts, current step, live simulator screen, evidence link, re-attach on reload | **Verified** | Screenshot of the panel mid-run |
| Approval per batch (unattended when `QA_ALLOW_AUTONOMOUS_CLAUDE=1`, else ask) | Built | Payload wired; no Claude case run |
| Crash → BLOCKED (app crashed) + report + hold; Relaunch & continue | Built | Unit tests with a real-format `.ips`; external signals didn't crash the app |
| Single runs refused while a batch is active | **Verified** | 409 path |

## v3 P5 — Results and validation (2026-10-12, D-062) — ✅ verified (Publish built)

| Item | State | Evidence |
|---|---|---|
| Runs kept with manifest + per-case evidence (screenshots, mocks that answered, steps, summary, cost) | **Verified** | SF-084 run on PROD: 31 steps, 3 mocked endpoints, restart noted in the summary |
| Accept / Override (PASS·FAIL + reason) / Needs re-run; Validated state | **Verified** | Headless Chrome: Accept → "✅ Validated"; override rules unit-tested |
| Re-run failed → linked re-run, verdict recorded on the original case | **Verified** | Re-run `3700f146` of `67ae887a`: PASS recorded, review cleared |
| FLAKY (fail, then pass on re-run) | **Verified** | SF-084 with flashsale schedule mock on `empty` → run `c64dd9c2` FAIL; mock back on `loaded` → re-run `8865b3b1` PASS; final FLAKY in UI + report (D-063) |
| Screenshot of the simulator when a case ends without passing | Built | `simctl` capture checked; not yet seen in a failing batch (D-063) |
| Markdown report export | **Verified** | `report.md` download: manifest, case table, details, file names only |
| Publish to Confluence (child of personal page 2437316839, via a Claude session that asks) | Built | Not run: outward-facing, waits for the user |

## v3 P6 — Driver first, Claude only on an issue (2026-10-12, D-064) — ✅ verified

Redefined by the user: saved setups / Home "Run again" are replaced by repo-stored macros,
references and mock packs.

| Item | State | Evidence |
|---|---|---|
| One app session across cases: Open Home backs out / taps Home tab / relaunches only if needed / scrolls to top | **Verified** | SF-084 → Demo 2 → Demo 4: 0 relaunches, 47→18 s, 67→21 s, 42→25 s, all PASS |
| Launch-time inputs (`atLaunch` mocks, app defaults) → `relaunch {ifNeeded}` | **Verified** | Fresh dashboard: Log out → login flow → Demo 2 → SF-084 = 1 relaunch (Demo 2), all PASS |
| Host screenshot when the runner doesn't answer one | Built | Unit test; triggered by a live hang that the old path turned into a re-run |
| Multi-element `unless` / `onlyIf`; web sign-in skips when the error sheet is up | **Verified** | Mocked-auth flow PASS 52 s |
| One macro per id: `.ref.json` references, `links.testCases`, lint (`/api/macros/lint`, Macros tab) | **Verified** | Lint: 30 macros, 0 problems; unit tests; Macros tab shows "Test cases" |
| Mock pack in the repo (`QAMacros/mocks/*.networklens-pack.json`), imported by `mock` steps | **Verified** | Auth rule removed from the device → re-imported from the repo, 500 served |
| Failed replay → Claude triage → repair → driver replay | **Verified** | Run `f405ed7b`: registry id broken on purpose → MACRO_BROKEN → fixed → PASS |
| Claude PASS → same session saves a macro → driver replay proves it | **Verified** | Run `a0cf8ccf`: HM-901 saved + proven ($1.50); next run driver-only, PASS 24 s, $0 |
| Triage / repair / learned macro shown in the Run panel, Results card and report | **Verified** | Headless Chrome: Results detail shows triage, changed files, verdict before repair |

## Phase 3 — Context panel — superseded by v2 Work tab

## Open items

1. Build the test bundle once (**Build test bundle** → **Ensure**), then exercise driver commands live.
2. Click Load in the UI with the page URL and confirm the progress line + 96 cases render.
3. First real ▶ Run on one case; confirm the streamed console reads well and the verdict matches
   `/qa-run`'s output.
4. Record one macro with `/qa-macro` and replay it.
7. v2: run one real `/qa-run` through the queue and answer an approval from the GUI; click Open
   in Terminal once; try the Confluence hard deny.
5. Committed through the "TestForge v3 design" commit (2026-10-08): Jira/PR removal (D-030), v3 design docs, prototype v6, macro feasibility study. Local only — this branch is pushed merge-only; the dashboard commits are not pushed.
6. `tools/networklens-mcp/` (source of the copied libs) is itself untracked.
8. M0: give SF-084 its precondition — revamp Flash Sale enabled + schedule data with a Tomorrow tab (NetworkLens mocks) — then replay 20× for the go/no-go. Runner SpringBoard-alert fix (`qa-mocker-testing-3`) approved but on hold.
9. P1 follow-ups: local copy has no `.git` (check in P2 that the build doesn't need it); disk use of
   `~/.testforge/checkouts` (measured: GitHub copy 738 MB, local snapshot 354 MB) — add a "Free space" action.
10. P1 + M0 changes are uncommitted.
