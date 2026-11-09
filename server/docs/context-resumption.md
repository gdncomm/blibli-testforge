# TestForge server — Context Resumption

Read this first when picking the dashboard up in a new session. It is the shortest path from zero
to productive. Keep it current: it describes *now*, not history (history is `progress.md` and
`decision.md`).

_Last updated: 2026-11-05 (D-216 plugin renamed test-flow-recorder; D-215 renamed to TestForge; D-214 Free space and reset; D-213 feedback at every control; D-212 paused Test Batch; D-211 onboarding + checklist; D-210 window min fix; D-209 test list toggle; D-208 overlay Spaces fix; D-207 subtitle placement; D-206 system prep in the Mac app; D-205 min-version presets; D-204 Deeplinks query params; D-203 Deeplinks search; D-202 banner layout + MT alert step; D-200 Git sheet; D-201 batch replay; D-199 browser UI removed; D-198 Code prepared drift by file; D-197 real devices; D-196 /verify pilot; D-194/D-195 tap fallback, step editor, inputs panel, loading style; D-193 Jira posting; D-190…D-192 prerequisites, Run all plan, Claude activity; D-189 Batches + durable progress; D-188 build stamp + staleness; D-187 optional-tap commit bound; D-186 start screen per case; D-185 fast replay start + busy banner + connector; D-184 reopen batch; D-183 media panel; D-182 proof icons; D-181 import merges; D-180 result overrides; D-179 Demos select-to-open; D-178 sharp demos + full screen; D-177 Reports › Demos; D-176 session report + viewer + Confluence; D-172 Brief + Arrange removed; D-173 session export; D-174 Scan Start/End + saved macros; D-175 resizable Tests; D-171 Record macro; D-170 Brief layout fix; D-169 Stage Manager Arrange + sidebar; D-168 result card restyle; D-167 run lock + thinner pointers; D-166 local case edits; D-165 live overlay; D-164 demo videos; D-163 mock variant per case; D-162 run bundles; D-161 usage-limit pause; MICROSITE_TABBING batch results; D-160 Query Brief Mac screen + server; develop re-merged, NetworkInterceptor tag -5; D-158 model auto-pick + escalation; D-157 deeplinks; develop merged + Utility test-forge-driver-7; D-156 personal Claude Code settings never risk a commit again; D-155 model-driven NetworkLens fuzzing; SF-replay-from-logged-out verified; D-154; D-153; D-152; D-151; D-150; D-149; D-148; D-147; D-146; D-145; D-144; D-143; D-142; D-141; D-140; D-139; D-138; D-137; D-136; D-135; D-134; D-133; D-132; D-131; D-130; D-129; D-128; D-127; D-126; D-120; full resume block; D-115…D-117; D-114 case row in prompt, SF-062; D-113 video plan; resume block; D-109 R4j Test Batches; D-108 R4f Reset; D-107 end-to-end validation; D-106 runner recordings; D-105 Install for testing; D-104 Install & launch; D-103 Run without building; D-102 Fix Swift package errors; D-101 R4e Build screen; D-100 R4d Simulator screen; D-099 R4b demo; D-098 R4a tutorials; D-097 toggle label + attributes removed; D-096 border toggle; D-095 spacing rounding + thin bars; D-094 Measure relations + hover; D-093 layer pass; D-092 routes; D-091 Measure visible container; D-090 R3e Advanced; D-089 R3d; D-088 R3c; D-087 R3b Results + Reports; D-086 scan mode + appearance; D-085 R3a Tests screen; D-084 probes use deviceInfo; D-083 code-prepared drift by build inputs)_

## What this is

A localhost web dashboard (`tools/test-forge-server/`, repo `BlibliIOSApp-POC`, branch
`darshan/innovation/test-forge`) that is a GUI over the TestForge: NetworkLens live mocking,
TestForgeDriver commands, and `/test-forge-run` test-case execution. Start with `../README.md` (usage), then
`design.md` (architecture), `decision.md` (why).

## Current state

> **Resume here — 2026-11-04 (pending decision, nothing built):** handing TestForge to module-owner devs for MVP
> testing. Blocker: the test-flow-recorder plugin exists only at `~/Projects/Tools/test-flow-recorder-plugin` (local git,
> no remote; already a marketplace with `.claude-plugin/marketplace.json`, 68 tracked files). Options put to the user:
> (a) commit it into this branch under `tools/test-flow-recorder-plugin/` (recommended: one clone, no drift) or (b) a new
> gdncomm repo (`claude plugin marketplace add gdncomm/<repo>`). Then build `tools/testforge/setup.sh`: check branch,
> Xcode + GitHub accounts (forked Utility `test-forge-driver-7` / NetworkInterceptor), `.netrc`, Node, Claude Code;
> brew node/ffmpeg; `npm ci`; `.env.local` from example; add + enable the plugin; approve NetworkLens from `.mcp.json`;
> build the app locally (no notarisation prompt) into /Applications; open it on the repo. Offered too: a ? menu ›
> Send feedback item (version, branch, screen, console tail, screenshot → Jira/file). Read plugin files for secrets
> before it leaves the Mac. Everything through D-214 + docs is pushed (`b88d46b2e`).

> **Update — 2026-11-04:** R0 (fast replay start, D-185) and R0b (start screen + base UI per case, D-186) marked
> complete by the user.

> **Update — 2026-11-04, D-214 (committed 912b9d137):** Build › Clean is gone — "Free space and reset" has per-row Delete… plus
> Reset selected (`ResetItemRowView`, `lib/reset.js` + `swiftpm-settings`). `server.js` sweeps the QA simulator's XCTest
> Attachments after each finished test (`clearRunnerScreenshots`).

> **Update — 2026-11-04, D-213 (uncommitted):** every control that starts work shows progress at itself and its failure
> next to it (`Views/ActionProgressLabel`, `Views/BusyActionLabel`; per-screen action enums such as `BuildAction`,
> `TestCaseAction`, `TestBatchAction`, Results/Simulator card activity). Identifiers in `App/TestForgeConstants+Feedback*.swift`.
> Checklist rule in `BlibliMobile-iOS/CLAUDE.md`.

> **Update — 2026-11-04, D-212 (uncommitted):** Test Batches can be paused (`pause`/`resume` in `lib/test-batches.js`,
> routes `/:id/pause|resume`, `pauseActive` on start). Switching batches pauses the active one instead of ending it
> (reopen, resume, start another, Replay on this build). Mac pill + Reports › Batches + start sheet; `test-forge batch pause|resume`.

> **Update — 2026-11-04, D-211 (uncommitted):** welcome onboarding flows caught up to D-210. Every Mac feature now
> updates tip + tour, `Onboarding/OnboardingCatalog*.swift` and `docs/tutorials.md` together — checklist in
> `BlibliMobile-iOS/CLAUDE.md` › TestForge server.

> **Update — 2026-11-04, D-210 (verified by the user, committed with D-209):** `TestForgePanes` no longer reads `sidebarVisibility` (the sidebar's
> toolbar button never updates that binding, so the min stayed 1240). Min = 880 − hidden list 240 − hidden live steps 220,
> floor 480. `TestDocumentHeaderView` buttons on their own row, icon-only when narrow (`ViewThatFits`).

> **Update — 2026-11-03, D-209 (committed with D-210):** Tests › Test list toggle (⌥⌘L, `isListPresented`); window min width from
> `TestForgePanes` (`App/TestForgeViewModel+Layout.swift`), 1240 → 480 with sidebar, list and live steps hidden.

> **Update — 2026-11-03, D-208 (verified by the user):** the step overlay `NSPanel` joins every Space
> (`.canJoinAllSpaces`), so Split View no longer makes macOS switch desktops. D-163…D-208 committed together (not pushed).

> **Update — 2026-11-03, D-207 (uncommitted):** explained-replay subtitles are placed per step by
> `Simulator/ExplainCaptionPlacer.swift` (`ExplainCaption.placement`, replaces `isOnTop`); `ExplainCalloutShape` draws the
> rounded box + tail; `ExplainConnectorView` starts at the tail tip; badge frame moved to `ExplainPointer.badgeFrame`.
> `ExplainCaptionBoundsKey` removed. Next: watch on screen.

> **Update — 2026-11-03, D-206 (uncommitted):** explained replays no longer draw the busy banner over the Simulator
> (`ExplainOverlay.busyMessage` removed; a routine step shows nothing). Mac Tests › live steps shows it under
> **System prep** (`LivePrepModel`, `LivePrepSectionView`; earlier messages kept per run in `TestsSectionViewModel`).
> Plain replays keep `StepOverlayContent.busy`. Next: watch an explained replay on screen.

> **Update — 2026-11-02, D-187/D-188 (uncommitted):** optional round-robin taps keep their own timeout (MT-028 replay
> 115.8 s → 28.4 s). Run stamps gain commit, build number and app version; `lib/staleness.js` + `lib/stale-cases.js` mark a
> case stale when a newer build changes its `covers` (or module) code; `POST /api/batch/stale` replays those without Claude;
> Mac Tests header shows "Testing …" and "Replay stale (N)". D-189: Reports › Batches, End opens the report, progress kept
> on batch items (`settle`), `DELETE /api/test-batches/:id` removes from the list only. D-190 prerequisites (`lib/prerequisites.js`,
> cached 10 min), D-191 `POST /api/batch/plan` + ordered batches + Tests › Run all, D-192 Claude activity strip. D-193 Post to
> Jira (`lib/jira-links.js`, `/api/testcases/:id/jira`, confirm-only). D-194 tap fallback + alert answers in Scan recordings;
> D-195 `lib/step-edits.js` + `GET/PUT /api/macros/v2/:id/steps` (Scan › Edit steps), `lib/macro-inputs.js` +
> `GET /api/macros/v2/:id/inputs` (Tests › Deeplinks and mocks), shared `LoadingStateView`. D-196 `/verify` (`lib/verify-plan.js`,
> `POST /api/verify/plan`, `test-forge verify`, `.claude/skills/verify`, Tests › Verify my changes); pilot on IOS-47345 passed. D-200 Get Ready › Git… works on the developer's own repo (`lib/git-control.js`, `/api/git/*`; never force/reset; stash only on request; refuses a branch without `tools/test-forge-server`). D-201 Reports › Batches › Replay on this build (`POST /api/test-batches/:id/replay`, `replayOf`, `compareBatches`). D-199 the browser UI is gone: the Mac app is the only UI (Prepare code, Run queue, Settings › Logins, run popup sheet; `prompts` slice). D-198 `localDrift` compares app files with the prepared copy (`appFiles`), XCUITest `*.md` ignored. D-197 `GET /api/devices/physical`
> (`lib/physical-devices.js`, devicectl) + Simulator › Real devices card; hardware runs blocked on a device-signed build. Next: device-signed build for hardware runs.

> **Update — 2026-11-02, D-185/D-186 (uncommitted):** replays no longer re-probe Home per Open Home step
> (`createScreenMemo` in `lib/macro-v2.js`), routine steps get no explain pointer/pause, the narrator's `run.busy` drives
> a spinner banner on the Simulator (`Simulator/StepBusy*View.swift`), and a dashed connector joins the subtitle to the
> element (`ExplainConnectorView`). Every macro now has `requires.startScreen` (`home` / `anyScreen` / `freshLaunch`,
> `START_SCREENS` in `lib/preconditions.js`); deeplink cases dropped their Open Home step. Not timed live yet: no Test
> Batch was active (the user ended MICROSITE_TABBING). Demo feedback backlog F1–F7 is tasks #84–#90.

> **Update — 2026-11-02, D-184 (uncommitted):** Test Batch pill › Reopen Test Batch ▸ (`POST /api/test-batches/:id/
> reopen`, `TestBatchStore.reopen`). MICROSITE_TABBING was ended by the user at 11:17 UTC and reopened the same day.

> **Update — 2026-11-02, D-183 (uncommitted):** Tests detail shows the case's proof (`Tests/Media/`): zoomable
> screenshots, playable videos, thumbnails, Annotate (pen/arrow/box) → Save as copy or Replace original (confirmed).
> Files from `GET /api/testcases/:id/media`. Not clicked through on screen yet.

> **Update — 2026-11-02, D-182 (uncommitted):** Tests rows show proof icons (photo + count, video, eye = evidence only)
> from the active batch folder (`lib/case-proof.js`, `proof` in the `testcases` slice). Also done today: EN/ID
> explanations written for every interactive recording (13, 15–19, 21–23, 25–29).

> **Update — 2026-11-02, D-181 (uncommitted):** bundle import merges into the loaded document (`acceptImported` in
> server.js, `mergeImportedCases` in lib/case-edits.js) instead of replacing it. Repaired the same day: page
> 2446558056 reloaded (29 cases, read-only load) and the edits on 15, 21, 24, 28, 29 re-saved under its source (the
> `bundle:…` copies remain, unused). Cases 3 and 9 show "Not run" on Tests: their runs are older than the 100 newest
> run records the Tests slice reads.

> **Update — 2026-11-02, D-180 (uncommitted):** Tests › **Override result…** (⇧⌘O) sets a case's verdict with a
> required description, kept as history in `.data/result-overrides.json` (`lib/result-overrides.js`,
> `PUT /api/testcases/:id/result`). History rides in bundles, session export and the report. **Save and rerun** saves
> the expected result as a local edit and starts a Claude run whose prompt carries the reasons and Strict/Lenient.
> 315/315 server tests; app rebuilt + restarted; sheet not clicked through yet. MICROSITE_TABBING reruns: 7, 21, 28,
> 29 PASS, 24 FAIL (header doesn't collapse — bug per the user's rule); 1 and 20 overridden PASS in Results. Device is
> on **UAT-B** after case 28.

> **Update — 2026-11-02, D-179 (uncommitted):** Demos list uses `List(selection:)` — clicking any part of a row opens
> that demo paused; `DemoPlayOverlayView` (big ▶, Space) shows while `timeControlStatus` is paused.

> **Update — 2026-11-02, D-178 (uncommitted):** demos were blurry because `AVAssetExportPresetMediumQuality` caps
> output at ~480 px tall; `DemoRenderer` now exports HighestQuality at 1080 px (even dims). Case 18 re-rendered
> (1080×2336, ~42 MB). Demos player is `DemoVideoPlayerView` (AVPlayerView, floating controls, full-screen toggle).

> **Update — 2026-11-02, D-177 (uncommitted):** Reports › **Demos** lists `GET /api/demo/recordings` (existing D-164
> route) with a ▶ per demo; AVKit's `VideoPlayer` plays it, an English / Bahasa Indonesia picker swaps the file at the
> same position (`Demo/Library/`). No server change. Next: see it on screen (Reports › Demos), then commit when asked.

> **Update — 2026-11-01, D-176 (uncommitted):** Reports › **Session report** renders the loaded document's report
> (`lib/session-report.js`, `GET /api/session/report.md|.html`) in a native Markdown viewer (`Views/Markdown/`);
> Export .md / Confluence .html; **Publish** queues a Claude session that creates one child page of 2437316839.
> Publish has not been run yet (needs the user's go-ahead). 309/309 server tests.

> **Update — 2026-11-01, D-172…D-175 (uncommitted):** Brief and Arrange are **removed** (archives deleted too;
> ignore older notes about them). Tests › **Export session…** writes a zip
> (`lib/session-export.js`, `/api/session/export`; verdicts from `runs.json` like Tests). Scan › Record macro is
> Start recording → End recording → Save → **Saved macros** (`GET /api/macros/v2/recorded`). Tests columns resize.
> Not yet seen live: the export sheet, the saved-macros view, dragging the dividers. 306/306 server tests.

> **Update — 2026-11-01, D-171 (uncommitted):** Scan › Record macro — record taps in the Simulator, Save as macro
> (`POST /api/macros/v2/recorded`, `lib/recorded-macro.js`), missing accessibility IDs flagged live. Replay verified.

> **Update — 2026-11-01, D-169 (uncommitted):** Stage Manager on → Arrange skips Split View, joins the Simulator's
> stage (`.canJoinAllApplications`) and places side by side. Sidebar: colored tiles, selected row bigger + bold.

> **Update — 2026-11-01, D-168 (uncommitted):** explained-replay result card and demo outro share `DemoOutcome`:
> centered check/cross/triangle, colored verdict title, case + scenario below.

> **Update — 2026-11-01, D-167 (uncommitted):** Tests actions lock from the Run/Replay click until Stop or the run
> ends (`isStartingRun` bridges the gap before the server lists the run). Explain pointer stroke 0.009 → 0.0045.

> **Update — 2026-11-01, D-166 local case edits (uncommitted):** Test Cases › Edit… (⌘E) corrects a loaded case's
> text on this Mac; edits live in `.data/case-edits.json`, are laid over the document on every load, override the
> document in Claude runs, and travel in bundles. Case 15 (URL mode) now carries one: the indicator stays on the
> original tab; its recording `mc_M7T15UTRK9` passed and has EN/ID explanations. Next: click through the Edit sheet
> on screen; consider exposing tab selection to accessibility so case 15's replay checks it instead of a screenshot.

> **Update — 2026-11-01, D-165 live overlay (uncommitted):** Test Cases › Explain → Replay with explanations draws
> the notes over the Simulator (card, subtitles, pointers, result); Record demo video and Write explanations live in
> the same menu. Check it live over a visible Simulator next; then a demos list in the app. Rule from the user: every
> feature needs Mac UI — CLI/API alone is not done.

> **Update — 2026-11-01, D-164 demo videos (uncommitted):** `test-forge demo notes <macro>` (Claude, once, EN + Bahasa, into
> the macro's `demo`) → `test-forge demo record <macro>` (slowed replay, whole-macro video + `timeline.json`) → the Mac binary
> renders `demo-en/id.mp4` + `.vtt` into `<proof folder>/demos/<case>-<time>/`. Case 18 verified. Next: Mac UI
> (Record demo / open / write notes), story reel, tutorials + tour lines before committing.

> **Update — 2026-10-31, D-163 (uncommitted):** each run now records which mock variant answered (`evidence.mocksUsed`,
> matched by body/size/timing in `lib/mock-variants.js`); bundles carry it per case and `…/cases/:id/arm` (Mac **Set up
> mocks**, `test-forge bundle arm`) switches it on for a hand test. Verified live; Histeria rules are off.

> **Update — 2026-10-31, D-162 run bundles (uncommitted):** a finished run exports as one `*.test-forge-bundle.json`; import
> adds its macros/elements/mocks (never overwriting without "Replace mine"), loads its cases, and replays recorded
> cases driver-only ($0). Server + `test-forge bundle …` verified on the QA simulator (4, 13 PASS, agree with the bundle);
> Mac Export/Import sheet built, app rebuilt and restarted, not clicked through yet. The import added
> `TestForgeMacros/mocks/get-backend-content-api-promotions-blibli-histeria.networklens-pack.json` to the repo (untracked) —
> commit it with the Engagement/Promo macros. MICROSITE_TABBING final: 20 PASS, 2 BLOCKED (1, 28), 1 EVIDENCE_ONLY
> (2), 3 UNDECIDED (15, 20, 24).

> **Update — 2026-10-31, MICROSITE_TABBING batch + D-161:** 26 cases, $6.29: 16 PASS, 2 EVIDENCE_ONLY/BLOCKED as
> expected (2, 1), UNDECIDED 15 + 20 (real, need tighter checks), 24–29 not run (5-hour usage limit). D-161 built:
> the limit now requeues + pauses the batch. Next: rebuild app, restart, rerun 24–29.

> **Update — 2026-10-31, D-160 Query Brief built (uncommitted):** server (`lib/brief.js`, `routes/briefs.js`, 273/273
> tests) + Mac **Brief ⌘B** section (`Sources/TestForge/Brief/`, `Server/BriefService.swift`), tutorial (6 tips) and
> tour step 8. Build + lint clean; app models decode real/sample briefs. **Not yet tried in the running app** — the live
> :4545 server was mid-batch (MICROSITE_TABBING, 26 cases on Auto). Next: after the batch, `make-app.sh`, relaunch,
> open Brief, run one brief end to end (analyse, show-as, copy image, save PNG); post to Jira only with the user's key
> + OK. The :4646 copy server (scratchpad `copy4646`) has the older Jira route — re-sync before using it.

> **Update — 2026-10-31, develop merged again (`9ec4017ba`, local):** develop now calls NetworkInterceptor 1.0.1's
> `serverTrustHandler` in NetworkLensBootstrap, so 1.0.1 was merged into the QA fork → **`test-forge-driver-5` = `cade0da`**
> (pushed with user OK); POC pbxproj + both Package.resolved pin `cade0da`; `-resolvePackageDependencies` clean. Utility
> stays `-7`. UITests-target build configs from develop dropped (target removed here). App not rebuilt — Install for testing.
> **Next batch:** MICROSITE_TABBING — cases GDNIT 2446558056 (29 rows, read-only), tech doc EN 2391769202; parser fixed
> for its blank id header (D-159). Most rows need a mocked promotions response (`useMicrositeTabbing=true` APIs).

> **Update — 2026-10-27, develop merged + D-157 + D-158 (uncommitted feature work; merges committed locally, not pushed):**
> `origin/develop` merged twice (`d267511fe`, `15b1f3b88`) — conflicts: SwiftPackageList (develop versions, Utility →
> **`test-forge-driver-7`** = -6 + 1.0.46, pushed with user OK), pbxproj (develop's Carthage removal + package refs taken,
> this branch's removal of the BlibliMobile-iOSUITests target kept, NetworkInterceptor still 7af1332), Package.resolved,
> .gitignore + CLAUDE.md (both sides). The app has **not** been rebuilt since — Install for testing (ask) before tests.
> **D-157 deeplinks:** Simulator › Deeplinks card + `/api/deeplinks*` + `test-forge link`; opens on the test device with
> `simctl openurl` (no relaunch, pushes over the current screen), refused while a test runs. **D-158 model pick:**
> Claude runs start on Haiku/Sonnet/Opus by a local score of the case and its history, and move up mid-run via SDK
> `setModel` when stuck; Mac Run-with-Claude dialog offers Auto or a fixed model. Both server-verified on a :4646 copy
> (scratchpad `copy4646`, control port 8799) + 263/263 tests; on-screen Mac checks, a real deeplink open (QA clone was
> shut down) and a real Auto run are still open. :4545 still runs pre-D-157 code — restart only after asking.

> **Update — 2026-10-18, D-156 (committed `d3a0b6c58` + `e79673407`):** closes a gap this very session created — a prior turn had hand-added
> a personal `env` block (this Mac's `TEST_FORGE_PROJECT_DIR`/`TEST_FORGE_MEDIA_ROOT`/`TEST_FORGE_DEVICE_UDID`) to the *tracked*
> `.claude/settings.json`, needed only so Claude's own `networklens`/`test-forge-driver` MCP tools target the right device
> when used directly (not through this dashboard, which never needed it, D-032). Fixed structurally, not just
> reverted: `.claude/settings.local.json` is no longer tracked (was shared config + would've hit the same problem
> for every teammate); `.claude/settings.local.json.example` is the committed generic baseline it's seeded from.
> The dashboard's **Get ready** checklist gained a new warn-level check, "Claude Code set up for this Mac" — its
> Fix (`lib/claude-local-env.js`, `POST /api/claude-env/configure`) auto-detects this Mac's values (QA simulator
> via `findTestForgeSimulator()`, project dir/media root from the server's own env — nothing typed in), shows a detailed
> confirm naming exactly what gets written and that it's never committed, then merges just the `env` key into
> `settings.local.json`. Verified for real on this Mac: detection caught that the old hand-typed `TEST_FORGE_DEVICE_UDID`
> was stale (pointed at a shut-down simulator) and wrote the actual current one instead. See D-156 in
> `decision.md` for the full verification.

> **Update — 2026-10-18, D-155 (committed `8eba4db8e`):** `scripts/test-forge-fuzz.mjs fields|generate` — generates NetworkLens mock
> variants straight from a Decodable model's field list (every optional absent, empty arrays, each enum case, an
> unknown enum value), so field-level API-contract edge cases don't have to be hand-authored. Standalone CLI, no
> dashboard route (`TEST_FORGE_PROJECT_DIR` is a detached clone, D-032). Handles both decode shapes in this codebase: the
> explicit `decodeIfPresent(Type.self, forKey:)` form and this codebase's own `KeyedDecodingContainer` subscript
> form (`values[.x]` — flagged by the user mid-build, wasn't in the original plan; the type comes from the
> property's own declaration instead of a `.self` literal). Piloted live on the real
> `FSSubFlashsaleRangeItemResponse` + the real sub-flashsale/range pack (both read-only; fuzzing only ever wrote to
> scratch copies) — see D-155 in `decision.md` for the full verification. **The plan's final step (live payoff) is
> now done too:** a generated `fuzz-missing-background` variant was imported and armed live via the dashboard API,
> the Flash Sale revamp screen rendered the sub-flashsale card cleanly with no background image and no layout
> break, then the rule was disarmed and the scratch pack discarded — nothing left live or committed from the demo.
> Found along the way, not a D-155 bug: the `networklens` MCP server's own device resolution got stuck on a stale
> simulator after two sims were briefly booted together and didn't self-correct; the dashboard's own HTTP API
> (`/api/lens/rule`, `/api/macros/v2/:id/replay`) resolved the right device throughout and is what the verification
> actually used — see the progress.md environment note. **Deferred, not built:** no
> `/api/lens/fuzz` route or Mac button, no recursion into nested/array-of-struct fields, no auto-driving/auto-judging
> of the generated variants (light scope, by explicit user choice).

> **Update — 2026-10-18 (committed `cff42632c`, closes a D-153 open item):** SF replay from logged out exercised live —
> logged the QA sim out (`mc_FD3GLFFJWN`), replayed SF-001 (`mc_1RDWNX0B8D` via `/api/macros/v2/:id/replay`):
> precondition logged back in on PROD + relaunched for Home, then the case ran its own mocks/steps, PASS in
> 150.6 s. Harness was down at session start (probe: "queue up, nothing collecting") — `POST
> /api/harness/ensure` brought it back before replaying.

> **Update — 2026-10-17, D-154:** single Claude runs copy their proof into `<batch>/<case>/` (`proofWrittenBetween` + `copyIntoBatchFolder` in the `test-forge-run` executor). D-153 verified on SF-020 (committed `cff42632c`, with D-152).
>
> **Update — 2026-10-17, D-153:** per-case preconditions live in `BlibliMobile_XCUITest/TestForgeMacros/case-requirements.json` (regex on case id → `requires`); SF-* need logged in + `reloadHome` (relaunch after login). Replays and Claude runs both resolve them via `meetPreconditions` in `server.js`. D-152: `**/.claude/**` is not a build input.
>
> **Update — 2026-10-17, D-151:** tutorials (new Network + Claude) and the welcome tour now cover every feature through D-150 (`tutorials.md` › R6). When adding a screen or control, add its tip and tour line in the same change.

> **Update — 2026-10-17, D-150 (committed `579f60009`, with D-147…D-149):** Remote Control — the server supervises `claude remote-control` in the repo (Mac: Claude › Remote Control panel), TestForge-started sessions carry `TEST_FORGE_REMOTE=1`; guard + session hooks live in the test-flow-recorder plugin (committed `f3dd0a3` in that repo; reinstalled); `scripts/test-forge.mjs` + repo skill `test-forge-remote`. :4545 needs a restart for it.

> **Update — 2026-10-17, D-149 (committed `579f60009`, with D-147/D-148):** Claude usage bar at the bottom of the Mac window (CLI figures, account, Remote Control); View › Show Claude Usage. The usage tap isn't installed in the user's status-line script — Connect in the bar does it (asks). :4545 needs a restart for `claudeCli` + tap polling.

> **Update — 2026-10-17, D-148 (committed `579f60009`):** tour steps marked Needs Claude ✓/✗.

> **Update — 2026-10-17, D-147 (committed `579f60009`; D-146 committed `668f1ebcf`):** the Mac Claude section shows and steers every session (switcher, Details, approvals/questions, badge + notifications, quick replies, reopen), Tests links a Claude run to its session. Server: `POST /api/sessions/:id/reopen`, narration runs carry `sessionId`. :4545 needs a restart for the server half.

> **Update — 2026-10-17, D-146 (committed `668f1ebcf`; D-142…D-145 committed `4d40d19a8`):** Measure snapshot shows the saved file with Show in Finder.

> **Update — 2026-10-17, D-145 (committed `4d40d19a8`):** Measure drops icon pieces (off-centre inside an icon box, edge strips, specks). Scratchpad `layercli/` and `mergecli/` run the real layer pipeline on a device from Terminal.

> **Update — 2026-10-17, D-144 (committed `4d40d19a8`):** ⌥ + scroll zooms Measure. With D-142/D-143 in the same commit.

> **Update — 2026-10-17, D-143 (committed `4d40d19a8`):** Measure's layer pass no longer turns text glyphs into "views without id" — Vision text lines filter the boxes. Waiting for the user to re-check in Measure.

> **Update — 2026-10-17, D-142:** the user's 8-item list is done except item 3 (a11y IDs in codegen skills), deferred by the user until this setup is integrated into develop (scope + open choices in D-142). D-139…D-141 committed `55e6d2669`.

> **Update — 2026-10-17, D-140 (committed `55e6d2669`, with D-139):** Arrange makes macOS Split View — Simulator full screen on the **right** (D-141: Window › Full Screen Tile › Right of Screen pressed through AX, the window chosen via the Simulator's Window menu), TestForge picked on the left with one synthetic click; off exits both. Verified on the user's app.

> **Update — 2026-10-17, D-139 (committed `55e6d2669`; D-137/D-138 committed `50ac75714`):** Arrange leaves full screen first (restores it on off) and joins the Simulator's desktop when no Simulator window is on the current one. Awaiting the user's on-screen check.

> **Update — 2026-10-17, D-138 (committed `50ac75714`):** Arrange asks "Which Simulator?" when several device windows are open (test device first). Still to see: the two-window list and a pick — needs both Simulator windows on the current desktop.

> **Update — 2026-10-17, D-137 (committed `50ac75714`; D-136 committed `291ce6f3d`):** item 7 done — Arrange is a labelled toggle that restores both windows; the Simulator bridge prefers the test device's window. The user's TestForge (pid 30181) runs the older build — rebuilt bundle waits for their relaunch. Items 1, 2, 4, 5 (docs), 6, 7, 8 done; item 3 (a11y-id codegen rule) still TBD.

> **Update — 2026-10-17, D-136 (committed `291ce6f3d`; D-134/D-135 committed `4f91abd94`):** item 5 = `docs/android-driver-spec.md` (parked by the user — keep it current when iOS contracts change, no Android code until they say; UiAutomator self-instrumenting APK on the same 8789 queue via `adb reverse`; phases A0–A6; §9 questions block building). Next: item 7 (Arrange / full screen); item 3 still TBD.

> **Update — 2026-10-17, D-135 (committed `4f91abd94`):** Get ready fix refusals show the server's reason; NetworkLens pinned to the test sim at server start (needs a :4545 restart + app relaunch to take effect). "Mock", never "fake", in copy (D-134 note).

> **Update — 2026-10-17, D-134 (committed `4f91abd94`; D-132/D-133 committed `4121bd51f`):** item 4 built — welcome tour sheet (`Sources/TestForge/Onboarding/`), 7 pages, QA / Developer, shown once (`onboarding.hasSeen`), Help › Welcome to TestForge and ? › Welcome tour. Testing a second app instance writes the shared `com.blibli.test-forge` defaults: export them first, and delete `onboarding.*` after (`defaults import` merges, it doesn't remove). Next: item 5 (Android driver spec) → 7 (Arrange / full screen).

> **Update — 2026-10-17, D-132 + D-133 (committed `4121bd51f`):** items 1 + 6 built. **DMG:** `tools/mac-app/scripts/make-dmg.sh` → `build/TestForge-0.2.dmg`; an install outside the repo shows **Setup** (choose repo, Xcode / Node ≥18 / Claude Code / sign-in checks, Continue saves `dashboardDirectory` and relaunches). **Claude section (⌘0):** native front end over the existing session engine; `POST /api/sessions/testforge` resumes the repo's own session (`meta.testforge`, cwd `TEST_FORGE_PROJECT_DIR`). Verified on a :4646 copy (own control port `NETWORKLENS_CONTROL_PORT=8799`) with a separate app instance; :4545 not restarted — it needs a restart to serve the new route before the user's TestForge shows Claude. AX tip: `AXWindows` comes back empty for these windows; the scratchpad `test-forge` helper now falls back to `AXMainWindow` (plus `setval` for text fields). Next: item 4 (onboarding) → 5 (Android spec) → 7 (Arrange / full screen).

> **Update — 2026-10-16, D-131 (POC committed `96e6bcf5a`, `df4b5bdd4`, not pushed; fork tags `test-forge-driver-3` 866b763 and `-4` 7af1332 pushed, branch at 7af1332):** phase D is live on the QA clone (built `df4b5bd`, installed). Verified hold/release/fail/replay/bubble on the real app; two fixes found live (anonymous pollers can't steal targeted commands; replay no longer blocks the channel). App pin = 7af1332 in project.pbxproj + both Package.resolved. The QA clone is booted with the runner up. Open: Mac Breakpoints tab not seen on screen (reopen TestForge), live scenario delete not exercised. Next: items 1(+6) → 4 → 5 → 7; Android needs adb.

> **Earlier — 2026-10-16, D-130 (committed `96e6bcf5a` + `df4b5bdd4` here; committed `866b763`/`2ef2c46`/`7af1332` in the fork worktree `~/Projects/Tools/NetworkInterceptor-qa`, tags `test-forge-driver-3`/`-4` pushed; D-129 committed `de530b18a`):** phase D built — fork verbs `breakpoint.*`, `replay`, `ui.bubble`, `edit.removeScenarioIDs`, poll identity (`?device=<SIMULATOR_UDID>`); MCP queue targets commands at `NETWORKLENS_UDID` (synced into lib/); dashboard `lib/lens-pollers.js` + `/api/lens/breakpoints|held|calls/:id/replay|bubble`; `test-forge-lens hold|release|replay|bubble`; Mac Network › Breakpoints tab + Replay / Hold this call + strip identity warning. The POC was re-pinned to `7af1332` (D-131) and the verbs work in the app. Known pre-existing fork failure: `GroupsFileTests` ×4 (ISO-8601).

> **Earlier — 2026-10-16, D-129 (committed `de530b18a`; D-128 committed `d0f45d08c`, not pushed):** phase E part 1 — trackers: `lib/lens-trackers.js` (JS port of extract_trackers.py, splits `/track-batch` into one fire per event), `POST /api/lens/trackers|trackers/:id|trackers-report`, `test-forge-lens trackers|tracker|trackers-report`, Mac Network › **Trackers** tab (IDs, contract JSON, all launches, Check, Report copy/save). Also fixed: section tops drawn under the toolbar (`TestForgeView` split inset). Open: health "live" = any app polling 8788, not necessarily the test simulator (seen with the QA clone shut down + iPhone 17 Pro running). Android: no adb here. Next: Android (needs a device/emulator) or phase D (needs a fork tag — ask), then items 1(+6) → 4 → 5 → 7.

> **Earlier — 2026-10-16, D-128 (committed `d0f45d08c`; D-123…D-127 committed `5b15bd021`, not pushed):** phase B built — Mac sidebar **Network** (⌘9): health strip, leftover-mock banner, Traffic (calls, detail, curl, Mock this call), Rules & scenarios (on/off, answers, editor with JSON check / copy / delete / time-shift, scenarios). Server `/api/lens/rules|scenarios|guardrails|reset` + variant routes (`lib/lens-console.js`). Live scenario delete is impossible in the current fork (edit merges) → delete restarts the app. :4545 + TestForge relaunched on it. Next: phase E (trackers view, Android), then D (fork verbs, needs a tag — ask first). Scratchpad `scanspike/qawm` = AX helper that skips the Measure window (+ `pressradio`).
>
> **Update — 2026-10-16, D-127 (committed `5b15bd021`, with D-123…D-126):** phase A done + verified live: dashboard owns 8788 and tracks app polls, `/api/lens/*` (state, health, mocking, rule, calls, call detail/curl, mock-call), `scripts/test-forge-lens.mjs` (Claude run prompt names it first), `isMocked` from `isMockServed`, and `lib/app-defaults.js` fixing every bundle-id `defaults` call (preconditions, setAppDefault/clearAppDefault, bubble, Mac Saved settings). :4545 restarted on it; Mac app built, not relaunched. Next: phase B, Mac Network console v1.
>
> **Update — 2026-10-16, D-126:** user said "Build in suggested order" → phase C done + verified (bubble parked via `simctl spawn defaults write <container plist path>`; SF-024 PASS). Next: phase A.
>
> **Update — 2026-10-16, D-125:** item 2 analysed → `docs/networklens-console.md` (phases C bubble-out-of-the-way → A dashboard owns 8788 + /api/lens + test-forge-lens CLI → B Mac console v1 → E trackers/Android → D fork verbs). Waiting for go-ahead. User's order after this: 1 (+6) → 4 → 5 → 7; 3 TBD.
>
> **Update — 2026-10-16, D-123 (committed `5b15bd021`, with D-124…D-127):** user's 8-item list (DMG install, NetworkLens console without MCP, a11y-id codegen rule, onboarding, Android driver spec, Claude in app, Arrange full screen, Measure snapshot+notes). Order chosen: **8 first**. Measure accuracy done (spacing scale 0/1/2/4/×4, glyph spacing) and verified on the QA clone's mocked Flash Sale (Test Batch "Measure accuracy" active; SF-024 replay BLOCKED by the NetworkLens bubble over the carousel next button — investigate). D-124 Measure snapshot + numbered notes + Save/Copy PNG built (copy verified; pins + save not driven). Next: the user picks the next item (3+7 quick wins, 1+6 install & Claude in app, 2 NetworkLens console without MCP, 4 onboarding, 5 Android driver spec). Test Batch "Measure accuracy" is still active — end it when done.
>
> **Update — 2026-10-16, D-122 (committed: "choosable test simulator, runner-free Measure, renames"):** Advanced › "Fake data" renamed **Network Mocks** (app, live step wording, tutorials, docs; code names unchanged). :4545 + app restarted on it.
>
> **Update — 2026-10-16, D-121 (committed: "choosable test simulator, runner-free Measure, renames"):** Advanced › "Phone remote" renamed **Simulator Driver** (UI + tutorials + docs; code names unchanged).
>
> **Update — 2026-10-16, D-120 (committed: "choosable test simulator, runner-free Measure, renames"):** test device you can choose (`/api/test-device`, `lib/test-device.js`; every simctl call by UDID; other booted sims allowed), Simulator screen follows it ("Used by tests" / "Use for tests"), Measure + flow map read the Simulator window's device from CoreSimulator — no runner needed. Verified (see progress.md). :4545 restarted on it; app relaunched with it. Test device is back on the QA clone.
>
> **Update — 2026-10-15 late, D-119 (committed `0e5dfca50` here, with D-114…D-118):** replays device-size independent (relative nudge-into-view, `lib/viewport.js`) + identifier-anchored locators. User chose **Flash Sale first** and **runner "anchor ID + child"**. Done: engine (`within` from 2-link chains, 146/146 tests), runner `within` committed + pushed as Blibli-Utility `ac1740b`, tag **`test-forge-driver-6`** (user OK 2026-10-15), `SwiftPackageList.txt` re-pinned to it, Flash Sale app ids (`FS_SubFlashSaleCard_<n>`, `FS_SubFlashSaleProduct_<n>`, `FS_SpecialPlacementProduct_<n>`, merchant row `.contain`; lint clean, not built). **Registry NOT switched** — apply the progress.md › D-119 table only after Install for testing, then re-run the Flash Sale cases. Device switching: user asked for **both** A and B (next to build). Install for testing is the user's step on 2026-10-16 (needs the new Utility tag: SwiftPackages reset + download in the QA copy, then build).
>
> **Resume here (fresh context, 2026-10-15 evening) — read this block first.**
>
> - **Committed:** up to D-113 (`8ce92781a`, video only when needed). Branch `darshan/innovation/test-forge`.
> - **Uncommitted, all built, lint/build clean, docs updated — commit only when the user says:**
>   D-114 (Claude run prompt carries the loaded case row; SF-062 learned — `Engagement/FlashSale/macros/sf-062-…json`,
>   `TestForgeMacros/elements.json` + range pack additions only), D-115 (Results › Show in Finder), D-116 (Simulator screen
>   cards + SF Symbols), D-117 (Scan › Flow map), D-118 (in-app Proof viewer). Never commit
>   `BlibliMobile-iOS/.claude/settings.json` (user's local `TEST_FORGE_DEVICE_UDID` pin).
> - **Waiting on the user (testing "tomorrow", 2026-10-16; poor connection today):**
>   1. Flow map tap capture — Scan › Flow map › New map → Record on Home → tap 4–5 screens incl. Back → Stop; then read
>      `~/.test-forge/flows/<newest>/flow.json` and judge screen matching (Jaccard 0.55 / 0.3 same title), names,
>      edges. Only Record / first screen / thumbnail / save are verified (one map exists: `2026-10-15_16-35-35`, start
>      screen = splash "Screen 1" — the user may delete it or use New map).
>   2. Proof viewer by hand (pinch, double-click, speed menu, Open in default app / Show in Finder not driven).
>   3. Say "commit" → commit D-114…D-118 (one commit or per D — ask), then **R4h** (prerequisites per screen +
>      chronological usage.md) → R4i approvals → R4c installer → R5a Bug Fix Validator.
> - **Running when this was written:** :4545 server (restarted on D-115; pid changes on restart; env captured in
>   memory `feedback-dont-kill-live-testforge`), TestForge app (relaunched with the user's OK; flow recording
>   stopped). No Test Batch active (B1 ended by the user 11:03). The booted simulator the user uses is iPhone 17 Pro
>   Max · iOS 26.2 (the QA sim AC2A1B55 was not booted at that time).
> - **Driving the Mac app without keystrokes:** scratchpad `scanspike/test-forge <pid> select <sidebar title> | selectid <id>
>   | press <id> | presslabel <text> | ids <prefix> | help <id> | value <id> | windows`; window captures via
>   `screencapture -l <window number>` of the app's own windows only. Scratchpads are per session — rebuild the helper
>   from D-117's notes if gone.
> - **Open offers / ideas not started:** flow map v2 (typing, screens that change with no tap such as the SF-061
>   sheet, API calls per screen from the NetworkLens trace, route export for macros); Record-video toggle + multi-case
>   run on Mac Tests; R5 Confluence docs only after the user's review.
>
> **Resume here (fresh context, 2026-10-14):** D-099…D-107 committed (see git log). Mac app sidebar: Get ready ⌘1, Tests ⌘2, Scan ⌘3, Results ⌘4, Reports ⌘5, Advanced ⌘6, Simulator ⌘7, Build ⌘8. QA sim AC2A1B55 has the 88ac715+b354 QA build + runner installed; Color Blended Layers is kept ON there. Next, in order: **R4f** Reset for a fresh run (show sizes, confirm; QA DerivedData, QA copies, Xcode DerivedData optional, SwiftPM caches optional, QA-sim XCTest Attachments with runner stopped, app run data; repo to clean state without ever discarding uncommitted work) → **R4g** logo 1024 + AppIcon.icns in make-app.sh → **R4h** prerequisites per screen + chronological usage.md → **R4i** approvals card + open session in browser → **R4c** double-click installer → **R5a** Bug Fix Validator design (Jira API token, local uncommitted file) → **R5b** Scan feasibility study → R5 Confluence docs (only after user review). Open offers to the user: scan "Nothing was saved" message + Stop confirmation.
>
> **Update — 2026-10-15, D-115…D-118 (committed `0e5dfca50`, with D-114/D-119):** In-app Proof viewer (D-118, Verified: zoom + video controls). Results "Show in Finder" per case (Verified) and the Simulator screen revamp (Verified in the relaunched app; buttons not pressed). Scan flow map (D-117) **built**: Record/first screen/thumbnail/save verified; tap capture needs the user to click through the Simulator (asked) — then check `~/.test-forge/flows/<newest>/flow.json`. App relaunched with the user's OK (pid changes on relaunch); :4545 restarted on D-115. D-114 also in the same commit.
>
> **Update — 2026-10-15, D-114 (committed `0e5dfca50`):** Claude run prompts now carry the loaded case row (`caseRowText`), so a run no longer needs the document readable (Confluence was 401 / unauthorized; local snapshot ends at SF-035). SF-062 PASS + learned (`mc_9FVWX9VP1F`, replay PASS), Claude-filmed 22 s video. :4545 restarted on it. 15 Flash Sale cases learned at this point. Next: **R4h**.
>
> **Update — 2026-10-15, D-113 (committed):** Video only when a screenshot can't prove the case (`lib/video-plan.js`): replays filmed by the server over the case's own action window, cut to the last 60 s (`trimToLast`, ffmpeg); Claude runs told when to film themselves. Verified live: SF-061 replay PASS on :4545 (restarted on D-113, pid changes on restart) with a 58.5 s clip ending on the sheet. SF-054 is no longer filmed (tap → new screen; user told). Next: **R4h** prerequisites per screen + chronological usage.md → R4i approvals → R4c installer.
>
> **Update — 2026-10-15, D-112 (committed):** recordVideo "auto" default; SF-054 + SF-061 PASS with video, learned as macros (14 Flash Sale cases learned now). Next: **R4h**.
>
> **Update — 2026-10-15, D-111 (committed):** R4g app icon done (`scripts/make-icon.swift` → `Assets/AppIcon-1024.png` → icns in make-app.sh). Next: **R4h** prerequisites per screen + chronological usage.md → R4i approvals → R4c installer.
>
> **Update — 2026-10-15, D-110 (committed with D-108/D-109 follow-up):** Video proof for runs (`recordVideo`), verified SF-001 + SF-006 in batch B1; Mac Results shows video links. Next: **R4g logo** → R4h docs → R4i approvals → R4c installer. Offers open: Record-video toggle + multi-case run on Mac Tests; Scan request (R5b) to be restated.
>
> **Update — 2026-10-15, D-109 UI check:** With the user's OK: Test Batch + Reset UI driven on :4646 (Verified, see progress.md); 3 UI bugs fixed (pill text, two identifier overrides) + readiness refresh on batch change; :4545 restarted on the final code (pid changes on restart), the user's app reopened on :4545 — it now asks to choose the proof folder. Next: commit D-108 + D-109 when told → R4g logo. Scan: R5b queued; user to restate the request.
>
> **Update — 2026-10-15, D-109 (committed `e5ebacfd5`, with D-108):** R4j built — proof folder picker (mandatory) + **Test Batches** (one active, named; everything started while active is collected; proof in `<root>/<local-date>_<name>/`; End writes report.md). Server verified on the :4646 copy (scratchpad `r4f-copy`, fake root `fake/proof`); Mac `TestBatch/` builds + lints clean, UI not driven. Scan: R5b still queued — ask the user to restate their scan request.
>
> **Update — 2026-10-14, D-108 (committed `e5ebacfd5`, with D-109):** R4f Reset built — server `lib/reset.js` + `/api/reset/plan`, `/api/reset` (verified on the :4646 copy with a fake `TEST_FORGE_HOME`/`TEST_FORGE_MEDIA_ROOT` in this session's scratchpad `fake/`; copy dir `r4f-copy`), Mac `Build/Reset/` section (builds + lints clean). User choices: repo = testforge files only, no git; placement = Build section.
>
> **Update — 2026-10-14, D-107 (committed):** Validated on the user's go-ahead: Install for testing → Build and install (17 min) → auto-install → all readiness green (after Get ready › Shut down the others) → Demo run SF-001 PASS, SF-006 PASS, Results → Reports. Runner screenshots only while steps run (~70 MB/test) → R4f Reset will clear `<QA sim>/data/Containers/Data/InternalDaemon/*/Attachments`. 45 GB free. **Next:** R4f Reset, R4g logo, R4h docs, R4i approvals, R4c installer; commit D-099…D-107 when the user says.
>
> **Update — 2026-10-14, D-106 (committed):** The user's first Install for testing failed: disk full (177 MB free). Cause: XCTest automatic screen recording of the long-running TestForgeDriver session — 20 files, 68 GB in the QA sim's `data/Containers/Data/InternalDaemon/<id>/Attachments`. Deleted (user OK) → 64 GB free. Fix: `BlibliMobile-iOS/TestForgeDriver.xctestplan` defaultOptions `preferredScreenCaptureFormat: screenshots`, `systemAttachmentLifetime: keepNever` (keys checked in Xcode 26.3 IDEFoundation). QA copy re-prepared (88ac715+b354). **Next:** user presses Install for testing again; after a session, check that Attachments stays small.
>
> **Update — 2026-10-14, D-105 (committed):** User: "whatever method works clean and smooth" for installing the app for test validation → Build › **Install for testing** (prominent): build current → stop + ensure runner (`test-without-building` installs QA app + runner on the QA sim); otherwise asks "Build first?" and installs automatically when the build succeeds. ⌃⌘R and `XcodeMenuInvoker` removed; Start test runner folded in; harness `ok:false` now surfaces as an error; runner start waits up to 300 s. **The user's next step: press Install for testing → Build and install.**
>
> **Update — 2026-10-14, D-104 (committed):** ⌃⌘R verified after the user's Xcode run (Xcode disables Product items in the background, so the invoker activates Xcode, waits ≤3 s for the item to enable, presses, returns focus). New **Install & launch** (`Build/BuiltAppLauncher`): source QA build / My Xcode build, newest simulator `.app` (APPL, not `-Runner`), `simctl install` + `launch` on the Simulator screen's device else the QA sim — verified with My Xcode build on the dev sim. User will compare and choose.
>
> **Update — 2026-10-14, D-103 (committed):** Build › Xcode: **Install pods** and the CocoaPods row removed (user: not needed); **Run without building (⌃⌘R)** presses Xcode's Product › Perform Action › Run Without Building through Accessibility (`Build/XcodeMenuInvoker`). Refusal path verified; real launch not yet.
>
> **Update — 2026-10-14, D-102 (committed):** Build › Xcode › **Fix Swift package errors…**: the user's procedure as one confirmed button (quit Xcode like ⌘Q and wait ≤60 s → `rm -rf` DerivedData, `~/Library/Caches/org.swift.swiftpm`, `~/Library/org.swift.swiftpm` → `open` the workspace). Both SwiftPM folders also listed under Clean. Dialog verified, not run.
>
> **Update — 2026-10-14, D-101 (committed):** R4e Build screen built (`Build/`): sidebar ⌘8, QA build state + Build for testing (server `/api/build/qa`, confirm), live log, Stop, Xcode/CocoaPods info, Open workspace, Install pods (QA copy), Clean QA build output / Xcode DerivedData, test runner Start/Stop, tutorial (4 tips, scrolls each tip into view via `TutorialCoordinator.activeAnchor`). Verified read-only parts + dialogs on :4545. **Next:** R4f Reset, then R4g logo.
>
> **Update — 2026-10-14, D-100 (committed):** R4d Simulator screen built + verified (`SimulatorControl/`, `App/CommandRunner.swift`). Queue agreed with the user: R4e Build screen → R4f Reset → R4g logo → R4h prerequisites + usage.md → R4i approvals card → R5a Bug Fix Validator design (Jira API token) → R5b Scan study; R4c installer (double-click) + walkthrough; R4b full demo after the user's Build for testing.
>
> **Update — 2026-10-14, D-099 (committed):** R4b demo run built (`Demo/`, `TestForgeViewModel+Demo`, `TestCaseActing.startBatch`). Not-ready path verified on :4545. Full run waits for the user's **Build for testing** (Get ready › App + tests built). D-095…D-098 committed `88ac715a1`. **Next:** after the build, run the demo end to end; then R4c.
>
> **Update — 2026-10-14, D-098 (committed `88ac715a1`):** R4a tutorials built + verified: `Tutorials/` (TutorialTip, Catalog, Coordinator, anchors, ? menu, Settings › Tutorials). Disk filled up mid-session (ENOSPC); the user deleted DerivedData and approved removing `~/.test-forge/derived` (23 GB; next run rebuilds for testing), `~/Documents/TestForge-Test` contents and the Bazaar sample app. AX helper `ax <pid> buttondesc <desc>` presses popover buttons. `relaunch.sh` kills the user's app too, so ask first. **Next:** R4b demo run, then R4c; commit D-095…D-098 when the user says.
>
> **Update — 2026-10-14, D-096 (committed):** Measure toolbar "Views without IDs" toggle (off by default) shows the dashed borders; a colour picker appears while on. Views stay selectable either way. Live :4545 restarted on the current code 2026-10-14 16:42 (it predated the R3d `/api/device/screen` route, so Measure showed "The server answered 404"). D-097: toggle labelled, attributes section removed. **Next:** commit D-095…D-097 when the user says, then R4.
>
> **Update — 2026-10-14, D-095 (committed):** spacing shows whole points snapped to the device pixel grid, halves to even (16.5 → 16, 17.5 → 18). `ThinBarDetector` adds bars under 6 pt tall (pager pill, tab underline); strokes inside icon-sized buttons/images dropped; thin elements get 2 pt click slack. Verified on the Flash Sale screen. **Next:** commit when the user says, then R4.
>
> **Update — 2026-10-14, D-094 (committed):** Measure lists the selection's inset inside every parent out to Screen, and with an element selected, hovering another element (or empty space) draws blue distance lines and a "Compared with" section. The Flash Sale card (right side under the NetworkLens bubble) is now found by an occluded-side fallback in `BlendedLayerAnalyzer`. The user checked it in the app (~90 % as expected). D-091…D-094 committed together. **Next:** R4 (TipKit tutorials + demo); R5 Confluence docs only after R4 and the user's review.
>
> **Update — 2026-10-14, D-093 (committed):** Measure finds views without identifiers from a Color Blended Layers capture (the user's idea). It is switched through CoreSimulator's private `SimDevice setCADebugOption:enabled:` (option 2), never the Simulator menu, which does nothing while the Simulator is in the background. A background pass with a loader adds them as dashed purple elements, mixed into spacing. The user keeps Blended Layers **on** on the QA simulator; the pass always restores whatever state it found. Scratchpad tools: `axbin/cadebug <udid> get|on|off|scan [n]`. **Next:** commit when the user says, then R4.
>
> **Update — 2026-10-14, D-092 (committed):** Measure hides elements less than half on screen and clips to the screenshot. Routes for views without identifiers compared; lldb attach works but freezes the app ≈ 45 s; recommended next: an in-app `viewTree` command in the QA NetworkLens fork (exact frames, corner radius, constraint constants) — waiting on the user.
>
> **Update — 2026-10-14, D-091 (committed):** Measure polish from the user's review: spacing now runs to the immediate visible parent. Cards without an accessibility identifier aren't in the tree, so `VisibleContainerDetector` finds them in the screenshot pixels (straight colour boundary on every scan line, confirmed along the whole side) and estimates the corner radius. Verified on the Flash Sale card (left 28 → 12, bottom 25 → 12, radius ≈ 12). **Next:** more R3e polish if the user asks, then R4.
>
> **Update — 2026-10-14, D-090 (committed `6ecc845de`):** R3e built: the Advanced section (⌘6) has three panels — **Fake data** (master switch, rule on/off, answer picker, decoded answer body, recent calls with response body, Turn NetworkLens on… which asks first), **Recorded steps** (43 recordings, search, check summary, steps with text-only targets flagged, Replay), **Phone remote** (every driver command as a form, Send, verdict + JSON, session history; Relaunch asks first). Existing endpoints and the `status`/`mocks`/`trace` slices only — no server change. `DashboardClient.post(path:json:)` sends real JSON booleans (the server reads `Boolean("false")` as true). Verified on :4646 (details in progress.md). D-089 committed `36882088c`. **Next:** R4 (TipKit tutorials + demo). R5 (Confluence docs, visual) after R4 and the user's review.
>
> **Update — 2026-10-14, D-089 (committed `36882088c`):** R3d built: Simulator bridge (Accessibility API — the Simulator's tree gives the device screen rect and every element by identifier), Arrange, step outline (server reads frames per action step under a lease, ~1.6 s each, off by default), Measure window. All verified in the app: Arrange, step outline (hidden when the Simulator is off screen), Measure with zoom and a full accessibility-attributes pane. Signed with a local local certificate so the Accessibility grant survives rebuilds (an Apple Development certificate got the app blocked as malware — never again). D-088 committed `2ea1ef195`. **Next:** R3e Advanced. R5 (Confluence docs, visual) is queued after R4 and the user's review.
>
> **Update — 2026-10-14, D-088 (committed `2ea1ef195`):** R3c built: menu-bar item (progress, Stop, Open, Quit), finish notification, Dock badge with the failure count, Settings › General toggles. Data from the existing `results` + `narration` slices; no server change. On macOS 26 the status item is hosted by Control Centre and hidden behind the notch on this Mac; verify through the app's AX tree. Waiting on the user: allow the notification permission prompt, then a banner and a non-zero badge still need to be seen. **Next:** R3d (Arrange with Simulator, step overlay, Measure).
>
> **Update — 2026-10-14, D-087:** R3b built and verified on the :4646 copy: `results` slice + `GET /api/results/:id/compare`; evidence keeps proof only (probe shots and deleted files dropped); Mac Results (⌘4: runs, cases, proof inspector, Accept / Override / Needs re-run, Re-run failed, Export / Copy report) and Reports (⌘5: history by branch, compare with any run, report preview, Publish with confirmation — never run without the user saying so). Open: console takes extra height in tall windows (`VSplitView`). **Next:** R3c (menu bar, notifications, Dock badge).
>
> **Update — 2026-10-14, D-086:** Scan mode is in the Mac app (⌘3; server `lib/scan-session.js` + `routes/scan.js`, `scan` slice; plugin `scan_mode.py --events` — reinstall the plugin after its commit). A scan holds the device lock as `scan-mode`; tests are refused while it runs. Settings › General › Appearance (System/Light/Dark). The layout-measure overlay is *not* built — feasibility and recommendation in D-086 (rendered distances from `dumpTree` now; constraint constants + corner radius need an in-app inspector in the QA fork). R3a + D-086 committed together; restart :4545 while idle to pick up the scan routes. **Next:** R3b (Results + Reports).
>
> **Update — 2026-10-14, D-085 (committed):** R3 is sliced R3a–R3e (see D-085). R3a built and verified on the :4646 copy: the loaded document persists in `.data/testcases.json`; new `testcases` slice; the Mac app's Tests section (list, search, filter, detail, Replay, Run with Claude with confirmation, live steps, Stop, ⌘R/⌘., load sheet). :4545 is **not** restarted on it yet (needed for persistence + the slice). If the Mac layout looks clipped, delete the saved split frames (command in D-085). The SF-001 replay failed from the copy at "Show all" — re-check on :4545. **Next:** commit when asked, restart :4545 while idle, then R3b (Results + Reports).
>
> **Update — 2026-10-13, D-077 (committed):** R1 is built. The page gets everything from one SSE stream, `/api/state/stream` (`lib/state-hub.js`, slices listed in `design.md` › "Live state stream"); the data polls and `/api/events` are gone. Also new: `lib/lifecycle.js` (phases), `lib/narration.js` (live steps), `lib/usage.js` (Claude usage from run events — D-076's "only near limits" was the dashboard dropping `allowed` events). The dashboard on :4545 was restarted on R1 (idle at the time) and an SF-028 replay narrated live. To free disk for the 10 GB gate, the unused QA copy `~/.test-forge/checkouts/BlibliIOSApp-POC` and the developer's `~/Library/Developer/Xcode/DerivedData` were deleted (user OK) — their next Xcode build is a full one. Verified on an isolated copy (:4646, own `.data`) — never start a second server from this folder: it would share `.data/tasks.json` with the live one. D-079: SF-028 now fakes range and asserts the special-placement request (new `assertRequested` step); replay PASS. :4545 restarted on all of it. D-080: Confluence load now reads through the Atlassian plugin (`getConfluenceContent`; Rovo 403s) — verified on :4545, 96 cases. D-081: R2 Mac app shell built in `tools/mac-app/` (Swift package; `./scripts/make-app.sh` → `build/TestForge.app`). It attaches to :4545 when it answers, else runs start.sh; test it against a copy with `TEST_FORGE_SERVER_DIR=<copy> TEST_FORGE_SERVER_PORT=4646`. Swift edits need the skill chain swiftui-code-gen → swiftui-architect (hard) → Mobileapps-iOS:swift-codegen → swiftui-components → localization (hooks gate .swift writes). D-082: readiness fingerprints built (passing install checks reused while sim UDID + build are unchanged; `.data/readiness-memo.json`) — :4545 restarted on it (fresh check 6.2 s → 2.2 s). All R2 open checks run and verified; the Mac app now re-adopts a server it started (`.data/app-server.json`). Disk ~10 GB free (gate). D-080/D-081 committed `fd402ba9b`, D-082 `c07db2c36`. D-083 committed `3813fe97e`. D-084 (committed `a61a1da76`; plugin repo committed `84abe02`): readiness + harness probes send `deviceInfo` instead of a screenshot (no PNG per probe); 3,886 old probe PNGs deleted (2.6 GB); disk 21 GB free. The runner idles out after 30 min with nothing connected (TEST_FORGE_DRIVER_SESSION_MINUTES) — by design, self-heals. **Next:** R3 core screens.
>
> **Update — 2026-10-13, D-075:** the whole UI is being redesigned as a native SwiftUI Mac app (user picked mockup C; SF Symbols, Apple HIG). Plan: `docs/redesign-plan.md`. Mockups: private Design artifact https://claude.ai/artifact/EPisTUsbZ1rTuov3qvKfwW, boards C1–C5 (sources in the session scratchpad; republish to that URL with `root` = the `test-forge-mockups` folder). All 17 recommendations approved (15 replaced by live Claude usage, read from the CLI status line's source — design in `redesign-plan.md`, D-076). **No code yet.** **R0:** boards C6–C14, `tutorials.md` and `walkthrough-v4.md` are done. **Next:** the user reviews the boards, then runs the walkthrough (1 developer + 1 QA); sign-off as a decision starts R1. Board sources: `src/` + `partials/` in the session scratchpad `test-forge-mockups`; `node build.mjs` injects CSS and icons into `project/`.
>
> **Update — 2026-10-13, D-074:** SF-006/010/025/026/027 learned and proven with existing fixtures (batch `edb783d9`, 5/5 PASS, $7.25). P8 now covers 12 cases: SF-001/006/010/011/012/024/025/026/027/028/035/090. Every macro turns off in `cleanup` each mock it arms (checked). **Next:** remaining range cases need new variants (no background, no `subFlashsaleUrl`, upcoming, long title, multi-schedule); Special Placement SF-029..034 may need variants too.
>
> **Update — 2026-10-13, D-073:** SF-011 (`mc_SF11K3XQ7M`) and SF-012 (`mc_S12XQ5V7ZA`) learned and proven (batch `bb616d35`, $2.69); range pack gained `invert-mode` and `single`. New pack variants reach the device only when a macro arms them — before a Claude run on a new variant, import the pack into the device session (app quit first). P8 now has 7 cases. **Next:** the user picks further cases.
>
> **Update — 2026-10-13, D-072:** the dashboard no longer names the deleted `test-forge-mock` server. The pre-allowed read-only NetworkLens tools are now `mcp__networklens__lens_(list|mocks|stats|status)` (they were the dead `mcp__plugin_test-flow-recorder_test-forge-mock__…` names); `MOCK_HINT` drops its "never the test-forge-mock proxy" clause. Verified by batch `bb616d35` (D-073).
>
> **Update — 2026-10-13, P8 pilot complete (D-071):**
> - All 5 pilot cases learned and proven: SF-001, SF-024 (`mc_S24RCHVN7K`), SF-028, SF-035, SF-090 (`mc_SF090TAB01`).
> - SF-024/SF-090 use authored fixtures: new `sub-flashsale/range` pack + `sf090-today-tomorrow-other` on `/flashsale`, armed with `retime`.
> - The run prompt now tells Claude: mocks via `networklens` only, repo packs, learned macros' routes; batches pass the tech doc.
> - Label-only `assert` steps replay (they used to be refused).
> - The `test-flow-recorder` plugin was reinstalled from `~/Projects/Tools/test-flow-recorder-plugin` (the cache was from Sep 7) and its `test-forge-mock` proxy was deleted. After a plugin source change, reinstall: `claude plugin marketplace update test-flow-recorder-local` + uninstall/install.
> - The developer's own DerivedData was deleted to clear the disk gate; their next Xcode build is a full one.
> - **Next:** the user decides whether to scale P8 to more cases; review the pilot results run.
>
> **Update — 2026-10-12, P8 pilot (D-070):**
> - 3 Flash Sale macros are learned and proven (SF-001, SF-028, SF-035), at about $10.
> - The verdict is now read from a stated `VERDICT:` line only.
> - **Next, user decisions:**
>   - a `sub-flashsale/range` fixture for SF-024 and SF-090 (author it from the tech doc, or capture one);
>   - whether to scale P8 to more cases;
>   - review the pilot's results run, whose SF-035 and SF-090 verdicts were misread.
>
> **Update — 2026-10-12, P9 + fixes (D-067…D-069), committed `497a4feec` (D-069 specifics also `02913f01a`/`361600354`):**
> - P9 is verified: saved setups with ▶ Run again.
> - The QA build is on NetworkInterceptor `0bfd92e`; 6/6 replays PASS on it.
> - Claude `test-forge-run` sessions now get the QA simulator and build env; the user's local settings had pinned `TEST_FORGE_DEVICE_UDID` to their dev simulator.
> - The build stays current when only `tools/` changed.
> - **Next:** P7c — verify the Claude paths live. Then P8, a pilot of 5 Flash Sale cases chosen by the user: SF-001, SF-024, SF-028, SF-035, SF-090. Learned macros are proven by replay.
>
> **Update — 2026-10-12, P7 (D-066):** the user chose the next phases: P7 hardening → rebuild on the new pin → verify the Claude paths live → P8 macro coverage (Flash Sale page) → P9 saved setups + Run again. P7a/b are done: a frozen runner is restarted by the next test, and the networklens MCP finds the TestForge build.
>
> **Update — 2026-10-12, dry run (on the installed `ec16344+ac99` build):** everything works. Tests 78/78; all tabs render; 12/12 driver replays PASS in one app session; a replay batch → review → report validates. Fixed the readiness banner's literal `null`. Open: the runner wedged once (an `ensure` fixed it; a replay refuses on a wedged harness instead of restarting it); the `.mcp.json` networklens server can't find a NetworkInterceptor checkout (set `NETWORKINTERCEPTOR_PATH`). Details are in `progress.md` under "Dry run".
>
> **Update — 2026-10-12, D-065:** develop merged (`2cdf89f90`). NetworkInterceptor is pinned to `0bfd92e` (`test-forge-driver-2`): the QA launchctl fix on top of 1.0.0; the networklens-mcp copies are re-synced. **Next:** re-resolve packages and rebuild the QA build (only on request), then re-run SF-084 and the login flows.
>
> **Update — 2026-10-12, P6 (D-064), committed `d88bd9b0a`:**
> - Cases share one app session. "Open Home" backs out, taps the Home tab, scrolls to the top, and relaunches only when Home isn't reachable or a launch-time input the case sets changed (`atLaunch` mocks, app defaults).
> - One macro per id. Other modules reuse it through `.ref.json` references; a macro links N cases through `links.testCases`; `/api/macros/lint` keeps it so.
> - The mock rules the macros use live in the repo (`TestForgeMacros/mocks/`) and are imported automatically when the device lacks them.
> - A batch replay that fails → Claude triage (APP_BUG / MACRO_BROKEN → repair + driver replay / ENVIRONMENT). A case Claude passes → the same session saves a macro, proven by a driver replay. Both verified live.
> - Saved setups / Home "Run again" are not built: the user redefined "setup" as macro identity.
> - **Next:** commit P6 (the macro, registry and pack changes under `BlibliMobile_XCUITest/` too); decide on the demo macro HM-901; exercise triage on a real app bug; the Bahasa label for "Continue as guest".
>
> **Update — 2026-10-12, D-063:**
> - FLAKY verified live: SF-084 failed with the flashsale schedule mock on `empty` (run `c64dd9c2`), passed on re-run with `loaded` (`8865b3b1`), final verdict FLAKY.
> - A case that ends without passing now gets a simulator screenshot in `$TEST_FORGE_MEDIA_ROOT/failures/` as evidence (Built).
> - Nothing published: the user said "do not publish anything yet".
>
> **Update — 2026-10-12, P5 (D-062):**
> - The Results card (Test Cases tab) shows each run with what it tested and each case's evidence.
> - Review: Accept / Override / Needs re-run. A run counts as Validated when every case is accepted or overridden.
> - Re-run failed: a case that fails and then passes is FLAKY.
> - Report: Markdown export, and Publish (a Claude task: a child page of 2437316839, which you approve).
> - **Next:** P6 (saved setups + Home "Run again"); a mock pack in the repo; publish one report once the user agrees.
>
> **Update — 2026-10-12, P4 (D-061):**
> - "Run selected" is a server-side batch: a case replays its linked macro if it has one, otherwise it runs through Claude.
> - Pause / Continue / Skip case / Cancel all work.
> - A live view shows the current step and the simulator screen.
> - A crash marks the case BLOCKED and holds the batch. This crash path is unit-tested only.
> - **Next:** P5 (results validation, FLAKY, report); a mock pack in the repo; verify a Claude-mode batch case and a real crash when one happens.
>
> **Update — 2026-10-12, later (D-059):**
> - Failure notes name only the mocks that answered during the run (from the trace).
> - `tap {force: true}` taps outside a sheet.
> - #106 is verified. Both ways out of the skip-login sheet are covered: Continue (`mc_MT0JR95CYS`, D-060) and tap outside (`mc_MSFL3T25BT`). Both PASS on PROD.
> - **Next:** P4 (Run step); keep NetworkLens rules in the repo as a mock pack.
>
> **Update — 2026-10-12 (D-058):**
> - The QA simulator now runs on **PROD**, app reinstalled from build `ec16344+ac99`, logged in. The user wants to stay on PROD while it works (UAT B is back too).
> - The Flash Sale macros (Demos 1–5, SF-084) require PROD and force the revamp on with mock routine `mc_MR92KFNMPS`. All PASS.
> - Login error sheet is repeatable via the mocked token call: `mc_MPVN5016NR` (PROD, PASS).
> - Macros support `cleanup` and mock `retime`.
> - NetworkLens rules live only in the app container; a reinstall wipes them. Backups are in `~/.test-forge/mock-backup/`. **Open:** keep them in the repo as a mock pack.
>
> **Update — 2026-10-11, later (D-056, D-057):**
> - The QA copy was re-prepared and rebuilt (`ec16344+ac99`); the login `alertTap` works with Utility `-5`.
> - The first rebuild failed because `Package.resolved` floated NetworkInterceptor on master. It is now pinned by revision `280a4e1`, like the pbxproj. Build failures now record every error line as it streams (`errors`), not just "exited 65".
> - **UAT B auth is down**, so login shows the "There was a problem when connecting to your account" sheet. New macros: `mc_LR6KURC8CF` (flow, verified PASS 29 s), routines `mc_LR6KUR4AP6` (Try again) and `mc_LR6KURXYR9` (Continue as guest). Both login routines run the Try-again routine and fail clearly while the sheet stays.
> - **Waiting on UAT:** #106 (outside-tap login recovery), SF-084 replay on the new build.
> - **Open:** the interceptor note on a failed run lists unrelated mocks; mock the auth call so the error-sheet flow doesn't need an outage; Bahasa label for "Continue as guest".
>
> **Update — 2026-10-11:**
> - P3 checklist is built and verified (D-055). P2's first QA-copy build (`28f5c17+7a71`) is verified, and run records carry the build stamp.
> - Dashboard work up to P2 is committed: `4b02122ac`, plus `f79366a38` (networklens-mcp .gitignore).
> - **Next:**
>   1. Re-prepare the local snapshot (it pins Utility `-2`, so the login `alertTap` fails), then **Build the app** and replay SF-084.
>   2. P4 (Run step: per-case live view, pause/skip, crash handling).
>
> **Snapshot — 2026-10-09, end of session.** The newest facts; the older bullets below are history.
> - **Phases:**
>   - P1 built; its closure items are built (D-053). The P1 walkthrough with a person is still open.
>   - **P2 built (D-054). The first real QA-copy build has not run yet.**
>   - P3–P6 not started.
> - **Simulator:**
>   - QA runs use **`TestForge · iPhone 12 Pro Max`** (`AC2A1B55-2C97-46EA-81AA-06C01819B753`). It is a
>     `simctl clone` of the developer's `iPhone 12 Pro Max` (`38CF7E67-…`, now shut down), so it
>     carries the app, its data (env UAT B, logged in) and the saved passwords.
>   - It must be the only booted simulator.
> - **Readiness (`/api/readiness`):** QA sim ✓ · app ✓ · build ✗ (`28f5c17+7a71 isn't built yet`) ·
>   harness waiting. Every Run/Replay stays disabled (and the server answers 423) until all four are ✓.
> - **To finish P2:**
>   1. Re-prepare the local snapshot (Question 1). The loaded one is from 2026-10-08.
>   2. Click **Build the app** (a confirmed click; 10–25 min; VPN).
>   3. Click **Start harness**.
>   4. Replay SF-084 and check that the run record has `build.codeId`.
> - **Built today (D-051…D-054):**
>   - one test at a time (409);
>   - automatic preconditions from macro `requires` (env switch / NetworkLens / login, logout);
>   - Test Cases auto-match macros by `links.testCase` ("Pick macro" removed);
>   - login outside-tap recovery (`onlyIf`) — the happy path is verified, the outside tap itself is not;
>   - Queue **Clear finished**;
>   - readiness gate;
>   - QA simulator, branch lock, free disk space;
>   - QA-copy build with staleness checks and an UNVERIFIED BUILD override;
>   - run records stamped with code and build.
> - **Verified on device today:**
>   - SF-084 from PROD: switch to UAT B → login → PASS.
>   - Demo 2: NetworkLens on → PASS.
>   - A second click got a 409.
>   - The QA simulator clone was created.
>   - `npm test` **50/50**.
> - **Outside this repo:** `harness.py` (`TEST_FORGE_DERIVED_DATA`, `TEST_FORGE_SIMULATOR_UDID`) in
>   `~/Projects/Tools/test-flow-recorder-plugin` on branch `darshan/feature/test-forge-mock-dataplane` — now
>   committed (`ba1d9ee`, "QA build env in harness"); that plugin repo's working tree is clean.
> - **This snapshot is from 2026-10-11/12** (P1 era) — everything from P2 onward has long since been
>   committed (see the "Current state" section at the top of this file and `progress.md`/`decision.md`
>   for the real history). The "Nothing committed since 28f5c17" claim below is stale, kept only as a
>   dated snapshot.
> - **Still open:**
>   - the outside-tap login check on device;
>   - the SF-084 buggy-build check;
>   - Outlook OTP (waiting on IT admin consent);
>   - the P1 walkthrough.

- ✅ **v3 design signed off (D-039, 2026-10-08) — development may resume.** Spec:
  [`workflow-plan.md`](workflow-plan.md) (+ D-035 three-questions UI), [`usage.md`](usage.md),
  [`feasibility-macros.md`](feasibility-macros.md), prototype `docs/prototype/index.html` (v8). Each
  phase ends with a walkthrough using [`walkthrough.md`](walkthrough.md) task cards.
- **P1 built (D-041):** Test Cases tab starts with **1 · What code?** (`public/js/code.js`,
  `routes/code.js`, `lib/test-forge-copy.js`). QA copies live in `~/.test-forge/checkouts/<repo>` (GitHub
  branch) and `<repo>-local` (snapshot); state + current manifest in `~/.test-forge/state.json`.
  The developer's repo is only read (`GIT_OPTIONAL_LOCKS=0`, no fetch — `ls-remote` for refresh).
  Mirror removed; the rail is the "QA simulator" status panel. Questions 2–3, the Run button and the
  pipeline are not wired to the QA copy yet (P2+): ▶ Run still uses `TEST_FORGE_PROJECT_DIR`.
- **M0 built (D-040):** the dashboard hosts the TestForgeDriver queue on `:8789` (`lib/driver-host.js`);
  macro schema v2 + registry + replay in `lib/macro-v2.js`; SF-084 macro and
  `TestForgeMacros/elements.json` under `BlibliMobile_XCUITest/` (untracked, not target members).
- **D-044/D-045 (2026-10-09):** test logins live in the macOS Keychain (`test-forge.login.<env>`);
  `typeSecret` / `manual` macro steps; dashboard popups for SpringBoard UI; login routines in
  `Authentication/General/macros/`. Header shows the Claude account + the code under test, and new
  Claude sessions open in the QA copy. **Never write credentials into files, macros, docs or memory.**
- **D-046:** Blibli-Utility tag `test-forge-driver-3` (anyOf label query + SpringBoard alertTap) is pushed, and `SwiftPackageList.txt` is pinned to it. Done: packages refreshed, rebuilt, and the final SF-084 20× on this runner is **20/20 PASS**, ~27 s per run. Tomorrow tap 2.0 s and Show all tap 2.4 s are XCTest idle waits. **Open:** the buggy-build fail check; SpringBoard `alertTap` on the login routine.
- SF-084 now **PASSES** with a live NetworkLens mock of `GET /backend/content-api/flashsale?display=app`
  (Today + Tomorrow schedules; regenerate timestamps daily). The 20× go/no-go has not been run yet.
- **D-043:** every FAIL/BLOCKED v2 replay appends the NetworkLens state (live app first, else
  `session.json`): mocking ON/OFF, armed endpoints, and a warning when mocking is ON. SF-084 now
  reaches the **revamp** page. It is blocked on (1) no schedules in UATB (empty state) and (2) the
  `CommonNavBar` container ID masking `FS_NavBarShareButton`.
  `POST /api/macros/v2/:id/replay` exists; no Macros UI yet (M3).
- Tests: `npm test` (node:test, 16 tests: fake runner for the queue/replay, throwaway git repos for
  the QA copy).
- **v2 TestForge built** (tabs Home · Sessions · Queue · Projects + device rail, on top of v1 Mocking ·
  Driver Console · Test Cases). Architecture: `design.md` → "TestForge v2"; decisions D-023…D-030 (Jira / PR views removed — keep the focus on TestForgeDriver);
  feature states in `progress.md`. Plan: `~/.claude/plans/partitioned-strolling-pearl.md`.
- Sessions are Agent SDK `query()`s (`lib/claude-session.js`); approvals / questions answered in
  the GUI; device lock taken in a PreToolUse hook; queue in `lib/task-queue.js`.
- Loading UI: use `spinner()` (and `skeletonRows()` for tables) — one simple ring loader, no shimmer. Never let a spinner sit in a flex item that grows (`flex: 1`) — it stretches into a spinning ellipse.
- New v2 UI code goes in `public/js/*.js` ES modules using `app.js` globals (D-027).
- **Claude drives external access (D-022):** ▶ Run and Confluence load spawn `claude -p` via
  `lib/claude-runner.js`; no Confluence token needed. Local control (mocks, driver, harness) stays
  direct. New integrations (Phase 3) must follow the same pattern.
- ▶ Run streams `claude -p --output-format stream-json`; events are formatted by
  `lib/claude-stream.js` (schema notes in `design.md`, D-021). Headless sessions get the user's
  claude.ai connectors (Atlassian Rovo connected). No real `/test-forge-run` executed yet.
- New UI work must use the shared helpers in `public/app.js` (`request`, `withBusy`,
  `startBusyLine`, `toast`, `el`) — see `design.md` → UI states. Never use `innerHTML`.
- UI verification recipe: drive headless Chrome over CDP from a scratch Node script
  (`--remote-debugging-port`, `Runtime.evaluate`, `Page.captureScreenshot`). Do **not** use
  `--virtual-time-budget`: the page polls forever and Chrome never exits.
- Server: `tools/test-forge-server/start.sh` → `http://127.0.0.1:4545`. Launcher: `TestForge server.app`.
- `.env.local` exists on the author's machine with `TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE=1`; Confluence
  credentials are **empty** (not needed — loads go through Claude).
- Harness: test bundle **built** (2026-10-08, `-skipPackagePluginValidation`); runs on **iPhone 12 Pro
  Max, iOS 17.5** (`38CF7E67-2BC4-4D5E-B7B9-D5D796260508`) — the 17 Pro Max / iOS 26.1 sim was faulty
  and is shut down (D-042). Runner outcomes arrive as `{id, value}` / `{id, error}`.
- Macros on disk: SF-084 (`Engagement/FlashSale`), onboarding routine `mc_EAH97EMYH5` + first-launch
  flow `mc_EAH97EE096` (`SplashScreen/General`) — both onboarding macros PASS on device.
- **This snapshot is from 2026-10-08/09 (P1/M0 era) — stale.** P1 + M0 were committed `4b02122ac`
  ("macro replay, auto preconditions, readiness gate, QA simulator, QA-copy build") shortly after
  this was written; everything since is in the "Current state" section at the top of this file.

## Hard constraints (do not violate)

1. **Production Confluence page 2396520535** (GDNIT, "Test Cases - Sub Flashsale & Special
   Placement Section"): read only. Never comment on it, never edit it, never mention QA Mocker /
   TestForgeDriver / NetworkLens on it. Reports go to personal-space page 2437316839.
2. **Docs travel with code.** Any change under `tools/test-forge-server/` updates `progress.md`,
   `context-resumption.md`, and — when relevant — `design.md`, `decision.md`, `README.md`, in the
   same change.
3. Files copied from `tools/networklens-mcp/dist` stay byte-compatible; re-copy, don't edit.
4. Never run `build-for-testing` implicitly; only via the confirmed button or an explicit request.
5. Do not commit `.env.local`, `.data/`, `node_modules/`.
6. Do not commit unless the user asks.

## Environment facts

| Thing | Value |
|---|---|
| QA simulator | "TestForge · iPhone 12 Pro Max" iOS 17.5 `AC2A1B55-2C97-46EA-81AA-06C01819B753` — confirmed live via `findTestForgeSimulator()` during D-156; this table drifts, `.claude/settings.local.json`'s `env.TEST_FORGE_DEVICE_UDID` (auto-filled, D-156) is the source of truth |
| App bundle id | `com.blibli.mobile` |
| Xcode project dir | `BlibliMobile-iOS/` (workspace `BlibliMobile-iOS.xcworkspace`) |
| Driver scheme / config / plan | `BlibliMobile-iOS-PerfTest` / `PerformanceTest` / `TestForgeDriver.xctestplan` |
| UI test target / macro root | `BlibliMobile_XCUITest` |
| test-flow-recorder scripts | `~/Projects/Tools/blibli-testforge/plugin/skills/test-flow-recorder/scripts/` |
| Node | v26 (needs ≥22 for `fs.globSync`) |

## How to verify quickly

```bash
curl -s localhost:4545/api/status           # appRunning, controlQueueUp, ruleCount
curl -s localhost:4545/api/harness/status   # probe PASS/FAIL
```

- **Login + environment routines (D-047):** saved (`log-in-ios-saved-password`) and not-saved
  (Keychain) login variants under `Authentication/General/macros/`; environment switch under
  `Enticement/AboutBlibli/macros/` (triple-tap the About logo). The switch uses TestForgeDriverKit
  multi-tap (tag `test-forge-driver-4`, pinned, verified). **After editing anything in `lib/`,
  restart the dashboard (`./start.sh`)**: Node caches modules, and a stale `planStep` silently
  dropped `taps`.

- **Prod OTP from Outlook (D-048):** `lib/mail-otp.js` reads the code mailed by
  `noreply@bliblitiket.com` through Microsoft Graph (`Mail.Read`, device-code sign-in, refresh token
  in the Keychain). Falls back to the popup. Blocked: the company tenant needs admin consent (request sent 2026-10-09); prod OTP uses the popup meanwhile.

- **Macros tab + demo set (D-049):** the Macros tab lists every repo macro with search and
  ▶ Replay. Demo 0–5 (`Engagement/FlashSale/macros/`) arm their own mocks with `mock` steps. After
  an environment switch, run `setAppDefault NetworkLensEnabled true` (Demo 0 does). TestForgeDriverKit is
  pinned at `test-forge-driver-5`.

- **QA forks of shared packages (D-050):** changes go on `darshan/innovation/test-forge-driver` +
  `test-forge-driver-N` tags, and this POC pins the tags; prod (`master`) is never touched.
  - TestForgeDriverKit: Blibli-Utility tag `-5`, via `SwiftPackageList.txt`.
  - NetworkLens: NetworkInterceptor tag `-1` (`280a4e1`), via a `kind = revision` pin in
    `project.pbxproj` + `Package.resolved`. Worktree `~/Projects/Tools/NetworkInterceptor-qa`.
  - After an upstream MCP change: build, then `scripts/sync-networklens.sh ~/Projects/Tools/NetworkInterceptor-qa`.

## Next steps

- **Current (2026-11-03, after the D-163…D-208 commit):** on-screen checks still open — D-206 System prep section during
  a replay with explanations, D-207 subtitle placement + tail on a real case, D-203…D-205 Deeplinks search / query rows /
  version menu, R0 (fast replay start) and R0b (start screen per case). MT-015: re-run since its alert step was dropped
  (D-202). D-208 verified by the user. Nothing pushed.

- **v4 redesign (D-075):** R0 design completion → R1 single state stream (remove all `setInterval` polling) → R2 Mac app shell → R3 screens → R4 tutorials + demo. See `redesign-plan.md`.
- P2 first real build (D-054). Re-prepare the local snapshot in Question 1 (the loaded one is 28f5c17+7a71 from 2026-10-08), then **Build the app** (confirmed) → Start harness → replay SF-084 on `TestForge · iPhone 12 Pro Max`. Confirm the runs carry `build.codeId`.
- The `harness.py` change (TEST_FORGE_DERIVED_DATA / TEST_FORGE_SIMULATOR_UDID), on branch `darshan/feature/test-forge-mock-dataplane` in the plugin repo, is now committed (`ba1d9ee`) — that repo's working tree is clean.
- QA runs need `TestForge · iPhone 12 Pro Max` as the only booted simulator. The developer's `iPhone 12 Pro Max` is shut down; boot it when needed, and readiness will then offer "Shut down the others".

- D-052: the PerformanceTest test bundle is missing from DerivedData. Build it from the dashboard (confirmed button), then Ensure. Tests stay disabled until then.

- D-051 follow-ups: exercise the login outside-tap recovery on device; add `requires` to every new case macro (and `links.testCase`); prod login with OTP stays manual (popup) until Outlook consent lands.


1. ✅ Decisions §11 answered (D-032). Key rule for P1: everything QA-related lives in
   `~/.test-forge/` (independent clone, detached checkout, own DerivedData, QA simulator) — the
   developer's repo / project must never be affected.
2. ✅ Static clickable prototype built: `docs/prototype/index.html`, published privately at
   https://claude.ai/artifact/PG3DEEYHbW1mh2ojvSJHkt (an Artifact page fragment — no doctype; to
   update, edit the file and republish to that URL). The purple "Prototype" bar jumps between states.
   Version 3 (D-035) replaced the 7 step cards with three questions + one Run button + an automatic
   progress list, and added the local repository source (D-034). Version 2 removed the simulator mirror (D-033): the rail is a status panel with **Show Simulator
   window**. P1 must also delete the built mirror (`/api/device/mirror.jpg`, mirror code in
   `public/js/device.js`).
   Version 4 added the prompt section + Macros (D-036); v5/v6 the Home tab (opens by default) and
   "A local repository (git working copy)" wording (D-037).
   **The user approved the design work up to v6 for commit on 2026-10-08** ("We are good to commit
   till this stage") — that is not the §10 sign-off; the walkthrough is still the gate.
3. ✅ Walkthrough gate closed by user sign-off (D-039); walkthroughs now happen at the end of each phase.
4. ✅ P1 Code step and M0 (queue + macro v2 replay) built — see `progress.md`.
   **Next:**
   - M0 go/no-go: SF-084 reaches Flash Sale but this environment shows the old, empty Flash Sale
     page — arm the revamp + schedule data (NetworkLens mocks / flag), then replay 20×.
   - Phase walkthrough for P1 (`walkthrough.md` T1 step 1 and T5 step 1–3 are now real).
   - P2: Build step against the QA copy (`xcodebuild build-for-testing` in `<copy>/BlibliMobile-iOS`,
     own DerivedData under `~/.test-forge/`, build id → snapshot id); point ▶ Run / harness at the
     QA copy. Check whether the local snapshot (no `.git`) builds.
5. Macros: `docs/feasibility-macros.md` — TestForgeDriver macros with generated element IDs mapped to a11y
   locator chains, plus an "Ask the driver" prompt section. Verdict: feasible in phases (M0–M5); M0 spike =
   SF-084 bug-verify macro. Prototype v4 now shows the prompt section + Macros (D-036). §8 answered (D-038): macros in `BlibliMobile_XCUITest/…/macros/` (never in the app), TestForgeDriverKit via
   `test-forge-driver-N` tags → develop only after multi-module E2E testing, Load Jira (Bug tickets only),
   visual macro map before saving (prototype v8). Key facts: macro
   recorder/replay already exist (`/test-forge-macro`, `lib/macro.js`) but without IDs/chains/assertions; the
   `:8789` queue lives in the test-forge-driver MCP process; `dumpTree` is text cut at 20k chars.
