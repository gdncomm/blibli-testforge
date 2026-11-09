# Healing contract

What the executor may fix by itself, what it may only propose, and what stops it.

The rule behind every line below: **heal the harness, never the expectation.** A run's value is the
disagreements it surfaces, and on a feature under active development they are a quarter of the case
set — each one existing only because the harness refused to assume the app was right. A loop that
optimises for a green verdict destroys exactly the output the run exists to produce.

## Fault classes

Every failure is classified before anything is changed. Only the first three heal automatically.

| Class | Example | Heals automatically | Bound |
|---|---|---|---|
| **Harness fault** | snapshot unwind, `element(boundBy:)` in a loop, stale container, timeout, a malformed mock rule | yes | retried freely — this is plumbing, and a wrong guess cannot ship |
| **Locator drift** | identifier renamed, element moved, same semantic target | yes | 2 attempts, diff recorded in the report |
| **Fixture drift** | `check_baseline` reports model-only or redacted fields; backend contract moved | yes | recapture, re-render, re-run once |
| **Expectation mismatch** | observed value differs from the expected one | **never** | escalates to adjudication |

## Adjudication: which side is wrong

An expectation mismatch is a three-way disagreement — test case document, tech document, observed
app. The disagreement *is* the finding, so the run records an authority verdict rather than picking
a winner by itself:

| `authority` | Meaning | Fix eligibility |
|---|---|---|
| `app-wrong` | Behaviour contradicts a spec confirmed current | eligible, if the change is whitelisted below |
| `doc-wrong` | Behaviour is intentional; the test case or tech doc is stale | no code change — the report flags the document |
| `undecided` | Two surfaces disagree, or nobody has ruled yet | **never** eligible |

`undecided` is the default and the common case. Worked examples, each drawn from a real run:

- **`app-wrong`** — a label mapper builds its labels correctly, but the view puts that section in the
  `else` of a condition every item on the surface satisfies. Nothing renders, and no reading of any
  document makes that intentional.
- **`undecided`** — the mini card's tap handler reads `redirectUrl` while the regular grid on the same
  screen reads `url`, and the documents specify `url`. Three sources, three positions; a fix needs a
  decision, not a patch.
- **`undecided`** — the regular card caps its stock bar at 98%, the mini card at 95%, and the tech doc
  states 95% for both. Both caps are deliberate, separately written code. "Change 98 to 95" would
  ship a behaviour change on the authority of a document nobody has re-validated.

### The ceiling on scope with no tech document

The three-way shape above assumes a tech document exists. On a legacy page, component or module it
does not: there are two parties, the test case document and the app, and "they disagree" cannot say
which is right. A legacy screen's behaviour is often the intended behaviour, written years before the
sheet that now describes it.

So on a run whose posture is `undocumented` or `partial` (see SKILL.md, Stage 2):

| | Documented scope | No tech document |
|---|---|---|
| `app-wrong` reachable from evidence alone | yes | **no** — needs an explicit human ruling, recorded per case |
| `doc-wrong` reachable | yes | yes, when code proves the behaviour is deliberate |
| Default verdict | `undecided` | `undecided`, and it stays there |
| Apply-fixes eligible | per the gate below | **no** |

Code reading still earns its keep there — proving *what* the app does and *why* is most of a good
finding, and it is what turns an `undecided` into something a developer can rule on in a minute
rather than an afternoon. It just is not authority. Record the proof, name the ruling as outstanding,
and leave the code alone.

### Harness death is a fault class, not the end of a run

An XCTest raise inside a command handler unwinds `testLiveSession` and ends the session, so the
command that caused it and every command after it never return. This is a **harness fault**: it
heals automatically, it never touches an expectation, and it is bounded the same way every other
heal is.

| | |
|---|---|
| Detection | a command does not return — not a status flag, and not a process being alive |
| Heal | `scripts/harness.py ensure`: clear a wedged session, `test-without-building`, wait for a real command to complete |
| Bound | **one** restart per command. A command that kills the session twice kills it every time; the case is `BLOCKED`, with the log path |
| Record | a `healAttempts` entry of class `harness-restart`, naming the command that triggered it |
| Not automated | `build-for-testing`. Slow, VPN-dependent, and its failures have to be read |

The bound matters more than the restart. Without it a handler bug becomes an infinite restart loop
that looks like progress and produces nothing.

## Fix targets

Split by *what file the change lands in*, because the risk is completely different.

### Harness-side — automatic

Applied without approval, inside the bounds above. None of it can reach production:

- accessibility identifiers used by the run (not the app's own, see below)
- waits, retries and scroll/tap target selection
- fixture field values, variant selection, baseline recapture
- command plans and step ordering

### App-side — proposed, never auto-applied

Written into the report as a `patch` beside its `rca` — both are `results.json` fields, specified in
`evidence.md` — and applied only in the explicit apply-fixes mode, only for a case whose `authority`
is `app-wrong`. This is enforced rather than documented: `build_evidence.py` refuses a patch that is
not `app-wrong`, has no `rca`, has no diff, or declares a class outside the whitelist, and exits
non-zero naming each ground. There is no override flag.

The `rca` on its own is not gated at all, and is worth recording on an `undecided` case and a
`BLOCKED` one too — it is what makes the ruling a minute's work instead of an afternoon's.

The whitelist bounds *what kind* of change may be
proposed as a quick fix; everything outside it is a recommendation in prose, with no patch:

| Whitelisted | Not whitelisted |
|---|---|
| spacing and padding constants | control flow, branch structure |
| text properties: font token, line limit, alignment | which response field a feature reads |
| colour tokens | new or removed API calls |
| a boolean or numeric constant with a single call site | anything touching more than one call site |
| adding a missing accessibility identifier | threading, lifecycle, ownership |

Adding an accessibility identifier to production code is app-side, and gated, even though the run
needs it — it is still a production edit.

## Loop bounds

Three limits, all enforced; the run stops rather than degrading:

1. **2 heal attempts per case.** A third failure is reported, not retried.
2. **A total heal budget per run.** Exhausting it ends healing for the whole run, and the report says
   so — a run that spent its whole budget is itself a finding.
3. **No repeats.** A heal signature (class + target + change) may be applied once per case. The same
   fix failing twice is a misdiagnosis, not bad luck.

**A heal that does not change the verdict is rolled back.** Without rollback, three failed attempts
leave three unrelated edits in the working tree and the next run starts from a state nobody chose.

## The apply-fixes pass

A separate mode, run after a completed pass, never inside it — `scripts/apply_fixes.py`, driven by
`/test-forge-fix`. It takes the cases whose `patch` carries an `app-wrong` authority and a whitelisted class,
applies them, and re-runs only those cases.

It reuses this file's rules rather than restating them: eligibility is imported from the same
function that refuses a patch when the report is built, so the gate that writes a patch and the gate
that lands one cannot drift apart — and when they do drift, the direction is always that the applier
ends up the more permissive of the two.

**The rollback bar here is `PASS`, not "the verdict moved."** A case that went from `DISCREPANCY` to
`BLOCKED` changed verdict without being fixed, and keeping that edit on the strength of the movement
is how a loop reports progress it did not make. A patched case absent from the re-run is rolled back
for the same reason: an unmeasured edit is not a fix.

Every applied patch is journalled with its diff, so `revert` works later and from anywhere, and
`apply` is all-or-nothing — a failure part-way through backs out what already landed. What survives
`settle` is left **unstaged**: the pass never commits, and a developer reviews the diff and owns the
commit.

Its input is not the prose of the report: it is the `patch` entries in `results.json`, each already
carrying the `rca` that justifies it and a `class` the build has checked against the whitelist. A
patch that could not pass that check never reached the file.

**Entry gate:** at least **80% of adjudicated cases passed**, where adjudicated means `PASS` plus
`DISCREPANCY` — `BLOCKED` and `UNVERIFIABLE` are excluded, because a run that could not reach half
its preconditions has not earned the right to edit code. A floor of **10 adjudicated cases** applies
as well, so a 5-case page cannot clear the gate on two passes.

**Second precondition: the run had a spec to check against.** The pass rate measures whether the
harness was trustworthy; it says nothing about whether the failures were adjudicable. A run on scope
with no tech document can score 95% and still have no case eligible to fix, because none can reach
`app-wrong` on evidence — so the mode declines on posture before it looks at the rate. A developer
who has ruled on specific cases can still run it against exactly those, named individually.

Calibration from a real run, which the gate would have **blocked** on both pages:

| Page | Adjudicated | Passed | Rate | Gate |
|---|---|---|---|---|
| A 34-case section page | 34 | 26 | 76% | blocked |
| A 7-case component page | 7 | 4 | 57% | blocked |

Both correctly. A feature with a quarter of its cases in disagreement is not one to let a loop edit
unattended — and if the gate blocks every real page, that is worth knowing before the mode is built,
not after.

## Evidence of the regeneration sequence

Each attempt is recorded end to end, and the report pairs the clips with the diff between them:

```
<caseId>-attempt<N>-<verdict>.mp4
```

A clip on its own does not show what changed, so a heal is only considered documented when the
report carries the before clip, the after clip, and the diff that separates them, next to each other.
Recording covers passes as well as failures: a pass whose fixture or locator was healed on the way
there is a different result from one that passed first time, and only the pair shows it.
