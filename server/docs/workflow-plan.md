# TestForge v3 — Guided Test Workflow (Design Spec)

> **Status: design signed off (D-039) — implementation phases may start.** Nothing here is built unless
> `progress.md` says so. Each phase ends with a walkthrough of the tasks it makes real (§10, D-039).
> The human guide for this workflow is [`usage.md`](usage.md).

**Why.** Today a test run doesn't say *which code* it tested: a case can run against whatever app
happens to be on the simulator. This spec makes every verdict traceable to a repo, branch, commit and
build, and turns the Test Cases tab into a guided flow an amateur QA or developer can follow without
help — configure, run, validate, report. Requirement from the user: the Test Cases tab gets **Repo**
and **Branch**, and on **Load** the selected repo **must be checked out** on the selected branch.

## 1. Personas and success criteria

| Persona | Knows | Needs |
|---|---|---|
| **Amateur QA** | the app and test cases; no git or Xcode | pick a branch, run cases, trust the verdicts, attach evidence |
| **Developer** | git and Xcode; little QA tooling | verify their branch against the test doc before merge |
| **QA lead** | process | reproducible runs, a sign-off trail, reports |

**Success targets (measured in the walkthrough, §10):**
- First run from a cold machine in **≤ 20 min**, excluding build time.
- A repeat run in **≤ 2 min** of clicks.
- **Zero** terminal commands.
- Every failure states what happened, why, and a one-click fix.

## 2. Core principle: the linkage chain

A verdict is only meaningful when every link below is known and consistent:

```
Repo ─▶ Branch ─▶ Commit SHA ─▶ Build (app + test bundle) ─▶ Simulator install ─▶ Run ─▶ Verdict + evidence
```

The dashboard records and checks each link.

- Every run stores an immutable **environment manifest**:
  - repo, branch and commit SHA;
  - whether the working tree was clean;
  - build id and time, scheme and configuration;
  - simulator model and iOS version, app bundle and version;
  - test doc and its version;
  - mocks armed;
  - Claude model and plugin versions.
- If a link is stale, Run is blocked with a fix button. Examples: branch head moved since the build;
  the installed app came from another SHA.

## 3. Glossary (plain words, used in both the UI and usage.md)

| Term | Meaning |
|---|---|
| **Setup** | Repo + branch + device + test doc (+ optional mocks): everything a run needs. Can be saved and reused ("Flash Sale regression on develop"). |
| **Prepare** | Get the code onto the chosen branch: fetch, check out, install dependencies. |
| **Build** | Compile the app and the test runner for the simulator from that code. |
| **Check** | The readiness checklist; every item must be green. |
| **Run** | Execute the selected cases on the simulator. |
| **Verdict** | PASS · FAIL · BLOCKED · EVIDENCE_ONLY · UNDECIDED (from `/test-forge-run`), plus a human **Accepted / Overridden** status. |
| **Report** | A shareable summary of a run with its manifest and evidence. |

## 4. Workflow: three questions, one Run button, automatic preparation (D-035)

The user answers three questions; everything else is the TestForge's job. The earlier design showed
seven step cards (Code → Tests → Build → Device → Check → Run → Results) that the user worked through
by hand — a 10-year developer reviewing the prototype couldn't tell how to start. Build, Device and
Check are plumbing, not decisions, so they are no longer steps the user performs.

**Form (before Run)** — heading *"Test your app on the simulator"*, one sentence of explanation, then:

```
┌ 1  What code do you want to test?   [A branch on GitHub | A folder on this Mac]
│    Project ▾   Branch [develop      ]   latest commit: "Merge release/v14.8.0…" · 2 h ago
├ 2  Which tests?   [Confluence link or file]  (Read test cases)  →  ✓ 96 found · ☑ list
├ 3  Run   (•) Ask me before anything unusual   ( ) Don't ask — run unattended
│    ▸ More options: mocks · build settings · don't build (reason → UNVERIFIED BUILD)
│    [ ▶ Run 8 tests on develop ]   "First run ~25 min (one-time setup); later ~1 min"
```

The Run button names exactly what will happen; when disabled, the text beside it says why.

**After Run** — the form folds into one line (`Testing develop @ a1b2c3d · 8 tests · TestForge · iPhone 17
Pro Max   [Stop]`) and an automatic progress list runs:

```
✓ Get the code                 develop @ a1b2c3d          (§① below; "Already up to date" when unchanged)
✓ Build the app                Built in 8 min 12 s        (§③; "Already built for a1b2c3d" when unchanged)
✓ Get the QA simulator ready   Ready                      (§④)
✓ Final checks                 All good                   (§⑤ checklist, run automatically)
◌ Run 8 tests                  SF-001 ✓ SF-006 ✓ SF-013 …  (§⑥)
```

Rules:
- Every stage **skips itself** when its output already matches (same SHA prepared, same SHA built,
  same build installed) — that is what makes the 2-minute repeat run.
- A stage **stops only when a human is needed** and then shows one plain-words problem with one
  button: VPN → *Retry*; build error → first error + *Copy log* / *Try again*; low disk → *Free
  22 GB and continue*. A busy simulator is a **wait**, not a stop — it continues by itself.
- A stale build is no longer a user decision: the Build stage simply rebuilds. *Don't build* lives in
  More options and needs a reason.
- The results card appears under the list when the run ends (§⑦). *Change setup* returns to the form.

The sections below keep their ①–⑦ numbering as the **internal stages** behind this UI.

### ① Code: Repo + Branch, checked out on Load (the user's requirement)

**Controls:**
- **Repo** dropdown: repos from the existing `lib/projects.js` scan. It is used only to learn the
  GitHub URL. "Add a repo by URL…" covers amateurs who have no local clone.
- **Branch** combo box: searchable; every branch on GitHub (remote-only branches included, decision
  §11.5), recently updated first. It shows "↻ updated 2 min ago" and a Refresh button.
- There is no checkout-mode choice. Testing **always** happens in a **separate QA copy** (decision
  §11.1). The developer's repo is never checked out, switched, stashed or written to, so development
  is never blocked.

**The separate QA copy: fully isolated (decision §11.2)**

| Concern | Design | Why it can't affect the developer's repo / project |
|---|---|---|
| Location | `~/.test-forge/checkouts/<repo>/`, outside every project folder | Different directory tree |
| Git | An **independent clone**: its own `.git`, `origin` = the GitHub URL. Seeded from the local repo for speed — `git clone --reference <local repo> --dissociate <GitHub URL>` borrows objects during the clone and then copies them, so the QA copy never depends on the developer's repo; plain GitHub clone when no local repo exists. **Not** a `git worktree`. | A worktree shares the developer's `.git`: refs, `git fetch` results and worktree metadata would change their repo, and git refuses to check out a branch the developer already has checked out. An independent clone shares nothing. |
| Checkout | **Detached HEAD at `origin/<branch>`**: no local branches are created | Nothing to diverge, nothing to clean up. A remote-only branch works the same way. |
| Updates | `git fetch origin` + `git checkout --detach origin/<branch>`, in the QA copy only | The developer's remote-tracking refs are untouched |
| Dependencies | `pod install` / Carthage bootstrap **inside the QA copy**, only when `Podfile.lock` / `Cartfile.resolved` changed since that copy's last prepare. The first prepare always runs them, with an estimate shown. | Writes `Pods/` and `Carthage/` in the QA copy only. Global download caches (`~/Library/Caches/CocoaPods`, Carthage cache) are shared, read-mostly caches, not project state. |
| Build output | `xcodebuild -derivedDataPath ~/.test-forge/derived/<repo>` | The developer's DerivedData and Xcode indexes are untouched, so no surprise rebuilds for them |
| Simulator | A **dedicated QA simulator** ("TestForge · iPhone 17 Pro Max"), created by the dashboard the first time | Installing the QA build replaces `com.blibli.mobile` only on the QA simulator, never on the one the developer runs from Xcode |
| Cleanup | "Free disk space" removes QA copies and derived data not used for 14 days | Only touches `~/.test-forge/` |

**Load = Prepare + Load cases (one button, with a progress list):**
1. Create the QA copy if it is missing (first time: a few minutes).
2. `git fetch origin` in the QA copy (VPN hint on failure).
3. `git checkout --detach origin/<branch>` in the QA copy. A dirty QA copy (left over from a crash)
   is reset from origin. Only the QA copy is reset, never anything else.
4. Dependencies, when their lock files changed (see the table).
5. Record the commit SHA, the commit title and the author.
6. Load the test doc (step ②).

**Guard rails:**
- **Branch switch lock**: the QA copy can't move to another branch while a build or run uses it.
  The button says why.
- The dashboard never commits, pushes or rebases. It writes nothing outside `~/.test-forge/` and
  its own `.data/` folder, apart from the QA simulator.

#### Source: GitHub branch or Local folder (D-034)

Step ① starts with a two-way choice:

| | **GitHub branch** (default) | **Local folder** |
|---|---|---|
| Tests | what is pushed to GitHub | the folder as it is now: unpushed commits and uncommitted changes included |
| Best for | QA: everyone can reproduce the exact code | developers, before pushing |
| Picker | Repo + Branch (above) | Folder dropdown (the `lib/projects.js` scan) + "Other folder… (paste a path)"; shows branch, HEAD, "N commits not on GitHub · M uncommitted files" |
| QA copy | `~/.test-forge/checkouts/<repo>/` | `~/.test-forge/checkouts/<repo>-local/` (separate, so switching modes doesn't throw away either copy's dependencies) |
| Code id | commit SHA (`a1b2c3d`) | **snapshot id** = HEAD SHA + short hash of the uncommitted content (`1107d7f+e41a`); just the SHA when the folder is clean |
| Report stamp | — | **LOCAL CHANGES — not reproducible from GitHub** |

**Local snapshot: the developer's folder is only read (D-032 still holds).**
1. Read the folder's state with read-only git: `GIT_OPTIONAL_LOCKS=0 git -C <folder> rev-parse HEAD`,
   `git ls-files -z --cached --others --exclude-standard`, and `git diff HEAD` for the content hash.
   `GIT_OPTIONAL_LOCKS=0` stops git from refreshing the folder's index as a side effect. Nothing is
   stashed, committed, checked out or locked in the folder.
2. Copy exactly those files (tracked + untracked-not-ignored, so no `Pods/`, `Carthage/`, build
   output) into the `-local` QA copy with `rsync --delete --files-from`, which also removes files the
   developer deleted.
3. Dependencies, build, simulator and the rest are identical to GitHub mode.
4. Record the snapshot id, the folder path, the branch name and the list of changed files (for the
   report).

**Drift.** While a local snapshot is loaded, the TestForge watches the folder (cheap state hash every
~10 s and right before Run). If it changed, step ① turns ⚠ "Your folder changed since the snapshot —
2 files edited at 12:41" with **Refresh snapshot**. This is a warning, not a block: the snapshot,
build and run are still consistent with each other; the warning just says they no longer match what
is on disk. Refreshing makes the build stale (③), as usual. A run in progress always uses the
snapshot it started with: the developer can keep coding.

Saved setups in local mode store the folder path and always take a fresh snapshot ("Run again").

### ② Tests: source and column mapping

- **Source**: a Confluence URL (read through Claude, as today) or a file.
- A **preview table** shows the first 5 rows and the detected column mapping
  (ID · Scenario · Precondition · Steps · Expected · API). An amateur can fix a wrong column with a
  dropdown, and the mapping is remembered per doc.
- Also here:
  - an optional **Tech doc**;
  - **Case selection**: filters by status column, platform or text; Select all / failed last time.
  - **Mocks**: attach a saved mock scenario to a case or to the whole run, using the existing
    NetworkLens rules.

### ③ Build

- Scheme, configuration and test plan come from a **Repo profile**, auto-detected once and editable
  under Advanced (today's defaults: `BlibliMobile-iOS-PerfTest` / `PerformanceTest` /
  `TestForgeDriver.xctestplan`).
- **Build** runs `build-for-testing` in the QA copy, with the QA derived-data path, on the QA
  simulator. It only runs on click, which keeps the existing hard constraint.
  - Output: a live log with friendly errors (first compiler error, signing issue, missing pods).
  - It records **build id → SHA**.
- **Staleness**: if the branch head SHA differs from the build's SHA, the step shows "⚠ Rebuild
  needed" and Run is blocked. A **"Skip — test the installed app anyway"** override exists, needs a
  reason, and is stamped on the report as *UNVERIFIED BUILD*.

### ④ Device

- **Simulator**: the **dedicated QA simulator** (created on first use, booted with one click). One
  device only in v3 (decision §11.6); the picker is hidden until multi-device support exists.
- **Harness**: shown as one chip with Ensure / Restart / Logs. Installing the built app happens as
  part of Ensure.
- No live mirror (D-033): the device rail shows simulator state, who holds the device, and a **Show
  Simulator window** button; testers pin the real Simulator window next to the browser. The device
  lock already serialises runs.

### ⑤ Check: the readiness checklist

Every item shows ✅ / ⚠ / ❌, one sentence of why, and a one-click fix:

| Check | Fix button |
|---|---|
| QA copy on selected branch @ latest SHA | Prepare |
| Build matches SHA | Build |
| QA simulator exists and is booted | Create / Boot |
| App installed from this build | Ensure harness |
| Harness healthy (probe) | Restart harness |
| NetworkLens live control reachable | Launch app |
| Claude logged in; test-forge-driver plugin connected | How-to link |
| Atlassian connected (Confluence source only) | How-to link |
| Device not held by another task | Open Queue |
| Disk space ≥ 10 GB (DerivedData) | Clean DerivedData |

Run stays disabled until the list is all ✅. The only exceptions are the explicit, reasoned
overrides, which are logged in the manifest.

### ⑥ Run

- Selected cases go to the **device lane** queue (existing).
- Each case runs as a Claude session (existing), so the user can talk to it and answer approvals and
  questions inline.
- Live view per case: current step, the latest screenshot, a Claude transcript toggle, and Pause
  (finish the current case, then hold), Cancel, and Skip case.
- **Approval policy** is chosen per setup:
  - *Ask me* (default for amateurs; the TestForgeDriver and read tools that are pre-allowed today still run
    without asking);
  - *Autonomous* (today's `TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE`).
- Hard denies always apply; the production Confluence page stays read-only.
- **Crash or timeout handling**:
  - The app crashes: verdict **BLOCKED**, with the crash log attached and a "Relaunch & continue"
    button.
  - The harness dies: one automatic restart and retry (existing), then BLOCKED.

### ⑦ Results and validation

**Results table:** case · verdict · evidence count · duration · cost · human status.

**Case detail:**
- expected vs. observed;
- screenshots and video;
- the network calls made, plus which mocks were active;
- Claude's reasoning summary;
- the steps TestForgeDriver executed;
- a "Re-run this case" button.

**Human validation, the "validate results" requirement.** Each verdict needs one of:
- **Accept**;
- **Override** to PASS/FAIL, with a mandatory reason;
- **Needs re-run**.

The run is "Validated" only when every case is accepted or overridden. Overrides are visible in the
report.

**Flakiness:**
- "Re-run failed" re-queues the failures once.
- A case that passes on re-run is marked **FLAKY**, not PASS.

**Report:**
- Markdown/HTML containing the manifest, a summary, a per-case table and evidence links.
- Export as a file, or publish to the personal page `2437316839`. The production test-case page is
  never written to.
- Run history lets you compare two runs ("what changed since develop@x").

## 5. Saved setups

"Save setup as…" stores repo, branch (or "latest of branch"), doc, selection, mocks, device and
approval policy. The setup is listed on Home with "▶ Run again". This is the 2-minute repeat path.

> **Superseded (D-064, 2026-10-12):** the user redefined P6. The repeat path is the repo itself:
> macros (one per id, reused through `.ref.json` references), the element registry and mock packs.
> A linked case replays on the driver; Claude steps in only to triage a failure or to save a newly
> passed case as a macro. Saved setups and Home "Run again" are not built.

## 6. Data model (for later implementation; files under `.data/`)

- `profiles.json`: per repo: scheme, configuration, test plan, UI test target, bundle id, workspace
  path.
- `checkouts.json`: per repo: QA copy path, GitHub URL, current branch, prepared SHA, dependency lock
  hashes, last prepared / last used time. (The copies themselves live in `~/.test-forge/`.)
- `devices.json`: the QA simulator's UDID, model and runtime.
- `builds.json`: build id, SHA, checkout path, scheme/config, simulator, time, result.
- `setups.json`: saved setups.
- `runs/<runId>/manifest.json`, `runs/<runId>/cases.json` (verdicts and validation),
  `runs/<runId>/evidence/…`. The existing `runs.json` history migrates into this.

## 7. Concurrency and safety rules

- Dashboard locks:
  - one prepare/build per checkout;
  - one run per device;
  - no branch switch on a QA copy that is building or running.
- **Isolation**: every git, dependency and build operation runs in `~/.test-forge/`. The
  developer's repo, branches, refs, DerivedData and simulator are never touched (§4 ① table).
- Existing hard constraints carry over:
  - production Confluence page read-only;
  - build only on click;
  - no secrets committed;
  - docs travel with code.

## 8. Failure catalogue (every one has plain words + a fix)

| Failure | User sees | Fix |
|---|---|---|
| fetch fails | "Can't reach GitHub — VPN?" | Retry; VPN hint |
| branch deleted on GitHub | "This branch no longer exists on GitHub" | Pick another branch |
| QA copy damaged / disk full | what failed | "Rebuild QA copy" (deletes and re-clones; only `~/.test-forge/`) |
| `pod install` fails | first error line | Retry; "Repo update" option |
| build fails | first compiler/signing error, link to the full log | Rebuild; copy log |
| stale build | "Built from 9f8e7d6, branch is at a1b2c3d" | Rebuild / reasoned override |
| no simulator | — | Boot |
| harness wedged | probe output | Restart |
| Claude not logged in / plugin missing | which one | How-to |
| Confluence unreadable / bad columns | preview + mapping | fix mapping / reconnect Atlassian |
| app crash mid-case | BLOCKED + crash log | Relaunch & continue |
| local folder changed after snapshot | "Your folder changed since the snapshot" + changed files | Refresh snapshot |
| chosen local path isn't a git repo | "That folder isn't a git project" | Pick another folder |
| device busy | who holds it | open Queue |

## 9. Implementation phases (only after sign-off, §10)

| Phase | Covers |
|---|---|
| P1 | Code step: repo/branch, isolated QA copy (clone, detached checkout, deps), QA simulator, SHA manifest |
| P2 | Repo profiles + Build step with SHA linkage and staleness |
| P3 | Check step (readiness checklist with fixes) |
| P4 | Run step: per-case live view, pause/skip, crash handling |
| P5 | Results: validation, flaky detection, report and publish |
| P6 | Saved setups + Home "Run again" |

Each phase updates `usage.md`, flipping 🚧 to ✅, plus the other four docs.

## 10. Design verification gate (closed by user sign-off 2026-10-08, D-039 — walkthroughs now run at the end of each phase)

1. A **static clickable prototype**: `docs/prototype/index.html`, a pure HTML/CSS mock with fake
   data and no backend. It shows all 7 steps in success, warning and error states, plus results
   validation. Shared as a private Artifact for review.
2. A **task-based walkthrough** with 1 amateur QA and 1 developer, run on the prototype and
   usage.md. Tasks:
   - Run SF-001 on branch X.
   - A build is stale — what do you do?
   - Validate a FAIL as a real bug and report it.
   - Run again tomorrow.

   Record time, questions asked and errors.
3. **Exit criteria**: all tasks completed unaided; at most 1 question per task; usage.md updated
   with every point of confusion; open decisions (§11) answered.
4. Sign-off is recorded as a decision entry, after which P1 may start.

## 11. Decisions (answered by the user 2026-10-08, D-032)

1. **Checkout**: always a **separate QA copy**, so development tasks are never blocked. There is no
   in-place mode.
2. **Dependencies**: the dashboard runs `pod install` / Carthage automatically when lock files
   change, but **nothing may affect the actual code repo or project**. Hence an independent clone,
   not a worktree; separate DerivedData; a dedicated QA simulator.
3. **Verdict overrides**: anyone, with a valid (mandatory) reason, shown in the report.
4. **Reports**: file export + personal Confluence page `2437316839`.
5. **Remote-only branches**: supported (detached checkout of `origin/<branch>`).
6. **Multiple simulators**: a good future feature. v3 stabilises TestForgeDriver on **one device** first.
