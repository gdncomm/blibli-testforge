---
description: Record a named, reusable sequence of driver commands, for a test case to reference later
argument-hint: "record <name> | stop | list | show <name>"
allowed-tools: Bash, Read, AskUserQuestion
---

Record a named path through the app once, so a test case's precondition can reference it by name
instead of re-describing every tap — reaching a config-reset screen ("Reset App Cache", "Change app
language") is the case this is for.

**This records tool calls, not taps.** There is no touch-injection capture anywhere in this
architecture — a macro is built from the real `mcp__test-forge-driver__*` calls Claude issues while the
operator narrates the path in plain English, exactly the way Stage 3b already drives a case. Nothing
here is recorded from the operator's own hands on the simulator.

The harness must already be collecting — `/test-forge-harness ensure` — before recording, same requirement
as `/test-forge-scan`.

## `record <name>`

1. Resolve where the macro will live: run `scripts/classify_module.py "<code-reference file path>"`
   to get `<Module>/<Submodule>`, and join it under the flow's `<UITestRoot>` to get `--root`.
2. `python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/macro_cli.py" record-start "<name>" --root <root> --narration "<what the operator described>"`
3. Ask the operator to narrate the path, one step at a time, in plain English ("tap Settings", "tap
   Debug Menu", "tap Reset Cache", "confirm the alert").
4. For each step: issue the real `mcp__test-forge-driver__*` call it describes, then immediately
   `macro_cli.py record-step "<name>" --root <root> '<the command you sent, as JSON>' '<the outcome
   it returned, as JSON>'`.
5. **If a step's outcome looks like a failure** — not found, not hittable, an error — stop narrating
   further steps and ask the operator what to do, rather than recording a macro that doesn't
   actually work. `record-step` will flag this on its own output, but the decision to stop belongs
   to the conversation, not the script.
6. When the path is complete: `macro_cli.py record-stop "<name>" --root <root>`, then read the saved
   step sequence back to the operator for confirmation before treating it as done.

## `stop`

Same as step 6 above, if a recording is already in progress and the operator wants to finalize now.

## `list`

`macro_cli.py list --search-root <UITestRoot>` — every saved macro found under any module, with its
step count and path.

## `show <name>`

`macro_cli.py resolve "<name>" --search-root <UITestRoot>` (or `--root <dir>` if the module is
already known) — prints the macro's stored steps. Refuses and lists every candidate if the same name
exists under more than one module, rather than guessing which one was meant.

## Using a saved macro in a test case

A precondition or step cell reading `macro:<Name>` resolves at plan time (`SKILL.md` Stage 3) by
loading the named macro and splicing its steps inline — each one still executed and checked
individually, exactly like every other plan step, never as one atomic action that hides where it
failed.

## What this is not

Not a batch primitive, and not a shortcut around adjudication — a macro that no longer works fails
at whichever spliced step broke, the same way a hand-written plan step would, and that failure is
reported like any other. Not a record of the operator's own physical gestures — see above.
