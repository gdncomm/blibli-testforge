# QA Dashboard — Decision Log

Append-only. One entry per non-obvious choice: what was decided, why, and what was rejected.
Newest at the bottom. Never rewrite an old entry — supersede it with a new one that references it.

---

### D-001 · Local web app (Node + plain HTML) over native macOS app or Electron
**2026-10-07** — Chosen for build speed and zero packaging for a POC. A sandboxed claude.ai
Artifact was ruled out: it cannot reach the simulator, `xcodebuild` or local files.
Rejected: SwiftUI menu-bar app (signing/build overhead), Electron (heavy for one user/team).

### D-002 · Reuse NetworkLens MCP logic by copying `dist/*.js`
**2026-10-07** — `session.js`, `variants.js`, `trace.js`, `container.js`, `redact.js`,
`control.js`, `queue.js` (as `control-queue.js`) are copied verbatim. The session file is Swift
synthesized `Codable` (base64 bodies, `_0` wrappers, reference-date numbers); a hand-written
variant would drift and silently decode as "no rules". Copy rather than import because
`tools/networklens-mcp` has no `package.json` (ESM type resolution) and is untracked.
Cost: must be re-copied when NetworkLens changes its format.

### D-003 · Dashboard hosts the NetworkLens control queue (:8788) itself
**2026-10-07** — The app already polls it (`ControlOptions()` in `NetworkLensBootstrap.swift`), but
the queue normally lives inside the `networklens` MCP server, which only exists while a Claude
session is open. Hosting it here makes live mocking work standalone. If the MCP server is also
running it will fail to bind and fall back to HTTP against ours — same protocol, no conflict.

### D-004 · Live edit first, file write only as fallback
**2026-10-07** — Writing `session.json` while the app runs is lost to its autosave. Live edits need
no relaunch. When live is unreachable *and* the app is running, the edit is refused rather than
written. Verified live against the running app: master toggle and variant switch both returned
`live: true`.

### D-005 · Delegate harness and macros to test-flow-recorder's scripts
**2026-10-07** — `harness.py` encodes hard-won lifecycle rules (real-command readiness probe,
wedged-process recovery, bounded retries); `macro_cli.py` owns storage layout and ambiguity
refusal. Re-implementing either would fork that knowledge. Paths are discovered at runtime
(`lib/plugin-paths.js`) with env overrides, because plugin install paths are machine-specific.

### D-006 · ▶ Run = headless `claude -p "/qa-run …"`; ⚡ Replay = macro, no Claude
**2026-10-07** — User decision. Adjudication (reading the screen against the expected result) only
exists inside `/qa-run`; reproducing it in JS would be a second, weaker judge. Replay exists as the
free, instant, driver-level alternative. Cost: every Run consumes Claude usage.

### D-007 · Phased delivery (1: live control + driver + launcher, 2: test cases, 3: context panel)
**2026-10-07** — User decision. Each phase usable and reviewable on its own.

### D-008 · Secrets in gitignored `tools/qa-dashboard/.env.local`
**2026-10-07** — User decision over Keychain. A standalone process cannot use the Claude session's
Atlassian/GitHub connectors. `.env.local.example` is committed as the template; `start.sh` sources
the real file.

### D-009 · `QA_ALLOW_AUTONOMOUS_CLAUDE=1` enabled on the author's machine only
**2026-10-07** — User request. `claude -p` cannot answer permission prompts, so without it a Run
stalls on the first non-allowlisted tool. Set in `.env.local` (not committed), default `0` in the
example, so no teammate inherits unprompted tool execution by cloning.

### D-010 · Driver scheme defaults: `BlibliMobile-iOS-PerfTest` / `PerformanceTest`
**2026-10-07** — Commit `619f8d45d` consolidated the driver onto the PerfTest scheme (default test
plan `QADriver.xctestplan`). `harness.py`'s defaults (`QADriver` / `Debug`) do not exist in this
project, which made Ensure report "no test bundle". `start.sh` now exports the correct pair.

### D-011 · "Build test bundle" exposed as an explicit, confirmed button
**2026-10-07** — `harness.py` refuses to run `build-for-testing` automatically (slow, may need VPN,
failures need a human). A one-place dashboard still needs it reachable, so it is a confirm-gated
click whose output is streamed for a human to read — never run implicitly by Ensure.

### D-012 · Test cases load straight from a Confluence URL
**2026-10-07** — Pasting the Confluence page URL is the natural workflow (the first real attempt did
exactly that and failed on a file read). Fetched via REST v2 storage format; the case table is the
one whose headers map the most canonical fields. Read-only: the dashboard never writes to Confluence.

### D-013 · Never comment on or edit production Confluence page 2396520535
**2026-10-07** — User constraint: that page ("Test Cases - Sub Flashsale & Special Placement
Section", space GDNIT) is a production document and QA Mocker is a POC. The dashboard may **read**
it to load cases; no tool, agent or feature may post comments to it or mention QA Mocker /
QADriver / NetworkLens on it. Reports go to the personal-space page 2437316839 instead.

### D-014 · Evidence served via `/api/media`, media extensions only
**2026-10-07** — Browsers refuse `file://` images inside an `http://` page, so screenshot previews
were blank. The route accepts only absolute paths with image/video extensions and no `..`, so a
localhost page cannot be used to read arbitrary files.

### D-015 · Dashboard docs are mandatory companions to every dashboard code change
**2026-10-07** — User request. `progress.md`, `design.md`, `decision.md`, `context-resumption.md`
(and `README.md` when usage/config changes) are updated in the same change as the code. Rule lives
in `BlibliMobile-iOS/CLAUDE.md`.

### D-016 · Explicit loading / empty / error / offline state for every panel and action
**2026-10-07** — User request. One set of helpers (`request`, `withBusy`, `startBusyLine`, `toast`,
chips/dots, skeletons) instead of per-feature ad hoc handling, so every new feature gets the same
states by using them. Outcome messages go to toasts; the Mocking banner is reserved for the one
persistent app-state warning. Verified in headless Chrome over CDP (states, no JS exceptions, no
horizontal overflow at 1400 px or 390 px).

### D-017 · One case and one harness lifecycle action at a time, enforced server-side
**2026-10-07** — Runs and replays share one XCUITest session, and `harness.py ensure` racing itself
double-starts sessions. The UI locks buttons, but the server also refuses with 409, so a second tab
or a stale page cannot break the invariant.

### D-018 · Jobs are cancellable and re-attachable
**2026-10-07** — A `/qa-run` or build can take many minutes; without Cancel the only escape was
killing the server. Run/build get SIGTERM; replay checks a flag between steps. `GET /api/jobs/active`
lets a reloaded page resume following a job instead of losing its output.

### D-019 · DOM built with `el()`, never `innerHTML`
**2026-10-07** — The traffic table previously interpolated captured URLs into `innerHTML`; a crafted
URL from the app's traffic could inject markup into a page that controls the simulator. All
rendering now uses `textContent` via `el()`.

### D-020 · Plugin-script discovery uses bounded-depth globs
**2026-10-07** — The recursive `~/Projects/**` glob walked every `node_modules`/DerivedData and made
the first Load / Ensure click take seconds. Depth-limited patterns resolve in ~1 ms.

### D-021 · ▶ Run uses `--output-format stream-json`
**2026-10-07** — In text mode `claude -p` prints only the final answer at exit, so the "live" console
stayed blank for a whole `/qa-run`. stream-json emits one event per message, tool call and tool
result; the dashboard formats them into readable lines and takes the verdict and cost from the final
`result` event (more reliable than scanning free text). Schema was taken from a real CLI run, not
docs. A probe also showed headless sessions get the user's claude.ai connectors (Atlassian Rovo
`connected`), so `/qa-run` can read Confluence itself without dashboard credentials.

### D-022 · External services go through headless Claude, not dashboard tokens
**2026-10-07** — User decision: "the dashboard must be driven by Claude, as Claude has all plugins
and MCP access." Anything that needs the user's plugins, MCP servers or claude.ai connectors runs as
a `claude -p` job through `lib/claude-runner.js` (▶ Run, Confluence load; Phase 3 Jira/GitHub to
follow). Local, latency-sensitive control (NetworkLens live edits on :8788, QADriver commands on
:8789, harness) stays direct — routing a tap through an LLM would add seconds and cost to every
click and gain nothing.

Confluence load specifics: Claude only *fetches* (`getConfluencePage`, markdown); the dashboard
takes the body from the raw tool result in the stream and parses it locally, so Claude never
re-types 96 rows (9 s, ~$0.07 on haiku vs. minutes and dollars for structured output). The session
is read-only by construction — allowlist `ToolSearch` + `getConfluencePage`, Confluence write tools
denied, permission bypass never passed — because the page is a production document. REST with
`CONFLUENCE_EMAIL`/`CONFLUENCE_TOKEN` remains as an optional fast path when those are set.

### D-023 · Persistent sessions over the Agent SDK
**2026-10-07** — User decision: the dashboard is the GUI for talking to Claude, both ways. Each
session is one Agent SDK `query()` fed by an async input queue (messages can arrive mid-turn), using
the user's installed `claude` and all setting sources, so plugins, project `.claude/` and claude.ai
connectors behave exactly as in the terminal (probe: qa-driver, qa-mock, Atlassian Rovo present).
Chosen over speaking the raw `--input-format stream-json` control protocol ourselves: the SDK owns
that protocol, and gives `canUseTool`, hooks, `interrupt()` and `resume` as typed APIs. After a
restart a session is `idle` and resumes by Claude session id on the next message (verified).

### D-024 · Two lanes, and the device lock lives in a PreToolUse hook
**2026-10-07** — User decision: device lane strictly serial, general lane parallel (3). The lock is
taken in a `PreToolUse` hook, not `canUseTool`, because the user's settings can already allow
QADriver tools — then `canUseTool` is never called, but hooks always run. That is what lets a free-
form chat use QADriver safely while a queued `/qa-run` owns the simulator. Driver Console clicks use
`tryAcquire` (409 instead of waiting) so a click never silently queues behind a long run.

### D-025 · Approvals in the dashboard, with hard denies
**2026-10-07** — User decision: approve tool calls in the GUI. Read-only tools, QADriver and
Atlassian/GitHub reads are pre-allowed so QA flows are not a click-fest; Edit/Write/Bash etc. show a
card (diff preview for edits) with Approve / Always allow (per project, persisted) / Deny with reason.
Confluence writes targeting page 2396520535 are refused in both `canUseTool` and the hook, whatever
is approved — the production test-case page stays read-only by construction. `QA_ALLOW_AUTONOMOUS_CLAUDE=1`
still runs queued `/qa-run`s with `bypassPermissions` (hooks, and so the hard deny, still apply).

### D-026 · Hybrid GitHub / Jira
**2026-10-07** — User decision. GitHub through `gh` (already logged in, ~3 s, free). Jira through a
read-only haiku `claude -p` job (~10 s, ~$0.05, no token), cached 15 min. One-shot data fetches
(Confluence load, Jira) stay on `lib/claude-runner.js` rather than full sessions: they need no
approvals, run with a two-tool allowlist, and only their raw tool result matters.

### D-027 · ES modules on top of app.js globals; sanitised markdown
**2026-10-07** — v2 tabs are `public/js/*.js` ES modules. Rather than split the 1100-line `app.js`
now, the modules use its helpers as classic-script globals (`el`, `request`, `withBusy`, `toast`,
`followJob`, `badge` — a module can see a classic script's top-level bindings). Claude's chat text
is the one place HTML is rendered: `marked` → `DOMPurify.sanitize` (both served from `node_modules`,
no CDN). Everything else still builds DOM with `el()` (D-019).

### D-028 · Oversized tool results are read from the file Claude Code saved
**2026-10-07** — A Jira search for 37 issues (~123 k chars) came back as an error-shaped notice
"result … exceeds maximum allowed tokens. Output has been saved to <file>". `claude-runner.js` now
follows that path, so data fetches work at any size.

### D-029 · One simple loader instead of shimmer skeletons
**2026-10-07** — User feedback: "the current loading indicator is not good — add a simple loader".
The thin half-ring spinner and the shimmering skeleton rows were replaced by one loader: a faint
full ring with a solid turning arc, used everywhere (buttons, chips, panels, the device rail), and
tables show a single centred "Loading…" row. `skeletonRows()` keeps its name so call sites didn't
change.

### D-030 · Jira and pull-request views removed
**2026-10-08** — User decision: "remove JIRA and Pull Requests … they are distracting from our
primary goal." The primary goal is QADriver-driven QA through Claude. Removed `lib/jira.js`,
`lib/github.js`, `routes/work.js`, the Work tab's Jira and PR sections (incl. "🧪 Test" from a
ticket / PR) and Home's PR and Jira cards. The Work tab became **Projects** (local repos only: Session,
Terminal, Finder); repo rows no longer show the branch's Jira key or PR. D-026 is superseded; the
large-result file follow from D-028 stays (Confluence loads can be large too).

### D-031 · Development paused until the v3 workflow is designed and verified
**2026-10-08** — User decision: "On test cases tab we need … Repo, Branch. On load selected repo and
the branch must be checked out. Let's stop development … create a robust workflow plan … where any
amateur QA or developer can configure tests, run, validate results … no development unless all UI,
UX and workflow is completely designed and verified." Outcome: [`workflow-plan.md`](workflow-plan.md)
(7-step guided flow built on the linkage chain repo → branch → commit → build → install → run →
verdict) and [`usage.md`](usage.md) (amateur guide, ✅ / 🚧 marked). Branch checkout defaults to a
dashboard-managed git worktree so a developer's working copy is never touched; in-place checkout only
on a clean tree. Implementation (P1–P6) starts only after the §10 gate: static prototype + task
walkthrough with one amateur QA and one developer, open decisions (§11) answered, sign-off recorded
as a new decision.

### D-032 · v3 design decisions: isolated QA copy, one device
**2026-10-08** — The user answered the open decisions in `workflow-plan.md` §11:
1. Always test in a **separate QA copy** "to ensure any development tasks are not blocked" — no
   in-place checkout mode at all.
2. Dependencies are installed automatically when lock files change, "but none of that should affect
   the actual code repo and project". Design consequence: the QA copy is an **independent clone**
   (`git clone --reference … --dissociate`) in `~/.testforge/`, checked out **detached** at
   `origin/<branch>` — *not* a `git worktree`, which would share the developer's `.git` (refs, fetch
   results, worktree metadata) and can't check out a branch the developer already has checked out.
   Builds use a separate `-derivedDataPath`; runs use a **dedicated QA simulator** so the QA build
   never replaces the app a developer runs from Xcode.
3. Verdict overrides: anyone, with a valid mandatory reason, shown in the report.
4. Reports: file export + personal Confluence page 2437316839.
5. Remote-only branches: supported.
6. Multiple simulators: wanted later; v3 stabilises QADriver on one device first.
Remaining gate before development: static prototype + walkthrough + sign-off (§10).

### D-033 · Simulator mirror removed from the design
**2026-10-08** — Reviewing the prototype, the user called the device-rail mirror "utter slow and not
needed as one can simply pin simulator window on browser". The `simctl io screenshot` mirror tops out
around one frame per 1–2 s, so it can never feel live, and the real Simulator window already shows
the device at full frame rate.
Design change: the rail becomes a **device status panel** — QA simulator state (not created / off /
booted), who holds it (Free / Driven by ▶ Run …), **Show Simulator window** (brings Simulator.app's
QA device to the front), "Ask Claude about this screen" (one screenshot on demand, not a stream), and
a tip to pin the Simulator next to the browser. The ⑥ Run step has no screen view either.
Evidence screenshots that Claude takes during a case are unaffected; they stay in ⑦ Results.
The built mirror (`/api/device/mirror.jpg`, `public/js/device.js`) stays in the code for now —
development is paused (D-031) — and is removed in P1.

### D-034 · "Local folder" source for step ① (snapshot, read-only)
**2026-10-08** — The user asked to "add option to load local repo". Step ① now offers **GitHub
branch** (default) or **Local folder**. Local mode tests the folder as it is — unpushed commits and
uncommitted changes included — so a developer can test before pushing.
To keep D-032's rule ("none of that should affect the actual code repo and project"), local mode
never runs or builds in the developer's folder: it copies a read-only **snapshot**
(`git ls-files --cached --others --exclude-standard` → `rsync --files-from` into
`~/.testforge/checkouts/<repo>-local/`, all git reads with `GIT_OPTIONAL_LOCKS=0`).
Alternatives rejected: building in place (touches their DerivedData, Pods and simulator app, and
the code can change mid-run); `git stash create` / a temporary commit (writes objects or refs into
their repo); a worktree (shares their `.git`, see D-032).
The code id is the HEAD SHA plus a short content hash (`1107d7f+e41a`). Folder drift after loading
is a **warning with Refresh snapshot**, not a block. Reports are stamped **LOCAL CHANGES — not
reproducible from GitHub**.

### D-035 · Three questions + one Run button replace the 7-step flow
**2026-10-08** — Reviewing prototype v2, the user (a 10-year developer) said: "On first look even i
am not understanding how to start the workflow by looking at this prototype". Causes: no statement
of what the page is for; seven cards of equal weight; three competing primary buttons (Load, Go to
④ Device, Run again); internal plumbing (Build, Device, Check) presented as user steps; a setup bar
full of "not prepared / not built / not loaded"; and Load's hint referring to step ② below it.
Redesign (prototype v3): a heading + one sentence; three questions (What code? · Which tests? ·
Run); one primary button that states what it will do; after Run, an automatic progress list whose
stages skip themselves when already satisfied and stop only when a human is needed, each with one
fix button. The setup bar is gone (replaced by a one-line summary after Run). Wording moves to plain
language: "Agree / Change the verdict / Run it again", "couldn't finish" for BLOCKED. The ①–⑦
internals of `workflow-plan.md` are unchanged; only what the user sees and does changed.

### D-036 · Prompt section and macros in the prototype
**2026-10-08** — The user asked to add the prompt section from `feasibility-macros.md` §4.4 to the
prototype. Design choices:
- It lives in **question 2** as a second mode, *"Describe it in your own words"*, next to *"Test cases
  from a page"* — not a separate page — so code, device and the automatic run stay the same.
- Kinds: **Check a flow · Verify a bug fix** (ticket required, read via Atlassian) **· Record a
  routine**; optional **Start from** a saved routine.
- The run records each step with its generated element ID and a quality mark (**by ID** / **by text
  ⚠**); fragile steps are called out.
- **Save as macro** requires ticking a review checkbox (feasibility open question 4, recommended
  answer applied in the design; still to confirm with the user).
- **Macros** panel on the rail with **▶ Replay** (no Claude). A failing step stops with **Ask Claude
  to repair**; the fix is applied only after the user approves, and updates every macro using that
  element.

### D-037 · Home tab in the prototype; "local repository" wording
**2026-10-08** — The user wanted to review the Home tab (the prototype only had Test Cases) and asked
that "A folder on this Mac" point clearly at a git working copy. Prototype v5/v6: tabs are clickable
and it **opens on Home** — three start actions (Run test cases · Describe a check · Replay a macro),
*Running now*, *Needs you* (results to review, permission requests, repairs — one button each),
*Recent runs* (click to open) and a *Macros* table. Other tabs show a "not part of this prototype"
note. The local source is now **"A local repository (git working copy)"** — any folder containing
`.git`; the picker's last option is *Another local repository… (paste the folder that contains .git)*.

### D-038 · Macro feasibility questions answered
**2026-10-08** — The user answered `feasibility-macros.md` §8:
1. "Macros can be in the repo, not added to app bundle" → `BlibliMobile_XCUITest/<Module>/<Submodule>/macros/`
   + `BlibliMobile_XCUITest/QAMacros/elements.json`; never a target member (that folder is a classic
   group, so on-disk files are not built — keep it so).
2. QADriverKit changes accepted on the qa-mocker-testing branch/tags; "Once verified we will merge
   them along with other code to develop after complete end to end testing on multiple modules".
3. "Yes. For bug fix validation feature. We can add a load Jira button which will accept only accepts
   bug tickets" → prototype v8: **Load Jira** in *Verify a bug fix*; non-Bug types rejected with an
   explanation; the loaded ticket pre-fills the check.
4. "yes. Present user with a visual map of the macro for quick verification" → prototype v8: the
   Save-as-macro dialog shows a map (steps grouped by screen, mini phone with the element highlighted,
   colour = tap / check / fragile); **Map** button on every saved macro.

### D-039 · v3 design signed off; walkthrough moved into every phase
**2026-10-08** — The user: "Consider walkthrough done. We will have walk through anyway in each
phase". The §10 gate is closed by the user's sign-off on prototype v8 + `usage.md` +
`workflow-plan.md` + `feasibility-macros.md` (D-031…D-038). **Development may resume (ends the D-031
pause).** Instead of one up-front walkthrough, `docs/walkthrough.md` is used at the end of **each**
implementation phase, with the task cards that phase makes real; findings go into the next phase.

### D-040 · M0: the dashboard hosts the QADriver queue; macro schema v2 replays without Claude
**2026-10-08** — Built in parallel with P1 (the user chose "Both in parallel").
- **Queue ownership (feasibility G1):** `lib/driver-host.js` is a JS port of qa-driver-mcp's
  `queue.ts`, bound to `127.0.0.1:8789` at dashboard start, `/health` → `hostedBy: "testforge"`.
  First binder wins: the MCP's own `listen()` already falls back to client mode when the port is
  taken, so no plugin change was needed. When an MCP got there first and later exits, a 2 s watchdog
  re-binds — kept short because the runner exits when `/health` fails. Rejected: pointing the MCP at
  the dashboard via config (a plugin change, and still needs the dashboard running).
- **Macro v2 (G4/G5/G7):** `lib/macro-v2.js`. Steps (`do`: openDeeplink, relaunch, tap, type,
  waitFor, waitForGone, assert, scrollTo, swipe, screenshot, wait, run) reference registry elements
  (`el_…`). M0 targets the chain's **leaf identifier** only (chain descent needs the runner's
  `resolve`, G3); label fallbacks are tried in order for `tap`. Deeplinks and waits run host-side
  (`simctl openurl`), never as runner commands.
- **No answer = possible freeze:** each runner command gets its own wait + 20 s; silence restarts the
  harness and runs the macro **once more from the top** (so the app is back in a known state). A
  second silence is the verdict — which is exactly what a hang bug like SF-084 looks like.
- **Verdicts:** PASS (≥ 1 assertion passed) · PASS (driver-level) (no assertions) · FAIL (a check or
  a gesture failed) · BLOCKED (macro can't be resolved: unknown element, label-only element where an
  identifier is required, routine cycle) · CANCELLED.
- **Runner vocabulary:** `labelMatch` is `exact | contains | beginsWith` in QADriverRunner; the
  registry keeps predicate-style `== | CONTAINS | BEGINSWITH` and the planner translates.
- v1 macros (`macro_cli.py`) still replay through `lib/macro.js`; `macro_cli.py list` also lists v2
  files, so the dashboard drops those rows from the v1 list.

### D-041 · P1 Code step: how the QA copy is made without touching the developer's repo
**2026-10-08** — `lib/qa-copy.js` + `routes/code.js`.
- **No fetch in the developer's repo** (it would move their remote-tracking refs). Branch lists come
  from their refs as-is; **↻ Check GitHub** uses `git ls-remote`, which changes nothing locally.
- **GitHub branch:** `git clone --no-checkout --reference <repo> --dissociate <origin URL>` into
  `~/.testforge/checkouts/<repo>` (objects copied, then independent), then
  `fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`, `checkout --force --detach`, `clean -ffd`
  (not `-x`: ignored dependency output such as `SwiftPackages/` survives).
- **Local repository:** every git call uses `GIT_OPTIONAL_LOCKS=0` (plain `git status` rewrites the
  index — caught by a test). Files = `ls-files --cached --others --exclude-standard`, filtered to
  those that exist, copied with `rsync --from0 --files-from`. macOS ships **openrsync**, which has no
  `--ignore-missing-args`, hence the filter. Files deleted since the last snapshot are removed from
  the copy using the previous file list. The copy has **no `.git`** — fine for the build so far;
  revisit in P2 if a build phase needs git.
- **Snapshot id:** `<sha7>` when clean, `<sha7>+<hash4>` with changes; the hash covers
  `git diff HEAD --binary` plus every untracked file's path and content.
- **Dependencies, detected per repo:** Swift packages (`SwiftPackages.sh download` when
  `SwiftPackageList.txt` changed or `SwiftPackages/` is missing); CocoaPods (`pod install` only when
  `Pods/Manifest.lock` ≠ `Podfile.lock` — Pods are committed in this repo, so normally never);
  Carthage (`Cartfile.resolved`; absent in this repo today).
- One prepare at a time; it is a job (progress lines over SSE, cancellable, re-attached after reload).

### D-042 · M0 on the simulator: what the first real replays changed
**2026-10-08** — First replays on a real simulator (the user approved the test-bundle build).
- **Build flags:** `xcodebuild build-for-testing` stops at "Validate plug-in
  GenerateBluIconInternalResources" — Xcode's GUI "Trust & Enable" doesn't apply to the CLI. The
  dashboard's **Build test bundle** now passes `-skipPackagePluginValidation -skipMacroValidation`
  and pins `arch=arm64`.
- **Simulator:** the user reported the iPhone 17 Pro Max (iOS 26.1) simulator as faulty (onboarding
  stuck on its loading shimmer; every `simctl openurl` raised iOS's "Open in “Blibli”?" prompt).
  It was shut down; the harness (first booted device) now runs on **iPhone 12 Pro Max, iOS 17.5**
  (`38CF7E67-…`). The arm64 test bundle runs there unchanged.
- **Runner envelope (real bug):** QADriverRunner answers `{id, value: {...}, at}`, failures as
  `{id, error}`. Both replays read the outcome fields at the top level, so every check saw
  `undefined`. Fixed in `lib/macro-v2.js` (`unwrapOutcome`) and `lib/macro.js` (v1); the fake runner
  now uses the same envelope so the tests can't drift from the real thing again.
- **New step fields/kinds:** `optional: true` (a step that isn't there is skipped, not failed);
  `unless: el_…` (skip when that element is already showing — 2 s probe); `timeout` on `tap`;
  `alertTap`; host-side `clearAppDefault {key}` — removes a key from the app container's
  `Library/Preferences/<bundle>.plist` with the app terminated (`simctl spawn … defaults` writes the
  simulator's global domain, not the sandbox, so it can't reset the app).
- **Onboarding (user request: "Build a macro to skip first launch onboarding until homepage load"):**
  routine `mc_EAH97EMYH5` *Open Home (skip onboarding if shown)* and flow `mc_EAH97EE096` *First
  launch: onboarding → Home*, in `BlibliMobile_XCUITest/SplashScreen/General/macros/`. Home anchor
  `HomeSearchButton`; Start button `startButton` (enabled only after the token/app-version call
  returns); Skip has no identifier (label "Skip" / "Lewati").
- **SF-084 no longer deeplinks:** it runs the routine, then taps Home's Flash Sale **Show all**
  (`FS_Shared_ComponentActionText`) — no iOS prompt. On this build/environment that opens the **old**
  Flash Sale screen with "Nothing to show here yet", so the revamp-specific steps can't pass until the
  revamp page is enabled and has schedule data (mocks / flag) — a test precondition, not an engine
  issue. The SpringBoard-alert runner change (`qa-mocker-testing-3`, approved) is on hold while
  SF-084 doesn't need deeplinks.

## D-043 — Every failed replay reports the NetworkLens interceptor state (2026-10-09)

- **Trigger:** NetworkLens mocking had been left **ON with no rules**; the user turned it off and
  asked: "add this driver checks whenever anything fails, check mocks on network interceptor".
- **Decision:** when a v2 replay ends FAIL or BLOCKED (not PASS, not CANCELLED), the `replay-v2`
  executor calls `checkInterceptor()` (`lib/lens-check.js`) and appends its lines to the run output
  (`⚠` when mocking is ON, `ℹ` when OFF). The run-history row gets `interceptor: {source,
  isMockingEnabled, armed}`.
- **Source order:** the running app's live state over the control queue first (the app owns its
  rules while it runs, and autosaves over the file), else `session.json` in the app container. If
  neither answers, it says "unknown". It never fails the replay.
- **Flagged:** mocking ON with any enabled rule (each armed endpoint is listed — a mocked response
  can look like an app bug), and mocking ON with no enabled rule (left on by accident).
- **Why only on failure:** a passing run doesn't need it, and the live query costs a control-queue
  round trip.
- **Found the same day (SF-084):** with mocking OFF, Home → Show all opens the **revamp** screen
  (`FSScreenView`). The persisted `flashSale2026Revamp` is `{"iOS":{"minVersion":"14.8.0","isInternal":false}}`,
  so the gate is on for 14.9.0 for every user. Two things still block SF-084:
  1. UATB returns no schedules. The page shows its own empty state (`emptySchedulesTitle` → "Nothing
     to show here yet"), so there is no tab row and no Tomorrow tab. It needs schedule data: a
     NetworkLens mock of the schedules endpoint, or UATB data.
  2. App accessibility bug: `CommonNavBar` sets `CommonNavBar_Container` on its container without
     `.accessibilityElement(children: .contain)`, so every nav-bar child (back, share, cart,
     notifications) reports the container's ID. `FS_NavBarShareButton` is declared in
     `FSAccessibilityIdentifier` but never applied. SF-084's "share button" anchor can't resolve
     by ID until this is fixed; re-anchor on the tab row or the content instead.


- **Update (same day):** SF-084 PASSES on device (36.9 s) with the NetworkLens mock of
  `GET /backend/content-api/flashsale?display=app` adding a Today and a Tomorrow schedule (timestamps
  generated at arm time, so they go stale after a day), re-anchored on the tab row
  (`FS_Shared_TabRowContainer`). The Tomorrow tap took 12.5 s, which is worth watching in the 20×
  go/no-go. At the user's request, `CommonNavBar` no longer sets an ID on its container. IDs are now
  only on the buttons, the title text (`CommonNavBar_Title`), the title icon
  (`CommonNavBar_TitleIcon`, new) and the title image. The registry's share element now points at
  `CommonNavBar_ShareButton`. Needs an app rebuild to take effect.

## D-044 — Test logins in the macOS Keychain; person-in-the-loop popups (2026-10-09)

- **Trigger (user):** "Create a safe mechanism for login credentials storage for prod and uatb. For
  prod we will need real otp. Uatb OTP can be stored with credentials itself. Prefer industry wide
  best used practice." Also: "whatever spring board popup handling i had to manually do, add all
  those as popups on dashboard … to go to simulator and tap. Until we find a genuine solution".
- **Storage = macOS login Keychain** (the OS secret store: encrypted at rest, unlocked with the
  user's login, per-item ACLs), via the `security` CLI. One generic-password item per login: service
  `testforge.login.<env>`, account `<profile>`, secret JSON `{email, password, otp?}`.
  - Writes go to `security -i` **on stdin**, so the secret never appears on a command line (`ps`).
  - Nothing secret is written to disk. `~/.testforge/credentials-index.json` (mode 600) holds
    only env, profile, masked email, hasOtp and updatedAt, so the UI can list logins.
  - No API returns a secret. The dashboard only accepts them (POST) and deletes them.
- **OTP policy:** a stored OTP is allowed only for `STATIC_OTP_ENVIRONMENTS` (`uatb`). Saving one for
  `prod` is refused. A missing OTP at run time raises an **input popup** (masked); the value is
  typed and never stored.
- **Typing secrets (`typeSecret` step):**
  - The runner only *taps to focus* the field. The value goes in as host keystrokes (`osascript`
    reading its script from stdin → System Events into the Simulator).
  - So the secret never enters the driver queue, the runner, XCTest's activity log or the run
    history. Step text shows `‹uatb/internal password›`.
  - With no `el`, it types into the focused field: the OTP boxes are unlabeled and auto-focus.
  - Needs the dashboard's terminal to have **Accessibility** permission.
- **Manual popups (`manual` step):**
  - A replay pauses and the dashboard shows a modal ("The run is waiting for you") with Show
    Simulator window / Done / It wasn't shown / Stop the run, plus a macOS notification.
  - Done → pass; wasn't shown → skipped; Stop or a 10-min timeout → BLOCKED.
  - Cancelling the task closes its popup (`lib/prompts.js`, `routes/credentials.js`,
    `public/js/prompts.js`).
  - This stands in until the runner can reach SpringBoard (#88, `qa-mocker-testing-3`).
- **Login routines** (`Authentication/General/macros/`):
  - `log-in-uatb-internal.json` (`mc_EDI128KNHY`, OTP from the Keychain) and
    `log-in-prod-internal.json` (`mc_EDI12ASFJC`, OTP from a popup).
  - Both use manual popups for the ASWebAuthenticationSession consent alert and the iOS
    Save Password sheet. They assume a logged-out Home.
  - Six new registry elements.
- **Alternatives rejected:**
  - `.env.local`: plaintext on disk, one `git add -A` from a leak.
  - 1Password CLI: not installed for every QA.
  - Storing a prod TOTP seed: Blibli OTPs are SMS/email, not TOTP.

## D-045 — Header shows the Claude account and the code under test; sessions open in the QA copy (2026-10-09)

- **Trigger (user):** "The dashboard must show reflection of the active claude terminal where your
  account is logged in and claude session started on repo and branch you are actually testing".
- **Header chips:**
  - `Claude: <email> · <org>`, from `claude auth status`, cached 60 s; a red chip when logged out.
  - `Testing: <repo> · <branch> @ <sha> (local + uncommitted)`, from the current QA-copy manifest;
    a warning chip when no QA copy is prepared. Route: `GET /api/identity`.
- **Sessions follow the target:**
  - New Claude sessions (Sessions tab, ▶ Run `qa-run`, free-form tasks) now open in the prepared
    QA copy, in its `BlibliMobile-iOS` subfolder when it has one. Before, they opened in
    `QA_PROJECT_DIR` (the developer's repo).
  - `qa-run` sessions record `branch`/`sha` in their meta.
  - An explicit `projectDir` still wins.
- **Caveat:** a *local* snapshot is frozen at prepare time. Re-run **1 · What code? → Load** after
  editing the repo, or sessions read the old copy.
- **Fixed alongside:** `lib/qa-copy.js` `git()` trimmed the leading space of `git status --porcelain`,
  so the first changed path lost a letter in the manifest's `changedFiles` (display only — the copy
  uses its own file list).

## D-046 — Reuse the UI-test matching logic: one OR-ed label query; SpringBoard alertTap (2026-10-09)

- **Trigger (user):** "I don't see tomorrow tab selected" during the go/no-go, then "Can we not
  implement the same logic used in BlibliMobile_XCUITest in our scripts?"
- **What happened:**
  - Run 1: 20/20 PASS, but the Tomorrow tap took 12.5 s. The runner log showed `label BEGINSWITH
    "Besok"` polled for its full timeout on an English device before "Tomorrow" was tried.
  - A JS round-robin with 1 s probes then failed every run: the runner found "Tomorrow" but its
    `QAWait.validFrame` check had only 1 s, so the run reported "exists but never laid out a valid
    frame". These were honest FAILs, not false passes. The run was stopped.
  - A "commit to the found locator" fix brought the tap to 4.9 s.
- **Already shared with the UI tests:** `QADriverRunner` was ported from
  `BlibliMobile_XCUITest`'s helpers. `QAWait.validFrame` is `SpadeUtility.waitForValidFrame`, and
  `waitForMatch` polls `hasMatch` (like `waitForEachIndependently`) instead of `waitForExistence`'s
  1 s polling.
- **The gap was the dashboard sequencing label fallbacks.** An XCUITest writes one query.
  - QADriverKit `tapByLabel` now takes `anyOf: [{label, labelMatch}]`, resolved as one
    `NSCompoundPredicate` OR with one wait.
  - `planStep` sends one `anyOf` command when an element's label fallbacks share an element type,
    and still includes `label` = the first spelling for older runners.
- **SpringBoard alertTap (#88, approved earlier):** `alertTap` also looks in
  `XCUIApplication(bundleIdentifier: "com.apple.springboard")` alerts and buttons. It returns
  `alertSource` and honours `timeout`.
- **Shipped (user chose "Both in tag -3"):**
  - Blibli-Utility `5cd89f3` on `darshan/innovation/qa-mocker-testing`, tag `qa-mocker-testing-3`,
    pushed.
  - `BlibliMobile-iOS/SwiftPackageList.txt` re-pinned to `-3`.
  - A typecheck against the iOS simulator SDK is clean. Device verification is pending the package
    refresh + test-bundle rebuild.
- **SF-084 now proves the tab switched:** a new assertion checks `FS_Shared_SectionHeaderTitle`
  reads "Watch for what's next". The Today tab reads "Shop today's limited deals", so the
  assertion tells the two apart.
- **Observed app issue:** the schedule tab row's container identifier (`FS_Shared_TabRowContainer`)
  propagates to each tab button. This is the same container-ID pattern fixed in `CommonNavBar`
  (D-043/D-044). It wasn't changed here.

## D-047 — Login variants (saved / not saved) and an environment-switch routine; runner multi-tap (2026-10-09)

- **Login variants live in the repo**, under `BlibliMobile_XCUITest/Authentication/General/macros/`:
  - **Saved:** `log-in-ios-saved-password.json` (`mc_F5BUCDH5ET`). Uses the iOS AutoFill “Use …”
    suggestion for the email and the password, submits with a newline, so no credential is read
    anywhere. Verified PASS 55.4 s on UATB. Works on any environment the simulator has a saved
    password for.
  - **Not saved (Keychain):** `log-in-uatb-internal.json` (popups), `…-automatic-system-alerts.json`
    (runner `alertTap`), `log-in-prod-internal.json` (popups) and the new
    `log-in-prod-internal-automatic-system-alerts.json`. Prod's OTP always comes from a person.
  - Names now read “Log in · saved …” / “Log in · not saved · <env/profile> · popups|automatic alerts”.
    Ids are unchanged, so callers keep working. The system-alert popup text no longer names the
    UATB domain.
- **Environment switch** (`Enticement/AboutBlibli/macros/`):
  - `open-environment-switcher.json`: Account tab → scroll to `aboutBlibli` → tap → **triple-tap**
    the `assets_logo` image → wait for “Current Environment: …”.
  - `switch-environment-to-{uat-b,prod,pre-prod}.json`: run the opener, tap the option, wait 2 s,
    then the open-Home routine. The app's `resetApp` wipes session, keychain and settings and shows a
    button-less restart alert, so each switch ends **logged out** on a fresh Home. Chain a Log in
    routine after it.
  - Debug builds only: release needs 7 taps plus a passphrase, which we don't automate.
- **Why a runner change:** `onTapGesture(count: 3)` needs the taps inside one gesture; three
  separate runner round trips are too far apart. QADriverKit's `tap`/`tapByLabel` take
  `taps: n` → `XCUIElement.tap(withNumberOfTaps:numberOfTouches:)`; macro steps take `taps`.
- **Bundled runner fix:** `tapReporting` reads `element.identifier` before tapping. Reading it after
  a tap that navigated away raised an XCTest failure that ended the whole live session (seen on an
  ambiguous `accountSetting` tap).
- **Shipped:** Blibli-Utility `a3b2e99`, tag `qa-mocker-testing-4` (pushed), app re-pinned, test
  bundle rebuilt (`TEST BUILD SUCCEEDED`).
- **Verified on device (iPhone 12 Pro Max, iOS 17.5, PerformanceTest = DEBUG, so 3 taps):**
  - Opener PASS 33.7 s; the screenshot shows the sheet “Current Environment: UATB”.
  - Switch → UAT B PASS 69.7 s; onboarding reappeared after the relaunch, which confirms the reset.
- **Lesson — restart the dashboard after editing `lib/`:** Node caches ES modules. The first opener
  run reported PASS while the old `planStep` dropped `taps`, so it sent a single tap. A tap step
  only proves the element was tapped, not that the gesture did anything. Label-only elements also
  can't be waited on (`waitFor` needs an identifier), so the opener has no post-check. The switch
  routines' option tap is the check.
- **Login: optional “Try again” step (`st_12b`, 12 s) in every login routine.** After the web login,
  the app's token exchange once failed with “There was a problem when connecting to your account”.
  One “Try again” recovered it. Cost on the happy path: up to 12 s.

## D-048 — Prod OTP read from Outlook through Microsoft Graph (2026-10-09)

- **Problem:** prod login OTPs are mailed to the tester's Outlook from `noreply@bliblitiket.com`.
  Until now a person typed them into a dashboard popup.
- **QADriver can't do this itself:** it runs inside the simulator. The dashboard host fetches the
  code and types it the same way Keychain secrets are typed (D-044).
- **Ruled out:** New Outlook (16.85, `IsRunningNewOutlook = 1`) exposes no mail to AppleScript;
  `count messages of inbox` returns 0. Reverting to Legacy Outlook, or adding the account to
  Mail.app, would change the tester's own setup.
- **Chosen (user picked "Microsoft Graph"):** `lib/mail-otp.js`.
  - Device-code sign-in started from **Test logins → Email OTP → Link Outlook**. Scopes
    `openid profile offline_access Mail.Read` only, tenant `organizations`.
  - Client id: Microsoft's public Graph command-line client by default, overridable with
    `QA_GRAPH_CLIENT_ID` if IT issues a dedicated registration (needed if the tenant blocks user
    consent for `Mail.Read`).
  - The refresh token goes in the Keychain (`testforge.graph` / `mail`) and rotates on each
    refresh. The access token is held in memory only.
  - The reader asks for the 10 newest messages from 2 minutes before the OTP step onwards. It keeps
    the newest one from the sender (`QA_OTP_SENDER`), takes the first 6-digit number (subject
    first), and returns only that code. Subjects, bodies and addresses never leave the module, and
    the code is never logged.
- **Order for a `typeSecret … field: otp` step:** a stored OTP (UATB) → Outlook (polls 60 s) →
  popup. Any Graph error falls back to the popup, so a broken link never blocks a run. The run log
  says "(OTP read from Outlook)" or "(typed by a person)".
- **Routes:** `GET /api/mail-otp`, `POST|DELETE /api/mail-otp/link`. None of them returns a token
  or a code.
- **Tenant result (2026-10-09):** the gdn-commerce tenant requires admin consent. The sign-in ended
  in "Request sent — your admin has been notified" for Microsoft Graph Command Line Tools. Blocked
  until IT approves it, or issues a dedicated registration (`QA_GRAPH_CLIENT_ID`). Until then, prod
  OTPs come from the popup.
- **Prod round (2026-10-09), live:**
  - Switch → PROD PASS (onboarding came back = reset).
  - The Keychain-variant login stopped at the email (no `prod/internal` saved). The simulator already
    had an iOS saved password for `bliblitiket.com`, so a new routine was added: “Log in · saved iOS
    password · with OTP (prod)” (`mc_FBUF38V8MA`). It is the saved-password login plus a
    credential-free `typeSecret field: otp` step.
  - That `typeSecret` step with no `credential` skips the Keychain and goes Outlook → popup.
  - **PASS 200.2 s, logged in on prod.** Prod didn't ask for an OTP: the account is known across the
    Blibli Tiket apps, so the app showed “You can skip logging in”. The popup was answered “skip”, and
    the step waited 126 s for that answer.
  - OTP popups now offer **“It wasn't asked”** (skip), like manual popups' “It wasn't shown”.

## D-049 — Macros arm their own mocks; demo set; logout; label waits; Macros tab (2026-10-09)

- **New step kinds:**
  - **`mock {endpoint, variant | enabled:false}`** switches an existing NetworkLens rule's variant
    live, via `armMock` in `server.js`. If the live channel refuses, it quits the app and writes
    `session.json`, so the next relaunch picks the rule up.
  - **`setAppDefault {key, value}`** runs `simctl spawn defaults write`.
  - Why: an environment switch wipes `NetworkLensEnabled` together with the rest of the app's
    settings, and with NetworkLens off no mock is ever served.
- **Text-based waits and guards:**
  - `waitFor` / `waitForGone` on a label-only element, and `unless` guards, now send one OR-ed
    `waitForExists` (`anyOf`). This needs QADriverKit `qa-mocker-testing-5` (`7d5ec41`, pushed,
    pinned).
  - The earlier `getLabels`-based guard read every label off the live login web page. That raised
    "Failed to get matching snapshot" and ended the runner session.
- **Demo set** (`Engagement/FlashSale/macros/demo-0…5`), all PASS on 2026-10-09:
  - Demo 0: current environment → UAT B → NetworkLens back on → log in (161 s).
  - Demo 1: mocked schedule, Tomorrow tab (33 s).
  - Demo 2: products empty → "No products here yet" (31 s).
  - Demo 3: products 500 → also the empty state (32 s). Finding: there is no error or retry UI.
  - Demo 4: products 3 s slow → cards load (34 s).
  - Demo 5: products timeout → empty state (31 s).
  - Each demo arms its own mocks and resets products to "loaded" at the end.
- **Logout** (`Authentication/General/macros/log-out.json`): Account → `settingButton` →
  `LogoutButton` → `mainButton` index 1 (index 0 is Cancel). PASS in 46.5 s. Also signs out of the
  whole Blibli Tiket ecosystem, so the next login shows the full login page.
- **Prod no-OTP flow:** "Prod · switch environment + log in (no OTP)" PASS in 155 s through the full
  login page.
  - The registry's About Blibli element is pinned to type `button`: the seller-registration row's
    image also carries the identifier `aboutBlibli`.
  - The environment-switcher element falls back to the legacy UIKit About card ("Version …"), which
    is shown when logged out.
- **Known issue:** `lib/container.js` `isAppRunning` treats the XCUITest runner
  (`com.blibli.mobile.BlibliMobile-XCUITest.xctrunner`) as the app. File-based mock writes are
  therefore refused while the harness is up. It's a copied file: fix it upstream in
  `networklens-mcp`, then re-copy.
- **Macros tab** (`public/js/macros-tab.js`):
  - Scans the repo on every load and on Rescan; groups macros by module/submodule.
  - Search covers name, id, path, kind, description and step text. There is a kind filter.
  - Steps are shown in plain words, with ▶ Replay and the inline result per step.
  - A compact rail panel (`public/js/macros-panel.js`) shares the replay helper.

## D-050 — NetworkLens MCP fixes on a QA branch/tag; app pinned off floating master (2026-10-09)

- **Rule (user):** any NetworkLens / QADriverKit change needed for QA goes on a `darshan/innovation/qa-mocker-testing`
  branch with a `qa-mocker-testing-N` tag, and this POC pins those tags, so prod's packages (`master`) are
  never modified. Work happens in a git worktree: `~/Projects/Tools/NetworkInterceptor-qa`, made from the
  clone `~/Projects/Tools/NetworkInterceptor`.
- **Fix:** `isAppRunning` matched `UIKitApplication:<bundleId>` as a prefix, so the XCUITest runner
  (`com.blibli.mobile.BlibliMobile-XCUITest.xctrunner`) counted as the app. Every `session.json` write
  was refused while the harness was up. It is now `isListedInLaunchctl`, an exact match up to the job's
  `[` suffix.
  - NetworkInterceptor `280a4e1` (branched from the app's `37b98ee`), tag `qa-mocker-testing-1`, pushed.
- **App pin:** the project referenced NetworkInterceptor as `branch = master`. That floats: master is
  already at `d3dda93`. It is now `kind = revision` `280a4e1`, the tagged commit, in both `project.pbxproj`
  and `Package.resolved`. The Swift sources are identical to `37b98ee`; only the MCP's TypeScript
  changed. Packages are resolved, and the MCP server runs from that checkout.
- **Dashboard copies:**
  - `scripts/sync-networklens.sh <checkout>` builds the MCP and copies `session`, `variants`, `trace`,
    `container`, `redact`, `control` and `android` into `lib/`. `queue.js` becomes `control-queue.js`,
    with the import rewritten.
  - It also mirrors `tools/networklens-mcp/dist` and records `lib/NETWORKLENS_REVISION`.
  - This brought in the pinned revision's Android support (`android.js`). It is inert unless
    `NETWORKLENS_ANDROID_PACKAGE` is set.
- **Clearer refusal:** when the app is running but nothing collects the live edit, the dashboard now
  says NetworkLens is probably off (after an environment switch), not "quit the app".
  - `POST /api/networklens/enable` and the **Turn NetworkLens on** button (Mocking tab) write
    `NetworkLensEnabled = YES` and relaunch the app through the harness, falling back to `simctl`.
- **Verified:** a mock save that was refused before now succeeds live while the harness is up. 38/38 tests
  pass, including the new `test/container.test.js`.


## D-051 — One test at a time; preconditions applied automatically; no "Pick macro" (2026-10-09)

- **Context:** during a demo, a second Replay click showed both tests as running. Each button then read
  "the latest run", so it showed the wrong result. Later tests failed because the app was on PROD and
  logged in, while the tests assumed UAT B. The Test Cases tab asked people to "pick a macro", and its
  purpose wasn't clear.
- **One at a time:**
  - The server refuses (409) a new replay or run while any test is queued or running:
    `refuseWhileTesting` on `/api/macros/v2/:id/replay`, `/api/testcases/:id/run` and `/replay`.
  - Each Replay button follows its own job ID.
  - Every Replay button in the dashboard locks while a test is in flight, with a "▶ Running: …" banner.
- **Preconditions:**
  - A macro declares `requires: {environment, session, networkLens}`. Any `mock` step implies
    `networkLens`.
  - Before step 1, `lib/preconditions.js` reads the environment from the app's plist
    (`BM_AppEnvironmentStoredValue`) with no UI involved, and runs the switch routine only on a mismatch.
  - It turns `NetworkLensEnabled` back on and relaunches the app.
  - It probes the session (Open Home, then the Home "Login" button within 4 s) and runs Login or Log out
    only when needed. A switch implies logged out, so no probe runs after one.
  - A failed precondition makes the run **BLOCKED** with the reason. A test failure is reported
    separately.
  - Lines prefixed ⚙/✓ in the job show what was done.
- **Test Cases tab:** the macro is matched by its `links.testCase`, never picked by hand. The column shows
  its name plus chips for the setup that will be applied. Replay is disabled when no macro is linked;
  ▶ Run, through Claude, is still available.
- **Login with the sheet dismissed by an outside tap:** the login routines (UAT B and prod) now:
  1. wait for Home's Login to go away;
  2. if Home still shows Login, go once more through Login → system alert → "You can skip logging in"
     Continue;
  3. check Home again.

  This uses the new `onlyIf` guard, the inverse of `unless`.
- **Queue:** `POST /api/tasks/clear-finished` and a **Clear finished** button in the Queue tab. Run
  results stay in `runs.json`.
- **Verified on device (iPhone 12 Pro Max sim):**
  - SF-084 from PROD + logged in: switch to UAT B → login → case → PASS.
  - A second click during the run got a 409.
  - Demo 2: UAT B already set; NetworkLens turned on with a relaunch; logged in → PASS.

## D-052 — No test or macro starts on an incomplete setup (2026-10-09)

- **Context:** the PerformanceTest test bundle disappeared from DerivedData. Every replay then went
  BLOCKED at step 1 ("harness stopped answering and could not be restarted"). The page still offered
  Run/Replay, so people saw it as "not reachable".
- **Decision:**
  - `lib/readiness.js` checks, in order:
    1. a simulator is booted;
    2. the app is installed;
    3. the test bundle exists (`<project>-*/Build/Products/<QA_CONFIGURATION>-iphonesimulator/*-Runner.app`,
       the same lookup as `harness.py`), and no build is running;
    4. the harness answers a real screenshot command within 8 s.
  - `GET /api/readiness` serves the result from an 8 s cache. While a test is running, it returns the
    last result instead of probing.
  - The run/replay routes re-check freshly and refuse with **423** plus the failing checks.
  - The UI (`public/js/readiness.js`):
    - disables every ▶ Run, ⚡ Replay and Run selected button until everything is ready (not ready
      while unknown);
    - shows a banner on Test Cases and Macros listing what is missing;
    - offers fix buttons: Build test bundle (the existing confirmed build flow), Start harness
      (Ensure), Re-check.
  - The harness probe is skipped until the earlier checks pass, so a missing bundle never costs 8 s.
- **Why not auto-build:** the hard constraint stays: `build-for-testing` only runs on the dashboard's
  confirmed button or an explicit request.
- **Verified:**
  - With the bundle missing, `/api/readiness` reports `bundle ✗ (fix: build)`.
  - A replay POST gets 423 with the reason.
  - 45/45 tests pass.

## D-053 — P1 closure: QA simulator cloned from the developer's, branch lock, disk cleanup (2026-10-09)

- **QA simulator:**
  - Chosen by the user: clone the simulator people test with (`simctl clone`) as "QA · <name>".
  - The installed app, its data and the iOS saved passwords that the login macros use through
    AutoFill all come along. From then on, QA builds land only on the clone.
  - QA runs need it to be the **only** booted simulator. Every `simctl … booted` lookup (NetworkLens
    copies, defaults, deep links, preconditions) then means the QA simulator, with no edits to the
    copied NetworkLens libs.
  - Readiness shows the fixes **Create QA simulator**, **Boot QA simulator** and **Shut down the
    others**. Each is confirmed and runs as a job.
- **Branch-switch lock:** `POST /api/code/prepare` refuses (409) while a test or a build uses the
  copy.
- **Free disk space:**
  - Removes QA copies and DerivedData under `~/.testforge/` not used for 14 days, always keeping
    the loaded copy.
  - "Used" means the copy's last prepare (`state.checkouts[*].usedAt`), else the folder's mtime.
  - The Question 1 card shows the total and the button.
- **Verified:**
  - Clone created `QA · iPhone 12 Pro Max` (`AC2A1B55-…`) with the app installed and the
    environment still UAT B.
  - Readiness turned simulator ✓ and app ✓.
  - Free-space logic is unit-tested in a temp testforge.
- **P1 walkthrough:** still to do with a person.

## D-054 — P2: build the QA copy, build → code id, staleness blocks runs (2026-10-09)

- **Repo profile (`lib/qa-build.js`):**
  - The workspace is found in the QA copy, two levels deep.
  - Scheme, configuration and UI-test target come from the dashboard's settings and are saved per
    repo in `~/.testforge/profiles.json` (`POST /api/build/profile`).
- **Build:**
  - `POST /api/build/qa` is only sent by the confirmed **Build the app** button (hard constraint
    kept).
  - It runs `build-for-testing` in the QA copy, with `-derivedDataPath ~/.testforge/derived/<copy>`,
    for the QA simulator.
  - Each build is recorded in `~/.testforge/builds.json`: id, code id (SHA or snapshot id),
    profile, simulator, duration and first error.
  - After a successful build, the harness is stopped so the next Ensure starts from the new build.
- **Staleness:**
  - Readiness "App + tests built" is ✓ only when the newest successful build's code id equals the
    prepared code's id and its runner still exists.
  - Stale or missing builds block runs with **Build the app**.
  - **Test the installed app anyway…** needs a reason, holds for that code id only, and stamps runs
    `UNVERIFIED BUILD`.
  - With nothing prepared in Question 1, the developer's own build is accepted as before and marked
    unlinked.
- **Harness:**
  - `harness.py` (plugin working tree, not committed) gains optional `QA_DERIVED_DATA` and
    `QA_SIMULATOR_UDID`.
  - The dashboard passes them, plus `QA_PROJECT_DIR` set to the copy, through `setHarnessTarget`.
  - The user chose this over a second, dashboard-owned runner lifecycle.
- **Traceability:** every run record carries `build` (code id, build id, built-from, unverified,
  override reason).
- **Verified:**
  - The profile was auto-detected for the local snapshot copy.
  - Readiness reports `28f5c17+7a71 isn't built yet`.
  - 50/50 tests pass.
- **Not yet verified:** the first real QA-copy build and a run from it, which needs the confirmed
  click.

## D-055 — P3: the full readiness checklist (2026-10-11)

- **Checklist (workflow-plan §⑤), in `lib/readiness.js`.** Each check carries a `level`:
  - `block` stops a run;
  - `warn` only informs.

  Each also carries a `scope`: `claude` checks gate only ▶ Run (a Claude session), never a macro
  replay.

  | Check | Level | Fix |
  |---|---|---|
  | Code prepared | warn | Prepare. Flags nothing prepared, local drift, or older than 24 h. A warning, not a block: results stay valid for the snapshot (D-034). |
  | QA simulator | block | Create / Boot / Shut down the others |
  | App installed | block | — |
  | App + tests built | block | Build. With an override it is ✓ and stamped UNVERIFIED. |
  | App installed from this build | block | Restart harness. Compares the Mach-O UUIDs (`dwarfdump --uuid`) of the installed executable and the built one. |
  | Disk ≥ 10 GB on the testforge volume | block | Free disk space |
  | Harness answering | block | Start harness |
  | NetworkLens live control | warn | — (macros turn it on through preconditions) |
  | Simulator free | warn | Open Queue (a held device means wait, not stop) |
  | Claude signed in + qa-driver plugin | block, scope `claude` | How to fix |

- Atlassian is not checked up front: Confluence is read through Claude when the doc loads, and the
  load reports its own failure.
- **Gate:**
  - `/api/readiness` returns `ready` and `readyForClaude`.
  - The macro replay and test-case replay routes need `ready`; `/api/testcases/:id/run` needs
    `readyForClaude`.
  - In the UI, ⚡ Replay follows `isSetupReady()`; ▶ Run and Run selected follow `isClaudeReady()`.
- **UI:**
  - The banner is always visible: "✓ Setup ready · N note(s)", "✗ Setup isn't ready", or
    "⚠ UNVERIFIED BUILD".
  - It lists failing checks and offers their fixes, plus **Checklist (N)** to show every check with
    ✓ / ⚠ / ✗, and **Re-check**.
- **Verified live (2026-10-11):**
  - All ten checks ✓ on `QA · iPhone 12 Pro Max`. The harness ran `test-without-building
    -derivedDataPath ~/.testforge/derived/BlibliIOSApp-POC-local` on the QA simulator, and the
    installed app matched build `28f5c17+7a71`, so **P2's first real build is verified**.
  - The SF-084 run record carries `build {codeId 28f5c17+7a71, buildId 724d6868…, isUnverified false}`.
  - 51/51 tests pass.
- **Finding:** the replay was BLOCKED at the login precondition with "no alert button titled
  'Continue'", although the alert was on screen. The QA snapshot (8 Oct) pins Blibli-Utility
  `qa-mocker-testing-2`, which predates the SpringBoard `alertTap` fallback; the repo now pins `-5`.
  The checklist already showed it: ⚠ "Code prepared — your working copy changed since (now
  f79366a+bd71)".
  - **Fix:** re-prepare the snapshot in Question 1, then **Build the app**.

## D-056 — QA build failure: Package.resolved still floated NetworkInterceptor on master (2026-10-11)

- **Symptom:** the QA-copy build of `f79366a+504d` failed in `NetworkLensUI` with "cannot find
  'JSONBodyEditor' / 'BodySearch' … in scope". The recorded first error only read "xcodebuild
  exited 65".
- **Cause:**
  - `project.pbxproj` pinned NetworkInterceptor to revision `280a4e1` (D-050), but the committed
    `Package.resolved` still said `branch: master @ d3dda93`, so the build resolved to master.
  - Xcode's cached package build description in the QA DerivedData predated master's new files, so
    those files were never compiled.
  - The note in D-050 that Package.resolved was pinned too was wrong.
- **Fix:**
  - `Package.resolved` now pins `{revision: 280a4e1…}` with no branch.
  - The QA DerivedData's `SourcePackages` and `XCBuildData` were cleared (inside `~/.testforge`
    only).
  - The snapshot was re-prepared (`ec16344+ac99`) and rebuilt.
- **Dashboard fix:** `buildQaCopy` collects error lines while xcodebuild streams them, not from a
  400-line tail. Each build record carries `firstError` plus up to 10 distinct `errors`.

## D-057 — Macros for the login "problem connecting to your account" sheet (2026-10-11)

- **Context:**
  - With UAT's account service down, Login → sign-in alert → **"There was a problem when connecting
    to your account"** offers **Try again** and **Continue as guest**.
  - The login routines only handled that sheet near their end, so they blocked on the next login-page
    step and gave no clear reason.
- **New elements:**
  - `el_LR6KURV7S7`: the sheet title. Label-only; the exact text, else BEGINSWITH "There was a
    problem".
  - `el_LR6KURWMAR`: "Continue as guest". English only; the Bahasa label isn't known yet.
- **New macros in `Authentication/General/macros/`:**
  - `mc_LR6KUR4AP6` **Login error sheet · Try again** (routine):
    - only acts if the sheet is showing (`onlyIf`);
    - taps Try again, then the sign-in alert again;
    - then waits for the sheet to go. A sheet that is still there means the service is still failing,
      so the step fails with "still there".
  - `mc_LR6KURXYR9` **Login error sheet · Continue as guest** (routine): only acts if the sheet is
    showing; afterwards checks Home is back, logged out.
  - `mc_LR6KURC8CF` **Login fails · error sheet offers Try again and Continue as guest** (flow,
    `requires` uatb + loggedOut): Login → alert → the sheet title and both buttons → screenshot →
    Continue as guest.
- **Login routines:** both (UAT B and prod/OTP) now run the Try-again routine right after the first
  sign-in alert.
- **Verified live during the UAT outage:**
  - The flow PASSES in 29.1 s.
  - The login routine FAILS clearly at "sheet title … still there after 8 s", not at an unrelated
    login-page step.
- **Open:**
  - The flow needs a real outage. A NetworkLens mock of the auth call would make it repeatable; the
    endpoint isn't identified yet.
  - A failed login run lists the unrelated Flash Sale mocks as "may explain this failure". The
    interceptor note should only name mocks the failed macro touched.

## D-058 — Mocked auth failure, Flash Sale revamp forced on for PROD, macro `cleanup`, `retime` (2026-10-12)

- **Trigger (user):** UAT B down and the revamp not enabled on PROD — "Finish 1 & 2 first": make
  the login error sheet repeatable with a mock, and run the Flash Sale cases on PROD with the revamp
  mocked on. Later: "uatb is back online. But if prod works we can continue with same."
- **Mocked auth failure** — flow `mc_MPVN5016NR` (`login-fails-mocked-auth-error-sheet.json`):
  - NetworkLens rule `POST /gdn-oauth/token` (host-less, so it matches every environment); the flow
    arms variant `500`.
  - Runs on **PROD**. The token call only happens after the account web page signs in, so the flow
    goes through the web sign-in. On UAT B the sign-in was remembered, but UAT B was down.
  - The web sign-in part of `mc_F5BUCDH5ET` moved into its own routine `mc_MQBTF5GGFA`; the login
    routine runs it, same steps.
  - **Verified:** PASS 93 s; trace shows `POST account.blibli.com/gdn-oauth/token → 500` from the mock.
- **Revamp on PROD:**
  - PROD's `mobile.apps.config` has `flashSale2026Revamp.iOS = {minVersion: "114.8.0", isInternal:
    true}`, so app 14.9.0 never gets it.
  - Rule `GET /backend/configs` with `match.query {only: ios.mobile.homev3}`. NetworkLens compares the
    *first* `only` item, which is the home-page batch. Variants `revamp-on` / `revamp-off`: PROD's
    captured batch with only that entry changed.
  - Routine `mc_MR92KFNMPS` arms `revamp-on`. Demos 1–5 and SF-084 now require `prod`, run it first,
    turn it off in `cleanup`, and scroll to Flash Sale "Show all" (below the fold on PROD's Home).
  - The flag is stored by the app, but PROD's config carries the key, so the next unmocked launch
    overwrites it. No leak.
  - **Verified:** Demo 1 (with SF-084) and Demos 2–5 all PASS on PROD, 40–44 s each.
- **Macro `cleanup`:** steps that run whatever the verdict. Without it a failed run leaves the
  failing-auth or forced-config mock armed for every later run.
- **`retime` on mock steps:** the schedule mock captured on 10-09 had absolute times, so by 10-12
  there was no Tomorrow tab. Moving all timestamps by one offset keeps today/tomorrow as captured.
- **Preconditions read the live setting:**
  - `readAppDefault` used the preferences plist file, which still said UAT B minutes after a
    `defaults write`. That sent the replay into a switch it didn't need.
  - It now asks cfprefsd (`simctl spawn … defaults read`).
- **Recovering a stuck simulator:**
  - With UAT B down, an environment switch to UAT B leaves Home as a skeleton, and the switcher can't
    be reached.
  - Writing `BM_AppEnvironmentStoredValue` alone isn't enough: `resetApp` also clears tokens and
    caches.
  - What worked: reinstall the app from the QA build. The saved passwords live in the simulator
    keychain and survive.
  - The reinstall also wipes NetworkLens rules (they live in the app container). They were restored
    from the original simulator; backups are in `~/.testforge/mock-backup/`.
- **Open:**
  - Keep the rules the macros rely on in the repo (a mock pack) and import missing ones before a
    replay. Today they exist only in the app container.
  - The failure note still lists unrelated armed mocks.

## D-059 — Failure notes name only mocks that answered the run; forced taps; #106 verified (2026-10-12)

- **Trigger (user):** "proceed to #106 and Failure notes".
- **Failure notes (`lib/lens-check.js`):**
  - The note used to list every armed rule. A failed login then blamed the Flash Sale mocks.
  - Now the replay reads the NetworkLens trace from the run's start. The trace marks each exchange
    `isMockServed` with its `endpointKey`, so the note lists only mocks that **answered a request
    during the run**.
  - Each listed mock says whether this test set it up (from its `mock` steps, routines and cleanup)
    or whether it was "left on from elsewhere".
  - Armed rules that nothing called get one "can't explain it" line.
  - When nothing was served, the note says NetworkLens didn't cause the failure, and the run isn't
    flagged ⚠.
  - Without a trace it falls back to the old "armed now" list.
  - Known gap: only `trace.ndjson` is read, not the rotated `trace.1.ndjson`.
  - **Verified:** a deliberately failing macro, with the Flash Sale mocks armed, reported "armed but
    not called … no mocked response during this run". Against today's trace, `mockServedSince`
    counted the demos' flashsale 3, products 5 and configs 2.
- **Forced tap (`tap {force: true}`):**
  - Taps the element's coordinate whatever covers it; the runner records `forced`.
  - `checkGesture` accepts `hittable: false` when `forced`.
  - This is how a macro taps outside a sheet: on the dimmed area over a known element.
- **#106 — skip-login sheet dismissed by a tap outside:**
  - The finish of the login routine moved into routine `mc_MSFK2HNFM1`; `mc_F5BUCDH5ET` runs it,
    same steps.
  - Flow `mc_MSFL3T25BT`:
    1. log out;
    2. web sign-in;
    3. wait for "You can skip logging in";
    4. forced tap on the Home search button behind the dim;
    5. the sheet goes;
    6. run the finish routine.
  - **Verified on PROD:** PASS 140 s.
  - The screenshots show Home (not Search) right after the tap, then Home logged in.
  - Finding: on PROD the login completes even when the sheet is dismissed outside, so the recovery
    branch (`st_13r1–3`) was skipped. It stays as a guard.
  - The optional Continue wait (25 s) is the slow part when the sheet is already gone.

## D-060 — The skip-login sheet's two options each get a test (2026-10-12)

- **Trigger (user):** "we can also tap continue button on that sheet instead of tapping outside."
- "You can skip logging in" has two ways out, so there are two sibling flows:
  - `mc_MT0JR95CYS` "Skip-login sheet · tap Continue → logged in";
  - `mc_MSFL3T25BT`, renamed "Skip-login sheet · tap outside it → still logged in".
- The login routine keeps Continue as its normal path; the outside-tap branch stays as the guard.
- **Verified on PROD:** Continue PASS 75.8 s; outside tap PASS 140 s (D-059).

## D-061 — P4: the Run step — server-side batch, live view, pause/skip, crash handling (2026-10-12)

- **Trigger (user):** "proceed to P4".
- **User choices:**
  - **Batch mode:** "Macro if linked, else Claude". Each selected case replays its linked macro (free,
    about 40 s); the rest run as Claude `/qa-run`.
  - **Approval default:** "Unattended when allowed". With `QA_ALLOW_AUTONOMOUS_CLAUDE=1` the batch
    defaults to *Don't ask — run unattended*; *Ask me before anything unusual* is offered and
    remembered per browser. Without the variable, runs always ask.
- **Server-side batch (`lib/run-batch.js`, `/api/batch*`):**
  - "Run selected" no longer queues in the browser. The batch runs its cases one at a time through
    the existing device-lane tasks and survives a page reload.
  - Controls:
    - **Pause** finishes the current case, then holds;
    - **Continue** resumes;
    - **Skip case** cancels the current case (verdict SKIPPED) and moves on;
    - **Cancel run** stops it and drops the rest.
  - While a batch is active, single Run / Replay / macro requests answer 409.
  - Single ▶ Run and ⚡ Replay per case are unchanged.
- **Live view (`public/js/batch.js`):**
  - each case with its mode (⚡ macro / ▶ Claude), verdict and duration, plus a link to the Claude
    session;
  - the current step: the last step line of the case's output;
  - what the simulator shows now: `GET /api/simulator/screen.png`, one `simctl io screenshot` at
    most every 2 s, shared by every viewer, never through the runner;
  - a link to the latest evidence screenshot;
  - the case's output streamed into Run output.
  - On reload the panel re-attaches. The old job re-attach skips batch jobs, which would otherwise
    print every line twice; it also showed "Replay undefined" for macro jobs, now fixed.
- **Crash handling (`lib/crash-report.js`):**
  - After every case, whatever the verdict, the newest `.ips` report for `com.blibli.mobile` written
    during the case is read. A replay that loses the app restarts and may still PASS.
  - A crash makes the verdict **BLOCKED (app crashed)**; `verdictBeforeCrash` is kept and the report
    is attached (exception, top frames, path).
  - The batch then holds; **↻ Relaunch & continue** relaunches the app and goes on.
  - **Not verified live:** SIGSEGV / SIGABRT sent from outside never killed the app (its crash
    handler takes them; runningboardd showed only the replay's own SIGKILL relaunches), and no
    `.ips` was written. Covered by unit tests with a real-format report. Verify on the first real
    crash.
- **Verified live (PROD, SF-084 replays):**
  - pause → hold → continue;
  - skip;
  - natural finish;
  - UI Pause ("Pausing after SF-084") and Continue through headless Chrome;
  - live simulator screen and current step rendered.
- **Not exercised:** a Claude-mode case inside a batch (uses credits). The path reuses the existing
  `qa-run` task with the new `approval` payload.

## D-062 — P5: results review, re-run failed → FLAKY, report (2026-10-12)

- **Trigger (user):** "proceed to P5".
- **Results store (`lib/results.js`, `.data/results.json`, last 50 runs):**
  - Every batch run is kept with a **manifest** of what it tested: branch, code id, build, UNVERIFIED
    flag and override reason, QA simulator, app environment, approval policy.
  - Each case keeps **evidence**, collected after it finishes:
    - screenshots and recordings written during it (the harness's own probe screenshots excluded);
    - the mocks that answered during it (trace `isMockServed`);
    - the driver steps;
    - a summary: Claude's last words, or a replay's failing step and verdict;
    - its cost.
  - A run that was going when the dashboard stopped is restored as *interrupted*.
- **Review:**
  - Each case gets **✓ Accept**, **✎ Override** (to PASS or FAIL, with a reason of at least a few
    words) or **↻ Needs re-run**.
  - The run is **Validated** when every case is accepted or overridden.
  - The final verdict: the override wins; a failure that passes on its re-run is **FLAKY**; otherwise
    the run's own verdict.
- **Re-run failed:**
  - Starts a new batch, linked by `rerunOf`, with the cases that didn't pass and weren't re-run yet,
    plus those marked Needs re-run.
  - Each re-run verdict is recorded on the original case, and the Needs re-run mark is cleared so the
    case is reviewed again.
- **Report:**
  - `GET /api/results/:id/report.md` downloads Markdown: status, manifest, a per-case table (ran as /
    run verdict → re-run / final / review / time / evidence), and per-case details (crash, mocked
    responses, evidence file names, summary).
  - Only file names appear, never local paths: a path means nothing on Confluence and carries the
    Mac's user name.
- **Publish:**
  - `POST /api/results/:id/publish` queues a Claude task that creates **one new child page under the
    personal page 2437316839**. It must never touch 2396520535.
  - The session asks before it writes; nothing is published without that approval.
- **Verified live (PROD, SF-084):**
  - a run stored with manifest and evidence (31 steps; mocks configs ×3, flashsale ×1, products ×6;
    summary showing the runner wedge and the automatic restart, "PASS after a harness restart");
  - in headless Chrome: Accept → "✅ Validated"; the case detail shows outcome, mocked responses,
    steps and images;
  - Needs re-run → Re-run failed → a linked re-run whose PASS was recorded on the original case, with
    the review cleared;
  - the report download.
- **Not exercised live:**
  - FLAKY (needs a genuine fail followed by a pass; unit-tested);
  - Publish (an outward-facing write; waits for the user's go-ahead).

## D-063 — FLAKY verified live; a failing case gets an end-of-run screenshot (2026-10-12)

- **Trigger (user):** "check FLAky , do not publish anything yet".
- **FLAKY, verified live (PROD, SF-084):**
  - flashsale schedule mock (rule `F000A08B…`) switched to its `empty` variant → run `c64dd9c2`
    **FAIL** ("Flash Sale tab row didn't appear");
  - mock switched back to `loaded` → Re-run failed `8865b3b1` **PASS**;
  - the original case's final verdict is **FLAKY**: the report row reads "FAIL → re-run PASS |
    **FLAKY**", the Results card "⏳ 0 of 1 reviewed · 1 FLAKY".
- **Gap found:** the failing case had no screenshot. A replay stops at the failing step, before its
  own screenshot step, so the reviewer saw only the failure text.
- **Change:** when a case finishes (`status: done`) without passing, `collectEvidence` first saves
  what the simulator shows (`simctl io booted screenshot`) into `$QA_MEDIA_ROOT/failures/`, so it is
  picked up as that case's evidence. Skipped and cancelled cases get none.
- **Still not done, by the user's choice:** Publish. Nothing was published to Confluence.

## D-064 — P6 redefined: driver first, Claude only on an issue; one macro per id; one app session (2026-10-12)

- **Trigger (user):** "proceed to P6", with this intent: Claude is needed for a case's *first*
  successful run only. After that, the instructions and macros live in the repo, so anyone reuses
  them without rebuilding accessibility chains. What is already built runs on the driver alone;
  Claude steps in only when something goes wrong.
- **User decisions (AskUserQuestion):**
  - Replay fails → Claude may **diagnose + repair, then re-run**.
  - First Claude PASS → **save a macro, prove it by replay**.
  - "Setup" means **macro identity**, not saved run configurations: one macro = one id = one file
    in one place; other modules refer to it by id, never by copy.
  - Cases share **one app session**: no quit/relaunch per case. The user noticed unneeded relaunches
    in the login/logout macros; review and remove them.
- **Saved setups and Home "Run again"** (the old P6 in workflow-plan §5) are **not built**. They are
  replaced by repo-stored macros, references and mock packs. Re-running = load the doc → Run
  selected; linked cases replay on the driver.

### One app session across cases (relaunch only when needed)

- **Cause of the relaunches:** routine "Open Home (skip onboarding if shown)" (`mc_EAH97EMYH5`)
  always started with `relaunch`. Almost every macro calls it: login and logout routines, the
  environment switcher, SF-084, demos 2–5, the login flows.
- **New Open Home:**
  1. tap the shared nav bar Back (`CommonNavBar_BackButton`, new element) up to 3 times;
  2. tap the Home tab;
  3. `relaunch` with `ifNeeded`;
  4. onboarding as before;
  5. `scrollToTop` (new step) to the top marker `HomeCarouselBanner_0` (new element).

  Every step is guarded by `unless: Home search button`. Home stays scrolled where the last case
  left it, and lazy sections below the fold (Flash Sale "Show all") don't exist until scrolled
  near. That is why demo 2 failed once without the scroll.
- **Launch-time inputs** (`lib/macro-v2.js`):
  - The tracker records what is armed (`mock` steps marked `atLaunch`, and `setAppDefault` /
    `clearAppDefault`) and what the app last launched with.
  - `relaunch {ifNeeded}` relaunches only when an input **the current replay set** differs from
    launch, or when its `unless` element isn't showing.
  - What an earlier case left armed (its cleanup) doesn't force a relaunch. A case that needs the
    real value sets it itself (`mock … enabled:false, atLaunch`).
  - The precondition probe ignores launch inputs. Without that, a probe relaunched with the config
    mock off and the case relaunched again with it on.
  - The home-config mock (`GET /backend/configs`) is `atLaunch` in the revamp routine, SF-084 and
    demos 1–5.
  - `GET /api/launch-inputs` shows the state.
- **Verified live (PROD):**
  - SF-084 → Demo 2 → Demo 4: **0 relaunches**. Times went 47 → 18 s, 67 → 21 s and 42 → 25 s, all
    PASS.
  - Fresh dashboard, Log out → Skip-login Continue → Demo 2 → SF-084: 1 relaunch (Demo 2, the first
    to set the config mock), all PASS.
  - Log out and the login flows no longer relaunch.
- **Screenshots:** a screenshot step the runner doesn't answer is taken by the host (`simctl`),
  instead of restarting the harness and replaying the whole macro. Seen live: the mocked-auth flow
  hung on its last screenshot, and the restart then re-ran a non-idempotent login.
- **Guards with several elements:** `unless` / `onlyIf` take an array (any one showing counts).
  Label elements of one type go out as one OR-ed probe; otherwise they are probed one by one.
  - The web sign-in routine now also skips its login-page steps when the login error sheet is up:
    iOS remembered the web session and went straight back to the app.
  - Mocked-auth flow PASS in 52 s.

### One macro per id; references; N test cases

- A macro is one file in the module that owns it, identified by its `mc_` id.
- Another module reuses it with a reference file `<slug>.ref.json`: `{schemaVersion: 2, ref:
  "mc_…", name, links}`. It points by id, so renaming or moving the macro never breaks it. A real
  filesystem symlink would.
- `links.testCases: []` (plus the old `links.testCase`) on the macro or on any reference.
  `caseLinks()` collects them, and batch planning uses them.
- `listMacrosV2` returns each macro with `aliases` (its references); references are not listed as
  macros. `findMacroV2` also resolves an alias name. `saveMacroRef()` writes a reference.
- `lintMacros()` / `GET /api/macros/lint` reports, shown on the Macros tab:
  - errors: one id defined in two files, a reference to a missing id, an unreadable file;
  - warnings: two macros with identical steps, one case linked to two macros.

  Today: 30 macros, 0 problems.

### Mock pack in the repo

- `lib/mock-pack.js` writes each NetworkLens rule a macro uses to
  `<UITestRoot>/QAMacros/mocks/<endpoint-slug>.networklens-pack.json`.
  - Same format as `lens_export_pack`, so the overlay and `lens_import_pack` read it.
  - Redacted (`lib/redact.js`), and exported with `isEnabled: false`.
- A `mock` step takes the device's rule when it has the variant; otherwise it imports the rule from
  the pack (live, keeping the device rule's id).
- `GET /api/mocks/pack` shows needed / in repo / on device. `POST /api/mocks/pack` saves them.
- Four packs written:
  - configs (780 KB: two copies of PROD's home config; scanned, only public config and the support
    email);
  - flashsale;
  - products;
  - oauth token.
- **Verified:** the auth rule was removed from the device live, then the mocked-auth flow
  re-imported it from the repo and the 500 was served.

### Claude only on an issue (batch follow-up, `lib/agent-turns.js`)

- `RunBatch` gained a `followUp` stage after the crash check. It can attach its own jobs (live view
  phase, skip/cancel still work) and replace the verdict.
- **A replay that didn't pass → triage.**
  - Claude gets the case, verdict, macro and registry paths, the replay log tail and a host
    screenshot.
  - It inspects the live screen and ends with `TRIAGE: APP_BUG | MACRO_BROKEN | ENVIRONMENT — why`.
  - It may edit only macro files and `QAMacros/elements.json`, and must never weaken a check.
  - `MACRO_BROKEN` with changed files → the driver replays at once. That verdict counts, flagged
    `repaired` with `verdictBeforeRepair` and the changed files, for review before committing.
  - `ENVIRONMENT` → `BLOCKED (environment: …)`. `APP_BUG` → the FAIL stands, with Claude's reason.
- **A case Claude passed → save it as a macro.**
  - The **same session** (it knows every step it took) gets a second turn: write a v2 macro linked
    to the case (`links.testCases`), reuse routines and registry elements, add new elements, end
    with `MACRO: mc_…`.
  - The driver replays it once. Only a PASS keeps it; a new file whose replay fails is deleted.
  - Fields that listing adds (`path`, `aliases`) are stripped from the saved file.
- Cost: the case's evidence sums the first run, triage and learn turns.
- **Verified live (PROD, unattended):**
  - **Repair:** the registry identifier of the Flash Sale tab row was renamed on purpose
    (`FS_Shared_TabRowContainer` → `…Holder`). Run `f405ed7b`: driver FAIL → Claude `MACRO_BROKEN` →
    fixed `elements.json` only (identical to the backup) → driver replay PASS, 251 s in all.
  - **Learn:** new case HM-901, "Home search bar opens the search page" (a scratch doc). Run
    `a0cf8ccf`: Claude run PASS → it saved `PLP/autocomplete/macros/hm-901-….json` (reusing Open
    Home; 4 new elements) → driver replay PASS. $1.50 in all ($0.65 run + $0.85 save).
  - **The next run of HM-901 was planned as replay:** driver only, PASS in 24 s, $0.
- **Open:**
  - triage after a BLOCKED precondition is allowed but not exercised;
  - HM-901 is a demo case id, not from a real test doc (keep or delete the macro);
  - the Results "Cost" column shows "free" for a repaired replay recorded before the cost fix.

## D-065 — develop synced; NetworkInterceptor QA fix moved onto 1.0.0 (2026-10-12)

- **Trigger (user):** "Sync current branch with develop", then "yes rebase QA commit onto 1.0.0 and
  re-pin".
- **develop merge** (`2cdf89f90`, 68 commits):
  - Blibli-Utility stays on `qa-mocker-testing-5`; Assets 14.9.10 comes from develop.
  - Build number 149002 comes from develop.
  - The old `BlibliMobile-iOSUITests` target stays removed.
  - The local `.claude/settings.json` was stashed and restored, still uncommitted.
- **NetworkInterceptor:**
  - develop pins version 1.0.0 (`d3dda93`, upToNextMajor). The QA revision `280a4e1` sat on the
    older master `37b98ee` and lacked 1.0.0's overlay work (body search, scenario builder, mock
    sections).
  - The one QA commit (the launchctl exact match in `container.ts`) was rebased onto 1.0.0. Its
    conflict was with upstream's multi-device container lookup; both are kept.
  - The result `0bfd92e` is tagged `qa-mocker-testing-2`.
  - The repository's rules refuse force-pushes. So the QA branch got a merge commit `202673a` whose
    tree equals `0bfd92e`. The branch now holds `-1` and `-2`, and nothing was force-pushed.
  - The app pins revision `0bfd92e` (pbxproj `kind = revision` + both `Package.resolved`).
  - The networklens-mcp copies were re-synced (`lib/NETWORKLENS_REVISION` → `202673a`, the same
    tree): `container.js` (multi-device container lookup) and `variants.js`.
- **Verified:** 78/78 tests; the dashboard reads the simulator's rules and pack state.
- **Not done:** the QA build (the app with NetworkLens 1.0.0) is not rebuilt — that is only done on
  an explicit request. SPM must re-resolve (`sh SwiftPackages.sh reset && sh SwiftPackages.sh
  download`).

## D-066 — P7 hardening: a frozen runner heals itself; the networklens MCP finds the QA build (2026-10-12)

- **Trigger (user):** after the dry run, "Commit and Proceed to next phases". All four proposed
  phases were picked: P7 hardening, rebuild on the new pin, P8 macro coverage, P9 saved setups.
- **Frozen runner (seen in the dry run):** the runner stopped collecting commands after 11 replays.
  Before, the readiness gate refused every test until someone pressed Ensure.
  - Now, when the setup is otherwise good and only the probe fails, the `harness` check is a
    **warning** with `selfHeals: true`. Run stays enabled.
  - The gate (`refuseUnlessReady`) marks a heal as due. The device lane (`replay-v2`, legacy
    `replay`, `qa-run`) runs `harness.py ensure` before the test's first step and says so in the run
    log ("↻ the runner wasn't answering — restarting it before the test").
  - It waits out an Ensure someone already started (`harnessAction`). If the restart fails, the case
    is BLOCKED with the reason.
  - When the probe can't run because something else blocks (no build, no simulator), `harness`
    stays a blocker, as before.
  - Run, replay, batch and re-run requests now wait up to 45 s on the client, since the gate's fresh
    probe can take 25 s on a frozen runner (they used to time out at 15 s or 30 s).
- **networklens MCP (`.mcp.json`):** `scripts/networklens/resolve-checkout.sh` found no checkout on
  a Mac that only builds through the dashboard. It now also looks at the TestForge's DerivedData
  (`~/.testforge/derived/*`, matched by the QA copy's workspace path for this repo; the newest
  build wins), after the Xcode folder and before the sibling clone.
- **QA build after a re-pin (found while rebuilding on `0bfd92e`):**
  - xcodebuild kept the cached NetworkInterceptor checkout (`280a4e1`), wrote it back into the QA
    copy's `Package.resolved`, and failed on files the new revision added. Before a build,
    `stalePackageCheckouts()` now compares the DerivedData `workspace-state.json` with the
    workspace's `Package.resolved`. On a mismatch it drops the checkouts so the pinned revision is
    checked out.
  - SwiftPM leaves checkouts and artifacts read-only, so a plain `rm -rf` stops half way and leaves
    a broken cache (`HEAD.lock`, `failed extracting …zip`, `fatalError`, an `.artifactbundle` with no
    `info.json`). Cache removal now runs `chmod -R u+w` first. A build that fails with one of these
    errors clears `checkouts`/`artifacts`/`workspace-state.json` and builds once more.
  - The runner's own `xcodebuild test-without-building` shares the DerivedData, so building under it
    raced the package cache. A QA build now stops the runner before it starts, not only after.
- **Verified:** with the runner stopped, Open Home replayed → the lane restarted the runner → PASS.
  The MCP launcher answers `initialize`. The stale-checkout check has a unit test.

## D-067 — P9: saved setups and Home "▶ Run again" (2026-10-12)

- **Trigger (user):** picked "Saved setups + Run again" among the next phases. This is the deferred
  §5 item. It is separate from D-064's macro identity, which stays as it is.
- **What a setup is:** a name, plus the code (repo + GitHub branch, or the local folder), the test
  document, the ticked cases, the approval policy and the optional tech doc. It is stored in
  `.data/setups.json`. Saving under an existing name (ignoring case) replaces that setup and keeps
  its id.
- **Save:** Test Cases → tick cases → **💾 Save as setup…**. The server takes the code and the
  document from what is prepared and loaded now (`POST /api/setups`), and refuses cases that aren't
  in the loaded document.
- **▶ Run again** (`POST /api/setups/:id/run`): one job whose lines Home shows. The steps:
  - **Code:** prepare it when the repo or source differs, or the local folder drifted. A GitHub
    branch is always re-fetched, since a setup means the latest of that branch.
  - **Document:** reload it when another one is loaded. A Confluence page is read through Claude
    when there's no token.
  - **Cases:** the cases still in the document are run; the gone ones are listed.
  - **Gate and batch:** the readiness gate runs, then the batch, as **Run selected** would.
- It never builds (hard constraint). When the code moved past the build, it stops and says to press
  **Build**.
- **Home** gets a "Saved setups" card. Each row shows the code, the document, the case count and the
  last run (its counts and how many cases are reviewed, from the results store), with **▶ Run
  again** and 🗑.
- `startPrepare()` was pulled out of the prepare route so the button and Run again share it, and
  `startGate()` is the readiness gate without an HTTP response.
- **Found while verifying:** a `fresh` readiness request joined a check already in flight. The page
  polls every 5–15 s, so that check could predate the prepare that Run again had just done, and the
  gate saw the old code and let a stale build through. A fresh request now waits out the check in
  flight and runs a new one (unit test).
- **Verified:** "Home smoke (HM-901)" (local folder, file document) was run three times:
  - Run again → prepare → reload → batch → HM-901 PASS (156 s, including the login precondition).
    The Home card showed the last run.
  - After a dashboard edit, Run again re-prepared and **stopped** with "press Build".
  - The save validation refuses a case that isn't loaded. Headless page: the card and the button
    render with no JS errors.

## D-068 — Claude runs drive the QA simulator; a run without a verdict is UNDECIDED (2026-10-12)

- **Found** when the user ran SF-060 and SF-001 through Claude from the page during this session.
  `/qa-run` stopped in its preflight, for three reasons:
  - The qa-driver plugin targeted the developer's own simulator (`717BB0C8`, shut down), not the
    QA simulator. The cause: the local `.claude/settings.json` sets `QA_DEVICE_UDID`, and
    dashboard sessions load local settings, whose `env` outranks the process env.
  - The project's networklens MCP couldn't start (fixed in D-066).
  - The plugin's own mock-proof gate failed closed.
- **Fix:** `qa-run` sessions get `env` from `qaSessionEnv()`: the QA simulator (`QA_DEVICE_UDID` +
  `QA_SIMULATOR_UDID`) and the QA build (`QA_PROJECT_DIR`, `QA_DERIVED_DATA`, scheme,
  configuration). `ClaudeSession` passes it as the process env **and** as flag `settings.env`,
  which outrank every settings file. The developer's settings file is not touched.
- A `/qa-run` that ends with no `VERDICT` line was recorded with no verdict. It is now **UNDECIDED**,
  so the results review asks a person.

## D-069 — A build stays current when only `tools/` changed (2026-10-12)

- **Problem:** the local snapshot id hashes the whole working copy, so every dashboard edit (and
  every commit) made the QA build "stale". Each rebuild takes 16 min, and Run again and every test
  were blocked meanwhile.
- **Fix:** manifests (local and GitHub) and build records carry a `buildInputId`. It hashes every
  file outside `QA_BUILD_IGNORED_PATHS` (default `tools`) as it is on disk: the path plus its git
  blob id. Files changed or untracked are hashed with `git hash-object` without `-w`, so nothing is
  written. A first version hashed the top-level tree plus the diff. Committing already-built
  changes then flipped the build to stale (seen live with `497a4feec`), so the id is
  content-based now. `buildStatus` is `current` when the snapshot ids
  match **or** the build-input ids match. The snapshot id and the drift warning are unchanged.
- The default ignore list also covers `BlibliMobile-iOS/BlibliMobile_XCUITest/**/*.json`: the
  macros, element registry and mock packs. The UI-test target compiles only its Swift files, and
  the dashboard reads that JSON from the repo. Without it, every learned or repaired macro (P8)
  made the build stale. The entries are git globs (`:(exclude,glob)`).
- Builds made before this have no `buildInputId`, so one rebuild adopts it (53 s incremental).
  Unit test: edits and commits under `tools/` keep the id, an app edit changes it, and committing
  that edit keeps it.

## D-070 — P8 pilot: 5 Flash Sale cases through Claude; the verdict comes from a stated line only (2026-10-12)

- **Trigger (user):** P8, "Pilot 5 cases". The cases were picked for spread: SF-001 (one schedule →
  tabs hidden), SF-024 (right chevron), SF-028 (Special Placement null → hidden), SF-035 (Special
  Placement product → PDP) and SF-090 (Today/Tomorrow labels). One unattended batch, approval
  `autonomous`.
- **Outcome:**

  | Case | Ran | Recorded | Notes |
  |---|---|---|---|
  | SF-001 | PASS | PASS | Learned `mc_1RDWNX0B8D` (+ variant `single-schedule` in the flashsale pack), proven by a driver replay. Run $1.05 + learn $1.27 |
  | SF-024 | did not run | UNDECIDED | Needs `sub-flashsale/range` data. PROD answers it with a live 500 and no capture exists. Claude asks whether to author a fixture from the tech doc's sample |
  | SF-028 | PASS | PASS | Learned `mc_YHBBZV33R8`, proven. Run $1.29 + learn $1.48 |
  | SF-035 | did not run | **FAIL** (wrong) | The plugin's `skill-audit` preflight gate failed: "no recorded skill audit", likely a different `--project-root` |
  | SF-090 | PASS | **BLOCKED** (wrong) | Labels "Today", "Tomorrow", "15 Oct 2026" were correct. It also found two doc issues: the API column should be `/flashsale`, and the tech doc's date format is inconsistent |

- **Bug — the verdict was the last bare PASS/FAIL/BLOCKED word anywhere** in Claude's answer.
  "skill-audit FAIL" became FAIL, and a PASS report that mentioned a BLOCKED first preflight became
  BLOCKED. That also skipped learning SF-090.
  - The `/qa-run` prompt now ends with "End your answer with exactly one line `VERDICT: <…> — <one
    sentence>`; BLOCKED when the case did not run".
  - `extractVerdict` only accepts a line that states the verdict (`VERDICT: X`, `**Verdict:** X`).
  - No such line gives UNDECIDED (D-068). There is a unit test with the pilot's own texts.
- The pilot's results run keeps the misread verdicts for the person reviewing it to override (the
  P5 review is theirs). SF-035 and SF-090 are re-run as a new batch.
- **Claude driver target verified:** the pilot sessions' `qa_status` reports `target device:
  AC2A1B55…` (the QA simulator), so D-068 works live.
- **Re-run (verdict fix live):**
  - SF-035 → PASS, learned `mc_S35P7DQ4K2`, proven (run $0.69 + learn $0.90).
  - SF-090 → **BLOCKED**, read correctly this time. Claude's run was stricter than in the pilot: it
    required mock proof for `sub-flashsale/range`, which PROD answers with a live 500.
- **Learned macros:**
  - Two macros declared `requires.session: loggedOut` only because the app happened to be logged
    out. That forces a logout or login between cases (the churn the user asked to remove in D-064).
    `session` was dropped from them.
  - The learn prompt now says to leave `session` out unless the case depends on it.
  - Driver-only replays of all three learned macros pass: SF-001 71 s, SF-028 49 s, SF-035 54 s, $0.
- **UAT B retry (user: "for apis getting 500 error prod, switch to UATB and retry"):** the app was
  switched by routine `mc_F649LIVYQ5` and SF-024 / SF-090 re-ran ($1.24). Both are BLOCKED on data:
  - UAT's `sub-flashsale/range` also answers 500.
  - UAT's `/flashsale` has `"schedules": []`.
  - The app was switched back to PROD (`mc_F649LJ7QKN`).
  - These cases need either authored fixtures (the pilot's SF-090 PASS used one for `/flashsale`)
    or seeded backend data.
- **Second UAT B retry (user: "Retry 24 and 90 on UAT"):** both BLOCKED again ($0.90), at the
  plugin's mock-proof preflight gate.
  - UAT now has schedules: the live page showed "11 Oct 2026 / Today / Tomorrow", so SF-090 looked
    right. But no mock was armed, so preflight refuses to judge.
  - SF-024: UAT's trace has no `sub-flashsale/range` call.
  - Claude kept reporting the plugin's `qa-mock` MCP as broken (`${QA_MOCK_SERVER_URL}`). That MCP
    is for the plugin's proxy mock server (`:8098`), which iOS never uses; mocks here go through
    NetworkLens (`networklens` MCP). The app was left on UAT B.
- **Pilot total:** about $10 of Claude for 3 learned macros. The open cases need a person:
  - SF-024, and SF-090's learning, need a `sub-flashsale/range` fixture: author one from the tech
    doc's sample, or capture a real response.
  - The SF-090 doc findings go to the case owners.
  - The plugin's `qa-mock` MCP has no `QA_MOCK_SERVER_URL`, so Claude falls back to the networklens
    channel.

## D-071 — SF-024 / SF-090 learned from authored fixtures; label-only asserts; qa-mock removed (2026-10-13)

- **Trigger (user):** "Go with option 1, author fixtures from tech doc", then "Retry the test", then
  "Disable remove qa-mock in the plugin so the ambiguity is completely nullified" / "delete qa-mock
  entirely and commit everything".
- **Fixtures (repo mock packs):**
  - New `get-backend-content-api-sub-flashsale-range.networklens-pack.json`: `loaded` = three
    campaigns (A/B/C, distinct backgrounds, 3/2/2 products taken from the v2-products pack, 3 h
    windows back to back; `priceTeaser` and nested `flashsale.schedule` stripped so the only
    epoch-ms values are the campaign windows), plus `empty`/`500`/`slow`/`timeout`. Shape from
    `FSSubFlashsaleRangeItemResponse` and the tech doc (`data` array, sorted by `start`).
  - The `/flashsale` pack gains the pilot's `sf090-today-tomorrow-other` variant (three schedules a
    day apart), which until now lived only on the simulator.
  - Dates are not templated: NetworkLens has none, so macros arm these with `retime: true` (D-058).
    Known edge: a replay just after midnight puts the first slot on yesterday's date.
- **Run prompt (`MOCK_HINT`):** without it Claude used the plugin's `qa-mock` proxy MCP (never
  configured here), never armed the range mock, and on SF-024 concluded the page was "the old
  layout" (the section hides while range answers 500). On SF-090 it armed the mock but could not
  find the way in. The hint names the `networklens` MCP, the repo packs, and the learned macros'
  entry routes. The batch now also passes the tech doc.
- **Label-only `assert` (macro-v2.js):** both learned macros asserted label-only elements (Sub-FS
  card title, "Today" tab); `planStep` refused with "Checking needs an identifier", so the proving
  replay was BLOCKED and the macro discarded. A label-only `assert` now sends the same OR-ed label
  query `waitFor` uses (`waitForExists` / `waitForNotExists`); asserting a label other than the
  locator's own still needs an identifier. Unit test added.
- **Stale plugin cache:** sessions loaded `test-flow-recorder` from a 2026-09-07 cache whose
  `harness.py` ignores `QA_DERIVED_DATA`. It only worked while the developer's own DerivedData held
  a runner; after that folder was deleted to clear the 10 GB disk gate (the user's choice), its
  `ensure` said "no test bundle built". The plugin was reinstalled from its local source (user's
  choice).
- **qa-mock removed from the plugin (user):** the out-of-process `qa-mock` proxy (qa-mock-mcp +
  qa-mock-server) is gone from the plugin entirely; NetworkLens is the only mock channel. It was
  never configured on iOS and its unresolved env made Claude report a broken mock layer.
- **Outcome (batch `7071a759`, PROD, autonomous):**

  | Case | Run | Macro | Proving replay | Cost |
  |---|---|---|---|---|
  | SF-024 right chevron | PASS | `mc_S24RCHVN7K` | PASS | $0.58 + $0.67 |
  | SF-090 Today/Tomorrow | PASS | `mc_SF090TAB01` | PASS | $0.67 + $0.97 |

  Earlier attempts this session: batch `83f496e8` (both BLOCKED, no mocks / no route), `e2ba76a0`
  (SF-024 PASS but macro discarded; SF-090 hit the Claude usage limit → UNDECIDED), `0c632fbd`
  (SF-024 harness wedged + stale plugin; SF-090 PASS, macro discarded on the label assert).
- P8 pilot now has all 5 cases learned and proven.


## D-072 — Dashboard drops the deleted qa-mock server's names (2026-10-13)

- **Trigger:** follow-up to D-071's removal of the plugin's `qa-mock` server ("Proceed to pending tasks").
- `lib/permissions.js` pre-allowed `mcp__plugin_test-flow-recorder_qa-mock__lens_(list|mocks|stats|status)`,
  tools that no longer exist; the read-only NetworkLens tools Claude actually gets come from the
  project `.mcp.json` server `networklens`, so the rule is now `mcp__networklens__lens_(…)`. Mutating
  lens tools (`set_variant`, `set_mocking`, …) still reach the approval card unless the run is autonomous.
- `MOCK_HINT` no longer says "never the qa-mock proxy": naming a server that isn't loaded only invites a
  search for it.
- Not yet verified by a Claude run: every pilot case is learned, so batches replay macros; the next
  ▶ Run on an unlearned case exercises it.

## D-073 — SF-011 / SF-012 learned from two new range variants (2026-10-13)

- **Trigger (user):** "Run a test case without replay, record its macro. SF-011 and SF-012".
- **Fixtures:** the `sub-flashsale/range` pack gains `invert-mode` (the `loaded` campaigns, all with
  `background.invertMode=true`) and `single` (campaign A only). The live backend has neither state.
  They were copied onto the device session (retimed, rule disabled, app quit first) so Claude's run
  could arm them; macros import them from the repo themselves (D-064).
- **Outcome (batch `bb616d35`, PROD, autonomous):** SF-011 PASS → `mc_SF11K3XQ7M`, replay PASS
  ($0.65 + $0.78); SF-012 PASS → `mc_S12XQ5V7ZA`, replay PASS ($0.57 + $0.68). First Claude runs on
  the qa-mock-free plugin: mocks went through `networklens` (D-072 verified).
- **Hand fix:** SF-012's learned macro "restored" range to `loaded` and special placement to
  `valid-control` as its last steps, and left flashsale/products armed. Those leaked into the next
  run. All four now go off in `cleanup` (runs even on failure); re-proved by replay, PASS 59 s.
- **Known weakness:** SF-011's macro asserts that the toolbar elements exist, not that they are
  inverted (XCUITest can't read tint). The screenshot is the evidence; a colour regression would
  still replay PASS.

## D-074 — Five more Flash Sale cases learned from existing fixtures (2026-10-13)

- **Trigger (user):** picked "Existing fixtures" for the next P8 cases, then "Stop SF-011 and
  proceed" — a stray ▶ Run SF-011 (no tech doc) held the device and was cancelled on request.
- **Outcome (batch `edb783d9`, PROD, autonomous):**

  | Case | Run | Macro | Replay | Cost |
  |---|---|---|---|---|
  | SF-006 range 500 → only Sub-FS hidden | PASS | `mc_S006R4N9QX` | PASS | $0.56 + $0.67 |
  | SF-010 non-inverse toolbar | PASS | `mc_S10NV4R9TZ` | PASS | $0.68 + $0.84 |
  | SF-025 left chevron | PASS | `mc_S25PRVC3QK` | PASS | $0.60 + $0.76 |
  | SF-026 pager wraps last → first | PASS | `mc_S26WRAPCR1` | PASS | $0.73 + $0.88 |
  | SF-027 pager wraps first → last | PASS | `mc_S27CWR8K3P` | PASS | $0.71 + $0.82 |

- No hand fixes: every new macro turns off in `cleanup` each mock it arms (the D-073 leak did not
  recur). SF-010, like SF-011, checks element presence only; the screenshot shows the colours.

## D-075 — Redesign as a native Mac app (mockup C); usage meter instead of a cost guard (2026-10-13)

- **Trigger (users):** QA, the Engineering Manager and the Technology VP: "The UI and workflow is
  extremely confusing — no way for a user to understand where to start or what the dashboard does."
  The user called it a blocker for presenting to leadership.
- **Choice:** of four mockups (A guided steps, B mission control, C native Mac app, D one button), the
  user picked **C** as "more relevant to all stakeholders", with SF Symbols and Apple's HIG.
- **Shape:** a SwiftUI app that runs today's Node server in the background. It narrates the driver's
  steps in plain words beside the real, pinned Simulator; it never renders the simulator itself
  (user: "a over burden and unnecessary"). An Xcode-style bottom console holds raw logs; a first-launch
  screen checks Claude, plugin, scheme and simulator in plain words; every feature has a tutorial,
  shown on first use and replayable from Settings.
- **Recommendations:** 1–14 and 17 (step outline drawn over the Simulator window) approved; 16 (history
  by branch) left open. 15, a cost guard with a monthly cap, was replaced at the user's request by live
  Claude usage — context, 5-hour and weekly limits with reset times, as the CLI status line shows.
- **Polling goes:** one state stream with a single action lifecycle replaces the 1/2/10/15/30 s
  timers (phase R1), so the web UI benefits before the Mac app exists.
- **Plan:** `docs/redesign-plan.md`, phases R0 (finish design + walkthrough) → R1 stream → R2 app
  shell → R3 screens → R4 tutorials + demo. No code before R0 sign-off. Mockups: private Design
  artifact `EPisTUsbZ1rTuov3qvKfwW`, boards C1–C5.

## D-076 — R0 started: history by branch approved; usage read from the status line's source (2026-10-13)

- **Trigger (user):** "Start execution of prepared plan", then "16 sounds good. prefer it. read from
  same source".
- **16 approved:** run history by branch with "compare with develop" is in scope (board C10).
- **Usage source:** the CLI status line is `~/.claude/statusline-command.sh`, fed JSON on stdin by
  Claude Code (`context_window.used_percentage`, `rate_limits.five_hour|seven_day.used_percentage`
  and `.resets_at`). The dashboard's headless sessions never run the status line, and their
  `rate_limit_event`s (same windows, `utilization` 0–1) arrive only near a limit: 28 warnings and
  2 rejections in `.data/sessions`, none in the latest 5 sessions. So the app reads a **usage tap**:
  one line in the status line command copies its JSON to `~/.testforge/usage.json`. Installing it
  needs the user's consent (Get ready → Connect…); the app never edits Claude settings silently.
  Headless events refresh the same figures when newer; every figure shows its age.
- **R0 deliverables:** boards C6–C14 (Get ready with fixes, first run with Claude, dark mode,
  Results, Reports + history, Settings, Fake server data, Recorded steps, Phone remote),
  `docs/tutorials.md` (tip scripts per feature + demo run), `docs/walkthrough-v4.md` (gate).

## D-077 — R1: one live state stream; no polling in the page (2026-10-13)

- **Trigger (user):** "start R1", given before the R0 walkthrough ran. R1 changes plumbing, not what
  people see, so it does not depend on the walkthrough; R2 (the Mac app's screens) still waits for it.
- **Built:** `/api/state/stream` (snapshot + per-slice patches) over `lib/state-hub.js`; one action
  lifecycle (`lib/lifecycle.js`); plain-words live steps (`lib/narration.js`, macro steps via a new
  `onStepStart` hook and Claude's phone/fake-data tool calls); Claude usage (`lib/usage.js`). The page
  subscribes to slices; the data polls in `app.js`, `device.js`, `identity.js`, `code.js` and
  `batch.js` are gone, and `/api/events` is removed. The batch's screen picture reloads per
  narrated step instead of every 3 s.
- **Where polling went:** things with no events (simulator, git, NetworkLens, the harness) are probed
  by the server once for every page, only while a page is connected, and pushed only on change.
  Probed slices call the server's own GET endpoints, so payloads are unchanged.
- **Correction to D-076:** `claude-session.js` dropped `rate_limit_event`s with status `allowed`; a
  probe run (`claude -p`, Haiku) showed every headless run emits one with both windows. Dashboard
  runs are now the primary usage source (all messages go to `usageFeed`); the status-line tap is
  optional.
- **Deferred:** readiness fingerprints (re-check only what changed) move to R2's first-launch screen;
  R1 probes readiness every 30 s and after each job.
- **Seen while verifying:** the live server's `/api/status` takes 16–25 s (before R1 code; not caused
  by it). The hub never overlaps reads of a slice, so it costs one read at a time.
- **Verified (same day):** :4545 restarted on R1 while idle; SF-028 replay PASS with 25 steps narrated
  live. The replay first hit the 10 GB disk gate (4.6 GB free); the user chose to delete the unused QA
  copy and their own DerivedData (11 GB free after).

## D-078 — Claude first-run narration verified; Confluence unreachable; SF-028 evidence gap (2026-10-13)

- **Trigger (user):** "run the live steps for a test's first run with Claude".
- **Confluence:** loading page 2396520535 failed for the dashboard's Claude and for this session's own
  Atlassian connection: `403 "The app is not installed on this instance"`. The user chose a local
  one-case file (scratchpad `sf-028-local.md`), rebuilt from run history and the learned macro's
  description and labelled as such. Until the connector is fixed, loads and `/qa-run` against the
  page fail.
- **Run:** ▶ Run SF-028 with Claude (single run — no macro saved): 54 turns, 3 m 3 s, $0.49. 25 steps
  narrated live; usage filled from the run's own events. Real inputs showed three wording bugs, fixed
  with tests: `lens_set_variant` with `enabled:false` (was "→ variant"), `lens_set_mocking` now names
  the endpoint, `qa_assert_exists` with `exists:"false"` reads "is gone".
- **Verdict UNDECIDED (Claude):** the Special Placement section was hidden, but the
  `special-placement` API was never called while `sub-flashsale/range` returned a live 500 — the page
  may skip Special Placement when range fails, so absence isn't tied to `data=null`. The learned macro
  `mc_YHBBZV33R8` (replay PASS today) checks only that the title is gone and does not mock range, so
  its PASS may not prove SF-028. Not fixed; the user decides (mock range `loaded` in the macro, and/or
  assert the special-placement call).

## D-079 — SF-028 must prove the app asked for the faked answer; new `assertRequested` step (2026-10-13)

- **Trigger (user):** after D-078, "Proceed 2" — make SF-028's macro fake range and check the
  special-placement call. (The user also reconnected Atlassian in Claude Code, D-078 item 1.)
- **Cause confirmed:** the macro fakes the main flash sale with schedule `QA-SF084-TODAY`; the live
  `sub-flashsale/range` call for that schedule returns 500 (trace, 12:49), and the app then never
  requested special-placement — so "section hidden" passed without testing `data=null`.
- **Change:**
  - New host step `assertRequested {endpoint, within?}` (`lib/macro-v2.js`): an assertion that the
    app requested the path since the run started, read from the NetworkLens trace
    (`traceRequested` in server.js, polled every 0.5 s up to `within` s). Narrated with
    `antenna.radiowaves.left.and.right`. Unit test added.
  - `mc_YHBBZV33R8` (SF-028) now also fakes range `loaded`, checks special-placement was requested
    before checking the section is gone, and turns range off in cleanup.
- **Proof:** replay on :4545 (restarted while idle) PASS in 76 s; the trace shows special-placement
  requested at 13:02:40 with body `{"data":null}` and range 200 (was 500).
- **Checked the rest:** only SF-028 could pass falsely. SF-035 doesn't fake range but asserts the
  Special Placement card is shown, so it can't false-pass (it may break if live range fails).

## D-080 — Confluence load reads through the Atlassian plugin first; Rovo is the fallback (2026-10-13)

- **Trigger (user):** "Try confluence load then move to R2".
- **Cause:** the claude.ai Rovo connector (`mcp__claude_ai_Atlassian_Rovo__getConfluencePage`) answers
  `403 "The app is not installed on this instance"`, so the load job got no body. The Atlassian
  plugin the user connected (`mcp__plugin_atlassian_atlassian__getConfluenceContent`) reads the page.
- **Change:**
  - `loadViaClaude` allows both read tools; the prompt calls the plugin tool (`content_id`,
    `content_format "markdown"`, `detail "full"`) and Rovo only if the plugin is missing or fails.
  - Disallowed: Rovo update/create/comment tools plus the plugin's `createConfluenceContent`,
    `updateConfluenceContent`, `executeWrite`, `executeDestructive` — the load stays read-only.
  - `parseRovoPage` → `parseConfluencePage` (old name kept as an alias): accepts the plugin envelope
    `{data: {title, body: {format, value}}}` and the Rovo one `{content: {nodes: [page]}}`. The first
    read that parses wins. Tests: `test/testcases.test.js`.
- **Proof:** headless read of the real page returned the plugin envelope (body 46,702 chars, v7);
  after a restart of :4545 (idle), `POST /api/testcases/load` → job verdict `96`,
  "parsed 96 case(s) from “Test Cases - Sub Flashsale & Special Placement Section”".
- **R2 go:** the user said "move to R2" — taken as the go for R2 without waiting for the R0
  walkthrough (redesign-plan.md had R2 after it). The walkthrough can still run on the Mac app.

## D-081 — R2 Mac app shell: Swift package, attach-or-spawn, server survives a run (2026-10-13)

- **Trigger (user):** "move to R2" (D-080). Choices made in this run, via AskUserQuestion:
  - project form = **Swift package** (`Package.swift` + `scripts/make-app.sh` wraps it into
    `build/TestForge.app`), not an .xcodeproj — text-only diffs, builds with `swift build`;
  - accessibility ids on every container plus Fix buttons, console controls, sidebar + toolbar, Settings tabs.
- **Where:** `tools/testforge-mac/` (README there). macOS 14+.
- **Server ownership:** the app probes `/api/state` first; if it answers it **attaches** and never stops
  that server (the live :4545 is never duplicated — same rule as "never start a 2nd server from the
  repo folder"). Otherwise it runs `start.sh` with `QA_DASHBOARD_NO_OPEN=1`, output appended to
  `.data/dashboard.log` — a file, not a pipe, so the server can outlive the app without SIGPIPE.
  The console tails that file. An owned server that dies is reported (row turns red, **Restart server**).
- **Quit:** stops an owned server unless the `queue` slice has an unfinished task; then it keeps running
  and a relaunch attaches and gets a fresh snapshot (#9 reconnect).
- **Fix buttons** reuse the web UI's fix ids/endpoints (`public/js/readiness.js`); fixes that change
  things (create/solo simulator, build, free space) confirm first. `build-qa` runs only from that click.
  `code`, `queue`, `claude-howto` open the web UI until R3 builds those screens.
- **Project skills, adapted:** swiftui-code-gen → swiftui-architect (hard) → swift-codegen → swiftui-components
  → localization ran. iOS-app-only pieces can't be imported by a standalone Mac target and were replaced:
  `BWText`/`BWAnimatedImage`/`blue_core_ios` → native `Text`/SF Symbols + system colours; `BMLogger` → the
  in-app console; R.swift `.strings` → `String(localized:)`/`LocalizedStringResource` (String Catalog,
  English only); UIKit Controller/Router (architect 2c) → SwiftUI `App` scene + `TestForgeOpening` factory.
  The BLUE design-system skill isn't installed (and is iOS-only). SwiftLint with the iOS config: 0 violations.
- **Not done in R2:** readiness fingerprints (re-check only what changed, #8) — server side, moved to R3.
- **Proof:** attach to :4545 (pid unchanged, Live, 10 checks, Fix button shown); cold start on an
  isolated copy (:4646) ran start.sh → live; killing that server → "stopped on its own (exit code 15)"
  + reconnect backoff; Server › Restart Server → live again; ⌘Q stopped the owned :4646 server and
  left :4545 running. Quit-while-a-run-is-active is **Built**, not exercised.

## D-082 — Readiness fingerprints; R2 open checks run; app re-adopts its own server (2026-10-13)

- **Trigger (user):** "Commit 080 and 081, then run the 'Not checked yet' list in queue" (committed as `fd402ba9b`).
- **Readiness fingerprints (#8)** — `lib/readiness.js`:
  - `createCheckMemo({file})`: a **passing** "App installed" / "App installed from this build" result is
    reused while its fingerprint — QA simulator UDID + build `codeId`/`endedAt` (or the developer
    bundle's path + mtime) — is unchanged, for at most 30 min. Failures are never reused; harness, lens,
    device, code and simulator checks always run. Persisted to `.data/readiness-memo.json` so a
    restarted server starts warm. Reused checks carry `isReused` + `checkedAt`; every check carries
    `durationMs`, the report `durationMs`.
  - Independent reads (code/git, simulator list, disk, Claude) now start together.
  - Measured on :4545 after restart: first check 6.2 s, next 2.2 s (was ~6 s every time). What's left is
    git drift (~1.1 s) and the live harness/lens probes.
  - The Mac app shows reused rows as "… · unchanged since 7:43 PM".
  - Known limit: an app deleted by hand stays "installed" until the 30-min expiry or a new build/simulator;
    the harness probe still fails in that case.
- **R2 open checks, all run (Verified):**
  1. *Quit while work is active* — on the :4646 copy a general-lane Claude task was running; ⌘Q left the
     server up and the task running. **Gap found + fixed:** the relaunched app then saw that server as
     someone else's, so it would never stop it. The supervisor now records `.data/app-server.json`
     (pid + port) when it starts a server and, on attach, re-adopts it if that pid is still a `node`
     process (pid-reuse guard); relaunch logs "reconnected to the server this app started earlier";
     the next idle ⌘Q stopped it and removed the record.
  2. *Console + Settings* — driven through the Accessibility API: search filtered to the matching line,
     Copy put exactly that line on the pasteboard, Server/App filters and Clear worked, ⌘⇧Y hid/showed
     the console, all six Settings tabs opened, Project shows the folder found by the upward search.
     **Fixed:** Copy/Clear read as "Copy"/"Bin" to VoiceOver — now "Copy the lines shown" / "Clear the console".
     SwiftUI gives Settings tab *buttons* no identifier; the ids sit on each tab's content.
  3. *Near-clean cold start* — `git archive` of the dashboard (no node_modules/.data/.env.local) with the
     .app inside it, opened with `open` (only `QA_DASHBOARD_PORT=4747`): folder found by itself,
     start.sh ran `npm install` (139 packages, 57 s), live in 61 s. **Fixed:** the console tail started
     before `.data/` existed, so the install output was lost ("can't read …/dashboard.log"); the tailer
     now creates `.data/` first — re-run showed "added 139 packages" in the console. Not a truly clean
     Mac (Node, Xcode, signed-in Claude were present).
- Disk is at ~10 GB free, right at the gate.

## D-083 — "Code prepared" warns only when app build inputs changed (2026-10-13)

- **Trigger (user):** asked what the "Code prepared — your working copy changed since" warning meant,
  then "make that change".
- **Cause:** the check compared whole-repo snapshot ids (`<sha7>+<dirty hash>`), so any commit — dashboard
  docs, macros, mock packs, `tools/` — warned. Since `3616003` the only `BlibliMobile-iOS/` changes were
  macro/mock JSON; the build was rightly still current (D-069 build inputs `426ecc105331` unchanged).
- **Change:**
  - `localDrift` (`lib/qa-copy.js`) also returns `hasAppInputsChanged`: once the snapshot moved, it
    compares D-069's `buildInputId` (repo minus `tools/**` and UI-test `*.json`) with the manifest's
    (~0.6 s, only when drifted). A prepare without `buildInputId` falls back to the snapshot.
  - `codeCheck`: warns only on `hasAppInputsChanged`; a snapshot that moved only outside the app passes
    with "only files outside the app changed since (macros, mocks, tools, docs)".
  - The 24 h age warning applies only to GitHub-branch prepares — a local snapshot's changes are already
    caught by drift.
  - `hasDrifted` keeps its meaning, so "Run again" (`needsPrepare`) still re-prepares on any change —
    the QA copy must carry the latest macros.
  - The ignore list (`BUILD_IGNORED_PATHS`) is unchanged, so existing build ids stay valid. A local edit
    to `BlibliMobile-iOS/.claude/settings.json` still counts as an app input (it isn't ignored).
- **Proof:** 4 tests (incl. a temp git repo: a tools/macro commit → drift without app change; editing a
  Swift file → app change); 111/111. :4545 restarted (idle): Code prepared ✓ "only files outside the app
  changed since".
- Seen while checking: the QADriver runner had stopped (no xcodebuild process; it answered at 19:43) — a
  warn-level check that the next test self-heals; unrelated to this change.

## D-084 — Harness probes use `deviceInfo`, not screenshots; runner idle stop explained (2026-10-14)

- **Trigger (user):** "Retry" after the QADriver runner had stopped again overnight; then chose
  "Stop saving + delete old" for the probe screenshots.
- **Why the runner stops:** QADriverKit's live session ends itself after `QADRIVER_SESSION_MINUTES`
  (default 30) with no commands. The dashboard only probes while a page or the Mac app is connected,
  so it idles out overnight. By design; the next test restarts it (P7). Restarted via
  `POST /api/harness/ensure` → answering.
- **Problem found:** both liveness probes sent a `screenshot` command, so every probe left a PNG in
  `~/Documents/QA-Test/QADriverSession-testLiveSession`: 3,066 `*-harness-probe.png` (plugin
  `harness.py`, behind `/api/harness/status`) + 820 `*-readiness-probe.png` (`server.js`) = 2.6 GB.
- **Change:** both probes send `{kind: "deviceInfo"}` — same round trip through the runner, nothing
  written. `deviceInfo` is in the pinned QADriverKit tag `qa-mocker-testing-5`, so no rebuild.
  Plugin source edited on `qa-flow-recorder-plugin` branch `darshan/feature/qa-mock-dataplane` and the
  plugin reinstalled (cache now has it).
- **Cleanup (user OK):** deleted only the 3,886 probe PNGs; the 281 test screenshots stay. Folder 2.6 GB →
  192 MB; disk 21 GB free.
- **Proof:** :4545 restarted (idle); 3 fresh readiness checks + a harness status: harness PASS with the
  device descriptor, file count unchanged (4,167 → 4,167).

## D-085 — R3 sliced; R3a Tests screen + live steps; loaded document persists (2026-10-14)

- **Trigger (user):** "move to R3".
- **Slicing (my call, so each slice ships verified):** R3a Tests screen + live steps · R3b Results +
  Reports · R3c menu bar, notifications, Dock badge · R3d Arrange with Simulator + step overlay ·
  R3e Advanced panels (Fake data, Recorded steps, Phone remote).
- **Server:**
  - The loaded document is saved to `.data/testcases.json` and restored at boot. Before, a restart
    lost it and every run endpoint answered "load the doc first".
  - New `testcases` slice (`lib/testcase-view.js`, pure): title, source, `isLoading` (a `load` job
    is running), and per case the summary fields, the recording that replays it (first v2 macro
    whose `links.testCases` has the id), and its latest run (newest of the case's own run and its
    recording's replay). Re-read on job events and after any `/api/testcases|macros` POST.
- **Mac app, Tests section:**
  - List (search in the toolbar, Show: All · Recorded · Failed last · Never run), case detail, and a
    live-steps pane fed by the `narration` slice (the running run, else the newest).
  - **Replay** only when a recording exists (no Claude usage). **Run with Claude…** always asks first
    — it spends the user's plan. ⌘R runs the selected case: a replay when recorded, else that
    confirmation. ⌘. stops the active run (`/api/jobs/:id/cancel`). Load document sheet (Confluence
    link or file path).
  - Replays call `/api/macros/v2/:id/replay` (the case-level replay route needs a v1 macro name).
- **Layout lesson:** on macOS 26 a `NavigationSplitView` detail column runs under the sidebar and is
  inset by it, so the sidebar width counts twice toward the window minimum. Tests panes (300 + 280
  + 280) need a 1 240-pt window; `Window.minWidth` is now 1240. A too-small window had made AppKit
  save an oversized split (`NSSplitView Subview Frames …` in the app's defaults), which then kept the
  layout clipped across rebuilds — `defaults delete com.blibli.testforge "NSSplitView Subview
  Frames main, SidebarNavigationSplitView"` resets it. `.inspector` was dropped for a plain pane, and
  the empty states use a wrapping view (`ContentUnavailableView` clipped its message at 280 pt).
- **Proof (copy :4646):** 3 new tests (114/114). Restart restored 96 cases (13 recorded) and later a
  2-case Markdown file. App: list, search (id + scenario), "Failed last" filter, detail, Replay SF-001
  with live steps → verdict FAIL in list/detail/inspector, Stop → CANCELLED (button and Test › Stop
  Run ⌘.), Test › Run Selected Case ⌘R → replay, Claude confirmation dismissed with no task queued.
- **Seen, not fixed:** the SF-001 replay from the copy failed at "Tap Home Flash Sale Show all" (no
  answer in 30 s). It passed on 12 Oct; to re-check on :4545.

## D-086 — Scan mode in the Mac app; light/dark appearance; layout-measure overlay feasibility (2026-10-14)

- **Trigger (user):** "ensure light/dark theme is supported … can we … draw thin visible lines on
  live simulator displaying view hierarchy with real visible constraint numbers … if possible …
  corner radius too. Check if this is possible. Secondly add scan mode in app which again shows what
  is currently being scanned on simulator, similar to test case runs".
- **Appearance:** Settings › General › Appearance (System · Light · Dark), saved under the
  `appearance` default and applied through `NSApplication.appearance`, so sheets, menus and Settings
  follow it too. Every view already used semantic colours, so no view needed a change.
- **Scan mode (new section ⌘3; Results/Reports/Advanced move to ⌘4–⌘6):**
  - The plugin's `scan_mode.py` gained `--events`: one `EVENT {json}` line per change (`started`,
    `screen` only when the tree hash changes, `mark`, `markFailed`, `skip`, `pollError`,
    `pollRecovered`, `ended`). Plain output is unchanged without the flag.
  - Server `lib/scan-session.js` spawns it (`python3 -u … --events --out .data/scans/scan-<stamp>.json`),
    folds events with the pure `applyScanEvent` into the `scan` slice, and drives it over stdin
    (`mark <name>`, `skip`, `stop`). `routes/scan.js`: `GET /api/scan`, `POST /api/scan/{start,mark,skip,stop}`.
  - **Device ownership:** a scan holds the device lock as `scan-mode` until it ends; start is refused
    (409) while a test runs or another owner holds the device, and test runs are refused while a scan
    is on. My call: the scan polls `dumpTree` every 1.5 s, which would race a replay's taps.
  - Mac: idle view (start, last-scan summary, Show in Finder) and a live view — what is on screen now
    (element / identifier counts, identifiers, "only the top was read" warning when the 20 000-char
    dump was cut), a name field + Mark (keeps the name, so a scrolled re-mark adds a variant) + Skip,
    and the marked screens list.
- **Overlay feasibility (answer, nothing built):**
  - **Possible now, no app change — "Measure":** the driver's `dumpTree` already gives every
    element's frame in points. One click can compute each element's insets to its parent and gaps to
    siblings and draw thin lines with the numbers — on a screenshot in the Mac app (robust), or on a
    click-through window over the Simulator (fragile: bezel, zoom and window moves; belongs with R3d
    Arrange). Limits: these are *rendered distances*, not constraint constants; the 20 000-char cut
    hides the lower screen (raise the cap or add a compact frames command in the QADriverKit QA fork).
  - **Real constraint constants and corner radius** are not in the accessibility tree. They need an
    in-app QA inspector (walk `UIView`s: `constraints`, `layer.cornerRadius`, `layer.borderWidth`)
    answering over the existing NetworkLens control channel — in the QA fork packages on the
    `qa-mocker-testing` branch/tag, DEBUG/QA builds only. SwiftUI content has no constraints; it
    would show frames (and corner radius only where a backing layer carries it).
  - **Recommendation:** build "Measure" on screenshots first (R3d), add the in-app inspector only if
    rendered distances prove insufficient for design review.
- **Proof (copy :4646):** 4 new tests (118/118). Plugin `--events` streamed live. App: Start → live
  view (185 elements, 13 identifiers, cut-off warning), Mark "Home" → row, Stop → last-scan summary,
  lock released, map saved under `.data/scans/`. A replay during a scan was refused. Light and dark
  screenshots checked.

## D-087 — R3b Results + Reports in the Mac app; `results` slice; run compare (2026-10-14)

- **Trigger (user):** "Proceed to R3b".
- **Server:**
  - `ResultsStore` now emits `change` and stamps `updatedAt` on every mutation; a new `results` slice
    carries `runSummary` rows (counts, review progress, branch, commit, simulator, server,
    `caseIds`, `updatedAt`) and `branchHistory` (newest run per branch + run count). The Mac app
    re-fetches a run's cases (`GET /api/results/:id`) only when that run's `updatedAt` moves.
  - **Compare:** `GET /api/results/:id/compare[?with=<runId>]` → per case base vs head final verdict,
    `change` = newlyFailing · fixed · same · added · notRun, plus counts. Without `with`, the base is
    the newest *earlier* run on `develop` that shares a case, else the newest earlier run on any branch
    that shares one (my call — every kept run today is on one branch, so "develop only" would never
    compare anything).
  - **Proof only:** evidence once swept up readiness-probe PNGs (since deleted by D-084), so old runs
    listed up to 42 dead "screenshots". `isProbeShot` now filters probe shots out of evidence
    collection and the Markdown report, and `GET /api/results/:id` also drops files no longer on disk.
- **Mac app:**
  - **Results (⌘4, board C9):** run list (status, counts, review progress, validated seal) · run
    header (code, simulator, server, duration, tiles, Re-run failed… with confirmation, Export report…
    via a save panel, Copy report) · case list · case inspector (verdict history incl. re-run and Claude
    cost, review bar Accept / Override… / Needs re-run, triage / repair / recording / crash notes,
    proof screenshots that open in Preview, fake data that answered, Claude's last words, steps).
    Override is a sheet: PASS/FAIL + a reason of ≥ 5 characters (the server's own rule).
  - **Reports (⌘5, board C10):** history by branch · run picker · "Compare with" (Automatic or any
    other run) · what changed (chips + table; hidden when nothing earlier shares the cases) · report
    preview · Export Markdown… · Copy report · Publish to my Confluence page… (confirmation; it queues
    the existing Claude publish task, which only creates a child of page 2437316839).
  - Board features with no data behind them yet are left out: runs × N per case, colour proof
    (expected vs seen), "Ask Claude to look" and "Copy for bug report".
  - A slice that is still pending after a reconnect decodes as nil; both screens now keep their state
    instead of resetting the selection (found when the copy server restarted mid-test).
- **Proof (copy :4646, real `results.json` copied in):** 2 new tests (120/120); lint 0. Results:
  19 runs listed; run 0c632fbd → SF-024 (BLOCKED) overridden to PASS with a reason through the sheet,
  SF-090 accepted → run shows Validated live, Re-run failed disables; proof 42 → 1 real screenshot;
  Copy report put the Markdown (Validated, 2 PASS) on the clipboard; Re-run and Publish confirmations
  shown and cancelled — no task queued. Reports: automatic compare picked the 6:20 run (2 unchanged);
  manual base 7:53 PM → 2 fixed (BLOCKED → PASS). Light and dark checked.
- **Open:** SwiftUI's `VSplitView` gives a tall window's extra height to the console (up to its
  420-pt cap), so sections get ~480 pt on a 950-pt window. Needs an `NSSplitView` with holding
  priorities, or a smaller cap — to decide with the user.

## D-088 — R3c menu bar, finish notification, Dock badge (2026-10-14)

- **Trigger (user):** "commit and proceed to R3c" (recommendation #10, boards C4 and C11).
- **No server change.** Everything comes from slices the app already reads: `results` (a batch run
  and its progress) and `narration` (a single replay or Claude run, and its current step).
- **Run activity (`Activity/RunActivityViewModel`):**
  - What runs now: a running batch → "Running 3 of 9 done · <branch>" plus the current case and
    step; else a running single run → its case and step. Stop cancels the batch
    (`/api/batch/cancel`) or the run's job (`/api/jobs/:id/cancel`).
  - Finishes are found by diffing slices; the first read of each slice is a baseline, so launching
    the app never notifies about old runs. A single run that started inside a batch's window (+5 s)
    belongs to the batch and is not announced on its own.
  - Batch notice: "9 cases finished on <branch>" / "8 passed · 1 failed (SF-010)" — failing ids come
    from the run's detail; "Run stopped on <branch>" when it did not end done. Single notice:
    "SF-001 finished" / its verdict. The last notice also shows in the menu-bar menu.
  - **Dock badge** = failing cases of the last finished run (failed, blocked, interrupted), cleared
    when the person opens Results or Tests. My call: the board only says "number of failures".
- **Menu bar:** `MenuBarExtra` (menu style) with progress, Stop, Open TestForge (reopens the
  window if closed), Quit. Icon: seal when idle, play when running.
- **Notifications:** `UNUserNotificationCenter`; banners also show while the app is in front (a run
  often ends while the person watches the Simulator); clicking one opens Results. Permission is
  asked once, when "Notify when a run finishes" is on. A bare `swift run` has no bundle id and the
  center traps without one, so notifications are off there.
- **Settings › General:** "Show in menu bar" and "Notify when a run finishes" (also drives the
  badge), both on by default. "Open at login" from board C11 is not built.
- **Bug found and fixed:** `MenuBarExtra(isInserted:)` writes `true` back on every update. Bound
  straight to the `@Published` preference, that re-published, re-evaluated the App body and looped
  at 99 % CPU, starving the main thread (the app sat at "Looking for a server"). The binding now
  writes only on a real change.
- **macOS 26 note:** status items are hosted by Control Centre; on this notched 1 512-pt screen most
  third-party items, ours included, sit hidden (zero width). The app's own AX tree still lists the
  menu's items, which is how it was verified. Clicking the hidden item is not possible from scripts.
- **Proof (copy :4646):** lint 0. Menu shows "No run in progress". SF-011 replay: menu showed the
  case, "Step 5: Tap …" and Stop; on finish "SF-011 finished: PASS", no badge (passed). SF-001
  replay passed too. A 2-case replay batch: "Running 0 of 2 done · darshan/innovation/qa-mocker",
  then "2 cases finished on darshan/innovation/qa-mocker: 2 passed". Toggling "Show in menu bar"
  removes and restores the item (Control Centre 18 → 17 → 18) with CPU idle.
- **Not seen yet:** a notification banner (needs the user to allow the one-time permission prompt)
  and a non-zero badge (every run in the check passed).

## D-089 — R3d Simulator bridge: Arrange, step outline, Measure (2026-10-14)

- **Trigger (user):** "proceed to R3d" (recommendation #7, plus the Measure overlay recommended in D-086).
- **Key finding:** the Simulator's own accessibility tree exposes the device screen as one `AXGroup` and every app
  element (with its identifier) inside it, in exact fractional Mac points. Mapping device points ↔ Mac points is
  `screenGroup.origin + point × (screenGroup.width / device width)` — no bezel, zoom or toolbar guessing. Checked:
  Back button reads `x 16 · y 57 · 24 × 24` from the Simulator, identical to the runner's `dumpTree`.
- **Bridge (`Simulator/SimulatorBridge.swift`):** Accessibility API only; one permission (System Settings › Privacy &
  Security › Accessibility) covers Arrange, the outline and Measure. `AXWindows` sometimes answers an empty list
  (and the app's children only the menu bar) while the window is on screen; the bridge falls back to
  `AXMainWindow` / `AXFocusedWindow`. A full element walk costs ~1.7 s (≈10 ms per element over IPC), so it runs
  off the main actor and only on demand.
- **Arrange:** the Simulator keeps its size at the right edge of its display; the window takes the rest. The
  window's 1 240-pt minimum doesn't fit beside a 451-pt Simulator on a 1 512-pt screen, so Arrange hides the
  sidebar, and the minimum drops to 880 pt while the sidebar is hidden. My call: hiding the sidebar beats
  shrinking the phone.
- **Step outline:** a borderless, click-through, non-activating panel over the Simulator's screen, ordered just
  above the Simulator window (so other apps still cover it), drawing the working step's element and its number.
  - **Frames come from the server, not the Mac:** reading the element before the action means the outline shows
    what is about to be tapped; a Mac-side lookup (≥1 s) would land after the tap had already moved the screen.
  - `narration` steps now carry `target` (identifier, for replay steps with one) and `frame`; the run carries
    `screen` (device points). `macro-v2` awaits `onStepStart` and passes the identifier.
  - **Cost:** `getFrame` waits for the frame to settle (~1.6 s; below a 1.5-s timeout it answers "exists but
    never laid out a valid frame"), so it's read only for tap/type/typeSecret/scrollToTop/assert steps, and only
    while a Mac app holds a lease (`POST /api/overlay {on}`, 90 s, renewed every minute). SF-011: 90.7 s with the
    outline on, 63–80 s off. The switch (toolbar, Settings › General) is off by default and says so.
  - Claude runs get no outline: reading frames would race Claude's own driver commands.
  - The outline hides rather than guessing when the screen group's shape doesn't match the device (2 %).
- **Measure (new window, toolbar ruler):** a simctl screenshot (`GET /api/device/screenshot.jpg`) with every
  element's frame from the Simulator's tree, scaled back to device points (snapped to 0.5 pt). Click an element:
  frame, the smallest element containing it, and the gap from each edge to the nearest neighbour facing it, else
  to the container — drawn as lines with numbers. No 20 000-character cut (the tree comes from the Simulator, not
  `dumpTree`). Screen size: `GET /api/device/screen` (cached from the readiness probe's `deviceInfo`, else asked
  when the device is free). Constraint constants and corner radius are still not available (D-086).
- **Signing (user's choice: local self-signed certificate):** macOS ties the Accessibility grant to the code
  signature; an ad-hoc one changes on every build, so the grant was lost on each rebuild.
  - Signing with the user's "Apple Development: Darshan Telang" certificate got the app flagged **"Malware Blocked
    and Moved to Bin"** (most likely a revoked certificate). Reverted at once; Apple certificates are not tried again.
  - Now: a local local code-signing certificate in the login keychain (RSA 2048, 10 years, code
    signing only, not trusted system-wide, no Apple account). Designated requirement = bundle id + that leaf
    certificate, so one grant survives rebuilds. `make-app.sh` reads the identity from `TESTFORGE_SIGN_IDENTITY`
    or `~/.testforge/sign-identity`, else signs ad-hoc. macOS's PKCS#12 import needs the legacy algorithms
    (`-keypbe/-certpbe PBE-SHA1-3DES -macalg sha1`); OpenSSL 3's default fails with "MAC verification failed".
- **Proof (copy :4646):** 124/124 server tests; lint 0. Endpoints answer (screen 428×926, 492 KB JPEG, lease).
  SF-011 replay with the lease: frames for Back, Share, Home search, Home tab, carousel banner, "Lihat semua",
  plus `screen`; PASS. Bridge + mapping + Measure maths run against the live Simulator (from Terminal, which has
  the permission): calibrated, 178 elements in 1.7 s, Back 8 pt to the title image, Share 12 pt to the cart. App:
  toolbar shows Arrange / Outline / Measure; Measure opens and states the missing permission.
- **In the app, after the grant (local-cert build):** Measure loaded 87 elements; selecting Back (through the
  element box's accessibility action, added so it can be driven without a mouse) showed `x 16 · y 57 · 24 × 24`,
  57 / 16 to the screen, 8 to the title image, 79.5 to the section header; lines and numbers drawn on the capture.
  The grant survived a rebuild. Arrange: window → x 42 (Dock edge), 1 011 wide; Simulator unchanged at x 1 061
  (8-pt gap). New **Simulator** menu: Arrange ⌥⌘A, Outline Steps ⌥⌘O, Measure ⌥⌘M.
- **Measure zoom + full element details (user request, same day):**
  - Zoom 100–800 %: −/+ buttons (⌘− / ⌘=), slider, Fit (⌘0), trackpad pinch; the canvas scrolls both ways and
    stays sharp. Verified: the Login box grows 61 → 135 pt at 225 %, Fit restores it.
  - The details pane: identity (identifier, role, label), geometry in device points (frame, size, centre,
    container), spacing, hierarchy (ancestor path, depth, children), then **every** attribute and action the
    Simulator reports for that element, read live on selection (`AXUIElementCopyAttributeNames` + values,
    references shown as role + identifier, AX geometry marked as Mac points). Copy button puts all of it on the
    clipboard. Each element carries its child-index path, so re-reading after the screen changed says so instead
    of reading the wrong element. Verified on "Login": 25+ attributes (enabled, focused, selected, parent,
    activation point, user input labels, …).
  - That's everything the accessibility tree has; constraints, corner radius, colours and fonts are not in it.
- **Step outline verified on the Simulator:** during an SF-011 replay the panel sat exactly on the screen group
  `(586, 119.5, 382.5, 827.5)` and drew "8 Tap “Tab bar Home tab” (if shown)" around `{2, 844, 82, 48}`.
- **Bug found and fixed:** the Simulator window was on another Space, the window-number lookup used on-screen
  windows only, so the panel fell back to `orderFront` and appeared over whatever the user was looking at. Now the
  lookup reads all windows and reports whether the Simulator window is on screen; the outline only shows ordered
  directly above an on-screen Simulator window, never to the front. Verified: a full replay with the Simulator off
  screen showed no panel (PASS).
- **Privacy rule for checks:** screenshots are taken of our own windows (`screencapture -l`) or the Simulator
  window only, never a screen region — a region capture caught another app once and was deleted at once.
- **Bridge quirk, also in our own app:** `AXWindows` can omit an on-screen window entirely; scripts drive the app
  through the menu (`axmenu`) when that happens.

## D-090 — R3e Advanced: Fake data, Recorded steps, Phone remote (2026-10-14)

- **Trigger (user):** "proceed to R3e".
- **Scope:** the three Advanced panels from the R0 boards, on existing endpoints and slices only (`status`, `mocks`,
  `trace` were already streamed). No server change.
- **Architecture:** `AdvancedSectionViewModel` (owned by `TestForgeViewModel`) builds one view model per panel;
  each takes a narrow protocol (`MockActing`, `MacroActing`, `DriverCommanding`), all implemented by one
  `AdvancedService` over the shared `DashboardClient`. State enums, not flags; tasks cancelled in `deinit`.
  Rule toggles keep one task per rule, so two quick clicks both land.
- **JSON booleans:** `POST /api/mocks/:id/enabled` does `Boolean(req.body.enabled)`, so the string `"false"` would
  turn a rule on. Added `DashboardClient.post(path:json:)` with `JSONValue` bodies.
- **Confirmations:** Turn NetworkLens on and Relaunch app both relaunch the app on the simulator, so both ask first.
- **Names:** "Fake data", "Recorded steps", "Phone remote" in the UI (plain words from the boards); "Answer" for a
  variant; recordings found only by visible text are flagged, since copy changes break them.
- **Layout:** nested `HSplitView`/`VSplitView` clipped the right-hand panes (AX showed them at negative y); replaced
  with stacks and fixed side widths.
- **Removed:** `PlaceholderSectionView` and its id — every section is real now.
- **Verification note:** mid-check the main window moved to another Space, where Accessibility can't see it. Recorded
  steps and Phone remote were then verified by running their real view models from Terminal against :4646 (list,
  lint, search, detail, Replay → PASS, deviceInfo, missing id, relaunch confirmation); Fake data was verified in the
  window. Mock state restored after each check.

## D-091 — Measure: spacing to the visible parent, from the screenshot (2026-10-14)

- **Trigger (user, with a screenshot):** "not able to relate spacing to immediate parent, it is measuring to next
  parent" — the first Flash Sale product image showed left 28 to Screen and bottom 25 to the pager dots, outside the
  white card it sits in.
- **Cause:** the card is a plain view with no accessibility identifier, so iOS leaves it out of the accessibility
  tree; Measure only knew the image and the screen.
- **Choice:** find the card in the screenshot pixels rather than ask for identifiers on every container. It works on
  any screen today; identifiers would still be the exact answer and are worth adding to key containers in the app.
- **Rules that keep it honest:** a boundary counts only when all scan lines meet it at once and it runs straight along
  the side against one flat colour; otherwise the scan continues outward. Fewer than two edges → nothing claimed.
  Edges not found keep the structural container (the details pane lists which edges were found), and only found
  edges are drawn. Tested on the Flash Sale screen: card found; no false card for the search field, logo, list rows.
- **Known limit:** an edge covered by an overlay (here the NetworkLens "99+" bubble over the card's right edge) isn't
  found; it falls back to the app's container rather than guessing.
- **Corner radius:** estimated from the corner's 45° walk (≈ 12 on the card, same from two elements); labelled
  approximate. Constraint constants are still not readable.

## D-092 — Measuring views without accessibility identifiers: routes (2026-10-14)

- **Trigger (user):** "can we measure boundaries of view for whom the accessibility id is not set using any other
  route or scripts?" Also: hide elements outside the screen (done: < 50 % on screen hidden, canvas clipped).
- **Routes compared:**

| Route | Sees plain views | Corner radius | Constraint constants | Cost / risk | Verdict |
|---|---|---|---|---|---|
| Accessibility tree (today) | No | No | No | free | base |
| Screenshot pixels (D-091) | Cards with a clear edge | ≈ | No | ~2 ms | shipped |
| lldb attach to the app (`recursiveDescription`, layer, constraints) | Yes (UIKit) | exact | exact | ≈ 45 s, app frozen meanwhile; needs a debuggable build | probe only |
| In-app inspector command in the QA NetworkLens fork (walk `UIWindow` on the main thread, return JSON) | Yes (UIKit) | exact | exact | ~100 ms; QA-only code in NetworkInterceptor fork + app rebuild | recommended next |
| Xcode View Debugger / Reveal / Lookin | Yes | exact | exact | manual, or a third-party framework | not automatable |

- **Probe evidence:** lldb attached to `BliBliMobile` (pid 36104) on the QA simulator; `windows.count` = 2, first
  subview `UITransitionView (0 0; 428 926)`; first expression 28 s (symbol setup), next 0.4 s; detached cleanly. The
  first try (writing `recursiveDescription` to a file) hung past 60 s and was killed; the app kept running.
- **SwiftUI limit (all routes):** SwiftUI content has no `UIView` per view; only its hosting view and the
  accessibility elements it exposes are visible, so pixels stay the fallback there.

## D-093 — Measure: views without identifiers from Color Blended Layers (2026-10-14)

- **Trigger (user):** "Loading the tree from UIKit's hierarchy is cumbersome … capture screenshot with
  colorBlended layers enabled … with a loader … project the unknown measurements onto real snapshot … merged with
  accessibility id" (reference screenshot attached).
- **Why it works:** with Color Blended Layers on, every layer is drawn half content, half tint, so each layer's box
  becomes a straight colour boundary, including views with no accessibility identifier.
- **Switch:** the Simulator menu item can be pressed through Accessibility, but its action goes to the key device
  window and does nothing while the Simulator is in the background (checked: no change). CoreSimulator's
  `SimDevice getCADebugOption:` / `setCADebugOption:enabled:` take a numeric option; 2 is Color Blended Layers
  (found by reading every option while the user had it on). It switches instantly and never activates the
  Simulator. Private API: loaded with `dlopen` at use; if it's missing, the pass reports it and Measure keeps working.
- **State:** read first and always restored (the user keeps it on for their own checks).
- **Box finding:** tried the tint-only residual (2 × tinted − plain): it is a two-colour map (blended red / opaque
  green) with no stacking depth, so it loses children inside same-tint parents. Kept the tinted image as the edge
  source and removed text noise instead: pair a left side only with the nearest equal-span right side, require
  top/bottom sides, and require a real arc where a rounded corner is claimed; boxes inside a text element are glyphs.
  11.5 s → 270 ms after bucketing.
- **Safety:** skipped while a test or scan holds the simulator, so run evidence is never tinted.
- **Limits:** a box whose side is covered by an overlay (the NetworkLens bubble over the Flash Sale card) isn't
  found; the D-091 visible-container check still covers that card. Corner radius is approximate; constraint constants
  are still not readable.

## D-094 — Measure: relations to every parent, hover compare (2026-10-14)

- **Trigger (user):** "i am still not able to measure padding between the product card edges to screen boundary. I
  believe you missed to add relation between one view with every other sibling or parent around it. Review that"
  (screenshot of the tinted Flash Sale screen).
- **Review finding:** two gaps. (1) The card itself wasn't an element: its right side is under the NetworkLens bubble,
  so D-093's pairing never found it, and spacing per edge only ever named one target (nearest neighbour or one
  container). (2) There was no way to measure from the selection to an arbitrary other element.
- **Card:** added an occluded-side fallback: a left side ≥ 30 pt with no equal partner takes the nearest column
  whose edge shows within 10 pt of both ends and over half the span; top/bottom and corner checks still apply.
  The corner-radius walk now starts 3 px in, so the straight sides' anti-aliasing at the corner isn't read as the arc
  (card r 0 → ≈ 10).
- **Every parent:** the details pane lists the inset to each parent, innermost first, out to the screen: every
  element that contains the selection, the structural container, the visible container and Screen; same frames
  shown once; at most 5. Kept the nearest-neighbour Spacing rows too (renamed "Spacing to nearest").
- **Hover compare (Figma's Option-hover):** with an element selected, pointing at another element (or empty space =
  Screen) draws blue lines and fills "Compared with": containment gives four insets, separation gives the
  horizontal/vertical gaps, partial overlap shows nothing. Blue keeps it apart from the selection's orange lines.
- **Sign-off:** the user checked it in the app: "Works almost upto 90% as expected. Good to commit".
- **Not chosen:** all-pairs relations listed up front — too many rows on a 130-element screen; hover gives any pair
  on demand.

## D-095 — Measure: spacing on the device pixel grid, half to even; thin bars (2026-10-14)

- **Trigger (user):** "also consider device scale and always round the spacing to nearest even digits 16.5 becomes
  16, 17.5 becomes 18. Not able to select the progress bar to measure its spacing with boundary" (screenshots of the
  Flash Sale card and list).
- **Rounding:** every spacing value (nearest-neighbour rows, parent insets, hover compare, lines, copied text) is
  snapped to the device pixel grid (screenshot pixels ÷ points, 3 on this device) and then rounded to whole points
  with halves going to the even number (`.toNearestOrEven`). Distances are kept raw until display, so the old
  half-point snap can't turn 24.67 into 24.5 and then 24. Frames keep the half-point snap (only spacing was asked).
- **Progress bar:** the carousel's pager pill is 12 × 4 pt, below the 6 pt side the layer pairing needs. New
  `ThinBarDetector`: a top boundary run ≥ 4 pt wide, closed by the first row below (1–6 pt) with a boundary over the
  same span, no boundary inside, and a flat fill plus flat rows above and below. Letter strokes inside text are
  still dropped; strokes inside an icon-sized (≤ 48 pt) button or image are dropped too. The pill sits inside the
  app's `FS_Shared_ArrowCarouselPageIndicator` (AXGenericElement), so it is kept.
- **Clicking:** elements under 6 pt on a side take clicks up to 2 pt beyond their edges.

## D-096 — Measure: dashed borders for views without identifiers off by default, colour picker (2026-10-14)

- **Trigger (user):** "Add a mode to toggle show/hide purple dashed border for views having no acc id, keep it off by
  default. when On we can add a small color picker to change the color of these dashed borders which is currently
  purple".
- **Scope:** only the borders toggle. The layer pass still runs and the views stay selectable and measurable (their
  accessibility buttons on the canvas remain), so spacing to them and the card insets are unchanged.
- **Toolbar:** "Views without IDs" button-style toggle (`QAW_Measure_LayerBordersToggle`), off on each open; when on,
  a `ColorPicker` without opacity (`QAW_Measure_LayerBorderColor`) sets the colour, default purple. The selected
  element keeps the accent outline either way. The pixel-found visible container outline uses the chosen colour
  (purple while borders are hidden).
- **Not persisted:** toggle and colour reset with the window; persisting the colour can come later if wanted.

## D-097 — Measure: labelled border toggle; accessibility attributes section removed (2026-10-14)

- **Trigger (user):** "No toggle visible for highlighting views without acc id. Also we can remove the accessibility
  attrribute section as none of that info is useful for any debugging." (screenshot: the toggle was the icon-only
  dashed square beside Capture again.)
- **Toggle:** now shows its title with the icon ("Views without IDs").
- **Removed:** the Accessibility attributes section, its per-selection AX read, the `notReported` state, attributes in
  Copy details, and the now-unused bridge code (`attributes(atPath:)`, `SimulatorAttribute`, `AXValueFormatter`).
  Selecting an element no longer makes a second Accessibility call.

## D-098 — R4a: tutorials with TipKit, ? menu, Settings › Tutorials (2026-10-14)

- **Trigger (user):** "We can proceed to R4" / "Let's continue to R4".
- **R4 sliced:** R4a tutorials (this), R4b demo run, R4c release build + new-person walkthrough.
- **Engine:** one generic `TutorialTip` whose rule is `activeTipId == its id` (a TipKit `@Parameter`), so the app, not
  TipKit, decides order, replay and reset; works on macOS 14 (no `TipGroup`). Tip ids carry a run number because TipKit
  keeps a closed tip closed for good. `TutorialCoordinator` stores progress per feature in defaults (Not seen /
  In progress n/m / Seen) and the auto-show switch.
- **Scripts revised to the built UI** (11 tutorials, at most 6 tips): the R0 scripts named controls never built (branch
  and repeat pickers, usage pill, approval card, step chip, Ask Claude). Added Scan, Reports, Measure, Working beside
  the Simulator. Recorded steps' last tip points at the list (recordings load after the tutorial starts).
- **Starting:** a section's own tutorial starts on first visit when auto-show is on; console and Simulator tutorials
  only from **?**. Starting opens what the first tip needs (section, panel, inspector, console, first test selected).
  Leaving a tutorial's screen pauses it (stays "In progress").
- **? buttons:** one **Tutorial** menu in each window's toolbar listing the tutorials for what is on screen, instead
  of a ? on every panel (less clutter, same reach). Measure has its own.
- **Not done from the script rules:** a spotlight, and "clicking the highlighted control advances". TipKit popovers
  point at the control instead; Next advances. Popovers close when focus leaves the app (TipKit); ? replays.
- **Bugs found while verifying:** (1) assigning the Advanced panel inside its own change listener re-published and
  looped at 100 % CPU; now assigned only on change, plus `removeDuplicates`. (2) The Blended Layers switch stayed off
  after the app was killed mid-pass; the device is now noted before switching off and turned back on at next launch.

## D-099 — R4b: demo run (2026-10-14)

- **Trigger (user):** "Commit, then build R4b" (after R4a, `88ac715a1`).
- **What it does:** from the **Tutorial** menu's "Demo run (about 3 minutes)" or Settings › Tutorials › Start demo run:
  checks Get ready and that SF-001 and SF-006 are loaded with recorded steps; arranges the window beside the
  Simulator and starts both as one batch (`POST /api/batch`, replay only, no Claude) with the "Working beside the
  Simulator" tutorial; when the queue goes idle it opens Results with its tutorial; **Next: Reports** opens Reports
  with its tutorial and ends with "That is the whole flow."
- **Never on a phone that isn't ready:** a red Get ready check stops it at once with that check's name and "use its
  Fix button"; missing recordings point to loading the test document. The server's own `refuseUnlessReady` is a
  second guard.
- **Stop demo** stops the batch (`POST /api/batch/cancel`, current case cleans up).
- **Differences from the R0 script:** Get ready isn't replayed check by check (its tutorial covers that); no sample
  report is opened (Reports shows the real run); the entry is in the ? menu and Settings, not a sidebar row.

## D-100 — R4d: Simulator screen; answers on Xcode, distribution, Claude window (2026-10-14)

- **Trigger (user):** a list of questions and requests (Xcode dependency, Xcode actions, usage doc, prerequisites,
  distribution, logo, reset, Bug Fix Validator, Simulator control screen, Scan feasibility, Claude window).
  Order chosen: tools first (R4d Simulator → R4e Build → R4f Reset → R4g logo → R4h docs → R4i approvals), then
  R5a Bug Fix Validator design (Jira attachments via a personal API token) and R5b Scan study. Distribution:
  build from the repo with a double-clickable installer (R4c).
- **Answers recorded:** Xcode must be installed and selected, never open (`xcodebuild`, `xcrun simctl`,
  CoreSimulator). A booted device is needed for runs; the Simulator app window only for Measure, Arrange and Outline.
  No terminal controls the driver: the server runs it and runs Claude as background sessions; the reasons to leave
  the app are approvals/questions (web Sessions tab today), Claude login, and reading a session in full → R4i.
- **Simulator screen (sidebar, ⌘7, after Advanced so ⌘1–⌘6 stay):** device picker (QA device preselected from
  `/api/device/screen`), Boot / Shut down / Show Simulator; Color Blended Layers toggle (CoreSimulator);
  app Relaunch / Kill / Open link for a bundle id (default com.blibli.mobile); UserDefaults Read / Write and
  relaunch / Delete (string, bool, int, float); Reset permissions, Reset keychain, Erase device (confirm dialog).
- **Safety:** every control is locked while a test or scan holds the phone; each button is one `xcrun simctl`
  command echoed with its result in the console (`ProcessCommandRunner`, reused by R4e).
- **Tutorial:** "Simulator controls", 5 tips; the form scrolls to the top when it starts (a tip can't attach to a
  control scrolled out of view). Reset sits above the taller settings form for the same reason.

## D-101 — R4e: Build screen (2026-10-14)

- **Trigger (user):** "Add all necessary Xcode actions via shell commands to execute with well named buttons in
  app … a dedicated screen or tab". Built as sidebar **Build** (⌘8), after Simulator.
- **Reuse, not a second build path:** Build for testing calls the server's QA pipeline (`POST /api/build/qa`),
  the same one Get ready's Fix uses: separate QA copy, own DerivedData, refuses while busy, stops the runner. The
  hard constraint holds: it runs only from a confirmed button.
- **Buttons:** Build for testing… (confirm) and Stop build with the live log; Check again; Open workspace in
  Xcode (your own clone: edits belong there, the QA copy is replaced on Prepare); Install pods in QA copy… (fixes
  "sandbox not in sync"); Clean QA build output / Xcode DerivedData with sizes (confirm; only those two folders);
  test runner Start / Stop. Xcode, CocoaPods versions are shown: Xcode must be installed, never open.
- **Not added:** archive/export, signing, scheme switching (the repo profile is set on the server), xcodebuild
  test (runs go through the runner). Clean is per folder here; R4f adds the one-step Reset.
- **CocoaPods** runs in a login shell, because the GUI app's PATH lacks Homebrew/Ruby-manager paths; paths go in
  as `$1`, never spliced into the script.
- **Tutorial:** "Building the app", 4 tips. Section-level `.tutorialAnchor` on a Form `Section` attaches to every
  row, so anchors sit on one control each; `TutorialCoordinator.activeAnchor` lets the screen scroll the tip's
  section into view (tip 3 was below the fold).

## D-102 — Fix Swift package errors (2026-10-14)

- **Trigger (user):** a pasted procedure for errors after a SwiftPM plugin is updated or modified: close the
  project, quit Xcode, force-remove DerivedData, `rm -rf ~/Library/Caches/org.swift.swiftpm` and
  `~/Library/org.swift.swiftpm`, open Xcode, open the workspace.
- **Built as one button** in Build › Xcode, **Fix Swift package errors…**, with a confirm dialog listing the
  steps, run in that order. Quitting Xcode closes the project.
- **Quit like ⌘Q** (`NSRunningApplication.terminate()`), not `kill`: Xcode can still ask to save. The
  app waits up to 60 s and stops with "Xcode is still open…" rather than deleting caches under a running Xcode.
  AppleScript `quit` was not used: it needs an Automation permission prompt.
- Reopens the user's own workspace (not the QA copy), or Xcode alone when no code is prepared. Locked while a
  test, scan or QA build runs, since the QA build shares the SwiftPM cache.
- The two SwiftPM folders are also separate rows under Clean, with sizes (cache was 2.3 GB).

## D-103 — Run without building; Install pods removed (2026-10-14)

- **Trigger (user):** "\"install cocoapods\" option can be removed. It is not needed. Add a button that runs
  Cmd + cntrl + R action on XCode." Removed the Install pods button, its dialog and the CocoaPods version row
  (that also drops the slow login-shell probe). D-101's CocoaPods notes are superseded.
- **Run without building (⌃⌘R)** presses Xcode's own menu item Product › Perform Action › Run Without Building
  (title and ⌃⌘R shortcut read from Xcode 26.3's menu bar) through Accessibility, which the app already has
  for Measure. No synthetic keystroke (that would need Xcode frontmost and could hit another app) and no
  AppleScript (Automation permission prompt). Xcode does the work for its open workspace, scheme and destination.
- Refuses with plain words when Xcode is closed, Accessibility isn't allowed, or the item is disabled (no
  workspace open or nothing built yet). Not locked by QA runs: it acts on Xcode's destination, not the QA copy.

## D-104 — Install & launch last build beside ⌃⌘R (2026-10-14)

- **Trigger (user):** asked whether Xcode is really needed; then "Let's use XCode then … After we test this we will
  try your recommendation too". Both are on the Build screen so they can be compared on the same build.
- **⌃⌘R finding:** Xcode reports every Product item (Run, Build, Run Without Building) disabled while it isn't
  the active app, so an Accessibility press in the background does nothing. The invoker now activates Xcode,
  waits up to 3 s for the item to enable, presses it, then reactivates TestForge. Verified: the app relaunched
  on Xcode's destination without a build. Cost: Xcode flashes to the front.
- **Install & launch (no Xcode):** source picker QA build (default) / My Xcode build; newest simulator app from
  that DerivedData (APPL only, test runner skipped); `simctl install` + `launch` on the Simulator screen's device,
  else the QA simulator. No debugger and no scheme launch arguments, by design. Verified with My Xcode build on the
  dev simulator. Locked during QA runs; ⌃⌘R isn't (it acts on Xcode's destination).
- **Caution:** installing My Xcode build (Debug) on the QA simulator replaces the QA app there; the next test run's
  readiness check then asks to reinstall. Pick the dev simulator on the Simulator screen for Xcode builds.

## D-105 — Install for testing replaces ⌃⌘R (2026-10-14)

- **Trigger (user):** "I am ok with what suits best for app button click to installing the app for test case
  validation. Whatever method works clean and smooth, add that as action to the button".
- **Chosen:** one prominent **Install for testing** button on the Build screen, using the existing pipeline.
  Built from the prepared code → stop the runner and start it again: `test-without-building` installs the QA app
  (PerformanceTest) and the test runner on the QA simulator, replacing any Debug build there. Not built or built from
  older code → "Build first?" (Build and install / Cancel) → Build for testing, then the install runs by itself
  when the build succeeds; a failed build says so and installs nothing.
- **Why not ⌃⌘R / Install & launch for tests:** both put the Debug app (no test runner) on a simulator; tests
  need the PerformanceTest app plus the runner. ⌃⌘R also needs Xcode in front. ⌃⌘R is removed;
  Install & launch stays for a quick manual look. Start test runner is folded into Install for testing.
- **Fixes found on the way:** the harness answers HTTP 200 with `ok: false` on failure — now shown as an error;
  starting the runner can take up to 4 min, so that call waits 300 s instead of 60.

## D-106 — The test runner stops recording video (2026-10-14)

- **Found:** the first Install for testing failed with "unable to write manifest": the disk had 177 MB free.
  The QA simulator held 72 GB, 68 GB of it in 20 XCTest attachment files (14–16 GB each) under
  `data/Containers/Data/InternalDaemon/<id>/Attachments`: XCTest's automatic screen capture records the whole
  QADriver session, which runs for hours.
- **User's choices:** delete the recordings (done; 64 GB free) and turn off the runner's screen capture.
- **Where the fix goes:** `BlibliMobile-iOS/QADriver.xctestplan` (the runner's own test plan), not harness.py:
  xcodebuild has no flag for it and test plan options are baked into the build. Added
  `preferredScreenCaptureFormat: "screenshots"` and `systemAttachmentLifetime: "keepNever"`. Proof screenshots and
  videos the testforge takes (`QA_MEDIA_ROOT`, simctl) are unaffected.
- **Takes effect with the next build:** the QA copy was re-prepared from the working copy (88ac715+b354) so the build
  picks it up. To verify after a session: the Attachments folder stays near empty.
- **Follow-up for R4f Reset:** include "delete QA simulator test recordings" for sims built before this change.

## D-107 — End-to-end validation; runner screenshots go into Reset (2026-10-14)

- **Trigger (user):** "You press the required buttons and proceed the validation."
- **Done in the app via Accessibility:** Build › Install for testing → Build and install; the build took 1006 s and
  the install followed by itself; Get ready › Shut down the others (the dev simulator); ? › Demo run.
  Result: all readiness checks green, SF-001 PASS, SF-006 PASS, demo walked Results → Reports.
- **Recording check:** with the D-106 test plan, the runner keeps screenshots only while steps run (151 PNGs,
  ~138 MB for the two replays; nothing while idle). Small per run but cumulative, so R4f Reset will delete the QA
  simulator's XCTest Attachments folder (runner stopped first).

## D-108 — R4f: Reset for a fresh run (2026-10-14)

- **Trigger (queue):** R4f — one step that clears what test cycles leave behind, sizes shown, one confirm, never
  discarding uncommitted work.
- **User decisions:** "repo to clean state" = **testforge files only** — no git command ever runs; the repo row
  only reports branch + uncommitted-file count ("left alone"). Placement = **a section on Build (⌘8)**, below Clean.
- **Server owns the paths** (`lib/reset.js`, `GET /api/reset/plan`, `POST /api/reset {ids}`): every path is fixed in
  code; the request carries ids only and any unknown id is refused (400). Refused while a test, scan, build or
  another reset holds things (409). Runs as a job, so the log streams like a build's.
- **Items (ticked by default first):** QA build output (`~/.testforge/derived`, all, incl. the loaded copy's — a
  fresh run rebuilds anyway), old QA copies (loaded copy kept), test runner screenshots (QA sim
  `InternalDaemon/*/Attachments`, D-106/D-107), proof screenshots/videos (`QA_MEDIA_ROOT` contents, folder kept);
  unticked: run history (finished Results runs, tasks, Claude sessions + transcripts, runs.json), Xcode DerivedData,
  SwiftPM cache. Items that touch runner output stop the runner first.
- **Safety:** `QA_MEDIA_ROOT` that is unset, relative, `~` or fewer than 4 path segments is never measured or
  emptied (a test with `/Users` first ran `du` over all of /Users — sizing now checks the root first, and Reset no
  longer re-measures the plan before deleting).
- **Mac app:** own `ResetSectionViewModel` (Build's VM is near the type-length limit), `ResetSectionPresenting`
  protocol, state enums; reports up through `onFinished` so Build reloads its sizes and QA build state.
- **Reuse:** `freeDiskSpace` gained `kinds` + `keepCurrent`; `ResultsStore.clearFinished`,
  `SessionManager.removeFinished`, `history.clearRuns`.

## D-109 — R4j: proof folder picker + Test Batches (2026-10-15)

- **Trigger (user):** "Add an option to browse and select folder for proof-media which is used to construct the
  report in the app at the early stage before tests start. Make it mandatory before user can run any tests. Also add
  concept of session in the app. So each session can consist of a batch of tests, macros, etc."
- **User decisions:** proof **root chosen once**, a **subfolder per batch**; the concept is named **Test Batch**
  (Claude conversations keep "session"; the Mac app never shows that word, the web UI's Sessions tab is unchanged);
  **named, one active at a time, holds everything** started while active; no active batch → no tests.
  Queued as R4j, before R4g logo.
- **Server (`lib/test-batches.js`, `routes/test-batches.js`):** `.data/settings.json {proofRoot}`,
  `.data/test-batches.json`. `QA_MEDIA_ROOT` is no longer read from start-up config as the answer: the store sets
  `process.env.QA_MEDIA_ROOT` to `<root>/<active batch folder>` (or the root when none), so every existing proof
  write and every child the server spawns (harness, Claude → qa-driver MCP) follows the batch. A Claude process
  already running keeps the folder it started with. The old env value is only offered as the picker's suggestion.
- **Gate:** two blocking readiness checks first — "Proof folder chosen" (fix `choose-proof-folder`), "Test Batch
  active" (fix `start-test-batch`) — so every test and macro start is refused (423) until both pass. Proof root:
  absolute, existing, writable, not `~` or fewer than 4 segments. Changing the root, starting and ending are refused
  while a test runs; changing the root is refused while a batch is active.
- **What a batch collects:** every queued task (case replays, macro replays, Claude test runs, Claude tasks), every
  multi-case run (Results), Claude chats not started by a task, and scans. A run's per-case tasks appear both as the
  run and as their own rows — kept, since each row has its own outcome.
- **End:** writes `report.md` into the batch folder — a table of everything collected, then each run's own report
  (headings demoted one level) — and reveals it in Finder. Folder names: local `YYYY-MM-DD_HH-MM-SS_<name>`.
- **Reset (D-108)** now empties the proof root but keeps the active batch's folder.
- **Mac:** `TestBatch/` (pill in the toolbar: Choose proof folder / Start / End / Show folder; start sheet;
  `NSOpenPanel` via `DesktopActing.chooseFolder`); Get ready's two new rows open the same panel and sheet.
  Web: the two fixes prompt for a typed path / name (no end button on the web; end from the Mac app).
- **Incident:** while restarting the :4646 copy, `pkill -f "node server.js" -P 1` also stopped the live :4545
  server; it was restarted with `start.sh` on the then-current code (D-108 + R4j server, before the folder-name and
  web fixes). Copies are now stopped by port only.
- **Scan request status (asked by the user):** R5b "Scan feasibility study" is still queued, not started; the
  docs had kept only its title. Open offers remain: scan "Nothing was saved" message + Stop confirmation.
- **UI check fixes (same day):** the pill's Label showed icon only in the toolbar → `.labelStyle(.titleAndIcon)`;
  a container identifier on the start sheet's VStack and on the Reset `Section` replaced every child's own
  identifier → sheet gets `.accessibilityElement(children: .contain)`, Reset's id moved to its header; readiness
  now refreshes on every batch change (`stateHub.poke("readiness")`) instead of waiting for the 30 s poll.
  :4545 restarted on all of it; the user's app reopened on :4545.
- **First real run in a batch (user's "B1", 5 replays, all PASS) found a regression:** the XCUITest runner writes
  screenshots under the folder baked into `QADriver.xctestplan` (`QA-Test` → `~/Documents/QA-Test`), which can't
  follow the batch, so Results showed 0 screenshots. Fix (no rebuild, no runner restart): evidence is searched in
  the batch folder **and** the runner's folder (`QA_RUNNER_MEDIA_ROOT`, default `~/Documents/QA-Test`); a case's
  runner files are copied into `<batch folder>/<case id>/` and evidence points at the copies. Copies keep the
  original mtime — the 2nd run showed a fresh mtime pulls the previous case's copy into the next case's window.
  3rd run: 5/5 PASS, one screenshot per case in its own subfolder. The 1st and 2nd runs' Results keep their
  original (empty / doubled) evidence.

## D-110 — R4k: video recording as run proof (2026-10-15)

- **Trigger (user):** "I want to run 2 test where video recording is added as proof."
- **What exists:** only Claude runs could record (qa-driver `qa_start_recording`); driver replays could not, and
  the runner's own XCTest video stays off (D-106).
- **Built:** `POST /api/batch {recordVideo: true}` → per case, `lib/video-recorder.js` runs
  `xcrun simctl io <QA sim> recordVideo --codec=h264 --force <batch folder>/<case>/<case>-<stamp>.mp4` before the
  case starts and stops it with SIGINT (simctl only finalises on interrupt; SIGKILL after 20 s) when the case's job
  ends. Evidence gets `videos` (kept out of the screenshot strip); report.md adds "+ N video" and 🎬 lines; the Mac
  Results inspector shows "Video proof (N)" links that open the movie.
- **Verified (live :4545, batch B1):** SF-001 + SF-006 with video → both PASS; SF-001 67 s, 1284×2778 H.264, 115 MB;
  SF-006 128 MB; a frame at 60 s shows the Flash Sale page; Results › SF-001 shows "Video proof (1)".
- **Size:** full-resolution H.264 is ~1.7 MB/s — Reset's proof-media item clears it; downscaling is a later option.
- **Not built:** a Record-video toggle on the Mac Tests screen — that screen only starts single-case replays
  (`/api/macros/v2/:id/replay`), which don't create a Results run. Multi-case runs come from the web UI, the demo or
  the API. Offered to the user as a follow-up (multi-select run on Tests with the toggle).

## D-111 — R4g: app icon (2026-10-15)

- **Design (my call, open to the user's changes):** macOS squircle on the standard 824 pt grid, blue gradient;
  a white phone (Dynamic Island) showing three passed test-step rows; a green check badge over its corner —
  "tests on a phone that pass".
- **Source of truth is code:** `tools/testforge-mac/scripts/make-icon.swift` draws `Assets/AppIcon-1024.png`
  with CoreGraphics (no design tool needed; change colours/shapes there and re-run). `make-app.sh` turns the PNG into
  every size (`sips`) → `AppIcon.icns` (`iconutil`) and sets `CFBundleIconFile`.

## D-112 — Automatic video for interactive runs; SF-054 + SF-061 learned (2026-10-15)

- **Trigger (user):** "Run SF054 and also find a test case which validates whether the schedule timeout bottom sheet
  is shown … The tests must automatically record videos for these as these have user interaction."
- **Policy:** `POST /api/batch` `recordVideo` now defaults to **"auto"** (also for re-runs and saved setups):
  every Claude run is recorded (a first run is reviewed by a person), and a replay is recorded when its macro — with
  the macros it runs — has a `tap`, `type`, `typeSecret`, `swipe`, `scrollTo`, `scrollToTop` or `alertTap` step.
  `true` / `false` still force it. Size: ~1.7 MB/s.
- **Schedule-timeout case found:** SF-061 "Present a non-dismissible refresh prompt when a schedule/sub-FS transition
  is reached" (bottom sheet, single Refresh, can't be dismissed).
- **Runs (batch B1, Claude, auto video):** SF-054 PASS → learned as macro (replay passed); SF-061 first run
  UNDECIDED (sheet appeared, harness detached before the dismiss check) → re-run PASS (sheet appeared, swipe down
  left it in place) → learned. Videos: SF-054 + both SF-061 runs; frames show the countdown at 00:01:08, then the
  sheet "This page has been updated / Refresh", still up a minute later.
- **Repo mock pack fixed by hand:** the SF-061 macro needs `sub-flashsale/range` variant `sf061-soon` and
  `special-placement` variant `valid-control`, which Claude created only on the simulator. "Save mocks to repo"
  would also have rewritten four committed variants' bodies (simulator-retimed timestamps), so only the two missing
  variants were added to the packs (no existing lines changed). `sf061-retimed` (Claude's scratch) was left out.

## D-113 — Video only when a screenshot can't prove the case, filmed over its own action (2026-10-15)

- **Why:** D-112 filmed every Claude run and every interactive replay from app launch — long, large movies whose
  first minute is navigation nobody reviews. A static state, or a tap that lands on a new screen, is proven by
  screenshots.
- **Rule (`lib/video-plan.js`):** `needsVideo` reads the case's scenario/steps/expected for motion or timing words
  (countdown, timer, animation, scroll, sticky/pin, appears/presents automatically, dismiss, freeze, left open…). No
  match → no video. Launch/home-page words in the case or precondition → film from launch.
- **Replays:** `planVideo` picks the behaviour step — the first own (non-routine, non-optional) action after the first
  assert, else the last own action before it; a `waitFor` ≥ 15 s counts as a transition. Filming starts at that step
  (or the check right before it, to show the before-state) and stops after the last check. A clip longer than 60 s
  is cut to its **last** 60 s (`trimToLast`, ffmpeg stream copy; full clip kept without ffmpeg); safety stop 300 s.
  A front cap was tried first and failed live: SF-061's 96 s wait was cut at 60 s, before the sheet appeared — the
  proof of a wait is at its end.
  `videoWindow` in the replay-v2 task starts/stops `simctl recordVideo` on those step indices; preconditions and
  cleanup are never filmed; the movie path goes to `job.meta.videoPath` → the batch item.
- **Claude runs:** the server no longer records them; the prompt carries `videoGuidance` (whether to film, start right
  before the case's own action, stop after the last check, < 60 s). The `.mov` from `qa_start_recording` is collected
  as a video, not a screenshot.
- **Overrides:** `recordVideo: true` still records the whole case on the server; `false` records nothing and tells
  Claude not to.
- **Effect on learned macros (dry run):** SF-061 and SF-084 filmed; SF-054 (tap → PDP) and the other static cases
  not — a change from D-112, where the user asked SF-054 to be recorded.
- **Verified (live :4545):** SF-061 replay PASS, 58.5 s clip from the countdown to the sheet staying up after the swipe.

## D-114 — A Claude run gets the case's row in its prompt; SF-062 learned (2026-10-15)

- **Why:** the first SF-062 run (user: "run SF-062 too as it is extension of 61") was BLOCKED without running ($1.05):
  `/qa-run` re-reads the document, the local page snapshot ends at SF-035, and Confluence was unreachable (Atlassian
  MCP unauthorized, REST token 401). The dashboard already holds the row in `.data/testcases.json`.
- **Change:** `enqueueQaRun` appends `caseRowText(testCase)` — precondition, steps, expected, API, evidence — to the
  prompt, to be used when the document can't be read.
- **Run (batch B1, Claude, auto video):** SF-062 PASS → learned as `mc_9FVWX9VP1F`
  (`Engagement/FlashSale/macros/sf-062-refresh-reloads-page-and-arms-new-timer.json`), replay PASS. Claude filmed
  itself per D-113: `SF-062.mov`, 22 s — prompt up → Refresh → page reloaded with "QA SF062 After Refresh" and a new
  countdown → the prompt again when it ran out. Total $6.37 (run + learn $3.81).
- **Repo files from the run:** `QAMacros/elements.json` and the sub-flashsale range pack gained entries (additions only,
  no committed variant rewritten).

## D-115 — Results: Show in Finder for each case (2026-10-15)

- **Trigger (user):** "each test case which is completed validation and has a result, user must be able to click a
  button and reach to its corresponding folder on disk".
- **Server:** `collectEvidence` adds `folder` — the case's own `<batch folder>/<case>/` when it exists, else null.
- **Mac:** `proofLocationURL` = that folder; else the first screenshot/video — its parent folder when it is named after
  the case (runs recorded before D-115), otherwise the file itself. A folder opens in Finder; a file is shown selected
  (`activateFileViewerSelecting`) because its folder is shared — a case that failed before its own screenshot step has
  its only proof in `<batch>/failures/`, mixed with other cases (seen on SF-062's BLOCKED run; the first version opened
  that whole folder). Inspector "Show in Finder" + the same item on the case row's context menu; "No proof saved for
  this case" when there is none. `ResultProofActions` groups open-file + show-in-Finder.

## D-116 — Simulator screen revamp with SF Symbols (2026-10-15)

- **Trigger (user):** "simulator section needs better UI and use of SF Symbols" (screenshot of the grouped Form).
- **Layout:** the grouped `Form` (a narrow column with empty space beside it on wide windows) is replaced by a page
  capped at 1100 pt: a device card (`iphone` symbol tinted when booted, device menu as the title, Booted/Shut down badge,
  iOS · UDID with Copy, one power button — Boot or Shut down — Show Simulator, Refresh), a status banner, then
  two columns of cards (adaptive, min 380 pt) with tinted symbol headers: App (`app.badge.fill`), Display
  (`paintpalette.fill`), Saved settings (`gearshape.2.fill`), Reset (`arrow.counterclockwise`). Every button has a symbol.
- **Unchanged:** `SimulatorControlViewModel` behaviour, every existing accessibility identifier and tutorial anchor.
  New identifiers (user picked all four): state badge, Copy UDID, each card and its header.
- **Skill chain:** swiftui-code-gen → swiftui-architect (**advisory**: restyle of existing views; one shared VM kept) →
  swift-codegen rules (plugin not loaded in the session; rules read from the plugin cache) → swiftui-components
  (Mac-native carve-out, D-081) → localization (package has an English-only String Catalog, no Base/id pair — nothing
  to add).

## D-117 — Scan: automatic screen + tap detection, flow map — feasibility and proposal (2026-10-15)

- **Trigger (user):** "Scan mode — auto detecting screen, smartly analysing what button was tapped to next screen. Or if
  possible trace the taps using available simulator data and create a tree of user flow between those screens."
  (This is the R5b request, restated.)
- **Today:** `scan_mode.py` polls `dumpTree` through the harness every 1.5 s and needs the person to name each screen
  (`mark <name>`); it never knows what was tapped. The harness can't observe a person's taps: XCUITest only drives.
- **Spike (scratchpad `scanspike/hit.swift`):** the Simulator's own accessibility tree carries the app's elements with
  their identifiers and labels in Mac screen points (D-089). `AXUIElementCopyElementAtPosition` at a point returned the
  exact element for 10/10 Home elements in 3–26 ms; reading the whole visible tree took ~1.1 s.
- **Proposed design (no iOS app change, no harness):**
  1. *Tap capture* — the Mac app (already Accessibility-trusted) watches mouse-down in the Simulator's device area
     (`NSEvent` global monitor), resolves the element under the point **at that instant** (before the screen changes):
     identifier, label, role, frame. Drags become swipes/scrolls; keystrokes while the Simulator is in front become
     "typed into <field>".
  2. *Screen detection* — after each tap the visible tree is read once it settles; a screen's fingerprint is its set of
     stable identifiers (numbered suffixes like `_0…_11` collapsed, data-only text dropped). Same fingerprint (by
     overlap) → same screen; new → new node, auto-named from its navigation title, else its dominant identifier
     prefix (`FS_` → "Flash Sale"); the person can rename. Two screens differing only by data (empty vs full cart) are
     variants of one node, as `scan_mode.py` already does.
  3. *Flow map* — nodes = screens (thumbnail from `simctl io screenshot`, identifiers, API calls seen from the
     NetworkLens trace while on it), edges = "tap `<element>`" (or swipe/back/deeplink) with counts. Shown as a tree
     from the start screen in the Scan section; saved as JSON beside the scan; exportable for Claude runs (proven
     routes into each screen = entry steps for new macros).
- **Limits:** only taps on elements with an identifier or label are named (others are "tap at x,y on <screen>");
  taps the harness makes are not mouse events, so test runs are not mapped (by design — scan is a person walking);
  system alerts and the keyboard sit outside the app's tree. Optional later step for exact screen identity: the QA
  NetworkLens fork logs view-controller appearances — needs an app rebuild, so not first.
- **Status → built (user chose "taps + screens + tree", no app change).** Implementation:
  - Bridge: `SimulatorLocating.element(at:)` (`AXUIElementCopyElementAtPosition`, checked to belong to the Simulator's
    pid) and `deviceWindowTitle()`; `SimulatorControlling.screenshot(udid:path:)`.
  - `GlobalPointerMonitor` (`NSEvent` global monitor, mouse down/up in Accessibility coordinates). Mouse-down inside the
    device screen rect resolves the element at once; mouse-up < 12 pt away is a tap, else a swipe by dominant axis.
  - `FlowScreenMatcher` (pure): fingerprint = visible elements' identifiers with numbered suffixes stripped; title =
    topmost centred text in the top 18 % (status-bar clock skipped); name = title, else the dominant identifier prefix
    (≥ 3) + " screen", else "Screen N". Match = Jaccard ≥ 0.55, or ≥ 0.3 with the same title; a revisit widens the
    stored fingerprint.
  - `FlowMapViewModel`: gestures queue and run one at a time; after each, the tree is read every 0.6 s until two reads
    agree (≤ 5); same screen → "stayed on", else an edge (repeats counted). New screens get a simctl thumbnail (device
    from the window title, or the only booted one). Saved after every change; the newest map reloads on launch.
  - `FlowTreeBuilder` (pure): breadth-first tree from the start screen, each screen once where first reached; other
    edges as link rows. UI: Scan gets a Flow map | Screen surfaces switch (Flow map default); header (Record / Continue
    recording / Stop, New map, Show in Finder, live "tap “Show all” → Flash Sale" line), tree, detail with thumbnail,
    editable name and clickable reached-by / leads-to rows.
  - Not in v1: keystrokes ("typed into …"), back-swipe from the edge as its own kind, screens that change with no
    gesture (timers — the SF-061 sheet), API calls per screen, route export for macros.

## D-118 — In-app proof viewer: zoomable screenshots, video player (2026-10-15)

- **Trigger (user):** "integrate imageview and video player within the app itself to view, zoom in, zoom out, play
  pause, stop media mainly for the proof reading".
- **What:** a "Proof" window (`Window` scene `proof`, owned by `TestForgeViewModel` like Measure). Clicking any
  screenshot or video in Results › case inspector opens it on that file with the case's other proof (screenshots then
  videos) one arrow-key away and in a thumbnail strip. Toolbar: previous/next, Open in default app, Show in Finder.
  Closing the window stops a playing video.
- **Image:** fits the window by default; zoom bar (− / % / + / Fit ⌘0 / Actual size ⌘1, ⌘+ ⌘−), trackpad pinch,
  double-click toggles fit ↔ 100 %, scroll bars pan. Above 200 % pixels are drawn unsmoothed so a 1-pt misalignment
  stays visible — the point of proof reading.
- **Video:** `AVPlayerView` with its own controls off; our bar: frame back (,), play/pause (space), stop (pause + back
  to 0), frame forward (.), scrubber, time in tenths of a second, speed 0.25×–2×, zoom (the player view's
  magnification; pinch works too). Note: simctl recordings are variable-frame-rate, so a frame step on a still screen
  moves ~0.5 s — that is the next frame the file has.
- **Structure (swiftui-architect hard mode, new feature):** `ProofViewerViewModel` (main) builds and owns
  `ProofImageViewModel` (state `empty/loading/loaded/failed`, zoom `fit/scale`) and `ProofVideoViewModel` (state
  `empty/loading/ready/failed`, AVPlayer, time observer removed in `deinit`); views `ProofViewerView`, `ProofImageView`,
  `ProofZoomBarView`, `ProofVideoView`, `ProofPlayerView` (NSViewRepresentable), `ProofPlaybackBarView`,
  `ProofThumbnailStripView`. Results' old "open in Preview" path (`openScreenshot`) is gone; Preview/QuickTime is one
  click away in the viewer's toolbar.

## D-119 — Replays independent of device size and OS: relative rules, identifier-first (2026-10-15)

- **Trigger (user):** "Make reruns independent of device size, scale. Rerun/replay must be purely accessibility id
  driven, device and OS should not be an issue there" + "Wherever screen size is blocking convert it to a relational
  rule than fixed numbers". (Context: two different simulators showed in the app; the question was switching devices.)
- **Audit:** no macro step uses coordinates — all 46 address registry elements. The runner is already relative:
  swipes run 75 % → 20 % of the scroll view, taps hit the element's normalized centre, `scrollUntilExists` loops on
  *hittable*, not *exists*. Two size-dependent gaps were in the replay engine: (1) `scrollUntilExists` only scrolls
  down the page, so an element left *above* the viewport is never reached; (2) a tap/type on an element that exists
  but sits below the fold on a smaller phone (or under the keyboard) simply failed "not hittable".
- **Fix (`lib/viewport.js`, used by `runStep`):** when an identifier tap / type / scrollTo misses with "not
  hittable", the engine reads the window size once per replay (`deviceInfo`), reads the element's frame, classifies
  it *relative to the window* — centre in the top 12 % → above (nav bar band), bottom 12 % → below (tab bar band),
  off the sides → left/right — dismisses the keyboard, swipes toward it with the runner's relative swipe, and repeats
  until it is in view or its frame stops moving (cap 12 nudges), then retries the step once. No point values
  anywhere: a smaller phone just takes more nudges. Step lines show "(scrolled into view: N swipes from below)".
  Tests: `test/viewport.test.js` — the same macro passes on a 932-pt and a 667-pt window; only the small one scrolls.
- **Still not identifier-driven (needs the iOS app, see the audit table in progress.md):** 25 of 56 registry
  elements are found by visible text (EN/ID spellings) and 3 by an `index`. Text locators survive size and language
  (both spellings are listed) but not copy changes, and `index` can shift where a bigger screen renders more rows.
  System UI (iOS AutoFill suggestion, alerts) can never carry an app identifier — those stay text by necessity.
- **Follow-up (user: "Flash Sale only first", then "Runner: anchor ID + child"):**
  - **App (POC branch, uncommitted, lint-clean, not yet built):** `FSAccessibilityIdentifier` gains position-indexed
    ids (`indexed(by:)`): `FS_SubFlashSaleCard_<page>` on each Sub-FS schedule card (`.accessibilityElement(children:
    .contain)` so the title keeps `FS_Shared_SectionHeaderTitle`), `FS_SubFlashSaleProduct_<n>` on its product cards,
    `FS_SpecialPlacementProduct_<n>` on Special Placement products; the merchant row became `.contain` too (its id used
    to be copied onto every child, which is why SF-035 needed `index`). Position, not data, so the same id holds on any
    device, language or fixture.
  - **Runner (Utility fork `~/Projects/Tools/blibli-utility`, branch `darshan/innovation/qa-mocker-testing`,
    uncommitted, typechecks clean against the iOS simulator SDK):** new `within` key — every lookup (tap, type,
    getFrame, getLabel, waitFor/NotExists, assertExists, scrollUntilExists) can be scoped to a container identifier,
    and inside one `identifier` may be dropped to pick an `elementType` child by `index`. For children that BLUE /
    Common components give no id: `BliTab` items, `ErrorView`'s Refresh, `BliOnboardingTooltip`'s Skip. Needs a new
    tag `qa-mocker-testing-6` (push only with the user's OK), re-pin `SwiftPackageList.txt`, then Install for testing.
  - **Engine:** a two-link `chain` (`[{identifier: container}, {identifier | type+index}]`) plans as `within` +
    child; nudge-into-view works on it too. Test: `test/viewport.test.js` (146/146).
  - **Registry switch — apply only after the rebuild** (the installed build/runner have neither the ids nor `within`;
    switching now would break replays): see progress.md › D-119 table.

## D-120 — Test device you can choose; Simulator screen follows it; Measure without the test runner (2026-10-16)

- **Trigger (user):** "no way to switch simulator — the app shows 2 different simulators" → options A (Simulator
  screen follows the test simulator) and B ("Use for tests" on any simulator); user: "Can we support both?" … "Do I need
  harness and build compiled for testing to use Measure on any simulator?" → "Yes" (make Measure runner-free, with A+B).
- **Why the two screens disagreed:** Get ready used the "QA · " clone; the Simulator screen asked the *test runner*
  (`deviceInfo`) and, with no runner, fell back to the first booted device and kept that selection.
- **B — server (`lib/test-device.js`):** the test device is the simulator saved in `.data/test-device.json` ("Use for
  tests"), else the "QA · " clone. `findQaSimulator` resolves it and notes its UDID; `deviceArg()` replaces every
  `simctl … booted` (screenshots, launch/terminate, deep links, app container, defaults, readiness, preconditions,
  live screen) and `NETWORKLENS_UDID` pins NetworkLens's own lookup (the copied `lib/container.js` is not edited).
  Claude sessions get `QA_DEVICE_UDID` + `NETWORKLENS_UDID`. The harness gets the test device's UDID (the build is
  device-independent), and "App installed from this build" checks that device. Other booted simulators are now
  informational ("also booted: … (left alone)") instead of blocking — the old one-booted-simulator rule existed only
  because commands said `booted`. `GET /api/test-device`, `POST /api/test-device {udid|null}` (refused while a test
  runs; stops the harness when the device changes; readiness re-checked at once).
- **A — Mac Simulator screen:** opens on the test device (asked from the server, not the runner) with a "Used by tests"
  badge; any other simulator shows "Use for tests"; a chosen one offers "Back to the QA clone"; the device menu marks
  the test device.
- **Measure (and the flow map) without the runner:** `CoreSimulatorDevices` (shared with Color Blended Layers) reads
  each device's name, runtime, state and screen size (pixels ÷ scale → points); `WindowSimulatorScreen` matches the
  Simulator window's title exactly ("iPhone 12 Pro Max – iOS 17.5" ≠ "QA · iPhone 12 Pro Max – iOS 17.5" — the old
  prefix match could confuse a clone with its source), and screenshots that UDID. Measure measures whatever device the
  Simulator window shows — any simulator, any app, no build for testing, no harness.
- **Verified:** API switch to the dev simulator and back (readiness followed: installed-build check said "not from
  this build" on the dev sim, matched again on the clone; choice file removed); Simulator screen opened on the QA clone
  with "Used by tests"; Measure on the dev simulator (no runner there) — 428 × 926, 17 elements, layer pass.
  `npm test` 147/147; Mac build + SwiftLint clean.

## D-121 — "Phone remote" renamed "Simulator Driver" (2026-10-16)

- **Trigger (user):** confused the panel with Claude's remote control (`/remote-control`, driving this session from a
  phone) — "rename Phone Remote to something which means the driver controlling the simulator".
- **Change:** the Advanced panel and its tutorial are now **Simulator Driver**; tutorial copy says "the test driver" /
  "the driver's reply" instead of "the phone". Code names (`PhoneRemoteViewModel`, `phoneRemote*` anchors and
  `QAW_*PhoneRemote*` identifiers) are unchanged, so nothing that drives the app by identifier breaks. The Simulator
  screen tip now explains "Used by tests" / "Use for tests" (D-120).

## D-122 — "Fake data" renamed "Network Mocks" (2026-10-16)

- **Trigger (user):** "Rename Fake Data to Mocked or Smart Map Local or suggest similar" → picked **Network Mocks**
  (matches `mock` steps, mock packs and NetworkLens; "Map Local" implies a local file, ours are named variants).
- **Change:** Advanced tab and tutorial "Network Mocks"; master switch "Network mocks"; status "Network mocks are
  on/off"; Results "Mocks that answered"; recorded-steps badge "Uses network mocks"; live steps "Mock: …", "Mock off:
  …", "Network mocks on/off", "Load mock pack", "Mock scenario …". The tutorial tip that promised "marked Faked or
  Real" in the call list was wrong (the list has no such mark) and now says to select a call to see its answer. Code
  names (`FakeData*`, `fakeData*` anchors, `QAW_Advanced_FakeData*` identifiers) unchanged.
- **Verified:** relaunched app shows tabs Network Mocks · Recorded steps · Simulator Driver and the status "Network
  mocks are on, 17 rules · …"; `npm test` 147/147 (narration tests updated; a chained replace that produced
  "Mock: off:" was caught by them and fixed).

## D-123 — Measure accuracy: spacing on the spacing scale, text measured to glyphs too (2026-10-16)

- **Trigger (user):** "focus on accuracy of the padding and spacings shown by measure tool. I still see a lot of odd
  number values"; then "Padding, spacings will always be whole. 9.17 becomes 10. 8.17 becomes 8" → "Nearest BLUE spacing
  token" → "Do not use blue sdk names. show raw numbers only always"; text: "Both: box + glyphs".
- **Investigation (QA clone, mocked Flash Sale via SF-024):** the Simulator's accessibility frames are exact to ~0.01 pt
  (e.g. the Sub-FS title at x 28.00 = 16 page inset + 12 title padding, back button 16, 57, 24 × 24). The odd numbers
  were true fractions shown as whole points — text line boxes (17.67 tall → a centred label sits 9.17 from its field),
  SwiftUI half-point centring (y 160.49), cards found from pixels (±1 px) — then rounded to the nearest point.
- **Rule:** spacing is shown on the app's spacing scale as raw numbers: 0, 1, 2, 4, then multiples of 4 (every spacing
  token 8/12/16/24/32 and every sum of them, e.g. 20, 28). 9.17 → 8, 8.17 → 8, 13.4 → 12, 28 → 28; ties go up. The
  token-only scale was rejected after measuring: an exact 28-pt inset (16 + 12) would have shown 32. Note to the user:
  this scale has no 10, so 9.17 → 8 (their example said 10).
- **Text:** `TextInkDetector` finds the glyphs' ink box inside a label's frame (background = commonest border colour,
  ink = channel difference > 48); Measure adds "Spacing to glyphs" next to the line-box values.
- **Verified:** Sub-FS title — left 12 / top 12 inside the card, 28 from the screen edge, top 16 to the glyphs.

## D-124 — Measure: snapshot with numbered notes, saved or copied as one PNG (2026-10-16)

- **Trigger (user):** "In the measure screen add option where user (QA, UX, PMs) can select a view with its padding
  visible, take a snapshot … add notes, on submit the notes must be marked on the image itself and new image download
  option must be provided." Choices: numbered pins + notes list; IDs on the button, notes, pins, image, sheet buttons.
- **Built:** Measure toolbar "Snapshot with notes" (enabled with a selection) → sheet: the screenshot cropped to the
  selected view's nearest parent (+16 pt margin; a view directly on the screen keeps 32 pt), the view outlined, its
  spacing lines with on-scale numbers. Click the image to drop pins 1, 2, 3…, one note field per pin (removing a pin
  renumbers the rest). **Save image…** (PNG save panel) or **Copy image** (pasteboard, for Jira/Slack). The PNG = the
  annotated crop + the view's name, the numbered notes and the capture time, rendered at the device's pixel density
  (3× → as sharp as the capture), fixed colours so it looks the same in dark mode.
- **Code:** `Measure/MeasureSnapshotModels` (draft, pin, content), `MeasureSnapshotViewModel` (pins, render via
  `ImageRenderer`, save/copy through `DesktopActing.saveImage` / `copy(pngData:)`), views `MeasureSnapshotSheetView`,
  `MeasureAnnotatedImageView` (shared by preview and export), `MeasurePinBadgeView`, `MeasureSnapshotNoteRowView`.
- **Verified:** on the QA clone's Flash Sale, Sub-FS title → Snapshot → Copy image: PNG 1259 × 693 px showing the card,
  the outlined title, 12 / 12 / 20 / 252 (labels centred on their lines after a fix) and the title + time below.
  Pins and Save not driven (pins need a real click on the image).
- **Seen while testing:** `osascript quit app "TestForge"` returned "User cancelled (-128)" while the Measure window
  was open (no sheet or dialog); a normal terminate signal worked. Not investigated yet.

## D-125 — NetworkLens console: analysis and recommendation (2026-10-16)

- **Trigger (user, item 2):** drive the whole network interceptor from TestForge without opening its in-app UI;
  read data and project changes, mocks and packs into the simulator; reduce MCP dependency, use scripts where possible.
  User's order for the list: 2 → 1 → 4 → 5 → 7; 3 on hold ("TBD"); 6 not mentioned (folded into 1 unless told).
- **Findings and recommendation:** `docs/networklens-console.md` — the dashboard already runs the same engine as the
  MCP (no MCP needed for rules/trace/packs); the app's live channel has 7 verbs (no breakpoints/replay/bubble); the
  control-queue port 8788 goes to whichever process starts first; the MCP already supports Android. Recommended: the
  dashboard owns 8788, one `/api/lens/*` API, a `qaw-lens` CLI that Claude runs use through Bash instead of 30 MCP
  tools, and a Mac Network console (live traffic, mock this call, body editor, scenarios, time-shift, health,
  guardrails; later breakpoints/replay with new fork verbs). Phases C → A → B → E → D.
- **Status:** analysis only; waiting for the user's go-ahead on the phases.

## D-126 — Phase C: the NetworkLens bubble parks over the status bar before every test (2026-10-16)

- **Trigger:** user "Build in suggested order" (C → A → B → E → D of `docs/networklens-console.md`); SF-024 was BLOCKED
  twice by the bubble sitting on the carousel's right arrow.
- **How:** NetworkLens keeps the bubble position as a fraction of the screen (`com.networklens.bubble.x/y`) and clamps
  it on screen; `lib/lens-bubble.js` sets x 0.12, y 0 (top-left, inside the status bar on any phone — never a tap
  target) before every replay and Claude run. If it wasn't already there, a running app is stopped, the values written,
  and the app started again (NetworkLens reads the position at launch); otherwise nothing happens.
- **Three ways that did not work (kept here so nobody retries them):** `simctl spawn … defaults write <bundle id>`
  writes the simulator's shared domain, which the app never reads; `plutil` reads the dots in the key as a key path;
  editing the plist from the Mac (PlistBuddy, the Mac's `defaults`) is ignored — the simulator keeps the domain cached
  and hands the app the old values. What works: `simctl spawn <udid> defaults write <container>/Library/Preferences/
  <bundle id> <key> -float <v>` — the simulator's own service, by file path. Values come back as 32-bit floats
  (0.119999997), so "already parked" compares with a 0.001 tolerance.
- **Verified:** bubble put back at 0.93/0.48 → SF-024 replay: "moved the NetworkLens bubble over the status bar (the app
  was restarted once for it)" → right-chevron tap → **PASS**. `npm test` 150/150 (`test/lens-bubble.test.js`).
- **Found, to fix in phase A:** the Simulator screen's Saved settings (read/write/delete), the `setAppDefault` step and
  the preconditions' `readAppDefault` use `simctl spawn … defaults … <bundle id>` too — the shared domain, not the app's.

## D-127 — Phase A: one NetworkLens API in the dashboard, `qaw-lens` for terminals and Claude runs (2026-10-16)

- **Trigger:** phase A of `docs/networklens-console.md` ("Build in suggested order").
- **Queue ownership:** the dashboard now listens on the control-queue port 8788 itself at start
  (`controlQueue.listen()`; previously whichever process started first — often the MCP — owned it). It notes every
  app poll, so `/api/lens/health` can say *who owns the queue* and *whether the app is polling* (fresh = a poll in the
  last 5 s). Claude sessions get `NETWORKLENS_SIDECAR` pointing at it, so an MCP started inside a run joins this queue
  instead of fighting for the port.
- **One API, `/api/lens/*`** (`routes/lens.js`): `state` (health + mocking + every rule with its variants), `health`,
  `mocking {enabled}`, `rule {endpoint, variant | enabled:false, retime}`, `calls?grep&limit`, `calls/:id` (headers,
  pretty bodies, curl), `calls/:id/mock` (the call's real response becomes a rule with the standard variants). Live in the
  running app when it polls, else into `session.json` for the next launch — every answer says which. `setMocking` and
  `upsertQuickMock` were lifted out of the old handlers so both APIs share them. The Mac console (phase B) builds on this.
- **`scripts/qaw-lens.mjs`:** the same API from a terminal — Node only, JSON out, `QAW_DASHBOARD` for another host. Call
  ids accept a unique prefix (the 8 characters `calls` shows). The Claude run prompt now names it first (via Bash); the
  `networklens` MCP stays as fallback for what it does not cover yet (scenarios, script variants).
- **Mocked flag:** the trace marks a served mock as `isMockServed` / `source.mocked` — `isMocked` reads those.
- **App settings fix (found in D-126):** every `simctl spawn … defaults <bundle id>` call wrote/read the simulator's
  shared domain, not the app's plist. Probe: a key written by bundle id was absent from the container plist;
  `NetworkLensEnabled = 1` existed only in the shared domain (it "worked" because the QA build defaults NetworkLens on).
  New `lib/app-defaults.js` (read/write/delete by container path, the D-126 method) is used by preconditions'
  `readAppDefault`, the `setAppDefault` / `clearAppDefault` steps (the old `plutil -remove` file edit is gone — cached
  by the simulator and confused by dotted keys) and the bubble parking; the Mac app's Simulator › Saved settings resolve
  the same path. Expect one extra relaunch on the next run that needs NetworkLens: its key now lands where the app looks.
- **Verified live (QA clone):** 8788 owned by the dashboard pid; health `isAppPolling: true`; 6 rules; `calls --grep
  flashsale` with mocked calls flagged; `call <prefix> --curl`; `mock "GET /backend/configs" revamp-off` → live, rule
  on with that variant → restored (off, revamp-on); app-defaults write/read/delete/delete-missing on the clone.
  `npm test` 157/157 (`lens-calls`, `app-defaults`). Mac app `swift build` + lint clean (not relaunched).

## D-128 — Phase B: the Network console in the Mac app (2026-10-16)

- **Trigger:** "proceed" after D-127 (phase B of `docs/networklens-console.md`). D-123…D-127 committed first
  (`5b15bd021`, local).
- **Where:** a new sidebar section **Network** (⌘9; ⌘1–⌘8 keep theirs). Advanced › Network Mocks stays for now.
- **What it does:**
  - Health strip: is the app checking in (live vs next launch), the master switch, "N of M rules on".
  - Leftover-mock banner while anything is on: what is armed, armed rules the repo pack doesn't keep, armed answers
    that differ from the pack. **All off** and **Reset to repo pack** are behind a confirmation.
  - **Traffic:** captured calls, newest first, filter by URL (server-side) and Mocked only; the call's response,
    request, headers and curl; **Copy curl**; **Mock this call** (its real response → rule with the standard answers).
  - **Rules & scenarios:** on/off and the answer per rule (picking an answer turns the rule on); the answers with
    **Edit**; the editor sheet (kind respond / fail / hang, status, delay, failure, body with a JSON check, **Save**,
    **Save as copy**, **Delete** — not the active one — and **Time-shift**: pick a timestamp in the body, "lands in N s",
    every other time moves by the same offset). Scenarios: save how every rule is set now, apply one, delete one.
- **Server (`lib/lens-console.js`, `routes/lens.js`):** `GET /api/lens/rules`, `PUT|DELETE
  /api/lens/rules/:id/variants/:vid`, `POST /api/lens/rules/:id/variants` (copy), `GET …/timestamps`, `POST
  …/timeshift`, `GET|POST /api/lens/scenarios`, `POST /api/lens/scenarios/:id/apply`, `DELETE /api/lens/scenarios/:id`,
  `GET /api/lens/guardrails`, `POST /api/lens/reset {to: off|pack}`. Writes go live first, else into session.json.
- **Found on the way (kept so nobody re-learns them):**
  - The app's `edit` verb **merges** scenarios it is sent and refuses an edit that only carries an empty list, so a
    scenario can't be deleted live (the MCP's `lens_delete_scenario` silently doesn't either). Delete = stop the app,
    write session.json, start it again, behind an explicit confirmation (`?relaunch=1`); phase D adds a real verb.
  - After a live scenario save the app's autosave reaches the file a little later, so the server remembers the list
    it last sent until the file is newer.
  - The app's encoder and a pack file order keys differently, so "differs from the pack" compares answers with keys
    sorted (a plain string compare flagged identical `configs` bodies).
  - Non-text bodies (protobuf, images) show as "(binary body, N bytes)".
  - A section whose first tutorial belongs to another section gets switched there by `prepareScreen` — Network lists
    only the Console tutorial until it has its own.
- **Design:** per-section VMs, each with its own protocol and state enum; the page VM builds them, runs a 2 s tick while
  the section is shown (rules + scenarios + guardrails every third tick — the rules answer carries every body, ~1 MB),
  and refreshes all after any change. One `NetworkConsoleService`; `NetworkConsoleOpening` builds the graph.
- **Verified (TestForge driven over AX, QA clone):** health "App connected — changes are live · 0 of 6 rules on";
  traffic rows + call detail; Rules tab with 6 rules and their answers; editor opened on `slow` with name/status/delay/
  body; rule toggle on → live (banner + "1 of 6") → off; Save as copy on `configs` → copy listed → Delete from the editor
  → gone, rule back as it was. Server: copy / edit / bad JSON refused / delete, time-shift (anchor landed +30 s, gaps
  kept), scenario save / apply / delete-with-restart, guardrails, reset — all on the QA clone and cleaned up.
  `npm test` 164/164; Mac `swift build` + SwiftLint 0 violations. Not driven from the UI: scenario save/apply/delete,
  Mock this call, time-shift, All off / Reset to pack (each verified through the API).


## D-129 — Phase E (part 1): trackers in the console and qaw-lens, without Python (2026-10-16)

- **What:** a **Trackers** tab in the Mac Network section and `POST /api/lens/trackers` · `/api/lens/trackers/:id` ·
  `/api/lens/trackers-report` + `qaw-lens trackers | tracker <id> | trackers-report [--out]`. Type the TRMS IDs to
  validate (none = everything that fired), optionally pick a contract JSON (`{ "<ID>": { event?, origin_screen?,
  required?: [path], expect?: { path: value } } }`, `items[].x` fans out), Check: per ID fired N× / non-2xx / not fired,
  event · screen, payload problems grouped by fire; missing and "also fired, not on the list"; the selected ID's fires
  newest first with payloads; Report → copy or save the DA-format markdown page.
- **Why a JS port, not the MCP's call:** `lens_trackers` shells out to `extract_trackers.py`, which lives only in the
  test-flow-recorder plugin cache (the path the MCP names, `tools/networklens/extract_trackers.py`, does not exist in this
  repo). `lib/lens-trackers.js` is the same collapse, contract rules and markdown, pure, on the trace the dashboard
  already reads — no Python, no plugin, unit-tested (`test/lens-trackers.test.js`).
- **Found on the way:** the real app sends trackers as `POST /track-batch` `{events: [{event, payload: {app_version, …,
  payload: {trms_id, event, origin_screen, items}}}]}`. The Python treats the whole batch as one fire and reads
  `event` / `origin_screen` from a top-level `payload` that a batch doesn't have — every row came out with no event and
  no screen, and a contract on `origin_screen` would fail every fire. Each object whose `payload` holds `trms_id` is now
  its own fire (single-event bodies are the same shape, so they still work). Checked on a real 12 MB trace: 21 IDs with
  events (`view_item_list`, `view_promotion`, `select_promotion`) and `retail-home`, app version `14.9.0(149008)`.
- **Choice:** the tab loads nothing until Check, then follows the page's slow tick, so a tester walking the flow sees
  fires arrive without pressing anything. No "new only" watermark (the Python's `--new`) — the live list replaces it.
- **Known gap:** the dashboard reads `trace.ndjson` only, not a rotated `trace.1.ndjson`; a long walk that rotates
  loses the earlier fires (the Python reads every generation). `lib/trace.js` is a copy of the MCP — fix there and re-copy.
- **Also fixed:** every Mac section's top was drawn under the window toolbar (the detail's `VSplitView` is AppKit-backed
  and ignores the toolbar inset) — the Network health strip and leftover-mock banner were hidden behind it since D-128
  (AX still found them, which is why D-128's check missed it). The split now sits below the toolbar
  (`GeometryReader` inset in `TestForgeView`); Simulator and Network checked by screenshot.
- **Open, not fixed:** the health strip's "App connected — changes are live" means *some* app polls port 8788 — the
  queue does not know which simulator. With the QA clone shut down and another simulator running the app, the strip said
  live (that app's 2 rules) while Traffic and Trackers said "no trace on the test simulator". A mock switched in the
  console would have landed in that other simulator's app. Phase D (fork verbs) should carry the device id in the poll.

## D-130 — Phase D: fork verbs (breakpoints, replay, bubble, scenario removal, device identity) + console v2 (2026-10-16)

- **Fork (NetworkInterceptor-qa, branch `darshan/innovation/qa-mocker-testing`, uncommitted, no tag yet):**
  - `LensControlChannel` verbs `breakpoint.add|remove|held|resume|resumeAll`, `replay`, `ui.bubble`; `edit` takes
    `removeScenarioIDs` (the fix for D-128's "can't delete a scenario live"). Async verbs go through `applyAsync`;
    the old verbs stay synchronous so the existing tests are untouched.
  - `BreakpointCoordinator.heldSnapshot()` / `currentPayload(for:)`: the held queue with staged edits, for the channel.
  - `breakpoint.resume`: continue with `status` / `headers` / `body` applied, or `failure` (`offline`, `timedOut`,
    `connectionLost`, `cannotFindHost`, `secureConnectionFailed`) aborts with that `URLError`.
  - `ui.bubble`: `BubbleVisibility` lives in Core (the channel can't see the UI module); `OverlayWindowController`
    observes its notification and hides/shows the overlay window.
  - Every poll carries `?pid&device=<SIMULATOR_UDID>&bundle=` (`ControlDevice`); `state` reports `device` and
    `isBubbleHidden`. NoOp twins added (the parity test requires them).
  - MCP `queue.ts`: remembers each poller; a command with `device` goes only to that simulator's app; an app that
    sends no identity (every build before this one) still gets everything; `withdraw(id)` on timeout so a command
    nobody collected can't land late. `control.ts` stamps `device` from `NETWORKLENS_UDID` (the dashboard sets it to
    the test simulator, D-120). Synced into the dashboard with `scripts/sync-networklens.sh`.
- **Why targeting, not just a label:** D-129 found the console saying "live" while the only polling app was on
  another simulator. A warning alone still lets a mock land there; targeting makes it impossible once the app sends
  its identity, and the health strip names the gap until then.
- **Dashboard:** `lib/lens-pollers.js` (live = the test simulator's app, or an anonymous older build — flagged
  `isIdentified: false`; other simulators listed), health carries `testDevice`, `pollingDevice`, `isIdentified`,
  `otherDevices`. Routes `GET|POST|DELETE /api/lens/breakpoints[/:id]` (`{call}` holds a captured call's own endpoint
  key), `POST /api/lens/held/:id/resume`, `/held/resume-all`, `/calls/:id/replay`, `/bubble`; live only — an older
  build's "Unknown command" becomes 501 "this app build predates NetworkLens phase D". Scenario delete tries the live
  `removeScenarioIDs` first and falls back to the restart only for an older build. `qaw-lens breakpoints | hold |
  unhold | release | release-all | replay | bubble hide|show`.
- **Mac console v2:** Network › **Breakpoints** tab (add by endpoint + stage + once; held calls with status/body edit,
  Continue / Fail as…, Continue all; Bubble hide/show); Traffic call detail gains **Replay** and **Hold this call**
  (switches to Breakpoints); the health strip warns (orange) when the live app doesn't say which simulator it's on, and
  counts other simulators polling.
- **Verified:** fork `xcodebuild test` on a spare iPhone 15 simulator — 10 new tests (add/update, remove, bubble,
  scenario removal, held response edited + resumed, held request failed as offline, not-held reported, poll identity)
  + the 19 existing channel tests pass; whole package 79 tests, the only failures are `GroupsFileTests` ×4, which fail
  the same way on the untouched branch (ISO-8601 date decoding, pre-existing). Dashboard 179/179. Live on :4545 with
  the current (old) app: health `isAppPolling true, isIdentified false, pollingDevice null`; `/api/lens/breakpoints`
  and `qaw-lens bubble hide` answer the 501 "predates phase D". Mac `swift build` + SwiftLint 0.
- **Not yet verified (needs the user):** the verbs inside the real app — needs tag `qa-mocker-testing-3` pushed, the
  POC re-pinned (project.pbxproj + Package.resolved revision) and Install for testing. Mac Breakpoints tab not seen on
  screen (the TestForge window was on another Space).

## D-131 — Phase D shipped to the QA app: tags qa-mocker-testing-3/-4, two fixes found live (2026-10-16)

- **User OK ("Do 1-4"):** fork committed + tagged `qa-mocker-testing-3` (866b763) and pushed; POC re-pinned
  (project.pbxproj + both Package.resolved); Install for testing (prepare local → build 714 s → runner restart).
- **Found live, fixed:**
  1. An app on an older build polls anonymously and was allowed to take a command targeted at the test simulator —
     the user's other simulator (iPhone 17 Pro, old build) could win the race. Now an anonymous poller gets a targeted
     command only while the target itself is silent (> 5 s); health lists the anonymous app under `otherDevices`
     once the test simulator's own app is live. MCP-only change (fork `2ef2c46`), no app rebuild needed.
  2. `replay` awaited its own response inside the channel's one-at-a-time loop, so replaying a breakpointed endpoint
     blocked the very `breakpoint.resume` that would release it (a slow mock blocked it too). It now waits at most
     3 s and answers `isInFlight: true`; the replay carries on. Fork `7af1332`, tag `qa-mocker-testing-4`, re-pinned,
     rebuilt (457 s) and installed.
- **Verified on the QA clone (iPhone 12 Pro Max, the app built at `df4b5bd`):** health `isIdentified: true`,
  `pollingDevice` = the clone, the old iPhone 17 Pro app listed as other; `bubble hide` → bubble gone from the status
  bar, `show` → back (cropped screenshots); hold `GET /backend/retail/carts/_item-counts` once + pull-to-refresh
  (driver swipe) → held (200, 333 bytes, one-shot auto-disabled) → `release --status 500 --body …` → trace shows 500
  with that body; again → `release --fail offline` → trace shows a transport failure; `replay` of a call → 200 as a
  new exchange; with the endpoint held, `replay` answered `isInFlight` in ~7 s, the held replay was then released as
  503 and recorded as 503. Breakpoints removed afterwards. Fork: 12/12 breakpoint-verb tests + 19 channel tests.
- **Not seen on screen:** the Mac Breakpoints tab (the TestForge window was on another Space; the bundle is rebuilt —
  reopen TestForge to load it). A held call auto-continues at 80 % of the request's timeout (the cart call ≈ 30 s),
  so release from the console promptly.

## D-132 — Install from a DMG: first-run Setup picks the repo and checks the tools (2026-10-17)

- **Trigger:** user item 1, "If I share app dmg and someone installs it how do they start a session and test?"
  (order "2, 1, 4, 5, 7"; item 6 folded in, see D-133).
- **Answer: the DMG carries only the app; the person brings their own clone of the iOS repo.** Tests build that code
  and the QA server (`tools/qa-dashboard`) lives in it, so shipping a server inside the app would drift from the code
  under test. An app installed in /Applications can't find the repo by walking up from its bundle, so:
  - `resolveServerLocation` now returns nil when neither `QA_DASHBOARD_DIR`, Settings' saved folder nor the walk-up finds
    it; the main window then shows **Setup** instead of the TestForge and no server starts.
  - **Setup:** choose the repo (any folder inside it works — `RepoFolderResolver` walks up 6 levels for
    `tools/qa-dashboard/server.js`), plus four checks through a login shell with `start.sh`'s PATH (a Finder launch has
    a bare PATH): Xcode (`xcodebuild -version`), Node ≥ 18, Claude Code (`claude --version`), Claude sign-in
    (`claude auth status` JSON `loggedIn`). Each red row has a fix: App Store / download page, or **Sign in**.
  - **Sign in opens Terminal once** (a `.command` running `claude auth login`): the login asks questions in a TTY and
    can't be run headless reliably; untested headless because testing it means signing the user out. Everything after
    it stays in the app.
  - **Continue** saves the dashboard folder (`dashboardDirectory` default, same key as before) and relaunches the app
    (new instance, then terminate) — simpler and safer than rebuilding the whole dependency graph in place.
  - **Settings › Project › Change repo…** does the same pick + relaunch; cancelling the panel does nothing.
    Caveat: a server you started yourself on the port keeps serving its own repo — the app attaches to whatever answers.
- **`scripts/make-dmg.sh`:** `make-app.sh release` → `build/TestForge-<version>.dmg` (app, Applications link,
  "Read me first.txt"). Signed with the local self-signed identity, not notarised: the receiver uses
  System Settings › Privacy & Security › Open Anyway once, and grants Accessibility for Arrange / Outline / Measure.
- **Verified:** DMG built (3.9 MB), mounted, app copied out of the repo and launched as a separate process → Setup
  shown, all four checks green on this Mac (Xcode 26.3, Node v26.5.0, Claude Code 2.1.301, signed in). Not driven:
  the folder panel and Continue (Continue writes the shared defaults domain the user's own TestForge reads).

## D-133 — Claude inside the TestForge: one resumable session per repo (2026-10-17)

- **Trigger:** user item 6, "a mechanism that auto loads a claude session in selected repo … only one source of
  management, not like we install QA testforge and still rely on a terminal for anything."
- **Reuse, not new plumbing:** the dashboard already hosts two-way Claude sessions (Agent SDK over the installed
  `claude`, all plugins / MCP / connectors, approvals and AskUserQuestion routed to the UI, `resume` across restarts —
  the web Sessions tab). The Mac app gets a native front end for it.
- **Server:** `POST /api/sessions/testforge` (`lib/testforge-session.js`) returns the newest open session with
  `meta.testforge` in `QA_PROJECT_DIR` (the chosen repo's `BlibliMobile-iOS`, where CLAUDE.md and the skills live —
  not the QA copy runs use), else creates one; `{fresh: true}` closes it and starts another. The Claude process only
  starts on the first message, so keeping a session ready costs nothing.
- **Mac › Claude (⌘0, under Get ready):** opens/resumes when the server reaches running. Transcript (your messages,
  Claude's text as inline Markdown, tool lines, first line of each result, notices), **approval cards** (Approve /
  Always allow / Deny) and **question cards** (options + Other, Send answer / Skip), message box (⌘↩, optional
  phone screenshot), **Stop**, **New conversation**. The SSE stream (`/api/sessions/:id/stream?after=<seq>`) is decoded
  and mapped off the main actor; on a drop it reconnects every 2 s from the last seq, so a server restart loses nothing.
  The per-turn "Claude started" notice is shown once.
- **Verified (copy of the dashboard on :4646, own control port 8799, separate app instance — the user's :4545 and
  TestForge untouched):** endpoint resumes the same id; `date` round trip; Bash `touch` → approval card → **Deny** →
  Claude told "Denied", file not created; AskUserQuestion → card → tick Blue → Claude answered "Blue"; app relaunch →
  same conversation from history (start notice once); server restart → stream reconnected, "still here" answered with
  context; **New conversation** → old session closed, transcript empty. 187/187 tests.

## D-134 — Onboarding: a welcome tour in the Mac app for QA and developers (2026-10-17)

- **Trigger:** user item 4, "Create a detailed onboarding module explaining intent, usage and advantages of using the
  app for developers and QA" (after "commit and move to 4"; D-132/D-133 committed `4121bd51f`).
- **Shape:** a native sheet in the main window, not a doc or web page — the app is now the one place people work
  (D-133). Seven pages: Welcome (pick **QA** or **Developer**) → Why it exists (four problems it removes) → How it
  works (the app, QA server, test simulator + QA build, QADriver, NetworkLens, Claude) → Your workflow (six steps, each
  naming its screen and shortcut) → What you gain (six cards) → What it never does (guard rails) → Start (Open Get
  ready, Watch the demo run, Ask Claude, Turn on screen tips). Workflow and gains switch with the role (segmented
  picker on those pages); the role is remembered.
- **Two roles, not three:** the user named developers and QA. Designers / PMs are covered inside QA's Measure step.
- **When it shows:** once, on the first TestForge open (`onboarding.hasSeen`, set when it closes by any route); again
  from Help › Welcome to TestForge or the ? menu › Welcome tour. Not during Setup (D-132).
- **Screen tips (R4a) wait:** `sectionDidAppear` returns while the tour is open; closing it calls back in, so a first
  launch shows the tour, then the Get ready tips — never both at once.
- **Content source:** today's features only (no 🚧 items), cross-checked against usage.md's guard rails, D-109 batches,
  D-113 video, D-120 test device, D-127…D-131 Network, D-133 Claude.
- **Verified (separate app instance on a :4646 copy; the user's defaults exported first and the tour keys removed
  after, so the user's own TestForge still shows the tour once):** tour opened by itself on first launch; all seven
  pages screenshotted; Ask Claude closed it, selected Claude and set `hasSeen`; reopened from the ? menu and from Help;
  relaunch → not shown again. Lint 0.
- **Wording (user, after going through the tour):** "get rid of word - 'fake'. Replace it entirely with 'mock'".
  The tour's two uses now say "mocks"; the Network guardrail banner's "fake data" became "mocked data". No other
  on-screen text used it (only code names like `FakeDataViewModel`, left as they are). Use "mock" in all new copy.

## D-135 — Get ready shows why a fix was refused; NetworkLens pinned from server start (2026-10-17)

- **Trigger:** the user's screenshot after the tour: Get ready "Ready to test" with "⚠ The server answered 409."
- **Cause:** `ReadinessFixService.run` (its own transport, not `DashboardClient`) threw away the response body, so the
  server's reason (every 409 carries `{error}`, most likely "harness ensure already in progress" right after the
  restart) never reached the screen; and the message stayed after every check turned green.
- **Fix:** the refusal's `error` text is shown (status code only as a fallback); `fixMessage` clears when the report is
  ready.
- **Found alongside:** the log showed `networklens: … installed on 2 booted simulators; using C9F5E76A (most recently
  written trace)` — the user's iPhone 17 Pro — because `NETWORKLENS_UDID` was only set once the first readiness check
  resolved the test device. The server now resolves it at startup (`findQaSimulator()` after `configureTestDevice`).
  Verified on a :4646 copy: fresh start + immediate `/api/lens/calls` → no guess line. Health on :4545 already showed
  the QA clone (pinned since its first readiness check). 187/187.
- **Also (user asked why "Measure accuracy · 9" sat in the toolbar):** that was the Test Batch started for D-123 and
  never ended (ended by the user 07:49, report written). Its 9th item was the TestForge's own Claude session (D-133),
  filed as a `claude-chat` because every new session attaches to the active batch. Sessions with `meta.testforge` are
  now skipped — the assistant isn't test work.

## D-136 — Android QA driver: spec, not code yet (2026-10-17)

- **Trigger:** user item 5, "We will be creating an android QA driver too on the basis of what we will build on iOS
  as MVP" (after "commit and move to 5"; D-134/D-135 committed `4f91abd94`).
- **Output:** `docs/android-driver-spec.md` — a port of the iOS contracts, built from the code as it is: the 20
  command kinds and JSON keys of `QADriverRunner.swift`, the 8789 queue (`lib/driver-host.js`), macros v2 + element
  registry, host steps, readiness ids, and NetworkLens Android's existing adb support (`lib/android.js`,
  byte-compatible files per the 2026-09-20 plan in the NetworkLens repo).
- **Recommendations in it:** UiAutomator in a **self-instrumenting test APK** (black-box like XCUITest; one driver
  APK works with any app build, so no "build for testing" on Android); the same queue reached through `adb reverse`
  (also opens physical phones); identical request/result JSON with shared golden tests; per-platform locators in the
  registry, ideally shared identifier names (Compose needs `testTagsAsResourceId = true`); one server behind a
  platform interface; phases A0–A6 with a Flash Sale pilot. Appium, Maestro and Espresso considered and rejected.
- **Why spec only:** no adb / Android SDK on this Mac and no Android app repo here — nothing could be verified, and
  seven questions (§9: repo and variant, Compose share, id convention, NetworkLens Android in the app, devices,
  where the library lives, login) decide the shape. Building waits for those answers.
- **User (2026-10-17):** "Only keep docs updated for android. We wil pick its development later." Parked: no Android
  code; when an iOS contract the spec relies on changes (command kinds, queue, registry, host steps, readiness), update
  `android-driver-spec.md` in the same change.

## D-137 — Arrange with Simulator: a labelled toggle that puts both windows back (2026-10-17)

- **Trigger:** user item 7 ("make the app full screen and pin the simulator as a split screen … ensure it is always
  available a top"). Review: Arrange (D-089) was still in the toolbar and Simulator menu (⌥⌘A), as an unlabelled icon.
  Asked the user: **split toggle** (chosen) vs. macOS full screen + floating Simulator (macOS won't let another app's
  window join a full-screen Space) vs. label only.
- **Button:** toolbar **Arrange** with its text label, a toggle that stays highlighted while arranged; the menu item
  is a checkmark toggle with the same shortcut.
- **On:** the test simulator's window goes to the right edge of its display at its own size; the TestForge fills the
  rest (sidebar hidden only when too narrow, as before); the Simulator is brought above other apps' windows, then
  focus returns to the TestForge — side by side, neither covers the other ("pinned").
- **Off:** both windows go back to where they were and the sidebar to how it was (`ArrangeSnapshot`, kept in the view
  model until the next press). A Simulator closed meanwhile still restores the TestForge and says so.
- **Bug found while testing:** the Simulator bridge took the *first* device window, so with two simulators open it
  arranged the user's own iPhone 17 Pro. It now prefers the window whose title starts with the test device's name
  (`/api/test-device`), refreshed when the server comes up and before each Arrange — Measure and the step outline
  read the same bridge, so they follow the test device too. Not refreshed yet when "Use for tests" changes on the
  Simulator screen until the next Arrange or server start.
- **Verified (separate app instance on a :4646 copy; user's defaults compared after — unchanged):** before
  QA sim (547, 94), TestForge (43, 86, 1469×832); on → QA sim (1095, 33), TestForge (42, 33, 1045×949), iPhone 17 Pro
  untouched, button highlighted; off → both exactly back. Lint 0.

## D-138 — Arrange asks which Simulator when several are open (2026-10-17)

- **User:** "When multiple simulators are open, prompt user with a list of open simulator with their name and let user
  choose."
- **Behaviour:** Arrange (on) lists the open device windows by their window title ("QA · iPhone 12 Pro Max",
  "iPhone 17 Pro – iOS 26.1"); the test device comes first, marked "— used by tests". Picking one arranges that window;
  Cancel does nothing. One window open → no prompt. Off moves back the same window (`ArrangeSnapshot.simulatorTitle`).
  Measure and the step outline keep following the test device (D-137) — the prompt is Arrange's only.
- **Code:** `SimulatorLocating.deviceWindowTitles()`, `geometry(windowTitle:)`, `moveWindow(to:windowTitle:)` (the old
  calls default to nil); `WindowArranging.arrange(window:simulatorTitle:hideSidebar:)`; `TestForgeViewModel.simulatorChoice`
  → a native confirmation dialog in `TestForgeView`. The Arrange code moved to an extension at the end of
  `TestForgeViewModel.swift` (type-body limit).
- **Limit:** macOS lists only Simulator windows on the current desktop (Space). When they are elsewhere, `AXWindows` is
  empty and only the main window is reachable — the list then has that one (titles are de-duplicated: main and focused
  window are often the same).
- **Verified:** with both Simulator windows on another desktop, the dialog appeared with its title and message and
  Cancel closed it, which exposed the duplicate entry (fixed). **Not yet seen:** the two-window list and a pick, which
  needs both windows on the current desktop. Lint 0; user's defaults unchanged.

## D-139 — Arrange from full screen and across desktops (2026-10-17)

- **User:** screenshot "Feature not working" — TestForge window shrunk to the left, a black area on the right, no
  Simulator. Two causes: (1) the running app (started 07:48) predated the D-137/D-138 build (09:00), so it was the
  old Arrange; (2) the TestForge was in **macOS full screen**, which is its own desktop: the window shrank inside it
  and the Simulator was moved on its own desktop, where it can't be seen. Both Simulator windows were off the current
  desktop (`AXWindows` empty, no on-screen CG windows).
- **Fix:** Arrange (on) now (a) leaves full screen first and re-enters it when Arrange goes off; (b) when no Simulator
  window is on the current desktop, activates the Simulator (macOS switches to its desktop) and brings the TestForge
  window along (`.moveToActiveSpace` while ordering front), so the list and the move see both windows; (c) refuses
  with "That Simulator window is on another desktop…" instead of moving a window nobody can see.
- **Not verified by me:** it switches the user's desktops, so the user tries it on screen after relaunching the app.
  Build + lint 0.- **User's first on-screen try (09:25 screenshot):** TestForge left, a Simulator right, toggle on — but the window
  showing was iPhone 17 Pro. Window list: the QA clone had been moved to the arranged spot (x 1095), with iPhone 17
  Pro at x 1111 on top of it (left there by the old build's Arrange). Activating the Simulator raised its frontmost
  window, the other device. Fix: after activating, the placed window is raised (`SimulatorLocating.raiseWindow`,
  `kAXRaiseAction`).

## D-140 — Arrange = macOS Split View: Simulator full screen left, TestForge right (2026-10-17)

- **User:** "The expectation is. QA testforge goes full screen and Simulator in full screen sitting on left in
  splitscreen mode." (D-137's side-by-side windows were not that.)
- **How, given no API puts another app's window into Split View:** macOS 15+ gives every app Window › Full Screen
  Tile › Left of Screen. Arrange (on): leave full screen / join the Simulator's desktop (D-139) → pick the Simulator
  (D-138) → activate it → bring the picked window forward through the Simulator's **Window menu entry with that
  window's title** (works even from another desktop, where Accessibility can't reach the window) → press Full Screen
  Tile › Left of Screen (retried until macOS enables it) → macOS shows its chooser on the right with this window as a
  thumbnail → wait until the thumbnail has shrunk and stopped moving → one synthetic click (move, press, release with
  100 ms pauses) at its centre → the TestForge becomes the right tile. The sidebar is hidden when half the screen is
  narrower than the window's minimum with it.
- **Off:** this window leaves full screen; the Simulator window is brought forward the same way and Window › Exit
  Full Screen is pressed (retried until enabled); focus returns here; sidebar and an earlier full screen restored.
- **Fallbacks:** no Full Screen Tile item at all (older macOS) → D-137 side by side; the pick click missed → the
  arrangement is kept and the person is told to click TestForge on the right.
- **Found while building it (all on the user's screen, with them watching for this feature):** a click posted as
  back-to-back events is ignored by the chooser; the tile item is disabled for ~0.5 s after the window switch (first
  attempt fell back to side by side); exiting failed while the Simulator's front window was the other device.
- **Verified on the user's TestForge:** on → prompt (QA first) → QA clone full screen left (0–628 pt), TestForge right
  (640–1512, full height), no message; off → both back on the desktop, toggle off. Lint 0.

## D-141 — Split View puts the Simulator on the right; every window listed; stale full screen recovered (2026-10-17)

- **User:** "Working neat. Just one small change. always arrange simulator on right. Currently it is left."
- **Change:** Window › Full Screen Tile › **Right of Screen** (fallback item "Tile Window to Right of Screen"); macOS's
  chooser then appears on the left and the same thumbnail pick selects the TestForge.
- **Found while re-testing on the user's screen:** turning the old build's Arrange off left the QA clone full screen on
  its own desktop. Then (1) the list missed it — Accessibility only sees windows on the current desktop — so the list
  now also reads the Simulator's **Window menu**, whose items after the last separator name every device window on
  any desktop; (2) a window already full screen can't be tiled: after the window is brought forward, one loop (6 s)
  presses Exit Full Screen if it shows, then Full Screen Tile › Right of Screen once enabled.
- **Verified on the user's TestForge, starting from that stuck state:** prompt listed both windows (QA first) → QA
  clone full screen right (892–1512 pt), TestForge left (0–880) → off → both on the desktop at normal size, toggle off.
  Lint 0.

## D-142 — Item 3 (accessibility IDs in the codegen skills) deferred to the develop integration (2026-10-17)

- **Scope as assessed:** IDs on every view (not a pick list); UIKit always `ignoreSubviews: false` (today ~1,845
  `setAccessibilityIdentifier(with:)` calls, 41 pass false — the default collapses children); SwiftUI containers
  `.contain`, never `.combine`/`.ignore` over identified children; `swift-review` flags both. Repo skills
  (`swiftui-components`, `swiftui-code-gen`, `swift-review`) here; Rule 6 lives in the shared `Mobileapps-iOS`
  `swift-codegen` plugin (PR, all teams). Open choices: flip the helper default (~1,800 call sites, VoiceOver
  grouping changes), plugin vs. repo-only, new files only vs. edits too.
- **User:** "this change cannot be afforded for now. We will do this once integrate this setup into develop."
  Not built; pick it up with the develop integration, starting from the three open choices above.

## D-143 — Measure never splits text into "views without id" (2026-10-17)

- **User (screenshot, Measure on the QA clone's Home):** a "View without id" 15.5 × 16 pt sat over "ori" in
  "Guaranteed original" inside `uspCarousel`. "It is breaking the label text as separate element. This must never
  happen. Remove any logic added which is letting this happen."
- **Cause:** the layer pass (D-093) turns straight colour edges in the Color Blended Layers capture into boxes. Its
  glyph filter only dropped boxes inside an **accessibility text element** — this strip exposes no text elements, so
  glyph ink became boxes.
- **Fix:** the layer pass now also reads text lines from the plain screenshot with Vision (`TextRegionDetector`,
  `VNRecognizeTextRequest`, fast, no language correction) and `LayerElementMerger` drops any box that covers ≥ 20 % of
  its area on a text line without wrapping the whole line. A box around a whole line (button, chip, card) stays.
- **Trade-off:** Vision folds small inline icons into the line (that strip reads as one 420 pt line), so those icons
  are not added as views without id either — text is never split, which the user asked for absolutely.
- **Verified:** the QA clone's current screen through the same detection: line at y 282.7–295.7 pt; the user's box
  (192.5, 281.5, 15.5 × 16) → dropped. Not yet re-run through Measure's full capture in the app. Lint 0.

## D-144 — Measure: ⌥ + scroll zooms (2026-10-17)

- **User:** "add option+scroll as zoom in zoom out convenience".
- **Built:** `OptionScrollZoomModifier` on the Measure canvas — a local scroll-wheel monitor that, with ⌥ held and the
  event in the Measure window, multiplies the zoom by `exp(delta × rate)` (trackpad 0.01, mouse wheel 0.1 per unit),
  clamped to 100–800 %, and swallows the event so the canvas doesn't pan. Scroll up = zoom in. Plain scroll still pans;
  pinch, the slider and ⌘− ⌘= ⌘0 are unchanged. Zoom is not anchored at the pointer (the canvas keeps its scroll
  position), same as the other zoom controls.
- **Not verified on screen:** needs a real ⌥ + scroll in the Measure window. Build + lint 0.

## D-145 — Measure never splits icons into "views without id" (2026-10-17)

- **User (screenshot, iPhone 17 Pro Home):** "whatever changes we performed for ui label glyphs, there is similar issue
  with icons" — extra boxes over parts of the tab-bar icons and the share button.
- **Measured, not guessed:** a scratch CLI built from the app's own `SimulatorLayerCapture`, `BlendedLayerAnalyzer`,
  `TextRegionDetector` and `LayerElementMerger` ran the real capture on that device. Pieces found: inside the 36 × 36
  share circle, besides its centred 18 × 18 glyph, 5.7 × 11 and 4.3 × 11.7 boxes; 5 × 2 strokes inside a 24 × 24
  icon; 24 × 3.7 strips along the bottom edge of each tab icon; 4–8 pt specks.
- **Rule (after the text filter):** icon boxes = layer boxes ≤ 48 × 48 plus accessibility buttons / images of that size.
  A box is dropped when it is (a) inside an icon box but not on its centre (± 1.5 pt — a real inner view such as the
  glyph in a round button is centred; drawing pieces aren't), (b) a strip ≤ 4 pt thick along an icon's edge within its
  span, or (c) a speck under 9 × 6 pt (a 6 × 6 page-indicator dot stays).
- **Verified on the live capture with the app's merger:** 207 layers → 56 added; share circle + glyph and the 24 × 24 tab
  icon kept; the share pieces, the strip under the tab icon, the stroke inside the small icon and the specks dropped.
  Lint 0. Not yet seen in the Measure window itself.- **Follow-up (user's 11:49 screenshot):** the remaining box over the "For you" thumbs-up was not an icon piece but
  `productMerchantLevelBadge` (AXImage 16 × 16 at 34, 798) — a product card's badge scrolled under the tab bar, still
  reported by Accessibility though covered. Confirmed by the user ("those boxes have legit accessibility ids"). A
  trial that grew icon-sized layer boxes to the surrounding ink was reverted (it turned glyph specks into word boxes and
  revived the share icon's pieces). Offered, not built: hide elements covered at their centre (AX hit test), as the
  driver's `obscuredBy` check does.

## D-146 — Measure snapshot: Show in Finder after saving (2026-10-17)

- **User:** "on this screen once user saves image, ensure the show in finder option pointing to that file is shown in
  the same screen."
- **Built:** `MeasureSnapshotViewModel.savedFileURL` (the URL the save panel returned); the sheet's footer shows
  "Saved as <file name>" (full path on hover) and **Show in Finder**, which selects the file. It stays until the next
  save — copying the image afterwards doesn't hide it. Replaces the bare "Saved." line.
- **Not driven on screen** (the save panel is a system dialog). Build + lint 0.

## D-147 — Watch and steer every Claude session from the Mac app (2026-10-17)

- **User:** "For worst case scenarios we must have a way to observe what is happening behind the scene in detail. Also
  if anything goes wrong, user must have option to tell claude resolve it. We can show that terminal window within the
  app + if claude prompts something by any chance, we can smartly create prompts within the app and receive user input."
- **Before:** runs (`qa-run`, triage, free `claude` tasks) ran as dashboard sessions; the Mac app showed only their
  narrated steps (Tests) — the transcript, approvals and questions lived in the web Sessions tab, so an "ask" run waited
  with no way to answer it in the app.
- **Built:**
  - Claude section **session switcher**: the assistant plus every run / triage session (from the live `queue` slice's
    `sessions`), waiting-on-you first, then running, then newest.
  - **Details** switch + expandable rows: each tool call opens to its full input (pretty JSON), each result to its full
    text (≤ 6,000 chars as the server keeps it) — the in-app "terminal" view.
  - **Talk to any session**: the message box and quick replies (run sessions: "Investigate what went wrong and fix it",
    "Explain step by step what happened", "Try the last step again") send to that session; a **closed** one is reopened
    first (`POST /api/sessions/:id/reopen`, `ClaudeSession.reopen()`, resumes Claude's own transcript) and the transcript
    says so.
  - **Prompts surface in the app**: approval / question cards for any session; a **badge** on Claude in the sidebar
    (count of waiting requests across sessions); a **notification** per new request ("Claude needs your approval…" /
    "is asking you something") whose click opens that session; a "Claude is waiting for your reply" banner with
    Yes / No when a turn ends on a plain-text question.
  - **Tests › live steps**: **Claude session** button on a Claude run (`narration` runs now carry `sessionId`).
- **Verified (copy on :4646 + separate app instance; user's defaults unchanged):** a `claude` task asking for Bash →
  sidebar badge 1, switcher listed it, opening it showed the call (Details → full input) and the approval card; Deny →
  file not created, nothing pending; quick reply "Explain step by step…" answered in that session; after closing the
  session server-side, a quick reply reopened it and Claude answered with its earlier context. Server 189/189 (reopen
  tests). **Not yet seen:** the Tests "Claude session" button (needs a real Claude run) and the notification banner.

## D-148 — The tour says which steps need Claude (2026-10-17)

- **User** (after "So the app does not need a claude session to start?"): "Can we add this information as part of
  onboarding for each step with a bottom marker saying - Needs claude with tick or cross."
- **Built:** every workflow step in the tour ends with a **Needs Claude ✓ / ✗** capsule, plus a note where it's partly
  true. QA: Get ready ✗ ("its Claude sign-in check only matters for Claude runs"), Run the cases ✓ ("only to load cases
  from Confluence and to Run with Claude — replays don't"), Network ✗, Measure ✗, Results ✗, Report ✗ ("publishing to
  Confluence goes through Claude"). Developer: all ✗ except Ask Claude ✓; Replay ✗ with "when you're signed in, Claude
  explains a failure". The How it works card for Claude now opens with "Optional: … Replays and every screen work
  without it."
- **Verified:** separate instance, Help › Welcome to TestForge → Your workflow (Developer): markers render with the
  notes; AX lists 5 ✗ + 1 ✓. User's defaults unchanged. Lint 0.

## D-149 — Claude usage bar: CLI figures, account and Remote Control, live (2026-10-17)

- **User:** "We also need a live indicator showing real time usage of claude in the app similar to how it is currently
  configured on CLI … add an option in the view menu to show/hide it." Then: "Also show the account logged in and
  remote control on/off status."
- **Built (Mac):** a thin bar along the bottom of the main window, laid out like the CLI line — model · `ctx` % ·
  `hr` used/elapsed (time to reset) · `wk` used/elapsed (time to reset); amber when use runs ahead of elapsed time, red
  ≥ 90 %; "last seen … ago" when old — and, at the right, the signed-in account (email · plan) and `rc: on (n/m)` /
  `off` / `unknown` with each CLI session's state on hover. **View › Show Claude Usage** (⌥⌘U), remembered; on by
  default. With no figures yet: "Claude usage — nothing reported yet" + **Connect Claude Code status line…** (asks
  first).
- **Built (server):** the usage tap (`~/.testforge/usage.json`, D-077) is now polled every 5 s (`watchTap`) so the
  bar moves with the CLI; its `model` is passed on; `QA_USAGE_TAP` points a test server elsewhere. `POST
  /api/usage/tap` (`lib/usage-tap.js`) adds one marked line after the status-line script's `input=$(cat)` that copies
  the JSON to the tap (idempotent; refuses a script without that read). New slice `claudeCli` (every 5 s,
  `lib/claude-cli-sessions.js`): live interactive sessions from the CLI's own `~/.claude/sessions/<pid>.json`; Remote
  Control = a `bridgeSessionId`. That registry is undocumented CLI internals — unreadable → "unknown", never a false
  "off". The account comes from the existing `identity` slice (`claude auth status`).
- **Not done without the user:** the tap line is not in the user's status-line script yet — a dry run showed the exact
  line; it's added only via Connect (or by hand). Until then the bar shows figures only from the TestForge's own Claude
  runs (rate-limit events).
- **Verified:** server 195/195 (tap insertion/idempotency/refusal, CLI sessions incl. dead pid + half-written file);
  copy on :4646 with a sample tap + separate app instance: bar showed `claude-opus-5-5 ctx 76% hr 57%/37% (3h8m) wk
  82%/100% (11h18m) … <account email> · pro rc: on (1/2)` (this CLI session has Remote Control, the other
  doesn't); editing the tap updated the bar within one poll; View toggle hid/showed it. User's defaults unchanged.

## D-150 — QA from the Claude mobile app: Remote Control supervised by the TestForge (2026-10-17)

- **User:** "Go ahead and implement everything possible. Queue them and start" — after confirming it is the existing
  Claude mobile app (Code → session) / claude.ai/code, not a new iOS app.
- **Built:**
  1. **Supervisor** (`lib/remote-control.js`, `/api/remote-control`, `/start {spawnMode}`, `/stop`, slice
     `remoteControl`): `claude remote-control --name "TestForge · <repo>" --spawn same-dir|worktree` in the repo
     (`QA_PROJECT_DIR`, trusted), env `TESTFORGE_REMOTE=1`, detached, output to `.data/remote-control.log` which the
     server tails (a pipe died with the server and took Remote Control with it — found in testing). Status, capacity,
     session and environment links are read from that output; the pid is recorded so a server restart adopts it.
  2. **Guard rails** in the **test-flow-recorder plugin** (local repo `~/Projects/Tools/qa-flow-recorder-plugin`,
     uncommitted there; plugin reinstalled): `hooks/testforge-guard.mjs` (PreToolUse, Bash|mcp__*) — only when
     `TESTFORGE_REMOTE=1`: denies writes to Confluence page 2396520535, asks before `git push`, `xcodebuild …
     build-for-testing`, `simctl erase`; `hooks/testforge-session.mjs` (SessionStart) tells the session what it is.
     Not in the repo's `.claude/settings*.json`: those are tracked and shared; not in the QA copy: it isn't a trusted
     folder and Remote Control has no terminal to ask.
  3. **Tools + skill:** `scripts/qaw.mjs` (status, cases, case, replay recorded cases only, wait, stop, results,
     result, report, screenshot, batch, plus `sessions`, `pending`, `approve`, `deny`, `answer`, `session`, `tell` for
     the TestForge's own Claude runs); repo skill `.claude/skills/testforge-remote/SKILL.md` (tools, how to work,
     phone-sized answers, rules).
  4. **Mac:** Claude section header **Remote Control** button (dot: grey off, amber connecting, green connected, red
     problem) → panel: title / capacity / mode, problem text, QR code + **Open session** + **Copy link**, same-folder vs.
     own-worktree picker, Turn on / Turn off.
- **Deferred:** the TestForge's own sessions appearing in the Claude app (hand-off). The Agent SDK has an `@alpha`
  `bridge` export (`attachBridgeSession`, `createCodeSession`) that needs the claude.ai access token handled directly —
  too fragile and sensitive for now. `qaw pending / approve / tell` gives the phone the same control over those runs.
- **Verified:** server 199/199. Live `claude remote-control` from the server: connected in ~20 s with 1/32 capacity and
  both links (same-folder and worktree); stop answers "stopped" only once the process is gone; server killed → Remote
  Control kept running → restarted server adopted it, still connected, links intact. Real sessions with the marker: the
  SessionStart note reached Claude; `git push` was stopped by the guard ("Pushing leaves this Mac — confirm you want
  it"). `qaw` on a copy: pending listed a run's Bash approval with its command → `deny "…"` → file not created →
  `tell` → Claude answered in that run's session. **Not seen:** the Mac panel itself (the test window opened on
  another desktop — not switched under the user) and a session driven from the phone.

## D-151 — Tutorials and the welcome tour cover every feature (2026-10-17)

- **User:** "Before commit ensure, all features are covered by tutorial, and onboarding. Review the gap and complete it
  before commit."
- **Gaps found:** no tutorial for Network (⌘9) or Claude (⌘0); Get ready silent on Test Batches; Arrange tip still
  "side by side"; Measure tips without ⌥ + scroll or Snapshot; Tests without the Claude session button. Tour without
  Remote Control, session watching, the usage bar, or phone guard rails.
- **Tutorials:** new `network` (3 tips) and `claude` (4 tips) features — in each section's ? menu and auto-started on
  the first visit; new anchors on the Test Batch pill, Measure Snapshot, Network health strip / tabs / traffic, Claude
  switcher / Details / composer, Remote Control button; tips updated as listed in `tutorials.md` › R6.
- **Tour:** How it works + "Claude usage, always in view" and "Your phone (optional)"; workflow step 7 "Drive it from
  your phone" for both roles (Needs Claude ✓); Developer "Ask Claude" now names session watching; gains + "QA from
  anywhere" (QA) and "Nothing hidden" (Developer); guard rails + "Phone sessions keep the rules"; Start + "Drive QA from
  your phone" (opens Claude).
- **Verified (separate instance, user's defaults restored):** Claude section's first visit started the Claude tutorial
  ("Every Claude session", 1/4); Network's started "Is the app listening?" (1/3); the tour showed the new cards, step 7,
  the guard-rail card and the new Start action. Lint 0.


## D-152 — `.claude/` folders aren't app build inputs (2026-10-17)

- **Problem:** after commit 579f600 "Code prepared" turned red: the drift check counted `BlibliMobile-iOS/.claude/skills`
  edits as app changes.
- **Choice:** `BUILD_IGNORED_PATHS` default gains `**/.claude/**` (Claude settings, skills and hooks never ship in the
  app). Code re-prepared (snapshot 579f600, buildInputId 65b6fce46a9d); the last build's id in
  `~/.testforge/builds.json` was migrated to it (backup `builds.json.bak-d152`) because
  `git diff df4b5bd..579f600` outside `tools/`, `.claude/` and UITest JSON was empty — no rebuild needed.

## D-153 — Cases declare what they need; SF cases log in and reload Home first (2026-10-17)

- **User:** "Flash sale revamp will only show for logged in users. You will need to run login macro and then either
  relaunch app or do pull to refresh on home page." → "i want it" (automatic, replays and Claude runs).
- **Choice:** a shared rule file `BlibliMobile_XCUITest/QAMacros/case-requirements.json` maps case ids by regex to
  `requires` (`^SF-` → `{session: "loggedIn", reloadHome: true}`), so the need lives with the cases, not with each
  recording or in the prompt. Merge order: mocks ⇒ NetworkLens, then case rules, then the recording's own `requires`
  (most specific wins).
- **`reloadHome`:** after a login routine, `resolvePreconditions` relaunches the app (more reliable than pull to refresh,
  and the relaunch path already exists). Already logged in ⇒ nothing runs, so back-to-back SF replays stay fast.
- **Claude runs** (`qa-run`, purpose "run") resolve the same preconditions with the same routines before the session's
  first turn (shared `meetPreconditions` in `server.js`); failure ⇒ BLOCKED without spending a Claude turn. The prompt
  gets "Preconditions already met by TestForge …: logged in, app relaunched so Home loaded … Don't redo or undo
  them." Follow-up turns (save as macro) skip it.
- **No new UI:** the run log shows each `⚙ precondition:` line, as for replays; no tutorial tip added.
- **Verified (replay, 2026-10-18):** logged the QA sim out (`mc_FD3GLFFJWN`), then replayed SF-001
  (`mc_1RDWNX0B8D` via `/api/macros/v2/:id/replay`) — precondition logged back in on PROD + relaunched
  for Home, then the case's own mocks/steps ran: PASS in 150.6 s. Closes the D-153 open item.

## D-154 — A single Claude run files its proof into the Test Batch (2026-10-17)

- **Problem:** SF-020's Claude run (outside a batch run) left its screenshots in the runner's `~/Documents/QA-Test/SF-020/`;
  only batch-run items were copied into `<batch folder>/<case>/` (`collectEvidence`).
- **Choice:** the `qa-run` executor (purpose "run") copies proof written during Claude's turn with the same
  `copyIntoBatchFolder`, via a shared `proofWrittenBetween` (extracted from `collectEvidence`); the run record gets
  `screenshots` and the job log "● proof filed: N files in …".
- **Verified:** SF-020 rerun → `03-sub-fs-card-a-product-row-loaded.png` in `Live-Claude-run/SF-020/` and in the run record.
- **No new UI:** proof shows up where it already did (run record, batch folder); no new screen, control or log line
  shape, so no tutorial tip added.

## D-155 — Generate NetworkLens variants from a Decodable model's field list (2026-10-18)

- **User:** "enhance/boost existing NetworkInterceptor/NetworkLens features... intent must be boost dev, QA
  productivity for UI and API alignment with expectations. QA writes UI tests which cannot cover the test cases
  like TestForge can." Chose the **light** scope (generate the variant matrix only — no auto-driving, no
  auto-judging of renders).
- **Problem:** hand-authoring a mock variant per field-level contract edge (every optional absent, every enum
  case, an unknown enum value, an empty array) doesn't scale. `screen-sweep` only covers whole-response states
  (loaded/empty/500/slow/hang/retry); confirmed no tool in `tools/networklens-mcp`, `tools/networklens`, or
  `tools/qa-dashboard` mutates individual fields — every one treats a response body as one opaque blob.
- **Choice:** `lib/swift-decodable.js` parses a hand-written `init(from decoder:)` into a field list (wire key via
  `CodingKeys`, optionality, scalar/enum/opaque kind), handling both decode shapes this codebase actually uses —
  the explicit `values.decodeIfPresent(Type.self, forKey: .x)` form, and the subscript form via this codebase's
  own `KeyedDecodingContainer` extension (`Common/BM_Extension/BM_KeyedDecodingContainerExtension.swift`:
  `values[.x]` / `container[.x]`, always `T?`, with the type read from the property's own `let`/`var` declaration
  instead of a `.self` literal — confirmed widely used, e.g. `BlibliDigitalProducts/DigitalMobileConfig.swift`,
  `BlibliSellerChatIOS/AttachProductModels.swift`). `lib/model-fuzz.js` turns that field list + one baseline pack
  variant into `fuzz-missing-*` / `fuzz-empty-*` (arrays) / `fuzz-enum-*` + `fuzz-enum-*-unknown-value` variants,
  mutating by `jsonKey` (never the Swift property name — the `isTimeBased`/`timeBased` CodingKeys remap is the
  regression case for this) across every instance located in the body (an envelope's `data` array, a single
  object, or `--at <dotPath>`). Merging touches only previously-generated (`fuzz-`-prefixed) variants — hand-authored
  and standard ones, plus `activeVariantID`/`isEnabled`/`match`, pass through byte-identical; a recurring generated
  name reuses its old id so a tester's `activeVariantID` never dangles across a regeneration. Nested/array-of-struct
  fields are mutated as one opaque unit, never recursed into (v1 non-goal), same for cross-file/dictionary types.
  New standalone CLI `scripts/qaw-fuzz.mjs fields|generate` — **not** routed through the dashboard server:
  `QA_PROJECT_DIR` is a detached QA clone (D-032), so an HTTP route would risk fuzzing a stale copy of whatever
  Swift file a developer is actively editing. A `/api/lens/fuzz` route for a future Mac button is a named v2, not
  built now.
- **Verified:** `npm test` 237/237 (37 new). Piloted end-to-end on the real
  `FSSubFlashsaleRangeItemResponse` against the real `get-backend-content-api-sub-flashsale-range.networklens-pack.json`
  (both read-only, fuzzed only in scratch copies): `fields` listed all 9 real fields correctly; `generate --dry-run`
  predicted exactly 10 variants; a real write produced those 10, left all 9 original variants byte-identical, and
  left `activeVariantID`/`isEnabled`/`match` untouched; re-running on an unchanged model was byte-for-byte
  idempotent; editing the scratch model (renamed `isTimeBased`'s wire key, removed `end`) and regenerating dropped
  the stale `fuzz-missing-end` and targeted the new wire key correctly. Enum-case/unknown-value generation and the
  subscript decode form were verified via unit fixtures only — the pilot struct has no top-level enum field.

## D-156 — Personal Claude Code settings never risk a commit again; the dashboard fills them in (2026-10-18)

- **User:** "Make the claude/setting.json changes generic and for permissions, add a prompt with detail permission
  request during onboarding and once user approves, automatically update the corresponding claude files. This is
  to ensure once the repo is used by multiple team members, they don't face any issues or blockers."
- **Problem:** this session had hand-added an `env` block to the *tracked* `.claude/settings.json` — this Mac's
  `QA_PROJECT_DIR`, `QA_MEDIA_ROOT` and `QA_DEVICE_UDID` — so Claude's own `networklens`/`qa-driver` MCP tools,
  used directly in a Claude Code session (not through this dashboard, which already resolves all of this per
  request, D-032), could target the right device. That file has no safe home for personal values: it's shared,
  so every teammate hits the same need and the same temptation to commit their own machine's paths over everyone
  else's. `.claude/settings.local.json` is tracked too today (shared permissions/hooks/MCP toggles, not personal),
  so there was genuinely nowhere for a developer's own values to live without risking exactly this.
- **Choice — asked and confirmed (both recommended):** (1) untrack `settings.local.json` going forward
  (`git rm --cached`, added to root `.gitignore`), commit `settings.local.json.example` as today's shared baseline
  (permissions, hooks, MCP toggles — unchanged, nothing personal was ever in it); a fresh clone or a Mac that
  wiped the file gets it reseeded from the example the first time this Mac's "configure" fix runs. (2) the prompt
  lives on the existing **Get ready** checklist, not a one-time install step, as a new `claude-env` check (`lib/
  readiness.js`) — `level: "warn"`, `scope: "all"`, so it never blocks a Run/Replay (those never needed it) and it
  re-checks on every Get ready poll, so a changed QA simulator is caught later too, not just on first run.
- **Detection, not typing:** `lib/claude-local-env.js`'s `detectLocalEnv()` works out every value from what the
  dashboard server already knows — `QA_PROJECT_DIR`/`QA_MEDIA_ROOT`/`QA_UITEST_TARGET` from its own env, the
  bundle id from `app-defaults.js`, the QA simulator's udid from `findQaSimulator()` — nothing for the developer
  to type. `diffLocalEnv()` compares that against `settings.local.json`'s current `env` (ignoring any key not yet
  resolved, e.g. no QA simulator booted) to decide the check's ok/not-ok. The fix
  (`POST /api/claude-env/configure`, `routes/qa-setup.js`) is a plain confirm-then-write, same shape as every
  other Get ready fix (`qa-sim-create`, `build-qa`, `free-space`): the Mac app (`ReadinessFixService.swift`) and
  the web page (`public/js/readiness.js`) both show the same confirmation text — exactly what gets written, into
  which file, and that it's never committed — before calling it.
- **Write semantics:** `writeLocalEnv()` seeds from `settings.local.json.example` only when `settings.local.json`
  doesn't exist yet, then merges just the `env` key — every permission, hook and MCP toggle already there passes
  through untouched — and only ever writes `LOCAL_ENV_KEYS` with a resolved (non-null) value, so an unbooted QA
  simulator can never clobber an already-correct `QA_DEVICE_UDID` with a blank one. Atomic write (temp file +
  rename), same idiom as `exportRules` in `lib/mock-pack.js`.
- **Verified:** `npm test` 252/252 (15 new: `claude-local-env.test.js` + one `readiness.test.js` case). `swift
  build` on `testforge-mac` compiles clean. `claudeEnvCheck()` run for real (read-only) against this Mac
  correctly reported "not set up yet" before the fix; `writeLocalEnv()` run for real then did the actual
  migration this decision describes — detected `QA_DEVICE_UDID: AC2A1B55…` (today's real QA simulator, the
  "iPhone 12 Pro Max" confirmed earlier this session) independently of the stale UDID that had been hand-typed
  into `settings.json`, which is itself a live demonstration of why auto-detection beats a hand-maintained value.
  `settings.local.json`'s permissions/hooks/MCP toggles came through byte-identical; `settings.json` is back to
  the generic, tracked baseline (no `env` key). `git status` confirms `settings.local.json` is no longer tracked
  and `settings.local.json.example` has no personal values.

## D-157 — Deeplinks: build from the app's route list, open over the current screen (2026-10-27)

- **User:** "add deeplink creation and triggering them into simulator using testForge without going to the app or
  disturbing its present screen." Asked what "not disturbing" means (opening a link always navigates): user chose
  **no relaunch, push on top** — the app keeps running, the target screen opens over the current one, Back returns.
- **Catalog = `BlibliMobile-iOS/.../Common/Deeplink/DeeplinkList.txt`** (113 routes: regex + handler + description), read
  from the dashboard's own repo, not the QA clone — it only builds links. Each regex becomes a fill-in template
  (`lib/deeplinks.js` `templateFor`): leading `(.*)` → `blibli:/`, inner `(.*)` → `{value}`/`{value2}`…, trailing →
  optional `{rest}`, `[0-9]*` → `{id}`, `(/?)`/`($|\?.*)` tails dropped, `(?i)` → JS `i` flag. 112/113 self-match
  (each template is caught by its own route); the one left (`wwwuat([a-b])…`) is flagged `isAdvanced` — type it.
  The live router config is remote and may differ, so "caught by" says *which list entry* would catch it, and a link
  with no entry says the app may still handle it.
- **Only `blibli://` / `com.blibli.mobile://`** — an `https://` link opens Safari on the simulator, not the app, so
  `urlProblem` refuses it with that reason rather than opening the wrong app.
- **Open = `simctl openurl <test device>`** through the server (`POST /api/deeplinks/open`): no runner, no relaunch.
  Refused while a test/batch/scan runs (`refuseWhileTesting`) and under a short `deeplink` device-lock lease, so a
  link can never land in the middle of a run. A shut-down test device gets a plain message, not simctl's
  "current state: Shutdown".
- **Replaces** the App card's plain Link field (local `simctl openurl` on the *selected* simulator, `https` allowed,
  no lock): one place to open links, always the test device, always lock-guarded. `SimulatorControlling.open` removed.
- Saved links + last 30 opens in `.data/deeplinks.json`; `qaw link routes|match|open` for Remote Control.
- **Verified:** 6 unit tests (`test/deeplinks.test.js`, incl. every route self-matching); API on a :4646 copy —
  catalog 113, match (`blibli://cari/sepatu` → SearchDeeplinkRouter), https refused, save/list, open on the shut-down
  QA clone → the clear error; `qaw link match` against :4646. Test caught `{id}` shifting slot names (fixed).
  **Not yet seen:** a successful open on a booted QA clone, and the Mac card on screen.

## D-158 — Claude runs pick their model and move up when stuck (2026-10-27)

- **User:** "a model switch feature where during claude is running a test case, it smartly analyzes which model to
  use based on test case complexity." Choice offered: **rules + escalate** (picked, recommended) vs a Haiku
  classifier call vs rules only.
- **Pick (`lib/model-pick.js` `pickModel`), local, no model call:** steps > 3 (+1 per 3, max 3); a named API +1, or
  +2 when the precondition asks for a data state / mock words; timing or motion words +2; crossing screens +1;
  history — hard verdicts (BLOCKED/FAIL/UNDECIDED) since the last PASS +2 each (max 4), struggles before a PASS +1.
  0–2 Haiku, 3–5 Sonnet, 6+ Opus. Triage/repair/save turns never start on Haiku. A hand-picked model wins.
  On today's 96 loaded cases: 26 Haiku, 69 Sonnet, 1 Opus; HM-901 → Haiku, SF-001/006 → Sonnet.
- **Escalate (`watchForEscalation`):** three failed tool results in a row (an error, or a driver answer reading "not
  found / timed out / not hittable…"), or the tier's budget spent (Haiku 6 min, Sonnet 12 min) → next tier, once per
  tier, upward only, via **`query.setModel()` on the live Agent SDK session** — the conversation and the phone's
  state carry over; no kill + resume. Only automatic picks escalate.
- **Shown:** job log `● model: Sonnet (auto, score 3: …)` and `● model: Haiku → Sonnet — 3 failed steps in a row`;
  narration slice `model`/`modelReason` (Mac live-steps header); run history `model` + `modelPick` (initial, score,
  reasons, escalations). Mac: the Run with Claude dialog offers Auto / Haiku / Sonnet / Opus; `POST
  /api/testcases/:id/run` and `/api/batch` take `model`; `QA_RUN_MODEL` sets the server default (else `auto`).
- **Verified:** 6 unit tests (`test/model-pick.test.js`); `setModel` exercised against the real SDK
  (claude-agent-sdk 0.3.292): one session answered on `claude-haiku-5-5`, then `claude-sonnet-5-5` after
  `setModel("sonnet")`. **Not yet run:** a real `/qa-run` on Auto (needs the QA clone booted + Claude usage).

## D-159 — Test-case tables with a blank row-number column (2026-10-31)

- **User:** loads a new batch — GDNIT page 2446558056 (MICROSITE_TABBING test cases), tech doc EN 2391769202.
- That page's case table has a **blank first header** over row numbers and a **"Test cases"** header for the
  scenario; the parser knew neither, so every case would load without a scenario and with `col0` numbers.
- **Choice:** a blank first header becomes the `id` column (only when no other column is the id), and "test cases"
  joins the scenario names. The id no longer counts toward picking the case table, so a metadata table can't win on
  a blank first cell alone. Ids stay the page's own numbers ("1"…"29"); macros are named `<id>-<scenario slug>` under
  the module folder, so they don't clash with SF-/HM- macros.
- Markdown escapes (`MICROSITE\_TABBING`) are dropped from cells, so titles and macro slugs read plainly.
- **Auto-pick (D-158) learned this page's wording:** a step that *configures* CMS data ("Configure a tab with…",
  "Set \`invertMode\` = true") or a JSON body in the API column now counts as mocked data; sticky / collapse /
  expand count as motion. On the 29 cases: 6 Haiku, 23 Sonnet (before: 13 / 16, with mock-only cases on Haiku).
- **Verified:** unit tests (265/265); loaded through the live TestForge (Claude loader) — 29 cases. Both pages read-only — like 2396520535, nothing is
  written to them.
- **Deeplink open, first real run (D-157 follow-up):** on the booted QA clone `simctl openurl` raised iOS's
  "Open in “Blibli”?" SpringBoard prompt (first open only; the next open went straight through). The open route now
  asks the harness to tap **Open** (`alertTap`, 4 s, no harness restart) and answers `isConfirmed`; when the harness
  isn't up it says to tap Open by hand. Verified by hand through `/api/driver/command` (`found: true`,
  `alertSource: springboard`); the promo screen then pushed over Home with a Back arrow — **D-157 open Verified**.
  The route code itself needs a TestForge restart to go live.
- **Environment for the batch:** the QA build talks to **production** (`www.blibli.com`) and already sends
  `useMicrositeTabbing=true` on `/backend/content-api/promotions/{url}`. The UAT-B test pages 404 there
  (`MICROSITE_NOT_FOUND`). Plan: mock the live prod page `blibli-histeria` (30 real components, incl. an
  ANCHOR_TABBING) with a MICROSITE_TABBING component added, one variant per case family.
- **https links (user, 2026-10-31):** "can we … `xcrun simctl openurl booted "https://www.blibli.com/promosi/…"`".
  Tried on the QA clone: `https://www.blibli.com/promosi/iphone-duo` opened **in the app** (universal link — the app
  fetched `promotions/iphone-duo`, no Safari, no prompt). So D-157's "https opens Safari" was wrong for Blibli hosts:
  `urlProblem` now allows http(s) on `*.blibli.com`; other hosts are still refused.
- **UAT-B workaround (user):** "replace https://wwwuatb.gdn-app.com/ with blibli://". `normalizeLink` does that before
  match / open / save; the match answer's `url` is the rewritten link and the Mac card says "Opens as …". Other
  `*.gdn-app.com` hosts are refused rather than guessed. 3 unit tests; Mac build + lint clean.
- **Smoke run (cases 3, 9, 18 on Auto, 2026-10-31):** all three started on Sonnet (score 3), no escalation, ~$1 total.
  9 **PASS** (invert: white titles, light indicator); 3 **EVIDENCE_ONLY** (renders right; no PAGE_TABBING page or
  Figma to compare "same as"); 18 **BLOCKED** — the driver saw only `MicrositeTabbing_Container`, no tabs.
- **Cause:** the bar called `setAccessibilityIdentifier(with:)` with the helper's default `ignoreSubviews: true`, which
  makes the container one accessibility element and hides the tab cells (they already carried
  `MicrositeTabbing_Tab_image_<n>`). Same helper default D-142 flags app-wide. **User chose** a component-scoped app
  fix: container `ignoreSubviews: false`, each cell gets the tab title as label + `.button` trait. Not the deferred
  app-wide change.

## D-160 — Query Brief: a long chat query → one-glance visual (proposal, 2026-10-31)

- **User:** "a developer/QA member posts their actual query, tags relevant stakeholders. TestForge smartly analyses
  the queries, reads added screenshots, developer can add Numbers on screenshots, and letters on focus points … then
  add notes similar to existing Measure → screenshot → notes → save … the entire crux of the query will be converted
  into a quick glance graphics visual … truth table, flow chart, figma screenshot with markers … a list which claude
  can pick."
- **Shape (proposed):** new **Brief** section. Paste query + images + links, tag stakeholders by role (BE / UI-UX /
  DA / PM); pin numbers (questions) and letters (focus points) on any image, reusing Measure's pin canvas
  (`MeasurePin`, `MeasureAnnotatedImageView`); one Claude turn (model via D-158 pick) splits the query into asks and
  returns **structured data for one catalog visual** — never a free-drawn image; the Mac app renders it and exports a
  PNG. Mandatory review step; one-click switch to another visual.
- **User choices:** share = **copy PNG + text** and **Jira comment** (Atlassian connector, confirm before posting).
  MVP visuals = **truth table, annotated screenshot, flow / sequence, event-param matrix**. Event-param matrix must
  also cover params whose **reference is unclear to developers**: a "source" column (API field path / UI element /
  constant / unknown) and an explicit "?" asking DA to define it — the open question is part of the visual, not lost
  in prose.
- **Risks noted:** screenshots can carry prod user data → redact before analysis (in the networklens source, not the
  copied `lib/redact.js`); never auto-post; a misread "crux" is caught by the review step.
- **Status:** exploration only — nothing built.
- **D-158 follow-up — rerun cost (2026-10-31):** case 18's rerun started on **Opus** (score 7: its last run was
  BLOCKED, +2) and PASSed for $1.90; the macro-save follow-up continued the same session on Opus for $2.37. The BLOCKED
  was an app accessibility bug fixed in the new build, so the history penalty over-charged it. Proposed (not built):
  ignore hard verdicts recorded on a different build, and drop save/learn follow-up turns to Sonnet.
  **User chose:** tighten, then run the rest. Built: `pickModel(…, {buildId})` counts only same-build runs (the run
  record's `build.buildId`); `followUpModel` drops a continued Opus session to Sonnet for save/learn turns (logged
  `● model: Opus → Sonnet for the save turn`). 1 unit test (267/267).
- **Server MVP built (2026-10-31):** first real analysis failed to parse because `runClaude` resolves `result` as the
  stream's final event object — the answer is `result.text` (fixed for analyze + Jira). Visual stays data: the Mac app
  renders it, so a PNG, the chat text and an edit all come from one JSON.
- **Mac screen built (2026-10-31):** native section **Brief (⌘B)** after Reports (⌘B was free; Network/Claude keep
  ⌘9/⌘0). Share = **Copy text**, **Copy image**, **Save PNG…** as separate buttons — one clipboard item can't paste as
  both image and text everywhere — plus **Comment on Jira…** behind a confirmation dialog. Picking an alternative
  visual re-runs analysis with `visualType` forced. The person's visual edit (`PUT …/analysis`) has no UI yet.
  The Jira route now records its outcome on the brief (`jiraPost`) because the app polls briefs, not job streams.

## D-161 — Claude's usage limit pauses a batch instead of failing its cases (2026-10-31)

- **What happened:** the MICROSITE_TABBING batch (26 cases, Auto) hit the account's 5-hour limit at 08:27 IST. The
  stream result was `is_error`, `api_error: "usage_limit_reached"` (HTTP 429, "resets 11am"). The run executor read
  it as "no verdict line" → **UNDECIDED**, and the batch moved on: cases 24–29 each "ran" in ~1 s and were recorded
  UNDECIDED with a failure screenshot — six fake results, and model pick history counted them as hard verdicts.
- **User chose:** fix pause-on-limit, then rerun 24–29.
- **Built:** the Claude run executor detects the limit (`api_error === "usage_limit_reached"`, or `is_error` with
  status 429), records **no run**, logs `⏸ <message>` and ends the job as `USAGE_LIMIT`; `jobDone` passes
  `usageLimit` through. `RunBatch` puts that case back to **queued** (fields reset) and pauses with the reason
  ("Claude's usage limit stopped 24: … Resume when it resets — 24 runs again."); its loop now re-scans for the next
  queued case so the requeued one runs after Continue. The results summary carries `pauseReason`; the Mac menu bar
  shows it with **Continue** (`POST /api/batch/resume`; the web UI's Continue already existed); `qaw resume` added.
  No auto-resume at reset time: the reset message is free text, and an unattended resume could burn the next window.

## D-162 — Run bundles: one person pays for Claude, the next replays free (2026-10-31)

- **Ask (user):** "build the export/import bundle so that only one developer puts hard effort and burn tokens and next
  person validating same tests can save tokens and time." Before this, sharing a run meant committing its macros,
  element registry and mock packs to the branch, and nothing carried the first run's verdicts or proof.
- **Format:** one JSON file, `*.qawbundle.json` (`format: "testforge-bundle"`, `formatVersion: 1`) — readable,
  diffable, attachable to chat/Jira; no zip dependency. It holds the cases' full text, each case's macro **and every
  routine it runs**, only the registry elements those macros reference, the mock rules their `mock` steps arm
  (repo pack first, else the device's rule; redacted; switched off), the code (branch, code id, commit, local
  changes), the run's final verdicts with Claude cost and a 720 px JPEG of the last proof screenshot (`sips`). Home
  paths become `~`; the simulator UDID is dropped. MICROSITE_TABBING: 26 cases, 3.6 MB.
- **Export merges later runs of the same code** (default on, `merge: false` to turn off): each case takes its newest
  finished result from later runs whose `codeId` matches — so the 26-case run exports with 24–29 from the rerun D-161
  forced, not the UNDECIDED rows the usage limit left.
- **Import never silently overwrites:** per macro / element / mock it is `add`, `same` or `differs`; `differs` keeps
  the local copy unless the person picks **Replace mine and import** (`overwrite`). A replaced macro is written where
  it already lives so the id stays defined once (lint stays clean). Import also loads the bundle's cases on Test Cases.
- **Code check, warn only:** `match` / `notPrepared` / `otherBranch` / `otherCommit` / `localChanges`. Refusing would
  block the common "same branch, one commit later" case; the warning is on the sheet and in the CLI output.
- **Replay is driver-only (`noClaude`):** a bundle replay never sends a failed replay to Claude triage and never
  learns macros, so it costs $0; a failure is the verdict. Cases with no macro (BLOCKED, UNDECIDED, unproven saves)
  are listed as "need a person or Claude" and never auto-run through Claude. Cases are mapped to macros by the
  bundle's own `macroId`, not by `links`, so a macro reached through another module's `.ref.json` still replays.
- **Comparison:** the replay run stores `bundleId`; `GET /api/results/:id` adds each case's `bundleVerdict`, the Mac
  case row reads "Bundle said PASS · Recording …" and the header "N of M replayed cases agree with the bundle's run";
  `GET /api/bundles/:id/compare` is `compareRuns` with the bundle as the base.
- **Not built:** preparing the bundle's branch automatically on import (Prepare stays a deliberate step), and a view
  of the bundle's proof JPEGs in the Mac app (served at `/api/bundles/:id/proof/<case>.jpg`).
- **Verified (2026-10-31):** exported the real MICROSITE_TABBING run (17 of 26 replayable, 18 macros, 16 elements, 1
  mock); imported into an empty UI-test folder (lint clean) and into the real repo (0 conflicts; the Histeria mock
  pack was missing from the repo and was added from the bundle); `qaw bundle replay … 4 13` on the QA simulator →
  both PASS in 67 s / 80 s, $0 (the first run spent $0.78 / $0.89 and 159 s / 201 s), agreeing with the bundle.

## D-163 — Record which mock variant answered each case; bundles carry it (2026-10-31)

- **Ask (user):** does the export carry the mocked JSON combinations per test case? It carried every variant's full
  JSON, and recorded cases name theirs in their `mock` steps — but for cases Claude ran without a saved recording,
  nothing said which variant was on. User: "yes, build it".
- **Why matching, not a NetworkLens change:** the trace marks `isMockServed` but `source.mocked` is empty — no variant
  id. Adding one means a fork change, a tag and a rebuild of the app; matching works today and on old traces.
  `lib/mock-variants.js` matches the served response against every variant of the endpoint's rules: same body bytes
  (`exact`), else same status + byte count (`size`, for redacted or retimed bodies), a served failure → failing
  variants; same body with different delays (`loaded` / `slow`) → the delay closest to the trace's `timing.total`
  (`+timing`). Still several → `ambiguous` with `candidates`, never a guess. All rules for one endpoint are matched
  together (the QA device had an old 5-variant Histeria rule beside the 18-variant one — first attempt matched the
  wrong one). Device rules come before repo packs (packs are redacted).
- **Recorded:** run evidence gains `mocksUsed: [{endpoint, variant, match, count, candidates?}]`. Bundle items carry
  `mocksUsed`, best evidence first: recorded → trace read back over the case's time window (runs before D-163, while
  the trace still holds them) → the variants its macro arms (`match: "macro"`). An endpoint a case used is bundled
  even without a macro. `inspectBundle` lists `caseMocks`.
- **Arming by hand:** `POST /api/bundles/:id/cases/:caseId/arm` switches the case's variants on through `armMock`
  (device rule or repo pack), live when the app is up; Mac sheet **Set up mocks** per case; `qaw bundle mocks|arm`.
  A case that switched variants mid-run arms them in order — the last one stays on.
- **Limit:** the trace rolls over. MICROSITE_TABBING's main batch (02:00–05:50) is gone from it, so 1, 2, 7, 15, 20,
  21, 24 and 28 stay without a variant; runs from now on record it in evidence and don't depend on the trace.
- **Verified (2026-10-31):** re-export: 4, 13, 27 resolved `exact` from the trace, 29 `loaded` by timing (served in
  ~0 s; `slow` delays 3 s), the rest `macro`; `qaw bundle arm … 29` → Histeria `loaded`, live, no relaunch; a fresh
  replay of 4 recorded `mt-null-image` (`exact`) in its evidence; Histeria rules off again after. 289/289 tests.

## D-164 — Self-explaining demo videos: notes once, subtitles and pointers burned in (2026-11-01)

- **Ask (user):** demo recordings shared for small stories are "mere clicks and showing API responses"; a new developer
  or manager can't relate to them. Make test-case validation role neutral — anyone in the org understands a case
  without an explanation. Overlay notes and precise pointers (element frames by accessibility id), like subtitles:
  they never change the test. "All of this becomes part of export import."
- **User choices:** subtitles in **English + Bahasa Indonesia**; shared on **Teams, Jira and Confluence**; first slice
  **one case end to end** (case 18).
- **Shape:** an opening card (what this checks · why it matters · how the page is set up), a subtitle per explained
  step, a pointer on the step's element (yellow box + tap dot for actions; green "✓ As expected" / red "✗ Not as
  expected" for checks), a closing card (result + case). Plain-words rule enforced in the notes prompt: no API /
  endpoint / mock / field names; "the server sends…".
- **Notes are written once, by Claude (Sonnet), and kept in the macro (`demo`)**; plain words for each server answer
  go to `QAMacros/mocks/notes.json`. Replays, re-renders and bundles reuse them for $0. Case 18's notes cost one
  Sonnet turn. Claude dropped the method from endpoint keys (`/backend/…`) → parse maps keys back to the test's own.
- **Demo replay:** `enqueueReplay(macro, {demo: true})` films the whole macro (`simctl recordVideo`) and records a
  timeline: actions framed *before* they run and held 1.5 s (where the finger goes), checks framed *after* and held
  2.5 s (what should be seen), a disappearing element framed before it goes. `replayMacroV2` now **awaits** `onStep`
  (the first recording showed holds not holding and steps 8/9 mis-paired) and passes `from` to `onStepStart` (routine
  step ids `st_1…` collided with the case's own — the setup relaunch got the case's first subtitle).
- **Rendering is native (Mac app, AVFoundation)**, run headless: `TestForge --render-demo <folder>` (a `@main`
  dispatcher; the server calls the built app after recording). First version used `CATextLayer`/`CAShapeLayer` in
  `AVVideoCompositionCoreAnimationTool`: text didn't render and shapes filled solid → each card/subtitle is now one
  full-frame CoreGraphics bitmap with an opacity window. The shared setup before the first explained step is cut
  (1.5 s lead-in); the first and last frames are held under the cards; 720 px wide, Medium preset (68 MB → 3.6 MB for
  a 46 s demo). `.vtt` beside each MP4 so Teams / Jira / Confluence players can toggle captions.
- **Bundles:** the macro's `demo` block travels as part of the macro; `bundle.mockNotes` carries the server-answer
  notes, merged on import (`written.mockNotes`); the import plan counts `demoNotes`. The receiver records their own
  demo for $0 (`qaw demo record`) — rendered videos are not embedded in the bundle (size).
- **Not built yet:** a Mac UI to write notes / record / open demos (CLI + API only), editing notes in the app, a story
  reel (several cases, chapters), and a live in-TestForge overlay using the same notes.
- **Verified (2026-11-01):** case 18 — notes (EN + ID) → demo replay PASS → `demo-en.mp4` / `demo-id.mp4` (46 s,
  3.6 MB each) + `.vtt`; frames checked: opening card in both languages, yellow box on the iPhone tab during "Tap the
  iPhone tab", green outline + "✓ Sesuai harapan" on the pinned tab bar, closing "Hasil: lulus". 292/292 tests.

## D-165 — Live explained overlay over the Simulator; demos move into the app (2026-11-01)

- **Ask (user):** "start building the live overlay", and: "The whole purpose of developing TestForge is to
  move interactions in the app from command line." D-164 demos were CLI/API only; that is not done.
- **Shape:** the D-164 notes, drawn live on a click-through panel over the Simulator screen during a slowed replay:
  opening card (what is checked · why · setup), a plain-words subtitle per step, a pointer on the element (yellow box
  + tap dot for an action, blue while a check runs, green "✓ As expected" / red "✗ Not as expected" once decided),
  and a result card for 5 s after the run. English or Bahasa (Settings › General › Explanation language). Like
  subtitles, it never changes the test.
- **One pacing, two outputs:** an explained replay uses the D-164 demo recorder without the video; the recorder's new
  `onFocus` callback feeds `narrator.explainFocus`, so the overlay follows exactly what the demo video would show. A
  demo recording is always explained live too — the overlay is a Mac window, so the device recording never shows it.
  Noted steps without an element (open a link) are now held 1.5 s so their subtitle can be read (video too).
- **Reused, not new:** the existing step-outline panel (`StepOverlayPanelController`, recommendation #7) now hosts a
  `StepOverlayContent` (outline or explain). The explained overlay shows whether or not "Outline steps" is on: it
  reads frames itself and needs no lease. Tracking stops by itself after the result card.
- **Setup stays under the card:** the first live run showed the 6 s card, then ~60 s of shared setup (relaunch, home)
  with nothing on screen. The card now stays up through routine steps until the test's own first step.
- **In the app (Test Cases › Explain menu):** Replay with explanations · Record demo video · Write / Rewrite
  explanations with Claude… (confirmed first; one Sonnet turn, ~1 min). `hasDemoNotes` on each recording tells the
  menu which. Tutorial tip + tour step 10 (QA and Developer).
- **Headless check:** `TestForge --preview-explain <demo folder> [en|id]` renders the overlay's real views and
  mapper over the recording's frames, one PNG per state — used to verify the drawing without moving anyone's windows.
- **Not built yet:** a demos list in the app (open / reveal / share the videos — today the job log prints the
  folder), editing explanations in the app, a story reel.
- **Verified (2026-11-01):** explained replay of case 18 from the API the menu calls → narration went intro → steps
  (action / checking / passed with frames and notes) → result, PASS. The user's screen had Chrome full-screen, so the
  panel correctly stayed hidden; the drawing was checked with `--preview-explain` in EN and ID (opening card, yellow
  box on the iPhone tab, green "✓ As expected" on the pinned bar, "Hasil: lulus"). 293/293 tests. Not yet seen live
  over a visible Simulator.

## D-166 — Edit a loaded test case locally (2026-11-01)

- **Why:** case 15's document text says "Selected indicator moves to the tapped tab", but in URL mode the tap only
  opens the tab's page; the indicator on the page you tapped stays put (the user's rule). The TestForge had no way to
  correct a case — the fix was a hand edit of `.data/testcases.json` plus a restart. The test document is a
  read-only production page, so it can't be the place to fix it either.
- **Edits live beside the document, never in it:** `lib/case-edits.js` stores `.data/case-edits.json`, keyed by
  document source and case id, holding only the fields that differ plus the document's text at edit time. Every load
  lays them over the document's cases (`applyCaseEdits`), so a reload keeps them. Setting a field back to the
  document's text drops it; nothing left removes the edit.
- **Editable:** scenario, precondition, steps, expected, API. Evidence and statuses stay the document's.
- **Runs use the edit, explicitly:** `caseRowText` tells Claude the row has the tester's local corrections and that
  they override the document (which `/qa-run` may still read, with the old text).
- **Stale edits are flagged:** if the document rewords an edited field later, `localEdit.isDocumentChanged` turns the
  notice orange — "check your edit still applies".
- **Bundles carry them:** an exported bundle's cases are the text that ran, with `localEdit`. On load,
  `separateCarriedEdits` puts the document's text back and stores the edits, so the receiver sees the same marker and
  can revert.
- **Mac UI:** Test Cases › Edit… (⌘E) opens a sheet with the five fields; an edited case shows a pencil in the list, a
  notice with **Revert to document…** (confirmed), and "Document says: …" (struck through) under each edited field.
  Tutorial tip "Fix a case's text" + tour step 11 (QA, Developer).
- **Routes:** `PUT /api/testcases/:id/edit {fields}`, `DELETE /api/testcases/:id/edit`.
- **Case 15:** the hand edit was undone (document text restored in `.data/testcases.json`) and the correction saved
  as a proper local edit through the new route.
- **Verified (2026-11-01):** 300/300 tests; the live `testcases` slice carries case 15's `localEdit` after a
  TestForge restart. The sheet and notice were built and compile; not yet clicked through on screen.

## D-167 — Tests buttons lock during a run; thinner explain pointers (2026-11-01)

- **Ask:** after Replay is clicked, every other Tests button must disable at once and stay disabled until the run is
  stopped or ends. The explained overlay's highlight strokes were too thick.
- **Lock:** `TestsSectionViewModel.isStartingRun` is set on the click (Replay, Replay with explanations, Record demo,
  Run with Claude) and cleared when the server lists the run (a running run, or a newer newest run id) or the request
  fails. `isRunInProgress` = server-side running run OR starting. It gates Replay, the Explain menu, Write
  explanations, Run with Claude, Edit… (⌘E), Revert to document and the document header (Load). Stop stays in the
  live-steps inspector. Before, the gate came only from the server's narration slice, so there was a gap after the
  click and Edit / Write explanations / Load were never gated.
- **Strokes:** pointer outline width halved, 0.009 → 0.0045 of the screen width, in both the live overlay
  (`ExplainOverlayConstants.Pointer.lineShare`) and burned-in demo videos (`DemoLayout.pointerLineWidth`) so they match.
- **Explanations for already-passed cases:** no re-run needed. Explain › Write explanations with Claude reads the
  recording's steps and the case and writes EN/ID notes into the macro's `demo` block; nothing replays.
- **Built:** compiles, lint clean; not yet clicked through on screen.

## D-168 — Result card: check or cross, verdict in color (2026-11-01)

- **Ask:** the closing card after an explained replay should follow standard result UI: green check and green text
  for a pass, red cross and red text for a failure.
- **Choice:** one `DemoOutcome` (passed / failed / undecided, from the verdict prefix) drives both the live overlay
  (`ExplainResultCardView`) and the burned-in demo video (`DemoPainter.resultImage`), so they look the same.
  Centered layout: large SF Symbol (`checkmark.circle.fill` green, `xmark.circle.fill` red,
  `exclamationmark.triangle.fill` orange for a verdict that is neither PASS nor FAIL), bold colored title
  ("Test passed" / "Test failed" / "Couldn't decide"; "Tes lulus" / "Tes gagal" / "Belum bisa diputuskan"), then the
  case id in muted caps and the scenario in white. Before, every non-PASS verdict read "Result: failed".
- **Verified (2026-11-01):** `--preview-explain` and `--render-demo` on a copy of case 18's demo folder: pass (EN live
  overlay, ID video outro) and a FAIL-edited timeline render as intended. Not yet seen live over the Simulator.

## D-169 — Arrange under Stage Manager; colored sidebar (2026-11-01)

- **Arrange bug:** with Stage Manager on (macOS 26.5), Split View tiled the Simulator right but the left chooser showed
  every window as Stage Manager thumbnails; the TestForge was never picked and the screen was stuck in the chooser.
  Side by side also failed: a Simulator in the strip reports a thumbnail-sized frame, so Arrange said "on another
  desktop".
- **Fix:** `WindowArranger.isStageManagerOn` reads `com.apple.WindowManager GloballyEnabled`. When on, Arrange skips
  Split View; `joinSimulatorStage` gives the TestForge window `.canJoinAllApplications`, activates the Simulator and
  waits until its window has a real on-screen frame, then the usual side-by-side placement runs. Restore (and a failed
  arrange) removes `.canJoinAllApplications`, so the TestForge leaves the Simulator's stage. Rejected: dragging the
  strip thumbnail (the strip doesn't say which thumbnail is which app) and turning Stage Manager off (changes a
  system setting).
- **Sidebar:** System Settings-style colored icon tiles, one hue per section (`TestForgeSection.tint`); the selected
  row's tile grows 22 → 26 pt with a shadow and its name turns semibold (`SidebarRowView`, `SidebarConstants`).
- **Verified (2026-11-01):** on this Mac with Stage Manager on and two displays: Arrange put the TestForge left and
  the Simulator right on the main display; Arrange again restored both frames and the TestForge left the stage.
  Sidebar seen in the same screenshot.

## D-170 — Brief screen adapts to narrow windows (2026-11-01)

- **Bug (user screenshot):** the composer was cut off on the left behind the brief list. The detail area (~600 pt in a
  normal window with the sidebar and list showing) is narrower than the composer + result minimums (360 + 420 pt);
  `HSplitView` squeezed the composer below its minimum and its scroll content was centered and clipped.
- **Fix:** `BriefSectionView` measures the detail width: side by side (`HSplitView`) only when both columns fit at
  their minimums, otherwise one scroll view with the composer above the result. The screenshot buttons and the
  "Tap drops" picker now sit on two lines, so the composer needs less width.
- **Verified (2026-11-01):** in the running app at 1240 pt wide, the composer shows in full with the result below it.
  The wide side-by-side layout is unchanged code and was not re-checked.

## D-171 — Scan › Record macro: navigate by hand, save a replayable macro, flag missing IDs (2026-11-01)

- **Ask (developer, user):** Scan was meant to turn a person's navigation into a macro; neither tab did (Screen
  surfaces only saves element lists; the D-117 flow map only drew a graph, and mis-named/mis-matched screens). Build
  "Record a macro", and alert the person whenever a tapped element has no accessibility ID.
- **Recording (Mac):** the flow map recorder now also keeps every gesture in order (`RecordedStep` in
  `flow.json › recordedSteps`): the element under the pointer, the screen it was on, and — when a new screen came up —
  an *anchor*: an identifier that appeared after the step and wasn't there before (non-numbered, nav bar/title/header
  preferred). The hit test walks up to 3 parents for an identifier when the pointer lands on a button's text, unless
  the parent is >6× the hit's area (a container). Screen titles skip text over 32 characters or containing ":" (the
  "Kirim ke: <address>" bar was naming Home).
- **Alerts:** a tap without an identifier shows an orange banner under the record bar and posts a macOS notification
  (`FinishNotice.isAlertOnly`: clicking only brings the TestForge forward). The step row is orange with the reason;
  the Save sheet lists them all first and its button reads "Save anyway".
- **Saving (server):** `lib/recorded-macro.js` builds the v2 macro — optional `relaunch`, `tap` by identifier
  (registry element reused when one already has that identifier/label), label fallback (`quality: label`) when there
  is no ID, a `manual` step when there is neither, `swipe` with direction, then `waitFor` the anchor (15 s) and a
  `screenshot` per new screen. `POST /api/macros/v2/recorded` writes the registry and the macro (a free file name,
  never overwriting), links the chosen case, pokes `testcases`.
- **UI:** Scan's first tab is now **Record macro**; left column Steps | Screens; header **Save as macro…**. Screen
  surfaces is unchanged (not merged — it holds the harness, a separate mode).
- **Not captured yet:** typing, long-press, back-swipe from the edge, system alerts.
- **Verified (2026-11-01):** live on the QA simulator with Stage Manager: Record → tap Account → settings gear →
  Language. Screens named "Home screen", "profile screen", "Settings"; the Language tap (no ID) raised the banner and
  an orange step; Save sheet listed it; saved `Engagement/General/macros/recorded-home-screen-to-settings.json`
  reusing 2 registry elements. Replay: **PASS (driver-level) 10/10 in 24.6 s** (relaunch, 3 taps incl. by-text, 3 waits,
  3 screenshots). Test macro and its 3 new registry entries removed afterwards (registry byte-identical). 304/304 server
  tests (4 new). The macOS notification banner was posted but not seen on screen.

## D-172 — Remove Query Brief and Arrange (2026-11-01)

- **Ask (user):** remove Brief and Arrange — "both are not adding much value at this point".
- **Removed:** the Brief section (⌘B), `BriefService`, `lib/brief.js`, `routes/briefs.js` and its tests; the Arrange
  toolbar toggle, Simulator menu item (⌥⌘A), `WindowArranger`, `SplitViewArranger`, the "Which Simulator?" prompt and
  the demo run's arrange step. Brief's welcome-tour step 8 became "Export the whole session" (D-173); the Arrange
  tutorial tip is gone.
- **Kept:** `preferTestDeviceWindow` (Measure and the step outline still prefer the test device's window).
- **Archives deleted (user, later the same day):** the `.data/archive/*.tgz` copies of the Brief code and the D-169
  arranger were deleted too, so neither can be restored. One saved brief remains as data in `.data/briefs/`.

## D-173 — Export the whole session (2026-11-01)

- **Ask (user):** export the entire test session — all cases with their metadata — with an option for media.
- **Shape:** one `.zip` (made with `ditto`) holding `session.json` + `report.md`, and `media/<case>/` when asked. A zip,
  not a bundle (D-162): bundles carry one run for replay; this is a record of the whole document for people and tools.
- **Verdict source:** the run history (`runs.json`), the same one Tests' "Last run" reads. Batch results
  (`results.json`) can disagree (case 7: batch PASS, newest run FAIL), so a batch result only changes the verdict when a
  reviewer overrode it; its own verdict, triage and review stay in `batchResults`.
- **Media:** each case's latest proof (batch evidence for the same run, else the run's screenshots) and its demo
  videos; older runs keep their paths only, to keep the zip size predictable.

## D-174 — Scan: Start recording / End recording, then the saved macro (2026-11-01)

- **Ask (user):** "Continue recording" was confusing; Scan needs Start recording and End recording, and after ending,
  the person should land on the list where the macro is stored; plus a prominent list of previously recorded macros.
- **Flow:** phases `library` → `recording` → (`review` only if the save sheet is cancelled). Start recording always
  starts a fresh map (the previous one stays on disk); End recording opens Save as macro at once; saving clears the
  recording and shows **Saved macros** with the new macro selected. New map / Continue recording / the flow-folder
  Show in Finder are gone.
- **List:** `GET /api/macros/v2/recorded` — macros with `recordedBy: "scan"`, newest first, with ID coverage counted
  from the steps (`tap` notes "found by its text", `manual` steps). Only Scan-recorded macros, so Claude-learned ones
  don't bury them.

## D-175 — Tests columns resizable (2026-11-01)

- **Ask (user):** the case list was fixed at 300 pt, so titles were cut off.
- `HSplitView`: case list 240–720 pt (ideal 340), live-steps inspector 220–560 pt; the detail keeps ≥ 280 pt. Case
  rows and the document title show the full text on hover.

## D-176 — Test session report: Markdown, in-app viewer, Confluence export and publish (2026-11-01)

- **Ask (user):** a test session report in `.md`, a Markdown viewer in the app, and a way to export it and publish it to
  Confluence in a format Confluence accepts.
- **One source, two renderings:** `lib/session-report.js` renders the D-173 session as Markdown (summary, needs
  attention, results table, one section per case with document text, last-run steps, run history, proof images,
  videos) and as plain HTML for Confluence. The export zip's `report.md` is the same Markdown with relative media paths.
- **Verdict icons:** ✅ PASS, ❌ FAIL, ⚠️ anything else (BLOCKED, UNDECIDED, EVIDENCE_ONLY), ⚪️ not run — BLOCKED is not a
  failure of the app, matching the summary counts.
- **Confluence format:** plain HTML (headings, tables, lists, emoji) — no macros, because the connector's HTML import may
  drop them, and no images, because the connector can't upload attachments; each case names its proof files, which
  are in the session export. ~22 KB for 26 cases.
- **Publish:** same rule as Reports › Publish (D-087): a Claude session (Sonnet) creates exactly one child page of the
  personal page 2437316839, reading the HTML from `.data/reports/session-*.confluence.html` and passing it unchanged
  (`contentFormat: html`); pages 2396520535, 2446558056 and 2391769202 are named as off-limits. The app confirms first.
- **Viewer:** native SwiftUI, not a web view — a small block parser (`MarkdownParser`: headings, paragraphs, lists,
  quotes, fenced code, pipe tables with `\|`, image lines, rules) plus SwiftUI's inline Markdown. Local `file://`
  images load off the main thread and open on click. Lives in Reports as **Session report** (default) beside
  **Runs by branch**.

## D-177 — Demo library: recorded demos with a native player (2026-11-02)

- **Ask (user):** a demo list in the app showing already-recorded tests with a play button, a language choice, and
  play, pause and slide controls, using the native player without adding complexity.
- **Where:** a third Reports mode, **Demos** (beside Session report and Runs by branch), not a new sidebar section:
  ⌘0–⌘9 are all taken and demos are a way of presenting results, like the report.
- **Player:** SwiftUI AVKit `VideoPlayer` with its own controls (play/pause, scrubber, volume, full screen) — nothing
  custom. The proof viewer's controls-less `AVPlayerView` (D-118) was not reused; it exists for frame stepping and zoom.
- **Language:** one picker (English / Bahasa Indonesia) for the library. Switching while playing swaps to the other
  rendered file at the same time position, since both are the same recording with different subtitles (D-164). A demo
  with one language plays that one and says so.
- **Server:** none — `GET /api/demo/recordings` (D-164) already returns every folder with its per-language files.

## D-178 — Demo videos sharp; full screen in the Demos player (2026-11-02)

- **Ask (user):** demo video quality is very poor and blurry; the player needs full screen.
- **Cause:** D-164 exported with `AVAssetExportPresetMediumQuality`, which ignores the 720 px render size and caps the
  frame at about 480 px tall — the demos came out 220×480 at 625 kbps from a 1284×2778 recording.
- **Fix:** `AVAssetExportPresetHighestQuality` at 1080 px wide (1080×2336). A 46 s demo is ~42 MB per language,
  ~12× the old size; chosen over a custom `AVAssetWriter` bitrate to keep the renderer simple. Existing demos are
  re-rendered with `TestForge --render-demo <folder>` (the raw recording is kept, so nothing is lost).
- **Full screen:** SwiftUI's `VideoPlayer` has no full-screen button on macOS, so the Demos player is an `AVPlayerView`
  with floating controls and its own ⤢ toggle; AVKit has no public call to enter full screen, so no extra button.

## D-179 — Demos: click a row to open the demo paused (2026-11-02)

- **Ask (user):** only the ▶ was clickable though the empty state said "Pick a demo"; make the whole row clickable and,
  on click, load the player with a play button so the person chooses when to play.
- The list uses native `List(selection:)`, so the full row (and arrow keys) selects; selecting opens the demo paused.
  The row's ▶ is now just an icon, so there is one way in.
- A big ▶ sits over the paused video (also Space) because the floating AVKit controls appear only on hover; it hides
  while the video plays and comes back on pause or at the end.

## D-180 — Override a case's result on the Tests page, with a required reason (2026-11-02)

- **Ask (user):** on the Tests page let the person override a test result, with a mandatory description of the change;
  the change history goes into the import and export files. Also offer to rerun the test with the updated expected
  result, leniency and the person's comments when they submit.
- **Per case, not per run:** the Results section already had a per-run-item review override (D-062), but Tests read
  only `runs.json`, so those never showed there. D-180 adds a case-level store, `.data/result-overrides.json`
  (`lib/result-overrides.js`), keyed by document source and case id like local edits (D-166). The document is never
  written.
- **History, not a single value:** every change is appended `{verdict, previousVerdict, reason, leniency, at}` and never
  rewritten. The newest one sets the shown verdict until a newer run lands; the run then counts, and the history stays.
- **Verdicts:** PASS, FAIL, BLOCKED, UNDECIDED. The reason is required (400 without it); leniency is `strict` (default) or
  `lenient`.
- **Travels:** cases carry `resultOverrides`, so a run bundle export (`*.qawbundle.json`) carries them; import merges
  them back (`separateCarriedOverrides` → `merge`, deduplicated by time + verdict, never drops local entries). Session
  export (`session.json`) has them per case plus `summary.overridden`, and its report lists "Result changes".
- **Rerun:** the sheet has Save and Save and rerun. The updated expected result is saved as a local case edit (D-166),
  so it wins over the document; `reviewerNotesText` adds every reason and the leniency to the Claude run prompt.
  Rerun is always a Claude run, even for a recorded case, because a replay can't read comments.
- **Naming:** the Mac types are `CaseResultOverride*` because the Results section already owns `ResultOverrideDraft`.

## D-181 — Importing a bundle adds its cases to the loaded document (2026-11-02)

- **Cause (user: "Why is T18 removed?"):** the D-162 import replaced the loaded document with the bundle's cases. The
  MICROSITE_TABBING bundle came from the 26-case run, so cases 3, 9 and 18 (run earlier, on their own) vanished from
  Tests on 31 Oct. Their recordings, results and demo were never lost.
- **Ask (user):** make import merge cases instead of replacing.
- **Rule:** a bundle of the loaded document (same source, same title, or the loaded source is `bundle:<its title>`)
  adds only the cases the document lacks; loaded cases keep the document's text and order. Carried edits and override
  history are stored under the loaded document's source, never over an existing edit. A bundle of another document,
  or with nothing loaded, still loads as the document: mixing two documents' case ids ("1", "2"…) would be wrong.
- The import response gains `cases: {mode: "merged"|"loaded", added}`; the Mac import sheet shows it as "Test document".
- Not repaired yet: the loaded document is still the bundle; reloading the Confluence page needs its link (not stored),
  and the 5 local edits are keyed to `bundle:…` and need moving over.

## D-182 — Proof indicators on Tests rows (2026-11-02)

- **Ask (user):** each Tests row, once run, should show whether it has screenshots, is evidence only, or has a video,
  with meaningful icons.
- **Source:** the active test batch folder (`QA_MEDIA_ROOT`), where every run files its proof (D-109). Run records hold
  screenshots for only some runs and no videos, so the folder is the one complete source. Folders map to cases by name
  (`21`) or by number after a prefix (`MT-021`, `MT-025-a2`); `demos/` and `failures/` are not proof.
- **Icons (SF Symbols, secondary colour, help + VoiceOver text):** `photo` + count = screenshots; `video.fill` = screen
  recording; `eye` = verdict EVIDENCE_ONLY (no pass/fail, judge by eye). Shown only when the case has a last run.
- Counts are for the whole batch, not just the last run — the folder doesn't say which run wrote a file.

## D-183 — Proof media panel in Tests: view, play, annotate, save (2026-11-02)

- **Ask (user):** use the empty space under a selected case's text to show its result media: play videos, view and zoom
  images, annotate them and save back over the original or as a new copy.
- **Where:** a panel at the bottom of the case detail (fixed 460 pt viewer, thumbnail strip under it), not a new
  window — the Proof window (D-118) stays for Results. The panel reuses its parts: `ProofImageView` (fit, zoom bar,
  pinch, double-click, pan), `ProofVideoView` (player + playback bar), `ProofThumbnailStripView`.
- **Files:** `GET /api/testcases/:id/media` lists the case's images and videos in the active test batch folder, oldest
  first, using the same folder rules as D-182. The list reloads when another case is selected or the case's proof
  count changes (a run filed new files); the file on screen keeps playing across such a reload.
- **Annotate:** pen, arrow and box in red, yellow or green; Undo (⌘Z), Clear, Cancel. Marks are stored as 0…1 of the
  image, drawn on a fitted copy on screen and re-drawn at full pixel size on save (line width 0.8% of the shorter side).
- **Save:** "Save as copy" writes `<name>-annotated[-N].<ext>` beside the original; "Save…" replaces the original after a
  destructive confirmation (it is proof, so overwriting is never silent). JPEG stays JPEG, else PNG. The Mac app writes
  the file itself (same machine); the server only lists files. Copies count as proof in the D-182 badges.

## D-184 — Reopen an ended Test Batch (2026-11-02)

- **Ask (user):** "I ended a test batch. Is there any way I can load it again?" — there was none; ending was one-way
  (D-109). User chose a Reopen action over a one-off data edit.
- **Rule:** `POST /api/test-batches/:id/reopen` makes the ended batch active again with the same id, folder and items, so
  new work attaches to it and proof (`QA_MEDIA_ROOT`) goes back into its folder. A batch active at that moment is
  ended first, with its report, because only one batch is active at a time. Each reopen is appended to `reopenedAt`;
  `endedAt` clears and is set again on the next End (which rewrites `report.md` with everything).
- **Mac:** the Test Batch pill menu has **Reopen Test Batch ▸** listing the 8 newest ended batches; a confirmation says
  whether the current batch will be ended first.

## D-185 — Replays start fast: one look per guard, setup never paced, busy banner, connector line (2026-11-02)

- **Report (managers' demo, user):** explain mode and replays took long between the button and anything happening on the
  phone; the replay "tried to find the back button in a loop, then searched the Home search button".
- **Cause (measured from runs.json):** every replay first runs Open Home (`mc_EAH97EMYH5`, 11 steps). Each step re-asked
  "is the Home search button showing?" (0.4 s when it is, 2 s when not), and each of the 3 Back tries waited 2 s for a
  Back button that a Microsite page doesn't have (its back is `el_PRBK7C4HN2`). In explain/demo mode the routine's steps
  were also treated like test steps: a frame read (up to 2 s) and a 1.5–2.5 s reading pause each, plus the step-outline
  frame read — 20–30 s of pointer hunting before the test's own first step. Case 15: 37 s of steps in a 95 s run.
- **Fix:**
  - `createScreenMemo()` in `replayMacroV2`: a guard's answer is reused, and an optional tap/wait that found nothing is not
    retried, until a step actually acts on the app. Open Home on Home: 1 look instead of 9.
  - Guard looks are 1 s (a relaunch guard stays 2 s: a false "not there" costs a relaunch).
  - Open Home tries the shared Back and the promo page Back (1 s each, alternating); a missing one is looked for once.
  - Explain/demo recorder and the step outline skip routine steps (`step.from`): no frame read, no pointer, no pause.
- **Busy banner (user ask):** "show an overlay with loading indicator and message on the actual simulator when something
  is loading behind the scene." The narrator keeps `run.busy {message, since}`: set for runner restart, preconditions
  ("Getting the app ready — logging in"), routine steps, relaunch, mock arming, opening a page, waiting for something to
  load; cleared by a plain test step and at the end. The Mac draws a spinner pill at the top of the Simulator screen,
  over explained replays too. For a plain (non-explained) replay it shows only when Accessibility access is already
  granted — a replay never prompts for it.
- **Connector (user ask):** the subtitle sits at the bottom while the element can be anywhere, so one gets missed. A
  dashed line in the pointer's colour joins the subtitle's facing edge to the element's nearest edge, ending in a dot;
  none when they already touch.

## D-186 — Each case states its start screen and base UI needs (2026-11-02)

- **Ask (user):** "For every test case set the base UI requirement and the start screen the test case expects app to be
  on. This must be done with help of Claude for the first run. For replays simply bring user to this screen if it is
  straightforward before starting any test."
- **Field:** `requires.startScreen` beside the existing `environment` / `session` / `networkLens` (D-051):
  `home` (Open Home), `anyScreen` (the case opens its own page by deeplink — deeplinks open over any screen, D-157 — so
  only a running app is needed; a stopped app gets Open Home), `freshLaunch` (the macro relaunches itself), or another
  screen name. "Straightforward" = a known routine or starting the app; an unknown screen is logged and the test starts
  where the app is, rather than guessing a route. Met last, after environment and session; skipped when the macro runs
  that routine itself.
- **Existing macros (migrated):** 24 deeplink cases → `anyScreen` with their Open Home step removed (none arm an
  `atLaunch` mock or change an app default, which need Open Home's relaunch); 27 → `home` (Open Home kept in the
  steps, so `atLaunch` relaunches still happen); 6 recorded flows that relaunch first → `freshLaunch`. Routines unchanged.
- **Claude:** the first-run prompt asks Claude to bring the app to the case's start screen and base needs first and to
  add a `START: {...}` line; the learn turn writes it into the macro's `requires` (always with `startScreen`).
- **Mac:** Tests detail shows "Starts on Any screen · Needs UAT B" under Last run (`macro.setup` in the testcases slice).

## D-187 — An optional tap never lingers on a covered fallback (2026-11-02)

- **Found:** timing MT-028 live after D-185, an optional "Promo page Back" tap (timeout 1 s) took 9.7 s. Its label
  fallback matched an element that existed but was covered; round-robin then "committed" to it with the 5 s floor
  (`MIN_COMMIT_WAIT_S`) meant for a required tap whose element is still laying out.
- **Choice:** optional steps commit with their own remaining wait only (floor 1 s); required steps keep the 5 s floor.
  "If shown" means don't wait for it to become tappable.
- **Measured (MICROSITE_TABBING, UAT B, QA sim):** MT-028 plain replay 115.8 s → 28.4 s (13.1 s of test steps; includes a
  one-time bubble relaunch after a TestForge restart). Explained replay 42.9 s. With an env switch PROD → UAT B first, 84 s.

## D-188 — Results carry their build; a newer build that changes a case's code makes it stale (2026-11-02)

- **Ask (demo feedback, F1):** passes go stale across builds; stamp each with branch, commit and build number, and re-check
  stale cases without Claude.
- **Stamp:** `buildStamp()` adds `sha`, `buildInputId`, `appVersion` and `buildNumber` (`CFBundleShortVersionString` /
  `CFBundleVersion` read from the built `.app`, cached per build). Every run record, batch manifest and export already
  carries the stamp, so they gain the build number with no further change.
- **Coverage:** a macro's `covers` (repo-relative app folders) when set — Claude now sets it on a case's first run — else
  its module folder (`<Module>/<Submodule>` under the UI test root) maps to app code (`lib/staleness.js` `MODULE_CODE`).
  Unknown coverage counts any app-code change.
- **Stale rule:** last result ran on another built snapshot (different `builtFrom` and `buildInputId`) **and** the app
  files that differ between them touch its coverage, or the Podfile.lock / Package.resolved. Differences = `git diff
  --name-only` of the two commits (app code only) plus local edits whose content hashes differ. Each built snapshot's
  local-edit hashes are recorded in `.data/code-snapshots.json` while the QA copy still holds that code. A snapshot never
  recorded (with local edits) can't be compared → stale, "can't compare".
- **Replay stale:** `POST /api/batch/stale` runs a batch of stale cases that have a recording, replay only; a failing
  replay is not sent to Claude automatically (the person uses Run with Claude from the row — usage stays a choice).
- **Mac:** Tests header "Testing branch @ sha · 15.0.0 (150006)" (orange when unverified) and "Replay stale (N)"; a clock
  badge on stale rows; the detail shows "Ran on …" and the stale reason with the changed files; a Stale filter. Tutorial
  tips + tour step 14.

## D-189 — Reports › Batches; ending a batch opens its report; batch progress kept on the batch (2026-11-02)

- **Ask (demo feedback, F2):** a batch list to switch, reload or delete batches; older reports viewable in the app; End
  batch goes straight to its report; robust progress state.
- **Progress:** each batch item gets its task's `status`, `verdict` and `caseId` copied onto it as tasks change
  (`TestBatchStore.settle`), so counts survive restarts and the task store's 200-task cap. `batchProgress` counts per case,
  latest result wins: PASS… passed, FAIL…/BLOCKED… failed, UNDECIDED/EVIDENCE… undecided; a batch run's cases come from the
  results store. Non-test turns (a save-as-macro DONE) don't count. The report's header carries the same "Results:" line.
- **Remove, not delete:** `DELETE /api/test-batches/:id` takes an ended batch off the list; its proof folder and
  `report.md` stay on disk (deleting proof is not undoable, and nothing asked for it).
- **Mac:** Reports gets a Batches mode (list with active/ended, dates, counts; detail with Refresh, Show in Finder,
  End/Reopen/Remove and the rendered report). `ReportsNavigator` lifts the Reports mode out of view state, so ending a
  batch from the toolbar switches to Reports › Batches with it selected. Tips + tour step 15.
- **Verified live:** MICROSITE_TABBING → 29 cases, 24 passed, 2 failed, 3 undecided; B1 → 8 passed.

## D-190 — Get Ready lists this Mac's prerequisites: tools, the Claude Code plugin, MCP servers (2026-11-02)

- **Ask (demo feedback, F3):** Get Ready should show prerequisites — MCP servers, plugins, their status — for a smooth
  first install.
- **What:** `lib/prerequisites.js` asks `node/git/xcrun/python3/claude/ffmpeg --version`, `claude plugin list` and
  `claude mcp list` (run in the iOS project dir, where `networklens` is registered) and parses both outputs. Required:
  the tools except ffmpeg, the test-flow-recorder plugin, the qa-driver and networklens MCP servers; optional: ffmpeg,
  Atlassian MCP.
- **Two Get Ready rows:** "Tools on this Mac" (blocks everything) and "Claude Code plugin + MCP servers" (scope claude:
  blocks only Claude runs — replays never need them). Fix "Show what's missing" opens a sheet with every item, its state
  and the one command/step that fixes it (Copy). Nothing is installed for the person: plugin/MCP sign-in is theirs to do.
- **Cost:** `claude mcp list` health-checks every server (~6 s), so the result is cached 10 min, refreshed in the
  background (readiness never waits on it) and on "Check again".
- **Verified live:** 6 tools, plugin 0.1.0 enabled, qa-driver / networklens / Atlassian connected → both rows green.

## D-191 — Run all: a batch planned to run hands-free (2026-11-02)

- **Ask (F3):** batches still stopped for environment switches, logins, usage limits; ask once at the start, then run
  unattended.
- **Ordering:** `orderForFewerSwitches` runs replays first, the device's current environment first, then grouped by
  environment and session, then Claude runs. `POST /api/batch` always uses this order. MICROSITE_TABBING: 1 switch instead
  of one per PROD/UAT B alternation.
- **Plan first:** `POST /api/batch/plan` returns the order, replay/Claude counts, environment switches, logins and
  `stops` — anything that would make a person come back: Claude runs without unattended approval, `manual` steps (a
  10-min wait each), Claude usage ≥ 80 %. The Tests header's **Run all…** (cases the list shows) opens the plan sheet;
  Start runs it.
- **Not done:** credentials are not checked up front — logins use the simulator's saved password (iOS autofill), which
  the server can't see.

## D-192 — Claude section: a live activity line and steering replies (2026-11-02)

- **Ask (F3):** follow and steer the Claude CLI that drives a test inside the app, better than a terminal.
- **Activity strip:** above the transcript, "what Claude is doing now" in tester words from its newest tool call
  (Looking at the screen · Tapping · Working with network mocks · Reading code …), with step count, cost so far and model.
- **Steering:** while a run session is working, quick replies are "Take a screenshot and tell me what you see", "Use the
  case's recording if it has one", "Stop and tell me what's blocking you"; after it ends, the existing follow-ups.

## D-193 — Post a case's result to Jira; tickets come from the test case document (2026-11-03)

- **Ask (demo feedback, F4):** proof to Jira with an explanation; "derive the JIRA links from the test case document
  shared". Confluence publishing already exists (Reports › Session report → personal page 2437316839, D-176, confirm-gated).
- **Tickets:** `lib/jira-links.js` reads the loaded page: a row of a non-case table labelled Jira/Ticket/Story/Epic/Bug
  (`| **Jira** | [SEA-59531](…) |`, or the HTML equivalent) and any `/browse/KEY` link give the page's tickets; a case row
  naming a ticket (linked, or a bare key of a project the page already uses — "UTF-8" never counts) gives that case its
  own. A case posts to its own ticket, else the page's. Stored with the loaded document (`jira`), so a document loaded
  before this needs one reload.
- **Comment:** built server-side (`jiraComment`) from the case, its latest run (verdict, time, failed step), the build
  label (D-188), the active batch and its proof file names — plain words, no tool names. The person sees and can edit
  all of it.
- **Posting:** `POST /api/testcases/:id/jira {key, comment, confirmed: true}` — refused without `confirmed`. A headless
  `claude -p` (haiku) may call only ToolSearch and the two Atlassian add-comment tools, and must post the text verbatim.
  Each attempt is logged in `.data/jira-posts.json`; the sheet shows the last successful post. The Mac app asks once more
  ("Everyone watching the ticket sees it") before sending. Attachments are not uploaded (the connector has no upload).
- **Verified:** draft for case 24 built live; an unconfirmed POST is refused. No comment was posted — that needs the
  person's go-ahead.

## D-194 — Taps without an accessibility ID and system alerts replay from a Scan recording (2026-11-03)

- **Ask (F5):** "find alternative options to detect accurate taps when accessibility id is missing", and handle alerts.
- **Container fallback:** when the tapped element has no identifier, the Mac app (`TapFallbackLocator`) records its AX
  role → XCUIElement type, the nearest ancestor that has an identifier, and its index among same-type descendants of
  that ancestor. `lib/recorded-macro.js` saves it as the D-119 chain `[{identifier: container}, {type, index}]` (quality
  "container") with the label kept as a fallback, so copy or language changes no longer break it. Text-only remains the
  last resort and still warns.
- **Alerts:** a tap on a system-alert button (Allow, Don't Allow, Open, OK, Cancel …) is recorded as `alertTap {button,
  optional: true, timeout: 3}`, which searches the app and SpringBoard and is skipped when the alert doesn't show.
- **Not done:** coordinate taps (no driver kind; adding one needs build-for-testing) and listing an alert's buttons.

## D-195 — Scan step editor, a case's deeplinks + mocks, one loading style (2026-11-03)

- **Ask (F5):** edit a saved macro's steps; show the deeplink and mock JSON a case uses; one loading-indicator pass.
- **Step editor:** Scan › saved macro › *Edit steps…* lists the macro's own steps (`GET /api/macros/v2/:id/steps`, with
  `describeStep` text and the fields each may change). Drag to reorder, remove, change a tap/wait timeout, Skip if not
  there (optional), typed text, a pause, a screenshot name. `PUT …/steps {order, changes}` → `lib/step-edits.js`
  `applyStepEdits` (a step left out of `order` is removed; unknown ids / fields / values refused) → written in place at
  the macro's own path, listing-only `path`/`aliases` dropped, `editedAt` stamped. 409 while a test runs. Element
  references never change here — re-record for a different target.
- **Inputs panel:** under a recorded case, `GET /api/macros/v2/:id/inputs` (`lib/macro-inputs.js`) lists the
  flattened steps' `openDeeplink` URLs and `mock` steps, each with the armed variant's status and decoded body — from
  the simulator's NetworkLens session first, else the repo mock pack, else "not on this Mac". Copy, Download (.json) per
  mock, Download all (deeplinks + every body in one file).
- **Loading style:** `LoadingStateView` replaces every `ProgressView("…")` (19 places): spinner, words, and the elapsed
  seconds once a wait passes 4 s, so a slow step reads as working, not stuck.
- **Verified:** steps listed for `mc_E1OT41AYHE`; a PUT swapping two steps + timeout 7 wrote the file (no `path` /
  `aliases`), a bad id → 400, file restored from backup. Inputs for MT case 11: 1 deeplink, 2 mocked variants (HTTP 200,
  ~58 KB bodies from the device) + the cleanup "off". Mac sheets not clicked through by a person yet.

## D-196 — `/verify`: the TestForge as a developer's pre-PR check (2026-11-03)

- **Ask (F6):** pilot the dev face on one real ticket — a diff picks the affected cases, they replay, proof comes back.
- **One engine, two faces:** `POST /api/verify/plan {base?='develop', range?, includeLocal?=true}` runs git in the
  developer's own repo (`base...HEAD` + uncommitted + untracked, or an explicit `a..b` range), keeps app code only, and
  `lib/verify-plan.js` `affectedCases` picks loaded cases whose macro `coverageOf` (D-188 `covers`, else module folder)
  contains a changed file. Podfile.lock / Package.resolved → every recorded case. Read-only; returns `uncoveredFiles`.
- **Faces:** project skill `.claude/skills/verify` + `qaw verify [--base b] [--range a..b] [--no-local]` for Claude
  Code; Tests › *Verify my changes…* sheet in the Mac app, whose Replay hands the picked ids to the Run-all plan (D-191) —
  nothing starts until Start. The skill never builds (build for QA in the TestForge) or posts without a yes.
- **Pilot — IOS-47345/47348 (`dadb803de`, microsite anchor taps + sticky bar):** 17 app files → 24 MICROSITE_TABBING
  cases picked, 4 HomeScreen banner files uncovered (no Home case in the loaded doc). Replayed cases 4 and 28 via
  `qaw replay`: PASS + PASS (driver-level), proof in the active batch. The whole branch vs develop is a shared change
  (Package.resolved moved) → every case, which is right but blunt.
- **Not done:** posting the result to the PR; finer coverage than the module folder for macros without `covers`.

## D-197 — Device picker: simulators plus paired iPhones, the person chooses (2026-11-03)

- **Ask (F7):** "let the system detect and user choose what device/simulator he wants to run".
- **Simulators** were already detected and chosen (D-120 Use for tests, D-138 chooser); unchanged.
- **Real devices:** `GET /api/devices/physical` runs `xcrun devicectl list devices --json-output` (15 s cache,
  `?fresh=1` skips it); `lib/physical-devices.js` keeps physical hardware, connected first, with name, model, OS,
  connection (cable / network), Developer Mode, and `blockers` — what stops tests on it.
- **Mac:** Simulator › *Real devices* card: radio list of paired devices; choosing one shows its blockers. *Use for
  tests* stays disabled (`canRunTests: false`) because a run on hardware needs a device build of the app and the
  XCUITest runner signed for that device — the QA build is a simulator build, building for testing isn't run
  implicitly, and Apple Development signing is off-limits here. That is the next spike, not a picker change.
- **Verified:** two paired iPhones (16 on iOS 26.5, 13 Pro on iOS 18.6.2) listed, both "not connected" + the build
  blocker. Card built (build + lint clean), not clicked through.

## D-198 — Run notes don't make "Code prepared" warn; the warning names the file (2026-11-03)

- **Report:** Get Ready showed "Code prepared ⚠ … your working copy changed since (now 9ec4017+938c)" with no app
  change. Cause: Claude runs write `MICROSITE_TABBING-*-notes.md` next to the macros under `BlibliMobile_XCUITest/`;
  `BUILD_IGNORED_PATHS` only skipped the `*.json` there, so a note counted as an app input. The one real app edit
  (`MicrositeTabsBarView.swift`, 06:59:25) was 19 s older than the prepare and already in the build.
- **Fix:** `BlibliMobile_XCUITest/**/*.md` joins the default ignore list. `localDrift` now compares the candidate
  files (dirty now, dirty at prepare, committed since) with the prepared copy itself and returns `appFiles`, so
  changing the ignore list never reads as drift; it falls back to the D-083 build-input id when the copy is gone or
  the manifest's changed-file list was capped. The warning reads "app code changed since: <file> +N more".
- **One-time cost:** the build-input id formula changed, so the first prepare after this may call the existing QA
  build stale once even with no app change; rebuild or use it as is.
- **Verified:** live on this Mac `hasAppInputsChanged: false, appFiles: []` for the current snapshot; test added.

## D-199 — Browser UI removed; its last features move into the Mac app (2026-11-03)

- **Ask:** "Port all three, then remove the browser UI" — after the audit found Prepare code, test logins (+ Outlook
  OTP) and the run queue only in the browser, and three Get Ready fixes (`code`, `queue`, `claude-howto`) still
  opened it.
- **Found while porting:** the popups a run raises for a person (`/api/prompts` — tap a system popup by hand, type a
  production OTP) were also browser-only. A Mac-only person would have seen a run wait 10 min with no sign but a
  macOS banner. Ported too, as a sheet over the main window whichever section is showing; the server now publishes
  them as a `prompts` state slice (re-read on every PromptHub change), so no polling.
- **Mac:** Get Ready gets **Prepare code…** and **Run queue…** buttons above the checks (always reachable, not only as a
  fix) and sheets for both; Prepare code follows the job's log stream like Build does. **Settings › Logins** holds
  test logins (Keychain, secrets only sent) and the Outlook link. Fix routes: `code` → Prepare code, `queue` → Run
  queue, `claude-howto` → Prerequisites; `openWebUI` is gone.
- **Removed:** `public/` (3.5k lines), `QA Dashboard.app`, `Launcher.applescript`, the static + `/vendor` serving,
  `start.sh`'s browser open and `QA_DASHBOARD_NO_OPEN`, and the `marked` / `dompurify` dependencies. Saved setups
  and the Projects tab had no Mac UI and are dropped as UI; `/api/setups` and `/api/projects` stay for scripts.
  Kept: every HTTP route (`qaw`, the skills and the Mac app use them).
- **Not ported:** queueing a free-form Claude task from the Queue tab — the Claude section starts sessions instead.

## D-200 — Git control for the developer's own working repo (2026-11-03)

- **Ask:** "add robust git control in the app. mainly for fetch, branch switch, branch selection." The user chose
  **both**: the QA copy stays as it is (Prepare code), and a new Git sheet works on the developer's own checkout.
- **Where:** Get Ready › **Git…** (beside Prepare code and Run queue). Repo picker (project scan), status card (branch,
  upstream ahead/behind, uncommitted count + files, last fetch, half-done merge/rebase), **Fetch**, **Update branch**,
  **Restore stash**, and a searchable branch list with **Switch** per row.
- **Server:** `lib/git-control.js`, routes `GET /api/git/status`, `POST /api/git/{fetch,fast-forward,switch,restore-stash}`
  in `routes/code.js`. Only repos the project scan found; refused while a prepare runs (a working-copy snapshot reads
  the repo).
- **Guards — why "robust":** no force, no reset, no discard anywhere. Fetch writes only remote-tracking refs.
  Update is `merge --ff-only @{u}`, refused when the branch has local commits GitHub doesn't. Switch is refused while
  work is uncommitted unless the person picks **Stash and switch** (`stash push --include-untracked`, message names
  the switch); Restore stash pops only a stash the app made, and a conflict keeps it. A half-done merge/rebase/
  cherry-pick/revert blocks every write. A GitHub-only branch becomes a local tracking branch (`switch --track`).
- **TestForge guard:** the server runs from this repo's `tools/qa-dashboard/`. A branch that doesn't carry it (e.g.
  `develop`) would delete the running server's files under it, so switch is refused for such a branch with "use
  Prepare code to test that branch instead". That's the right tool anyway: builds come from the QA copy.
- **Branch list:** `/api/code/branches` entries gain `isLocal`, so a row says when switching creates a local branch.

## D-201 — Replay a Test Batch on a new build (2026-11-03)

- **Ask:** "how a passed test batch can run on a new build for regression test" + "Add a batch replay feature". User
  chose: replay **every recorded case** of the batch, passed or not.
- **Before this:** a new build already marks cases stale (D-188) and Tests › Replay stale replays them, and a run
  bundle (D-162) replays one exported run. Neither replays a whole Test Batch or compares it with the batch.
- **Now:** Reports › Batches › **Replay on this build** (ended batches with results). `POST /api/test-batches/:id/replay`
  takes the batch's decided cases (latest result each, `batchCases`), keeps those with a v2 recording, ends an active
  batch (with its report), starts a new Test Batch "<name> · replay on <branch> @ <code id>" with
  `replayOf {id, name, caseIds, build}`, and launches a driver-only run (`noClaude`: a failure is the verdict, never a
  Claude triage — same rule as bundles). Cases without a recording are listed back as `skipped`.
- **Comparison:** `compareBatches` per replayed case: regressed (passed → not), fixed (not → passed), same, missing (no
  result yet). On every `/api/test-batches` summary as `comparison`; the Batches header shows the counts (orange when
  anything regressed); the report gets a "Compared with …" table.

## D-202 — Busy banner never covers the explain cards; MT deeplink cases drop the alert step (2026-11-03)

**Context:** During an explained replay, the setup busy banner ("getting the app ready…") was overlaid at 14 % from the top,
on the same band as the intro card's title and over the centered result card. Separately, MT-015 failed with "no answer
within 22 s" on "Tap Open on the alert (if shown)": the "Open in Blibli?" prompt only appears for links opened from outside
the app, and in every earlier MT run the step found no alert. The no-answer was the runner waiting on a busy app right
after the deeplink, the alert step just being the first to ask.

**Decision:** On a card the banner gets its own row under the card (same card background), so it can never overlap what is
checked or the verdict. On a caption it sits on the opposite edge from the subtitle. The 22 MT macros that followed
`openDeeplink` with an optional `alertTap "Open"` lose that step; the next step already waits up to 30 s for the tab bar.

## D-203 — Deeplinks: one "Find a screen" search instead of a filter field + dropdown (2026-11-03)

**Context:** Simulator › Deeplinks had a text field ("cart, search, order…") that only narrowed the hidden route dropdown
beside it, then a link field. Both looked like places to type a link; the user couldn't tell what the first one did.

**Decision:** One search field, "Find an app screen to build its link". Matches (up to 8, with "N more — keep typing")
list right under it; clicking one selects that route, clears the search and builds the link from its template. The picked
screen then shows as "Screen: X" with Change screen (clears the screen and its link). The link field's prompt reads
"…or type a link yourself", so typing a raw link stays the other path. View-model owns the match list and footnote.

## D-204 — Deeplinks: query parameters for built and typed links (2026-11-03)

**Decision:** Under the link field, **Add query parameter** adds name = value rows. They apply to whatever the link field
holds, built from a screen or typed. The rows are appended as text (not via URLComponents) so `blibli://` links keep their
exact shape: names and values are percent-encoded (`& = + # ?` included), an existing `?query` is extended with `&`, a
`#fragment` stays last, and rows without a name are skipped. When rows change the link, the full link shows under them;
Open in app, Save and the route match all use that full link. Rows stay when the screen is changed.

## D-205 — Min-version query presets and spelled-out route slots (2026-11-03)

**Finding:** the iOS app never reads a min-version parameter from an incoming link. The only place the code spells them is
`Activation/Enticement/BlibliBonus/BlibliBonusManager.swift`, in a hard-coded web fallback:
`/promosi/zona-cuan?appsWebview=true&androidMinVersion=11.0.0&iosminversion=1140`. So the casing is mixed —
`androidMinVersion` (camelCase) and `iosminversion` (all lowercase) — and the formats differ: Android dotted (`11.0.0`),
iOS digits without dots (`1140` = 11.4.0). The reader is the web page (outside this repo), so whether it ignores case
can't be checked here; the presets use the exact spelling the code uses.

**Decision:** each query row gets a key menu with both keys, spelled as above. A row whose name matches one (any case)
gets a version menu: next major, next minor, this build, older minor, and four older majors, written in that key's
format (`1500 (15.0.0)` for iOS). `/api/deeplinks` returns the installed QA build's `appVersion` to seed it; 15.0.0 when
nothing is built. Route slot fields now carry a label and a prompt: `{rest}` (a route's trailing `(.*)`) reads
"More path (optional) — added after blibli://login, e.g. /detail. Leave empty to open blibli://login as is", and points
query parameters to the rows below.


## D-206 — System prep messages stay in the TestForge (2026-11-03)

**Decision:** a replay with explanations no longer shows the spinner banner (runner start, getting to the start screen,
preconditions, loading) over the Simulator. That information is for the person running the TestForge, not for the
stakeholders watching the explanation. Over the Simulator they now see only the intro card, the subtitles and pointers,
and the result card; during a setup routine's steps the overlay shows nothing. In the Mac app, the Tests pane's live
steps get a **System prep** section under the run header: the current message with a spinner and a running timer
(`run.busy.since`), and the earlier messages of that run with a check. The server sends only the current message, so the
Mac app keeps the earlier ones for the run on show (last 6; they are not kept across an app restart). A plain replay
(no explanations) keeps its banner over the Simulator, since nobody else is watching it.

## D-207 — Explained replay subtitles placed per step, with a tail (2026-11-03)

**Decision:** the subtitle no longer sits at a fixed top or bottom spot. `ExplainCaptionPlacer` works its place out per
step from where the focused element is: it measures the text, then tries below and above the element (the side with more
room first), then beside it on the wider side with the box narrowed to the room there (not when that room is under 38 %
of the screen width). The first spot that fits inside the screen, clear of the status bar, the home indicator, the
element's outline and its "As expected" badge, wins. If none fits (the element fills the screen), the box sits at the top
or bottom, whichever covers less of it, and has no tail. With no element it sits at the bottom. The box is a rounded
rectangle with a small tail on the side facing the element, drawn as one outline with a border in the pointer's color;
the dashed connector line runs from the tail's tip to the nearest point of the element. The box glides between spots
(0.25 s). Placement is computed in the mapper, not the view, so the view only draws. Checked with a harness over 8
layouts (top bar, bottom tab, middle, tall left/right columns, badge above, full screen, no element): all on screen, no
overlap except the full-screen case.

## D-208 — Step overlay panel joins every Space (2026-11-03)

**Problem:** with the TestForge and the Simulator side by side in Split View, macOS kept switching to another desktop.
**Cause:** the step/explain overlay is an `NSPanel` ordered above the Simulator window on every refresh. Its collection
behavior (`fullScreenAuxiliary, ignoresCycle`) tied it to the Space it was first shown on, so once the Simulator moved to
a Split View Space, each order call made macOS switch back to the panel's Space. **Decision:** add `.canJoinAllSpaces`.
The panel is still only shown while the Simulator window is on screen (`kCGWindowIsOnscreen`), so it never shows over
another Space's windows. Other things that can bring the Simulator forward are user actions only (Show Simulator, Boot QA
simulator, a notification click), plus the test runner starting, which is macOS/Xcode behavior.

## D-209 — Hide the test list; the window shrinks with hidden panes (2026-11-03)

**Problem:** in Split View beside the Simulator, the TestForge could not be made narrower than 1240 pt, so the Simulator
could not be widened. **Decision:** Tests gets a **Test list** toolbar toggle (⌥⌘L) next to Live steps that hides the
case list column; the selected case stays in the detail column. The main window's minimum width is no longer fixed: it
starts at 1240 and gives back each hidden pane's minimum — sidebar 2 × 180 (it counts twice on macOS 26), test list 240,
live steps 220 — down to 480 with all three hidden (`TestForgePanes.windowMinWidth`). The tour reopens the list and
live steps before pointing at them. The list's shown/hidden state is not remembered across launches, like Live steps.

## D-210 — Window minimum from the Tests panes only; narrow list header (2026-11-04)

**Problem:** after D-209 the TestForge still stopped at exactly 1240 pt in Split View (user screenshot, window bounds
1240 wide), and the narrow list header wrapped "Run all…" / "Verify my changes…" letter by letter. **Cause:** hiding the
sidebar with its toolbar button never updates `NavigationSplitView`'s `columnVisibility` binding (a probe app: after
`toggleSidebar` the binding still read `.all`), so `TestForgePanes` kept counting the sidebar and never went below 1240 − 0.
**Decision:** drop the sidebar from the formula. The minimum is 880 with the list and live steps shown, minus 240 / 220
for each one hidden, floor 480; while the sidebar is shown the split view keeps its width itself. The list header keeps
the title block on top and puts the buttons on their own row in a `ViewThatFits`: titles with icons when they fit,
icons only (with their help text and accessibility labels) when not.

## D-211 — Onboarding is part of every feature's definition of done (2026-11-04)

**Problem:** screen tips and the guided tour were updated with each feature, but the welcome screen's role flows
(`OnboardingCatalog+Roles.swift`) stopped at D-196: Git sheet, batch replay, Deeplinks search/query parameters and Split
View were missing, and QA step 13 still described the Simulator banner that D-206 took off explained replays.
**Decision:** catch the flows up (QA steps 13, 18–21; developer steps 4, 13–14) and write the rule down where every
session reads it: a "Feature checklist — Mac app" table in `BlibliMobile-iOS/CLAUDE.md` (tip + tour, onboarding flows,
`tutorials.md` revision), so onboarding no longer depends on memory alone.

## D-212 — Test Batches can be paused (2026-11-04)

**Problem:** a Test Batch was either active or ended. Switching to urgent work meant ending the batch (report written,
half done) or leaving it active so unrelated runs and proof landed in it. Reopen and Replay on this build also ended the
active batch. **Decision:** add `paused`. A paused batch keeps its items, folder and progress, collects nothing (no
attach, proof goes to the root), and is resumed later; any number can be paused, one is active. Every switch — Start
another, Resume, Reopen, Replay on this build — pauses the active batch instead of ending it; only **End** ends one, and
a paused batch can be ended directly. A paused batch can't be removed (end it first) and pausing/resuming is refused
while a test or a multi-case run is going, so no run splits its proof across two batches. Pause asks no confirmation:
it is undone by Resume. Each pause is kept in `pauses` and the report shows how often the batch was paused.

## D-213 — Every action shows feedback at the control that started it (2026-11-04)

**Problem:** Build › Clean › Delete… disabled every button and showed nothing else; its progress line was in the status
strip at the top of the scrolled-away form, and Reset's sizes stayed stale after the delete. An audit found 66 such
gaps across the app: busy state shown only by disabling, result lines far from the control (Simulator cards), errors
swallowed with `try?` (Run all start, branch list, cancel prepare, Outlook poll, demo Stop, flow-map save, lint), a
second tap cancelling the first request, and Claude › Send clearing the draft before the send succeeded.
**Decision:** the rule is "progress at the clicked control, failure next to it, and what it changed refreshes". Each
screen's shared `perform` records which action is running (an enum or per-row id) and ignores re-entry; buttons render
it with `ActionProgressLabel` / `BusyActionLabel`; sheets stay open while saving and close on success. Menu items can't
show a spinner, so their menu's label or the toolbar pill shows the "…ing" text instead, and menu-bar failures post a
notice. Real-device "Use for tests" had an empty action; it is disabled with the reason (D-197: no device-signed build).
The rule joins the Mac feature checklist in `BlibliMobile-iOS/CLAUDE.md`.

## D-214 — Clean merged into Reset; runner screenshots deleted after every run (2026-11-04)

**Problem:** Build had two lists that overlapped (QA build output, Xcode DerivedData and the Swift package cache were in
both): Clean with a Delete… per row, and Reset with switches and one Reset button — so a single Reset row couldn't be
deleted on its own without unticking the rest. The test runner's own screenshots had grown to 17.45 GB although D-106
limited them to while steps run. **User decisions:** merge into one list (recommended) and delete the runner screenshots
after each run (recommended). **Decision:** one "Free space and reset" list; each row has its size, a switch for
**Reset selected** and its own **Delete…** (confirm, then "Deleting…" on that row); Swift package settings moves over
from Clean. The runner screenshots (XCTest Attachments on the QA simulator) are never read — proof is the testforge's
own captures in the Test Batch folder — so the server empties them 5 s after a test finishes, only when no test,
multi-case run or scan is going (else it retries every 60 s); the runner is not stopped for this, only files go and
the folders stay. The Reset row stays for leftovers.

## D-215 — Project renamed to TestForge (2026-11-05)

**Problem:** the project is moving to its own repo named TestForge; the previous name appeared in ~370 files. **User
decisions:** `testforge` / `TESTFORGE` for lowercase and env forms, replace the name in history docs too, move local
state over and delete everything under the previous name. **Decision:** the Swift target and types
(`TestForgeConstants`), paths (`tools/testforge-mac`), routes (`/api/sessions/testforge`), env `TESTFORGE_*`, bundle id
`com.blibli.testforge`, state folder `~/.testforge`, Keychain services `testforge.login.<env>` / `testforge.graph`,
skill `testforge-remote` and plugin hooks `testforge-guard` / `testforge-session` all use the new name. Local state was
copied across once (paths inside `state.json` and `builds.json` rewritten) and the old folder, defaults, Application
Support and app bundle were deleted. The local code-signing certificate keeps its original keychain label; its hash in
`~/.testforge/sign-identity` is what `make-app.sh` uses, so the Accessibility grant survives. Plugin repo hooks were
renamed the same way and need a reinstall (marketplace update + uninstall/install).

## D-216 — Plugin renamed qa-flow-recorder to test-flow-recorder (2026-11-05)

**Problem:** the plugin now ships from the TestForge repo (`gdncomm/blibli-testforge`, marketplace `testforge`) and its
old name no longer matched the product. **User decision:** rename it `test-flow-recorder`. **Decision:** plugin and skill
names, skill folder (`plugin/skills/test-flow-recorder`), install id `test-flow-recorder@testforge`, MCP tool prefix
`mcp__plugin_test-flow-recorder_qa-driver__*` (permission regex in `lib/permissions.js`), prerequisite check names, and
the per-repo state folder `.claude/test-flow-recorder/` all use the new name. The `qa-driver` MCP server and the
`/qa-*` commands keep their names. `lib/plugin-paths.js` now looks for the scripts in a `blibli-testforge` clone under
`~/Projects` or in the installed plugin cache. The old local clone and marketplace `qa-flow-recorder-local` are
retired: uninstall the old plugin, add the `testforge` marketplace, install the new one.

## D-217 — Update TestForge from the app (2026-11-06)

**Problem:** the checkout the app runs from only changed when someone ran git and `make-app.sh` by hand, so people
stayed on old builds. **User decision:** add an Update option inside the app. **Decision:** `Update/` holds
`GitAppUpdateService` (`git fetch origin master`, `git pull --ff-only origin master`, `mac-app/scripts/make-app.sh`),
`UpdateViewModel` and the Settings › Project › Updates section. A quiet check runs when the server starts, and the
TestForge menu item reads "Update TestForge… (n new)" when one is waiting; it opens Settings on Project and checks.
Updating is allowed only on `master` with a clean tree and a fast-forward; any other state shows why and changes nothing.
SSH runs with `BatchMode=yes` so a hidden passphrase prompt cannot hang the app. After a good build the app reopens the
rebuilt bundle (`SetupSystem.relaunch(at:)`); if the pull works but the build fails, this copy keeps running and the
last lines of the build log show under the button. Not done: updating from a release download (no signed releases yet),
and blocking an update while a test run is in progress.

## D-218 — Docs section and in-app Markdown viewer (2026-11-06)

**Problem:** the usage guide and feature list (`docs/Usage-guide.md`, `docs/Features.md`) and the other repo docs could
only be read in an editor or on GitHub, and test plans or specs people receive as Markdown had nowhere to open in the
app. **User decision:** a full docs browser where anyone can drop files and read them, and a Docs section that lists
the app's usage and feature docs and shows them in place, with half and full screen options. **Decision:** a Docs
sidebar section (⌘D, last in the list) built on the D-176 viewer. Its list has three groups: **TestForge guides**
(the two guides, first), **Project docs** (top-level READMEs, `CONTRIBUTING.md`, `CHANGELOG.md`, and every `.md`
directly in `docs/` and `server/docs/`), read from the checkout at runtime so an Update brings new docs, and **Your
files** (dropped or opened, kept as paths in the app's defaults, newest first, 30 at most, missing files dropped).
Drop files or folders anywhere on the section or the window; a folder adds its Markdown up to 3 levels and 200 files;
anything else is refused with a reason. "Half" shows the list beside the page; "Full" hides the docs list, the app
sidebar and the console while Docs is on screen and puts them back on leaving or switching to Half
(`DocsFullLayout`). A separate **Docs** window shows the same page and can be put on the left or right half of its
screen or into macOS full screen (`DocsWindowArranger`, found by its scene id). Links: `#anchor` scrolls to the
heading (GitHub-style slugs, repeats get `-1`); a relative `.md` link opens in place at its anchor, with Back;
another local file opens in its app; a web link opens in the browser. The parser gains nested and task lists,
item continuation lines, dropped HTML comments and relative image paths; `bulletList`/`orderedList` became one
`list` case. Not done: search inside a page, rendering inline HTML, editing, watching files for changes (Reload
re-reads), and bundling the guides into the app for an install without a checkout.

## D-219 — Docs list shows only the README and the two guides (2026-11-06)

**Problem:** the D-218 **Project docs** group listed every `.md` in `docs/` and `server/docs/` (design notes,
decision log, old walkthroughs), a long list most readers do not need, with out-of-date docs next to current ones.
**User decision:** list only `README.md`, the feature list and the usage guide by default. **Decision:** the
**Project docs** group is removed; **TestForge guides** lists `README.md`, `docs/Usage-guide.md` and
`docs/Features.md`, in that order, and **Your files** is unchanged. Other repo docs are still reachable: a link in a
listed doc opens them in place, and they can be dropped or opened like any file.

## D-220 — Free replays are marked, gated, and confirm a Claude pass (2026-11-07)

**Problem:** a batch whose cases had passed still sent some of them to Claude, and when the Claude usage limit was
reached it stalled. A case that Claude passed was saved as a recording in a second Claude turn; when that turn
failed (the usage limit, or Claude not saving), the case still showed PASS but had no recording, so every later run
of it went to Claude. The usage limit was handled only for a case's own run, not for the save or the triage after
it. Re-run failed reused each case's first plan, so a case recorded since still went to Claude. The Tests list
showed only "has a recording", not whether that recording could actually run without Claude. **User decision:**
mark every case as a free replay or Claude-driven with AI icons; a case counts as passed only when a replay confirms
it and it is saved as a macro; offer Replay only when it can run without Claude; merge Replay and Explain into one
button (click replays, press and hold for the rest); keep triage. **Decision:** the server gives each case a replay
status in the `testcases` slice (`lib/replay-status.js`): `free` (a recording whose last replay passed),
`unconfirmed` (recorded, no passing replay yet or the last one failed), `broken` (a routine or element the recording
uses is missing, read from the files without running anything; `/api/macros` lists it as `replayProblem`), and
`claude` (no recording). The Mac app shows them as ⚡ green, ⚡ orange with a clock, ⚠ red and ✨ purple (sparkles,
Apple's AI symbol, only where Claude is involved), adds Free replay / Needs Claude filters and header counts, and
enables Replay only for `free` and `unconfirmed`; the server refuses a replay of a `broken` recording (409) too. A
Claude run's PASS is shown as `UNCONFIRMED` (with `claudeVerdict` kept) until a replay of the case's recording
passes later; in a batch, a failed save or a failed proving replay sets the item's verdict to `UNCONFIRMED`. A single
Run with Claude now confirms itself like a batch: a pass replays the case's recording, or saves one and replays it.
Saving and triage turns are no longer counted as the case's last run. A usage limit during saving or triage keeps
the result and pauses the batch. Re-run failed plans each case again. Case ids match recordings without regard to
case, as a batch already did. **Not done:** a "replays only" batch option, and a button to save a recording for an
UNCONFIRMED case without running it with Claude again.
