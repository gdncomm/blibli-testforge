# Feasibility study — TestForgeDriver macros with element IDs + a prompt section

_Written 2026-10-08. Design only — development is paused (D-031). Facts below were checked against
the code; file references are given so they can be re-verified._

## 1. The ask

Use TestForgeDriver to validate **user flows**, **bug-fix verification** and **repetitive routines** by
building **macros**:

- every element a macro touches gets a **uniquely generated ID**;
- that ID maps to the element's **accessibility (a11y) locator chain** and the **TestForgeDriver commands**
  used on it, so a macro can be **repeated quickly**;
- a **prompt section** in the TestForge lets a user describe in plain words what the driver should
  check, and Claude does it — producing a macro that can be replayed later.

## 2. Verdict

**Feasible — recommended, in phases.** About half of it already exists:

- TestForgeDriver already has a macro recorder and replayer (`/test-forge-macro`, `macro_cli.py`) and the
  dashboard already has a deterministic, no-LLM **⚡ Replay** (`lib/macro.js`).
- What's missing is exactly what makes macros robust: **element IDs + locator chains**, **assertion
  steps**, a **structured screen snapshot**, and a **replay path that doesn't depend on a Claude
  session being open**.

The biggest risks are not technical difficulty but **app-side a11y coverage** (uneven — some areas
have almost no identifiers) and **test-data determinism** (real servers, timers, login state).
Both are manageable, but they decide how much of the app macros can cover reliably.

## 3. What exists today

| Piece | Where | State |
|---|---|---|
| Element targeting | TestForgeDriver runner: exact `accessibilityIdentifier` + optional `elementType` (14 types) + `index`; `tapByLabel` (`==`, `CONTAINS`, `BEGINSWITH`) | ✅ works; **no ancestor/container scoping, no predicates, no coordinates** |
| Transport | XCUITest runner polls an HTTP queue on `127.0.0.1:8789`, hosted inside the test-forge-driver MCP process (`mcp/test-forge-driver-mcp/src/queue.ts`) | ✅ but the queue only exists while a Claude session's MCP is up |
| Macro recording | `/test-forge-macro` + `macro_cli.py record-step`: Claude's real MCP calls are logged; saved as `<UITestRoot>/<Module>/<Submodule>/macros/<slug>.json` `{schemaVersion:1, name, steps:[{kind,…}]}` | ✅ exists; **no IDs, no locator chains, no per-step assertions**; no macros recorded yet |
| Macro replay | Dashboard `replay` executor → `lib/macro.js replayMacro` posts each step, stops at first `error`/`found:false`/`hittable:false` | ✅ deterministic, no LLM; verdict is only "driver-level PASS" |
| Screen dump | `test_forge_dump_tree` → `XCUIElement.debugDescription` **text**, cut at **20,000 chars**; ancestry only via indentation | ⚠ truncation is the *normal* case on rich screens; no `hittable`/`enabled` fields |
| Assertions | exists / not-exists / wait, `getLabel`, `getLabels` (≤200, needs a container), `getElementCount`, `getFrame`, `assertSpacing`, screenshot | ✅ mostly; label/count comparisons happen caller-side; **`assertSpacing` is missing from the in-repo TestForgeDriverKit copy the app actually builds** |
| Network checks | NetworkLens trace (`lib/trace.js`), `check_network_trail.py`, test-forge-mock tools | ✅ exists |
| Static a11y map | `scan_identifiers.py`, `a11y_map.py`, `scan_mode.py` (per-screen a11y surface) | ✅ exists |

**App a11y coverage** (5,854 Swift files; `setAccessibilityIdentifier(` 2,169 · `accessibilityIdentifier(` 663 · `.accessibilityIdentifier =` 325):

| Area | ID sites | Files with IDs | Macro-readiness |
|---|---|---|---|
| PDP | 404 | 117 / 477 | good |
| Search | 282 | 99 / 425 | good |
| Cart | 141 | 38 / 168 | good |
| Checkout | 104 | 28 / 113 | good |
| Flash Sale revamp | 48 | 19 / 125 | partial |
| PDP revamp | 38 | 18 / 86 | partial |
| Engagement / Home | 1 | 1 / 34 | **poor — label fallback only** |
| TradeIn checkout | 0 | 0 / 50 | **poor** |

Conventions exist (per-feature enums like `FSAccessibilityIdentifier`, `"FS_NavBarShareButton"`), but
`setAccessibilityIdentifier(with:ignoreSubviews:)` defaults to collapsing subtrees, and merged SwiftUI
containers report welded IDs (`X-X-X`). WebViews (48 files) are not reachable by XCUITest identifiers.

## 4. Proposed design

### 4.1 Element registry (the "IDs")

One registry per app (`.data/elements.json` → later committed next to the UI tests). Each entry:

```json
{
  "id": "el_01J9ZK7Q3M",                     // generated once, never reused, never derived from content
  "alias": "FS.ScheduleTab.Tomorrow",         // human name, editable
  "screen": "FlashSale",                      // screen fingerprint name
  "locator": {                                // tried in order until one resolves to exactly 1 hittable element
    "chain": [
      { "identifier": "FS_ScheduleTabBar", "type": "other" },
      { "identifier": "FS_ScheduleTab", "type": "button", "index": 1 }
    ],
    "fallbacks": [
      { "label": "Besok", "match": "==", "type": "button" },
      { "label": "Tomorrow", "match": "==", "type": "button" }
    ]
  },
  "lastSeen": { "frame": [140, 212, 96, 36], "build": "a1b2c3d", "at": "2026-10-08T12:41:00Z" },
  "quality": "identifier"                     // identifier | label | weak  (drives the coverage report)
}
```

Why a **generated** ID and not the a11y identifier itself: identity must survive locator repair.
When the app renames `FS_ScheduleTab`, only this entry's locator changes; every macro that uses
`el_01J9ZK7Q3M` is fixed at once. That is the main payoff of the ID layer.

### 4.2 Macro (steps reference element IDs)

```json
{
  "id": "mc_01J9ZM2V8D", "name": "SF-084 · Tomorrow tab must not freeze",
  "kind": "bug-verify",                       // flow | bug-verify | routine
  "links": { "ticket": "IOS-46xxx", "testCase": "SF-084" },
  "preconditions": [ { "run": "mc_login_test_user" }, { "mocks": "fs-pilot" } ],
  "steps": [
    { "id": "st_1", "do": "openDeeplink", "url": "blibli://flashsale" },
    { "id": "st_2", "do": "waitFor", "el": "el_01J9ZK0A1B", "timeout": 10 },
    { "id": "st_3", "do": "tap", "el": "el_01J9ZK7Q3M" },
    { "id": "st_4", "do": "assert", "el": "el_01J9ZK9C2D", "exists": true, "within": 5 },
    { "id": "st_5", "do": "screenshot", "name": "after-tomorrow" }
  ]
}
```

- **Routines** are macros called from other macros (`"run": "mc_…"`) — login, add to cart, open a
  screen. This is how repetitive work collapses to one line.
- **Bug-verify** macros carry the repro steps **plus an assertion that the bug is gone**, linked to
  the ticket; re-running them on each build is a regression check for free.
- Assertions become first-class steps (exists, label equals, count, frame/spacing, network call
  made/not made via NetworkLens).

### 4.3 Three modes

| Mode | Who drives | Cost | When |
|---|---|---|---|
| **Author** (prompt) | Claude, via TestForgeDriver | LLM tokens, minutes | New flow, new bug, first time |
| **Replay** | Dashboard posts steps directly to the runner — **no LLM** | ~1–2 s/step, free | Every repeat |
| **Heal** | Claude, only for the failing step | small | A locator stopped resolving |

**Authoring** — the user writes a prompt; Claude drives the app. Each successful command is recorded
(as `/test-forge-macro` does today) **plus** a scoped snapshot around the touched element, from which the
host builds the locator chain, registers or reuses an element ID, and writes the step. At the end
the user reviews a readable step list, renames aliases, and saves.

**Replay** — deterministic. Each step resolves its element via the chain → fallbacks. Result per
step: ✓ / ✗ with screenshot. No adjudication needed for asserted steps; un-asserted macros still
end "driver-level PASS" as today.

**Heal** — when a step's element no longer resolves, Claude gets the stored chain, `lastSeen`, and
the current snapshot, and proposes a new locator. The user approves → the registry entry is updated
→ every macro using that element is fixed. Never auto-applied silently.

### 4.4 The prompt section (prototype addition)

A **"Ask the driver"** card on the Test Cases tab (and on the device rail):

- **What do you want to check?** free text, e.g. *"Open Flash Sale, tap the Tomorrow tab and make
  sure the app doesn't freeze"* or *"Verify IOS-46xxx is fixed"*.
- **Kind**: Check a flow · Verify a bug fix (asks for the ticket; Claude reads it via Atlassian) ·
  Build a routine.
- **Start from** (optional): an existing routine, e.g. *Login as test user*.
- Uses the same three questions above it (code + device) — the prompt replaces question 2 (*Which
  tests?*) for ad-hoc work.
- Output: verdict + evidence like any run, and **"Save as macro"** with the recorded steps listed in
  plain words (*"Tap 'Tomorrow' tab · Check 'Flash Sale list' appears within 5 s"*).
- Saved macros appear in a **Macros** list with **▶ Replay**, last result, element-quality badge
  (*"9/10 steps anchored on IDs"*).

## 5. Gaps to close (and where)

| # | Gap | Fix | Where | Size |
|---|---|---|---|---|
| G1 | Replay needs a Claude session for the `:8789` queue to exist; dashboard and MCP would fight over the port | One owner: the **dashboard hosts the queue** (port of `queue.ts`), the test-forge-driver MCP is pointed at it | dashboard + plugin config | M |
| G2 | `dumpTree` is truncated text | New runner command **`snapshot`**: JSON nodes `{type, identifier, label, value, frame, hittable, enabled, children}`, scoped to a subtree, paged — no 20k cut | TestForgeDriverKit (blibli-utility) | M |
| G3 | No chain targeting | New runner command **`resolve`** / `target.chain` on tap/type/assert: descend from ancestor identifiers, then type + index | TestForgeDriverKit | M |
| G4 | Assertions not in macro schema | `schemaVersion: 2` with `assert` steps, element refs, preconditions, `run` | `macro_cli.py`, `lib/macro.js` | S |
| G5 | `openDeeplink`, recording are host-side, not runner commands | Replay engine executes them on the host (simctl) in order | `lib/macro.js` | S |
| G6 | In-repo TestForgeDriverKit lags the source (no `assertSpacing`) | Sync the package copy; add a version handshake in `/health` | app repo | S |
| G7 | Session-killing XCTest exceptions | Restart harness and **resume from the failed step** (preconditions re-run) | replay engine | S |
| G8 | Element registry, IDs, heal flow, UI | New | dashboard | M–L |

G2 and G3 change TestForgeDriverKit, which lives in `blibli-utility` — needs that repo's owner on board.

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Low a11y coverage** in some areas (Home 1/34 files, TradeIn 0/50) | Label-only locators break on copy/language change | Per-macro coverage badge; label fallbacks in both languages; feed missing IDs to devs as a backlog (`scan_identifiers.py` can list them) |
| **Non-deterministic data** (live servers, countdowns, A/B flags, login) | Flaky replays that look like bugs | Preconditions: NetworkLens mocks, fixed test account routine, relaunch with clean state; freeze clock where needed |
| Welded SwiftUI IDs, `ignoreSubviews` collapse | Elements unreachable by ID | Chain + index; flag in coverage report; fix at source over time |
| WebViews | Not addressable | Out of scope; mark steps "manual" |
| XCUITest waits for idle | Can't observe mid-animation states | Accept; assert end states |
| Runner changes in another repo | Schedule dependency | Do G1/G4/G5/G7 first (dashboard-only) — useful even without G2/G3 |

## 7. Recommended plan (after the v3 sign-off gate)

| Phase | Delivers | Depends on |
|---|---|---|
| **M0 — spike (2–3 days)** | Record & replay *one* bug-verify macro end to end on Flash Sale: SF-084 *"Tomorrow tab must not freeze"*. Dashboard-hosted queue (G1), host-side deeplink (G5), assert step (G4). Measure replay time and pass rate over 20 replays. | — |
| M1 | Macro schema v2, element registry with generated IDs, chains built host-side from **identifier-bearing** elements only | M0 |
| M2 | Runner `snapshot` + chain targeting (G2, G3), package sync (G6) | blibli-utility owner |
| M3 | Prompt section ("Ask the driver") + Save as macro + Macros list with ▶ Replay | M1 |
| M4 | Heal flow (Claude proposes, user approves, registry updates) + coverage report | M2 |
| M5 | Routines/preconditions, run macros as part of the 3-question flow and saved setups | M3 |

**Go/no-go criteria for M0:** ≥ 95% of 20 replays pass on an unchanged build; ≤ 2 s per step;
replay works with no Claude session open; the SF-084 macro fails on a build with the bug and passes
on one with the fix.

## 8. Decisions (answered by the user 2026-10-08 — D-038)

1. **Storage — in the app repository, never in the app bundle.** Macros live next to the UI tests:
   `BlibliMobile-iOS/BlibliMobile_XCUITest/<Module>/<Submodule>/macros/<slug>.json` (the existing
   `/test-forge-macro` convention); the element registry at `BlibliMobile_XCUITest/TestForgeMacros/elements.json`.
   `BlibliMobile_XCUITest` is a classic Xcode group (not a synchronized folder), so files saved there
   are not target members; a check must keep it that way (no pbxproj reference to `macros/` or
   `TestForgeMacros/`).
2. **TestForgeDriverKit changes — yes**, in blibli-utility on `darshan/innovation/test-forge-driver` with new
   `test-forge-driver-N` tags (as `-2` for `assertSpacing`). They merge to `develop` together with the
   rest of the code only **after complete end-to-end testing across multiple modules**.
3. **Jira — yes, for bug-fix validation.** A **Load Jira** button in *Verify a bug fix* mode, which
   **accepts only Bug tickets** (anything else is rejected with a plain explanation; read-only).
4. **Human review — yes, always.** Before saving, the user sees a **visual map of the macro** (steps
   grouped by screen, a mini phone per step with the target element highlighted, by-ID vs by-text
   marked) and must confirm it. The map is also available for every saved macro.
