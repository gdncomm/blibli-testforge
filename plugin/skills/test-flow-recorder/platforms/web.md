# Web driver — contract to satisfy

Not built, and deliberately behind Android: the mobile platforms share a test-case corpus and a
backend contract, so they compound. Web is a separate surface with its own selectors and its own
release cadence.

Shared, unchanged: `contracts/commands.md`, `contracts/evidence.md`, `contracts/healing.md`, the
report generator, the fixture scripts.

## Host-project skills required

**Required: no**

No requirement declared — this driver isn't built yet (see above). `scripts/audit_platform_skills.py
--platform web` still runs and reports what it finds in the host project, for visibility, but nothing
here blocks `/test-forge-init` or a run. The moment a driver and an actual dependency land for this platform,
the same mechanism ios.md already uses picks it up unchanged — no script change needed, only this
section.

## What has to be written

| Piece | Web approach |
|---|---|
| Collector | a Playwright (or CDP) driver process polling the same queue — no in-page agent needed, the driver is host-side |
| Element addressing | `data-testid` first, ARIA role + accessible name as the fallback, CSS last |
| Tree dump | accessibility tree snapshot, scoped, truncation-explicit |
| Frames | `boundingBox()` in CSS pixels at a pinned device scale factor and viewport |
| Screenshot / recording | `page.screenshot()`, and Playwright's built-in per-context video |
| Relaunch | a fresh browser context — cheaper and cleaner than any mobile relaunch |
| Data layer | `page.route()` interception, exposing the same four verbs |

## What changes shape

- **Viewport is a variable, not a constant.** Mobile runs assume one screen size; a web geometry
  assertion is meaningless without a pinned viewport and DSF recorded alongside it. The evidence
  contract's environment block has to carry both.
- **Relaunch is cheap.** The ~110s fixture-reload cycle that dominates a mobile run collapses to a
  new context, so the batching that mobile runs need (one fixture covering several cases) stops being
  necessary. Do not port that optimisation for its own sake.
- **`data-testid` availability decides the effort.** Where the app has them, this is the easiest of
  the three platforms. Where it does not, the run leans on accessible names and inherits every
  copy-change fragility that implies — locator drift will be the dominant heal class.
- **A Chrome extension is a surface, not a driver.** It is on the plan after mobile stability, and
  it consumes this contract; it does not replace it.

## Legacy scope

The same inventory contract applies (`posture`, `documents`, `addressability`, `endpointLiterals`),
against the component sources — count `data-testid` for addressability.

Two things are easier than on mobile and should be exploited rather than ported around: the entry
point is a URL, so there is no entry-point discovery problem at all, and the endpoint list comes
from a CDP network log on one page load rather than from a trace file and a code scan. Neither
removes the adjudication ceiling — a legacy page with no spec is still two parties disagreeing.
