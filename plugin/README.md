# test-flow-recorder

Turns a manual QA test case into a verdict, run live against a booted app.

It is **not** a test-code generator. Nothing is compiled and no per-flow test file is emitted. A run
is a live conversation with the app: arm the data, drive the screen, read what actually came back,
adjudicate, record. A generated test asserts what its author believed; a live run reports what the
app did.

## Install

```
/plugin install test-flow-recorder --marketplace gdncomm/blibli-testforge
```

Or from a local clone: `claude plugin marketplace add <path-to-blibli-testforge>`, then `claude plugin install test-flow-recorder@test-forge`.

## What it needs

Two documents, both read-only for the whole run:

| Input | Supplies | Without it |
|---|---|---|
| Test case document | the cases | there is nothing to check against |
| Tech document | file paths, endpoints, auth, thresholds | every finding is capped at `undecided` |

Plus a booted simulator, and NetworkLens linked into the app under test for the data plane. The
screen plane works without it; fixtures, mocking and the proof-of-mock gate do not.

## Install

```
/plugin marketplace add <path to this repo>
/plugin install test-flow-recorder
```

Then, once per project:

```
/test-forge-init --bundle-id <your app's bundle id>
```

That attaches the `TestForgeDriverKit` product to your UI test target, writes a four-line subclass, and
generates `TestForgeDriver.xcscheme` and `TestForgeDriver.xctestplan` using your project's own identifiers. It is
additive only, and it verifies that the pbxproj diff has zero deleted lines before it finishes.

Build the harness once (slow, may need VPN for dependency resolution), then:

```
/test-forge-harness ensure
/test-forge-run <test case page> <tech doc>
```

## Commands

| Command | Does |
|---|---|
| `/test-forge-init` | wire an Xcode project to the harness, one time |
| `/test-forge-harness` | status, start, restart, stop, logs |
| `/test-forge-run` | run the workflow against a test case document |
| `/test-forge-scan` | walk the app by hand and record each screen's accessibility surface; no cases run |
| `/test-forge-fix` | apply what a completed run proposed, re-run those cases, keep only what passed |

## What ends up in the app binary

Almost nothing, and the one exception is worth reading before the first integration.

| Component | In a shipped app? |
|---|---|
| `TestForgeDriverKit` | **No.** A `.static` product attached to the UI test target's `packageProductDependencies` only, and it lives outside the host package's `Sources/` glob so a dynamic framework cannot absorb XCTest by accident |
| skill, scripts, MCP servers, fixtures, journals, mock rules | **No.** Host-side or simulator-container-side. Never compiled |
| a mock made permanent in Swift | **No**, behind a `#if DEBUG` seam |
| retrofitted accessibility identifiers | **Yes**, and correctly so — a string literal and a modifier call per element |
| **NetworkLens** | **Yes, in every configuration, unless you say otherwise.** See below |

NetworkLens has to be linked to the **app** target: it intercepts the app's own `URLSession`, and no
test-target linkage can do that. It is also the **real interceptor in every build configuration,
including an App Store archive**, unless that configuration defines `NETWORKLENS_DISABLED` — it
deliberately stopped keying off `DEBUG`, so that a team can hand QA a Release TestFlight build with
the lens live.

So a shipping configuration has to name the flag:

```yaml
configs:
  Debug:
    SWIFT_ACTIVE_COMPILATION_CONDITIONS: DEBUG
  Release:
    SWIFT_ACTIVE_COMPILATION_CONDITIONS: NETWORKLENS_DISABLED
```

The umbrella module links both the real implementation and an inert mirror and compiles one away;
the dead one is dead-stripped in practice. Where a release binary must **provably** contain none of
the tool, link the `NetworkLensNoOp` product in the shipping configurations instead of the
`NetworkLens` umbrella. `/test-forge-init` does this as its own step and reports which configurations it
guarded.

## Nothing here knows which app it is driving

A default that happens to be right for one app is worse than a missing one: it makes the tool appear
to work while pointing at the wrong place. So the Swift takes its bundle id, launch arguments and
media root from `TestForgeDriverConfiguration`; the scripts require `--bundle-id` rather than defaulting;
and the MCP servers report the bundle id as unset rather than guessing.

Read `skills/test-flow-recorder/usage.md` for what a run actually looks like, `SKILL.md` for the
stages, and `contracts/` for the driver, evidence and healing contracts.
