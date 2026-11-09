# NetworkLens console in TestForge — analysis and recommendation (D-125)

_2026-10-16 · user's item 2: "drive the entire network interceptor from our app … without ever needing the user to
open the network interceptor UI on the app during testing … read the data as well as project changes, mocks, packs into
the simulator … reduce MCP dependency and use scripts instead if possible."_

## 1. What exists today

| Layer | Where | What it can do |
|---|---|---|
| **In-app NetworkLens** (QA fork, `~/Projects/Tools/NetworkInterceptor-qa`) | the app on the simulator | Traffic list, mock rules with named variants, scenarios + packs, **breakpoints** (hold a request/response, edit, resume), **replay** a captured request, **curl export**, redaction, screen attribution (`ScreenContext`), a floating bubble (position in app defaults `com.networklens.bubble.x/y`) |
| **Files in the app container** | `session.json`, trace | Rules/scenarios (read at launch), every exchange (read by anyone with simctl access) |
| **Live control channel** | app polls `http://127.0.0.1:8788` every 2 s | 7 verbs: `state`, `arm`, `disarm`, `variant`, `scenario` (imports a pack), `edit` (upsert/remove whole rules, master switch), `export`. Nothing for breakpoints, replay or the bubble |
| **networklens MCP** (`tools/networklens-mcp`, 30 `lens_*` tools) | spawned by Claude | Everything above for Claude, plus helpers: mock from a captured call, body/script edits, diff, duplicates, stats, trackers, journeys, **Android** (`android.js`, `NETWORKLENS_ANDROID_PACKAGE`) |
| **QA dashboard** (`lib/{session,variants,trace,container,redact,control,control-queue}.js` = copies of the MCP's `dist`) | :4545 | Rules list, master switch, activate variant, enable/disable, delete, pack import/export, trace + bodies — **already without MCP** |
| **Mac app › Network Mocks** | TestForge | Master switch, rule on/off, variant picker, decoded answer body, recent calls |

**Observations**
- The engine is shared already: the dashboard runs the same JS as the MCP. MCP is only the *wrapper* Claude uses.
- **Port race:** whichever process starts first owns the control queue on 8788 (the MCP server or the dashboard); the
  other talks HTTP to it. Two writers, one queue, no owner — fragile.
- **Gaps in the TestForge:** no "mock this call", no body editor, no scenarios, no breakpoints, no replay/curl, no
  trackers view, no diff, no health of the live channel, no control of the bubble (which blocked SF-024's carousel
  arrow on 2026-10-16).
- Breakpoints/replay/bubble need **new verbs in the QA fork**; everything else is TestForge + dashboard work.

## 2. Recommended architecture — one engine, three front ends

```
             ┌──────────── TestForge (Mac) ─ Network console ────────────┐
             │  live traffic · rules/variants · body editor · scenarios ·  │
             │  breakpoints · replay/curl · trackers · health               │
             └───────────────────────────┬──────────────────────────────────┘
                                         │ HTTP /api/lens/*  (+ SSE "lens" slice)
  scripts/CI ── test-forge-lens CLI ───────────►│
  Claude ─────── test-forge-lens CLI (Bash) ───►│◄── networklens MCP (optional, thin: forwards to /api/lens)
                                         │
                            QA dashboard = the only engine + the only queue owner (8788)
                                         │ files (session.json, trace) + control queue
                                         ▼
                              NetworkLens in the app (QA fork)
```

1. **The dashboard owns the control queue, always.** It binds 8788 at start; the MCP (when used) is configured with
   `NETWORKLENS_SIDECAR=http://127.0.0.1:8788` so it never hosts its own. One writer, no race.
2. **`/api/lens/*` becomes the single API** (superset of today's `/api/mocks`, `/api/trace`): state, rules, variants,
   body edits, scenarios, packs, trace + search, curl, diff, trackers, breakpoints, replay, bubble. The Mac console and
   the web page use it.
3. **Reduce MCP dependency with a script, not more tools:** `tools/test-forge-server/scripts/test-forge-lens` (Node, no deps) —
   `test-forge-lens state`, `test-forge-lens mock "GET /flashsale" --variant empty`, `test-forge-lens scenario apply sf061`,
   `test-forge-lens trace --since 2m --grep range`, `test-forge-lens curl <id>`, `test-forge-lens pack import <file>` … Same verbs as the
   API, JSON out. Uses:
   - **Claude runs** call it through Bash — one allowed command instead of 30 MCP tool schemas in every session's
     context (cheaper, fewer moving parts, and the dashboard's device lock/run log see every change).
   - **Replays/macros** keep their `mock` steps (already direct, no MCP).
   - **CI / a teammate's terminal** gets the same control without Claude.
   - The MCP stays only for people using Claude Code outside the TestForge; it becomes a thin forwarder.
4. **Changes land live when the app runs, in `session.json` when it doesn't** — the console shows which ("live" /
   "on next launch") per change, so nobody wonders why the screen didn't change.

## 3. The Network console (Mac app) — recommended features

| # | Feature | Why it matters for QA | Needs |
|---|---|---|---|
| 1 | **Live traffic** — streaming list, filters (host, status, method, screen), search in bodies, Mocked/Real badge, timing | See what the screen did while you tap; "which call fills this section?" | dashboard SSE slice from the trace |
| 2 | **Mock this call** — from any captured response: keep the real body as a variant, then edit | Fastest way to a reliable fixture; no hand-written JSON | `lens_mock_endpoint` logic → API |
| 3 | **Body editor** — JSON tree/text, validate, status code, headers, delay, fail (timeout/offline) | Empty lists, long names, nulls, 500s, slow — the edge cases QA files bugs about | `edit` verb (exists) |
| 4 | **Scenarios** — save the current set of variants as a named scenario ("Flash Sale empty", "SF-061 ends in 20 s"), apply in one click, store in the repo pack | Repeatable states shared with the team and used by replays | `scenario` verb (exists) + pack files |
| 5 | **Time-shift for schedules** — "starts in 20 s / ends in 30 s" on any time fields (`retime` already used by macros) | Flash Sale/countdown cases without waiting real time | dashboard retime (exists) |
| 6 | **Breakpoints** — hold a request or response, edit it, resume or fail it | Exploratory testing of one-off states without writing a mock | **new fork verbs** `breakpoint.add/remove/resume`, held list in `state` |
| 7 | **Replay + curl** — resend a captured request; copy as curl for backend devs | Reproductions leave the device | **new fork verb** `replay`; curl = existing `CurlExport` logic (port to JS or verb) |
| 8 | **Trackers** — analytics events from the trace, checked against an expected contract | Tracker QA without a second tool | `lens_trackers` logic → API |
| 9 | **Health strip** — app connected (last poll < 3 s), mocks on/off, rules armed, live vs next launch | Explains "why didn't it change" at a glance | poll timestamps in the queue |
| 10 | **Bubble control** — move to a safe corner or hide during tests | The bubble blocked SF-024's carousel arrow | now: write `com.networklens.bubble.x/y` before a run; later: fork verb `ui.bubble hide/show` |
| 11 | **Guardrails** — "mocks still armed" warning after a run, diff live rules vs repo pack, reset to pack | Leftover mocks are the classic false bug | dashboard |
| 12 | **Android later** — the same console against the Android lens (MCP already has `android.js`) | One tool for both apps (item 5) | path resolution from `android.js` |

## 4. Phases

| Phase | Scope | Size | Depends on |
|---|---|---|---|
| **A** | Dashboard owns 8788 + `/api/lens/*` + `test-forge-lens` CLI; Claude runs use the CLI (MCP optional) | M | — |
| **B** | Console v1: live traffic, mock this call, body editor, scenarios, health, time-shift, guardrails | L | A |
| **C** | Bubble out of the way before runs (defaults now) | S | — (do first, it unblocks SF-024) |
| **D** | Fork verbs: breakpoints, replay, `ui.bubble`; console v2 | L | QA fork tag + rebuild |
| **E** | Trackers view; Android lens | M | A |

**Recommended order:** C (quick unblock) → A → B → E → D.
