# TestForge Mac app: usage guide

A how-to for each feature of the Mac app. For the list of everything the app does, with who each feature is for and whether it needs Claude, see [Features.md](Features.md). This guide was written from the app's code; the wording in quotes is what the app shows.

**Older guides**: [server/docs/usage.md](../server/docs/usage.md) and [server/docs/walkthrough-v4.md](../server/docs/walkthrough-v4.md) are linked, not copied. See [What is out of date in the older docs](#what-is-out-of-date-in-the-older-docs) before relying on them.

## Contents

1. [First launch and Setup](#1-first-launch-and-setup)
2. [Get ready](#2-get-ready)
3. [Test Batches](#3-test-batches)
4. [Tests](#4-tests)
5. [Scan](#5-scan)
6. [Results](#6-results)
7. [Reports](#7-reports)
8. [Network](#8-network)
9. [Advanced](#9-advanced)
10. [Simulator](#10-simulator)
11. [Build](#11-build)
12. [Claude and Remote Control](#12-claude-and-remote-control)
13. [Measure](#13-measure)
14. [Proof window](#14-proof-window)
15. [Settings](#15-settings)
16. [Updating TestForge](#16-updating-testforge)
17. [Menu bar item, console and usage bar](#17-menu-bar-item-console-and-usage-bar)
18. [Tour, tips and demo run](#18-tour-tips-and-demo-run)
19. [What is out of date in the older docs](#what-is-out-of-date-in-the-older-docs)

## Ground rules

- **Your project stays yours.** Tests build and run on a QA copy in `~/.testforge` and a separate QA simulator. Your folder, branches, unsaved work and own simulator are not changed. TestForge never commits, pushes or rebases.
- **Claude is optional.** A case's first successful run needs Claude. After that its recording, elements and mocks live in the repo and replay on the driver with no Claude.
- **Actions that cost or change things ask first**: builds, Claude runs, erasing a simulator, deleting folders, posting to Jira, publishing to Confluence.
- **Team pages are read-only.** The team's Confluence test-case page is only read. Reports go under your personal page, after you confirm.
- **One simulator at a time.** A test or scan that holds the phone locks the Simulator and Build controls until it finishes.

---

## 1. First launch and Setup

**What it is for.** Tell TestForge where its own checkout and the iOS app clone are, and check the tools it needs.

**Steps**

1. Open TestForge. It shows **Set up TestForge** until both folders are chosen.
2. Under **1 · TestForge checkout and iOS app clone**, click the first **Choose…** and pick your `blibli-testforge` clone (the one that contains `server/start.sh`).
3. Click the second **Choose…** and pick your `BlibliIOSApp` clone (it must contain `BlibliMobile-iOS/*.xcworkspace`).
4. Under **2 · Tools on this Mac**, wait for the four rows: Xcode, Node.js 18 or newer, Claude Code, Signed in to Claude. For a missing one, use its button (**How to install**, or **Sign in**, which opens Terminal running `claude auth login`).
5. Click **Check again** after fixing a tool, then **Continue**. TestForge reopens with those folders and starts its QA server.

**What you see.** A green check and the path for each valid folder; "Checking…" on a row while it is checked. **Continue** is disabled until both folders and all four tools are ready.

**What can go wrong**

- "`<folder>` has no server/start.sh — choose the checkout's top folder": you picked a subfolder.
- "`<folder>` has no BlibliMobile-iOS workspace — choose the app clone's top folder".
- "Found `<v>` — the QA server needs version 18 or newer".
- After **Sign in**, finish in the Terminal window, then press **Check again**.

**Tips**

- Claude Code and the sign-in are checked here but only used by the Claude features. You still need them to pass Setup.
- Help › Welcome to TestForge and the Update menu item stay disabled until Setup is done.
- The checkout can be changed later in Settings › Project. The iOS clone has no Settings control today (see [Settings](#15-settings)).

---

## 2. Get ready

**What it is for.** One page that says whether tests can run. Do it top to bottom the first time; after that only changed checks run again.

**Steps**

1. Press ⌘1. Read the headline: "Getting everything ready…", "Ready to test", "N item(s) need you", "Reconnecting to the QA server…" or "The QA server stopped".
2. For a row that is not green, read its detail (it says what was checked and what was found) and press its **Fix** button.
3. Use the three buttons on the tools bar as needed:
   - **Prepare code…** to choose what the QA build is made from.
   - **Git…** to fetch or switch your own repo.
   - **Run queue…** to see who holds the simulator.
4. Start a Test Batch from the pill in the toolbar (see [Test Batches](#3-test-batches)).

**Fix buttons.** Create QA simulator, Boot QA simulator, Shut down the others, Build the app, Start harness, Free disk space, Set up Claude Code, Choose folder… (proof folder), Start Test Batch…, Prepare code…, Show run queue, Show what's missing. Those that change things open a **Run this fix?** dialog first, for example:

- Create QA simulator: "The simulator you test with shuts down for about a minute and is cloned as “QA · `<name>`”. Your own simulator stays untouched."
- Build the app: "A first build takes 10–25 min and may need the VPN."
- Free disk space: "Only ~/.testforge/ is touched" (removes QA copies and build output unused for 14 days).

**Prepare code**

1. Click **Prepare code…**.
2. Pick the **Repository**, then **Code from**: **A GitHub branch** or **My working copy**.
3. For a branch, search it (for example `release/v15.0.0`). The list comes from your repo's last fetch; **Check GitHub** asks GitHub directly and needs the VPN. Rows tagged "new on GitHub" or "only on this Mac".
4. Click the action button, which reads **Prepare `<branch>`**, or **Snapshot my working copy**. Progress lines stream in the sheet.
5. Done reads "Code ready: `<verdict>`. Build the app next if Get Ready asks." A working copy snapshot includes uncommitted changes.

**Git**

1. Click **Git…**. The card shows the branch, sync state, uncommitted changes and last fetch.
2. **Fetch** runs `git fetch --prune origin` (VPN needed, changes no files).
3. **Update branch** fast-forwards only, and is enabled only when you are behind and not ahead. It never merges or rewrites.
4. To switch, search the branch list and click **Switch**. With uncommitted changes it asks "Stash your changes and switch to `<b>`?" Choose **Stash and switch**; **Restore stash** brings them back later.

**Run queue**

1. Click **Run queue…**. It says "The simulator is free." or who holds it and how many wait.
2. For a waiting row use **Move up**, **Move down** or **Cancel**. For a finished row, **Retry**. **Clear finished** tidies the list; results stay in Reports.

**What can go wrong**

- "Can't reach GitHub. Turn the VPN on, then try again."
- "The QA server stopped": press **Restart server** on its row, or Server › Restart Server.
- A half-done rebase or merge in your repo blocks Git switching: finish or abort it in a terminal.
- Git sheet warns "Not tracking a GitHub branch" or ahead/behind states: push or merge in a terminal; TestForge will not.

**Tips**

- Builds and tests use the QA copy from **Prepare code**, not what **Git…** switches. Switch, then prepare.
- **Show what's missing** (Prerequisites) lists each tool, the Claude Code plugin and MCP servers, with a command you can copy. Plugin and MCP lookups take a few seconds because Claude Code does them.
- Test logins are not set here: use Settings › Logins.

See also: tutorial R-entries in [server/docs/tutorials.md](../server/docs/tutorials.md).

---

## 3. Test Batches

**What it is for.** A Test Batch collects every run, replay, Claude run and scan with its proof, and writes a report when you end it. **Tests cannot run until a batch is active.**

**Steps**

1. First time only: pill › **Choose proof folder…** and pick where proof and reports go.
2. Pill › **Start Test Batch…**. Name it after a ticket, build or feature (for example `IOS-46102 flash sale schedule`). **Start**.
3. Work. The pill shows `<name> · <item count>`.
4. To switch to urgent work: pill › **Pause Test Batch**, start or resume another, then **Resume Test Batch** the first. Nothing is ended.
5. When finished: pill › **End Test Batch…** › **End and write report**. Its `report.md` is written into the batch folder and opens in Reports › Batches.

**Also**: **Reopen Test Batch** (up to the last 8 ended), **Show batch folder**, **Change proof folder…**. The Start sheet also lists paused batches with **Resume**.

**What can go wrong**

- Pill reads "Choose proof folder" or "No Test Batch": tests wait until you fix that.
- A warning icon on the pill means the last action failed; hover for the reason, or read the alert "The Test Batch action didn't work".

**Tip.** Starting another batch while one is active pauses the first, never ends it.

---

## 4. Tests

**What it is for.** Choose cases, replay the ones that have a recording, run the new ones with Claude, and fix or override what the document got wrong.

### Load cases

1. Press ⌘2, then **Load test document** (or Test › Load Test Document…).
2. Paste a Confluence page link, or the path to a Markdown or CSV file. **Load** (Return).
3. The list fills from the table. The header shows "N cases · M recorded" and the build under test.

Confluence is read through Claude; a file needs no Claude. The page is never changed.

### Find and filter

Search by id or words. The **Show** menu offers All, Recorded, Failed last, Stale, Never run. Row icons show: has a recording, edited locally, and proof (screenshots with a count, a screen recording, or "Evidence only: no pass or fail, check the screenshots by eye").

### Replay a recorded case (no Claude)

1. Select the case. A case with a recording shows **Replay**.
2. Click **Replay** or press ⌘R. Live steps (right pane) show each step with its time and result, with **System prep** above while the phone gets ready.
3. Stop with the stop button or ⌘..

If the case has no recording, ⌘R opens **Run with Claude?** instead.

### First run with Claude

1. Select a case with no recording and click **Run with Claude…**.
2. Read the dialog: it uses your Claude plan and can take several minutes. Pick a model: **Auto** (cheapest that fits, moves up if stuck), Haiku, Sonnet or Opus.
3. Confirm. Claude reads the case, drives the phone and saves the steps; a replay must pass before the recording is kept.
4. Use **Claude session** in Live steps to watch or steer it.

Failures are sorted for you: app bug, broken recording (Claude repairs it, shown as "Recording repaired"), or environment.

### Run all

1. With the cases you want shown (filter and search apply), click **Run all…**.
2. Read the plan: how many replays, how many Claude runs (these use usage), environment switches and logins, and anything that will stop for you.
3. **Start**. Nothing runs before this.

### Verify my changes

1. Click **Verify my changes…**, enter **Compare with branch** (for example `develop`), and tick **Include uncommitted edits** if wanted.
2. **Check** lists the loaded cases whose recordings cover the app code you changed. A shared dependency change picks every recorded case.
3. **Replay N case(s)…** opens the batch plan.

The QA build must contain the changes: build first if it does not.

### Replay stale

A result turns stale when a newer build changes the code behind a case. **Replay stale (N)** appears in the header and replays those recordings on the current build with no Claude.

### Explain

1. Select a recorded case, open **Explain**.
2. **Replay with explanations**: a slow replay over the Simulator with an intro card, a pointer and subtitle per step, and a result card. No Claude.
3. **Record demo video**: renders English and Bahasa Indonesia videos with burned-in subtitles. They appear in Reports › Demos.
4. **Write explanations with Claude…** (or **Rewrite**) asks first, then Claude writes the subtitles once for the case; later replays and videos reuse them.

Subtitle language follows Settings › General › Explanation language.

### Edit a case's text

1. Select the case, click **Edit…** (⌘E).
2. Change its steps or expected result. **Save** (Return).
3. The case shows "Edited locally. Runs use your text; the document is unchanged." **Revert to document…** removes your edits after confirming.

Tell the document's owner when the document itself is wrong.

### Override a result

1. Click **Override result…** (⇧⌘O).
2. Choose the new result (PASS, FAIL, BLOCKED, UNDECIDED), write the required reason, and set how strictly reruns judge (strict or lenient).
3. **Save** records it. **Save and rerun** has Claude run it again with your notes.

Every change is kept, shown in the session report and carried in exports.

### Where a case starts

**Starts on** and **Needs** show the screen and state a replay reaches before step 1. Claude decides them on the first run. Under **System prep** you see the phone get ready; a plain replay also shows a banner on the Simulator.

### Deeplinks and mocks of a case

The **Deeplinks and mocks** panel lists what a recording opens and mocks. Copy a row, **Download…** it as `.json`, or **Download all…** to hand to a developer. Rows say where each mock body comes from.

### Proof

The panel under a case shows its screenshots and videos. **Previous**, **Next**, **Open in Default App**, **Show in Finder**. **Annotate** draws with Pen, Arrow or Box in Red, Yellow or Green; **Save as copy**, or **Save…** which asks before replacing the original.

### Post to Jira

1. Select a case with a result, click **Post to Jira…**. A comment is drafted.
2. Choose a ticket from **From the document**, or type one like `SEA-123`.
3. Read and edit the comment. **Post…** asks "Post this comment to `<key>`?" and posts only after you confirm.

### Export session

**Export session** writes one `.zip`: `session.json` (everything) and `report.md`. Tick **Include screenshots and videos** to add each case's latest proof and demo videos.

### When a run needs you

A sheet, "The run is waiting for you", cannot be dismissed. For a system popup the runner cannot tap, tap it in the Simulator then press **Done — continue the run**; **It wasn't shown** skips. For a value the run cannot know (such as a production OTP), type it in **Value**. **Stop the run** ends it.

### Work beside the Simulator

**Test list** (⌥⌘L), **Live steps** and the sidebar can all be hidden so the window is narrow enough to share Split View with a wide Simulator. Turn on **Outline steps** (toolbar, Simulator menu or Settings) to see the element each step acts on; it adds about 2 s per step and needs Accessibility permission.

**What can go wrong**

- "Get ready isn't green yet" blocks replays: fix the checklist, or start a Test Batch.
- No recording: Replay is absent; use Run with Claude.
- A stale banner: replay it on this build.
- An action alert "That didn't work" carries the reason.

**Tips**

- Keep the cases you rely on recorded; they cost no Claude and run in about 30 s.
- Do not add a quit or relaunch to your own macros unless something read at launch changed; cases share one app session.

See also: [server/docs/usage.md](../server/docs/usage.md) §3a, §6, §7 for the idea behind first runs, replays and repairs (browser-era screens, see [below](#what-is-out-of-date-in-the-older-docs)).

---

## 5. Scan

**What it is for.** Create a macro by hand (Record macro), or save a screen's elements (Screen surfaces). Choose with the **Scan mode** picker.

### Record macro

1. Press ⌘3. Click **Start recording**. If macOS Accessibility permission is missing, the error says where to grant it.
2. Tap through the app in the Simulator. The header reads "Recording · N steps". Steps list on the left, grouped under Steps or Screens.
3. **End recording**. It reads "Recording ended · N steps not saved yet".
4. Click **Save**. Give a **Name**, link a **Test case** (optional), set **Module** and **Submodule**, and choose **Start from a fresh app launch** if replay should relaunch first.
5. The alert says where it was saved and whether it is linked to a case.

**What can go wrong**

- A tap with no accessibility ID is flagged as you go: "You tapped `<target>`, which has no accessibility ID…". Replay will ask a person to tap, or find it by text, which breaks when the copy or language changes. Ask a developer to add an `accessibilityIdentifier`.
- **Discard** asks first and cannot be undone.

### Saved macros and Edit steps

1. The **Saved macros** list shows newest first. Select one for its steps, test case link and how each tap is found.
2. **Replay** runs it on the driver with no Claude. **Show in Finder** opens its file.
3. **Edit steps…**: drag to reorder, remove a step, tick **Skip if not there**, set **Wait up to N s**, retype text, rename a screenshot. **Save** writes the macro file. What each step taps stays as recorded.

### Screen surfaces

1. Switch **Scan mode** to **Screen surfaces**, click **Start scan**.
2. Move through the app in the Simulator. **On screen now** shows elements, those with identifiers, and screens seen.
3. Type a **Screen name** and click **Mark** to save it; mark the same name again for another state. **Skip** records nothing.
4. **Stop scan** saves it.

While a scan runs the phone is kept for you, so tests wait. "Only the top of this screen was read. Scroll and mark again to record the rest." If it says "Can't read the screen…", check that the harness is running (Get ready).

**Tip.** Developers: Scan › Record macro flags every tap with no ID; stable IDs make recordings work on any device size.

---

## 6. Results

**What it is for.** Review runs, accept or override verdicts, re-run failures, and hand a run to someone else.

**Review a run**

1. Press ⌘4. The newest run is on top; pick one.
2. The header shows Code, Bundle, Simulator, Server, Took, and tiles for Cases, Passed, Failed, "Flaky or open". An orange banner says "Unverified build" if the installed app did not match the prepared code.
3. Pick a case. Its inspector shows **Proof**, **Video proof**, **Mocks that answered**, **What the run said** and **Steps**. Click a screenshot or video to open the [Proof window](#14-proof-window).
4. Use **Accept** (the verdict is right), **Override…** (choose PASS or FAIL, write why; it shows in the report) or **Needs re-run**.

**Re-run failed.** Click **Re-run failed…**. Confirm. Recorded cases replay with no Claude; cases without a recording run through Claude. A case that then passes is marked FLAKY.

**Hand on a run.**

1. **Export bundle…** saves one `.qawbundle.json`: cases, recordings, mocks, verdicts.
2. The next person clicks **Import bundle…**, chooses the file and reads the preview (cases, tested code, what it adds, the Claude spend it saves, logins it types).
3. **Import** keeps their items where they differ; **Replace mine and import** uses the bundle's.
4. Click **Replay N case(s) without Claude**. A comparison reads like "12 of 14 agree with the bundle".
5. For a case without a recording, **Set up mocks** switches on its mocked responses so you can test it by hand.

**Export report / Copy report** gives the run as Markdown.

**Verdict labels.** PASS, FAIL (with "at step N"), BLOCKED, INTERRUPTED, CRASH, ERROR, FLAKY, QUEUED, RUNNING, SKIPPING. Review states: Not reviewed, Accepted, Overridden, Needs re-run.

**What can go wrong**

- "No runs yet": runs started from a batch or Run again are kept here; start one first.
- "The run didn't load": select it again, or check the server in Get ready.
- "Not on disk any more: `<file>`": a proof file was deleted. "No proof saved for this case" means nothing was recorded.

---

## 7. Reports

**What it is for.** Read and share the session, batches and branch history.

**Session report** (first tab)

1. Press ⌘5. The report covers every case of the loaded document: summary, what needs attention, results, then each case with its runs and proof.
2. **Refresh** rebuilds it. **Copy**, or **Export** as **Markdown (.md)…** or **For Confluence (.html)…** (open the HTML, select all, paste into a Confluence page).
3. **Publish to my Confluence page…** asks, then Claude creates one new page under your personal page. Screenshots stay in the session export. The production test-case page is never written.

**Batches**

1. Choose a batch. Its status reads Active, Paused or Ended, with counts.
2. **Refresh**, **Show in Finder**, **Pause**, **Resume**, **End batch**, **Reopen**, **Remove** (the folder and report stay on disk).
3. **Replay on this build** replays every recorded case of the batch on the installed build, with no Claude, into a new batch, and compares: "Against “`<source>`”: N regressed, N fixed, N same, N waiting". Cases with no recording are left out and counted.

**Runs by branch.** Pick a branch for its runs, newest first. The picker defaults to "Automatic — develop, else the run before". The comparison table lists Newly failing, Fixed, Same, New here and Not run here. Export Markdown, Copy report or Publish to my Confluence page.

**Demos**

1. Open the Demos tab. **Refresh** looks for new videos.
2. Click a demo, choose **English** or **Bahasa Indonesia**, press the play overlay (or Space).
3. Hover the video and press ⤢ for full screen (Esc leaves). Switching language carries on from the same moment.

**What can go wrong.** "No demos yet": in Tests pick a recorded case and choose Explain › Record demo video. "This demo has no `<lang>` version; playing `<other>`".

---

## 8. Network

**What it is for.** Watch the app's calls live, make an endpoint answer empty, with an error or slowly, hold a call, and check analytics events, all without a backend change.

**Check the connection first.** The strip at the top says "App connected — changes are live" (green), or "Not live" with the reason: the app is running but not checking in (NetworkLens may be off in it), or it is not running (changes apply at its next launch). A warning says when other simulators also run the app: they do not get your changes. The **Mocks** switch is the master switch; off sends every call to the real backend.

**Traffic**

1. Press ⌘9, open **Traffic**. Use the app; calls appear. Filter by URL, or **Mocked only**.
2. Click a call. Tabs: Response, Request, Headers, curl.
3. **Copy curl**, **Replay** (sends it again from the app), **Hold this call** (adds a breakpoint), **Mock this call** (its real response becomes a rule with loaded, empty, 500, slow and timeout answers).

**Rules & scenarios**

1. Open **Rules & scenarios**. Pick a rule, turn on **Use this rule**, choose its **Answer**.
2. Answer kinds: a body, a failed request (Offline, Timed out, Connection lost), or never answers.
3. To edit an answer: **Edit**, change Name, Kind, Status, Failure, Delay or the body, then **Save**, or **Save as copy**.
4. **Time-shift** moves every time in a body: **Find timestamps**, pick one, set **Lands in** N seconds, **Shift and save**. Use it to test a flash sale about to start or end.
5. **Scenarios**: type a name, **Save current rules**; apply one from the menu. Deleting a scenario restarts the app.

**Breakpoints**

1. Open **Breakpoints**. Type an endpoint (for example `GET /backend/content-api/flashsale`), choose to hold **Request**, **Response** or both, tick **Once** if wanted, **Add**.
2. Make the call in the app. It appears under **Held now**.
3. Edit its **Status**, or **Fail** it, then **Continue**. **Continue all** releases every held call.
4. **Hide bubble** hides the in-app NetworkLens bubble so it never covers what a test taps.

**Trackers**

1. Open **Trackers**. Type TRMS IDs, comma separated (empty lists everything that fired).
2. Tick **All launches** to include earlier launches. **Check**.
3. Optionally **Contract…** loads a JSON of payload rules per TRMS ID.
4. Pick a row for each fire and payload. **Copy as markdown** or **Save as…**.

**What can go wrong**

- Mocks on: the banner reads "N mocks are on — a test now sees mocked data". **Reset to repo pack** and **All off** both ask first.
- "No calls captured yet — use the app": the app is not connected.
- A message line at the top has **Dismiss**.

**Tips**

- Mocked answers must be reproducible by others: the banner lists rules not in the repo's mock pack.
- This overlaps with Advanced › Network Mocks; the Network section is the fuller one.

---

## 9. Advanced

**What it is for.** Three smaller tools. Press ⌘6 and use the **Panel** picker.

### Network Mocks

A simpler mock panel. Turn on the **Network mocks** master switch; if the app has no NetworkLens session, **Turn NetworkLens on…** relaunches the app with it on (asks first; the open screen closes). In **Rules** turn **Use this rule** on and pick an **Answer**. **Recent calls** shows what the server answered.

### Recorded steps

1. Search by name, id or test case. Pick a recording to see its steps in plain words.
2. **Replay** queues it on the simulator. Watch it in Tests › Live steps or the console.
3. The summary reads "All N recordings pass the check." or lists errors and warnings. **Reload** reads the recordings again.

A step found only by its visible text carries a warning because copy changes can break it. Cleanup steps run even when a test fails, so the next test starts clean.

### Simulator Driver

1. Pick a **Command**: Device info, Dump tree, Screenshot, Tap by identifier or label, Type text, Swipe, Scroll until exists, Scroll to top, Wait for exists or not-exists, Assert exists, Get label, Get labels, Get element count, Get frame, Tap alert button, Dismiss keyboard, Open deeplink, Relaunch app.
2. Fill **Details** (optional fields say so), press **Send** (Return).
3. Read the result, or the history row. Relaunch app asks first.

Commands wait while a test runs. "No harness answering — start it from Get Ready." means the runner is not up.

---

## 10. Simulator

**What it is for.** Control the phone without Xcode or a terminal.

1. Press ⌘7. The page loads simulators and selects the one tests use.
2. **Device card**: pick a simulator; **Boot** or **Shut down**; **Show Simulator**; copy the UDID. **Use for tests** makes it the one tests run on (the server refuses while a test runs). **Back to the QA clone** returns to the default.
3. Every action shows "`<Title>`…", then "`<Title>`: `<message>`" with a check or warning. The console shows the command.

**Deeplinks**

1. Type in **Find a screen** (for example cart, search, order). Pick a route.
2. Fill the parameter fields. **Add query parameter** adds `?name=value`; **Known parameters** and **Versions** menus offer presets (min-version, labelled newer than, same as or older than this build).
3. Or type a whole link in **Link** (`blibli://…` or `https://www.blibli.com/…`).
4. **Open in app** opens it over the current screen with no relaunch; Back returns there. **Save** keeps it under **Saved**; **Recent** keeps the last eight.

The preview line says whether any route in the app's list catches the link ("No route in the app's list catches this — the app may still handle it").

**App.** **Bundle id** (default `com.blibli.mobile`), **Relaunch**, **Kill**.

**Display.** **Color Blended Layers** (green is opaque, red is blended). Measure puts it back the way you left it.

**Saved settings.** Enter a **Key**, pick the type, and **Read**, **Write and relaunch** or **Delete**. The app reads settings at start, so writing relaunches it.

**Reset.** **Permissions** forgets camera, location and notification answers for the app. **Keychain** removes saved logins and tokens. **Erase device…** asks "Erase this device?" and cannot be undone.

**Real devices.** Lists paired iPhones and iPads and what each lacks before tests could run on it. Tests run on simulators only today; **Use for tests** is disabled for devices.

**What can go wrong**

- "A test or scan is using the phone. These controls unlock when it finishes."
- "Couldn't ask which simulator tests use: `<error>`": the list still loads.
- Outlines and explained replays need macOS Accessibility permission: "TestForge needs Accessibility permission (System Settings › Privacy & Security › Accessibility)." Also "Simulator isn't open." and "Simulator has no device window open."

---

## 11. Build

**What it is for.** Make the QA app and test runner without Xcode open.

**Install for testing** (the usual one)

1. Press ⌘8. The **App and tests for the QA simulator** row says one of: "Built from the prepared code" (green), "Built from older code", "No code prepared" (prepare a branch in Get ready first), "Not built", or "Building…".
2. Click **Install for testing**. If the app is not built, **Build first?** asks; choose **Build and install**.
3. Wait. A first build takes 10 to 25 min; later ones a few minutes. The **Build log** follows it. Success: "The QA app and test runner are installed on the QA simulator and running."

**Other controls**

- **Build for testing…** builds only; the test runner stops while it builds. **Stop build** ends it.
- **Check again** re-reads the status.
- **Xcode**: **Open workspace in Xcode**; **Last build** (QA build or My Xcode build) with **Install & launch**; **Fix Swift package errors…** (quits Xcode, deletes DerivedData and the package cache, reopens the workspace; packages download again and may need the VPN).
- **Test runner**: **Stop test runner** frees the phone.
- **Free space and reset**: each row shows its size. **Delete…** removes only that row after you confirm; tick several for **Reset selected (size)…**. Rows with a lock are information only. After deleting QA build output, the next run needs Build for testing.

**What can go wrong**

- "The build didn't finish, so nothing was installed. The build log says why."
- "No QA build yet. Use Build for testing first." / "No simulator build in Xcode's DerivedData. Build once in Xcode (⌘B)." / "No simulator to install on."
- "Xcode is still open. Answer its save dialogs or quit it, then try again."

**Tip.** Developers: **Prepare code…** picks your branch or working copy, **Install for testing** builds the QA copy and puts it on the QA simulator. Your own folder and Xcode builds stay untouched.

---

## 12. Claude and Remote Control

**What it is for.** Ask about the repo, a failing run or the code; watch and steer any Claude run. **Needs a Claude sign-in.**

1. Press ⌘0. A session opens (header says "Starts when the QA server is up" until the server is up). If it cannot open: "Couldn't open Claude: `<error>`" with **Try again**.
2. Ask in the composer (⌘↩ sends). The **Screenshot** toggle attaches the test phone's screen.
3. The status line says "Working…", "Needs your approval", "Asking you a question", "Waiting for the phone", "Ready", "Closed" or "Stopped with an error". The activity strip says what Claude is doing and how many steps.
4. When an approval card arrives choose **Approve**, **Always allow** (this repo, from now on) or **Deny** (with a reason Claude reads). For a question, pick an option or type under **Other**, then **Send answer** (or **Skip**).
5. **Details** opens every tool call and result. **Stop** ends the current turn. **New conversation** starts fresh in the same repo.
6. The **session switcher** shows every Claude session: the assistant, each Claude run, each triage. One waiting on you is listed first and the sidebar shows a badge.

**Remote Control**

1. In the Claude header, click **Remote Control**.
2. Choose **New sessions**: **Same folder** or **Own worktree per session**.
3. Click **Turn on**. Scan the QR code with your phone's camera, or use **Open session** or **Copy link**. Open the Claude app › Code and pick the session, or open claude.ai/code.
4. **Turn off** stops it.

Pushing, building for testing and erasing a simulator still ask first from your phone. The dot is grey (off), orange (starting), green (connected) or red (problem).

**What can go wrong.** "No Claude Code CLI session is running" in the usage bar's `rc:` hover means Remote Control has nothing to attach to. "Lost the Claude stream — reconnecting" resolves itself.

---

## 13. Measure

**What it is for.** Check a screen in points: sizes, spacing and insets, so a design mismatch is a number.

**Open.** Toolbar **Measure** button, or Simulator › Measure (⌥⌘M). The Simulator must be booted and showing the app. The window reads "Reading the simulator screen…" while it captures.

**Steps**

1. Click an element. The right panel shows Identifier, Role, Label, Geometry (Frame, Size, Center, Inside), **Spacing to nearest** (Top, Left, Bottom, Right), **Spacing to glyphs** (text only), **Inside each parent**, Hierarchy, and **Visible container** (frame, edges found, approximate corner radius).
2. With one selected, point at another element, a parent or empty space: blue lines show the distance, and **Compared with (hover)** fills.
3. Turn on **Views without IDs** to see dashed borders for views the app does not name. A colour picker appears. While it works it flips Color Blended Layers on that simulator for one capture, then restores it.
4. Zoom 100% to 800% with the slider, ⌘= and ⌘−, ⌘0 to fit, or ⌥-scroll or pinch. Plain scroll pans.
5. **Snapshot** (camera icon) with an element selected opens a sheet. Click the image to drop numbered pins, type each note, then **Copy image** (paste into Jira, Slack or a doc) or **Save image…**. **Show in Finder** appears after saving.
6. After the phone's screen changes, capture again with ⌘R.

**What can go wrong**

- "Couldn't measure this screen" with **Try again**: "The simulator screenshot couldn't be read." or "The Simulator window doesn't match the device's shape; open the device window and try again."
- "Views without identifiers skipped: A test or scan is using the simulator."
- A pin without a note is saved as an empty line.

**Tip.** The PNG uses fixed colours, so it looks the same in light and dark mode.

---

## 14. Proof window

**What it is for.** Look at a screenshot or video full size and compare detail.

1. In Results, select a case and click a screenshot or video in its inspector. The Proof window opens on it. The subtitle reads "`<file>` · N of M".
2. Move with **Previous** and **Next** (← →) or the thumbnail strip (shown when a case has more than one file).
3. Images: ⌘− and ⌘+, **Fit** (⌘0), **Actual size** (⌘1), zoom 5% to 800%; above 200% pixels are drawn as blocks so a 1-pt misalignment stays visible.
4. Videos: Space plays and pauses, `,` and `.` step a frame, drag the slider, change speed in the menu.
5. **Open in Default App** (Preview or QuickTime Player) and **Show in Finder** are in the toolbar.

Empty window: "No proof selected / Click a screenshot or video in Results." "`<file>` can't be played" or "Can't show this file" mean the file is unreadable.

---

## 15. Settings

Open with ⌘,. It remembers the last tab.

**General.** Toggle **Show in menu bar** (default on), **Notify when a run finishes** (default on; turning it off clears the Dock badge), **Outline steps on the Simulator** (default off). Pick **Explanation language** (English or Bahasa Indonesia) and **Appearance** (Match the system, Light, Dark). The Claude usage bar is not here: use View › Show Claude Usage (⌥⌘U).

**Project.** Shows the QA server folder (read-only). **Change checkout…** opens a folder picker; the folder must contain `server/start.sh` ("`<folder>` has no server/start.sh — choose the TestForge checkout's top folder"). TestForge reopens with the checkout you choose. The environment variables `QA_DASHBOARD_DIR` and `QA_PROJECT_DIR`, when set, still win. **Updates** is described in [Updating TestForge](#16-updating-testforge).

> The iOS app clone can only be chosen in Setup (first run). Some in-app tips say both folders can be changed in Settings › Project; today only the TestForge checkout can.

**Logins.** Test accounts live in your macOS Keychain; passwords never appear in logs. The list needs the QA server running.

1. To add one: choose the **Environment** (uatb or prod), a **Profile** (for example `internal`), **Email**, **Password**. **Static OTP** is for uatb only; for prod it says "Asked at run time".
2. **Save to Keychain** is enabled when Profile is filled, Email contains `@` and Password is filled. Saving the same environment and profile replaces the login.
3. **Remove** on a row asks "Remove `<id>` from the Keychain?".
4. **Production OTP › Email OTP**: **Link Outlook** shows a code ("Sign in in your browser with code `<code>`", with **Copy code**). Once linked it reads "`<user>` · reads codes from `<sender>`". **Unlink** removes it. Not linked: prod OTPs are asked in a popup during the run.

**Tutorials.** **Show tutorials automatically**, a **Replay** per tutorial with its progress ("Not seen", "In progress n/N", "Seen"), **Start demo run**, **Reset all tutorials**.

**Phone, Claude, Advanced.** Placeholders: "These settings arrive in a later release."

---

## 16. Updating TestForge

**What it is for.** Pull the latest `master` of your TestForge checkout, rebuild the Mac app and reopen it.

**From the menu**

1. TestForge menu › **Check for Updates…**. It reads **Update TestForge… (N new)** when a quiet check at launch found something.
2. Settings opens on the Project tab and a check starts: it runs `git fetch origin master` and compares with `origin/master`. SSH never waits for a passphrase.

**In Settings › Project › Updates**

1. Status reads "Not checked yet.", "Up to date (`<sha>`).", "N new changes: `<sha>` → `<sha>`." (with up to five incoming commit subjects) or "Can't update this checkout."
2. **Check now** checks again. **Update and restart** is enabled when an update is available and nothing is busy. It re-checks, runs `git pull --ff-only origin master`, then `mac-app/scripts/make-app.sh`, then relaunches `mac-app/build/TestForge.app`.
3. While building: "Building takes about a minute. TestForge reopens by itself when it is done."

You can also double-click `update-app.command` in the checkout (pull master, rebuild, open) or `build-app.command` (build and open).

**Why it stops** (orange hints)

- "This checkout is on `<branch>`. Updating only works on master: switch with git switch master."
- "This checkout has uncommitted changes. Commit or stash them, then check again."
- "This checkout has commits master doesn't, so it can't fast-forward. Push or rebase them first."

**Errors** (red): "No TestForge checkout is chosen yet. Finish Setup first." "Couldn't reach GitHub: …" "Couldn't pull the latest master: …" "The new code was pulled but the build failed, so this copy keeps running: `<last lines>`" "The build finished but TestForge.app is missing from mac-app/build."

**Before you update**, check nothing is running: the app closes and reopens, and the QA server restarts.

---

## 17. Menu bar item, console and usage bar

### Menu bar item

Shown when Settings › General › **Show in menu bar** is on. The icon is a seal when idle, a play icon during a run, an hourglass while Stop or Continue is pending, and a warning triangle if the last Stop or Continue failed.

- Idle: "No run in progress", and the last result.
- Running: the batch ("Running X of N done · `<branch>`") or the case, plus the current step. **Stop** stops the batch or cancels the job.
- Paused: "Paused at X of N" with the reason and **Continue**.
- **Open TestForge** and **Quit TestForge** (⌘Q).

When a run finishes with **Notify when a run finishes** on, a notification lists the failing case ids, and the Dock badge shows the failure count.

### Console

Press ⇧⌘Y. It shows raw lines from the server and the app, the last 5,000 kept. Choose **Source** (All, Server, App), type in **Search** to keep matching lines, **Copy** the visible lines for a bug report, **Clear**. If the log file cannot be read it says "can't read `<path>`".

### Claude usage bar

View › Show Claude Usage (⌥⌘U). It shows the model, `ctx: n%`, the 5-hour (`hr`) and weekly (`wk`) limits as used% / elapsed% with time to reset (orange when ahead of the time pace, red at 90% or more), your account, and `rc:` for Remote Control. "last seen `<age>` ago — may be out of date" after a minute without an update.

If it says "Claude usage — nothing reported yet", click **Connect Claude Code status line…**. It asks first, then adds one marked line to your status-line script so it copies figures to `~/.testforge/usage.json`. Remove that line to undo. Figures appear at Claude Code's next status-line update.

---

## 18. Tour, tips and demo run

- **Welcome tour.** Opens once on first launch. Reopen from Help › Welcome to TestForge or the toolbar ? menu. Pick **QA** or **Developer**; **Next** (Return), **Back**, **Skip tour** (Esc). The Your workflow page lists numbered steps with where each lives in the app and a Claude marker on steps that need it. Page 7 has start buttons: **Open Get ready**, **Watch the demo run**, **Ask Claude**, **Drive QA from your phone**, **Turn on screen tips**.
- **Screen tips.** A short tip sequence starts the first time you open each section (if **Show tutorials automatically** is on). **Next**, **Skip tutorial**, **Done**. Leaving the screen pauses it; Settings › Tutorials shows "In progress n/N". Replay from the toolbar ? menu or Settings › Tutorials. The Measure tip sequence starts when its first capture loads.
- **Demo run.** Toolbar ? › **Demo run (about 3 minutes)**, or Settings › Tutorials › **Start demo run**, or the tour's start button. It replays SF-001 and SF-006, then walks you through Results and Reports; **Next: Reports**, **End demo** or **Stop demo**. No Claude is used. It is blocked with "Demo can't start yet" until Get ready is green, and with "The demo replays SF-001, SF-006, which aren't loaded with recorded steps" until the Flash Sale test document is loaded in Tests.

---

## What is out of date in the older docs

### server/docs/usage.md

Marked "Superseded (D-199)" at its top. It describes the removed browser page. Read it for the ideas (why replays are free, how repairs work, verdict meanings, safety), not for screens.

- **Where to use it**: it opens "QA Dashboard.app" in a browser at `http://127.0.0.1:4545`. Today you use the Mac app; Setup and Update replace that start-up.
- **Screens that no longer exist**: Home, Test Cases tab with three questions and a big **Run** button, Sessions, Queue and Projects tabs, the Macros tab, the Mocking tab, the Driver Console, **Show Simulator window**, **Pause after this test**, **Skip this test**. Their places now are the sidebar sections: Get ready, Tests, Scan, Results, Reports, Advanced, Simulator, Build, Network, Claude.
- **Status marks**: the 🚧 "designed, not built" items (readiness checklist, Run on the QA copy, mocks attached to cases, Rebuild needed, saved setups) are built or replaced in the Mac app. The ✅ list is no longer a guide.
- **Wording**: it calls mocks by an older word (§8, §11 glossary and §3 "More options"). Use "mock".
- **Start-up and prerequisites** (§2): it expects Node.js 22+; Setup checks for Node.js 18 or newer. It does not mention the iOS app clone or the TestForge checkout choice.
- **Safety statements** (§10) still hold: no change to your project, no git writes, team page read-only, builds only on click.
- **Results and reports** (§4, §5): verdict names are unchanged, but the review is now Accept, Override…, Needs re-run in Results, and reports also have a Session report, Batches and Runs by branch.
- It never mentions: Test Batches, the Network section, Measure, Proof window, Explain and demo videos, bundles, Verify, Replay stale, the menu bar item, Remote Control, Update, or Settings › Logins.

### server/docs/walkthrough-v4.md

A design-gate (R0) test kit for the v4 Mac app boards, prepared 2026-10-13, run on a design artifact before code existed. It is a script for usability testing, not a how-to.

- The task cards name screens by board ids (C1 to C14), and use an older name for mocks ("… server data") for what is now **Advanced › Network Mocks** (and the fuller **Network** section, ⌘9).
- T6's route through the old server-data panel (Sub Flash Sale range › Server error) no longer matches the UI. Use Network › Rules & scenarios.
- T7 says "Settings › Tutorials › Play"; the button is **Replay**, and the demo is **Start demo run**.
- T5 says to approve or deny the old mock request; approvals now come as Approve, Always allow, Deny cards in the Claude section.
- Its outcome belongs in `decision.md`, not here.

Both documents are still useful history. For anything the app does today, trust [Features.md](Features.md) and this guide, and the in-app tips (the scripts live in [server/docs/tutorials.md](../server/docs/tutorials.md)).
