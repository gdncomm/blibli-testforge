---
name: test-flow-recorder
description: Runs a manual QA test case live against a booted device by driving both the screen and the network layer over MCP, from a code reference (screen/component/controller file) plus a test-case document. Also known as "test-forge". Use for "test-forge", "run this test case", "automate this manual test case", "drive the simulator", "QA automation for this flow", "automate this Confluence test case", "build a QA test from this test case", "regression test for X screen", "sanity test suite for X screen", "screenshot-verify this flow", "generate UI test coverage", "generate an e2e test", "write an XCUITest for X screen", "turn this test case into an automated test", "tap/scroll/assert on the simulator". Accepts pasted plain-English steps or a linked Confluence page as the test-case source. Drives screen actions through `mcp__test-forge-driver__*` (a persistent XCUITest harness, built once) and mock state through `mcp__networklens__*` (including importing existing `.networklens-pack.json` scenario packs), so a new test case costs a command plan rather than a rebuild. Produces per-step screenshots and a run report under a `Module/Submodule` folder in the project's UI test root. Never writes `session.json` itself — a rule a pack does not already cover is authored through `mcp__networklens__lens_mock_endpoint` and validated by `preflight.py`'s rule-schema gate before install. Also validates analytics trackers against the same trace a run reasons about (`scripts/extract_trackers.py` — see "Tracker validation" below), absorbed rather than delegated. Distinct from `networklens-setup` (installs/repairs the NetworkLens interceptor itself) — do not reach for this skill for that; route it there instead.
argument-hint: [code-reference file path] [test-case: pasted steps or Confluence URL]
---

# Test Flow Recorder — running a test case live, on any platform

Takes a code reference (the screen/component/controller a flow lives in) plus a test-case document
(pasted plain-English steps, or a linked Confluence page) and **runs it**, live, against a booted
device — driving the screen and the network layer together, recording evidence a human can review,
and reporting each case's real outcome.

**The output is disagreements, not green checks.** A run's value is the cases where the app, the test
case document and the tech document do not agree — on a feature under active development that is
roughly a quarter of the set, and every one exists only because the run refused to assume the app
was right. Anything
that trades that away — a heal loop chasing a pass, an expectation rewritten to match behaviour — is
a regression in the thing this skill is for.

**A test case must never cost a build cycle.** The build happens once, for the harness; from then on
a flow is a **command plan** — data, executed turn by turn — so a new or changed case costs a plan.

## How this skill is structured

| File | Owns |
|---|---|
| `SKILL.md` (this file) | the stages, the gates, the auth pause, the apply-fixes mode — platform-neutral |
| `contracts/commands.md` | the driver command vocabulary and queue protocol every platform implements |
| `contracts/evidence.md` | `cases.json` / `results.json` / media naming, and where a run's state lives |
| `contracts/healing.md` | fault classes, what may be auto-fixed, authority, loop bounds, the 80% gate |
| `platforms/ios.md` | the reference driver: XCUITest harness, NetworkLens, packs, iOS traps, repo layout |
| `platforms/android.md` · `platforms/web.md` | contracts an Android/web driver must satisfy — not built |

Read the platform file for the run's target, plus the three contracts. Do not re-derive a rule that
already lives in one of them.

---

## Stage 1 — Preflight, and it fails closed

Nothing runs until the plumbing is proven. This stage exists because two sessions were lost to
infrastructure that *reported success*: an MCP holding a container path the app had stopped using,
and one malformed mock rule that made the app silently drop **all seven** of its rules. Both looked
exactly like "mocking is broken".

| Gate | Check | On failure |
|---|---|---|
| Governing skill still present | `scripts/audit_platform_skills.py --platform <platform> --check-only` against the fingerprint `/test-forge-init` step 8 recorded, for a platform that declares the requirement (iOS today — see `platforms/ios.md`'s "Host-project skills required") | stop; re-run `/test-forge-init` step 8 — a skill that existed at setup and is gone now is not something this stage guesses around |
| Device is unambiguous | exactly one booted simulator, or `TEST_FORGE_DEVICE_UDID` pins one among several — checked directly against `simctl list devices booted`, not an MCP tool | stop and confirm the target with the developer before any case runs |
| Driver reachable | send one cheap real command (a screenshot). A status flag can read "never polled" while the harness is fine | restart the harness, then escalate |
| Media roots agree | the runner's screenshot root and the driver MCP's recording root are the same folder | set `TEST_FORGE_MEDIA_ROOT` to the same value in both places and restart both |
| Data channel | the session file the app last wrote holds `isMockingEnabled` and at least one enabled rule. This is the file, not a live read of what the running app currently holds — see the informational row below | relaunch the app so it writes a fresh session file, or enable mocking / arm a rule before re-running |
| Container freshness | the data channel's resolved path matches the platform's current app container | reconnect the MCP; a stale path breaks reads *and* writes while the live channel keeps saying "on" |
| Rule schema | validate any authored rule against one the app itself wrote before installing it | refuse the write and name the offending field |
| **Proof of mock** | the trace shows the armed endpoint answered `isMockServed: true` | no case runs until it does |
| Fixture health | run the baseline check: model-only fields, redacted values, provenance | mark the affected cases unexercisable *before* running them |

Nine gates, plus one informational row: the data gate also prints a `data-live` WARN, since the
session file can lag what the running app actually holds — confirm with the data channel's own rule
count (`lens_live`) when the gap matters. That row is not separately skippable; it rides on the data
gate.

The proof-of-mock gate is the one that matters most. A data channel that reports an armed variant
while the app talks to the real backend has cost this project more time than every screen-layer bug
combined.

Run the gates rather than reading them:

```bash
scripts/preflight.py --endpoint "<each armed endpoint>" \
    --manifest fixtures/<feature>/manifest.json --responses-dir fixtures/<feature>/api-responses \
    [--mcp-container "<path the data channel reports>"] [--rule <candidate>.json] [--json]
```

It exits **1** if any gate failed, so a run can be gated on this one command. Two arguments are
worth passing every time:

- `--mcp-container` turns the container gate from a heuristic into a direct comparison. Without it
  the script can only say which container holds the newest trace; with it, it says whether the data
  channel is talking to the container the app is actually using. The path comes from the channel's
  own status output.
- `--rule` validates an authored rule **before** it is installed. This is the gate that catches the
  failure that cost a session: a rule with a non-UUID id, no `match` and a variant missing
  `exhaustion` made the app drop all seven of its rules with nothing logged. The script names each
  offending field.

`--skip <gate>` exists for the case where a gate genuinely cannot apply. Using it is a decision to
record in the run's notes, not a way past a failure — every gate here exists because the failure it
catches is one that some status flag elsewhere reports as fine.

---

## Stage 2 — Resolve inputs and shape the work

Two required inputs:

1. **Code reference** — the screen/component/controller file the flow is rooted in, or, when no
   single file roots it, the folder the scope lives in. A legacy flow usually only has the folder,
   and `scan_scope.py` below turns that into the file list.
2. **Test-case document** — either pasted plain-English steps, or a Confluence page (fetch with
   `mcp__atlassian__getConfluencePage`; use `mcp__atlassian__getConfluencePageDescendants` when the
   steps live across child pages).

Before doing anything else, check whether this screen already has a report from an earlier run:

```bash
find <UITestRoot> \( -iname "*TestForgeRun.md" -o -iname "*TestForgeTest.tracking.md" \) | xargs grep -l "<screen or flow name>" 2>/dev/null
```

- **Found** → this is a **re-run**. Read its identifier map and step table first, so unchanged
  steps keep their IDs and hashes; Stage 6 covers how a re-run is reported.
- **Not found** → first run for this flow, proceed to the identifier map in the platform file.

This has to happen before any file is written — a first run and a re-run diverge from the identifier map onward.

### Ask the shape of the work before running anything

Two questions decide the whole output layout, and both are cheap to ask and expensive to get wrong
after 183 cases have been run. Ask them with `AskUserQuestion`, together, in one call:

| Question | Header | Options |
|---|---|---|
| What kind of work is this pass covering? | `Feature shape` | `Revamp` · `Multi-section feature` · `Single-section feature` · `New page` |
| Where do the test cases live? | `Test case source` | `Group of pages (give the main page)` · `Single page` |
| Which devices should this run cover? | `Devices` | `The one booted simulator` · `Smallest and largest supported` · `A named list I will give` · `Every case on every device` |

- A **device** answer other than "the one booted simulator" makes this a matrix run: the same case
  ids execute more than once, once per device, and each result carries its own `device`. Say up front
  which cases actually warrant it — a layout or truncation case earns a sweep, a "the API returns 3
  items" case does not, and running all of them on all devices multiplies the run for no finding.
  Record the choice; a report that cannot say a case was *only* run on one device is claiming
  coverage it does not have.
- If the answer is **group**, ask only for the **main/parent page** — the children come from
  `mcp__atlassian__getConfluencePageDescendants`, so never make the user list them.
- The feature shape is what to call the run (`--feature`) and the sanity check on the source
  answer: a revamp or a multi-section feature that claims a single source page is usually someone
  giving the parent page's URL without realising the cases are on its children — re-check with
  `getConfluencePageDescendants` before accepting it.

That maps onto the report layout:

| Source | Layout | Output |
|---|---|---|
| Single page | `--layout single` | one `<Feature>-test-forge-run.md`, one `evidence.html` (Confluence storage format), one `attachments.txt` |
| Group of pages | `--layout multi` | `<Screen>TestForgeRun/` — `README.md` (bird's-eye), `pages/<page>.md` per source page, `html/` bodies, `media/<page>/` |

`--layout auto` (the default) picks `multi` the moment the case set spans more than one page, which
is the right answer often enough that the flag is mostly there to force the other one.

---

### Documentation posture: what the scope tells you about itself

A scope that ships module- and section-level markdown beside its code does more work in this skill
than its size suggests: file paths resolve in seconds, the endpoint list and its Auth column come
ready-made, and every expectation has **two** independent sources — the test case document and the
tech document — which is the only reason a discrepancy can ever be adjudicated as `app-wrong`
rather than left `undecided`.

A legacy page, component or module has none of that. The skill still runs, but it has to source
those four things itself, and it must be honest in the report about which ones it could not.

So Stage 2 starts by classifying the scope:

```bash
python3 .claude/skills/test-flow-recorder/scripts/scan_scope.py <scope folder>
```

It reports a posture and the numbers behind it — reference-looking markdown in or beside the scope,
view files split SwiftUI/UIKit, how many carry an accessibility identifier, and every endpoint
literal in the code:

| Posture | Meaning | Consequence |
|---|---|---|
| `documented` | reference markdown found in or beside the scope | read it first; treat it as co-equal with the test case document |
| `partial` | markdown exists but none of it is a reference (a `progress.md` and nothing else) | fill the gaps below; say so in the report |
| `undocumented` | no markdown at all — the legacy case | every gap below has to be filled from code, traffic, or the developer |

Never infer posture from the module's age or reputation. A scope with a `docs/` folder that only
holds a plan is `partial`, and a scope nobody thinks of as documented may still carry an HLD.

#### What a reference document supplies, and what substitutes for it

| What the doc gives | Where a documented scope carries it | Substitute when there is no doc |
|---|---|---|
| File paths for the flow's views | section-level markdown | `repo-index` — `symbol query decl <Name>`, `file query find "<words>"`, `uses <Symbol>` — plus the view inventory `scan_scope.py` already printed |
| The endpoint list | the API reference's endpoint table | the endpoint literals from `scan_scope.py`, **confirmed against a live trace** — see below |
| `requiresAuth` per case | the doc's Auth column | the auth-only-endpoint heuristic, plus the developer's answer; anything still unresolved is treated as **gated** |
| Expected values, config keys, thresholds | the doc's tables | nothing. The test case document becomes the sole source, which is what caps adjudication |
| Component → test case mapping for the report's table of components | the doc's own structure | derived from the view inventory, then confirmed with the developer before the run |

The endpoint list is the one substitute that must not be trusted as-is. `scan_scope.py` finds string
literals; a legacy screen routinely builds a path by interpolation or reads it from a constants file,
so the scan under-reports. Exercise the flow once with mocking **off**, then read the trace — that is
the authoritative list, and it is also what `capture_baseline.py` needs anyway:

```bash
python3 .claude/skills/test-flow-recorder/scripts/capture_baseline.py \
  --out-dir <run>/api-responses --manifest <run>/manifest.json --endpoint <each path from the trace> \
  --source-root <app source dir>
```

A scope with no doc has no baseline either, so this capture is not an optimisation there — it is the
only description of the contract the run will ever have. Capture before mocking anything.

`--source-root` is the safety net under the trust ladder: when an endpoint has never answered for
real and no `--from-pack` variant seeds it either, it synthesizes a body straight from the
endpoint's Swift `Codable` response model instead of leaving `missing` as the only outcome —
`provenance: "synthesized"`, the lowest-trust tier there is. Treat a case depending on one as
needing review before it's trusted, and read its `synthesisWarnings` — that's every field the
synthesizer couldn't confidently fill. Running `check_baseline.py` against a synthesized body is a
self-check (it was built from the same key extraction), not a validation of anything real.

#### The adjudication ceiling, stated in the report

With a tech document, an expectation has two sources and the third party is the app; a discrepancy
resolves to `app-wrong`, `doc-wrong` or `undecided` on evidence. Without one there are only two
parties, and "the app disagrees with the QA sheet" cannot by itself say which is right — a legacy
screen's behaviour may be the intended behaviour that the sheet was written against years later.

On `undocumented` or `partial` scope, therefore:

- Every discrepancy defaults to `authority: undecided` and stays there unless the developer rules on
  it explicitly, case by case. Code reading can prove *what the app does* and *why*, which is worth
  recording, but it cannot prove the app is wrong.
- **The apply-fixes mode declines on posture**, before it even looks at the pass rate — its entry
  gate assumes an RCA that names a wrong side. A developer who rules on specific cases can still run
  it against exactly those, named with `--case` and attributed with `--ruled-by`; see
  `contracts/healing.md`.
- The report's front matter carries `posture` and the list of expectation sources, so a reader knows
  the strength of what they are reading without reconstructing it.

#### The extra inputs to ask for, up front

Ask these **before** the run, not when a case trips over them — a missing entry point discovered at
case 20 wastes the previous 19 attempts' setup. Skip the whole block on `documented` scope.

Four of them are enumerable, so they go in one `AskUserQuestion` call:

| Question | Header | Options |
|---|---|---|
| What is the source of truth for expected behaviour here? | `Expectations` | `Test case document only` · `Test case doc plus a Confluence tech page` · `Test case doc plus a person I can ask` · `Nothing written down` |
| The scope's views mostly carry no accessibility identifier. How should the run address them? | `Addressing` | `Retrofit identifiers (additive, gated)` · `Label and geometry only` · `Mark unaddressable cases UNVERIFIABLE` |
| Is the screen behind a feature switch or remote config? | `Gating` | `No switch` · `Yes — I will give the key` · `Not sure, find it` |
| Does the flow depend on account or cart state? | `Preconditions` | `No preconditions` · `Signed-in account only` · `Specific cart/order state` · `Not sure` |

Two are open-ended and stay prose, per the standing preference for prose over pickers where the
answer is free text:

- **How is this screen reached?** A deeplink is best, and the app's https universal-link form is
  usually the one that works — a registered custom scheme can be accepted and still not route.
  Otherwise the tab and tap path from launch. Without this the run cannot reach the first case.
- **What must not be touched?** A legacy module often has a known-fragile file or a parallel
  migration in flight. Names go straight into the isolation boundary check in Hard constraints.

If the addressing answer is `Retrofit identifiers`, that is a production edit to a legacy module and
it follows the platform file's gated-retrofit rule exactly — additive modifiers only, no
restructuring, and the diff reviewed as its own change rather than folded into the run.

If `parse_test_cases.py` found any `trmsIds` on the parsed cases, ask where their saved TRMS
snapshots live (`<TRMS-ID>.webarchive`/`.html`, one per id — a Safari/Chrome page save of
`https://tracker-management-system.gdn-app.com/tracker-detail/<TRMS-ID>`, **not** a live URL fetch,
which returns only the unrendered SPA shell). Default lookup is `$TEST_FORGE_MEDIA_ROOT/trms/`; pass
`--snapshot-dir` to `check_tracker_validation.py` (Stage 6) to point elsewhere. A missing snapshot is
not a blocker — the gate reports `contractError` for that id and the run continues.

#### Write down what was derived

Everything the scan and the trace establish — file paths, the confirmed endpoint list, the view
inventory, the identifier gaps — goes into `derived-reference.md` in the **run folder**, beside the
page reports. It stays there: the run folder is the skill's own output, whereas the legacy module's
folder is production code the run is not authorised to add documentation to.

Offer to promote it into the module's own `docs/` afterwards, as a separate change the developer
reviews. It is the only mechanism by which a second run against the same legacy scope starts at
`documented` instead of repeating all of this.

---

### Guest cases first, then a login pause

`parse_test_cases.py` sets `requiresAuth` per case, from two signals: an auth-only endpoint named in
the API column (supplied with `--auth-endpoint-doc`, from the tech document's Auth column), or
wording that implies a signed-in user. On a large set that typically splits into a big guest batch
and a smaller gated one concentrated in whichever flow requires an account.

On a scope with no API table there is no Auth column, so only the wording signal survives and it
misses any case whose auth requirement is implicit. Fill the gap in this order: the developer's
per-case answers (`--gated-case` / `--guest-case`), then which of the captured endpoints returned 401
with no session (`--auth-endpoint`), then the wording, then the scope-wide `--preconditions` answer.
Each case records which of them decided it, in `authSource`. A case left unresolved when
`--preconditions` is `signed-in` or `unknown` is classified **gated** —
running a gated case as a guest produces a confident, entirely false discrepancy, whereas a guest
case classified gated only costs one extra click at the pause.

Work every guest case in a batch first. When the batch reaches gated cases, **stop and ask the user
to log in by hand, and to confirm they have**, then continue — never attempt an automated login, and
never mark a gated case `BLOCKED` before asking.

#### Before the pause: the harness must already be healthy

**Never ask for a sign-in the harness is about to throw away.** `TestForgeDriverRunner.runLiveSession()`
calls `app.launch()` unconditionally at the top, and `XCUIApplication.launch()` terminates any
running instance first. So a harness start — or restart, after an idle expiry or a crash — relaunches
the app under test. Ask before that and the sign-in is spent on a process that no longer exists.

So the order is fixed, and it is not a matter of judgement:

1. Prove the harness is collecting, with a real command rather than the attach flag
   (`scripts/preflight.py`'s `driver` gate, or one `test_forge_screenshot`).
2. Read the current auth state off the screen.
3. *Only then* raise the pause.

The same rule applies to the whole gated batch, not just its start: if the harness dies mid-batch,
the restart relaunches the app, and the pause has to be raised **again** after the restart, never
before it.

#### Whether a relaunch costs the session at all

That depends on the app, and it is worth establishing once, before the pause, because it decides how
much freedom the gated batch has:

| Where the token lives | A relaunch… | Consequence for the batch |
|---|---|---|
| Keychain, or `UserDefaults` — **the normal production case** | keeps the session | `test_forge_relaunch_app` stays available between cases, the way it is for guest cases |
| In memory only — a `@Published` property, an actor, a plain `var` | drops the session | **no relaunch anywhere in the gated batch**; plan every case to reach its state by navigation |

Most real apps persist. A sign-in survives a relaunch, and often survives a reinstall-free rebuild,
so the pause is a once-per-device cost rather than a once-per-restart one. Do not assume the harder
case and strip `test_forge_relaunch_app` out of a plan that does not need it.

Both questions are one command, and the pause is raised **only** when it exits 0:

```bash
scripts/auth_gate.py --auth-source <auth/session source> [--auth-source <another>]
```

It proves the harness is collecting with a real command, then reports the session as `persistent`,
`in-memory` or `unknown`, with the file and line behind the answer. It exits **1** when the harness is
not collecting — so the pause cannot be raised early — and **1** on `unknown`, because guessing the
session type costs the user a second sign-in either way. Its output says which of the two batch plans
above applies, so the answer reaches the plan rather than only the notes.

Record that answer in the run's notes, with the file and line behind it. On an in-memory session say
so explicitly in the pause itself, so the developer knows a second sign-in is not carelessness:
the sample app used to prove this skill keeps its token in a `@Published private(set) var` and loses
it on every relaunch, which is exactly the case the rule above exists for.

The pause is an `AskUserQuestion` call, so the developer answers with a click rather than by typing:

| Option | Meaning |
|---|---|
| **Authenticated — continue** | the session is live; run the gated batch |
| **Still authenticating** | ask again shortly; nothing runs meanwhile |
| **Skip the gated batch** | record every gated case `BLOCKED`, with the reason, and finish the run |

Re-verify the session before **each** gated case, not once per batch — a session that drops halfway
through 41 cases would otherwise turn every remaining one into a false discrepancy. If it drops, the
same prompt reappears rather than the run guessing.

This is the one prompt in the skill that is a picker rather than prose: it is a gate with three
discrete outcomes, and the developer is being asked to act on the device, not to clarify a finding.

---


---

## Stage 3 — Translate the test case into a command plan

The plan is **data**, not a compiled artifact: an ordered list of `mcp__test-forge-driver__*` calls
(screen) interleaved with `mcp__networklens__*` calls (data), one group per test-case step. Nothing
is written to disk in this step and nothing is built.

Before planning, confirm the harness is up with `mcp__test-forge-driver__test_forge_status`. If it reports no
harness, stop and hand back the one-time bring-up instead of planning a run — see `platforms/ios.md`.

**Sort out what this instrument cannot answer before planning around it.** A case about an easing
curve, a mid-fade opacity, a frame rate or a haptic has no command that answers it, and discovering
that at execution time wastes the setup. Classify first, then plan for the part that is reachable —
`contracts/evidence.md` carries the reason codes and the four checks that must all be false before a
case is called unverifiable at all.

Almost none of them are wholly unreachable, and that is the point: "the sheet slides up with a fade
and settles under the header" splits into an end state the harness reads exactly and a manner it
cannot see. Plan the first half, and plan a **recording** for the second — the clip is what lets a
person settle in one glance what no assertion can settle at all.

Rules for the plan itself:

- **One identifier per action, resolved to the real string the app applies** — from
  `scripts/scan_identifiers.py`'s inventory (Step 1's map), never from a guessed string and **never
  from an enum case name**. A case name is not the identifier: `rawValue` differs from the case name
  wherever the declaration carries an explicit `= "…"`, and a single enum routinely mixes both
  forms. Nor is there necessarily one enum to read — a project may hold many, including file-private
  ones with colliding names, reached through several different accessor spellings. The scanner
  resolves all of that; the plan consumes its output.
- **Where no static value exists, resolve at plan time from `test_forge_dump_tree`.** An identifier built by
  interpolation, one that is a localized string, and one passed through a generic wrapper each have
  no literal in the source to read. The inventory marks them as such rather than inventing a value,
  and the tree is what supplies the concrete string.
- **Leave `elementType` off by default.** `test-forge-driver` matches on identifier alone, which is what
  makes an identifier survive its view being rebuilt as a different element kind. Only narrow it
  when disambiguation is genuinely needed (`test_forge_get_element_count` over one container).
- **Every wait is a `test_forge_wait_for_exists` / `test_forge_wait_for_not_exists` call**, never a pause. There is
  no sleep command in the vocabulary, deliberately.
- **Read state, then decide.** `test_forge_get_label`, `test_forge_get_element_count` and `test_forge_get_frame` return
  real values, so ordering/formatting/position assertions are made here from what the screen
  actually reports — not encoded as a compiled `XCTAssert` in advance.
- **A mock precondition is a step in the plan, not a manual note.** Arm it via the platform's mock
  section, then
  `test_forge_relaunch_app` — which is what makes a file-based NetworkLens rule take effect without a
  rebuild.
- **A step whose expected result names a loading or transitional state — shimmer, skeleton,
  spinner, "while loading" — needs a delay armed before the triggering action, not a pause after
  it.** Arm the endpoint with its real body and a delay long enough to survive a screenshot, trigger
  the action, capture the transitional frame, then let the response land and verify the settled
  state too. The delay lives on the response itself, not in the plan — the same field a `slow`
  variant already carries — because a screen that resolves before the shutter opens leaves nothing
  to show for the case that asked to see it.
- **A precondition or step reading `macro:<Name>` splices a saved sequence in, one step at a
  time.** Resolve it with `scripts/macro_cli.py resolve "<Name>" --search-root <UITestRoot>` (or
  `--root <dir>` once the module is known), then insert its stored commands into the plan at that
  point exactly as written. Each spliced step is still executed and checked individually — never
  collapsed into one action — so a macro that no longer works fails at whichever step broke, the
  same way a hand-written one would. See `commands/test-forge-macro.md` for how a macro gets recorded.

`ScreenChain`'s hop model still describes the *shape* of a home-screen → target traversal, and the
project's existing hand-written UI tests remain useful **read-only** reference for how that
traversal usually goes. Neither is edited, and no per-flow chain instance is generated any more.

---


---

## Stage 4 — Execute, and record every attempt

Run the plan turn by turn against the running app. Executing it **is** running the test — there is
no generate-then-someone-else-runs-it handoff, and no `.swift` file per flow.

- **After each step, report what the tool actually returned** — `{found: true, hittable: true}`,
  `{count: 5}`, `{label: "Tomorrow"}` — and mark the step pass/fail against the test case's
  expectation. A tool that reports `reachable: false` is an infrastructure failure, not a test
  failure; say which one it is.
- **Capture evidence that shows what the case asserts.** Pass the assertion's own identifiers as
  `mustBeVisible` on every `test_forge_screenshot`. The accessibility tree sees an element through a
  keyboard, sheet or overlay and the camera does not, so a verdict can be right while the image
  handed to the reviewer does not show it. `visible: false` is an **evidence failure** — fix the
  frame and re-shoot; do not keep the shot because the tree-level reading was fine. Re-shooting a
  still is free. Re-shooting a recording is not, so clear the obstruction *before* `test_forge_start_recording`.
- **A keyboard belongs to the case that raised it and to no other.** `test_forge_type` now brings it down on
  its own; if one is up at the start of a case that did not ask for it, that is a leak from an
  earlier case — dismiss it before doing anything else rather than working around it. The same
  obstruction that ruins a screenshot also makes everything beneath it unhittable, which is how two
  cases previously recorded a false `PASS`.
- **Record the device against every case, not against the run.** Take `test_forge_device_info` once per
  device and write it into each result. On a matrix run the same case id appears once per device and
  those are separate results — collapsing them discards the only thing the sweep was run to find.
- **Verify the verifiable half before declaring the case unverifiable.** Read the end state, take a
  before/after pair, sample a colour, force the state with a mock — the four checks in
  `contracts/evidence.md`. A case with a verified part keeps that part's verdict and carries the rest
  in `partialVerification`; `UNVERIFIABLE` is only for a case with nothing checkable in it, and it
  always carries a reason code. A bare `UNVERIFIABLE` is a shrug, and the report flags it as one.
- **Route it, do not bury it.** Set `humanReviewRequired` and make sure the case has a recording, so
  what reaches the reviewer is a clip and a precise question rather than a dead row. Wanting a case
  to be unverifiable does not make it so: a colour boundary, a cap percentage, a position and a
  minimum height are all numbers, and the tooling reads them.
- **Read the whole outcome, not just `found`.** A gesture reports the conditions it acted under, and
  three of those fields change what a step means. `forced: true` says the hit test called the element
  covered and the tap went to its coordinate anyway — legitimate, but it belongs in the evidence.
  `ambiguous: true` says a label matched several elements and the first was chosen for you, which is
  how one case tapped the wrong control and still read as a pass. `valueAfter` on a `test_forge_type` that
  does not contain what was typed means the keystrokes went to whatever held first responder. A step
  that only checks `found` cannot see any of the three.
- **A refused gesture is a finding about the app or the run, not a dead end.** `test_forge_tap` refusing an
  unhittable element usually means something is covering it — a keyboard left up by the previous
  step is the common one, and dismissing it is the fix. Reach for `force: true` only after a
  screenshot shows the element genuinely reachable, never to get past the refusal.
- **Stop and ask when a step's outcome is ambiguous**, rather than continuing down a plan whose
  preconditions no longer hold. A wrong screen state makes every later step meaningless.
- **The harness is a one-time build, and the only build.** If `test_forge_status` reports no harness, hand
  the developer the bring-up below — never run `xcodebuild` from this skill. Once up, it serves
  every flow until it has been **idle** 30 minutes (`TEST_FORGE_DRIVER_SESSION_MINUTES`); the bound resets
  on every command, so it never expires mid-flow.

  ```bash
  # Restarting a session, once the bundle exists, is one command and needs no one:
  #   scripts/harness.py ensure     # no-op when healthy, restart + prove otherwise
  #   scripts/harness.py status     # probe / xcodebuild / runner, separately
  #   scripts/harness.py logs       # why the last one died
  #
  # Resolve the booted simulator by id — a `name=` destination is ambiguous across installed
  # runtimes here and fails with "Unable to find a device matching the provided destination".
  SIM=$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; print(next(d["udid"] for v in json.load(sys.stdin)["devices"].values() for d in v))')

  # One time, from the project directory. May need network or VPN access for dependency resolution.
  xcodebuild build-for-testing -workspace <your>.xcworkspace \
    -scheme TestForgeDriver -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIM"

  # Then start the session and leave it running.
  xcodebuild test-without-building -workspace <your>.xcworkspace \
    -scheme TestForgeDriver -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIM"
  ```

  Three things about that invocation are load-bearing:

  - **The dedicated `TestForgeDriver` scheme, not the app's main one.** It carries only this one test
    target. A main scheme builds *every* testable, so any unrelated test target that fails to
    compile blocks the harness — a real and common state in a large project. Neither `-testPlan`
    nor `-only-testing` prunes that build; only a scheme without those testables does.
  - **`-configuration Debug`, explicitly.** Where a project runs its tests in Release by
    convention, that silently breaks the data plane. The reason is not that the lens keys off
    `DEBUG` — it does not, and has not for a while: it is real in **every** configuration unless
    that configuration defines `NETWORKLENS_DISABLED`. The reason is that a shipping configuration
    is exactly where an app *should* define it (see below), and a host app usually gates its own
    bootstrap behind a debug-only module as well. Build the harness in a configuration where the
    lens is live, or every `mcp__networklens__*` tool answers inertly while appearing to succeed.
  - **A destination by `id=`, not `name=`.** Several installed runtimes carry the same device name
    here, and `name=` fails with "Unable to find a device matching the provided destination
    specifier".

  Add the session's test to the app's main test plan **skip list**, so a normal whole-plan run
  never starts a live session by accident. Selecting the `TestForgeDriver` scheme in Xcode and running
  from the test gutter works identically to the command above.
- **Treat `test_forge_open_deeplink` as unproven until the screen answers.** An app's two URL forms often
  behave differently, and only one may work: the **https universal-link form routes**, while a
  **custom scheme can silently do nothing** — the app stays where it was, still alive, even with the
  scheme registered as a `CFBundleURLScheme` and a matching route in the app's deeplink table.
  `simctl` reports only the handoff, never the destination, so a non-routing deeplink looks
  identical to one that worked. Always follow one with a `test_forge_wait_for_exists`, or with
  `test_forge_alert_tap` when a chooser is expected.

  Prefer a working deeplink over hunting an entry point on the home screen: it reaches the
  destination's own routing directly, and does not depend on the home screen rendering an entry
  point for that feature at all — which it may not, leaving the entry element unreachable.
- **A container identifier is not necessarily a container.** SwiftUI's
  `.setAccessibilityIdentifier` often lands on a *sibling* leaf rather than the wrapping element:
  a container-named identifier can exist and match while having no descendants, so
  `test_forge_get_labels`/`test_forge_get_element_count` scoped to it return 0 rather than erroring. When a scoped
  read comes back empty, check with `test_forge_dump_tree` before concluding the section is absent, then
  either scope to the whole screen or retrofit identifiers onto the real children (see the platform file).
- **An unscoped `test_forge_get_labels` can kill the session.** Sweeping every label on a screen as deep
  as Home makes XCUITest give up with *"Failed to get matching snapshot: Timed out while
  evaluating UI query"* — and like an unmatched-element access, that raise unwinds `testLiveSession`
  and ends the whole session, not just the one command. The harness now refuses the unbounded case
  and caps collection at 200, so scope every call with `containerIdentifier` or a specific
  `elementType`. The same "one bad read kills the run" shape applies to any new broad query: bound
  it in the handler, because Swift cannot catch an XCTest failure.
- **Never read a query by index in a loop — materialize it once.** `element(boundBy:)` re-queries
  the live tree on every access, so a screen that navigates *mid-collection* raises *"No matches
  found for Element at index n"* and takes the session with it. A 2026-09-03 run lost the harness
  exactly that way: a `getLabels` immediately after a banner tap collected labels while the
  destination was pushing. `readLabels` now takes
  `scope.allElementsBoundByIndex` once and slices it; write any new multi-element handler the same
  way. A single indexed read guarded by a `count` wait is fine — the loop is what makes it likely.
- **`test_forge_dump_tree` output is capped, and it truncates silently from the end.** A whole-app dump of
  a dense screen stops before anything late in tree order — a tab row near the end reads as *absent*
  while `test_forge_assert_exists` and `test_forge_get_labels` both find it. Check `truncated` in the result, and
  scope the dump: `identifier` **plus** `elementType` dumps that element's own subtree, every child
  frame included, which is both complete and cheap.
- **Reopening the deeplink does not reload the screen — it stacks another one.** Firing
  `test_forge_open_deeplink` while already on the destination pushes a second instance on top, so the tree
  then holds two of every identifier and a frame read can silently answer from the wrong copy.
  Between fixture states always
  `test_forge_relaunch_app` first, then deeplink, then `test_forge_alert_tap` — roughly two minutes per state, and
  the only way the reads mean what they say.
- **A pack import is refused while the harness is attached, on older `networklens-mcp` builds.**
  Its running-app check matched `UIKitApplication:<bundleId>` as a prefix, which also matches the
  XCUITest runner (`<bundleId>.<target>.xctrunner`) — so with the harness up and the
  app itself closed, every mock write was refused with "it would overwrite this write within
  seconds". Fixed in `networklens-mcp`'s own `src/container.ts` by requiring the trailing `[` —
  the host project's own registered `networklens` MCP server, not this plugin's (it vendors none;
  see `contracts/dataplane.md`). If the refusal reappears, that build predates the fix: stop the
  harness, import, restart it.
- **`lens_list`/`lens_stats` can point at a dead app container.** Every rebuild reinstalls the app
  under a new container UUID, and a `networklens-mcp` that resolved the old one reports *"No trace
  at …/Application/<old-uuid>/…"* as though tracing were off. `trace: TraceOptions()` is on in
  `NetworkLensBootstrap.start()`, so the file exists — read it directly instead of retrying the
  tool: `xcrun simctl get_app_container booted <bundleId> data` then
  `Library/Application Support/NetworkLens/trace.ndjson`, one JSON object per line with
  `exchange.endpointKey`, `.startedAt`, `.timing.total`, `.response.statusCode` and `.isMockServed`.
  That is what a "calls fire in parallel" or "exactly N calls per visit" assertion needs, and
  reading it in `bash` keeps the bodies out of context.
- **Changing either MCP server means restarting the MCP connection.** `npm run build` updates
  `dist/`, but the running server process is whatever was spawned when the session started — new
  tools and changed schemas do not appear until it is restarted. Until then a command can still be
  driven straight at the queue (`POST /command`, then `GET /result?id=`) on port 8789.
  `scripts/queue_cli.py` wraps that: `cmd '<json>'` posts one command and prints its result,
  `tree [identifier] [type]` writes a dump to a file so a big tree can be `grep`ed instead of read
  into context, and `reload` is the relaunch → deeplink → chooser → wait sequence in one call.
- **When a lookup fails unexpectedly, call `test_forge_dump_tree` before changing anything else.** An
  element that exists but is unhittable, or carries a different identifier than the code suggests,
  is invisible to every other command and guessing at it wastes a whole plan.
- **Commands are issued one at a time, deliberately.** A step's outcome usually decides whether the
  next step means anything, so there is no batch command to hide a mid-plan failure.
- **Extending the vocabulary is a deliberate two-sided change**, not a per-flow one: a new command
  needs a `server.tool(...)` in `mcp/test-forge-driver-mcp/src/index.ts` **and** a case in
  `TestForgeDriverSession.swift`'s matching handler, and it costs the one-time rebuild again. Compose
  existing commands first; only add one when a step is genuinely inexpressible.

---

### The `test-forge-driver` vocabulary

### Evidence capture

Every case gets evidence, **pass included** — a passing case with no screenshot is indistinguishable
from a case nobody ran, and one with no recording is a verdict backed by a still frame.

**What earns a recording is an interaction, not a verdict.** A clip is evidence of a *transition* —
that the tap landed, what moved, what the app did in between. A case that only reads the screen has
no transition to show, and one glance at its screenshot settles it either way.

| The case… | Evidence |
|---|---|
| taps, swipes, scrolls, pans, types, navigates, relaunches, dismisses an alert | screenshot **and** recording |
| only checks that elements exist, or reads their labels, counts or frames | screenshot alone |

Concretely, a case is interacting when it calls any of `test_forge_tap`, `test_forge_tap_by_label`, `test_forge_swipe`,
`test_forge_scroll_until_exists`, `test_forge_scroll_to_top`, `test_forge_type`, `test_forge_open_deeplink`, `test_forge_relaunch_app` or
`test_forge_alert_tap`. `build_evidence.py` derives that from the case's own `commands` and **fails the run**
when an interacting case carries no `video` — bracketing is not left to the runner remembering.

Two things follow for the runner:

- **Record the command trail.** The gate reads `commands`; a result without one cannot prove it was
  read-only, so it is treated as interacting and owes a clip. Set `interaction: false` on the result
  to state it outright when the command list understates the case.
- **Bracket before the first action, not before the first command.** A case that reads three labels
  and then taps starts recording at the tap.

- `test_forge_screenshot` with `caseId` writes to
  `$SIMULATOR_HOST_HOME/Documents/<Team>-Test/<caseId>/<step-n>-<label>.png`. Pass `caseId` every
  time: one long-lived harness session serves every case, so without it the folder comes from the
  harness's single test method name and all 183 cases' screenshots pile into one directory.
- `test_forge_start_recording` / `test_forge_stop_recording` bracket the case, producing
  `<Team>-Test/<caseId>/<caseId>.mov`. Both run host-side (`simctl io recordVideo`, hevc), so they
  need no harness and survive a `test_forge_relaunch_app` mid-case.
- **A recorded read is wasted bytes.** Filming an existence check produces a clip of a motionless
  screen — the same information the screenshot already carries, at a thousand times the size. Leave
  those cases unrecorded rather than bracketing everything out of habit.
- **Keep the case short, and diagnose outside the recording.** Recording runs at roughly 0.4 MB/s —
  a six-minute session is ~140 MB. Element hunting, `test_forge_dump_tree`, identifier archaeology: stop the
  recording first and start a fresh one for the real attempt. A clip of the runner looking for
  something proves nothing about the case, and it is the single biggest source of wasted disk.
- **Prune before reporting.** A run leaves clips the report has no use for: one left rolling through
  a diagnosis, a re-recording of a restarted attempt, a zero-byte file from a stop with no start.

  ```bash
  scripts/prune_recordings.py --media-dir ~/Documents/<Team>-Test \
      --results <run>/inputs/results.json [--dry-run]
  ```

  It keeps one clip per attempt, deletes the rest with `unlink` — **not** to the Trash, since a Trash
  full of discarded screen recordings is the same disk problem one directory over — and rewrites each
  result's `video` so the report can never cite a file that is gone.

**Local first, always.** The files under `~/Documents/<Team>-Test/` are the canonical record and are
never deleted after publishing. Confluence gets a *copy*.

**Where a copy may go.** Only the `DEV_TESTING_EVIDENCE` page (Stage 7). Never the test case
document, never Slack, never a PR description. These captures can contain real-looking
QA-environment account/order/payment data, so anywhere outside that one page is out of bounds.

---


Recording is **per attempt**, not per case, and covers passes as well as failures — a case that
passed only after a locator heal is a different result from one that passed first time, and only the
attempt sequence shows which happened. Naming and staging are in `contracts/evidence.md`.

---

## Stage 5 — Adjudicate: which side is wrong

A case that does not match its expectation is a three-way disagreement between the test case
document, the tech document and the observed app. **The disagreement is the finding.** Record an
`authority` verdict — `app-wrong`, `doc-wrong` or `undecided` — and let `undecided` be the default.

Healing is bounded and never touches an expectation. The fault classes, the whitelist of changes that
may be proposed against app code, the loop bounds and the rollback rule are all in
`contracts/healing.md`. Two rules are worth repeating here because they are the ones under pressure:

- **Heal the harness, never the expectation.** Identifiers, waits, targets and fixtures heal
  automatically. A value the app renders never does.
- **A heal that does not change the verdict is rolled back**, not stacked on the next attempt.

### Record the cause, and only sometimes a patch

Two fields carry this out of the run and into someone's hands — `rca` and `patch` on the case's
result. They are not the same kind of claim:

- **`rca` — `{file, line, symbol, cause}` — on every finding worth a developer's time**, whatever the
  authority. An `undecided` case with the file, the line and the mechanism behind it is one a
  developer rules on in a minute; the same case without them costs an afternoon of re-derivation, and
  usually gets deferred instead. Recording a cause is not a claim that the app is wrong.
- **`patch` — a diff — only where all four conditions hold**: the case is `app-wrong`, it has an
  `rca`, the diff is real, and the change's `class` is in `healing.md`'s whitelist (spacing, text
  properties, colour tokens, a single-call-site constant, a missing accessibility identifier).
  Anything touching control flow, which response field a feature reads, API calls, threading or
  ownership stays prose in `recommendation` — those are the changes where a diff applied without a
  human reading around it is how a run does damage.

`build_evidence.py` fails the report on a patch that breaks any of the four, and names the ground. It
is not a lint to work around: the reason the gate exists is that the field's whole purpose is to be
applied later by something that trusts this file.

### Separate the hypotheses before recording a verdict

Some findings are only *provable* by a minimal pair of fixtures: the same body with one field added,
or one number changed. A single fixture that two explanations both predict
proves neither. Where a pair is possible, build it — and do not record a verdict that rests on one
observation when it was.

---

## Stage 6 — Report

Written **after** a live run, never as a stand-in for one, and git-tracked under
`<UITestRoot>/<Module>/<Submodule>/`. `scripts/build_evidence.py` emits it — do not hand-write
one. An existing `<Screen>TestForgeTest.tracking.md` from a compiled-generation run is this file's
predecessor: read it for the identifier map, and append to it rather than starting a second
document for the same flow.

**Run the trail checks first — `build_evidence.py` only renders what they already wrote into
`results.json`.** Both mutate the file in place and are safe to run every time, even when nothing
in their domain applies to this run (a case with no window recorded, or no `trmsIds`, is simply
left unchecked):

```bash
scripts/check_network_trail.py <cases>.json <results>.json --bundle-id <bundle id>
scripts/check_tracker_validation.py <cases>.json <results>.json --bundle-id <bundle id>
```

`check_tracker_validation.py` needs a saved TRMS snapshot per id to check payloads (see "Tracker
trail" below) — its own stderr names any it could not find, which is informational, not a failure.

```bash
scripts/build_evidence.py <cases>.json <results>.json \
    --out-dir <UITestRoot>/<Module>/<Submodule>/<Screen>TestForgeRun \
    --media-dir <scratchpad>/evidence/media \
    --feature "<Feature Name>" --main-page <parent pageId> \
    --run-label "<date> · <build>" --environment <env>.json [--runner "Name"] \
    [--posture documented|partial|undocumented]
```

**One document per source page, plus an overview.** A single file holding every case of a revamp is
unreadable at a few hundred cases. In `multi` layout each Confluence page gets its
own document under `pages/`, and `README.md` carries only the bird's-eye view: coverage per page
(cases on the page, cases run, counts per verdict), every open discrepancy and blocked case with a
deep link into the page document that holds it, the legend, and the run metadata. A page with
nothing run yet still gets a row, so the overview doubles as the remaining-work list.

**Every document opens with a table of contents.** The overview's links to each page document; a
page document's to its own sections and to every case heading, each prefixed with its verdict
emoji, so the state of a 35-case page is legible without scrolling it.

**The posture goes in the front matter.** `posture` and the expectation sources the run actually
had (`testCases`, `techDoc`, `code`, `developer`) sit alongside the build metadata, and on
`undocumented` or `partial` scope the legend gains one line saying that a discrepancy there records
a disagreement rather than a fault. Without it a reader treats an `undecided` finding from a legacy
run as if it had been adjudicated against a spec.

**Attribution is not optional.** Every document names **who ran the pass** (`--runner`, defaulting
to `git config user.name`) and that it was driven by this skill, alongside build, commit, branch,
simulator and fixture set. A report nobody is named on cannot be followed up.

**Media never lands in the repo.** `--out-dir` holds documents only — a run's staged copies are
tens of megabytes and would be committed. Point `--media-dir` at the scratchpad; the canonical
originals stay in `~/Documents/<Team>-Test/`, and the documents reference attachment *names*, so
nothing breaks when the staged copies are cleaned up.

**Never write an absolute home path.** `~/Documents/<Team>-Test/<case>/…`, never
`/Users/<someone>/…` — these documents get committed and shared. `build_evidence.py` rewrites paths
on the way out; anything hand-written into `results.json` should already be `~`-relative.

### Persist the run inputs, or the next page cannot regenerate the overview

`cases.json` and `results.json` are the run's only machine-readable record, and the multi-page
overview is derived from *all* of them at once. Throw them away after generating and the next page's
run can no longer rebuild `README.md` — the earlier pages' verdicts exist only as prose inside the
documents they produced, and the overview has to be hand-merged instead.

So keep them outside the repo, next to the evidence, and extend them per page:

```
~/Documents/<Team>-Test/<feature>-run/
    pages/<pageId>.md        verbatim getConfluencePage(contentFormat="markdown") body
    pages/index.json         [{id, title, versionNumber}, …]  ← a flat array, not an object
    inputs/cases.json        every page parsed so far
    inputs/results.json      every case run so far
    evidence/                media staged under `<caseId>-<name>` attachment names
```

The saved page bodies matter as much as the results: `parse_test_cases.py` reads
`<pageId>.md` files, so without them the cases cannot be re-derived either, and a page that has
since been edited on Confluence would silently re-parse differently.

Two field names to get right, because both fail quietly:

| Field | Note |
|---|---|
| `screenshots` | The results key for captures — **not** `media`. A wrong key stages 0 files and every case's Evidence line simply disappears, with no error. |
| `pages/index.json` | A flat array of `{id, title, versionNumber}`. An object keyed by page id raises `TypeError: string indices must be integers`. |

### Formatting rules for the generated markdown

| Rule | Why |
|---|---|
| Verdicts render as `<emoji> <span style="color:…">**VERDICT**</span>` — 🟢 PASS `#1F883D`, 🔴 DISCREPANCY `#B42318`, 🟠 BLOCKED `#B54708`, ⚪ UNVERIFIABLE `#6E7781` | The emoji carries the colour in renderers that strip inline HTML (GitHub); the span carries it in the ones that keep it (Confluence, IDE previews). Neither alone covers both. |
| Any `Label:` line is **bold** — `- **Observed:** …` | A case's facts scan as a list rather than as prose, and the labels line up down the page. |
| A verdict appearing in a label's value takes the badge treatment too | One visual vocabulary; a reader never has to work out whether a word is a status. |
| A verdict distribution bar (`🟢🟢🟢🔴🟠`) under the title | The shape of a run reads before any number does. |
| `> [!CAUTION]` over a discrepancy summary, `> [!TIP]` over a recommendation | GitHub renders these as coloured callouts, so the two things a reader must act on are the two things that are not grey. |
| Long material (`Reproduce by hand`, `Commands run`) inside `<details>` | Keeps a 35-case document scannable while leaving the detail one click away. |

Beyond these, use judgement — the goal is a document a QA lead can skim in a minute and a developer
can work from for an hour.

### Turning a visual expectation into a number

"Capped visually at 95%", "minimum visible height", "does not overflow" — a test case phrased that
way reads as unverifiable, and recording it as UNVERIFIABLE is almost always laziness. A colour
boundary is a measurement:

```bash
scripts/pixel.py <screenshot> "bar=130,633,205:span"
#   #FFE6E6  x 133-232  (100pt)      <- fill
#   #FFF5F5  x 233-332  (100pt)      <- track remainder
```

The span form walks one row of pixels and reports each colour run, so a progress fill becomes
`fill / (fill + remainder)` — 100/200 = 50% against a mocked `quota.percentage` of 50. Point and
rect forms remain for single colours and for antialiased text (`ink`/`paper`).

Two things make the reading sound rather than suggestive:

- **Separate the hypotheses before measuring.** A cap of 95% and a cap of 98% differ by 6pt on a
  200pt track — but only at `percentage: 100`. Mock the value that spreads the candidates apart,
  not a value both explain. This is the same discipline as the `#FF0000` probe fixture: two
  fixtures that render identically prove nothing.
- **Check the element is even rendered.** A card whose `availabilityStatus` suppresses the bar
  measures as "no fill", which is not the same finding as "fill is zero". Read the mocked value
  back out of the trace (`isMockServed: true` and the field's value) before trusting a span.

### The companion tracking document

`build_evidence.py` owns the run report. `<Screen>TestForgeTest.tracking.md` is the separate, hand-kept
record of *how the flow is driven*, and it is what a re-run reads first:

| Section | Contents |
|---|---|
| Accessibility Identifier Map & Gaps | Every identifier the flow relies on, which existed already vs. which this run added, and any gap the user declined to retrofit (still unrunnable). |
| Command Plan | The Stage 3 sequence in order — each step's `test-forge-driver`/`networklens` calls and their parameters. |
| Step → Result | `Step ID \| source step text or Confluence ref \| content hash \| commands run \| what they returned \| mock rule/variant in effect \| pass/fail \| screenshot path` |
| Run History | One row per run: date, plan changes since the last run, what triggered it. |

**Hashing:** compute each step's hash with `scripts/hash_step.py "<step text>"` — hash **per
step**, never per document, so the next run reports *which* steps changed rather than treating the
whole test case as one blob.

**Stable step IDs:**
- Confluence source → use Confluence's own heading/list anchors.
- Freeform pasted text → assign an ID on the first run, and on later runs realign by
  **text-similarity matching**, never positional matching (positional matching breaks the moment
  steps are reordered).

Because a run is no longer a build, a changed step is simply re-run — the hashes exist to say what
changed and to keep an unchanged step's earlier result honest, not to drive a surgical edit.

---


---

## Stage 7 — Publish, on an explicit step

**The test case document is read-only.** Test cases are written before development starts and are
owned outside this process. This skill **never** calls `updateConfluencePage` on a test case page,
never adds an id to a case that lacks one, and never marks a case iOS-specific — cases are common
to iOS and Android as one mobile platform.

Both sides of the spec carry equal weight: the Confluence test cases **and** the feature's own tech
docs. When they disagree, that disagreement *is* the finding — do not assume the app is wrong. A
worked example: a case specified one date format, the app rendered another, and both the feature's
wording document and the formatting constant in code specified what the app rendered. The app was
right and the case had a typo.

### Ingest

```bash
scripts/parse_test_cases.py <pages_dir> -o cases.json --index <pages_dir>/index.json \
    [--preconditions none|signed-in|state|unknown] [--gated-case ID] [--guest-case ID] \
    [--auth-endpoint FRAGMENT]
```

`<pages_dir>` holds one `<pageId>.md` per page, each the verbatim `body` of a
`getConfluencePage(contentFormat="markdown")` call. Columns are matched by meaning, not position —
one feature's pages routinely use three different table schemas — and any column matching nothing is
reported rather than dropped. Cases with no id in the document get a minted positional one
(`AB-003`, `CD-007`) plus `isPositionalId: true`; minted ids name local folders and appear on the
evidence page marked as positional, and never go back into the document.

### Verdicts

Four, and every one carries evidence:

| Verdict | Meaning |
|---|---|
| `PASS` | Observed matches expected. |
| `DISCREPANCY` | Observed differs from expected — quote both, and say which source each came from. |
| `BLOCKED` | The precondition could not be reached, so the expectation was never exercised. |
| `UNVERIFIABLE` | The expectation is not assertable as written (e.g. "renders correctly", "according to current UI behavior"). |

`UNVERIFIABLE` is not a failure of the run — it is the run's most valuable output, and it belongs
in Recommendations with proposed sharper wording.

### Publish

`build_evidence.py` (Stage 6) already emitted the page bodies: `evidence.html` in `single` layout,
or `html/index.html` plus one `html/<page>.html` per source page in `multi`.

**The published page structure mirrors the local one.** A group of test case pages gets a parent
`DEV_TESTING_EVIDENCE` page carrying the overview — coverage per page and the open discrepancies —
and one child page per source test case document, each named after the page it covers. That parent is
itself filed under the evidence parent resolved below, so the whole run moves as one subtree. That keeps a
reader's path short (overview → the one page they care about) and keeps each page's attachments to
the media of its own cases, which is why `media/` is staged per page.

### Where a page goes, and who can see it

**Default parent: [Team Mobile (Blibli app)](https://gdncomm.atlassian.net/wiki/spaces/GDNIT/pages/326278640/Team+Mobile+Blibli+app)**
— page `326278640`, space `GDNIT`. Everything this skill publishes lands there, on **iOS and
Android alike**, unless the developer names somewhere else. A page filed somewhere ad hoc is a page
nobody finds again, and the team page is where the mobile docs already live.

- **The developer names a parent → use it.** A pasted page URL, or a path they describe. Their answer
  always wins over the default; the skill does not argue with it or re-file it later.
- **They name nothing → the default.** Say which parent was used and that it was the default, so an
  unintended location is visible immediately rather than discovered by someone else.
- A tiny link (`/wiki/x/…`) does not carry a page id, so ask for the full `/pages/<id>/…` link rather
  than guessing.

**A new page is created private — restricted to the person who ran it, read and update.** This is
not tidiness. The default parent sits in a **shared** space, so an evidence page that appears
team-wide the moment it is written reads as a finding the team has already agreed with, when in fact
nobody has looked at it. Widening access is a review decision and belongs to the author.

So the hand-back always states, in these terms: *the page is restricted to you; review it, then grant
the people who need it.* The skill **never** widens access itself, and never asks to.

On a **re-publish** the existing restrictions are left exactly as they are. Whoever widened that page
decided to; silently narrowing it back on every run would undo their decision without telling anyone.
Report the access the page currently has instead.

### The publish sequence

`scripts/publish_evidence.py` does all of the below in the right order, and the order is the part
that gets remembered wrong:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/publish_evidence.py" \
    --title "DEV_TESTING_EVIDENCE — <Feature>" \
    --body-file <run>/report/evidence.html \
    --media-dir <run>/report/media \
    [--parent <page URL or id>]      # omit for the team page above
```

1. **Look before creating.** It matches an existing child of the parent **by title** and updates that
   page rather than creating a second one. Only a title that is not there yet is created.
2. **Attachments before the body.** A `<ri:attachment>` naming a file that is not on the page yet
   renders as a **macro error**, not a blank. Uploads are diffed by name *and* byte size, because a
   multi-MB upload can answer with a success-shaped body and still not land.
3. **Body over REST, not through the MCP.** The MCP page tools take the body as an inline argument, so
   a real page has to pass through the conversation twice and a large one does not fit at all — and
   the MCP has no attachment tool whatsoever. The body is Confluence **storage** format, generated to
   a file by `build_evidence.py`.
4. **Version read immediately before the write.** Uploading attachments bumps the page version, so a
   number computed before the uploads is already stale and the write is rejected with a conflict.
5. **Verify against the render, not the response.** It refetches the rendered page and fails if
   `Error rendering macro` or `Cannot find attachment` appears. A publish that "succeeded" into a page
   full of macro errors is not a publish.


---


---

## The apply-fixes mode

A **separate invocation** over a **completed** run — `/test-forge-fix`, never a stage inside a pass. It
applies the `patch` entries that run already proposed, re-runs exactly those cases, and keeps only
the ones that now pass. It never re-adjudicates a verdict: the run decided which side was wrong, and
this mode is only allowed to act on that decision.

`scripts/apply_fixes.py` owns every file mutation and the bookkeeping. It does **not** drive the app
— that is the harness's job and yours. Keeping those apart is deliberate: a script that both edits
code and judges whether the edit worked has nobody checking it.

```bash
apply_fixes.py --repo . plan   <results>.json          # what would land, what is refused, and why
apply_fixes.py --repo . apply  <results>.json --journal <run>/fixes.json
#   … re-run exactly the patched cases through the harness, recording each …
apply_fixes.py --repo . settle --journal <run>/fixes.json --rerun <rerun-results>.json
apply_fixes.py --repo . revert --journal <run>/fixes.json    # back it all out, any time
```

### The five steps, in this order

1. **`plan` first, and expect it to say no.** The entry gate is `contracts/healing.md`'s: at least
   80% of *adjudicated* cases passed (`PASS` + `DISCREPANCY`; `BLOCKED` and `UNVERIFIABLE` excluded),
   a floor of 10 adjudicated cases, and a `documented` posture — checked before the rate, because
   with no tech document nothing can reach `app-wrong` on evidence at all. A first pass over a
   feature under active development usually sits below that line. **That is the gate working**, not
   a number to tune, and not something to route around by naming every case with `--case`.
2. **Invoke the codegen skill before anything is written** — `swift-codegen`, or `swiftui-code-gen`
   when the target imports SwiftUI, exactly as the chaining table below requires. An applied patch is
   a production edit like any other; that it arrived as a diff changes nothing about which gate it
   goes through.
3. **`apply`** lands them and opens the journal. Every patch is checked before any is applied, and a
   failure part-way through reverts what already landed, so the tree is never left in a state nobody
   chose. Nothing is staged and nothing is committed.
4. **Re-run exactly the patched cases**, same fixture, recording each one. A patch is not evidence.
   The report pairs the before clip with the after clip and the diff between them, which is the only
   thing that shows what a fix actually changed.
5. **`settle`** keeps a patch only where its case now reads `PASS`, and rolls back everything else —
   including a case missing from the re-run, because an unmeasured edit is not a fix. What survives
   is unstaged in the working tree for the developer to review and commit as its own change, with
   the case ids in the message.

### What it refuses, and why refusing is the point

Beyond the eligibility gates the report already applied (`app-wrong`, an `rca`, a real diff, a
whitelisted class), the pass will not land a patch that:

| Refusal | Reason |
|---|---|
| is not a unified diff | patches land through `git apply`; a fragment would have to be applied by guesswork, and that is how a file gets corrupted |
| touches more than one file | every whitelisted class is single-file by construction |
| creates, deletes or renames a file | same — these classes edit in place |
| exceeds 24 changed lines | a whitelisted class is a claim about blast radius. A "spacing constant" arriving as a 300-line diff is a different kind of change, whatever the field says |
| touches `.claude/`, `CLAUDE.md`, a test target, `project.pbxproj`, a scheme, a test plan or `Package.resolved` | a pass that can edit the tooling is not governed by it; a pass that can edit a test to match the app inverts the entire point of the skill; and pbxproj is hand-edit-only here for reasons that have nothing to do with this mode |
| targets a file with uncommitted changes | a revert could not tell this pass's edit from the developer's own work |
| shares a case id with another patched result | the journal and the re-run are both keyed by that id, so neither patch could be judged by its own case |

The one override is `--case TC-0NN --ruled-by <name>`, for cases a **developer has already ruled
on**. It bypasses the rate, the floor and the posture — a human ruling is what those three were
standing in for — and nothing else. The name goes in the journal, so the authority behind an edit is
attributable afterwards rather than implied.

---

## Tracker validation

Proves an analytics tracker fired on device, with the right payload, from the same trace a case's
`isMockServed` proof already came from — `scripts/extract_trackers.py`, ported from upstream
NetworkInterceptor's own script and skill and kept behind the same `dataplane.py` resolver as
`preflight.py`/`capture_baseline.py`, so it reads whichever `TEST_FORGE_DATA_PLANE` driver is active.

```bash
scripts/extract_trackers.py --ids TR-001,TR-002 --bundle-id <bundle id> \
    --contract <rules.json> --format markdown
```

A contract is a JSON object keyed by TRMS id — `event`, `origin_screen`, `required` (dotted paths,
`items[]` fans out over a list), `expect` (exact values). Without one, the report can only say a
tracker fired, not that its payload was right.

Every fire is checked, not just the first — a payload that goes bad three impressions in is the bug,
and only checking the first would miss it. `required` treats blank the same as missing (`None`, `""`,
`[]`, `{}`): an empty `origin_screen` breaks a report exactly as a missing one does. An id that fired
but was never in the requested list is reported under **"Fired but not on the list"** rather than
dropped — usually a copy-pasted TRMS id, and a real defect even when everything requested passed.

Two columns are inference, not fact, and must be presented as such: **Trigger point** is guessed from
the payload's own fields, since the trace shows what was sent, never what was tapped; **Design** and
**Sample Response** are left blank on purpose. Never say "all trackers valid" when no contract was
supplied — say "all fired; payload fields not checked".

It pairs with this repo's `ios-analytics-tracker`: that skill writes tracker code, this one proves it
fired. Neither reads the other's output.

A fuller skill by the same name may exist elsewhere in a project that vendors NetworkLens directly
(live `--new`/`--reset` watch mode while a tester taps, JIRA-ticket-driven id extraction, Confluence
publishing) — that one wraps this same script for a project with those integrations wired up. This
skill's own version is the core proof-and-contract-check, usable standalone or as part of a case,
with no JIRA/Confluence dependency.

---

## Network trail

`preflight.py`'s `gate_mock_proof` proves one endpoint — the one a case's precondition arms — was
actually mock-served, before the case runs. It says nothing about the case's API surface as a whole.
`scripts/check_network_trail.py` is that check, run **after** a case executes: an endpoint the case's
own `api` column expected but that never fired (missing), one that fired without being expected
(unexpected), or one that fired more than once in the case's window (duplicate) — off the same
folded trace `extract_trackers.py` and the mock-proof gate both read.

```bash
scripts/check_network_trail.py cases.json results.json --bundle-id <bundle id> \
    --ignore-endpoints "GET /config,GET /health"
```

It only checks a case whose result entry carries `networkWindowStart`/`networkWindowEnd` — nothing
stamps these automatically, so whatever drives the run records both, bracketing that case's own
commands, the same manual convention as recording `screenshots`/`video` paths. A case missing either
is left alone: reported as **unchecked**, not as clean. A case whose `api` column is prose only still
gets its duplicate calls checked; its missing/unexpected findings are left out of the result entirely
rather than reported as empty, so a reader never mistakes "nothing to check" for "checked, zero
problems".

**This never changes a verdict.** A missing or unexpected call is a real gap, but the script cannot
tell a test-writing gap from an app bug from a call the `api` column simply never mentioned — that
call is for a person, the same way `contracts/healing.md` sends an expectation mismatch to
adjudication rather than resolving it automatically. The finding lands in each case's `networkTrail`
field and renders in its own **Network trail** section of the evidence page, same placement as
`rca`/`patch`. See `contracts/evidence.md`'s "Network trail" for the full field shape.

---

## Tracker trail

"Tracker validation" above is a standalone report a human points at whatever TRMS ids they name.
This is the same check made a default part of a case's own run — one level down, the same
relationship `check_network_trail.py` has to `preflight.py`'s single-endpoint `gate_mock_proof`.

`scripts/check_tracker_validation.py` checks each case's own `trmsIds` (from `parse_test_cases.py`
— a tracker column the tester tags the case with, or an id mentioned inline in its scenario,
precondition, steps or expected text) against the trace, in the same
`networkWindowStart`/`networkWindowEnd` window `check_network_trail.py` reads:

```bash
scripts/check_tracker_validation.py cases.json results.json --bundle-id <bundle id> \
    --snapshot-dir ~/Documents/<Team>-Test/trms
```

It reports, per case per TRMS id: whether it fired in the window at all, and — when the payload
contract resolved — whether the fire matched it.

**The payload contract is not hand-typed.** This script shells out to the host project's own
already-built extractor, `.claude/skills/ios-analytics-tracker/scripts/extract_webarchive_contract.py`
(discovered under the project's own git root — same convention `$LENS` uses — or `--extractor`),
which reads a tester-saved `.webarchive`/`.html` snapshot of the TRMS tracker-detail page and returns
a payload contract **cross-validated against itself**: the page's `dataLayer.push` script checked
against its own "Tracker parameters" table, with any disagreement reported as a warning rather than
one side silently winning. Snapshots resolve by id under `--snapshot-dir` (default
`$TEST_FORGE_MEDIA_ROOT/trms/`) as `<TRMS-ID>.webarchive`/`.html`/`.htm`.

**Fetching the TRMS page live does not work as a substitute** — it is a client-rendered SPA, and a
plain HTTP fetch returns only the unrendered shell, none of the table or script content. A saved
snapshot is the only source; a missing one is reported as `contractError`, not guessed at.

**One known gap, not silently papered over:** the contract only covers a tracker's flat, top-level
string params (`origin_screen`, `component`, …). An `items[]`-nested value (a products-list
tracker's `items` array) is never a plain string, so the extractor cannot read it as a `key: "value"`
pair either — it surfaces in that id's own `warnings` as a skipped key instead of being silently
passed. Item-level fields are not checked by this gate yet.

An id the case never named, firing inside its window anyway, is reported under
`unexpectedTrmsIds` — the same "fired but not on the list" idea "Tracker validation" above already
surfaces for a whole session, scoped here to one case's window.

**Duplicate fires are flagged by payload, not by count.** A tracker firing more than once in its
window is not itself a problem — a list-impression tracker fires once per distinct card/item in
view, and that's correct. Each hit's payload is compared for exact equality; an identical payload
posted twice lands in `duplicateFires` (a real double-fire bug), while distinct payloads (different
item, different component) do not trip it. Known limitation: two genuinely distinct fires that
happen to serialize identically would misread as one duplicate — flagged, not silently assumed
away, same posture as the `items[]` gap above.

**This never changes a verdict**, same reasoning as Network trail above. The finding lands in each
case's `trackerTrail` field and renders in its own **Tracker trail** section of the evidence page.
See `contracts/evidence.md`'s "Tracker trail" for the full field shape.

---


| `test-flow-recorder` action | Chains into | Why |
|---|---|---|
| Retrofit an accessibility identifier on an *existing* view file | `swiftui-code-gen` if the file imports SwiftUI, else `swift-codegen` | Mirrors `require-codegen-skill.py`'s own `is_swiftui_view_file` classification — invoking the wrong one won't satisfy the gate anyway. |
| Extend `TestForgeDriverKit` (a new command case, a new wait primitive), or append to a shared helper | `swift-codegen` | Imports `XCTest`, not `SwiftUI` — a non-SwiftUI edit under the hook's rules. `tdd`/`swift-unit-testing` target the Swift Testing framework and explicitly ban XCTest, so despite technically satisfying the hook's `ALLOWED_SKILLS` set, they are the wrong semantic choice here. |
| Mock an endpoint/scenario a pack does not already cover | nothing — no `api-mock` skill exists in this repo | Author the rule directly against `preflight.py`'s `REQUIRED_RULE_KEYS`/`REQUIRED_VARIANT_KEYS` schema and install it with `mcp__networklens__lens_mock_endpoint` (or `lens_edit` for a one-off body). This is the only path — NetworkLens is the only mock channel. |

The first two rows are never assumed present — `scripts/audit_platform_skills.py` enforces that the
skill actually exists before `/test-forge-init` finishes setup, and again at the top of Stage 1 Preflight
above; see `platforms/<platform>.md`'s "Host-project skills required" for which platforms declare
the dependency.

---

## Hard constraints

These are non-negotiable. Verify every one before handing a flow back:

1. **Every file this skill writes for a flow lives only under
   `<UITestRoot>/<Module>/<Submodule>/`, never the flat target root.** In the live model that is
   normally just the run report.
2. **A shared helper's existing methods and enum cases are never altered — only new ones may be
   appended.**
3. **The project's existing hand-written UI test files are read-only reference material, never
   edited.**
4. **No fixed-duration wait, in the harness or in a plan.** There is no sleep command; every wait
   polls real UI state.
5. **A harness command reports, never asserts.** Nothing in `TestForgeDriverKit` calls `XCTAssert` or
   `XCTFail`: an assertion would unwind the session on one bad lookup, ending every case still
   queued instead of failing a single step.
6. **A run report is written only after a real run**, and quotes what the tools actually returned.
   Never write a report for a plan that was not executed.
7. **A test case document is never written to.** No `updateConfluencePage` on a test case page, no
   id minted into it, no platform marking. The only page this skill writes is the
   `DEV_TESTING_EVIDENCE` one (Stage 7).
8. **Screenshots and video land locally first and stay there.** `~/Documents/<Team>-Test/<caseId>/`
   is the canonical record; Confluence gets a copy, and only on the evidence page. The repo gets
   documents only — stage media outside it with `--media-dir`.
9. **No absolute home path in anything written to the repo or to Confluence.** Paths are `~`-relative.
   These documents get committed and shared; a `/Users/<someone>/…` path is personal data and is
   wrong on every other machine besides.
10. **Every generated document names who ran the pass.** `--runner`, defaulting to
    `git config user.name`, alongside the build, commit, branch and simulator.

Self-check:

```bash
# Isolation boundary: only Module/Submodule paths, plus additive hunks in any shared helper.
git diff --name-only
git diff <shared helper>   # must show only added lines, never a removed or changed one

# No-sleep check across the harness and anything generated for the flow.
grep -rn "sleep(\|Thread\.sleep\|usleep(" <UITestRoot>/

# Nothing in the harness may assert — one raise ends the session, not the command.
grep -rn "XCTAssert\|XCTFail" <TestForgeDriverKit sources>/
```

---

## Do not

- Do not run `xcodebuild build-for-testing`, and do not boot a simulator. Compiling the test bundle
  is slow, needs the GDN VPN, and fails in ways a person has to read — it stays the developer's
  one-time step. **Restarting the session is not**: `scripts/harness.py ensure` runs
  `test-without-building` against a bundle that already exists, which costs seconds and decides
  nothing, and `queue_cli.py` calls it automatically when a command does not return. A harness that
  dies at case 12 of 40 is a mechanical problem, not a reason to stop and ask.
- Do not write a per-flow `<Screen>TestForgeTest.swift`. A flow is a command plan executed live; a
  compiled regression export is a possible future step, not this skill's output.
- Do not write into a stub UI test target. A project often carries an unused Xcode-generated one
  alongside the live one; confirm which target the scheme actually builds. Writes are confined to
  `<UITestRoot>/<Module>/<Submodule>/`, including refusing that target's own flat root if asked.
- Do not auto-insert an accessibility identifier without explicit per-identifier confirmation via
  `AskUserQuestion` — never silent auto-insert, and never treat a batched "yes to all" as
  a license to skip listing what's being added.
- Do not paste or attach captured screenshots anywhere but the `DEV_TESTING_EVIDENCE` page — not
  the test case document, not Slack, not a PR, not chat. They may contain real-looking
  QA-environment account/order/payment data (Stage 4).
- Do not arm a pack variant whose response carries timestamps without rendering it first (see the platform's mock section) —
  the epoch-millis are base64-hidden, and a stale one silently produces a wrong-looking screen that
  reads as an app bug.
- Do not treat a mismatch as an app bug on the test case document's word alone. Check the feature's
  tech docs and the code that formats the value before writing `DISCREPANCY` (Stage 5).
- Do not record `authority: app-wrong` on scope with no tech document. Two parties disagreeing is
  not a fault; the ruling is the developer's, and the run's job is to make it a one-minute decision
  (`contracts/healing.md`).
- Do not write `derived-reference.md`, or any other documentation, into the scope's own source
  folder. It belongs in the run folder; promoting it into a module's `docs/` is a separate reviewed
  change.
- Do not begin a run on undocumented scope without an entry point. Discovering at case 20 that the
  screen is unreachable wastes every fixture set up for the previous 19.

---

## Deferred — do not expect these today

| Deferred | Why |
|---|---|
| A compiled regression export | Emitting a standing `<Screen>TestForgeTest.swift` from a proven plan is a plausible later step, once the live path has real mileage. Not an output today. |
| NetworkLens-change → regression-guard hook | A `PostToolUse` hook can't boot a simulator or drive a flow, so the honest scope would be a static drift-detector plus a printed nudge, not an automated pass/fail gate — worth its own small hook someday, not part of this skill. |
