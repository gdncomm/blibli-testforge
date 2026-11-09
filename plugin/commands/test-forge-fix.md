---
description: Apply the fixes a completed run proposed, re-run those cases, keep only what actually passed
argument-hint: "<results.json> [--case TC-012 --ruled-by NAME]"
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, Skill
---

Run the apply-fixes pass over: $ARGUMENTS

Invoke the `test-flow-recorder` skill and follow its **apply-fixes** section. This is a separate
invocation over a **completed** run, never a shortcut inside one, and it never re-adjudicates a
verdict — it applies what that run already proposed and lets the re-run decide whether the change
was real.

Start by reading the plan, because it may well say no:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/apply_fixes.py" \
    --repo . plan <results>.json
```

A closed gate is the normal outcome on a feature under active development, and it is the gate
working rather than a number to tune. Report what it said and stop; do not route around it by
naming every case with `--case`. That override exists for cases a **developer has ruled on**, it
needs `--ruled-by`, and the name is recorded in the journal.

Then, in this order:

1. Invoke `swift-codegen` — or `swiftui-code-gen` when the target file imports SwiftUI — before any
   Swift file is written. An applied patch is a production edit like any other.
2. `apply_fixes.py apply` writes the journal. Nothing is committed.
3. **Re-run exactly the patched cases** through the harness, with the same fixture, recording each
   one. A patch is not evidence; the clip beside the old one is.
4. `apply_fixes.py settle --journal … --rerun …` keeps only the patches whose case now passes and
   rolls the rest back.
5. Hand back what survived, with the case ids, and let the developer commit it as its own change.
