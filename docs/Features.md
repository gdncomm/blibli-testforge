# TestForge Mac app: features

Every feature of the Mac app, one short entry each, grouped the way the app is laid out. Built from the app's code (sidebar sections, tip and tour catalogs, constants), not from older docs. For steps, screens and troubleshooting see the [Usage guide](Usage-guide.md).

**Reading the tables**

- **For**: QA, Dev (developer) or Both.
- **Claude**: **No** means it works with no Claude sign-in and uses no Claude usage. **Yes** means it needs Claude. **Partly** names the part that does.
- Shortcuts are on the menu bar and in each section's name below.

## What TestForge needs Claude for

Everything works without Claude except the items marked **Yes** or **Partly**:

- The Claude section and Remote Control.
- Run with Claude (a case's first run, and Override result › Save and rerun).
- Writing explanations for a case.
- Cases with no recording inside Run all, Re-run failed and a replayed bundle.
- Publishing a report to Confluence.
- Loading test cases from Confluence.
- The Set up Claude Code fix, the Prerequisites plugin check, and the Claude usage bar.

After a case has passed once with Claude, its recording replays on the driver with no Claude. A Claude pass shows UNCONFIRMED until a replay of the saved recording passes. Each case's icon says which kind it is: ⚡ free replay, ✨ needs Claude.

## Windows and menus

| Feature | What it is | For | Claude |
|---|---|---|---|
| Setup | First-run screen. Choose the TestForge checkout and the iOS app clone, and check Xcode, Node.js, Claude Code and the Claude sign-in. | Both | Checks only |
| Main window | Sidebar of 11 sections, the section's page, a console at the bottom and the usage bar. | Both | No |
| Measure window | Sizes and spacing of the Simulator's screen. See [Measure](#measure-window). | Both | No |
| Proof window | Opens a case's screenshot or video full size. See [Proof](#proof-window). | Both | No |
| Docs window | The open document in its own window, on the left or right half of the screen or full screen. See [Docs](#docs-d--both--claude-no). | Both | No |
| Settings (⌘,) | Seven tabs. See [Settings](#settings). | Both | No |
| Menu bar item | Run progress, Stop and Continue while the window is hidden. See [Menu bar item](#menu-bar-item). | Both | No |

### Menus

| Menu | Items |
|---|---|
| TestForge (app menu) | **Check for Updates…**, which reads **Update TestForge… (N new)** when an update is waiting. Pulls the latest `master` of your checkout, rebuilds and reopens the app. Disabled during Setup and while an update runs. |
| View | Show or Hide Console (⇧⌘Y). Show Claude Usage (⌥⌘U). A jump to each section: Get ready ⌘1, Tests ⌘2, Scan ⌘3, Results ⌘4, Reports ⌘5, Advanced ⌘6, Simulator ⌘7, Build ⌘8, Network ⌘9, Claude ⌘0, Docs ⌘D. |
| File | Open Markdown… (⌘O): opens Docs and asks for Markdown files or a folder. Docs Window. |
| Test | Run Selected Case (⌘R). Stop Run (⌘.). Load Test Document…. |
| Simulator | Outline Steps (⌥⌘O). Measure (⌥⌘M). |
| Server | Reconnect Live Updates. Restart Server. |
| Help | Welcome to TestForge (reopens the tour). TestForge Usage Guide and TestForge Features (open those docs in Docs). All disabled during Setup. |

## Sidebar sections

### Get ready (⌘1) · Both · Claude: No

One checklist that says whether tests can run. Green means ready. Only checks that changed are run again.

| Feature | What it does |
|---|---|
| Readiness checklist | One row per check with what was found and a Fix button. Includes the QA server, the live connection, the QA simulator, the QA build and the harness. |
| Fix buttons | Create QA simulator, Boot QA simulator, Shut down the others, Build the app, Start harness, Free disk space, Set up Claude Code. The ones that change things ask first. |
| Prepare code… | Pick a GitHub branch or your working copy; it is copied to a separate QA folder. Your own folder is only read. |
| Git… | Fetch, fast-forward update or switch the branch of your own repo. Stops before touching unsaved work, or stashes it when you say so. |
| Run queue… | Who holds the simulator, who waits and what just finished. Move up, move down, cancel, retry, clear finished. |
| Prerequisites | Lists tools, the Claude Code plugin and MCP servers with the command that fixes each missing one. (The plugin and MCP lookup uses Claude Code.) |
| Test Batch pill | Start, pause, resume, end and reopen a Test Batch. See [Test Batches](#test-batches). |

### Claude (⌘0) · Both · Claude: Yes

| Feature | What it does |
|---|---|
| Assistant session | Your own Claude session in this repo: ask about a screen, a run or the code. |
| Session switcher | Every Claude session (assistant, each run, each triage). One waiting on you is listed first; the sidebar shows a badge. |
| Approval cards | Approve, Always allow or Deny what Claude wants to do. |
| Question cards | Pick an option or type your own answer, or Skip. |
| Quick replies | Yes and No when Claude asks a question, plus ready-made messages such as "Investigate what went wrong and fix it". |
| Composer | Message the session (⌘↩). A Screenshot toggle attaches the test phone's screen. |
| Details | Opens every tool call and result in full. |
| Stop, New conversation | Stop the current turn, or start a fresh conversation in the same repo. |
| MCP | The MCP servers Claude sees, connected or not and why, with Reconnect for each. Typing /mcp does the same. |
| Open in Terminal | Continues the conversation in Terminal with `claude --resume`, for /plugin, /login and every other terminal command. Your next message in the app picks it up again, terminal turns included. |
| Remote Control | Run QA here from the Claude app's Code tab or claude.ai/code. Turn it on, then scan the QR code. Same folder or own worktree per session. |

### Tests (⌘2) · QA mostly · Claude: Partly

| Feature | What it does | Claude |
|---|---|---|
| Load test document | From a Confluence link, or a Markdown or CSV file. The page is only read. | Confluence: Yes. File: No |
| Case list and filter | Search by id or words. Show All, Free replay, Needs Claude, Failed last, Stale or Never run. Each row shows the verdict, a replay icon, a local edit, and a proof badge (screenshots, video, or evidence only). | No |
| Replay icon | ⚡ green free replay (last replay passed), ⚡ orange recorded but not confirmed, ⚠ red recording needs repair, ✨ needs Claude (no recording). The header counts free replays and cases that need Claude. | No |
| Replay | Runs a case's saved steps on the phone. About 30 s. Press and hold for explained replays and demo videos. Off when the recording needs repair. | No |
| Run with Claude | First run of a case. Claude reads the test, drives the phone and saves the steps. Auto, Haiku, Sonnet or Opus. Asks first. | Yes |
| Live steps | Each step in plain words as it runs, with System prep above. Stop with ⌘.. | No (a Claude run adds its session) |
| Explained replays (hold Replay) | Replay with explanations, over the Simulator. Record demo video in English and Bahasa. | Replay and video: No. Writing the explanations: Yes |
| Edit case text | Fix a case's steps or expected result on this Mac. The document is untouched. Revert to document. | No |
| Override result | Set a verdict yourself with a required reason. Save and rerun has Claude run it again. | Save: No. Save and rerun: Yes |
| Starts on / Needs | The screen and state a replay brings the phone to before step 1. | No |
| Deeplinks and mocks | A recorded case's deeplinks and mocked responses, to copy or download. | No |
| Proof panel | Screenshots and videos of a case. Zoom, play, and annotate a screenshot with pen, arrow or box. | No |
| Post to Jira | Drafts a comment for a case's result; you read and edit it, and it posts only after you confirm. | Partly |
| Run all… | Shows the plan first (replays grouped by environment and login), then runs hands-free. | Only for cases with no recording |
| Verify my changes… | Picks the recorded cases that cover what your branch changed. Replay opens the plan. | No |
| Replay stale | Re-runs the recordings of cases whose result is stale because a newer build changed their code. | No |
| Export session | One .zip with every case, its edits, recording, last verdict and run history, plus a readable report. Screenshots and videos optional. | No |
| Test list ⌥⌘L, Live steps | Hide panes so the window is narrow enough for the Simulator to share Split View. | No |
| Run prompt | A sheet that stops a run when it needs a person: tap a system popup, or type a value such as an OTP. | No |

### Scan (⌘3) · Both · Claude: No

| Feature | What it does |
|---|---|
| Record macro | Start recording, tap through the app in the Simulator, End recording and save it as a macro that replays with no Claude. A tap with no accessibility ID is flagged at once. |
| Saved macros | Every macro recorded here, newest first. Replay, Edit steps…, Show in Finder. |
| Edit steps | Reorder, remove, mark Skip if not there, change a wait, retype text, rename a screenshot. |
| Screen surfaces | Scan by hand: move through the app, name each screen and Mark it to save its elements. Tests wait while a scan runs. |

### Results (⌘4) · QA mostly · Claude: Partly

| Feature | What it does | Claude |
|---|---|---|
| Run list and detail | Every run with its proof, newest first. Header shows the code, simulator, server, time and Passed, Failed and Flaky counts. | No |
| Case review | Accept, Override with a reason, or mark Needs re-run. Proof, mocks that answered, what the run said and the steps. | No |
| Re-run failed | Runs the failures again once, planned again so a case recorded since replays. A case that then passes is marked flaky. | Cases with no recording only |
| Export report, Copy report | The run as Markdown. | No |
| Export bundle | The run as one file: cases, recordings, mocks and verdicts. | No |
| Import bundle | Open someone's bundle and replay its recorded cases with no Claude, next to their verdicts. Import keeps your items where they differ; Replace mine and import uses the bundle's. | Cases needing judgement only |
| Set up mocks | Switch on the mocked responses a bundle case ran with, then test it by hand. | No |

### Reports (⌘5) · Both · Claude: Partly

| Tab | What it does | Claude |
|---|---|---|
| Session report | The whole session in one report. Refresh, Copy, export as Markdown or Confluence-ready HTML, or publish a new page under your personal Confluence page. | Publish only |
| Batches | Every Test Batch with its counts and report. Refresh, Show in Finder, Pause, Resume, End, Reopen, Remove, and Replay on this build (regression check against the old batch). | No |
| Runs by branch | History by branch. Compare a run with another (default: develop, else the run before). Export, copy or publish. | Publish only |
| Demos | Plays the demo videos you recorded, in English or Bahasa, with full screen. | No |

### Advanced (⌘6) · Both · Claude: No

A segmented picker with three panels.

| Panel | What it does |
|---|---|
| Network Mocks | Choose what the server answers: empty, an error or a slow answer, one switch per call, without touching the real server. Lists recent calls. |
| Recorded steps | Every recording with its steps in plain words, a check of all recordings, and Replay. Warns about steps found only by their visible text. |
| Simulator Driver | Send the test driver one command (tap, type, swipe, scroll, wait, assert, read a label, open a link, relaunch) without writing a test. Keeps a history. |

### Simulator (⌘7) · Both · Claude: No

| Feature | What it does |
|---|---|
| Device picker | Choose a simulator. Boot, Shut down, Show Simulator, copy the UDID. Use for tests picks the one tests run on. |
| Real devices | Lists paired iPhones and what each lacks. Read-only: tests run on simulators only. |
| Deeplinks | Find a screen by name or type a link, fill its fields and query parameters (min-version presets included), then Open in app. Save and Recent lists. |
| App | Relaunch or Kill the app by bundle id. |
| Display | Color Blended Layers switch. |
| Saved settings | Read, write (relaunches the app) or delete one of the app's UserDefaults. |
| Reset | Reset permissions, reset the Keychain, or Erase device (asks first). |
| Outline steps | Outlines on the Simulator the element each replay step acts on. About 2 s per step. Needs macOS Accessibility permission. |
| Busy banner | A banner over the Simulator while a replay runs. |
| Explain overlay | Intro card, a subtitle and pointer on each step, and a result card, in English or Bahasa. |

### Build (⌘8) · Dev mostly, QA for Install for testing · Claude: No

| Feature | What it does |
|---|---|
| QA build status | Says whether the QA app is built from the prepared code, with the last build's time. |
| Install for testing | Builds when needed (asks first), then installs the app and test runner on the QA simulator. First build takes 10 to 25 min. |
| Build for testing, Stop build | Start or stop a build. A log follows it. |
| Xcode | Open workspace in Xcode, Install & launch the latest built app, and Fix Swift package errors (quits Xcode, cleans caches, reopens). Xcode never needs to be open. |
| Test runner | Stop the runner to free the phone. |
| Free space and reset | Sizes of QA copies and build output. Delete one row, or Reset selected. Your repo is never touched. |

### Network (⌘9) · Both · Claude: No

| Tab | What it does |
|---|---|
| Health strip | Says whether the app on the test simulator is connected, and has the master Mocks switch. |
| Guardrails banner | Shows when mocks are on. Reset to the repo's pack, All off. |
| Traffic | Every call live, filtered by URL. Open a call for Response, Request, Headers and curl. Copy curl, Replay, Hold this call, Mock this call. |
| Rules & scenarios | One switch and answer per call (a body, a failed request, or never answers). Edit answers, shift timestamps to test a flash sale about to start or end, and save rule sets as scenarios. |
| Breakpoints | Hold a call's request or response, edit its status or body or fail it, then Continue. Show or hide the in-app bubble. |
| Trackers | Check that analytics (TRMS) events fired. Optional payload contract. Copy or save the report as Markdown. |

### Docs (⌘D) · Both · Claude: No

Read the app's guides and any Markdown file in place.

| Feature | What it does |
|---|---|
| Document list | **TestForge guides** (the checkout's `README.md`, the usage guide and this feature list) and **Your files**. Other repo docs open in place from their links. Filter by title or path. |
| Drop or open files | Drop Markdown files or folders anywhere on the page, or Open… (⌘O). They stay under Your files between launches; remove one from its right-click menu. |
| Reader | Headings, nested and task lists, tables, code, quotes and images next to the file. |
| Links | A `#heading` link scrolls there; a link to another `.md` opens it in place, with Back; web links open in the browser. |
| Outline | The page's headings; click one to jump. |
| Half and Full | Half: the list beside the page. Full: the page takes the window, hiding the sidebar and console until you leave Docs or pick Half. |
| Docs window | Open the page in its own window: as is, left half, right half or full screen. |
| More | Show in Finder, Open in Default App, Copy Path. Reload re-reads files changed on disk. |

## Test Batches

The toolbar pill files every run and its proof into the active Test Batch. Start, Pause (set aside to switch work), Resume, End (writes the report), Reopen, Change proof folder. Tests cannot run until a batch is active. For QA, Claude: No.

## Measure window

Open with the toolbar Measure button or ⌥⌘M. For both, Claude: No.

| Feature | What it does |
|---|---|
| Click an element | Size, frame, spacing to neighbours, spacing to text, inset in every parent, and the visible card edge found from the screenshot. Copy details. |
| Point to compare | With one selected, point at another element or empty space for the distance in blue. |
| Views without IDs | Finds views the app does not name, from the screen, and shows dashed borders. |
| Zoom | 100% to 800%. ⌘= in, ⌘− out, ⌘0 fit, ⌥-scroll or pinch. |
| Snapshot with notes | Pin numbered notes on a snapshot of the selected view, then copy or save the PNG. |
| Capture again | ⌘R after the phone's screen changes. |

## Proof window

Opens when you click a screenshot or video in Results. For both, Claude: No.

- Previous and Next (← →), thumbnail strip, Open in Default App, Show in Finder.
- Images: zoom 5% to 800% (⌘− ⌘+, Fit ⌘0, Actual size ⌘1). Above 200% pixels are drawn as blocks.
- Videos: play (space), stop, frame step (`,` `.`), position slider, speed menu.

## Menu bar item

Shown when Settings › General › Show in menu bar is on. Icon changes with the run (idle, running, waiting, problem). The menu shows the run (batch progress or case id and step), Continue when paused, Stop, Open TestForge and Quit. A notification and a Dock badge with the failure count appear when a run finishes. For both, Claude: No.

## Settings

Open with ⌘,. The window remembers its last tab.

| Tab | Contents |
|---|---|
| General | Show in menu bar. Notify when a run finishes. Outline steps on the Simulator. Explanation language (English or Bahasa Indonesia). Appearance (Match the system, Light, Dark). |
| Project | The QA server folder, **Change checkout…**, and **Updates** (Check now, Update and restart). |
| Logins | Test accounts kept in the macOS Keychain, by environment and profile. Add, update or remove. Static OTP for uatb. Production OTP: link Outlook to read email codes. |
| Tutorials | Show tutorials automatically. Replay one of 16 tutorials. Start demo run. Reset all tutorials. |
| Phone, Claude, Advanced | Placeholders. They show "These settings arrive in a later release." |

## Welcome tour and tips

- **Welcome tour**: opens once on first launch; reopen from Help › Welcome to TestForge or the ? menu. Pick a role (QA or Developer). Seven pages: Welcome, Why it exists, How it works, Your workflow, What you gain, What it never does, Start. The workflow page lists numbered steps and marks those that need Claude. The Start page can open Get ready, start the demo run, open Claude, open Remote Control or turn on screen tips.
- **Screen tips**: each section's tutorial starts the first time you open it (when Show tutorials automatically is on). Next, Skip tutorial. The ? menu in the toolbar replays the section's tutorials, the welcome tour and the demo run. There are 16 tutorials, one per feature.
- **Demo run**: about 3 minutes, no Claude. Replays the recorded Flash Sale cases SF-001 and SF-006, then points you to Results and Reports. Needs Get ready green and the Flash Sale test document loaded.

## Claude usage bar

Along the bottom of the main window (View › Show Claude Usage, ⌥⌘U). Shows the model, context used, the 5-hour and weekly limits against elapsed time, your account, and Remote Control state. Fed by the Claude Code status line; **Connect Claude Code status line…** adds one marked line to your status-line script after asking. For both, Claude: Yes (reads your Claude Code usage).

## Console

Bottom panel (⇧⌘Y). Raw lines from the server and the app, last 5,000 kept. Source filter (All, Server, App), search, Copy, Clear. For Dev, and QA when reporting a problem. Claude: No.

## Command-line modes

`TestForge --render-demo <folder>` and `--preview-explain <folder> [lang]` render a demo video or an explanation preview with no window. The server uses them; you do not need to.
