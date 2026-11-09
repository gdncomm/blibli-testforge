# iOS platform — the reference driver

The iOS implementation of `contracts/commands.md`. Everything here is specific to XCUITest,
NetworkLens and this repository's layout; the orchestration, healing bounds and evidence shapes live
in `SKILL.md` and `contracts/` and are shared with every other platform.

Two independent MCP channels do the work, and both are needed:

| Channel | Controls | Comes from |
|---|---|---|
| `mcp__networklens__*` | the **data** layer — which mock rule/variant/scenario is live | the **host project's own** `.mcp.json` (e.g. `tools/networklens-mcp` in an app that already links NetworkLens) — this plugin vendors no copy of its own; see `contracts/dataplane.md`'s `networklens` driver entry |
| `mcp__test-forge-driver__*` | the **screen** — taps, typing, scrolls, swipes, element reads, screenshots, app relaunch | `mcp/test-forge-driver-mcp` → `TestForgeDriverSession.swift` |

They cannot share a queue: `GET /commands` drains destructively, so each channel needs its own port
(8788 for data, 8789 for screen).

closes. Manual verification through NetworkLens's in-app overlay stays perfectly valid and is not
replaced by this skill.

> **Infrastructure — nothing to bootstrap per run.**
>
> The harness ships as an SPM product, `TestForgeDriverKit`, so a project consumes it rather than pasting
> sources into its own UI test target. `/test-forge-init` does the wiring.
>
> - `TestForgeDriverKit/TestForgeDriverRunner.swift` — the persistent harness. Built **once**, then serves every
>   flow. Extended only by adding a command case, which costs that one-time rebuild again.
> - `TestForgeDriverKit/TestForgeDriverConfiguration.swift` — bundle id, launch arguments, media root, control
>   host and port, idle bound. Defaulted from the environment `/test-forge-init` writes, so the common case
>   needs no Swift; a subclass overrides `configuration` when a launch path is unusual.
> - `TestForgeDriverKit/TestForgeWait.swift` — the wait and scroll primitives the harness composes. **Nothing
>   here asserts**: an `XCTAssert` failure unwinds the session and ends every case still queued.
> - `TestForgeDriverKit/ArtifactRecorder.swift` — screenshot capture, invoked live via `test_forge_screenshot`.
> - `TestForgeDriverKit/ScreenChain.swift` — the generic hop-traversal engine, useful as the *shape* of a
>   traversal; no per-flow instance is generated.
> - **In the host project**, one file only: a subclass declaring the test method.
>   XCTest enumerates test classes from the .xctest bundle's own image, so a class reached only
>   through a linked product may never be discovered.
>
>   ```swift
>   import TestForgeDriverKit
>
>   final class TestForgeDriverSession: TestForgeDriverRunner {
>       func testLiveSession() { runLiveSession() }
>   }
>   ```
>
> - `test-forge-driver-mcp` — the MCP server and command queue (port 8789, `TEST_FORGE_DRIVER_CONTROL_PORT` to
>   change it) that the harness polls, registered as `test-forge-driver`.
> - `scripts/hash_step.py` — per-step content hashing for the run report (`SKILL.md`, Stage 6).
> - `scripts/classify_module.py` — the Module/Submodule determination below; run it rather than
>   re-deriving a taxonomy by hand.
> - `scripts/dataplane.py` — the data-plane resolver (`TEST_FORGE_DATA_PLANE`), and the one place that globs
>   `trace*.ndjson` for rotation. See `contracts/dataplane.md` for the driver registry.

---


---

## Host-project skills required

**Required: yes**

A view-code codegen skill covering every file kind this project uses (SwiftUI and/or UIKit). Every
accessibility-identifier retrofit below, and any edit to `TestForgeDriverKit` itself, chains into it (see
the "chains into" table in `SKILL.md`) — there is no path through this driver that avoids it.
Discovered the same way `scripts/propose_skill_extension.py` already does: a codegen-gate hook's
`ALLOWED_SKILLS`, or failing that a keyword heuristic over each project skill's description.
`scripts/audit_platform_skills.py --platform ios` runs this at `/test-forge-init` step 8 and again, cheaply,
at the top of Stage 1 Preflight — missing means both stop rather than guess.

---

## Accessibility identifiers — the map, and the gated retrofit

1. Build the inventory for the scope, which resolves each identifier to the **string the app
   actually applies** rather than to the name of the enum case that carries it:

   ```bash
   scripts/scan_identifiers.py <scope folder> [--helper-root <SPM checkout>]
   ```

   A bare grep is the fallback when the scanner cannot run, and it has to cover the wrapper as well
   as the two direct forms:

   ```bash
   grep -n "accessibilityIdentifier\|AccessibilityIdentifier\.\|setAccessibilityIdentifier(with:" <code-reference-file>
   ```

   `setAccessibilityIdentifier(with:ignoreSubviews:)` is, in this codebase, by far the most common
   applier — and it is **declared outside the repo**, in a shared UI SPM package. Grepping the app
   tree for its declaration finds nothing, which is why the scanner takes `--helper-root`: a call
   whose declaration it cannot resolve is recorded as external rather than dropped.

2. Walk the parsed test-case steps and list every UI interaction they imply (tap, type, scroll to,
   assert-visible). Cross-reference against what the identifier grep found.

3. For every interaction with **no** matching identifier, propose the exact new case name, the
   **identifier string it would carry**, the enum it would be appended to (the one that view's
   existing identifiers already come from — the inventory names it), and the file/line it would be
   applied to. **Batch every proposal into one `AskUserQuestion` call** — never insert an identifier
   silently, and never fire one `AskUserQuestion` per gap.

4. Wait for explicit approval. Only approved identifiers get added — anything declined or left
   unanswered is skipped, and the affected step is flagged as ungenerated in the tracking doc
   rather than guessed at.

5. Apply approved additions:
   - The identifier itself (`.accessibilityIdentifier(...)` / `setAccessibilityIdentifier`) is
     retrofitted onto the *existing* view file that needs it — an edit to production code outside
     the UI test target, so it is not subject to this skill's folder-isolation constraint, only to
     the chaining rule below.
   - **Do not assume one central identifier enum.** A large app typically holds many — per module,
     per feature, and file-private ones whose names collide across files — reached through several
     different accessor spellings (`.rawValue`, `.identifier`, `.accessibilityId`, `.value` are all
     in live use in this codebase). A new case is appended to **the enum that view already uses**,
     which the scanner names for each existing identifier in that file. Never reorder, rename, or
     remove an existing case, and never invent a new central enum where the project has none.
   - **`rawValue` is not the case name whenever the declaration carries an explicit `= "…"`.** One
     enum routinely mixes `case sellerName` (implicit) with `case headerSelectedCheckbox =
     "Selected_Checkbox"` (explicit). A plan that addresses an element by case name addresses
     nothing.
   - **And the accessor is not a suffix to strip — it is a property with a body that often
     transforms the value.** `CartAccessibility.CartFooterView.totalAmountLabel.identifier` returns
     `"Totalamountlabel"`, because that enum's accessor is `return self.rawValue.capitalized`. Other
     accessors return `"\(self)"` (the case name, *even where a raw value is declared*), apply
     `.capitalizedFirst`, or `switch` on `self` and return a different string per case. Reading such
     a site as its `rawValue` produces a plausible identifier that matches no element on screen.
     Two enums in the *same file* can differ here, so this cannot be decided per project or per
     file. The harness needs no enum at all — it matches on the raw identifier string a command
     carries, which is what the scanner resolves, following the accessor body.
   - **This retrofit lands as its own commit, separate from anything else in the flow** — it
     changes production view code and deserves scoped review on its own.

6. Chain into the correct codegen skill for the retrofit (see the chaining table below) **before**
   making the edit — `swiftui-code-gen` if the file imports SwiftUI, else `swift-codegen`.

---


---

## Legacy scope — resolving on iOS what a document would have given you

SKILL.md Stage 2 classifies the posture and lists what has to be substituted. This is how each
substitution is done on iOS.

**File paths.** `repo-index`, never a manual walk of the folder:

| Need | Query |
|---|---|
| the view type by exact name | `symbol query decl <Name>` |
| the view type by description | `symbol query find "<words>"` |
| the mapper/handler behind it | `symbol query func "<name or words>"` |
| who presents the screen | `uses <ViewControllerName>` |

`uses` on the screen's own type is the one that finds the entry point when nobody remembers it — a
legacy screen is usually pushed from a router case or a deeplink handler, and that call site names
the deeplink the run needs.

**Endpoints.** `scan_scope.py` reports string literals only. A legacy screen commonly builds its
path by interpolation or reads it from a constants enum, so run the flow once with
`lens_set_mocking(false)`, then capture — the trace is the authoritative list. Watch for endpoints
called from a shared manager rather than the screen: they appear in the trace and belong to the
flow, but no literal in the scope folder mentions them.

**Addressing, and why UIKit and SwiftUI differ here.** A legacy screen's identifier coverage is
usually low, and the fallback is not equally viable on both:

- **UIKit** degrades gracefully. `UILabel`/`UIButton` expose their text as an accessibility label
  automatically, so `test_forge_tap_by_label` and `test_forge_get_labels` work without any retrofit. The exception
  is a container that called `setAccessibilityIdentifier(with:ignoreSubviews: true)` — that marks
  the subtree as one accessibility element and **everything inside it becomes unaddressable**. Check
  for `ignoreSubviews: true` before concluding a child is missing.

  **`ignoreSubviews` defaults to `true`, so the plain call collapses the subtree too** — the
  parameter does not have to appear at the call site for this to happen, and in this codebase it
  usually does not. The consequence is that source and runtime legitimately disagree: the file
  declares identifiers for children the accessibility tree will never expose. That is an expected
  condition of the wrapper, not a scanner defect and not a missing retrofit, and it is why
  `scripts/scan_identifiers.py` records `collapsesSubtree` per site. A child declared under such a
  container needs the container's call changed to `ignoreSubviews: false` before any identifier
  inside it can be addressed at all.
- **SwiftUI** does not. A `VStack` or a custom container has no label to match, so a case that has
  to address a *section* rather than a leaf text has no fallback and needs either the retrofit or an
  `UNVERIFIABLE` verdict. Say which of the two it is when reporting, rather than reporting the case
  as failed.

`test_forge_dump_tree` truncates silently, and a legacy screen's hierarchy is usually deep enough to hit it.
Always scope the dump to a subtree rather than dumping the window and trusting what came back.

**Retrofit cost.** The gated retrofit above is unchanged on legacy scope, but its scale is not: a
scope where most view files carry no identifier turns the batch prompt into dozens of proposals. Ask
only for the identifiers the parsed cases actually need — not for full coverage of the scope — and
keep the retrofit as its own commit, which matters more on a legacy module where a parallel
migration may be in flight on the same files.

**Module/Submodule.** Unchanged: the classification below reads the file path against the taxonomy,
which needs no documentation to work. This is the one input a legacy scope supplies for free.

---

## The `test-forge-driver` vocabulary


| Tool | Key params | Returns | Notes |
|---|---|---|---|
| `test_forge_status` | — | endpoint, harness reachability, booted devices | Start here. |
| `test_forge_open_deeplink` | `url` | confirmation | **Host-side**, works with no harness. |
| `test_forge_tap` | `identifier`, `index?`, `force?` | `{found, hittable, forced?}` | Waits for existence, a valid frame **and** hittability. Refuses if it never becomes hittable. |
| `test_forge_tap_by_label` | `label`, `labelMatch?`, `index?`, `force?` | `{found, hittable, matches, ambiguous?}` | For components with no identifier. `ambiguous` means the tap went to the first of several. |
| `test_forge_type` | `identifier`, `text`, `keepKeyboard?` | `{found, hittable, valueAfter, keyboardDismissed}` | Taps to focus, types, then **brings the keyboard down**. Read `valueAfter` — it is how a keystroke sent nowhere shows up. |
| `test_forge_scroll_until_exists` | `identifier`, `scrollViewIdentifier?`, `maxAttempts?` | `{found, hittable, attempts}` | Deep swipe-up until found. **Does not tap** — follow with `test_forge_tap`. |
| `test_forge_swipe` | `direction` (up/down/left/right) | `{ok}` | No target element. |
| `test_forge_scroll_to_top` | `identifier?`, `maxAttempts?` | `{found, attempts}` | Swipes down to a top marker. |
| `test_forge_wait_for_exists` / `test_forge_wait_for_not_exists` | `identifier`, `timeout?` | `{exists}` | Polls; the only kind of wait there is. |
| `test_forge_get_label` | `identifier` | `{label}` | One element's text. |
| `test_forge_get_labels` | `containerIdentifier?`, `elementType?` | `{labels, count, truncated}` | Tree order — one call for a whole row. **Must be scoped** (see traps). Caps at 200. |
| `test_forge_get_element_count` | `containerIdentifier`, `elementType?` | `{count}` | |
| `test_forge_get_frame` | `identifier`, `elementType?`, `index?` | `{x, y, width, height}` | Position/order/size assertions. With `index`, walks the slots of a repeated identifier — how a carousel's centred page is identified (centre slot ≈ x 28, peek ≈ 408, off-screen negative). |
| `test_forge_assert_exists` | `identifier`, `expected?` | `{pass}` | Structural pass/fail. |
| `test_forge_alert_tap` | `buttonTitle` | `{found}` | Exact title, e.g. the routing chooser. |
| `test_forge_screenshot` | `label`, `caseId?`, `mustBeVisible?`, `keepKeyboard?` | `{path, device, keyboardVisible, visibility?}` | Dismisses the keyboard first. `caseId` gives the case its own folder and step numbering. **Always pass `mustBeVisible`** with what the case asserts — `visible: false` means the image does not support the row. |
| `test_forge_dismiss_keyboard` | — | `{keyboardVisible, keyboardDismissed}` | Through the keyboard's own key, never a blind tap. Use it when a keyboard has leaked in from an earlier case. |
| `test_forge_device_info` | — | `{deviceName, osVersion, udid, screenPoints}` | Which simulator this session is driving. Record it against every case. |
| `test_forge_dump_tree` | `identifier?`, `elementType?` | `{tree, truncated}` | Reach for it on any surprising miss. Output is capped — scope it with `identifier` + `elementType` and check `truncated` (see traps). |
| `test_forge_relaunch_app` | — | `{ok}` | Harness survives; the app restarts. |
| `test_forge_start_recording` | `caseId` | path being written | **Host-side** `simctl io recordVideo` (hevc). One per case; must be stopped. |
| `test_forge_stop_recording` | `caseId` | path + size | Finalizes the `.mov`. Skipping it leaves an unplayable file. |

`elementType` is optional everywhere and defaults to a type-agnostic match — leave it off unless
disambiguation is genuinely needed. `index` reaches the Nth match of a repeated identifier or label.

**A colour expectation is assertable — sample the screenshot.** "Header falls back to
`neutral.background.low`", "toolbar assets render inverted" and "header uses the campaign's
`background.start`" all read as unautomatable, but the screenshot on disk answers them exactly:

```bash
scripts/pixel.py <shot>.png statusBar=214,20 navBand=214,69 tabBand=5,95 navLogo=56,57,102,24
```

Two forms: `x,y` samples one point, `x,y,w,h` reports a rect's darkest and lightest pixel — the
rect form is what reads antialiased text and icons, where a single sample lands on a blend.
Coordinates are **points**; the script scales by the image width against a 428pt screen. Resolve the
expected token from `blue-design-tokens` rather than eyeballing it (`aliasToken.neutral.background
.low` → `gray99` → `#F9F9FA`), and prove an inversion by *differencing* two runs rather than judging
one: a 2026-09-03 run found the wordmark and pager dots flip with `invertMode` while the back and
trailing nav icons stayed pixel-identical at `#797F85`, which no single screenshot would have shown.

---


---

## Mock state on iOS: packs first, then a direct rule

Work out **which endpoint + which variant** a test-case step implies (e.g. "verify the error state
when payment fails" → the `Error 500` variant on the payment endpoint), then arm it in this order
of preference:

1. **An existing `.networklens-pack.json` scenario** — `mcp__networklens__lens_import_pack`, then
   `lens_apply_scenario` / `lens_set_variant`. Packs already carry named, reviewed combinations
   ("everything empty", "backend down", "products slow (3s)") that match how test-case
   preconditions are usually worded, so nothing needs authoring. Ask the user for the pack path
   when a test case's precondition sounds like a scenario but no pack is loaded.
2. **A directly authored rule, for the gaps a pack does not cover** — no `api-mock` skill exists in
   this repo to delegate to. Author the rule against the schema `preflight.py --rule` validates
   (`REQUIRED_RULE_KEYS`/`REQUIRED_VARIANT_KEYS`), and install it with
   `mcp__networklens__lens_mock_endpoint` (`lens_edit` for a one-off body change in place). Never
   hand-edit `session.json` — it is the app's own file.

3. **A rendered fixture template, whenever the response carries timestamps.** A pack stores every
   response body base64-encoded, so its epoch-millis are invisible to review and to `grep` — the
   positive variants of a pack recorded years ago can be dated **February 2020** with nothing in the
   file saying so. Never arm such a variant directly. Instead:

   ```bash
   # once, to convert an exported pack into a reviewable template with relative tokens
   scripts/render_fixture.py templatize <pack>.json -o fixtures/<name>.template.json
   # before every run, to resolve those tokens against the current clock
   scripts/render_fixture.py render fixtures/<name>.template.json -o <tmp>/rendered.json
   ```

   Tokens are `{{now}}`, `{{anchor}}`, `{{startOfDay}}`, `{{endOfDay}}`, each with an optional
   `±<count><s|m|h|d>`. Intervals survive rendering exactly, so "starts 2h before now, ends 4h
   after" holds on any day. Anchor a window to `{{startOfDay±…}}` when the assertion is about a
   *calendar day* (a tab label reading `Today`/`Tomorrow`/`d MMM yyyy`), and to `{{now±…}}` only
   when the schedule must genuinely be in flight. Import the **rendered** file, never the template.

4. **Generated variants, when a case needs the working response with one thing changed.**
   `scripts/make_variants.py <template> <spec>` applies named mutations to a base variant, so the
   twenty fields that were meant to stay identical cannot drift:

   ```jsonc
   { "endpointKey": "GET /<service>/<resource>",
     "baseVariant": "Range-FS",
     "variants": {
       "Range-single-campaign": [{"op": "keep",   "path": "data", "count": 1}],
       "Range-inverted":        [{"op": "set",    "path": "data[*].background.invertMode", "value": true}],
       "Range-many-products":   [{"op": "grow",   "path": "data[0].products", "count": 6},
                                 {"op": "renumber", "path": "data[0].products", "field": "sku", "format": "MOCK-SKU-{i}"}],
       "Range-delayed-5s":      [{"op": "respond", "field": "delay", "value": 5}] } }
   ```

   Ops: `set` · `remove` · `keep` · `grow` · `rename_key` · `move` (relocate a value) · `renumber`
   (give a grown list unique per-item ids — `grow` deliberately does not, and duplicate keys can
   collapse a list down to one rendered card) · `respond` (edits the envelope, so `delay` and
   `statusCode` are reachable). A spec whose `endpointKey` is not in the pack also needs
   `newEndpointFrom` (`{endpointKey, variant}`): the rule is created from scratch and each variant
   starts as a copy of that other endpoint's body, which `move`/`remove` reshape into the new
   response model. That is how an endpoint the recorded pack never captured gets fixtures without a
   hand-written body. Values may carry fixture tokens, so run
   `render_fixture.py render` afterwards.

5. **A one-off composite, without touching the pack at all.**
   `mcp__networklens__lens_set_variant_body` with `file:` and `activate: true` adds a named variant
   to the live rule from a local JSON file — no re-render, no re-import, and therefore **no re-arming
   of every other endpoint**. Reach for it when one assertion needs a combination the pack has no
   business carrying permanently: "the long title *and* an upcoming start", or a probe fixture whose
   only job is to disambiguate (a `#FF0000` campaign background proves the header cascade reads the
   campaign rather than the main schedule, which two identically-coloured fixtures never could).
   Build the body from the rendered pack in `python`, write it to the scratchpad, push it, and name
   it in the run report like any other variant.

### The API baseline reference — capture it once, mutate from it forever

Every mutation in step 4 is only as good as the body it starts from, and a body written by reading
a Swift model is only as complete as whoever read it. Miss one optional field and, where every field
is `decodeIfPresent`, the decoder accepts the fixture in silence — the only symptom being one control
that quietly does nothing, which reads as a bug in the app rather than a hole in the fixture.

So the feature keeps one **captured** response per endpoint under
`fixtures/<feature>/api-responses/`, plus a `manifest.json` recording where each came from:

```bash
scripts/capture_baseline.py --out-dir fixtures/<feature>/api-responses \
    --manifest fixtures/<feature>/manifest.json \
    --endpoint /backend/... [--endpoint …] \
    [--from-pack fixtures/<name>.template.json --pack-variant "/backend/...=Range-FS"]
```

It reads `trace.ndjson` from the booted app's container (never a cached container path — the uuid
changes on every reinstall), takes the **largest** live non-mock 200 per endpoint (an endpoint
answers empty far more often than populated, and an empty baseline teaches a fixture author
nothing), and templatizes timestamps on the way in so a baseline is time-relative from birth.

Three provenance levels, always explicit in the manifest — **`captured` > `pack` > `authored`**,
with `missing` for an endpoint that has none. A capture only works if the backend had data when it
ran: an environment that answers the entry endpoint with an empty collection leaves every endpoint
downstream of a selection uncalled, so a screen's later requests never happen and there is nothing
live to take. `--from-pack` covers that with a recorded pack
variant (real traffic, second-hand and undated), and re-running in a session where live data flows
upgrades the entry to `captured` on its own. Say the provenance in the run report: a discrepancy
found against a `pack` or `authored` body is weaker evidence than one found against a `captured` one.

Then check each baseline against the type that decodes it:

```bash
scripts/check_baseline.py --responses-dir fixtures/<feature>/api-responses \
    --manifest fixtures/<feature>/manifest.json --source-root <app source dir> [--update-manifest]
```

Record each endpoint's decoding type in the manifest once, as `models: ["<SwiftType>@<json path>"]`
(`data`, `data[*]` to fan out over a list, `data.products[*][*]` for a dictionary of lists), and no
`--model` argument is ever needed again. Two findings, neither a failure, because both are legal:

| Finding | Means | What to do |
|---|---|---|
| `model-only` | the type declares it, the baseline lacks it | the dangerous class — any case depending on that field is silently unexercisable; add it from a real response, never invent a value |
| `body-only` | the baseline carries it, the type ignores it | a stale capture against an older contract, or a field the app has not adopted — usually harmless, occasionally a rename |
| `~` union note | over half the declared fields are absent | a shared union model (`HomeProduct` carries every field any surface ever needed), not a baseline gap — compare against the surface's own type instead |

A key rename shows up as *both* at once, and that pairing is the highest-value signal the check
produces. A fixture carrying `isOfficial` where the app decodes `official`
(`case isOfficial = "official"`) means the badge it drives could never render from a mock — invisible to the decoder, invisible to review, caught here in one line.

`--update-manifest` writes the gaps back under `modelCheck`, so a later run can state *why* a case
that needs an absent field is unexercisable instead of rediscovering it.

### Live channel first — check it before assuming a relaunch

`NetworkLensBootstrap` now starts with `control: ControlOptions()`, so every mutating
`mcp__networklens__*` call (`lens_import_pack`, `lens_set_variant`, `lens_set_mocking`,
`lens_mock_endpoint`, `lens_delete_rule`) installs into the **running** app over loopback. Run
`mcp__networklens__lens_live` when a mock seems not to have applied — it says whether writes are
reaching the app or only the session file.

- **Live:** no relaunch. But a screen already on display will not refetch by itself — re-trigger
  the call the case cares about (switch schedule tab, pull to refresh, re-enter the screen), which
  is both faster than a relaunch and closer to what a manual tester does.
- **Not live** (older build, or the app was launched without the control channel): rules are
  file-based, take effect only on a fresh launch, and the app overwrites `session.json` from memory
  while it runs — so terminate the app, write, then launch. `mcp__test-forge-driver__test_forge_relaunch_app`
  is that launch, and the harness survives it.

**Importing resets arming.** `lens_import_pack` replaces the rules and leaves every one of them
`off` with its active variant reset — so a re-import mid-batch silently drops the whole screen back
to live backend data. A 2026-09-03 run lost a banner element that way and briefly looked like a
missing-identifier bug. Import once at the start, then arm with `lens_set_variant`; if a fixture has
to be re-rendered mid-batch, re-arm every endpoint the batch depends on afterwards and confirm with
`lens_mocks`.

**Pin every endpoint the assertion depends on, not just the obvious one.** The same run passed a
"switching controls hidden with one campaign" case, then found the controls *present* with the same
campaign fixture — because Special Placement is itself a carousel page and had been left on live
data. An endpoint left unarmed is an uncontrolled variable, and `lens_mocks` is the cheap way to see
which ones are still live.

Because the live channel makes a variant swap a single command, a case that needs two data states
(five schedules, then the same five plus an expired one) is one plan, not two harness sessions —
and building a variant on the spot from an observed response beats hand-authoring a pack body.

Note in the run report which rule/variant a step ran under; a step whose result depended on an
unrecorded mock state cannot be re-checked later.

---


---

## Choosing and recording the simulator

`xcrun simctl list devices booted` is the ground truth for what is running. More than one booted
simulator is the normal state on a working machine, and **nothing in a driver result says which one
answered** — so the target is settled before the first case, not inferred afterwards.

- The harness is launched against a destination by **UDID**, never by device name. Two runtimes
  routinely carry the same name (`iPhone 15` on iOS 17 and on iOS 18), and a name-based destination
  picks whichever the toolchain feels like.
- `test_forge_device_info` returns what the runner process sees — `SIMULATOR_DEVICE_NAME`,
  `SIMULATOR_RUNTIME_VERSION`, `SIMULATOR_UDID`, and the app frame in points. That is the value
  written into each result's `device`, and it is read from the session rather than from whatever the
  run was asked to target, so a mismatch between the two is visible instead of silent.
- Screen size is reported in **points**, not pixels. Layout, truncation and line-count behaviour keys
  off points; two devices with different pixel counts and the same point size will lay out
  identically, and reporting pixels invites a matrix that proves nothing.

### A screen-size sweep is a per-case decision

A matrix run costs one full pass per device. Worth it for a case about layout — truncation, wrapping,
a control that fits on one screen and not another, a footer that needs scrolling on the small one.
Worth nothing for a case about data, where the device cannot change the answer.

Pick the cases, not the sheet. Then run those ids on each device and leave the rest on one, and let
the report say plainly which cases were single-device — a run that cannot distinguish "passed
everywhere" from "passed on the only device it was tried on" is claiming coverage it does not have.

Smallest and largest supported is usually the whole matrix worth running: a case that survives both
ends rarely fails in between, and the two ends are where the interesting failures live.

## The keyboard is the obstruction that matters on iOS

It covers the lower half of the screen, it is raised by any text entry, and **it does not come down
by itself**. Every consequence of that has already cost this project something:

| What it breaks | How it presents |
|---|---|
| Evidence | The screenshot for a case six steps later shows a keyboard over the region the verdict is about. The verdict is right — it was read from the accessibility tree, which sees through it — and the image does not support it |
| Gestures | Anything beneath it is not hittable. A tab bar under a keyboard silently swallowed taps, and two cases recorded a false `PASS` before the driver was made to report hittability |
| Recordings | Same as evidence, and unrecoverable — a still can be retaken after the fact, a clip covering a case that has moved on cannot |

The driver handles this rather than the plan remembering to: `test_forge_type` dismisses the keyboard when it
finishes, `test_forge_screenshot` dismisses before the shutter, and `test_forge_start_recording` dismisses before the
clip starts. Dismissal goes through the keyboard's **own** dismiss key — `Done`, `Return`, `Go`,
`Search`, `Send`, `Hide keyboard` — or a return sent to whatever holds focus. It never taps a blank
area to shed focus: that is a tap at a coordinate nobody checked, and it is how a run navigates
itself onto a screen the next case did not expect.

`keepKeyboard: true` is the opt-in for a case whose assertion genuinely is about the keyboard — its
appearance, its type, its return key. It is not a way past a failing `mustBeVisible` check.

## Why a mid-animation frame is unobservable on iOS

This is worth stating precisely, because "we could not catch it" and "it cannot be caught" are
different claims and only the second one is true here.

XCUITest waits for the application to **quiesce** before it answers a query or takes a screenshot.
Every element lookup and every capture is therefore serialised behind the animation finishing. The
frame a case like "the panel is half faded in" describes does not exist at any moment the driver can
observe — it is not a timing problem to be solved with a tighter poll, it is excluded by the way the
framework synchronises. Chasing it with shorter timeouts produces flake, not evidence.

Two further consequences:

- **`isHittable` and `frame` describe the settled state.** A `getFrame` before and after an animation
  is a real, reliable measurement of *what moved and to where* — that part of an animation case is
  fully verifiable, and should be verified rather than lumped in with the rest.
- **Frame rate, jank and easing need a different instrument.** They are Core Animation / Instruments
  questions (`Animation Hitches`, the Core Animation FPS track), not accessibility-tree questions.
  The report should say which instrument would answer it, so the row reads as "measured elsewhere"
  rather than "unmeasurable".

Anything genuinely mid-transition is also invisible to a screenshot for the same reason, so the
honest evidence for it is the **recording** — which is why an `UNVERIFIABLE` case awaiting human
review is not exempt from the recording requirement, and a `BLOCKED` one is.

## iOS traps

### Trap — the MCP's container path goes stale on every reinstall

`xcodebuild test-without-building` reinstalls the app, which gives it a new data container. The
`networklens` MCP resolves that path once and keeps reporting the old one, so after a harness
restart every trace read answers "No trace" for a trace sitting in the new container, and every file
write lands somewhere the app will never read. `lens_status` still prints
`resolved: simctl container for …`, which reads as a fresh resolution and is not one — compare its
path against `xcrun simctl get_app_container booted <bundle id> data` before believing it.

Worse, the failure is asymmetric: the **live channel** keeps working, so `lens_live` says "Live" and
`lens_set_variant` reports success while the running app holds no rules at all. The reliable check is
the trace itself — `isMockServed` on the endpoint you just armed. `lens_live`'s rule count is the
second check: it reports what the *app* holds, not what the session file says.

`preflight.py --mcp-container "<the path the channel printed>"` makes this a one-command check
rather than something to remember to compare by eye.

A symlink from the dead container path to the live one restores reads without restarting anything,
but it goes stale on the next reinstall in turn. The real fix is restarting the MCP server so it
resolves the current container, which is a `/mcp` reconnect and therefore the developer's action —
ask for it rather than working around it a second time.

### Trap — the trace escapes forward slashes, so grep finds nothing

`trace.ndjson` is JSON with `/` written as `\/`, so `grep "<service>/<resource>" trace.ndjson`
answers 0 for an endpoint that is in the file three times. Parse the trace as JSON — every script
here does — or grep for a fragment with no slash in it. A grep that comes back empty is not evidence
the endpoint was never called.

### Trap — a field that is present but redacted

NetworkLens redacts by key term and matches on token prefixes, so a term like `card` blanks every
key that merely starts with it — UI copy such as a card's overlay message or its type — to the string
`<redacted>`, in the trace *and* in any exported pack. The key is present, so nothing reports it
missing, and an assertion on the rendered text will happily match a placeholder. `check_baseline.py`
flags these; a fixture that needs the real value must `set` it explicitly.

### Trap — `test_forge_status` can say "never polled" while the harness is running

The attach flag tracks queue polls and goes stale. A live harness reports
`harness attached: false (never polled)` after a restart even though its own log says
`Live session listening`. Do not restart on the strength of that line — send one cheap real command
(a `screenshot`) and believe the result instead.


---

## Module/Submodule folder determination

Every generated or modified file for a flow lands in `<UITestRoot>/<Module>/<Submodule>/`. The
taxonomy is data, not code: a project that publishes a module map supplies it, and a project that
does not gets the folder shape it already has. Run the classifier rather than deriving either by
hand:

```bash
python3 <skill>/scripts/classify_module.py "<code-reference file path>" [--taxonomy <file.json>]
```

Resolved in order: `--taxonomy`, `$TEST_FORGE_TAXONOMY`, `./.claude/test-flow-recorder/taxonomy.json`.

**With a taxonomy**, matching order — restated here so the logic is auditable without reading
Python:

1. **Promoted modules first.** A promoted module declares its real code location(s) and takes
   priority over the architecture folder it physically lives inside, so a file under
   `<Parent>/<PromotedModule>/...` classifies as the promoted module, not the parent.
2. **`submoduleFolders`, when a module declares them.** Some modules' submodules each own a
   distinct subfolder rather than sharing one flat location, and one such folder is often a parent
   of another — so the deepest (most specific) matching folder wins, never list order.
3. **Remaining modules fall back to the plain rule** — top-level folder = module — and only once
   no promoted location matched.
4. **`General` is the universal fallback.** Every module has one; the classifier never returns a
   blank submodule.

**Without a taxonomy** the fallback is the shape almost every app already has: top-level folder is
the module, the next folder down is the submodule, `General` when the path is only two segments
deep. Right for the great majority of projects, and honest when it is wrong — it names folders that
actually exist rather than inventing a bucket.

If the output looks wrong for a path — it falls back to `General` where a finer submodule clearly
applies — **ask the user to confirm the folder before generating.** Never silently guess past the
script's own output.

A run report is markdown and needs no target membership, so a new `Module/Submodule` folder usually
needs no project-file edit at all. Only a **Swift** file added to the UI test target does. When that
happens, hand-edit `project.pbxproj` (fresh collision-checked UUIDs for the
`PBXBuildFile`/`PBXFileReference`/`PBXGroup` entries plus the target's `files` array), then verify
with `plutil -lint`, a **read-only** parse, and `git diff --stat` showing **zero deletions**. Never
a tool's whole-file rewrite path: it silently drops SPM package references and other objects it
cannot round-trip.
