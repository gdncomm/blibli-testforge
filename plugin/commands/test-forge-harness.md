---
description: Check, start or restart the persistent XCUITest driver session
argument-hint: "[status|ensure|start|stop|logs]"
allowed-tools: Bash
---

Manage the driver session. It is built once and then serves every flow until it has been **idle**
30 minutes; the bound resets on every command, so it never expires mid-flow.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/harness.py" ${ARGUMENTS:-status}
```

Readiness is proven the only way that means anything: **a real command completes**. A process being
alive, a port listening, and a status flag all report "up" for a harness that answers nothing — so
`status` sends an actual screenshot command and reports what came back.

`ensure` restarts a dead session unattended, bounded to two attempts. It deliberately refuses to run
`build-for-testing`: that one is slow, may need network access, and fails in ways a person has to
read, so it stays the developer's job and the script says so.

If the harness cannot start, report the reason from the log rather than retrying — a command that
kills the session twice will kill it every time, and the honest outcome is a blocked case.
