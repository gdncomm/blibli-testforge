# TestForge v4 — Tutorial scripts

_Design for R0 (D-076). Built in R4a with TipKit (D-098). **The tables below are the R0 design; the built scripts are in `Sources/TestForge/Tutorials/TutorialCatalog.swift` and listed at the end (R4 revision).**_

## Rules for every tutorial

- **Shown automatically** the first time a person opens the feature, if Settings › Tutorials ›
  "Show tutorials automatically" is on (default on). Replay any time from Settings or the panel's
  **?** button.
- **At most 6 tips per feature.** Each tip: a title of 2–5 words, a body of at most 2 short
  sentences, one highlighted control (spotlight), and **Next / Skip tutorial**. The last tip says
  **Done**.
- **Plain words only.** No internal names (macro, harness, NetworkLens, MCP, xctestrun). The
  glossary below is the vocabulary.
- **A tip never blocks work.** Clicking the highlighted control does the real action and advances
  the tutorial.
- Progress is stored per feature ("Seen", "In progress n/6", "Not seen") and shown in Settings.
- Each tip has an accessibility label equal to its title + body; VoiceOver reads it on appear.

## Glossary (the words the app uses)

| Say | Means (internal) |
|---|---|
| Test | a test case (e.g. SF-011) |
| Recorded steps | a learned macro, replayed by the driver |
| First run with Claude | a Claude `/test-forge-run` session that records the steps |
| Test robot | the TestForgeDriver XCUITest harness on the simulator |
| Network Mocks | NetworkLens mock rules and variants |
| Phone | the QA simulator |
| Proof | screenshots and evidence saved with a result |
| Get ready | the readiness checks |

## 1. Get ready (C2, C6) — 5 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Page title | This page checks everything | Before tests can run, your Mac, the project and the phone must be ready. Green means ready. |
| 2 | Overall progress bar | One bar for all checks | It fills as checks pass. After the first launch only what changed is checked again. |
| 3 | A check row | Every check says why | Each line says in plain words what was checked and what was found. |
| 4 | A Fix button | Fix it with one click | When something needs you, its Fix button does the work or tells you exactly what to do. |
| 5 | Console button | Want the details? | The console at the bottom shows the real commands and their output. ⌘⇧Y shows or hides it. |

## 2. Choosing and running tests (C1) — 6 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Tests list | Your tests | Every test from the test document is listed. Tick the ones you want to run. |
| 2 | "How it runs" chip | Recorded or first run | Recorded tests replay by themselves. A test that was never run needs one first run with Claude. |
| 3 | Branch picker | Which code | Tests run against this branch. The app checks the phone has an app built from it. |
| 4 | Repeat picker | Run more than once | Repeat 3× to catch tests that pass only sometimes. |
| 5 | Run button | Run your tests | Press Run or ⌘R. Stop or ⌘. ends the run and cleans up the phone. |
| 6 | Status strip | Always know what is happening | The strip shows the test, run and step in progress, and how long it has taken. |

## 3. Live steps beside the Simulator (C1, C3) — 5 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Arrange with Simulator | Put them side by side | One click places this window left and the Simulator right. |
| 2 | Now running list | Each step in plain words | As the robot works on the phone, each step appears here with its time. |
| 3 | Current step | Same number on the phone | The step in progress is outlined on the Simulator with the same number. |
| 4 | A failed step (demo data) | Failures show proof | A failed step shows the screenshot taken at that moment. |
| 5 | "Show in console" link | See the raw lines | Click a step to jump the console to what really happened. |

## 4. The console (C1) — 4 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Console | Raw logs live here | Everything the app, the phone and Claude do is written here as it happens. |
| 2 | Source filters | Show one source | Pick Claude, Phone, Build or Network Mocks to see only those lines. |
| 3 | Step chip | Lines for one step | When you pick a step, only its lines are shown. Clear the chip to see all. |
| 4 | Copy button | Share a log | Copy puts the visible lines on the clipboard for a bug report. |

## 5. A first run with Claude (C7) — 5 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Claude chip | Claude is working this out | The first time a test runs, Claude reads it, drives the phone and records the steps. |
| 2 | Approval card | You stay in control | When Claude wants to change something, like fake server data, it asks first. |
| 3 | Usage pill | Usage is live | These are the same numbers as the Claude status line. Recorded runs use none. |
| 4 | Step list | Steps are being recorded | When the test passes, these steps are saved and later runs replay them without Claude. |
| 5 | Stop button | Stop at any time | Stop ends Claude's run and cleans up the phone. |

## 6. Results and proof (C9, C10) — 6 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Run summary | How the run went | Passed, failed and flaky at a glance, for this branch. |
| 2 | Run dots | One dot per run | Green passed, red failed. A test that failed once and passed otherwise is flaky. |
| 3 | Failed step | Where it broke | The failing step is shown with what was expected and what was seen. |
| 4 | Proof screenshot | The proof | Screenshots from the moment of failure are kept with the result. |
| 5 | Ask Claude to look | Need a second opinion? | Claude can tell an app bug from a broken recording. This uses Claude usage. |
| 6 | Compare with develop | What did my branch change? | See which tests started failing or were fixed compared with develop. |

## 7. Network Mocks (C12) — 5 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Intro | Choose what the server answers | Make the app see no campaigns, an error or a slow answer, without touching the real server. |
| 2 | An endpoint switch | One switch per answer | Turn on fake data for one part of the page. |
| 3 | Variant cards | Pick the situation | Each card is one situation, like Empty or Server error. |
| 4 | Auto-off note | It switches itself off | When a test ends or is stopped, fake data turns off. |
| 5 | Request log | See it happen | Every request the app makes is listed, listed with the answer each got. |

## 8. Recorded steps (C13) — 5 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Recording list | Saved steps per test | Each test that passed with Claude has its steps saved here. |
| 2 | Steps section | Readable and editable | Each step is in plain words; you can reorder or change one. |
| 3 | Clean up section | Always tidied up | These steps run even when the test fails, so the next test starts clean. |
| 4 | Replay | Try it now | Replay runs just this recording on the phone. |
| 5 | Re-record with Claude | When the app changed | If the screen changed, Claude records the steps again. |

## 9. Simulator Driver (C14) — 4 tips

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Command buttons | Drive the simulator yourself | Send the test driver one command — tap, type, scroll, open a link — without writing a test. |
| 2 | Tap by label form | Find things by their text | Type the words on the button, then Send. |
| 3 | Element tree | See what the robot sees | The tree lists everything on screen with its id and position. |
| 4 | Lock note | Not during a test | Commands wait while a test is running so they don't get in its way. |

## Demo run (recommendation 12)

Free, no Claude, about 3 minutes. Started from Settings › Tutorials or the sidebar's Demo run.

1. **Get ready** plays its 5 checks with the real results (nothing is changed).
2. Selects **SF-001** and **SF-006** (recorded, Flash Sale), Repeat 1×, and arranges the windows.
3. Runs them. Each step's tip appears beside the live step list; the outline shows on the Simulator.
4. Opens **Results**, shows the run dots and the proof screenshots.
5. Opens a sample **report** and stops: "That is the whole flow. Pick your own tests to start."

If Get ready is not green, the demo stops at step 1 and explains which Fix to use — it never runs on
a phone that isn't ready.

## R4 revision — what was built (D-098)

| Tutorial | Tips (title → control) |
|---|---|
| Get ready | This page checks everything → header · Only changes are checked again → header · Every check says why → checks · Want the details? → console button |
| Choosing and running tests | Load your test document → Load · Find a test → filter bar · Recorded or first run → list · Replay recorded steps → Replay · First run with Claude → Run with Claude · Follow every step → live steps |
| Working beside the Simulator | Put them side by side → Arrange · See the step on the phone → Outline steps · Each step in plain words → live steps · Measure the screen → Measure |
| The console | Raw logs live here · Show one source · Find a line · Share a log |
| Scan | Scan the app by hand → scan panel · Start a scan → Start scan |
| Results and proof | Every run is here · How the run went · One row per test · Run failures again · Hand the run on → Export bundle · Replay someone's run → Import bundle |
| Reports | Runs by branch · Pick what to compare · What changed |
| Network Mocks | Three tools · Choose what the server answers · One switch per answer · See it happen |
| Recorded steps | Saved steps per test · Readable steps · Try it now (→ list) |
| Simulator Driver | Drive the simulator yourself · Send it · See the answer · Everything you sent |
| Measure | Click any element · Point to compare · Views without IDs · Zoom in · Capture again |
| Simulator controls (D-100) | Pick the phone · See the layers · Restart the app · Change a saved setting · Start clean |
| Building the app (D-101) | Is the app built? → state · Ready for tests in one click → Install for testing · Xcode stays closed → Open workspace · Free up space → Clean |

Dropped from R0 (controls not built): branch picker, repeat picker, usage pill, approval card, step chip, Ask Claude,
spotlight. **?** is one Tutorial menu per window toolbar.

**Demo run as built (D-099):** ? menu or Settings › Tutorials → checks Get ready and the two recordings → batch of
SF-001 + SF-006 beside the Simulator → Results (tips) → Next: Reports (tips) → "That is the whole flow."

## R6 revision — coverage for D-120…D-150 (D-151)

Added and updated so every screen and feature has a tip (scripts as built in `TutorialCatalog.swift`):

- **Get ready** + "Proof goes into a Test Batch" (toolbar pill): every run and its screenshots are filed into the active
  Test Batch; start one there, End writes its report.
- **Choosing and running tests** › "Follow every step" + a Claude run's **Claude session** button.
- **Working beside the Simulator** › "Put them side by side" now describes Split View: this window left, the Simulator
  full screen right, asks which simulator when several are open, press again to leave.
- **Measure** › "Zoom in" + "or hold ⌥ and scroll"; new "Snapshot with notes" (pins, save or copy, Show in Finder).
- **Simulator controls** already covered "Used by tests" / "Use for tests" (D-120).
- **New — The network console (⌘9), 3 tips:** "Is the app listening?" (health strip), "Four views" (Traffic, Mocks +
  scenarios, Breakpoints, Trackers), "Open a call" (headers, body, curl; mock, replay, hold).
- **New — Claude in the TestForge (⌘0), 4 tips:** "Every Claude session" (switcher, waiting first, sidebar badge),
  "See everything" (Details), "Tell Claude what to do" (message any session, quick replies, ⌘↩), "From your phone"
  (Remote Control, QR).
- The usage bar has no tip — it can be hidden and a tip can't point at a hidden view; the welcome tour covers it.

## R7 revision — D-157 + D-158

- **Simulator controls** › "Restart the app" no longer mentions links; new **"Open any screen by link"** (anchor
  `.simulatorDeeplinks`): pick a screen from the app's routes, fill its blanks, Open in app — no relaunch, it opens over
  the current screen.
- **Choosing and running tests** › "First run with Claude" adds: Auto picks the model by how hard the case looks and
  moves up if it gets stuck.
- Welcome tour: QA "Run tests" line mentions Auto; Developer "Control the phone" line mentions deeplinks over the
  current screen.

## R8 revision — D-160 Query Brief

New feature **Query briefs** (Brief ⌘B ? menu), 6 tips:

| # | Highlights | Title | Body |
|---|---|---|---|
| 1 | Brief list | One brief per question | Each long chat query gets its own brief. They're saved, so you can come back after people answer. |
| 2 | New brief | Start a brief | New brief opens an empty composer. |
| 3 | Chat query box | Paste the chat | Paste the thread as it is, add links, and tag who should answer: BE, UI/UX, DA, PM, QA or Dev. |
| 4 | Screenshot controls | Pin the screenshot | Add or paste a screenshot, then tap it: numbers mark questions, letters mark what to look at. Write a note for each pin. |
| 5 | Analyse | Get one visual | Claude picks the clearest visual (truth table, pinned screenshot, flow, or tracker param matrix) and lists who to ask what. |
| 6 | Share bar | Share it | Copy the text and image for chat, save the PNG, or post the summary as a Jira comment. Jira asks first. |

Welcome tour: step 8 "Untangle a long query" (Brief · ⌘B, needs Claude) on both the QA and Developer pages.

### Revision R9 (D-162, 2026-10-31) — run bundles

Results and proof gains 2 tips (Results ? menu):

| # | Highlights | Title | Body |
|---|---|---|---|
| 5 | Export bundle… | Hand the run on | Saves the run as one file: its tests, recordings, mocks and verdicts. Send it to whoever checks next. |
| 6 | Import bundle… | Replay someone's run | Open a bundle, add its recordings and mocks, then replay its recorded tests without Claude. Each row shows the bundle's verdict. Tests without a recording list their mocked responses; Set up mocks switches them on. |

Welcome tour: step 9 — QA "Replay a developer's run" (Results › Import bundle…), Developer "Hand your run to QA"
(Results › Export bundle…); neither needs Claude.

### Revision R10 (D-165, 2026-11-01) — explained replays

Choosing and running tests gains 1 tip (anchor `testsExplainMenu`, after Replay):

| Highlights | Title | Body |
|---|---|---|
| Explain menu | Replays anyone can follow | Replay with explanations shows what the test checks, a subtitle per step and a pointer on the element, over the Simulator. Record demo video saves it in English and Bahasa. Explanations are written once with Claude. |

Welcome tour: step 10 — QA "Show anyone what a test checks" (Test Cases › Explain), Developer "Demo your story
without a call" (Test Cases › Explain; needs Claude once for the explanations).

### Revision R11 (D-166, 2026-11-01) — local case edits

Choosing and running tests gains 1 tip (anchor `testsEditButton`, before First run with Claude):

| Highlights | Title | Body |
|---|---|---|
| Edit… button | Fix a case's text | If the document's steps or expected result are wrong, Edit corrects them on this Mac. Runs and Claude use your text, the document stays untouched, and Revert brings its text back. |

Welcome tour: step 11 — QA "Correct a case the document got wrong" (Test Cases › Edit), Developer "Align a case with
what you built" (Test Cases › Edit); neither needs Claude.

### Revision R12 (D-171, 2026-11-01) — Record macro

- Scan tutorial opens with **Record a macro by hand** (anchor `scanSaveMacroButton`): Record, tap through, Stop, Save as
  macro; taps without an accessibility ID are flagged at once.
- Tour: QA step 6 is now "Record a macro by hand"; the Developer card "Accessibility IDs pay off" points at
  Scan › Record macro.

### Revision R13 (D-172…D-175, 2026-11-01)

- Removed: the **Query briefs** tutorial (6 tips) and the "Put them side by side" (Arrange) tip.
- Choosing and running tests gains **Export the whole session** (anchor `testsExportSessionButton`, after Load your
  test document): "One .zip with every case: its text, local edits, recording, last verdict and run history. Tick the
  box to add screenshots and videos."
- Scan: **Record a macro by hand** now anchors on `scanRecordButton` ("Start recording, tap through the app in the
  Simulator, then End recording and name it…"), followed by **Your saved macros** (anchor `scanSavedMacros`): "Every
  macro recorded here, newest first. A saved one is selected for you: replay it, or find its file."
- Tour: step 8 on both pages is now "Export the whole session" (Tests › Export session…, no Claude), replacing Brief;
  Developer step 6 text reads "Start recording, tap through the app, End recording and save…".

### Revision R14 (D-176, 2026-11-01) — session report

Reports tutorial opens with two tips:

| Highlights | Title | Body |
|---|---|---|
| Report viewer | The whole session in one report | Every case of the loaded document: summary, what needs attention, results, then each case with its runs and proof. |
| Publish button | Share it | Export it as Markdown or Confluence-ready HTML, or publish a new page under your personal Confluence page; it asks first. |

- Tour: QA step 6 "Report" now reads "Read the whole session's report in the app, export it (.md or Confluence HTML), or publish it to your Confluence page."

### Revision R15 (D-177, 2026-11-02) — demo library

Reports tutorial gains two tips after "Share it":

| Highlights | Title | Body |
|---|---|---|
| Demos list | Watch recorded demos | Reports › Demos lists every demo video you recorded. Click one to open it, then press ▶ when ready; pause and drag the bar under the video. |
| Language picker | English or Bahasa | Switch the language while a demo plays; it carries on from the same moment in the other language. |

- Tour: QA step 6 "Report" adds "Demos plays recorded demo videos in English or Bahasa."

### Revision R16 (D-178, 2026-11-02) — full screen

| Highlights | Title | Body |
|---|---|---|
| Demo video | Watch it full screen | Hover the video and press ⤢ at the bottom right for full screen; Esc comes back. |

### Revision R17 (D-180, 2026-11-02) — override a result

| Highlights | Title | Body |
|---|---|---|
| Override result… button | Override a result | Override result sets a case's verdict yourself, with a required description. Save and rerun has Claude run it again with your expected result, leniency and description. Every change is kept and travels in exports. |

- Tour: QA step 12 "Override a result, with a reason" (Test Cases › Override result).

### Revision R18 (D-182, 2026-11-02) — proof icons

| Highlights | Title | Body |
|---|---|---|
| Test list | Proof at a glance | After a run, icons beside the case id show its proof: screenshots with a count, a screen recording, and an eye when the result is evidence only. |

### Revision R19 (D-183, 2026-11-02) — proof media panel

| Highlights | Title | Body |
|---|---|---|
| Media panel | See the proof here | A selected case shows its screenshots and videos below its text. Zoom and pan screenshots, play videos, or Annotate a screenshot with a pen, arrow or box, then save it over the original or as a copy. |

### Revision R28 (D-197, 2026-11-03) — Real devices

| Highlights | Title | Body |
|---|---|---|
| Real devices card | Real iPhones too | Paired devices, connected first; choose one to see what's missing before tests can run on it. |

Tour: QA step 4 "Control the phone" names the device picker and paired iPhones.

### Revision R27 (D-196, 2026-11-03) — Verify my changes

| Highlights | Title | Body |
|---|---|---|
| Verify my changes… | Check your branch before the PR | Picks the recorded cases that cover changed code; Replay opens the plan. |

Tour: developer step 12 "Verify your branch before the PR".

### Revision R26 (D-194/D-195, 2026-11-03) — step editor, case inputs

| Highlights | Title | Body |
|---|---|---|
| Edit steps… | Fix a macro without its JSON | Reorder, remove, change waits, Skip if not there, typed text; Save writes the file. |
| Record button | Taps without an ID still replay | Saved by position inside the nearest identified element; alerts saved as optional answers. |
| Deeplinks and mocks | Deeplinks and mocks of a case | Deeplinks and mocked responses with status and body; Copy, Download, Download all. |

Tour: QA step 17 "Tidy a recording, share its inputs".

### Revision R25 (D-193, 2026-11-03) — Post to Jira

| Highlights | Title | Body |
|---|---|---|
| Post to Jira… | Report a result on Jira | Result, build, failed step, proof names as a comment on the document's ticket; read, edit, confirm. |

### Revision R24 (D-190…D-192, 2026-11-02) — prerequisites, Run all, Claude activity

| Highlights | Title | Body |
|---|---|---|
| Get Ready checks | Everything this Mac needs | Tools and Claude Code plugin + MCP servers; Show what's missing gives the fix to copy. |
| Run all… | Run a batch hands-free | Plans the shown cases: grouped replays, then Claude runs; names what would stop it before Start. |
| Claude activity line | What Claude is doing now | Plain-words activity, steps, cost, model; one-click steering while a run goes. |

Tour: QA step 16 "Run a batch hands-free".

### Revision R23 (D-189, 2026-11-02) — Reports › Batches

| Highlights | Title | Body |
|---|---|---|
| Batches list | Every Test Batch in one place | Lists every batch with pass/fail counts; ending a batch opens its report here. |
| Progress line | Progress that keeps | Per case, latest result wins; saved on the batch, so it survives restarts. |
| Reopen | Reopen or tidy up | Reopen makes it active again; Remove takes it off the list, files stay. |

Tour: QA step 15 "Look back at any batch".

### Revision R22 (D-188, 2026-11-02) — build under test, stale results

| Highlights | Title | Body |
|---|---|---|
| Tests header "Testing …" | Which build you're testing | Shows branch, commit and build number under test; every result records the same. Orange means the installed build isn't from the prepared code. |
| Replay stale (N) | Re-check stale results | A newer build that changes a case's code makes its result stale (clock badge); Replay stale re-runs those recordings without Claude. |

Tour: QA step 14 "Re-check results after a new build".

### Revision R21 (D-185/D-186, 2026-11-02) — busy banner, connector line, start screens

- Tip "Replays anyone can follow" now also says a line joins each subtitle to its element and a spinner banner shows
  while the phone gets ready.
- New tip "Where a test starts" on the Tests detail: Starts on … · Needs …, set by Claude on the first run.

### Revision R20 (D-184, 2026-11-02) — reopen a Test Batch

| Highlights | Title | Body |
|---|---|---|
| Test Batch pill | Proof goes into a Test Batch | Every run and its screenshots are filed into the active Test Batch. Start one here; End writes its report; Reopen picks up an ended one. |

### Revision R29 (D-199, 2026-11-03) — Browser UI removed

- Get Ready tips: **Choose the code under test** (Prepare code…), **Who's next on the simulator** (Run queue…),
  **When a run needs you** (the run popup sheet; test logins in Settings › Logins).
- Tour: QA step 1 names Settings › Logins; developer step 1 names Prepare code….

### Revision R30 (D-200/D-201, 2026-11-03) — Git sheet, batch replay

- Get Ready tip **Fetch and switch your own repo** (Git…): fetch, update, switch; uncommitted work stops a switch or is
  stashed on request; builds still use Prepare code.
- Batches tip **Regression on a new build** (Replay on this build): recorded cases of an ended batch replay without
  Claude into a new batch whose header shows regressed / fixed / same.

### Revision R31 (D-206, 2026-11-03) — System prep in the Mac app

- Tip **Replays anyone can follow**: getting the phone ready shows only in the Mac app, under System prep (no banner over
  the Simulator).
- Tip **Follow every step**: mentions System prep above the steps while the phone gets ready.

### Revision R32 (D-207, 2026-11-03) — Subtitles placed next to the element

- Tip **Replays anyone can follow**: the subtitle is placed next to each step's element, with a tail and a line aimed
  at it; system prep shows only in the Mac app.

### Revision R33 (D-209, 2026-11-03) — Test list toggle

- Beside-the-Simulator tour, new first tip **Make room for the Simulator** (anchor `testsListToggle`): Test list (⌥⌘L)
  hides the case list; with Live steps and the sidebar hidden too, the window fits Split View beside a wide Simulator.

### Revision R34 (D-211, 2026-11-04) — Welcome onboarding catches up

- QA flow step 13 **Know where each test starts**: setup shows in Live steps under System prep; only a plain replay
  shows the Simulator banner (D-206).
- QA flow, new steps 18–21: **Keep your code up to date** (Get ready › Git…, D-200), **Re-run a whole batch on a new
  build** (Reports › Batches › Replay on this build, D-201), **Open any screen by deeplink** (Simulator › Deeplinks:
  search, fields, query parameters, min-version presets, D-203…D-205), **Work beside the Simulator** (Test list ⌥⌘L +
  Live steps + sidebar hidden in Split View, D-209/D-210).
- Developer flow: step 4 **Control the phone** mentions Deeplinks search + query parameters; new steps 13 **Switch
  branches from the TestForge** and 14 **Work beside the Simulator**.
- From now on every feature updates the onboarding flows with its tip (checklist in `BlibliMobile-iOS/CLAUDE.md`).

### Revision R35 (D-212, 2026-11-04) — Pause a Test Batch

- New tip **Switch priorities without ending a batch** (anchor `batchesPause`, Reports › Batches Pause / Resume).
- Tips **Proof goes into a Test Batch** (toolbar pill) and **Reopen or tidy up** mention Pause / Resume and that the
  active batch is paused, not ended.
- Onboarding QA flow, new step 22 **Switch priorities mid-batch** (Toolbar › Test Batch › Pause · Resume).

### Revision R36 (D-213, 2026-11-04) — Feedback at every control

- No new tip or tour line: no control was added. Existing tips still describe the same buttons; they now show
  "…ing" with a spinner while they work. Onboarding unchanged.

### Revision R37 (D-214, 2026-11-04) — Free space and reset

- Tip **Free up space** (anchor `buildCleanSection`, now on the "Free space and reset" header): each row's Delete…
  removes just that after asking; tick several for Reset selected; runner screenshots clear after runs.
- Onboarding: no step names Clean or Reset; unchanged.

### Revision R38 (2026-11-06) — Two-folder Setup

- The Setup screen has no tip: it appears once, before the main window, so there is no anchor to attach to. Its own text explains both Choose… buttons.
- Tip **Choose the code under test** (anchor `getReadyPrepareCode`) now says the TestForge checkout and the iOS clone are set at first launch and changed in Settings › Project.
- Onboarding: Developer workflow step 1 says Prepare code works on the iOS clone chosen at setup.
- Settings › Project row renamed "TestForge checkout" / "Change checkout…" (it changes the checkout, not the iOS clone). The iOS clone is not changeable there yet.

### Revision R39 (D-217, 2026-11-06) — Update TestForge from the app

- No tip: the Updates section lives in the Settings window (Settings › Project), which has no tutorial anchors, like
  Setup. The section's own text explains each state, and a failure shows under the buttons.
- Onboarding: QA workflow step 23 and developer workflow step 15 "Update TestForge itself" name the menu item
  (TestForge menu › Check for Updates…, which reads "Update TestForge… (n new)" when one is waiting) and Settings › Project.
- Settings opens on the last tab used; the menu item opens it on Project and starts a check.

### Revision R40 (D-218, 2026-11-06) — Docs section and Markdown viewer

- New tutorial **Reading the docs** (`TutorialCatalog+Docs.swift`), 6 tips, auto-starts on the first visit to Docs:
  **The guides, right here** (`docsList`), **Read any Markdown file** (`docsOpenButton`), **Links work in place**
  (`docsPage`), **Jump to a heading** (`docsOutlineToggle`), **Half or Full** (`docsModePicker`), **Its own window**
  (`docsWindowButton`). The ? menu on Docs lists only this tutorial; the console tips don't apply.
- The Docs window shows the same page with no tips: its copy of the page and header passes `showsTips: false`, so each
  tip has one anchor.
- Onboarding: QA workflow step 24 "Read the guides in the app" (Docs · ⌘D · Help › TestForge Usage Guide) and
  developer workflow step 16 "Read docs beside your code" (Docs · ⌘D · File › Open Markdown… (⌘O)). Neither needs Claude.
- Help menu gains **TestForge Usage Guide** and **TestForge Features**, which open Docs on `docs/Usage-guide.md` and
  `docs/Features.md`.

### Revision R41 (D-220, 2026-11-07) — Free replay or Claude, and one Replay button

- New tip **Free replay or Claude** (anchor `testsReplayStatus`, the status line above Last run): what each icon
  means (⚡ green free replay, ⚡ orange not confirmed, ⚠ red needs repair, ✨ needs Claude) and that a Claude pass
  shows UNCONFIRMED until a replay of its saved recording passes.
- Tip **Replay recorded steps** (anchor `testsReplayButton`) now says a click replays and press-and-hold lists
  Replay with explanations, Record demo video and Write explanations with Claude; Replay is off when the recording
  can't run without Claude. The separate **Replays anyone can follow** tip is gone with the Explain menu it pointed at.
- Onboarding QA workflow step 2 names the ⚡ and ✨ icons and says a Claude pass counts once its recording replays;
  step 10 is now "Test Cases › hold Replay". Developer workflow "Replay what you touched" says the ⚡ cases replay free.

### Revision R42 (D-222, 2026-11-09) — MCP servers and Open in Terminal in the Claude section

- New tour line **MCP servers** (anchor `claudeMcp`, the MCP button in the Claude header): MCP, or typing /mcp, lists
  the servers Claude sees and why one failed; Reconnect starts one again once its setup is fixed.
- New tour line **Take it to Terminal** (anchor `claudeOpenInTerminal`): Open in Terminal continues the conversation
  with `claude --resume`; a message in the app later picks it up again.
- Onboarding: QA workflow step 25 and developer workflow step 17 "Fix an MCP server, or take the chat to Terminal"
  (Claude · ⌘0 › MCP · Open in Terminal). Both need Claude.

### Revision R43 (D-223, 2026-11-09) — Get Ready fixes show progress until their check reports back

- Tour line **Every check says why** (anchor `getReadyChecks`) now says a line spins until its check reports back and
  a tick means it passed.
- Onboarding: QA workflow step 1 "Get ready" says a line spins while its fix runs and only a tick is done; developer
  workflow step 1 "Point it at your code" says the App + tests built line spins until the build finishes.
