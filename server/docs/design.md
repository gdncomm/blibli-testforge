# TestForge server — Design

Source of truth for how the dashboard is built. Usage lives in `../README.md`; why things are the
way they are lives in `decision.md`.

> **v4 (D-075):** the UI is being redesigned as a native SwiftUI Mac app over this server, fed by one state stream that replaces all polling. Target architecture: `redesign-plan.md`. This file describes the current web build.

## Goal

**The TestForge**: one local page that is the GUI for working *with Claude* — talk to live
Claude sessions both ways (messages, approvals, Claude's questions), queue tasks and watch each one,
open Claude in any local project, track progress — with **TestForgeDriver at the core**: a status panel for
the QA simulator and a device lock that serialises everything that drives it. The original control panel (live NetworkLens mocks,
traffic, every TestForgeDriver command, harness build/start, Confluence test cases) is still there.

## Principles

1. **Client, not a new transport.** The app and the XCUITest runner already poll command queues.
   The dashboard talks to those; it never adds an app-side seam.
2. **Reuse, don't reimplement.** NetworkLens session/variant/trace logic is copied verbatim from
   `tools/networklens-mcp/dist`. Harness lifecycle and macro storage are delegated to test-flow-recorder's
   own `harness.py` / `macro_cli.py`.
3. **Live first, file second.** Every mock edit tries the running app; only if it is unreachable
   does it write `session.json`, and the UI says which happened.
4. **No build step.** Plain HTML/JS/CSS (ES modules). Dependencies: `express`, the Claude Agent SDK
   (server), `marked` + `DOMPurify` (served from `node_modules` for chat markdown).
6. **Claude for anything that needs the user's plugins / MCP / connectors** (D-022): sessions,
   ▶ Run, Confluence load. Local control (mocks, driver, harness) stays direct.
5. **Localhost only.** Binds `127.0.0.1`. Secrets live in a gitignored `.env.local`.

## Topology

```
Browser ──HTTP/SSE──▶ server.js (:4545)
                         │
     ┌───────────────────┼──────────────────────────┬────────────────────────────┐
     │ data plane        │ screen plane             │ test cases                 │
     │                   │                          │                            │
 lib/control.js      lib/driver-queue.js       lib/testcases.js             lib/jobs.js (SSE)
 lib/control-queue.js lib/harness.js ──▶ harness.py   lib/macro.js ──▶ macro_cli.py  lib/history.js
 lib/session.js      (POST :8789/command)       Confluence REST v2           spawn `claude -p`
 lib/trace.js                                                                spawn `xcodebuild`
     │                   │
 hosts :8788 ◀── app polls (NetworkLens ControlOptions)
 reads session.json / trace.ndjson in the app's simulator container
                         └── TestForgeDriverRunner (XCUITest) polls :8789
```

### Ports

| Port | Owner | Polled by |
|---|---|---|
| 4545 | dashboard (HTTP + SSE) | browser |
| 8788 | dashboard (`lib/control-queue.js`, lazily bound on first status/edit) | the app — `ControlOptions()` in `NetworkLensBootstrap.swift` |
| 8789 | TestForgeDriver queue — **the dashboard** (`lib/driver-host.js`, bound at start, D-040); a test-forge-driver MCP that started first keeps it and the dashboard re-binds within 2 s after it exits | `TestForgeDriverRunner` in the XCUITest process |

Two channels, two ports: `contracts/commands.md` requires it — draining is destructive, so a shared
queue would let each channel steal the other's commands.

## Data plane — mocking

- **Status** — `GET /api/status`: `appRunning` (`simctl spawn booted launchctl list`),
  `controlQueueUp` (queue `/health`), mocking flag and rule count from `session.json`.
- **Edit** — `applyEdit(edit, fallbackWrite)` in `server.js`:
  1. `liveEdit(edit)` → queue a `{kind:"edit", ...edit}` command, wait ≤6 s for the app's result.
  2. On success: return `LIVE_NOTE`; do **not** write the file (the app autosaves it).
  3. Otherwise: if the app is running, refuse (its autosave would clobber the write); else write
     `session.json` atomically and return `RELAUNCH_NOTE`.
- **Edit shapes** — `{isMockingEnabled}`, `{rules:[rule]}`, `{removeEndpointKeys:[key]}`, identical to
  the `networklens` MCP server's.
- **Quick mock** — `standardSet(body)` yields `loaded / empty / 500 / slow / timeout`; identity is
  `endpointKey + match` (`sameRule`), so re-arming reuses the rule id and enabled state.
- **Endpoint keys** — `lib/endpoint.js` templates numeric / UUID / ≥16-hex segments to `{id}`,
  mirroring the app's `PathMatcher`; a pasted URL's query string becomes `match.query`.
- **Traffic** — `trace.ndjson` in the app container, parsed and collapsed by exchange id, cached on
  mtime+size.

## Screen plane — TestForgeDriver

- `POST /api/driver/command {kind, ...args}` → `postCommand` → enqueue on `:8789`, poll `/result`.
  On a *client-side* timeout only, run `harness.py ensure` once and retry (port of `queue_cli.py`).
- The UI's `DRIVER_COMMANDS` table is the single list of kinds and their fields; it mirrors
  `contracts/commands.md`. Zero-field commands run on click; `relaunchApp` asks to confirm.
- Harness: `status / ensure / stop / logs` shell out to `harness.py`. **Build test bundle** runs
  `xcodebuild build-for-testing` for `TEST_FORGE_SCHEME` / `TEST_FORGE_CONFIGURATION` on the booted simulator,
  streamed (filtered to errors/results) through a job.
- Evidence images are served by `GET /api/media?path=` (absolute path, media extensions only, no `..`).

## Test cases

- **Load** — `POST /api/testcases/load {path}`:
  - `https://…/pages/<id>/…` → Confluence REST v2 `pages/<id>?body-format=storage` with
    `CONFLUENCE_EMAIL` / `CONFLUENCE_TOKEN` (Basic auth, origin taken from the URL).
  - local `.html` / storage XHTML → `parseTestCaseHtml`; local markdown → `parseTestCaseTable`.
  - HTML: every `<table>` is scored by how many header cells map to a canonical field; the best one
    wins (skips revision/metadata tables).
  - Canonical fields: `id, scenario, precondition, steps, expected, api, evidence, iosStatus,
    androidStatus`; unknown columns become `colN`.
  - Verified against the real "Sub Flashsale & Special Placement" page: 96 cases, all 9 columns mapped.
- **Load from Confluence URL** (D-022) — without `CONFLUENCE_EMAIL`/`CONFLUENCE_TOKEN`,
  `POST /api/testcases/load` answers `202 {jobId, viaClaude}` and starts a `load` job:
  `claude -p` (model `TEST_FORGE_LOADER_MODEL`, default haiku, cwd = dashboard dir) loads
  the Atlassian plugin's `getConfluenceContent` via ToolSearch and calls it once (cloudId = URL host,
  `content_id`, markdown, detail full); Rovo `getConfluencePage` only as fallback (D-080). Allowlist
  `ToolSearch` + both read tools; Confluence write/comment/execute tools disallowed; never
  `--dangerously-skip-permissions`. The body is read from the raw `tool_result` in the stream and
  parsed by `parseConfluencePage` (plugin `{data:{body:{value}}}` or Rovo `{content:{nodes}}`) → `parseTestCaseTable` (best-scoring markdown table). Job end verdict =
  case count or the error. The UI follows the job (status line = latest step + elapsed, transcript
  in Run output), then `GET /api/testcases` (`{cases, title, source}`). One load at a time (409).
  With credentials set, the old REST v2 storage-format path answers synchronously.
- **▶ Run** — spawns `claude -p "/test-forge-run <source> [techDoc] — run only case <id>: <scenario>"` in
  `TEST_FORGE_PROJECT_DIR` with `--output-format stream-json --verbose` and stdin ignored; adds
  `--dangerously-skip-permissions` when `TEST_FORGE_ALLOW_AUTONOMOUS_CLAUDE=1`.
  - `lib/claude-stream.js` buffers stdout into whole lines (`lineSplitter`) and turns each event into
    console lines (`formatEvent`): `● session started · model · permissions · n/m MCP connected`
    (failed servers as `!`), assistant text verbatim, `→ <tool> <key arg>` per tool call,
    `  ← / ✗ <first 160 chars>` per tool result, `↳` indent for subagent events, `■ finished ·
    turns · duration · $cost`, and a `!` line listing permission denials. Thinking, hooks and
    allowed rate-limit events are dropped; non-JSON lines and stderr pass through raw.
  - Verdict = last `PASS|FAIL|EVIDENCE_ONLY|UNDECIDED|BLOCKED` token in the `result` event's final
    text, falling back to the last 40 console lines. `is_error` in `result` makes the job `error`.
  - History entries also store `turns`, `durationMs`, `costUsd`; the UI progress line shows the
    latest `→` tool call as the current step.
- **⚡ Replay** — `macro_cli.py resolve <name> --search-root <TEST_FORGE_UITEST_ROOT>` → steps posted one by
  one; stops at the first step whose outcome has `error` or `found/exists/hittable === false`.
  Unresolvable macro → `BLOCKED (macro not resolved)`.
- **Run selected** — sequential (one shared XCUITest session).
- **History** — `.data/runs.json`, newest first, capped at 500.

## TestForge v2 — sessions, queue, projects, device (D-023…D-030)

```
public/js/live.js ──SSE /api/state/stream──▶ routes/state.js ─▶ lib/state-hub.js   (every live slice, D-077)
public/js/sessions.js ─SSE /api/sessions/:id/stream──▶ routes/sessions.js ─▶ lib/sessions.js ─▶ lib/claude-session.js
                         POST messages / answer / interrupt / close                       (Agent SDK query(), streaming input)
public/js/queue.js ──▶ lib/task-queue.js (device lane: 1 · general lane: TEST_FORGE_GENERAL_CONCURRENCY)
public/js/projects.js ─▶ routes/projects.js ─▶ lib/projects.js
public/js/device.js ─▶ routes/device.js ─▶ lib/device.js (simctl screenshot, single-flight) · lib/device-lock.js
public/js/home.js  — overview + desktop notifications, from the same live state
```

### Sessions (`lib/claude-session.js`)

- Agent SDK `query()` over the user's installed `claude` (`pathToClaudeCodeExecutable`), with
  `settingSources: user, project, local` — plugins (test-forge-driver), the project `networklens` MCP, project `.claude/` and
  claude.ai connectors all load. Input is an async queue, so messages can be sent mid-turn.
- A session created with `options.env` (every `test-forge-run`, from `testForgeSessionEnv()`: QA simulator + QA
  build) gets it as the process env and as flag `settings.env`, which outrank the developer's
  settings files (D-068).
- States: `idle → running → waiting-approval | waiting-answer | waiting-device → idle`, plus
  `closed` / `error`. Process ends → `idle`; the next message restarts it with `resume: <claude
  session id>` (verified across a dashboard restart).
- `canUseTool`: hard deny (Confluence write tools on page 2396520535) → `AskUserQuestion` becomes a
  `question` event, answered as `updatedInput.answers` → pre-allowed tools (read-only, TestForgeDriver,
  Atlassian reads) and per-project "Always allow" (`.data/permissions.json`) run → anything
  else is an `approval` event the UI answers.
- `PreToolUse` hook (fires even for tools the user's settings allow): repeats the hard deny, and for
  TestForgeDriver tools acquires the device lock first (`waiting-device` while another owner holds it).
- Transcript: every event (SDK message, clipped tool results ≤ 6 kB, plus `type: "dashboard"` events
  — user, approval, question, *-resolved, status, hard-deny, error) gets a `seq` and goes to memory
  (last 4000) and `.data/sessions/<id>.ndjson`. `GET /api/sessions/:id/stream?after=seq` replays then
  streams. Index in `.data/sessions.json`.
- Screen attachments: `attachScreenshot: true` on create / message adds the current simulator frame
  as an image block.

### Queue (`lib/task-queue.js`)

- Kinds: `test-forge-run` (device; a session whose first turn is `/test-forge-run …`, so you can chat with the run),
  `replay` (device; macro, no Claude), `claude` (general; free-form prompt in any project).
- Device lane = 1 running task; general lane ≤ `TEST_FORGE_GENERAL_CONCURRENCY` (default 3). Queued tasks can
  be moved, cancelled; finished ones retried. Persisted to `.data/tasks.json`; a task running when the
  server stopped becomes `failed (interrupted)`.
- Test Cases ▶ Run / ⚡ Replay keep their job contract (`{jobId}` + line SSE): the job is created at
  enqueue time and the session's events are mirrored into it as console lines.
- `lib/device-lock.js`: FIFO, re-entrant per owner. Owners: a session id (test-forge-run, or a chat calling
  TestForgeDriver), a replay task id, or `driver-console` (`tryAcquire` — a click returns 409 "device busy"
  instead of waiting).

### Projects

`lib/projects.js` scans `TEST_FORGE_PROJECT_ROOTS` (default `~/Projects`) at `*/.git` and `*/*/.git`;
workspaces = repo root + children with `CLAUDE.md` / `.claude`. Each row: branch, dirty flag,
**Session** (opens the new-session form in the iOS workspace when present), **Terminal**, **Finder**.
Jira and PR views were removed (D-030).

### Device rail

"QA simulator" status panel (P1, D-033 — the mirror is gone). `GET /api/device` returns the booted
simulator, the device lock and the driver queue status (`hostedBy`, `lastPolledSecondsAgo`); the
page polls it every 5 s. The chip reads *connected* when the runner polled within 10 s, *runner not
connected* otherwise, *not running* when nothing answers on `:8789`. **Show Simulator window** →
`POST /api/device/show` (`open -a Simulator`). A single screenshot is still captured for "Ask Claude
about this screen" (`lib/device.js`). Quick actions: Ask Claude about this screen, Deeplink, Dump tree, Relaunch (driver commands → 409
if a task holds the device).

## v3 Question 1 — "What code?" (P1, D-041)

`lib/test-forge-copy.js` makes a separate QA copy; the developer's repo is only read (`GIT_OPTIONAL_LOCKS=0`,
no fetch).

| Source | Copy | How |
|---|---|---|
| GitHub branch | `~/.test-forge/checkouts/<repo>` | first time `git clone --no-checkout --reference <repo> --dissociate <origin>`; then `fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`, `checkout --force --detach <sha>`, `clean -ffd`, submodules if any. Skipped when the copy is already at the tip |
| Local repository | `~/.test-forge/checkouts/<repo>-local` | `ls-files -z --cached --others --exclude-standard` (existing files only) → `rsync -a --from0 --files-from=-`; files gone since the last snapshot are deleted from the copy. No `.git`. Skipped when the snapshot id is unchanged |

- **Snapshot id:** `<sha7>` clean · `<sha7>+<hash4>` with uncommitted changes (hash of
  `diff HEAD --binary` + untracked paths/contents). `GET /api/code/current` recomputes it for local
  drift (a warning, D-034).
- **Dependencies** (`dependencySteps`, per copy): Swift packages (`SwiftPackageList.txt` hash /
  `SwiftPackages/` missing → `sh SwiftPackages.sh download`), CocoaPods (`Pods/Manifest.lock` ≠
  `Podfile.lock` → `pod install`), Carthage (`Cartfile.resolved` → `carthage bootstrap`). Input
  hashes in `~/.test-forge/state.json`.
- **Manifest** (`state.json` → `current`): source, repo, branch, sha, snapshotId, hasLocalChanges,
  title, author, changedFiles (≤ 200; vs. `merge-base origin/develop` for GitHub, uncommitted files
  for local), path, depsRan, preparedAt.
- **Branches:** `for-each-ref` over `refs/remotes/origin` + `refs/heads`, newest first; `refresh=1`
  adds `ls-remote --heads origin` (marks `isNew` / `isStaleLocally`).
- **Prepare** is a job (`meta.kind = "prepare"`), one at a time (409 with the running `jobId`),
  cancellable (SIGTERM via `AbortController`). Lines: `▸` step, `✓` done, `!` error, `●` ready;
  4-space-indented lines are tool output (the UI keeps only the latest under its step).
- UI: `public/js/code.js` renders into `#codeRoot` (first panel of Test Cases).

## Macros v2 + replay without Claude (M0, D-040)

- `lib/driver-host.js` — `DriverHost` (JS port of test-forge-driver-mcp `queue.ts`): `/health`
  (`hostedBy: "test-forge"`, `lastPolledSecondsAgo`), `/commands` (destructive drain), `/result`,
  `/command`; ≤ 100 commands / results, 4 MB bodies. `start()` binds or stays a client; a 2 s
  watchdog re-binds when the port frees. `status()` reports whoever hosts it.
- `lib/macro-v2.js`:
  - Storage: macros `<UITestRoot>/<Module>/<Submodule>/macros/<slug>.json` (`schemaVersion: 2`),
    registry `<UITestRoot>/TestForgeMacros/elements.json` (`{schemaVersion: 1, elements: {el_…: {alias,
    screen, quality, locator: {chain[], fallbacks[]}}}}`). Atomic writes. IDs `el_` / `mc_` + 10
    base32 chars (time + random).
  - Runner outcomes are unwrapped from `{id, value}` (`unwrapOutcome`); `{id, error}` is a failure.
  - Step fields: `optional` (absent → skipped), `unless: el_…` (2 s `waitForExists` probe; showing →
    skipped), `timeout` (tap), `taps: n` (tap; one multi-tap gesture, runner `test-forge-driver-4`+,
    for `onTapGesture(count:)`). Label-only `waitFor`/`waitForGone`/`unless` send one `waitForExists`
    with `anyOf` (runner `-5`+); so does a label-only `assert` (`waitForExists`/`waitForNotExists`, D-071) —
    reading a label other than the locator's own still needs an identifier. Host steps: `mock {endpoint, variant|enabled:false}` (live NetworkLens
    variant switch, D-049; `retime: true` moves every epoch-ms timestamp in the variant's body so
    the earliest is now − 1 h, gaps kept — `lib/retime.js`, D-058), `setAppDefault {key, value}`,
    openDeeplink, wait, clearAppDefault (plutil on the app container's preferences plist, app
    terminated first), `assertRequested {endpoint: "GET /path", within?}` (D-079: an assertion that
    the app requested that path — query ignored — since the run started, read from the NetworkLens
    trace by `traceRequested` in server.js; proves a hidden/empty state came from the faked answer).
  - `tap {force: true}` (D-059): taps the coordinate whatever covers it (runner `forced`); used to
    tap outside a sheet. The failure note (`interceptorNote` → `lib/lens-check.js`) counts
    `isMockServed` trace exchanges since the run's start and names who set each mock up.
  - Macro-level `cleanup: [steps]` (D-058): run after the steps whatever the verdict (PASS, FAIL,
    BLOCKED, CANCELLED), rows marked `isCleanup`; a failing cleanup step never changes the verdict
    and is listed in `cleanupFailures`. Only the top-level macro's cleanup runs, not a routine's.
  - Preconditions read app settings through `simctl spawn booted defaults read` (the preferences
    daemon), not the plist file, which lags behind (D-058).
  - `planStep` maps a step to runner commands + a check: tap → `tap` (leaf identifier) then
    `tapByLabel` per fallback; waitFor/waitForGone → `waitForExists`/`waitForNotExists`; assert →
    `assertExists {expected, timeout}` (→ `{pass}`) or `getLabel`; type, scrollTo, swipe,
    screenshot, relaunch. openDeeplink / wait run on the host.
  - `replayMacroV2(macro, {registry, send, restart, loadMacro, host, onStep, isCancelled})` —
    routines (`run`) flattened first (depth ≤ 5, cycles refused); per-command timeout = step wait
    + 20 s; silence → `restart()` → whole macro once more → silence again = FAIL ("app may be
    frozen").
  - `macroMap` / `anchorSummary` / `describeStep` — the review map rows and "n/m steps by ID".
  - D-064:
    - `relaunch {ifNeeded}` runs only when a launch-time input this replay set differs from the
      last launch (`noteLaunchInput` / `noteAppLaunched` / `needsRelaunch`), or when its `unless`
      element isn't showing. `mock {atLaunch: true}` marks an endpoint the app reads only at
      launch; `setAppDefault` / `clearAppDefault` count too.
    - `scrollToTop {el}` swipes back until the marker shows (runner `scrollToTop`, `maxAttempts`).
    - `unless` / `onlyIf` take one id or an array.
    - A screenshot the runner doesn't answer falls back to `host.screenshot` (`simctl`).
    - References: `<slug>.ref.json` `{ref, name, links}`; `caseLinks()`, `saveMacroRef()`,
      `lintMacros()`.
- Case requirements (D-153): `TestForgeMacros/case-requirements.json` `{rules:[{match, requires, why}]}` — `lib/case-requirements.js` merges every rule whose regex matches the case id. Replays use mocks⇒NetworkLens, then case rules, then the macro's `requires`; Claude runs (`test-forge-run`, purpose run) resolve case rules via the shared `meetPreconditions` before the first turn and append a "preconditions already met" line to the prompt. `reloadHome: true` relaunches after a login.
- Model-driven NetworkLens fuzzing (D-155): `lib/swift-decodable.js` `parseDecodableFields(source, typeName)` — parses a hand-written `init(from decoder:)`, both the explicit `decodeIfPresent(Type.self, forKey:)` form and this codebase's `KeyedDecodingContainer` subscript form (`values[.x]`, type read from the property's own declaration). `lib/model-fuzz.js` — `locateInstances`/`readAtPath`/`writeAtPath`/`decodeBaselineVariant`/`generateFieldVariants`/`selectRule`/`mergeGeneratedVariants` (pure; mutates by `jsonKey`, merges only `fuzz-`-prefixed variants). `lib/model-fuzz-io.js` — `runFields`/`runGenerate(options, deps)`, `realDeps()` for the CLI. `scripts/test-forge-fuzz.mjs fields|generate` — fs-only, no dashboard server/HTTP route (`TEST_FORGE_PROJECT_DIR` is a detached clone, D-032); a `/api/lens/fuzz` route for a Mac button is a named v2.
- Personal Claude Code settings (D-156): `lib/claude-local-env.js` — `detectLocalEnv({projectDir, mediaRoot, uitestTarget, bundleId, findTestForgeSim})` works out this Mac's `LOCAL_ENV_KEYS` (`TEST_FORGE_BUNDLE_ID`, `NETWORKLENS_BUNDLE_ID`, `TEST_FORGE_PROJECT_DIR`, `TEST_FORGE_UITEST_TARGET`, `TEST_FORGE_DATA_PLANE`, `TEST_FORGE_MEDIA_ROOT`, `TEST_FORGE_DEVICE_UDID`) from what the server already knows, `diffLocalEnv(expected, actual)` compares against the current `.claude/settings.local.json` `env`, `writeLocalEnv(path, env, {examplePath}, deps)` merges just `env` in atomically (seeding from `settings.local.json.example` the first time). `routes/test-forge-setup.js`'s `claudeEnvCheck()` feeds a new `claude-env` readiness check (`lib/readiness.js`, `level: "warn"`, `scope: "all"`); its fix is `POST /api/claude-env/configure`. `.claude/settings.local.json` is no longer tracked (`.gitignore`); `.claude/settings.local.json.example` is the committed, generic baseline every developer's copy is seeded from. `.claude/settings.json` itself never carries an `env` block.
- Before step 1, `replay-v2` resolves `requires` through `lib/preconditions.js` (D-051): env from the app plist → switch routine; `NetworkLensEnabled` + relaunch; session probe → login/logout routine. Failure = BLOCKED. Replays/runs are refused (409) while any test is queued or running.
- Batch follow-up (D-064), wired in `launchBatch`:
  - a replay that isn't PASS → `triageFailure`: a Claude turn with `triagePrompt`; `MACRO_BROKEN` +
    changed files → `enqueueReplay` again; `ENVIRONMENT` → BLOCKED;
  - a Claude case that PASSes → `learnMacro`: the next turn of the same session (`test-forge-run` payload
    `sessionId`, `purpose: learn`) → the new macro is found by `MACRO:` id or case link → replayed →
    kept only on PASS.
  - Item fields: `triage {kind, summary, changedFiles, costUsd, sessionId}`, `repaired`,
    `verdictBeforeRepair`, `learned {ok, macroId, path, replayVerdict, removed, costUsd}`, `phase`
    while running.
- Executor `replay-v2` (device lane, holds the device lock) streams `✓/✗ n. <step> — ms` lines and
  appends a history row with per-step results.
- On FAIL/BLOCKED it calls `checkInterceptor()` (`lib/lens-check.js`): `liveState()` over the
  NetworkLens control queue, falling back to `readSession(resolveSessionPath())`. It prints
  `⚠/ℹ NetworkLens (<source>): mocking ON|OFF, n rule(s), m enabled` plus the armed endpoints, and
  stores `interceptor: {source, isMockingEnabled, armed}` on the history row (D-043).
- Person-in-the-loop (D-044):
  - `manual {say, title?}` → `host.ask()` → `PromptHub` → SSE `/api/prompts/stream` → modal; answer
    with `POST /api/prompts/:id {action: done|skip|stop, value?}`.
  - `typeSecret {el?, credential: "env/profile", field: email|password|otp, submit?, force?}`: the
    runner taps to focus, then `host.secret()` (Keychain) or an input popup, then
    `host.keystroke()` (osascript via stdin).
  - Routes: `GET/POST /api/credentials`, `DELETE /api/credentials/:env/:profile`.
- Identity (D-045): `GET /api/identity` → `{account, target, sessionDir}`. `routes/sessions.js` and
  the `test-forge-run` / `claude` executors default `projectDir` to `sessionProjectDir()`.

## Jobs / SSE

`lib/jobs.js` keeps an in-memory map of jobs `{id, lines[≤2000], status, verdict, isCancelled,
onCancel, emitter}`. `GET /api/jobs/:id/stream` replays buffered lines, then streams `data:` events
until `event: end` (`{status, verdict}`; status `done | error | cancelled`). Used by Run, Replay and
Build. Jobs do not survive a server restart; history does.

## Live state stream (R1, D-077)

One SSE connection per page replaces `/api/events` and every polling timer the page had.

- **`lib/state-hub.js`:** named slices. A slice is read when its source emits (`watch`), when a
  POST may have changed it (`routes/state.js` pokes by path), or, for state outside the dashboard,
  on a probe cadence that runs only while at least one page is connected. A slice is pushed only
  when its JSON changed; bursts within 250 ms become one read; a poke during a read re-reads after it.
- **Slices:**

  | Slice | Source | Probe |
  |---|---|---|
  | `queue` | tasks (with `phase`), sessions, device lock | events |
  | `jobs` | running jobs (`jobView` + `phase`) | `jobEvents` |
  | `batch` | `batchView()` + phases | batch change, narration |
  | `narration` | `lib/narration.js` live steps | events |
  | `usage` | `lib/usage.js` | events + 30 s (tap file, ages) |
  | `status` · `trace` | `/api/status` · `/api/trace?limit=30` | 4 s |
  | `mocks` · `harness` | `/api/mocks` · `/api/harness/status` | 10 s |
  | `device` | `/api/device` | 5 s |
  | `results` | `runSummary` per kept run + `branchHistory` (`lib/results.js`) | `ResultsStore` `change` |
  | `scan` | `ScanSession.view()` (`lib/scan-session.js`) | scan `change` events |
  | `testcases` | loaded document + recording + last run per case (`lib/testcase-view.js`) | job events + `/api/testcases|macros` POSTs |
  | `identity` · `code` · `build` · `readiness` | `/api/identity` · `/api/code/current` · `/api/build/status` · `/api/readiness` | 30 s + job end |

  Probed slices call the server's own GET endpoints, so the stream carries exactly what those return.
- **`lib/lifecycle.js`:** one phase per action — `waiting · working · done · failed · cancelling ·
  cancelled` — on tasks, jobs, the batch and its items. A cancel that is still cleaning up is
  `cancelling`.
- **`lib/narration.js`:** plain-words live steps with an SF Symbol name, status and duration.
  Replays narrate macro steps (`replayMacroV2` gained `onStepStart`); Claude runs narrate their
  TestForgeDriver and NetworkLens tool calls (`mirrorSessionToJob`). `logIndex` is the job line a step
  starts at. The last 3 runs are kept.
- **`lib/usage.js`:** Claude usage like the CLI status line. Every headless run streams a
  `rate_limit_event` (status `allowed` too) with `unifiedWindows.five_hour|seven_day` →
  `utilization`, `resetsAt`; `claude-session.js` and `claude-runner.js` feed every message to
  `usageFeed`. Context % = the run's input + cache tokens ÷ `modelUsage.contextWindow`. The optional
  tap `~/.test-forge/usage.json` wins when newer. Weekly elapsed % counts Mon–Fri only.
- **Page:** `public/js/live.js` exposes `onSlice(name, fn)` and the old `onState` (the `queue`
  slice). `app.js` (a classic script) queues its subscriptions on `window.testForgePendingSlices`. Only
  display clocks remain on timers (elapsed counters, relative times).

## Mac app shell (R2, D-081)

`tools/mac-app/` — Swift package, macOS 14+, a client of this server; no server code changed.

- **Start:** `GET /api/state` (3 s timeout). 200 → attach (never stopped by the app). Else
  `/bin/bash -c "mkdir -p .data && exec ./start.sh >> .data/dashboard.log 2>&1"` in the dashboard
  folder with `TEST_FORGE_SERVER_NO_OPEN=1`; poll `/api/state` 1 s up to 90 s. `start.sh` and `node` both
  `exec`, so the app's `Process` *is* node — terminate = SIGTERM to the server.
- **Stream:** `GET /api/state/stream`; dispatches on each `data:` line using the preceding `event:`
  (`snapshot` → replace all slices, `patch` → `slices[patch.slice]`). Backoff 1, 2, 4, 8, 10 s.
- **Reads:** `readiness` (checks → rows), `queue` (any task not done/failed/cancelled → keep the server on quit).
- **Writes:** Fix buttons POST the web UI's endpoints: `/api/test-forge-sim/{create,boot,solo}`, `/api/build/qa`,
  `/api/harness/ensure`, `/api/code/free-space {olderThanDays:14}`.
- **Console:** tails `.data/dashboard.log` from its end (DispatchSource on extend/write) + app lines; 5 000-line cap.
- **Config:** `TEST_FORGE_SERVER_DIR` (else search upward from the .app for `tools/test-forge-server`), `TEST_FORGE_SERVER_PORT`.
- **Ownership (D-082):** a server the app starts is recorded in `.data/app-server.json` `{pid, port}`; on attach the app re-adopts it when that pid is still `node` (else it is someone else's and never stopped). Cleared when the app stops it or it dies.
- **Code drift (D-083):** `localDrift` returns `hasDrifted` (snapshot moved — drives Run again) and `hasAppInputsChanged` (D-069 `buildInputId` moved — drives the "Code prepared" warning). D-198: when the prepared copy exists, `hasAppInputsChanged` comes from `appFiles` — candidate files (dirty now, dirty at prepare, committed since) outside `BUILD_IGNORED_PATHS` whose content differs from the copy; the id is the fallback.
- **Readiness fingerprints (D-082):** `createCheckMemo` in `lib/readiness.js` reuses a passing `app` / `installed` result while `udid|codeId|endedAt` is unchanged (≤ 30 min), persisted in `.data/readiness-memo.json`; checks carry `durationMs`, reused ones `isReused` + `checkedAt`.

## Mac Tests section (R3a, D-085)

- **Persistence:** `acceptLoaded` writes `{source, title, cases, savedAt}` to `.data/testcases.json`
  (temp file + rename); the server reads it at boot.
- **Reads:** `testcases` (list, header, detail), `narration` (live steps — newest-first; the running
  run, else the newest).
- **Writes:** `POST /api/testcases/load {path}`, `POST /api/macros/v2/:macroId/replay`,
  `POST /api/testcases/:id/run` (after a confirmation), `POST /api/jobs/:jobId/cancel` (job id = the
  narration run's `key`). Server refusals (`{error}`, e.g. 409 one test at a time) show in an alert.
- **Layout:** fixed list (300) · flexible detail (≥ 280) · live steps (280); window ≥ 1 240 pt
  because the macOS 26 sidebar inset counts twice.

## Scan mode (D-086)

- **Process:** `ScanSession.start()` spawns `python3 -u <scan_mode.py> --events --out .data/scans/scan-<stamp>.json`
  (script resolved like the other plugin scripts; override `TEST_FORGE_SCAN_SCRIPT`). stdout lines starting
  `EVENT ` are JSON folded by the pure `applyScanEvent`; other lines keep the last 60. stdin verbs:
  `mark <name>`, `skip`, `stop`. A non-zero exit sets `fatal` to the last line.
- **Slice:** `{isActive, isStopping, startedAt, endedAt, out, device, current:{changedAt, elementCount,
  identifierCount, identifiers≤40, isTruncated, distinctSeen}, screens:[{name, variants:[…]}], skipped,
  pollError, message, fatal, lines}`.
- **Lock:** start takes the device lock as `scan-mode` (409 if busy or held); released on `end`.
  `refuseWhileTesting` refuses test runs while a scan is active.
- **Mac:** `ScanSectionViewModel` maps the slice (`ScanSectionMapper`) to `idle(lastScan:)` /
  `active(live)`; `ScanService` POSTs via the shared `DashboardClient` (which decodes `{error}`).

## Mac Results + Reports (R3b, D-087)

- **Reads:** `results` slice (run list, branch history). A run's cases come from
  `GET /api/results/:id`, fetched on selection and again only when the run's `updatedAt` changes.
  Evidence screenshots are local paths; the app shows them with `AsyncImage` and opens them in Preview.
- **Writes:** `POST /api/results/:id/items/:index/review` (accept · override `{verdict, reason}` ·
  rerun), `POST /api/results/:id/rerun-failed` (confirmed), `POST /api/results/:id/publish`
  (confirmed). Reports read `GET /api/results/:id/report.md` for Export / Copy.
- **Compare:** `compareRuns(base, head)` in `lib/results.js` (pure); `defaultBaseRun` picks the newest
  earlier `develop` run sharing a case, else the newest earlier run sharing one.
- **Layout:** Results 260 · ≥ 300 · 320 (fits the 1 240-pt window); Reports 260 · flexible (≤ 900).

## Advanced: Network Mocks, Recorded steps, Simulator Driver (R3e, D-090)

```
AdvancedSectionViewModel ─┬─ FakeDataViewModel      ◀─ status · mocks · trace slices   ─▶ MockActing
                          ├─ RecordedStepsViewModel ◀─ GET /api/macros · /macros/v2/:id · /macros/lint ─▶ MacroActing
                          └─ PhoneRemoteViewModel   ─▶ POST /api/driver/command · GET /api/driver/host ─▶ DriverCommanding
                                         (all three protocols: one AdvancedService over DashboardClient)
```

| Panel | Reads | Writes |
|---|---|---|
| Network Mocks | `status`, `mocks`, `trace` slices; `GET /api/trace/:id/body` | `POST /api/mocking {enabled}`, `/api/mocks/:id/enabled {enabled}`, `/api/mocks/:id/activate {variantId}`, `/api/networklens/enable` (confirm) |
| Recorded steps | `GET /api/macros`, `/api/macros/v2/:id`, `/api/macros/lint` | `POST /api/macros/v2/:id/replay` |
| Simulator Driver | `GET /api/driver/host` | `POST /api/driver/command {kind, …}`; 409 while a test or scan holds the device |

- Booleans go as JSON (`post(path:json:)`), never strings. Mock bodies are base64 in `session.json`; decoded and
  pretty-printed only for the selected rule. A step is `{respond:{_0:…}}` or `{fail:{_0:…}}`; the first one is shown.
- Driver forms come from `DriverCommandCatalog` (same list as the web console); empty optional fields are left out.
  Verdict reading matches the web: `error` → failed; `found/hittable/exists/pass == false` → warning.
- Layout: plain stacks with fixed side widths (rules 460, calls 360, recordings 340, form 340); nested split views
  clipped panes.

## Simulator bridge: Arrange, step outline, Measure (R3d, D-089; Arrange removed in D-172)

```
Simulator AX tree ──▶ window rect · screen AXGroup rect · elements (identifier, frame in Mac pt)
                          │
device pt ◀─ ScreenMapping (scale = group.width / device width) ─▶ Mac pt
```

- **Arrange:** Simulator → right edge of its display (AX position); window → the rest; sidebar hidden when the
  rest is under 1 240 pt (minimum becomes 880 pt).
- **Step outline:** `POST /api/overlay {on}` lease (90 s, renewed every 60 s) → replay `onStepStart` reads
  `getFrame` (timeout 2 s) for tap/type/typeSecret/scrollToTop/assert → `narration` step `frame` + run `screen` →
  Mac maps it onto the screen group → click-through `NSPanel` ordered above the Simulator window (every 0.4 s).
- **Measure:** `GET /api/device/screen` + `GET /api/device/screenshot.jpg` + Simulator element walk → device-point
  frames (0.5-pt snap) → `MeasureCalculator` (smallest container; nearest facing neighbour per edge, else container).
- **Visible container (D-091):** the screenshot is also kept as RGBA (`PixelGrid`, addressed in device points).
  On selection, `VisibleContainerDetector` scans out from each edge on 7 lines; a boundary needs every line to leave the
  flat background colour and stay off it for 2 pt, then must hold along 85 % of the side (corners skipped) against one
  outside colour, else the scan continues. ≥ 2 edges → a `VisibleContainer`; missing edges keep the structural
  container. Spacing then uses it as the container (neighbours outside ignored). Corner radius from the 45° walk:
  r = d / (1 − 1/√2). Colour threshold 24 per channel; edges reported at the pixel boundary (half a pixel back).
- **Layer pass (D-093):** after the first load, `SimulatorLayerCapture` reads the device's Color Blended Layers state
  (CoreSimulator `getCADebugOption:` 2), turns it off → `simctl io screenshot --type=png` (plain), on → PNG
  (tinted), restores it (`defer`); settle 0.4 s each. `BlendedLayerAnalyzer` on the tinted image: edge maps
  (channel difference > 40), vertical runs ≥ 6 pt (gaps ≤ 3 pt bridged), each left side paired with the nearest
  right side of equal span (±1.5 pt, bucketed), top/bottom row coverage ≥ 80 % within 32 pt (the inset is the
  corner radius), corner arc ≥ 60 % for rounded claims, duplicates (IoU ≥ 0.9) and the full screen dropped.
  `LayerElementMerger`: IoU ≥ 0.85 with an element → lends its radius; inside an `AXStaticText` → glyph, dropped;
  else a new element (`source = .layerColors`, "View without id", no attributes). The plain PNG replaces the
  displayed image. Skipped while `queue` has an active task or a scan runs.
- **Relations (D-094):** `MeasureRelations.enclosures` — every element containing the selection + structural +
  visible container + Screen, sorted by area, same frame once, ≤ 5, each with four insets. `comparison(of:with:)` —
  containment → four insets; disjoint → horizontal/vertical gaps on the shared span's midline (else the selection's
  centre); partial overlap → none. Hover target = smallest other element under the pointer, else Screen; nil over the
  selection itself. Analyzer fallback: left side ≥ 30 pt with no partner → nearest column with an edge within 10 pt of
  both ends and ≥ 50 % coverage. Arc walk starts 3 px in.
- **Spacing display (D-095):** gaps/insets/compare kept raw, then `MeasureSpacing.display`: ×pixelsPerPoint, round,
  ÷pixelsPerPoint, `.toNearestOrEven`. `ThinBarDetector` (run in `BlendedLayerAnalyzer.layers`): row boundary runs
  ≥ 4 pt (threshold 40), bottom = first row within 1–6 pt with ≥ 80 % boundary over the run (ends inset by half the
  height), interior rows < 20 %, fill and the rows above/below flat (≤ 24). Merger: long side ≥ 3, short ≥ 1;
  thin (< 6 pt) boxes inside an `AXButton`/`AXImage` ≤ 48 pt dropped. Hit test: elements < 6 pt get 2 pt slack.
- **Border toggle (D-096):** `MeasureViewModel.showsUnidentifiedBorders` (false) + `unidentifiedBorderColor` (purple),
  not persisted; canvas gets `unidentifiedBorder: Color?` (nil = hidden) → `MeasureBoxKind.unidentified(border:)`;
  hidden boxes stroke clear but keep their accessibility element. Visible container outline uses the colour.
  D-097: no per-selection attribute read; the bridge only walks elements.
- **Shown elements:** at least half on screen (`MeasureCalculator.minimumVisibleShare`); the canvas is clipped to the
  screenshot.

## Menu bar, notifications, Dock badge (R3c, D-088)

- **Reads:** `results` (running batch, progress from `counts`) and `narration` (running single run,
  current step). No new endpoint.
- **Writes:** Stop → `POST /api/batch/cancel` for a batch, else `POST /api/jobs/:id/cancel`.
- **Finish detection:** diff of running batch ids and ended narration keys; first slice read is a
  baseline. Narration runs that start inside a batch's `[createdAt, endedAt + 5 s]` are the batch's.
- **Badge:** `NSDockTile.badgeLabel` = failing cases of the last finished run; cleared on selecting
  Results or Tests. **Notice:** `UNUserNotificationCenter` (only with a bundle id), `.banner` + sound
  while in front; click → Results.
- **Preferences:** `showsMenuBarItem`, `notifiesOnFinish` in the app's defaults (default on).

## HTTP API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/status` | bundle id, session path, `appRunning`, `controlQueueUp`, mocking flag, rule count |
| GET | `/api/mocks` | rules from `session.json` |
| POST | `/api/mocking` | `{enabled}` — live first, file fallback; returns `{live, note}` |
| POST | `/api/mocks` | `{method, endpoint, statusCode, body}` — rule with the standard variants |
| POST | `/api/mocks/:id/activate` · `/api/mocks/:id/enabled` | `{variantId}` · `{enabled}` |
| DELETE | `/api/mocks/:id` | |
| GET | `/api/trace?limit=` · `/api/trace/:id/body?side=` | recent exchanges · decoded body |
| GET | `/api/lens/state` · `/api/lens/health` | D-127: health (`queueOwner`, `isAppRunning`, `isAppPolling`, `lastPollMsAgo`) + `isMockingEnabled` + rules with variants |
| POST | `/api/lens/mocking` · `/api/lens/rule` | `{enabled}` · `{endpoint, variant, retime?}` or `{endpoint, enabled:false}` — `{live, note}` |
| GET | `/api/lens/calls?grep&limit` · `/api/lens/calls/:id` | newest first, `isMocked` · headers, pretty bodies, `curl`; id or unique prefix |
| POST | `/api/lens/calls/:id/mock` | the call's real response → rule with the standard variants |
| GET | `/api/lens/rules` | D-128: every rule with its answers as fields (kind, status, headers, delay, pretty body, failure) |
| PUT · DELETE | `/api/lens/rules/:id/variants/:vid` | rewrite one answer (`{name, kind, statusCode, headers, delay, body, failure}`, JSON bodies checked) · delete (not the active one) |
| POST | `/api/lens/rules/:id/variants` | `{from, name}` — copy an answer |
| GET · POST | `/api/lens/rules/:id/variants/:vid/timestamps` · `…/timeshift` | timestamps with paths · `{anchorPath, inSeconds}` |
| GET · POST | `/api/lens/scenarios` · `/api/lens/scenarios/:id/apply` | list · save `{name, replace?}` · apply (mocking on) |
| DELETE | `/api/lens/scenarios/:id?relaunch=1` | restarts the app (409 + `needsRelaunch` without the flag) |
| GET · POST | `/api/lens/guardrails` · `/api/lens/reset` | armed / not in pack / differs from pack · `{to: "off" \| "pack"}` |
| GET · POST · DELETE | `/api/lens/breakpoints[/:id]` | D-130 (live, phase-D app): breakpoints + held calls · add `{endpoint \| call, url?, stage, oneShot}` · remove (id, `?endpoint=`, or all) |
| POST | `/api/lens/held/:id/resume` · `/api/lens/held/resume-all` | `{status?, headers?, body?}` continue edited, or `{failure}` fail it · continue every held call |
| POST | `/api/lens/calls/:id/replay` · `/api/lens/bubble` | send the captured request again from the app · `{hidden}` |
| POST | `/api/lens/trackers` · `/api/lens/trackers/:id` · `/api/lens/trackers-report` | D-129: `{ids?, contract?, allSessions?}` → rows per TRMS ID + missing / unexpected · one ID's fires with payloads · `{markdown}` (DA page) |
| POST | `/api/driver/command` | `{kind, ...args}` — any kind from `contracts/commands.md` |
| GET · POST | `/api/batch` | P4 (D-061): current batch + live view (`live.step`, `live.screenshot`, `canRunUnattended`) · start `{caseIds, techDocPath?, approval?}` (409 while a test or batch runs, 423 if not ready) |
| DELETE | `/api/test-batches/:id` | D-189: off the list (ended only); folder + report stay. `/api/test-batches` entries carry `progress {passed, failed, undecided, running, cases}` |
| GET · POST | `/api/prerequisites` · `/api/prerequisites/refresh` | D-190: `{checkedAt, items[{id, kind: tool·plugin·mcp, ok, isRequired, detail, howTo}]}`; readiness rows `prereq-tools`, `prereq-claude` |
| POST | `/api/batch/plan` `{caseIds?}` | D-191: `{caseIds (ordered), replayCount, claudeCount, environmentSwitches, logins, manualCases, stops, isHandsFree}`; `/api/batch` uses the same order |
| GET · POST | `/api/testcases/:id/jira` | D-193: draft `{caseId, tickets, comment, posts}` · post `{key, comment, confirmed: true}` (400 without confirmed; headless Claude, add-comment tools only; `.data/jira-posts.json`) |
| GET · PUT | `/api/macros/v2/:id/steps` | D-195: `{id, path, steps[{id, kind, text, fields, timeout, isOptional, typedText, seconds, name}]}` · `{order, changes{stepId:{field:value}}}` → written at the macro's path (400 bad edit, 409 while a test runs) |
| GET | `/api/devices/physical` `?fresh=1` | D-197: `{devices[{id, udid, name, model, osVersion, connection, isPaired, isConnected, isDeveloperModeOn, canRunTests:false, blockers}], checkedAt}` from devicectl, 15 s cache |
| POST | `/api/verify/plan` | D-196: `{base?, range?, includeLocal?}` → `{range, changedFileCount, changedAppFiles, cases[{caseId, macroId, macroName, files}], uncoveredFiles, isSharedChange, unknownCoverage}`; read-only git in the dev repo |
| GET | `/api/macros/v2/:id/inputs` | D-195: `{deeplinks, mocks[{endpoint, variant, isOff, atLaunch, response{status, contentType, body}, source: device·repo·null}]}` |
| POST | `/api/batch/stale` | D-188: a batch of every stale case with a recording, replay only (400 when none); `testcases` slice carries `build`, `isBuildUnverified`, `staleCaseIds`, and each `lastRun.build` / `lastRun.stale {reason, files}` (`lib/staleness.js`, `lib/stale-cases.js`, `.data/code-snapshots.json`) |
| POST | `/api/batch/pause` · `/resume` · `/skip` · `/cancel` | pause = finish the current case, then hold; resume after a crash relaunches the app first |
| GET | `/api/results` · `/api/results/:id` | P5 (D-062): runs (with review state) · one run with `finalVerdict` per case; screenshots = proof still on disk (D-087) |
| GET | `/api/results/:id/compare` | D-087: `?with=<runId>` optional → `{base, head, rows:[{caseId, base, head, change}], counts}` |
| GET · POST | `/api/setups` | P9 (D-067): saved setups, each with `lastRun` (`counts`, `reviewed`/`total`, `isValidated` from the results store) · save `{name, caseIds, approval?, techDocPath?}` from the prepared code and the loaded document (400 for a case not loaded); same name replaces |
| DELETE | `/api/setups/:id` | delete a setup (its runs stay in results) |
| POST | `/api/setups/:id/run` | ▶ Run again → `{jobId}` (kind `setup-run`): prepare the code if needed → reload the document → `startGate()` → `launchBatch()`; never builds — stops on a stale build; 409 while a test, batch or another Run again runs |
| POST | `/api/results/:id/items/:index/review` | `{action: accept\|override\|rerun, verdict?, reason?}` — override needs PASS/FAIL and a reason |
| POST | `/api/results/:id/rerun-failed` | new batch (`rerunOf`) of non-passing / Needs re-run cases |
| GET | `/api/results/:id/report.md` | Markdown report (download) |
| POST | `/api/results/:id/publish` | queues a Claude task: one child page under 2437316839 (asks before writing) |
| GET | `/api/simulator/screen.png` | live view: `simctl io booted screenshot`, cached 2 s |
| GET | `/api/harness/status` · `/api/harness/logs?count=` | status includes `busy` (current lifecycle action) |
| POST | `/api/harness/ensure` · `/api/harness/stop` | 409 if another lifecycle action is running |
| POST | `/api/harness/build` | → `{jobId}`; returns the running job if one exists |
| GET | `/api/media?path=` | evidence image/video; media extensions only |
| GET | `/api/scan` | scan slice |
| POST | `/api/scan/start` · `/api/scan/mark {name}` · `/api/scan/skip` · `/api/scan/stop` | 409 when busy / already scanning; 400 empty name |
| POST | `/api/testcases/load` | `{path}` — Confluence URL or local `.md` / `.html` |
| GET | `/api/testcases` · `/api/macros` · `/api/runs` | |
| POST | `/api/testcases/:id/run` · `/api/testcases/:id/replay` | → `{jobId, taskId}`; queued in the device lane |
| GET | `/api/jobs/active` | running jobs, for re-attach after reload |
| POST | `/api/jobs/:id/cancel` | 404 if not running |
| GET | `/api/jobs/:id/stream` | SSE: `data:` lines, then `event: end` `{status, verdict}` |
| GET | `/api/state/stream` | SSE `event: snapshot` `{version, slices}`, then `event: patch` `{slice, value, version, at, error}` per change (D-077; replaced `/api/events`) |
| GET | `/api/state` | the same snapshot as JSON |
| GET/POST | `/api/sessions` | list · create `{projectDir, title?, model?, prompt?, attachScreenshot?}` |
| GET/DELETE | `/api/sessions/:id` | summary (incl. `pending` approvals/questions) · remove from dashboard |
| POST | `/api/sessions/:id/messages` · `/answer` · `/interrupt` · `/close` | `{text, attachScreenshot?}` · `{requestId, behavior, message?, alwaysAllow?, answers?}` |
| GET | `/api/sessions/:id/stream?after=` | SSE transcript events (replay + live), `event: summary` |
| GET/POST | `/api/tasks` | list (+ device lock) · enqueue `{kind, title?, payload, links?}` |
| GET | `/api/test-forge-sim` | `{qa, booted, others}` (D-053) |
| POST | `/api/test-forge-sim/create` · `/boot` · `/solo` | job: clone the booted sim as "TestForge · <name>" · boot it · shut down the other simulators |
| GET | `/api/build/status` | manifest, profile, `state` current/stale/none/no-code, last build, override (D-054) |
| POST | `/api/build/qa` | job: `build-for-testing` in the QA copy (confirmed click only) |
| POST | `/api/build/profile` | save scheme/configuration/runnerTarget for the repo |
| POST/DELETE | `/api/build/override` | `{reason}` → test the installed app anyway, stamped UNVERIFIED BUILD |
| GET/POST | `/api/code/usage` · `/api/code/free-space` | `~/.test-forge` sizes · remove entries unused for 14 days |
| GET | `/api/test-batches` | `{proofRoot, suggestedRoot, active, batches}` — also the `testBatch` state slice (R4j, D-109) |
| POST | `/api/settings/proof-root` | `{path}` → validated proof root; refused while a test runs or a batch is active |
| POST | `/api/batch` `{caseIds, approval?, techDocPath?, recordVideo?}` — each case's evidence carries `folder` (D-115) | `recordVideo`: "auto" (default) films per `lib/video-plan.js` — replay: server films the planned step window (`videoWindow` in the replay-v2 task, safety stop 300 s, longer than 60 s → `trimToLast` keeps the last 60 s via ffmpeg stream copy; `job.meta.videoPath`); Claude: prompt carries the case row (`caseRowText`, D-114) and `videoGuidance`, its `test_forge_start_recording` .mov is collected as a video (D-113). `true` records each whole case with `simctl recordVideo` into `<batch>/<case>/` (R4k, D-110); `false` none |
| POST | `/api/test-batches` · `/:id/end` | start `{name}` (one active) · end → writes `<root>/<folder>/report.md` |
| GET | `/api/test-batches/:id/report.md` | the batch report, live; a replay batch adds "Compared with …" (D-201) |
| POST | `/api/test-batches/:id/replay` | D-201: recorded cases of the batch → new batch `replayOf {id, name, caseIds, build}` + driver-only run; `{batch, ended, caseIds, skipped}`. Summaries carry `comparison {regressed, fixed, same, missing, cases}` |
| GET | `/api/reset/plan` | `{items[{id,title,detail,sizeMb,isDefault,stopsRunner,isInfo}], isRunning, jobId}` (R4f, D-108) |
| POST | `/api/reset` | `{ids}` from the fixed list → job; stops the runner first when an item needs it; 400 unknown id, 409 busy |
| GET | `/api/readiness` | `{ready, readyForClaude, isUnverifiedBuild, checks[{id,label,ok,detail,fix,level,scope}]}` (P3 checklist, D-055) · `?fresh=1` skips the 8 s cache (D-052) · a `harness` check that fails on an otherwise good setup is `level: warn` + `selfHeals: true`: the gate marks a heal as due and the device lane runs `harness.py ensure` before the next test's first step (D-066) |
| POST | `/api/tasks/clear-finished` | drops finished tasks from the queue (runs.json untouched) |
| POST | `/api/tasks/:id/cancel` · `/move` `{direction}` · `/retry` | |
| GET | `/api/projects` | local repos + workspaces |
| POST | `/api/projects/open-terminal` · `/reveal` | `{dir}` — only folders the scan returned |
| GET | `/api/device` · `/api/device/lock` | device, lock, driver queue status |
| POST | `/api/device/show` | bring Simulator.app to the front |
| GET | `/api/driver/host` | who hosts `:8789`, queued, `lastPolledSecondsAgo` |
| GET | `/api/code/repos?refresh=1` · `/api/code/branches?repo=&refresh=1` | repos from the project scan · branches (refresh = `ls-remote`) |
| GET | `/api/code/current` | current manifest + local drift |
| GET | `/api/git/status?repo=` | D-200: the developer's repo — `{status: {branch, sha, subject, upstream, ahead, behind, changedCount, files, isDirty, fetchedAt, stashCount, operation}}` |
| POST | `/api/git/fetch` · `/fast-forward` · `/switch` · `/restore-stash` | D-200 `{repo}` (+ `{branch, stash}` for switch). 409 + `code` for a guarded refusal (`dirty`, `removes-testforge`, `diverged`, `operation`, `preparing`, …), 502 for git's own failure |
| POST | `/api/code/prepare` | `{repo, source: github\|local, branch?}` → `{jobId}`; 409 + `jobId` if one is running |
| GET | `/api/code/prepare/:jobId` | status, verdict, manifest of the latest prepare |
| GET | `/api/macros` | v2 macros (with `anchors`) + v1 macros from `macro_cli.py` |
| GET | `/api/macros/v2/:id` | macro + review map + anchors (id, name or alias name) |
| GET | `/api/macros/lint` | D-064: `{errors, warnings, macros, references}` — duplicate ids, dangling refs, same steps, case linked twice |
| GET · POST | `/api/mocks/pack` (Macros tab **💾 Save mocks to repo**) | D-064: per endpoint a macro mocks: in repo / on device · save the device's rules to `TestForgeMacros/mocks/` (redacted) |
| GET | `/api/launch-inputs` | D-064: launch-time inputs armed vs. what the app launched with, `needsRelaunch` |
| POST | `/api/macros/v2/:id/replay` | → `{jobId, taskId}`; device lane |

## UI states

Every panel and action has explicit loading / empty / error / offline states. Helpers in
`public/app.js`:

| Helper | Does |
|---|---|
| `request()` | fetch with timeout; throws `ApiError` with `isOffline` (server unreachable) vs. HTTP error; flips the global online state |
| `withBusy(button, label, work)` | disables the button (+ related inputs), spinner, label, optional elapsed timer; restores after |
| `startBusyLine(container, label, {onCancel})` | panel-level progress line with spinner, elapsed time, optional Cancel |
| `toast(kind, title, detail)` | success / warn / error / info outcome messages (bottom-right, auto-dismiss) |
| `setChip` / `setDot` | header status chips and tab dots |
| `spinner` / `skeletonRows` / `tableMessage` | the one loader (faint ring + turning arc) · first-load centred "Loading…" row · empty and error rows (with Retry) |
| `followJob()` | SSE follower that reconnects with back-off and skips already-seen lines |
| `el()` | DOM builder — never parses strings as HTML (captured URLs and case text are untrusted) |

State matrix:

| Area | States |
|---|---|
| Header chips | Server online / offline · App running / not running · Control live / waiting for app / file-only · Harness running / stopped / wedged / working / status error |
| Offline | red bar under header; chips reset to "unknown"; polling continues and recovers automatically |
| Mocking toggle | disabled until first status; "Turning on/off…" while applying; reverts + toast on failure; toast says live vs. saved-for-relaunch |
| Arm mock | inline JSON validation; button "Arming mock…" with inputs locked; toast |
| Mock rows | row dims while an edit is in flight; variant/enabled revert on failure; remove asks to confirm |
| Mocks / traffic tables | skeleton → rows / empty message (specific: no simulator, no trace yet, no traffic) / error + Retry |
| Harness | chip + status text; Ensure / Stop / Build lock all harness buttons with elapsed timers; Build streams and can be cancelled; concurrent lifecycle actions refused server-side (409) |
| Driver commands | one at a time — all buttons lock with a "Running X · m:ss" line; outcome toast distinguishes ok / not found / not hittable / error, with an "Ensure first" hint when the harness is down |
| Test cases load | "Fetching from Confluence…" / "Reading the file…" + skeleton; specific error hints (credentials, 401/403, missing file); success summary with macro count |
| Cases | per-row status badge (— / QUEUED / RUNNING / verdict / CANCELLED / ERROR); all run/replay buttons lock while one is in flight; "Running X (n of m) · m:ss" + Cancel (also clears the queue); Run selected shows the count and confirms |
| Reload | restores last tab, doc paths and loaded cases; re-attaches to running build/run/replay jobs via `GET /api/jobs/active` |

Server support: `POST /api/jobs/:id/cancel` (SIGTERM for run/build, flag checked between replay
steps), `GET /api/jobs/active`, one run/replay at a time (409), one harness lifecycle action at a
time (409), `busy` field on harness status.

## Launcher

`Launcher.applescript` → `TestForge server.app` (`osacompile`). Probes `:4545`; if down, runs
`start.sh` with `TEST_FORGE_SERVER_NO_OPEN=1`, waits ≤20 s, `activate`s itself, shows the status dialog
(30 s timeout), opens the browser. `start.sh` repairs the GUI-launch PATH, sources `.env.local`,
installs deps, sets defaults.

## Configuration

See the table in `../README.md#configuration`. Defaults specific to this repo:
`TEST_FORGE_SCHEME=BlibliMobile-iOS-PerfTest`, `TEST_FORGE_CONFIGURATION=PerformanceTest`,
`TEST_FORGE_UITEST_TARGET=BlibliMobile_XCUITest`, `TEST_FORGE_PROJECT_DIR=../../BlibliMobile-iOS`.

## File map

> **D-199:** `public/` (the browser UI), `TestForge server.app` and `Launcher.applescript` were removed; the server no longer serves static files. The TestForge Mac app, `test-forge` and Claude Code are its clients. `public/js/*` names in the data-flow notes above are historical — their Mac counterparts: Prepare code `GetReady/PrepareCode/`, Run queue `GetReady/RunQueue/`, Logins `Settings/Logins/`, run popups `RunPrompt/` (the new `prompts` state slice, re-read on every PromptHub change).

| File | Responsibility |
|---|---|
| `server.js` | all routes, `applyEdit`, run/replay/build job wiring |
| `start.sh` | PATH, `.env.local`, deps, defaults, launch |
| `Launcher.applescript` / `TestForge server.app` | double-click entry |
| `lib/session.js variants.js trace.js container.js redact.js control.js control-queue.js android.js` | copied from the NetworkInterceptor MCP build by `scripts/sync-networklens.sh` (revision in `lib/NETWORKLENS_REVISION`) — never hand-edit; change upstream on the QA branch (D-050). Since D-065 that branch sits on NetworkInterceptor 1.0.0 (tag `test-forge-driver-2`) |
| `lib/endpoint.js` | URL → endpoint key |
| `lib/driver-queue.js` | TestForgeDriver queue client with one harness-restart retry |
| `lib/harness.js` | `harness.py` wrapper |
| `lib/macro.js` | `macro_cli.py` wrapper + v1 replay loop |
| `lib/macro-v2.js` | macro schema v2: storage, element registry, step planner, replay, review map |
| `lib/run-batch.js` | P4 batch: sequential cases, pause / resume / skip / cancel, crash → BLOCKED + hold (D-061); `followUp` stage (D-064) |
| `lib/agent-turns.js` | D-064: triage and save-as-macro prompts, `TRIAGE:` / `MACRO:` parsing, macro-file snapshots and diffs |
| `lib/mock-pack.js` | D-064: mock pack export (redacted, one rule per file), load, and device-or-pack rule resolution |
| `lib/crash-report.js` | newest `.ips` crash report of the app since a time, summarized (D-061) |
| `lib/retime.js` | moves captured epoch-ms timestamps in a mock body to now (D-058) |
| `lib/lens-check.js` | failure note: mocks that answered during the run, from the trace (D-043, D-059) |
| `lib/results.js` | P5 results store (`.data/results.json`), review, FLAKY, Markdown report (D-062); `runSummary`, `branchHistory`, `compareRuns`, `defaultBaseRun`, `isProbeShot` (D-087) |
| `lib/setups.js` | P9 saved setups (`.data/setups.json`): `makeSetup` validation, `needsPrepare`, `SetupStore` (D-067) |
| `lib/driver-host.js` | dashboard-hosted TestForgeDriver queue on `:8789` |
| `lib/test-forge-copy.js` | Question 1: QA copies (GitHub branch / local snapshot), dependencies, manifest, drift, `buildInputId` (D-069) |
| `lib/plugin-paths.js` | locate test-flow-recorder scripts (bounded-depth globs, cached) |
| `lib/scan-session.js` · `routes/scan.js` | scan mode process, `scan` slice, `/api/scan/*` (D-086) |
| `lib/testcases.js` | markdown + HTML table parsing, Confluence fetch |
| `lib/jobs.js` | SSE job registry; `jobEvents` emits on start / cancel / finish |
| `lib/state-hub.js` · `lib/lifecycle.js` · `lib/narration.js` · `lib/usage.js` | live state slices · one action lifecycle · plain-words live steps · Claude usage (R1, D-077) |
| `lib/history.js` | `.data/runs.json` |
| `lib/claude-stream.js` | `claude -p` stream-json → console lines; verdict extraction |
| `lib/claude-runner.js` | spawns `claude -p` stream-json into a job; returns final result + raw tool results by tool name |
| `lib/claude-session.js` · `lib/sessions.js` | live Agent SDK sessions · registry + persistence |
| `lib/permissions.js` | pre-allowed tools, hard denies, per-project Always-allow |
| `lib/task-queue.js` · `lib/device-lock.js` | two-lane queue · simulator lock |
| `lib/projects.js` · `lib/device.js` | repos scan + Terminal/Finder · simctl |
| `routes/{sessions,tasks,projects,device,code,state}.js` | v2/v3 HTTP routes (server.js keeps v1 routes and task executors) |
| `test/*.test.js` · `test/fake-runner.js` | `npm test` (node:test): queue host, macro v2 replay vs. a fake runner, QA copy vs. throwaway git repos |

## Claude run prompt (D-071)

`enqueueTestForgeRun` (server.js) builds `/test-forge-run <doc> [<tech doc>] — run only case <id>`, then
`MOCK_HINT`, then the `VERDICT:` line request (D-070). `MOCK_HINT` tells the session that mocks go
through the `networklens` MCP only, that ready rules with named variants are on the device and in
`<UITestRoot>/TestForgeMacros/mocks/*.networklens-pack.json`, and that learned macros
(`<UITestRoot>/**/macros/*.json`) show proven routes into each screen. A batch's `techDocPath` is
passed through to every case.

## Tutorials (R4a, D-098)

- `Tutorials/`: `TutorialFeature` (11), `TutorialAnchor` (controls), `TutorialCatalog` (scripts), `TutorialTip`
  (TipKit; rule `#Rule(Self.$activeTipId) { $0 == id }`, `IgnoresDisplayFrequency`), `TutorialCoordinator`
  (`start`, `autoStart`, `perform(actionId:)`, `pause`, `resetAll`; defaults keys `tutorials.autoShow`,
  `tutorials.runNumber`, `tutorials.progress.<feature>`), `.tutorialAnchor(_:)` (popoverTip with the coordinator's
  tip for that anchor, else an idle tip that never shows), `TutorialHelpMenuView`, `TutorialSettingsView`.
- `Tips.configure([.displayFrequency(.immediate)])` at launch; the coordinator is an environment object in the main
  and Measure windows; Settings gets the testforge view model.
- `TestForgeViewModel+Tutorials`: `startTutorial` prepares the screen then starts; `sectionDidAppear` (on appear,
  section change, panel change) pauses an off-screen tutorial and auto-starts the screen's own.
- Layer capture: `layerCapture.pendingRestoreUDID` in defaults while the switch is off for a capture;
  `restoreIfInterrupted()` at launch.

## Demo run (R4b, D-099)

- `Demo/DemoRunViewModel`: phases idle → blocked(reason) | starting → running → reviewingResults → finished | failed.
  Start checks the `readiness` slice (`ready`, first failing `block` check) and the `testcases` slice (SF-001, SF-006
  with `macro`), then `POST /api/batch {caseIds}`; finish = `queue` slice active then idle. `DemoNavigating`
  (the testforge view model) arranges, starts the matching tutorial and switches sections. Stop → `POST /api/batch/cancel`.
- `DemoBannerView` sits in the section's top safe-area inset; `DemoBannerContainerView` observes only the demo.

## Build screen (R4e, D-101)

- `Build/BuildServerService` (`TestForgeBuildActing`): `GET /api/build/status`, `POST /api/build/qa`,
  `POST /api/jobs/:id/cancel`, `POST /api/harness/ensure|stop`; `followLog` reads the job's SSE stream
  (`data:` lines, stops at `event: end`). The build is the server's QA pipeline, so web and Mac build identically.
- `Build/XcodeToolsService` (`XcodeToolsActing`, on `ProcessCommandRunner`): `xcodebuild -version`,
  `xcode-select -p`, `runWithoutBuilding()` via `XcodeMenuInvoker` (D-103: AX press of Product › Perform Action ›
  Run Without Building on Xcode's menu bar; activates Xcode first because it disables Product items in the
  background, waits ≤3 s for the item to enable, then reactivates TestForge; refuses when the item stays
  disabled, Xcode is closed or AX isn't allowed),
  `du -sk`, `rm -rf` only for `CleanTarget` (`~/.test-forge/derived`, `~/Library/Developer/Xcode/DerivedData`),
  `open <workspace>` (the user's own clone, not the QA copy).
- `BuildSectionViewModel`: status state, presentation (ready / needs build / building), log lines (last 200),
  one action at a time (sizes and deleting moved to Free space and reset, D-214), lock from `queue`/`scan`; reloads status when the `jobs` slice changes so a build
  started from Get ready is followed here too.
- `XcodeToolsService.resetSwiftPackages(reopening:)` (D-102): `NSRunningApplication.terminate()` on
  `com.apple.dt.Xcode` (no Automation permission needed), waits ≤60 s, then `rm -rf` DerivedData and both SwiftPM
  folders (`CleanTarget.swiftPackageCache`, `.swiftPackageData`), then `open <workspace>` or `open -a Xcode`.
- **Install for testing** (D-105): `BuildSectionViewModel.installForTesting()` → state `current`: `POST /api/harness/stop`
  then `/api/harness/ensure` (300 s timeout via `DashboardClient.post(path:timeout:)`; the body's `ok` decides);
  otherwise confirm → `/api/build/qa` with `shouldInstallAfterBuild`, and the status reload after the job ends
  continues with the install (or reports the failed build). `XcodeMenuInvoker` removed.
- `Build/BuiltAppLauncher` (`BuiltAppLaunching`, D-104): newest `Build/Products/*-iphonesimulator/*.app` with
  `CFBundlePackageType` APPL (skips `-Runner.app`) under the QA build's DerivedData or Xcode's
  `DerivedData/<workspace>-*`; `simctl install` then `simctl launch --terminate-running-process` with the bundle id
  read from Info.plist. Target UDID: the Simulator screen's selection (closure injected by the testforge view model),
  else the QA simulator from `/api/device/screen`.
- `TutorialCoordinator.activeAnchor`: the current tip's anchor; `BuildSectionView` scrolls its section into view.

## Proof folder + Test Batches (R4j, D-109)

- `lib/test-batches.js` `TestBatchStore`: settings + batches persisted under `.data/`; `mediaDir` = root/active
  folder, mirrored into `process.env.TEST_FORGE_MEDIA_ROOT` on restore and every change (server proof writes and spawned
  children read that variable). `attach({kind, refId, title})` is a no-op without an active batch or for a repeat id.
- Hooks in `server.js`: `tasks.on("enqueued")` (TaskQueue now emits it), `sessions.on("created")` (chats without a
  `taskId`), the Results run start, `scanSession` change (scan `out` path as id). `readiness` gets
  `testBatchState`; `testBatchChecks` adds two block-level checks first. `routes/test-batches.js` `batchReport`.
- Mac `TestBatch/`: `TestBatchService` (`TestBatchActing`), `TestBatchViewModel` (`TestBatchPresenting`;
  `TestBatchPillState` loading / needsProofFolder / noBatch / active; reads the `testBatch` slice),
  `TestBatchToolbarView` (Menu pill + end confirmation + start sheet), `TestBatchStartSheetView`.
  `GetReadyActions.testBatch` (`TestBatchFixActions`) routes the new `FixRoute.chooseProofFolder` / `.startTestBatch`.

## Reset for a fresh run (R4f, D-108)

- Server `lib/reset.js`: `ITEMS` (id, title, detail, isDefault, stopsRunner, `measure`, `perform`) — the only place
  reset paths exist. `resetPlan` measures all items in parallel + `git status --porcelain` of the prepared repo
  (info only). `performReset` stops the runner once if any chosen item needs it, then deletes in display order.
  Route in `routes/test-forge-setup.js` shares `refuseWhileBusy` (test, build, reset) and checks the device lock (scan).
- Mac `Build/Reset/`: `ResetServerService` (`ResetActing`: plan, start, followLog via the build job stream),
  `ResetSectionViewModel` (`ResetSectionPresenting`; `ResetPlanState`, `ResetRunState`; defaults ticked on first
  load; lock from `queue`/`scan`; follows a reset already running on (re)open; `onFinished` → Build reloads),
  `ResetSectionView` (section + "Reset log"), `ResetItemRowView` (toggle with size badge; repo row is a lock).

## Test device (D-120)

- Server: `lib/test-device.js` (`configureTestDevice`, `chosenTestDeviceUdid`, `chooseTestDevice`, `noteTestDevice` →
  `NETWORKLENS_UDID`, `deviceArg`), `findTestForgeSimulator` = chosen else "TestForge · " clone. Routes `GET/POST /api/test-device`.
- Mac: `Server/TestDeviceService` (`TestDeviceActing`), `SimulatorControlViewModel.testDevice`, `useSelectedForTests`,
  `useTestForgeCloneForTests`; `Simulator/CoreSimulatorDevices` (private CoreSimulator via the ObjC runtime),
  `Simulator/SimulatorWindowScreen` (`SimulatorScreenReading`: `windowDevice()`, `screenshot(udid:)`, `SimctlScreenshot`).
  Measure (`MeasureDependencies.screenReader`) and the flow map use it; the server's `/api/device/screen` is no longer
  needed by either.

## Replay on any device (D-119)

- `lib/viewport.js` (pure + `bringIntoView`): `placement(frame, viewport)` by window fractions (`TOP_BAND`,
  `BOTTOM_BAND` = 0.12), `swipeToward`, `MAX_NUDGES` = 12 with a stop when the frame stops moving. `runStep` calls it
  through `nudgeIntoView` when an identifier `tap`/`type`/`scrollUntilExists` answers "not hittable"; the window size
  comes from `deviceInfo` once per replay (`device` context in `replayMacroV2`). Rows carry `nudges` + `scrolledFrom`.

## Scan flow map (D-117)

- `Scan/ScanContainerView` (mode switch) → `Scan/FlowMap/`: `FlowMapViewModel` (deps `FlowMapDependencies`: locator,
  simulatorControl, `FlowMapStoring` = `FileFlowMapStore` at `~/.test-forge/flows/`, `SimulatorGestureMonitoring` =
  `GlobalPointerMonitor`, desktop), pure `FlowScreenMatcher` + `FlowTreeBuilder`, models `FlowMap/FlowScreen/FlowEdge/
  FlowAction`, views `FlowMapSectionView`, `FlowMapHeaderView`, `FlowTreeView`, `FlowTreeRowView`, `FlowScreenDetailView`.
  Constants `TestForgeConstants.FlowMap`; identifiers `TestForge_FlowMap_*`, `TestForge_Scan_ModePicker`. No server involvement.

## Proof viewer (D-118)

- `ProofViewer/`: `ProofViewerViewModel` (items, selection, open/reveal through `DesktopActing`) → `ProofImageViewModel`
  + `ProofVideoViewModel`. Window scene `proof` in `TestForgeApp`; Results opens it with
  `ResultCaseDetailModel.proofViewerRequest(selecting:)` + `openWindow(id:)`. Constants under
  `TestForgeConstants.ProofViewer`; identifiers `TestForge_ProofViewer_*`.

## Simulator screen (R4d, D-100)

- `SimulatorControl/SimulatorControlService` (`SimulatorControlling`): `xcrun simctl list devices available -j`,
  `boot`, `shutdown`, `launch --terminate-running-process`, `terminate`, `openurl`, `spawn <udid> defaults
  read|write|delete <bundle> <key> [-type value]`, `privacy <udid> reset all <bundle>`, `keychain <udid> reset`,
  `shutdown` + `erase`; `open -a Simulator`; Color Blended Layers through `BlendedLayersSwitch` (CoreSimulator, option 2).
- `App/CommandRunner` (`CommandRunning`, `ProcessCommandRunner`): runs a tool, echoes `$ command` and the result to
  the console; `CommandOutput.summary` strips the `date time tool[pid:tid]` prefix.
- `SimulatorControlViewModel`: devices state, selection, lock from `queue`/`scan` slices, one action at a time,
  last result. Views (D-116): a scrolling page capped at 1100 pt — device card (`iphone` symbol, device menu,
  `SimulatorDeviceStateBadgeView`, iOS · UDID with Copy, Boot *or* Shut down, Show Simulator, Refresh), status banner,
  then an adaptive grid (min 380 pt) of `SimulatorCardView` cards with tinted symbol headers: App, Display, Saved
  settings, Reset. Copy UDID goes through `DesktopActing` (injected in `SimulatorControlDependencies`).

## NetworkLens API + `test-forge-lens` (D-127)

- `server.js` calls `controlQueue.listen()` at start and owns port 8788; a wrapper around the queue's drain stamps
  `lensLastPollAt`, so `queueHealth()` reports polling (fresh < 5 s). `testForgeSessionEnv` passes `NETWORKLENS_SIDECAR`.
- `routes/lens.js` gets `{readState, setMocking, armVariant, upsertQuickMock, currentTrace, queueHealth}` injected;
  `lib/lens-calls.js` is pure (rows, detail, curl, response → mock source).
- `scripts/test-forge-lens.mjs` → `/api/lens/*`; the Claude run prompt (`MOCK_HINT`) names it with its absolute path.
- `lib/app-defaults.js`: `appPreferencesDomain` = `<data container>/Library/Preferences/<bundle id>`; read/write/delete via
  `simctl spawn <udid> defaults <verb> <domain>`. Used by preconditions, macro host `setDefault`/`clearDefault`,
  `lens-bubble.js`; mirrored in the Mac `SimulatorControlService` (falls back to the bundle id when the app has no container).

## Mac Network console (D-128)

- `Sources/TestForge/Network/`: `NetworkConsoleViewModel` (page; builds the section VMs, 2 s tick while shown —
  health every tick, rules + scenarios + guardrails every third, any change refreshes all), section VMs `NetworkHealth…`,
  `NetworkGuardrails…`, `NetworkTraffic…`, `NetworkRules…`, `NetworkScenarios…` (each `…Presenting` protocol +
  `NetworkSectionState`), `NetworkVariantEditorViewModel` (sheet), `NetworkConsoleMapper` (all wording),
  `NetworkConsoleModels` (wire types), `NetworkConsoleConstants` (sizes + `TestForge_Network_*` identifiers).
- `Server/NetworkConsoleService.swift`: one transport (`NetworkTrafficReading & NetworkRuleEditing &
  NetworkScenarioManaging & NetworkGuarding`); `DashboardClient` gained `put` / `delete`.
- Server side: `lib/lens-console.js` is pure (views, edits, time-shift, scenarios, guardrails with key-sorted compare);
  `readLensRules` (live rules when polling, scenarios from session.json or the list last sent live) and `commitLens`
  (rules upserted by id, `scenarios` = whole list) in `server.js`; `replaceScenariosOffline` stops/starts the app.
- D-129 Trackers tab: `NetworkTrackersSectionViewModel` (`NetworkTrackersPresenting`, list + fires state, loads on
  Check then on the slow tick), `NetworkTrackerMapper` (verdict: fired / with problems / non-2xx / not fired),
  `NetworkTrackerModels` (wire + `LensTrackerAsk`), service slice `NetworkTrackerReading`; contract file through
  `DesktopActing.chooseFile`, report through `saveText`. Server `lib/lens-trackers.js`: fires = objects whose `payload`
  holds `trms_id` (a `/track-batch` body is many), latest launch by `sessionID` unless `allSessions`.
- D-130 Breakpoints tab: `NetworkBreakpointsSectionViewModel` (`NetworkBreakpointsPresenting`; refreshes every tick
  while something is held, else on the slow tick), `NetworkBreakpointMapper`, `NetworkBreakpointModels` (app dates are
  seconds since 2001), service slice `NetworkBreakpointControlling`; Traffic's Hold this call goes through the page
  (`NetworkTrafficActions.holdCall`) to the Breakpoints section and switches tab. Health: `lib/lens-pollers.js` →
  `isIdentified` / `otherDevices`; the queue (`lib/control-queue.js`, synced) targets commands by `device`.
- `TestForgeView`: the detail `VSplitView` is padded by the toolbar's safe-area inset (it is AppKit-backed and would
  otherwise lay section tops out under the toolbar).

## Install from a DMG + first-run Setup (D-132)

- `tools/mac-app/scripts/make-dmg.sh` wraps `make-app.sh release` into `build/TestForge-<version>.dmg`.
- Folder resolution (`TestForgeOpening.resolveServerLocation`): `TEST_FORGE_SERVER_DIR` → `dashboardDirectory` default →
  walk up from the bundle for `tools/test-forge-server/server.js`; nil → `TestForgeServices.isSetupNeeded`, the window shows
  `SetupView`, `start()` returns early.
- `Setup/`: `SetupViewModel` (`SetupPresenting`), `ToolCheckService` (`/bin/zsh -lc` with start.sh's PATH),
  `RepoFolderResolver`, `SetupSystem` (relaunch = open a new instance then terminate; Claude sign-in = Terminal
  `.command` running `claude auth login`).

## Claude section (D-133)

- Route: `POST /api/sessions/testforge {fresh?}` → `{session}` (`lib/test-forge-session.js`, `pickTestForgeSession` /
  `openTestForgeSession`); session cwd = `TEST_FORGE_PROJECT_DIR`. Everything else is the existing `/api/sessions/:id/*`
  surface: `messages {text, attachScreenshot}`, `answer {requestId, behavior, alwaysAllow, answers, message}`,
  `interrupt`, `stream?after=<seq>` (SSE: unnamed events = transcript records, `summary` = status).
- Mac `Claude/`: `ClaudeSessionService` (transport + SSE, maps off the main actor) → `ClaudeTranscriptMapper`
  (records → `ClaudeTranscriptKind`: user, assistant, tool, toolResult, notice, started, approval, question; `*-resolved`
  → outcome text) → `ClaudeSectionViewModel` (state `notStarted / opening / ready / failed`, items, outcomes, reconnect
  loop) → `ClaudeSectionView`, `ClaudeTranscriptRowView`, `ClaudeApprovalCardView`, `ClaudeQuestionCardView`,
  `ClaudeComposerView`. Opened by `TestForgeViewModel.setServerPhase(.running)`.

## Welcome tour (D-134)

- Mac `Onboarding/`: `OnboardingViewModel` (`OnboardingPresenting`; `step: OnboardingStep`, `role: OnboardingRole`,
  defaults `onboarding.hasSeen` / `onboarding.role`; `actions: OnboardingActions` set by `TestForgeViewModel`
  `connectNavigators()`), `OnboardingCatalog` (+`Roles`) static content, views `OnboardingView`, `OnboardingStepListView`,
  `OnboardingRolePickerView`, `OnboardingCardView`, `OnboardingFlowStepView`, `OnboardingStartActionsView`,
  `OnboardingFooterView`, hosted by `OnboardingSheetModifier` on the testforge view.
- Entry points: `TestForgeView.onAppear` → `presentIfFirstTime()`; `TestForgeCommands` Help group; `TutorialHelpMenuView`
  `showWelcome`. Start actions route through `TestForgeViewModel.performOnboarding` (section, demo, tips on).

## Arrange toggle (D-137) — removed in D-172

- `WindowArranger.arrange` returns `ArrangeOutcome.arranged(isSidebarHidden:snapshot:)`; `restore(window:snapshot:)`
  moves both back. `TestForgeViewModel` keeps a private `SavedArrangement` (snapshot + sidebar visibility) and publishes
  `isArrangedWithSimulator` for the toolbar toggle and the menu's checkmark.
- `SimulatorLocating.prefer(deviceName:)`: `AXSimulatorLocator.deviceWindow()` picks the window whose `AXTitle` starts
  with that name, else the first device window. Set from `TestForgeViewModel.preferTestDeviceWindow()` (GET
  `/api/test-device`) on server running and before each Arrange.
- D-138: `SimulatorLocating.deviceWindowTitles()` (de-duplicated), `geometry(windowTitle:)`, `moveWindow(to:windowTitle:)`;
  Arrange with more than one title sets `TestForgeViewModel.simulatorChoice` (`SimulatorChoicePrompt`, test device
  first) → confirmation dialog → `chooseSimulator(_:application:)`; the snapshot keeps the title for restore.
- D-140: `SplitViewArranging` / `SplitViewArranger` (`enterSplitView(window:simulatorTitle:)` → `.entered | .unavailable |
  .waitingForPick | .failed`, `leaveSplitView(window:simulatorTitle:)`); `SimulatorLocating.pressMenuItem(anyOf:)`
  walks the Simulator's menu bar through `AXMenu`s; `raiseWindow` also sets `AXMain`. `SavedArrangement.Layout` is
  `.splitView(simulatorTitle:)` or `.sideBySide(ArrangeSnapshot)`.
- D-141: tile item is Right of Screen; `deviceWindowTitles()` merges reachable AX windows with the Simulator's Window-menu
  window items (after its last separator); `enterSplitView` loops: Exit Full Screen if offered, then Tile Right (6 s).

## Measure: text lines filter the layer pass (D-143)

- `Measure/TextRegionDetector.lineBoxes(in:screenSize:)` (Vision, fast) on the plain capture →
  `LayerElementMerger.merge(layers:into:textLines:)`, which drops a layer box covering ≥ 20 % of its area on a text
  line it doesn't wrap. Runs inside `MeasureViewModel.analyseLayers`, off the main actor.
- D-145: `LayerElementMerger` collects candidates first, then drops icon pieces (`isIconPiece`: off-centre inside an
  icon-sized layer / AX button or image, an edge strip ≤ 4 pt, or a speck < 9 × 6 pt) before adding the rest.

## Every Claude session in the Mac app (D-147)

- Server: `POST /api/sessions/:id/reopen` (closed → idle; needs `claudeSessionId`); narration runs carry `sessionId`
  (`mirrorSessionToJob`). The `queue` slice's `sessions` (with `pending`) drive the Mac switcher and badge.
- Mac: `QueueState.sessions: [ClaudeSessionRow]` → `TestForgeViewModel.updateClaudeSessions()` → `ClaudeSectionViewModel
  .update(sessions:)`, `claudeAttentionCount` (sidebar `.badge`), one `FinishNotice(claudeSessionId:)` per new request
  (click → `showClaudeSession`). `ClaudeSectionViewModel.show(sessionId:)` (GET `/api/sessions/:id`), `sendQuickReply`,
  `deliver` (reopen first when closed), `sessionChoices`, `isAwaitingReply`, `showsDetails`. Views:
  `ClaudeSessionSwitcherView`, `ClaudeDetailRowView`, `ClaudeQuickRepliesView`; `LiveStepsActions.showClaudeSession`.

## Claude usage bar (D-149)

- Server: `usageFeed.watchTap()` (5 s), `usage.model`; `POST /api/usage/tap` → `lib/usage-tap.js installTap()`; slice
  `claudeCli` (5 s) ← `lib/claude-cli-sessions.js listCliSessions()`; `TEST_FORGE_USAGE_TAP` overrides the tap path.
- Mac `Usage/`: `UsageState`, `ClaudeAccountState` (identity), `ClaudeCliState` → `UsageBarMapper` (`state`,
  `accountSummary`) → `UsageBarViewModel` (lazy on `TestForgeViewModel`) → `UsageBarView` / `UsageSegmentView`, inset at
  the bottom of `TestForgeView` when `TestForgePreferences.isUsageBarShown`; View menu toggle in `TestForgeCommands`.

## Remote Control (D-150)

- Server: `RemoteControl` (`lib/remote-control.js`) — spawn `claude remote-control --name … --spawn …` detached in
  `TEST_FORGE_PROJECT_DIR` with `TEST_FORGE_REMOTE=1`, stdout/stderr → `.data/remote-control.log` (tailed every 500 ms →
  `plainText` → `readOutput`: phase, capacity, session / environment URLs, problem); `.data/remote-control.json` holds
  the pid for `adopt()`; `stop()` kills the process group and waits for exit. Routes `/api/remote-control[/start|/stop]`,
  slice `remoteControl`.
- Plugin (test-flow-recorder): `hooks/hooks.json` → `test-forge-guard.mjs` (PreToolUse `Bash|mcp__.*`),
  `test-forge-session.mjs` (SessionStart); both no-ops without the marker.
- `scripts/test-forge.mjs`; repo skill `BlibliMobile-iOS/.claude/skills/test-forge-remote/SKILL.md`.
- Mac `RemoteControl/`: `RemoteControlState` → `RemoteControlMapper` → `RemoteControlViewModel` (lazy on
  `TestForgeViewModel`; `QRCodeRenderer` for the link) → `RemoteControlButtonView` (Claude header) /
  `RemoteControlPanelView` (popover).

## Deeplinks (D-157)

- Server: `lib/deeplinks.js` (`templateFor`, `fillTemplate`, `loadCatalog`, `matchUrl`, `urlProblem`, `DeeplinkStore` →
  `.data/deeplinks.json`), `routes/deeplinks.js` registered after the device routes with `catalogFile` =
  `<repo>/BlibliMobile-iOS/BlibliMobile-iOS/Common/Deeplink/DeeplinkList.txt`. Routes: `GET /api/deeplinks` (`routes`,
  `saved`, `history`, `source`, `appVersion` of the installed QA build or null — D-205), `POST /api/deeplinks/match {url}` (answers the normalized `url`: UAT-B web links → `blibli://`), `POST /api/deeplinks/open {url}` (refuseWhileTesting
  + `deviceLock.tryAcquire("deeplink")`, `xcrun simctl openurl <deviceArg()> <url>`), `POST /api/deeplinks/saved
  {name,url}`, `DELETE /api/deeplinks/saved/:id`. `test-forge link routes [text] | match <url> | open <url>`.
- Mac: `Server/DeeplinkService.swift` (`DeeplinkProviding`) → `SimulatorControl/Deeplinks/DeeplinksSectionViewModel`
  (built by `SimulatorControlViewModel`, lock from the `queue`/`scan` slices, 300 ms debounced match) →
  `DeeplinksSectionView` (card) + `DeeplinkRoutePickerView`, `DeeplinkParamFieldsView`, `DeeplinkLinkRowView`,
  `DeeplinkEntryListView`, `DeeplinkEntryRowView`. Anchor `.simulatorDeeplinks`.

## Model auto-pick (D-158)

- `lib/model-pick.js`: `pickModel(case, {history, purpose, override})` → `{model, score, reasons, isAuto}`;
  `watchForEscalation(session, {model, escalate})` listens to `tool-result` events + a 15 s clock; `describePick`.
- test-forge-run executor (`server.js`): pick before `sessions.create({model})` with the current `buildStamp().buildId` (history
  counts only same-build runs); a continued session keeps its model, except save/learn turns drop Opus → Sonnet
  (`followUpModel`); log
  `● model: …`, `narrator.setModel(jobId, {model, reason})` (narration runs carry `model`, `modelReason`), escalate via
  `ClaudeSession.setModel` (`lib/claude-session.js` → SDK `query.setModel`, recorded as a `dashboard/model` event),
  history `model` + `modelPick`. Override: request `model` (`/api/testcases/:id/run`, `/api/batch` → `launchBatch` →
  `enqueueTestForgeRun` → task payload) > `TEST_FORGE_RUN_MODEL` > `auto`.
- Mac: `Tests/ClaudeRunModel.swift`; `TestCaseService.runWithClaude(caseId:model:)`; `NarratedRun.model/modelReason`
  → `LiveRunModel.modelText` → live-steps header.

## Usage limit in a batch (D-161)

- `server.js` test-forge-run executor: `isUsageLimit(result)` → no `appendRun`, job ends `USAGE_LIMIT` with
  `job.meta.usageLimit`; `jobDone` returns `{status, verdict, usageLimit}`.
- `lib/run-batch.js`: an outcome with `usageLimit` → `#requeueForLimit` (item reset to `queued`, keeps caseId,
  scenario, mode, macro, rerunIndex) + `requestPause(reason)`; `run()` loops on `#nextQueued()`.
- `lib/results.js` `runSummary.pauseReason` (paused runs only) → Mac `ResultRunSummary.pauseReason` →
  `RunActivityProgress.pauseReason` → menu bar text + Continue (`RunStopping.resumeBatch`).

## Query Brief (D-160) — removed in D-172

- `lib/brief.js`: `VISUAL_TYPES` (truthTable, annotatedScreenshot, sequence, eventMatrix) + schemas in the prompt,
  `briefPrompt`, `parseBriefAnswer` / `validateVisual` (a broken answer never reaches the renderer; eventMatrix forces
  `source:"unknown"` → `isUnclear`), `chatSummary` (crux + `Q1 → @name: …` by role + unclear params),
  `pickBriefModel` (Haiku for short text-only, else Sonnet), `BriefStore` → `.data/briefs/<id>/brief.json` + `imgN.png|jpg`.
- `routes/briefs.js`: `GET/POST /api/briefs`, `GET/PATCH/DELETE /api/briefs/:id` (PATCH = title, query, stakeholders,
  links, pins only), `POST /api/briefs/:id/images` (raw image/png|jpeg ≤ 20 MB, ≤ 8 per brief), `GET …/images/:imageId`,
  `POST …/analyze {visualType?, model?}` (202 + job; one `claude -p` turn in the brief's folder, Read only),
  `PUT …/analysis` (a person's edit, validated), `GET …/summary` (chat text), `POST …/jira {issueKey, confirm:true}`
  (one comment via the Atlassian connector, Haiku, comment tools only). Writes `jiraPost {issueKey, state: posting|posted|error, message}` on the
  brief at start and finish; a successful post is also appended to `jira[]`.
- Mac app (`Sources/TestForge/Brief/`, sidebar **Brief ⌘B**): `BriefSectionViewModel` owns every server call
  (`BriefService` over `DashboardClient`, which gained `patch(path:json:)` and a raw `post(path:data:contentType:)`
  upload) and builds three section VMs — `BriefListViewModel`, `BriefEditorViewModel` (title, query, stakeholders,
  links, pins; tap a screenshot to drop the next number or letter at 0–1 coordinates), `BriefResultViewModel`
  (crux, asks, visual, share). Analyse saves unsaved edits first, then polls `GET /api/briefs/:id` every 2 s until
  the status leaves `analyzing`; Jira polls the same endpoint for `jiraPost`. `BriefImageStore` caches screenshots
  for the pin canvas and the annotated visual. `BriefCardView` is rendered both on screen and, via `ImageRenderer`
  at 900 pt × 2 on white (`BriefExportView`), as the PNG. Images come from a file panel or the clipboard
  (`BriefPasteboardReader`, re-encodes non-PNG/JPEG as PNG).

## Run bundles (D-162)

- `lib/run-bundle.js`: `buildBundle({run, cases, title, source, techDoc, deviceRules, root, thumbnails})` → bundle;
  `withLaterResults(runs, run)` (newest finished result per case from later runs with the same `codeId`);
  `inspectBundle(bundle, {root, currentCode})` → `{code, counts, credentials, macros|elements|mocks: [{action}], conflicts,
  warnings}`; `installBundle(bundle, {root, overwrite})` → plan + `written`; `codeMatch`; `bundleAsRun` (base for
  `compareRuns`); `BundleStore` (`.data/bundles/<runId>.json`, the whole bundle + `importedAt` + `replayRunIds`).
- Bundle JSON: `format`, `formatVersion` 1, `id` (source run id), `createdAt`, `title`, `source`, `techDoc`,
  `code {branch, codeId, commit, hasLocalChanges}`, `run {createdAt, mergedFrom, simulator, environment, costUsd}`,
  `cases` (loaded case objects), `items [{caseId, scenario, verdict, ranAs, macroId, macroName, isProven,
  credentials, costUsd, durationMs, summary, review, proofJpeg}]`, `macros` (schema v2, with `path`), `elements`
  (id → registry entry), `mocks` (NetworkLens rules, redacted, `isEnabled: false`), `warnings`.
- Routes (`routes/bundles.js`, registered after `/api/results`): `GET /api/results/:id/bundle` (download; `?proof=0`,
  `?merge=0`), `POST /api/results/:id/bundle {path}` (write to a path), `POST /api/bundles/inspect|import {path |
  bundle, overwrite}` (files ≤ 64 MB, `~` expanded), `GET /api/bundles`, `GET /api/bundles/:id`,
  `GET /api/bundles/:id/proof/:caseId.jpg`, `POST /api/bundles/:id/replay {caseIds?}` →
  `launchBatch({items, noClaude: true, bundleId})`, `GET /api/bundles/:id/compare?run=`.
- `launchBatch`: `noClaude` skips `followUp` (no triage, no learn); `bundleId` goes on the results record and
  `runSummary`. `GET /api/results/:id` adds `bundleTitle` and per-item `bundleVerdict` for a bundle replay.
- Mac: `Server/BundleService.swift` (`BundleActing`), `State/BundleModels.swift`, `Results/BundleImportViewModel.swift`
  (+ `BundleImportMapper`), `BundleImportSheetView`, `BundleImportSummaryView`, `ResultImportBundleBarView`,
  `ResultsBundleConstants.swift`; `ResultsSectionDependencies`; `DesktopActing.saveData(_:suggestedFileName:contentType:)`.

## Mock variant per case (D-163)

- `lib/mock-variants.js`: `matchVariant(exchange, rule)` → `{variants, match}` (`exact` · `size` · `failure` ·
  `exact+timing` / `size+timing` · `null`); `variantsServed(records, rules, {since, until})` → rows
  `{endpoint, variant, match, count, candidates?}` (rules for one endpoint merged); `variantsArmedBy(steps)`.
- `collectEvidence` adds `mocksUsed` (device session rules, only read when a mock was served).
- `buildBundle({…, traceRecords})`: item `mocksUsed` = evidence → trace window (`from: "trace"`) → macro (`match:
  "macro"`); endpoints from `mocksUsed` are bundled too. `inspectBundle` → `caseMocks [{caseId, hasMacro, mocks}]`.
- `POST /api/bundles/:id/cases/:caseId/arm` → `armMock` per variant; deps `traceRecords()`, `armMock`.
- Mac: `BundleCaseMocks`/`BundleCaseMock` (`State/BundleModels.swift`), `BundleActing.armCase`,
  `BundleCaseMockListView` + `BundleCaseMockRowView`, `BundleImportViewModel.armMocks(caseId:)`, `ResultEvidence.mocksUsed`.

## Demo videos (D-164)

- Notes: macro `demo = {title, checks, why, setup?, steps: {<top-level step id>: {en, id}}, writtenAt}`;
  `TestForgeMacros/mocks/notes.json` = `{<endpoint>: {<variant>: {en, id}}}`. `demoNotesPrompt` / `parseDemoNotes(text,
  stepIds, endpoints)` / `saveMacroNotes(path, notes)` / `mergeMockNotes(additions, {overwrite})`.
- Recording: `createDemoRecorder({fetchFrame, screen, holdMs})` — `begin()` at `simctl recordVideo` start;
  `onStepStart` frames actions (and `waitForGone`) then holds 1.5 s; `onStep` frames checks then holds 2.5 s;
  `timeline({…})` → `{schema 1, caseId, macroId, macroName, recordedAt, screen, verdict, languages, notes, mocks
  [{endpoint, variant, note}], events [{id, do, text, from, startMs, endMs, holdUntilMs?, ok, skipped, frame?}],
  video}`. Folder: `$TEST_FORGE_MEDIA_ROOT/demos/<case>-<iso>/` (`raw.mp4`, `timeline.json`, `demo-en|id.mp4|vtt`).
- Render: server runs `$TEST_FORGE_BINARY`, else `tools/mac-app/build/TestForge.app/…/TestForge`,
  else `/Applications/…`, with `--render-demo <folder>` (10 min timeout). `DemoScript`: intro 6 s (first frame held),
  trimmed recording (from 1.5 s before the first explained step), outro 4 s (last frame held); cues = explained
  top-level events (`from == nil`), min 2.5 s, cut at the next cue. `DemoPainter` draws each cue / card as a
  full-frame bitmap; `DemoOverlayBuilder` shows it via an opacity animation; 720 px, `AVAssetExportPresetMediumQuality`.

## Live explained overlay (D-165)

- Narration run gains `explain = {phase: intro|steps|result, title, checks, why, setup, focus, steps}`;
  `focus = {stepId, isRoutine, do, style: action|checking|step|passed|failed, frame, note {en,id}, text, at}`.
  Routine focus while `phase == intro` is ignored (the card covers setup). `end()` → `phase: result`.
- Replay-v2 `{explain}` (or `{demo}`): `explainRecorder(macro, jobId)` → `showExplainIntro` (6 s, 3 s without notes)
  → replay with the recorder's hooks; a demo also films (`startDemo(macro, say, recorder)`).
- Mac: `StepOverlayViewModel` starts tracking when the outline toggle is on or `ExplainOverlayMapper.activeRun` finds
  an explained run (running, or ended < 5 s ago) and stops itself after; `ExplainOverlayMapper.overlay` → card or
  caption (pointer mapped with `ScreenMapping`, subtitle on top when the pointer is in the lower 32 %).
- `--preview-explain <folder> [en|id]` → `<folder>/explain-preview-<lang>/NN-<state>.png`.

## Local test case edits (D-166)

- Store: `lib/case-edits.js` → `.data/case-edits.json` = `{ [source]: { [caseId]: { fields, original, editedAt } } }`.
  `fields` holds only fields that differ from the document; `original` is the document's text at edit time.
- `server.js` keeps `documentCases` (as loaded) and `loadedCases` = `applyCaseEdits(documentCases, edits[source])`.
  Everything that runs reads `loadedCases`. `acceptLoaded` first runs `separateCarriedEdits` (bundle cases arrive
  already edited, with `localEdit`) and stores carried edits that aren't stored yet.
- An edited case carries `localEdit = { fields, editedAt, original, isDocumentChanged }`; `testcaseView` sends it
  (null when unedited). `caseRowText` marks edited rows as overriding the document.
- Routes: `PUT /api/testcases/:id/edit {fields: {scenario?, precondition?, steps?, expected?, api?}}` (400 when no
  editable field or an empty scenario) and `DELETE /api/testcases/:id/edit`; both poke the `testcases` slice.
- Mac: `TestCaseDraft`, `EditTestCaseSheetView` + `EditTestCaseFieldView`, `TestCaseEditNoticeView`;
  `TestsSectionViewModel.beginEditingSelected / saveEdit / requestRevertSelected / confirmRevert`;
  `TestCaseService.saveEdit / revertEdit`; IDs in `Tests/TestsSectionConstants.swift` (`TestForge_Tests_Edit*`,
  `TestForge_Tests_EditSheet_*`, `TestForge_Tests_DocumentText_<field>`, `TestForge_Tests_Field_<field>`).

## Session export (D-173)

- `lib/session-export.js`: `buildSession({doc, history, runs, macros, demos, code})` is pure — per case: text fields,
  `localEdit`, `recording` (from `/api/macros` `testCases`), `latest` (newest `runs.json` record matching the case id or
  its macro id; a same-run batch review override replaces the verdict), `history`, `batchResults` (results store,
  `finalVerdict`), `media {screenshots, videos, demoVideos}`. `writeSessionExport(session, {target, includeMedia})`
  stages `<name>/session.json`, `report.md`, `media/<case>/…` in a temp dir and zips with `ditto -c -k --keepParent`.
  `listDemoRecordings(mediaRoot, languages)` reads `<TEST_FORGE_MEDIA_ROOT>/demos/*/timeline.json`.
- Routes (server.js): `GET /api/session/export` → `{fileName, summary, runs, mediaFiles, mediaBytes}`;
  `POST /api/session/export {path, includeMedia}` → `{path, bytes, cases, mediaFiles, mediaBytes, missingMedia}`.
  409 when no document is loaded.
- Mac: `SessionExportService` (`SessionExporting`), `SessionExportViewModel` (phases loading/ready/exporting/finished/
  failed; `DesktopActing.chooseSaveLocation` asks where, the server writes), `SessionExportSheetView` via
  `SessionExportSheetModifier` on the Tests section; header button `TestForge_Tests_ExportSessionButton`.

## Scan saved macros + Start/End recording (D-174)

- Server: `recordedMacros(macros, root)` / `recordedMacroSummary` in `lib/recorded-macro.js`;
  `GET /api/macros/v2/recorded` (declared before `/api/macros/v2/:id`).
- Mac: `MacroRecording` gained `listRecorded()` and `replay(macroId:)`. `FlowMapViewModel+Library.swift`:
  `MacroRecorderPhase` (`library | recording | review`, derived from `isRecording` and `recordedSteps`), `endRecording`
  (stop → `beginSaveMacro`), `didSave` (notice → `startNewMap` → reload list selecting the new id), discard confirm.
  `startRecording` calls `startNewMap` first when a map exists. Views: `FlowMapHeaderView` (Start/End; Save/Discard in
  review), `SavedMacrosLibraryView` (`HSplitView` of list + `SavedMacroDetailView`), `SavedMacroRowView`,
  `SavedMacroNoticeView`. Tutorial anchors `scanRecordButton`, `scanSavedMacros`.

## Tests layout (D-175)

- `TestsSectionView` uses `HSplitView`: list `listMinWidth…listMaxWidth` (240–720, ideal 340), inspector 220–560
  (ideal 280), detail min 280.

## Free space and reset (D-214)

- `lib/reset.js` `ITEMS` gains `swiftpm-settings` (`~/Library/org.swift.swiftpm`); `POST /api/reset {ids:[one]}` is a
  single-row delete. `clearRunnerScreenshots()` empties the QA simulator's `InternalDaemon/*/Attachments` (files only).
- `server.js`: `tasks.on("change")` notes newly finished test tasks (`TEST_KINDS`, `sweptTaskIds`) and runs
  `sweepRunnerScreenshotsWhenIdle` 5 s later; while a test, a multi-case run or a scan is going it retries every 60 s.
- Mac: `BuildCleanSectionView` removed (Build VM lost `cleanSizes`/`confirmClean`); `ResetSectionView` "Free space and
  reset" (anchor `buildCleanSection`), `ResetItemRowView(content: ResetItemRowContent, isSelected:onDelete:)` with size,
  switch and Delete…; `ResetSectionViewModel.requestDelete/confirmDelete/isDeleting/deletingIds/canDeleteOne`.
  `XcodeToolsService.clean` stays for Fix Swift package errors.

## Action feedback (D-213)

- Shared labels: `Views/ActionProgressLabel(title:busyTitle:isBusy:)` (text → spinner + busy text), `Views/BusyActionLabel`
  (a `Label` whose icon becomes a spinner; works under icon-only styles), `SimulatorControl/SimulatorActionLabel`.
- Each screen's view model records the running action instead of a bare busy Bool and guards re-entry: `BuildAction`
  (+ `isRunning`, `failureMessage(for:)` in `BuildSectionViewModel+Actions`), `TestCaseAction` + `TestCaseSheetStatus`
  (`TestsSectionViewModel+Actions`), `TestBatchActionState.working(TestBatchAction)/.failed(...)`, Get ready per-row
  `fixState(forRowId:)`, Run queue per-row requests, `ResultsActionFeedback`, `SimulatorCardActivity`
  (`SimulatorControlViewModel+Actions`, `SimulatorCardActivityView`), Network `runningAction`, `ClaudeRequestStates`.
- Sheets (Edit, Override, Run all, Start Test Batch, Override verdict) close only on success; errors show inside.
- Identifiers: `App/TestForgeConstants+Feedback{,GetReady,Tests,Review,Device}.swift`.

## Paused Test Batch (D-212)

- `lib/test-batches.js`: status `active` → `paused` ⇄ `active` → `ended`. `pause(id)` (active only) sets `pausedAt`, appends
  `pauses[{at}]`; `resume(id)` (paused only, refuses over another active) stamps `resumedAt`, clears `pausedAt`, moves it
  to the top, recreates the folder. `end` accepts active or paused (stamps the open pause `endedAt`); `remove` only ended;
  `reopen` refuses a paused one. `attach` and `mediaDir` follow `active` only, so a paused batch collects nothing.
  `view()` adds `paused` (newest pause first).
- `routes/test-batches.js`: `POST /:id/pause`, `POST /:id/resume` (pauses the other active one first), `POST /` with
  `pauseActive`, reopen pauses instead of ending; all refused while a test or a run of several cases (`isRunQueueBusy`
  from `server.js activeBatch`) is going. Report: "Paused since …", "Paused: N time(s)". `server.js` replay route pauses.
- `lib/readiness.js testBatchChecks({..., paused})`: idle detail names the paused batch(es).
- Mac: `TestBatchStatus`, `TestBatchSummary.status/pausedAt/pauseCount`, `TestBatchSnapshot.pausedBatches`;
  `TestBatchActing.start(name:isPausingActive:)`, `pause`, `resume`; `TestBatchViewModel.pause()/resume(batch:)/startNote`;
  pill menu Pause / Start another / Resume ▸; `TestBatchPausedListView` in the start sheet; Reports › Batches row icon
  and header buttons per status (`BatchReportsViewModel.pauseSelected/resumeSelected`). `test-forge batch pause|resume`.

## Reopen Test Batch (D-184)

- `lib/test-batches.js reopen(id)`: refuses an unknown/active batch or while another is active; recreates the folder,
  sets `status: active`, appends `reopenedAt`, clears `endedAt`, moves it to the top, saves (re-applies `TEST_FORGE_MEDIA_ROOT`).
- `routes/test-batches.js`: `POST /api/test-batches/:id/reopen` → ends the other active batch (with report) first →
  `{batch, ended}`; refused while a test runs.
- Mac: `TestBatchSnapshot.endedBatches` (from `batches`), `TestBatchSummary.isActive/endedAt`,
  `TestBatchActing.reopen`, `TestBatchViewModel.requestReopen/confirmReopen`, menu in `TestBatchToolbarView`;
  constants in `TestBatch/TestBatchConstants.swift`.

## Proof media panel (D-183)

- Server: `caseProofFiles(folder, caseId)` in `lib/case-proof.js`; `GET /api/testcases/:id/media` → `{files: [{path, kind,
  modifiedAt}]}` (404 for an unknown case).
- Mac `Tests/Media/`: `TestCaseMediaViewModel` (owned by `TestsSectionViewModel.media`, reloads from `refreshMedia()` on a
  case or proof-count change), `TestCaseMediaPanelView` (in `TestCaseDetailView`), `AnnotationCanvasView`,
  `AnnotationToolbarView`, `ImageAnnotation` (tool, colour, stroke in 0…1 coordinates), `AnnotationRenderer` (CGContext
  at pixel size; JPEG or PNG by extension), `AnnotatedImageStore` (`-annotated[-N]` copy names, atomic writes),
  `TestCaseMediaList` (decoder). Reuses `ProofImageView`, `ProofVideoView`, `ProofThumbnailStripView`. IDs `TestForge_Tests_Media_*`.

## Proof indicators (D-182)

- `lib/case-proof.js`: `caseProof(folder, caseIds)` → `{ [caseId]: {screenshots, videos} }` from
  `TEST_FORGE_MEDIA_ROOT/<id>/` and `TEST_FORGE_MEDIA_ROOT/<PREFIX>-0<id>[-x]/`; skips `demos`, `failures`, probe shots.
- `testcases` slice passes `proof` to `testcaseView` → each case `proof`. Mac: `TestCaseProof`, `TestCaseProofBadge`
  (mapper `proofBadges`), `TestCaseProofBadgeView` in `TestCaseRowView`.

## Bundle import merge (D-181)

- `routes/bundles.js` import calls `deps.acceptImported(bundle)` → `{mode, added}`, returned as `cases` in the response.
- `server.js acceptImported`: same document (source, title, or `bundle:<title>`) → `storeCarried(loadedSource, …)` +
  `mergeImportedCases(documentCases, …)` + save + poke; else `acceptLoaded("bundle:<title>", …)`. `storeCarried` is the
  edits/override-history half of `acceptLoaded`, shared.
- Mac: `BundlePreview.caseImport` (`BundleCaseImport {isMerged, addedCount}`) → "Test document" fact.

## Result overrides (D-180)

- Store: `lib/result-overrides.js` → `.data/result-overrides.json` = `{ [source]: { [caseId]: [ {verdict,
  previousVerdict, reason, leniency, at} ] } }`, oldest first, append-only (`append`, `merge` for imports).
- `server.js`: `applyLocalEdits` lays `resultOverrides` on `loadedCases`; `acceptLoaded` runs
  `separateCarriedOverrides` before `separateCarriedEdits` and merges carried history.
- `PUT /api/testcases/:id/result {verdict, reason, leniency?, expected?, rerun?, model?}` → 400 without a reason or a
  known verdict; `expected` that differs is saved through `mergeCaseEdit`; `rerun` (guarded like a Claude run) calls
  `enqueueTestForgeRun` and returns `{jobId, taskId}`.
- `enqueueTestForgeRun` adds `reviewerNotesText(testCase.resultOverrides)` after the case row.
- `testcaseView`: `effectiveResult(history, lastRun)` — the newest override wins when at least as new as the run;
  `lastRun.override` + `resultOverrides` go to the Mac. `buildSession` does the same and adds `summary.overridden`;
  `session-report.js` prints "Result changes".
- Mac: `State/TestCaseResultOverride.swift`, `Tests/ResultOverrideDraft.swift` (`CaseResultOverride*`),
  `OverrideResultSheetView`, `ResultOverrideHistoryRowView`; `TestsSectionViewModel.beginOverrideSelected /
  saveOverride(draft:shouldRerun:)`; `TestCaseService.overrideResult`; IDs `TestForge_Tests_OverrideSheet_*`,
  `TestForge_Tests_OverrideResultButton`, `TestForge_Tests_OverrideNote`.

## Demo library (D-177)

- Data: existing `GET /api/demo/recordings` (routes/demo.js) — `{recordings: [{folder, caseId, macroName, verdict,
  recordedAt, videos: {en, id}, subtitles}]}`, newest first. No server change.
- Mac: `Server/DemoLibraryService.swift` (`DemoLibraryListing`), `Demo/Library/`: `DemoRecording` (+ `DemoRecordingList`,
  id = folder, videos keyed by `DemoLanguage`), `DemoLibraryViewModel` (@MainActor; one `AVPlayer`; language change =
  `replaceCurrentItem` + seek to the same time, keeps playing; falls back to the language the demo has),
  `DemoLibraryView` (HSplitView list 260–560 pt | player), `DemoRecordingRowView`, `DemoPlayerPaneView` (AVKit
  `VideoPlayer`), `DemoLibraryConstants`.
- D-179: `DemoLibraryViewModel.selectedId` (List selection) opens the demo paused; `isPlaying` follows the player's
  `timeControlStatus` (KVO); `DemoPlayOverlayView` covers the paused video.
- D-178: the player is `DemoVideoPlayerView` (`AVPlayerView`, `.floating` controls, `showsFullScreenToggleButton`).
  `DemoRenderer` exports `AVAssetExportPresetHighestQuality` at `outputWidth = 1080` (narrower recordings keep
  their width; dimensions rounded down to even). `ReportsMode.demos`; pauses when the tab is left.

## Test session report (D-176)

- `lib/session-report.js`: `sessionMarkdown(session, {imagePath})` (`imagePath(file)` → path or null; the viewer route
  passes `file://<abs>`, the zip `file.file`), `sessionConfluenceHtml(session)` (escaped plain HTML, no macros/images),
  `sessionReportTitle`, `verdictLabel`, `IMAGES_PER_CASE = 4`.
- Routes: `GET /api/session/report.md` (text/markdown, `X-Report-Title`), `GET /api/session/report.html`,
  `POST /api/session/publish` → writes `.data/reports/session-<ms>.confluence.html`, enqueues a `claude` task (model
  sonnet) whose prompt creates one child page of `REPORT_PARENT_PAGE`; returns `{taskId, title}`. All 409 without a
  loaded document.
- Mac: `SessionReportService` (`SessionReporting`), `SessionReportViewModel` (`@MainActor`; parses off the main actor),
  `SessionReportView` in `ReportsSectionView` behind a `ReportsMode` picker (`session | runs`). Viewer:
  `MarkdownParser` → `[MarkdownBlockItem]` → `MarkdownView` / `MarkdownBlockView` / `MarkdownTableView` /
  `MarkdownImageView` / `MarkdownInlineText`; constants in `MarkdownConstants`, `ReportsConstants`.


## Replay start and busy banner (D-185, D-186)

- `replayMacroV2` keeps a per-pass `createScreenMemo()`: guard answers (`unless`) and optional misses, cleared whenever a
  step acts on the app. Guard look `GUARD_PROBE_S` = 1 s, `RELAUNCH_GUARD_PROBE_S` = 2 s.
- `flattenSteps` tags routine steps with `from` (id trail) and `routineName` (outermost routine).
- Narrator: `busy(key, message)` and `busyMessage(step)`; `run.busy = {message, since}` in the narration slice.
  `replay-v2` sets it for runner readiness and preconditions; precondition routine steps are re-tagged `from:
  "precondition"` with the precondition's label.
- Mac: `StepOverlayContent.busy(StepBusyOverlay)` for plain replays (only when Accessibility is trusted);
  `ExplainConnectorView` (from the subtitle tail's tip, D-207). Explained replays draw no busy banner (D-206): the message shows
  in Tests › live steps › System prep (`LivePrepModel` from `TestsSectionMapper.prep`; the view model keeps the run's
  earlier messages, last 6).
- `requires.startScreen` → `reachStartScreen` in `lib/preconditions.js` (deps `isAppRunning`, `runsRoutineFirst`);
  `caseSetup(requires)` in `lib/testcase-view.js` → `macro.setup {startScreen, needs}` → Tests detail.

## Main window width (D-209, D-210)

- `TestForgeViewModel.windowMinWidth` ← `windowMinWidthUpdates` (`TestsSectionViewModel.isListPresented`,
  `isInspectorPresented`) → `TestForgePanes.windowMinWidth`: 880 (1240 − 2 × sidebar 180) − 240 (list) − 220 (live
  steps), floor 480. Applied as the main `Window` content's `minWidth`. The sidebar is not an input: its toolbar button
  does not update `sidebarVisibility`, and the split view keeps the sidebar's own width while it is shown.
- `TestDocumentHeaderView`: title block, then the action row in a `ViewThatFits` (titles + icons, else icons only).

## Explained subtitle placement (D-207)

- `ExplainOverlayMapper.caption` → `ExplainCaptionPlacer.placement(inputs:)` with the text, the pointer's
  `outlineRect`, its `badgeFrame` (to avoid) and the screen size → `ExplainCaptionPlacement {frame, tail?}`.
- Box size from `NSString.boundingRect` at the subtitle font (semibold, `Caption.fontShare` of width), max
  `Caption.maxWidthShare`; side spots re-measure at the room beside the element.
- Safe area: `marginShare` sides, `topInsetShare` top, `bottomInsetShare` bottom. Gap to the element `gapShare`; tail
  `tailLengthShare` × `tailHalfWidthShare`, kept clear of the corner radius.
- Order: vertical (more room first) → sides (wider first, ≥ `minSideWidthShare`) → fallback top/bottom by least overlap.
- Views: `ExplainCaptionView` (frame + offset), `ExplainCalloutShape` (one path: rounded rect + tail), stroke in the
  pointer color; `.animation(easeInOut, moveSeconds)` on the caption layer.
