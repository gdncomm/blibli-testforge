# Evidence contract

The three files a run reads and writes, and the media naming that makes an evidence page reviewable.
Platform-neutral: an Android or web run produces the same shapes, so the report generator and the
publish step are shared.

## Where a run's state lives

Never in the repo. The repo receives **documents only** — a 50MB media directory inside a source
tree is a mistake that survives review.

```
~/Documents/<Team>-Test/<feature>-run/
    pages/<pageId>.md        verbatim test-case page body, as fetched
    pages/index.json         [{id, title, versionNumber}, …]   ← a flat array, not an object
    inputs/cases.json        every page parsed so far
    inputs/results.json      every case run so far
    evidence/                media staged under attachment names
```

`cases.json` and `results.json` are cumulative and **must be kept**. The multi-page overview is
derived from all of them at once, so discarding them means the next page's run cannot rebuild the
overview — the earlier verdicts survive only as prose inside the documents they produced, and the
overview has to be merged by hand. The saved page bodies matter just as much: without them the cases
cannot be re-parsed, and a page edited on Confluence since would silently parse differently.

## Run-level fields

`results.json` is either a bare array of case results or an envelope:

```json
{ "run": { "posture": "undocumented", "scopePaths": ["…"] }, "results": [ … ] }
```

The envelope is where these live, because a verdict read without them is misread. Both shapes are
accepted — every run written before the envelope existed is a bare array and must still regenerate.
`--posture` on `build_evidence.py` overrides `run.posture` for a one-off.

| Field | Notes |
|---|---|
| `posture` | `documented` · `partial` · `undocumented`, from `scan_scope.py` and confirmed by the developer |
| `scopePaths` | the folder(s) the scope was resolved to — the only record of what a legacy run considered in scope |
| `referenceDocs` | reference markdown read, or `[]` |
| `endpoints` | the confirmed list, and how each was established (`techDoc` · `trace` · `codeLiteral`) |
| `derivedReference` | path to `derived-reference.md` when the run had to build its own map |

`derived-reference.md` lives in the run folder, not the repo: it is the run's own output, and a
legacy module's source folder is production code a run is not authorised to add documents to.
Promoting it into that module's `docs/` is a separate, reviewed change — and the only thing that lets
a second run against the same scope start at `documented`.

### Devices are a run-level list, not a run-level value

`devices` at run level is every device the run touched, each with the case ids it produced. A run
that only ever used one still records a list of one — the shape does not change with the number of
devices, so a report never has to be rewritten when a second is added.

A screen-size matrix is expressed as the same case id appearing under more than one device. That is
deliberate: `TC-014` on a 4.7-inch phone and `TC-014` on a 6.7-inch one are two results with one id,
and collapsing them loses the only thing the matrix was run to find out.

## `cases.json` — one entry per test-case row

Produced by the parser, never edited by hand.

| Field | Notes |
|---|---|
| `caseId` | from the document where it has one |
| `isPositionalId` | true when minted locally, e.g. `PC-004` from row 4 |
| `positionInTable`, `pageId`, `pageTitle`, `pageVersion` | provenance |
| `sourceHash` | of the normalised step text — how a re-run detects an edited case |
| `scenario`, `precondition`, `steps`, `expected`, `api` | the row's own words |
| `requiresAuth`, `authReason` | drives the auth batch, see the auth gate |
| `authSource` | which signal decided `requiresAuth`, strongest first: `developer` (an explicit `--gated-case`/`--guest-case`) · `techDoc` (the API column names a known auth endpoint) · `probe401` (an `--auth-endpoint` observed returning 401 without a session) · `wording` · `default-gated`. Empty on a guest case that nothing gated. `default-gated` is an **unresolved** classification, not a known one — it fires only when the scope-wide `--preconditions` answer is `signed-in` or `unknown`, and the parser prints how many cases are in that state so they can be narrowed before the run |

A minted id exists for local filenames and the evidence page's own column. **The test-case document
is read-only to a run** and never gains an id it did not already have.

## `results.json` — one entry per case run

| Field | Notes |
|---|---|
| `caseId` | joins to `cases.json` |
| `verdict` | `PASS` · `DISCREPANCY` · `BLOCKED` · `UNVERIFIABLE` |
| `authority` | on a discrepancy only: `app-wrong` · `doc-wrong` · `undecided`. Absent reads as `undecided`. See `healing.md` |
| `authorityReason` | one line on *why* that authority — rendered in place of the generic definition, so a reader sees the actual argument |
| `fixture` | which variant(s) the case ran against, and their provenance |
| `expected` | the document's wording, or a sharper restatement |
| `observed` | what actually happened, with measurements |
| `screenshots` | list of paths. **This key, not `media`** — a wrong key stages zero files and every Evidence line silently disappears |
| `video` | **required on every interacting `PASS`/`DISCREPANCY`** (see below) — one path, or a list of per-attempt recordings named `<caseId>-attempt<N>-<verdict>.mp4`. The failed attempts are the visual proof of what a heal changed, so they survive pruning; anything that is not an attempt does not. `build_evidence.py` fails the run when an interacting case is missing this key |
| `interaction` | optional `true`/`false`, overriding what `commands` implies about whether the case drove the app. Set it when the command trail understates the case — absent **and** with no `commands`, the case is treated as interacting |
| `testForgeSteps` | touch points for reproducing by hand, for the QA reader |
| `commands` | `{tool, args, result}` — the machine-readable trail |
| `expectationSources` | which of `testCases` · `techDoc` · `code` · `developer` the expectation actually came from. An `authority` of `app-wrong` without `techDoc` or `developer` here is not a supportable verdict |
| `notes` | anything a later run needs to know but the case does not assert |
| `recommendation` | `{reason, suggestion}` — a proposal, never an applied change |
| `rca` | `{file, line, symbol, cause}` — where the behaviour comes from and the mechanism behind it. Allowed on **any** verdict, gated on nothing: proving what the app does and why is what turns an `undecided` into a call a developer can make in a minute. It is still not authority (see `healing.md`) |
| `patch` | `{class, diff, callSites, rationale, applied}` — a machine-applicable change, proposed and never applied by the run. Refused outright unless the case is `app-wrong`, carries an `rca`, has a non-empty `diff`, and declares a `class` inside `healing.md`'s whitelist. `build_evidence.py` exits non-zero on any patch that is not, with no override flag |
| `healAttempts` | `[{class, target, change, verdictBefore, verdictAfter, rolledBack}]` |
| `device` | `{deviceName, osVersion, udid, screenPoints}` — **the device this case ran on**, taken from the capture rather than assumed from the run. A case has no device by inheritance: with several simulators booted, or a matrix sweeping smallest to largest, the run-level value is not the case-level one |
| `unverifiableReason` | on `UNVERIFIABLE` only, one of the reason codes below. A bare `UNVERIFIABLE` with no code is not a verdict, it is a shrug |
| `partialVerification` | `{verified: [...], notVerified: [...]}` — what the run did and did not establish, when a case decomposes into both. Most animation cases do |
| `humanReviewRequired` | `true` when the run has produced the evidence but a person has to make the call. Routes the case rather than closing it |
| `proposedRewording` | a sharper version of the case that *would* be checkable. A proposal for the sheet's owner, never an edit to the sheet |
| `evidenceIntegrity` | `{clean: bool, obscured: [{identifier, obscuredBy, obscuredFraction}]}` — whether the captured frame actually shows what the verdict is about. Absent means never checked, which is not the same as clean |
| `networkWindowStart`, `networkWindowEnd` | ISO-8601 timestamps bracketing this case's own commands, recorded manually by whatever drove the run — the same convention as recording `screenshots`/`video` paths. Either absent means `scripts/check_network_trail.py` never checked this case at all |
| `networkTrail` | `{window, expected, missing, unexpected, duplicates, expectedUnparseable}` — written by `scripts/check_network_trail.py`, never by hand. See "Network trail" below |
| `trackerTrail` | `{window, expected, trackers: {trmsId: {fired, contractError?, extractorWarnings?, problems?, duplicateFires?}}, unexpectedTrmsIds?: [{trmsId, fired}]}` — written by `scripts/check_tracker_validation.py`, never by hand. See "Tracker trail" below |

## Root cause and proposed fix

`rca` and `patch` answer two different questions and carry two different risks, which is why they are
two fields rather than one.

`rca` is an explanation. It is welcome on a `PASS`, on a `BLOCKED`, and above all on an `undecided`
discrepancy — a finding that names the file, the line and the mechanism is one a developer can rule
on immediately, where the same finding without them costs an afternoon of re-derivation. Nothing
gates it, and recording one is never a claim that the app is wrong.

`patch` is a change. A later apply-fixes pass may apply it without a human reading the code around
it, so it travels only under four conditions, all enforced:

| Condition | Why |
|---|---|
| `authority` is `app-wrong` | `healing.md`'s rule. A patch on an `undecided` case ships a behaviour change on a document nobody re-validated |
| an `rca` is present | a diff with no named cause is a guess wearing a diff's clothes |
| `diff` is non-empty | there is otherwise nothing to review and nothing to apply |
| `class` is in the whitelist | spacing, text properties, colour tokens, a single-call-site constant, a missing accessibility identifier. Control flow, which response field a feature reads, API calls, threading and ownership are **never** patchable — they stay prose in `recommendation` |

`callSites` must be exactly `1` for `single-site-constant`, because that class exists purely on the
claim that the change cannot reach anywhere else — and "I only found one" is a different statement
from "there is only one". `applied` is always false in a run's own report: a run proposes, and the
separate pass records what it applied.

**The recording gate has an override; this one does not.** An interacting case with no clip is a hole
in the evidence, and `--allow-missing-video` puts that hole on the page for a reader to see. An
unauthorised patch is a code change waiting for a pass that trusts this file, so it does not ship at
all — the build fails and names each ground.

Neither field appears in the results table. That table is fixed at eleven columns below, and a file
path and a unified diff have nowhere to sit in it; they render as their own **Root cause and proposed
fixes** section, kept separate from the recommendations for the test case document because those two
have different owners. An `app-wrong` verdict with no `rca` is called out as a gap in that section:
naming the app as the wrong side is the strongest verdict a run can reach, and it is not actionable
without a file and a mechanism behind it.

### Network trail

`preflight.py`'s `gate_mock_proof` proves that the one endpoint a case's precondition arms was
actually mock-served — proof of one call, before the case runs. It says nothing about the case's API
surface as a whole: an endpoint the case expected but that never fired, one that fired without being
expected, or one that fired more times than it should have are all invisible to that gate, because it
only ever looks at the endpoint it was told to look at. `scripts/check_network_trail.py` is the check
for the rest of it, run after a case executes — it needs the trace of what actually happened, which
does not exist yet at preflight time.

It only checks a case that recorded `networkWindowStart`/`networkWindowEnd` — nothing stamps these
automatically today, so a case a run never bracketed is a case this check never ran on. That absence
is reported as **unchecked**, the same way `evidenceIntegrity`'s absence is: a case with no finding
and a case never examined must not read the same on the page. Within the window, the case's own `api`
column (`cases.json`) supplies the expected endpoints; a column that names none (prose only, no
`METHOD /path` in it) still gets its duplicate calls checked, because a repeated fire is a defect
whether or not anyone wrote down what to expect — but its missing/unexpected findings are left out of
the result entirely rather than reported as empty, for the same absent-means-unchecked reason.

**This never changes `verdict`.** A missing or unexpected call is worth a person's attention, but this
script cannot tell a test-writing gap from an app bug from a call the `api` column simply never
mentioned — that judgement is exactly what `contracts/healing.md` reserves for adjudication rather
than an automatic resolution, and `networkTrail` is written in that spirit: a finding, not a ruling.
It renders in its own **Network trail** section of the evidence page, the same way `rca`/`patch` do —
the results table is fixed at eleven columns and has nowhere to put a per-endpoint list.

### Tracker trail

One level down from Network trail: not the case's whole API surface, but specifically the trackers
it names. `parse_test_cases.py` populates a case's `trmsIds` from a tracker column, or from a
TRMS-id-shaped token (`ENG1072-0001`) found anywhere in its scenario, precondition, steps or
expected text — a case that names no id at all is simply not checked, same as one with no window.

`scripts/check_tracker_validation.py` checks each named id's fires within the case's
`networkWindowStart`/`networkWindowEnd` window, and — when a saved TRMS snapshot resolves a
contract via the host project's `ios-analytics-tracker/scripts/extract_webarchive_contract.py` —
whether the payload matched it. A snapshot that cannot be found or fails to parse is not a silent
pass: it is reported as `contractError` on that id, distinct from a tracker that resolved a
contract cleanly (`extractorWarnings` empty) and one whose extractor cross-validation disagreed
with itself (`extractorWarnings` non-empty, worth reading before trusting `problems`).

Only a tracker's flat, top-level string params are checked — an `items[]`-nested value is not a
plain string, so the extractor cannot parse it as a `key: "value"` pair and reports it as a skipped
key in `warnings` instead of a pass. This gate does not check item-level fields yet.

A tracker firing more than once in its window is not flagged on sight — a list-impression tracker
firing once per distinct card/item in view is correct, not a bug. Each hit's payload is hashed
(exact JSON equality); an exact repeat lands in `duplicateFires`, a different payload each time does
not. Two distinct fires that happen to serialize identically would misread as one duplicate — a
known limitation, same posture as the `items[]` gap above.

An id the case never named, firing inside its window anyway, is reported in `unexpectedTrmsIds`
rather than dropped — same "fired but not on the list" idea `extract_trackers.py`'s own standalone
report already surfaces, usually a copy-pasted TRMS id and a real defect even when every named id
also fired correctly.

**This never changes a verdict**, the same reasoning as Network trail: whether a miss is a
test-writing gap, an app bug, or a stale TRMS page is a call for a person, per
`contracts/healing.md`. It renders in its own **Tracker trail** section of the evidence page, right
after Network trail.

## The results table

**Fixed column order, every run, every feature.** A reviewer who has read one evidence page must be
able to read the next without re-learning where anything is, and the two comment columns must be in
the same place so a developer and a QA never have to hunt for the cell they own.

| # | Column | Holds |
|---|---|---|
| 1 | `Test Case ID` | the case id, first — it is the join key back to the source sheet, and every conversation about a row starts with it |
| 2 | `Scenario` | the case's own one-line description |
| 3 | `Device` | the device and OS this row ran on, and its screen size in points. **Per row, never a note at the top of the page** — see below |
| 4 | `Verdict` | `PASS` · `DISCREPANCY` · `BLOCKED` · `UNVERIFIABLE` |
| 5 | `Authority` | `app-wrong` · `doc-wrong` · `undecided`, plus the reason, on a discrepancy only |
| 6 | `Expected` | the source document's own words, never paraphrased |
| 7 | `Observed` | what the run read off the screen — labels, counts, frames |
| 8 | `Fixture / scenario applied` | the mock variant armed for the case, or `none` |
| 9 | `Evidence` | **the capture itself**, embedded — see below |
| 10 | `Developer Comments` | left empty by the run |
| 11 | `QA Comments` | left empty by the run |

Evidence sits **third from last** so the two comment columns close the row. That ordering is
deliberate: the page is a review surface, and a reviewer reads the evidence and then types beside
it, in that order, without scrolling back.

### Evidence means the capture, not its filename

The Evidence cell embeds the media. A screenshot goes in as `<ac:image>`, a recording as the
`multimedia` macro with an explicit `height` — the captures are portrait, and without a stated
height the macro squares the player off its width and letterboxes every frame. The filename stays
underneath the embed, so a claim can still be traced to a file without opening it.

A cell holding only a filename fails the contract. It asks the reviewer to take the row on trust,
which is the one thing an evidence page exists not to do — and a filename is exactly as convincing
whether or not the file behind it shows what the row claims.

### The Device column is per row

Stating the device once, at the top of the page, is only correct while the run uses exactly one — and
it fails silently the moment it does not. Several simulators are routinely booted at once, a matrix
run is the whole point of some sheets, and a resumed run can land on a different device than it
started on. A per-row value costs one column and cannot drift out of step with the evidence beside
it.

It also makes the matrix legible without any extra machinery: sort or filter by Device and a
smallest-to-largest sweep reads as what it is, with the row that only fails on the small screen
visible rather than buried in prose.

### Evidence that does not show what its row claims is a defect in the run

The accessibility tree sees an element through a keyboard, sheet or overlay. The camera does not. So
a run can hold a correct verdict and publish a screenshot that does not show it — and a reviewer
looking for the thing the row asserts, and not finding it, has been handed something worse than no
evidence, because it invites them to doubt a verdict that was right.

The fix is at capture time, not report time (`contracts/commands.md` carries the driver rules):
typing dismisses the keyboard, capture dismisses before the shutter, and the assertion's own
identifiers are passed as `mustBeVisible` so the frame is checked against the claim.

What the report does with the result:

- **Clean** — nothing said. The image speaks for itself.
- **Obscured** — the row carries what was covered and by how much, next to the embed. A verdict is
  not downgraded for it: the tree-level observation still stands. What is downgraded is the
  *evidence*, and saying so is the honest form of the row.
- **Never checked** — `evidenceIntegrity` absent. Reported as unchecked, never as clean. A gate that
  did not run and a gate that passed are different states and must not render identically; that
  conflation is the same defect as a silently absent `posture` field.



The run never writes into them, and a later run must not overwrite what a human put there. They are
the page's only mutable region; everything to their left is generated and replaceable.

### Body format

The body is Confluence **storage** format (`<ac:structured-macro>`, `<ac:image>`, `<ri:attachment>`),
not the HTML+ dialect the Atlassian MCP accepts. Two reasons, both practical: storage format is what
carries an attachment embed in a table cell, and it is what can be published from a file — a body of
any real size has to reach Confluence through the REST API rather than as an inline tool argument.
Attachments upload first; a `<ri:attachment>` naming a file that is not on the page yet renders as a
macro error, not a blank. `scripts/publish_evidence.py` owns that order, along with where a page
lands and who can see it: **every page this skill creates goes under the mobile team's own page
unless the developer names another parent, and a new page is restricted to whoever ran it.** The
default parent is in a shared space, so a page that appears team-wide before anyone has read it reads
as a finding the team has agreed with. Widening access is the author's call and nothing here makes it
— see SKILL.md's publish stage.

## Media naming

Locally the case id is the folder, so a file can be `01-first-step.png`. An attachment has no
folder: every case's first screenshot would arrive as `01-…` and collide, and a reviewer could not
tell which case a file belongs to. So staged media is renamed:

```
<caseId>-<original name>            screenshots
<caseId>-attempt<N>-<verdict>.mp4   recordings, one per attempt
```

Recording is per **attempt**, not per case, and covers passes as well as failures — a case that
passed only after a locator heal is a different result from one that passed first time, and only the
attempt sequence shows which happened. A heal is documented when the report carries the before clip,
the after clip, and the diff between them, adjacent.

### What earns a recording

A recording is evidence of a **transition**: that a tap landed, what moved, what the app did between
one state and the next. A case with no transition in it has nothing for a clip to show that its
screenshot does not already show — and filming a motionless screen costs roughly 0.4 MB/s to prove
nothing.

| The case… | Evidence owed |
|---|---|
| taps, swipes, scrolls, pans, types, navigates, relaunches, dismisses an alert | screenshot **and** recording |
| only asserts existence, or reads labels, counts, frames | screenshot alone |

The line is drawn on the commands the case actually called. These are the interacting ones:

```
test_forge_tap · test_forge_tap_by_label · test_forge_swipe · test_forge_scroll_until_exists · test_forge_scroll_to_top
test_forge_type · test_forge_open_deeplink · test_forge_relaunch_app · test_forge_alert_tap
```

Everything else — `test_forge_assert_exists`, `test_forge_wait_for_exists`, `test_forge_wait_for_not_exists`, `test_forge_get_label`,
`test_forge_get_labels`, `test_forge_get_element_count`, `test_forge_get_frame`, `test_forge_dump_tree`, `test_forge_screenshot` — reads
without changing anything, and a case built only from those is settled by one still.

Two rules keep the gate honest rather than guessable:

- **A case with no `commands` owes a recording.** An empty command list is not evidence that the case
  was read-only; it is evidence that nothing was written down. It fails closed.
- **`interaction: true` / `interaction: false` on the result overrides the derivation**, for the case
  whose command trail understates what it did. Setting it is a claim on the record, like `authority`.

A recording on a read-only case is never *wrong*, just unearned — the gate requires clips, it does
not forbid them.

### One clip per attempt, and nothing else

A live run produces recordings no report has a use for: a clip left rolling through a `test_forge_dump_tree`
diagnosis, a re-recording of an attempt that had to be restarted, a zero-byte file from a
`test_forge_stop_recording` that never had a start. They accumulate at roughly a megabyte a second, and a
reviewer facing three clips in one case folder cannot tell which one the verdict came from.

So a case folder is pruned to **one recording per attempt** before the report is built:

```bash
scripts/prune_recordings.py --media-dir ~/Documents/<Team>-Test --results <run>/inputs/results.json
```

- The attempt sequence is what survives — it is evidence, not duplication. Two clips of the *same*
  attempt are duplication, and the longer one wins, because a short clip is a truncated one.
- Deletion is `unlink`. Nothing goes to the Trash: a Trash filling with discarded screen recordings
  is the same disk problem moved one directory over.
- The script rewrites each result's `video`, so a pruned file can never still be cited by the report.
- `--only-final` collapses even the attempt sequence to the single clip matching the verdict. That
  discards heal evidence, which is why it is a flag and not the default.

Media stays local until a human verifies the run. Publishing is a separate, explicit step.

## What this harness cannot verify

Some cases are not hard, they are **out of reach of this instrument**. A fade's smoothness, a spring's
overshoot, a haptic tap: no command in the vocabulary answers them, and no amount of retrying changes
that. Saying so plainly is a result. Quietly passing them is not, and neither is a bare
`UNVERIFIABLE` with no reason attached.

Two failure modes sit on either side of this, and both have to be designed against:

- **The excuse hatch.** `UNVERIFIABLE` becomes the label for anything that looked like effort, and
  the run's coverage silently collapses. The existing rule stands: a colour boundary, a cap
  percentage, a minimum height and an element's position are all *numbers*, and the tooling reads
  them. Wanting a case to be unverifiable does not make it so.
- **The dead end.** A case gets marked unverifiable and nobody ever looks at it again, even though a
  person watching a five-second clip could have settled it in one glance.

### Decompose before you declare

Almost no case is wholly unverifiable. "The sheet slides up with a fade and settles under the header"
is two claims: *does it end up under the header, present and at rest* — which the harness answers
exactly — and *does it slide and fade getting there* — which it cannot. Recording the whole case as
`UNVERIFIABLE` throws away the half that was proven.

So the order is: verify everything verifiable, then name precisely what is left. That is what
`partialVerification` is for, and a case with a non-empty `verified` list keeps the verdict its
verified part earned — `PASS` or `DISCREPANCY` — with the remainder carried in `notVerified` and
`humanReviewRequired`. `UNVERIFIABLE` is for a case with **nothing** verifiable in it.

### Before recording `UNVERIFIABLE`, all four of these must be false

| Check | If true |
|---|---|
| The **end state** is readable — a label, a count, an element's existence or frame | verify it; that is the case's outcome, and the animation is only how it got there |
| The **change** is detectable as a before/after pair — read the frame or label, act, read again | verify it; "it moved" and "it appeared" are both observable |
| The expectation is a **number** — a colour, a position, a size, a proportion | verify it by sampling the capture; `scripts/pixel.py` exists for exactly this |
| A **mock** can force the state the case describes | arm it and verify the resulting state |

If any is true, the case is at most *partially* unverifiable. Record which check carried it.

### Reason codes

| Code | What it covers | Why the harness cannot answer it |
|---|---|---|
| `animation-timing` | duration in ms, easing curve, frame rate, smoothness, jank, spring overshoot, scroll deceleration | The driver has no frame clock. It observes states, not the interpolation between them, and its polling granularity is far coarser than a frame |
| `intermediate-frame` | a state that exists only mid-transition — an element at 50% opacity, a sheet halfway up | Both the accessibility tree and the shutter land **after** the UI settles. The frame the case describes is not merely hard to catch, it is unobservable by construction — see `platforms/ios.md` |
| `non-visual` | haptics, sound, announcements | Nothing in the vocabulary has a sense for them |
| `subjective` | "looks polished", "feels responsive", "is visually appealing" | There is no observable predicate to be right or wrong about. This is a defect in the case, not in the tool |
| `underspecified` | names no checkable property, or no device list where the claim is per-device | Same: nothing to check. Always ships a `proposedRewording` |
| `device-absent` | requires hardware, an OS version or a locale not in this run | Answerable, just not here. Say which device would answer it |
| `other-surface` | another platform, page or system owns the behaviour | Out of this run's scope, not beyond measurement |

`animation-timing` and `intermediate-frame` need a different instrument, not a different effort:
frame-level timing is an Instruments/Core Animation question, and the report should say so rather
than implying nobody can ever check it.

### An unverifiable case still produces evidence

**This is the part that is easy to get wrong.** A case the machine cannot judge is not a case that
did not run. It ran; the judgement is what is missing. So:

- **A `humanReviewRequired` case must carry a recording.** The clip is the deliverable — it is what
  lets a person answer in one glance what the harness cannot answer at all. `BLOCKED` and a case with
  nothing verifiable in it are exempt, because there is genuinely nothing to film; an animation case
  is not.
- The report lists these separately, with the reason code, what was verified, what was not, and the
  proposed rewording. A reader must be able to see at a glance which cases are waiting on a human.
- The pass-rate denominator excludes them, exactly as it excludes `BLOCKED`. A case awaiting human
  judgement has not passed and has not failed.

Handing a person a clip and a precise question is a result. Marking the case green because it looked
fine, or red because it could not be measured, are both worse than saying what is true.

## Verdicts

| Verdict | Meaning |
|---|---|
| `PASS` | Observed behaviour matches the expected result. |
| `DISCREPANCY` | Observed differs from expected — needs a call on which side is wrong. |
| `BLOCKED` | The precondition could not be reached, so the expectation was never exercised. |
| `UNVERIFIABLE` | Nothing in the case is checkable by this instrument. Always carries an `unverifiableReason`; a bare `UNVERIFIABLE` is not a verdict. A case with a verifiable *part* keeps that part's verdict and carries the rest in `partialVerification` instead. |

`BLOCKED` and `UNVERIFIABLE` are excluded from the pass-rate denominator that gates the apply-fixes
mode. A run that could not reach its preconditions has not earned the right to edit code.

Recording `UNVERIFIABLE` because a measurement looked hard is almost always laziness: a colour
boundary, a cap percentage or a minimum height is a number, and the pixel tooling exists to read it.
Reserve it for cases whose surface this run genuinely cannot reach.
