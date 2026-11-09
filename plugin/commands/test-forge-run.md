---
description: Run QA test cases live against the booted app, from a test case document and a tech document
argument-hint: "<test case page or steps> [tech doc]"
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, Skill
---

Run the test-flow-recorder workflow for: $ARGUMENTS

Invoke the `test-flow-recorder` skill and follow it exactly. Do not improvise a shorter path — every
gate in it exists because of a failure that some status flag elsewhere reported as fine.

Two inputs are the minimum, and both are read-only for the whole run:

| Input | Supplies |
|---|---|
| Test case document | the cases: scenario, precondition, steps, expected result, API column |
| Tech document | file paths, endpoints, auth requirements, thresholds and config keys |

They are **co-equal sources of truth**. When they disagree, that disagreement *is* the finding —
never assume the app is wrong.

Start with preflight; it fails closed. Nothing runs until the trace shows the armed endpoint
answered `isMockServed: true`.
