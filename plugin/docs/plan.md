# test-flow-recorder — plan

A Claude Code plugin that turns a written test-case sheet into an executed, evidence-backed QA run:
drive the real app through a resident harness, mock the network, check the trace against what each
case named, and report a verdict with the evidence to back it — no per-case Swift file, no
generate-then-someone-else-runs-it handoff.

**No dates, timestamps, or contributor names in this file or `progress.md`** — same convention this
tool's own host project uses for its in-repo feature docs. State what's true, not who did it or
when. This is the forward plan and the judgment calls behind it; `progress.md` is the current
build state.

## Architecture, in one pass

- **Data plane** (`contracts/dataplane.md`) — 7 verbs (state/arm/disarm/variant/scenario/edit/export)
  behind one driver registry. NetworkLens is the only mock channel: `TEST_FORGE_DATA_PLANE` is `simctl`
  (default) or its alias `networklens` in `scripts/dataplane.py` — an in-process interceptor whose
  MCP server is **never vendored here**; it depends on the host project registering its own, same
  external prerequisite the screen channel already has. `proxy` is declared in the contract but not
  built.
- **Screen plane** — `mcp/test-forge-driver-mcp`, a resident XCUITest session (`TestForgeDriverKit`, consumed from
  the host project, not shipped here) polling a command queue. Unchanged by any data-plane choice.
- **Pipeline** (`SKILL.md`) — Stage 1 Preflight (fails closed, 9 gates) → Stage 2 resolve inputs →
  Stage 3a accessibility chain / 3b construct commands → Stage 4 execute + validate (network trail,
  tracker trail) → Stage 5/6 report + evidence. Full detail lives in `SKILL.md`; this file doesn't
  duplicate it.
- **Platform status** — iOS is the only built, reference driver (`platforms/ios.md`). Android and web
  are contracts only (`platforms/android.md`, `web.md`) — "not built," stated plainly in both files,
  not implied by absence.

## Standing invariants — preserve these across any resumption

1. **Propose-only, never write into the host project's `.claude/skills/` or `CLAUDE.md`, under any
   flag.** Two scripts live by this: `scripts/propose_skill_extension.py` (extends an existing
   skill) and `scripts/audit_platform_skills.py` (drafts a scaffold for a missing one). Both only
   ever write under `~/Documents/<project>-QA/`. "A pass that can edit the tooling is not governed
   by it."
2. **No `api-mock` skill exists, deliberately.** Mocking a scenario a pack doesn't cover is authored
   directly against `preflight.py`'s `REQUIRED_RULE_KEYS`/`REQUIRED_VARIANT_KEYS` schema and
   installed via `mcp__networklens__lens_mock_endpoint` / `lens_set_variant_body`. Don't invent a
   skill for this without revisiting why it was skipped (`SKILL.md`'s chaining table).
3. **A platform's skill requirement is declared in that platform's own doc, never hardcoded in a
   script.** `platforms/<platform>.md`'s "Host-project skills required" section is the single source
   — `audit_platform_skills.py` only ever reads it. iOS says required; Android/web say not required
   (no driver to depend on anything yet) — the same mechanism picks either up unchanged the moment a
   driver and a real dependency land for them.
4. **Every gate that can't adjudicate stays informational, never flips a verdict.** Network trail,
   tracker trail, model-vs-baseline field comparison — all report, none decide. Adjudication
   (`app-wrong`/`doc-wrong`/`undecided`) is `contracts/healing.md`'s job, for a person.
5. **Honesty rail.** An inferred, heuristic, or synthesized fact is always labelled as such in its
   own output (`via="heuristic"`, `synthesisWarnings`, `extractorWarnings`, "not a certain match") —
   never presented with the same confidence as something verified against a real trace or a real
   file.
6. **The real target application is read-only.** This tool never edits the app repo it's configured
   against — only `.claude/settings.json` (env + `testForgeSkillAudit` bookkeeping, kept in separate
   namespaces) and, during `/test-forge-init`, the app's own `.xcodeproj`/`.xcworkspace` additively (new
   targets/files, never an existing one rewritten).

## Open items — genuinely not done, not silently assumed

- **Android driver.** Contract only (`platforms/android.md`). Blocked locally on missing Android
  SDK/Playwright tooling for screen-driving — re-check before assuming this is still true elsewhere.
- **Web driver.** Not started, deliberately behind Android (`platforms/web.md`).
- **Item-level tracker parameters.** `check_tracker_validation.py` only checks a tracker's flat,
  top-level string params — an `items[]`-nested value can't be parsed as a `key: "value"` pair, so
  it surfaces as a skipped-key warning rather than a checked field. Needs a real multi-item TRMS
  sample to design against; none was available when this gate was built.
- **`synthesize_from_model.py`'s `Date` handling is a guess.** It emits an ISO-8601 placeholder and
  says so in a warning, but the actual decode strategy (ISO-8601 vs epoch millis) isn't recoverable
  from a Swift type name alone. Don't trust a synthesized baseline's date fields without checking
  the real model.
- **No `context-resumption.md` yet.** The host project's own convention (`FlashsaleRevamp-2026/docs/`)
  pairs `plan.md`/`progress.md` with a third, copy-pasteable resumption prompt. Worth adding here too
  if resuming cold becomes a recurring need — not built yet because it wasn't asked for.

## Decision log

- **2026-10-13 — `test-forge-mock` data plane removed entirely.** The out-of-process responder
  (`mcp/test-forge-mock-server` + `mcp/test-forge-mock-mcp`, its `.mcp.json` entry, the `test-forge-mock` choice of
  `TEST_FORGE_DATA_PLANE`, and every script/doc path for it) is deleted; NetworkLens is the only mock
  channel. Why: it was never used on iOS here, and its unresolved `TEST_FORGE_MOCK_SERVER_URL` /
  `TEST_FORGE_MOCK_TRACE_DIR` env placeholders confused QA runs — Claude reported "test-forge-mock unusable" and
  sometimes refused to arm mocks at all. (Dated by explicit request, an exception to the no-dates
  convention above.)
