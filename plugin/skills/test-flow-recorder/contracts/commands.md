# Driver command contract

The platform-neutral vocabulary a driver must implement. This file is the seam that makes Android
and web extensions possible: the orchestration, the healing rules, the evidence schema and the
report generator all speak these commands and nothing else. A new platform is a new driver, not a
new skill.

## Transport

A driver is a **command queue plus a collector**. The queue is hosted host-side; the collector runs
inside the app under test and polls it.

```
POST /command   -> {ok, id}          enqueue one command
GET  /commands  -> {ok, commands[]}  the collector drains — destructively
GET  /result?id -> {result} | {pending}
POST /result    -> {ok}              the collector reports an outcome
```

**Draining is destructive on purpose**: a command applied twice toggles something back off. That is
also why two channels cannot share one queue — a data-layer channel and a screen-layer channel each
need their own port, or each steals the other's commands.

The collector polls with a sliding idle timeout, so a long human pause (an auth gate) does not end
the session, but an abandoned run does.

## Commands

Every command takes a target and returns a JSON outcome. A driver that cannot implement one must say
so at preflight rather than failing mid-case.

| Command | Arguments | Outcome | Notes |
|---|---|---|---|
| `tap` | identifier, elementType?, force? | `{found, hittable, forced?}` | refuses an unhittable element — see below |
| `tapByLabel` | label, force? | `{found, hittable, matches, ambiguous?, resolvedIdentifier?}` | the fallback where a surface carries no identifiers |
| `type` | identifier, text, *keepKeyboard?* | `{found, hittable, valueAfter, keyboardDismissed}` | `valueAfter` is how a keystroke sent nowhere becomes visible. **Brings the keyboard down when it finishes** unless `keepKeyboard` |
| `swipe` | direction, scrollViewIdentifier? | `{ok}` | no target element — a directional swipe with nothing specific in mind |
| `scrollUntilExists` | identifier, scrollViewIdentifier? | `{found, hittable, attempts}` | in the tree is not the same as in reach |
| `scrollToTop` | identifier?, scrollViewIdentifier? | `{ok}` | |
| `waitForExists` | identifier, timeout | `{exists}` | |
| `waitForNotExists` | identifier, timeout | `{exists}` | navigation-away is often the only signal |
| `assertExists` | identifier | `{exists}` | |
| `getLabel` | identifier | `{label}` | |
| `getLabels` | containerIdentifier?, elementType? | `{labels[], count, isTruncated}` | must be truncation-explicit |
| `getElementCount` | containerIdentifier | `{count}` | |
| `getFrame` | identifier | `{x, y, width, height}` | points, not pixels |
| `dumpTree` | identifier?, elementType? | subtree text | **may truncate** — always scopeable |
| `alertTap` | buttonTitle | `{found}` | |
| `screenshot` | label, *caseId?*, *mustBeVisible?*, *keepKeyboard?* | `{path, device, keyboardVisible, visibility?}` | Dismisses the keyboard before the shutter. `device` names the simulator; `visibility` reports whether each `mustBeVisible` identifier is actually unobscured in the captured frame |
| `dismissKeyboard` | — | `{keyboardVisible, keyboardDismissed}` | Through the keyboard's own dismiss key only — never a blind tap on a blank area |
| `deviceInfo` | — | `{deviceName, osVersion, udid, screenPoints}` | Which simulator this session is driving |
| `startRecording` / `stopRecording` | label | `{path}` | per attempt, see `evidence.md` |
| `relaunchApp` | — | `{ok}` | the reset between fixture states |
| `openDeeplink` | url | `{ok}` | |

### A gesture must report what it did, not that it was asked

Every gesture above once returned a bare `{found: true}`, set unconditionally after the tap. Element
resolution had already thrown if nothing matched, so the field could never be false: a tap swallowed
by a keyboard was indistinguishable from one that worked, and two cases in one run recorded a false
PASS on exactly that. A driver on any platform must therefore satisfy three rules.

**Existing is not being reachable.** An element can satisfy `exists`, lay out a finite non-zero
frame, and still be under a keyboard, a sheet, a floating bar or the window's edge. A gesture waits
for reachability separately and **refuses** when it never arrives, naming the likely obstruction. A
refusal is an infrastructure failure the run reports and recovers from; a success that did nothing is
a wrong verdict, which is worse than no verdict.

**`force` exists, and it is recorded.** A hit test can be wrong, so a caller who has confirmed from a
screenshot that an element is reachable may tap its coordinate regardless. The outcome then carries
`forced: true`, because a run whose evidence does not distinguish a forced tap from an ordinary one
cannot be audited. Note the coordinate: on iOS, `XCUIElement.tap()` against an unhittable element
raises a test failure, and a failure inside a persistent session unwinds it for every queued case.

**Label matching reports its ambiguity.** Resolving a label to the first of several matches is
usually right and occasionally sends the gesture to the wrong element — a case that failed to sign
out did exactly this. The outcome carries `matches`, and `ambiguous: true` when more than one matched
and no index was given, so the run can see that a choice was made on its behalf.

### Evidence must show what the verdict is about

A driver reads the accessibility tree. The tree sees an element perfectly well while a keyboard,
sheet or overlay sits on top of it — the camera does not. So a run can hold a **correct** verdict and
hand over a screenshot that does not show it, and the reviewer is then asked to take the row on
trust. That is the same failure as an Evidence cell holding only a filename, arriving by a different
route.

Three rules follow, in order of how much they are worth:

1. **Prevent the obstruction, do not annotate it.** Any command that raises transient chrome takes it
   back down when it finishes. `type` dismisses the keyboard by default, because the case that
   suffers is never the one that typed — it is the six after it, whose evidence shows a keyboard over
   the region their verdict is about. A note on the report saying the screenshot was obstructed is
   worth far less than a screenshot that is not.
2. **Capture clean.** `screenshot` dismisses the keyboard before the shutter, not after.
3. **Prove the frame supports the claim.** Pass `mustBeVisible` with whatever the case is asserting
   about. `visible: false` is an evidence failure and is reported as one — it is not cosmetic, and it
   must not be quietly dropped because the tree-level verdict was fine.

`keepKeyboard` exists for the case whose assertion genuinely is about the keyboard. It is an opt-in
for that case and never a way past a failing visibility check.

**A recording cannot be re-shot.** A still can be retaken; a clip covering a case that has already
moved on cannot. So dismissal happens *before* `startRecording`, not as a defect noted in the
finished file.

## Rules a driver must honour

These are not style preferences; each one comes from a failure that cost a session.

1. **Never index into a live element collection in a loop.** Materialise once. An indexed read
   re-queries the tree, so a screen that navigates mid-collection raises a framework failure the
   driver cannot catch, and the whole session unwinds instead of one command failing.
2. **Only `count` and materialised arrays are safe to read** on a query that may not match. Touching
   a property of an unmatched element is a session-killer on some platforms.
3. **`dumpTree` truncates silently.** It must accept a scope, and its outcome must report whether it
   truncated. A whole-screen dump that omits a late element reads identically to the element being
   absent — and `assertExists` will disagree with it.
4. **Frames are in layout points**, so an assertion is comparable against a design spec without the
   caller knowing the device scale.
5. **One command, one outcome.** A command that fails reports an error; it never ends the session.
6. **`relaunchApp` is the only clean reset.** Re-firing a deeplink stacks a second copy of the
   screen, and frame reads then answer from the wrong one.

### The vocabulary observes states, not the motion between them

There is no command for a duration, an easing curve, a frame rate or a haptic, and none will be
added: the driver reads a settled UI and has no frame clock. A case about *how* a change happened
rather than *that* it happened is out of reach of this instrument, and a platform driver is not
expected to fake it.

What every driver must still do with such a case: verify the parts that are observable — the end
state, a before/after frame pair, a sampled colour — record what is left in `partialVerification`,
and make sure a **recording** exists so a person can answer what the vocabulary cannot. See
`contracts/evidence.md` for the reason codes and the checks that gate the verdict.

### Every result that becomes evidence carries its device

With more than one simulator booted, nothing in a command result says which one answered it. A run
that sweeps a screen from the smallest device to the largest produces screenshots that mean nothing
once separated from the size they were taken at, and "it renders correctly" is not a claim anyone can
check without it.

`screenshot` therefore stamps `device` into every result, and `deviceInfo` returns it on demand. A
driver on any platform must supply the equivalent: a stable device name, an OS version, a unique id
for the instance, and the screen size the capture was taken at.

## Platform drivers

| Platform | Driver | Status |
|---|---|---|
| iOS | `TestForgeDriverSession` (XCUITest) + `test-forge-driver` MCP | in use — see `platforms/ios.md` |
| Android | UiAutomator collector, same queue protocol | contract only — see `platforms/android.md` |
| Web | CDP/Playwright collector, same queue protocol | contract only — see `platforms/web.md` |

## Data layer

Screen commands are half the contract. A run also needs to control what the app receives, and that
channel is separate — its own port, its own queue. Its required verbs:

| Verb | Purpose |
|---|---|
| arm a named variant on an endpoint | put the app in the state a case's precondition describes |
| push a body for a one-off variant | the composite a pack has no business carrying permanently |
| report whether writes reach the running app | the difference between "armed" and "actually serving" |
| prove a response was mock-served | the only trustworthy confirmation a fixture applied |

The last one is not optional. A data channel that reports success while the app serves live traffic
has cost this project more time than every screen-layer bug combined.
