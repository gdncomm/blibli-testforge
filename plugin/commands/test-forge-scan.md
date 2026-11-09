---
description: Walk an app by hand with the harness on and record each screen's accessibility surface
argument-hint: "[--out <path>.json] [--interval 1.5]"
allowed-tools: Bash, Read, AskUserQuestion
---

Record the accessibility surface of the screens an operator visits. **No test cases run.** The app
comes up with the harness attached, a person navigates it, and every screen they name is written to
a map a later run reads instead of rediscovering.

The harness must already be collecting — `/test-forge-harness ensure` — because scan mode drives nothing
itself; the person drives, and it watches.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/scan_mode.py" ${ARGUMENTS:---out scan-mode.json}
```

It then reads commands on stdin until `stop`:

| Command | What it does |
|---|---|
| `mark <name>` | Record what is on screen now, under this name |
| `skip` | Nothing — you are only passing through |
| `status` | Screens so far, and how many distinct trees went by unnamed |
| `stop` | Write the file and exit |

**The operator names the screens, and that is not a limitation to design away.** Nothing else can:
the trace's `screen` field is never populated, and inferring a name from the tree shape fails on
exactly the pair that matters — an empty cart and a full one. Marking the same name twice is
therefore the supported way to record a **data variant**, not a mistake to warn about.

## Reading the result honestly

Three fields decide whether the map can be trusted for a given screen, and all three are written on
purpose so that "not checked" can never be mistaken for "checked and clean":

- **`complete: false`** means the dump hit the 20,000-character cap and nothing below the cut was
  recorded. There is no re-dump that fixes this — neither a scoped `identifier` nor an
  `elementType` filter narrows the output, both merely re-root the same content. What does work is
  scrolling and marking the screen again: the tree only ever holds what is rendered.
- **`coverage.basis: "operator-visited"`** means a screen's absence is evidence of nothing. Say
  "not visited", never "not present".
- **`session.complete: false`** means the session was killed or interrupted. The screens in the
  file are still real — it saves after every mark — but the walk was not finished.

## What to do with `mergedIdentifiers`

A container that merges its children for accessibility reports their identifiers welded together:
Bazaar's product card comes back as `Catalog_ProductCard_P-001-Catalog_ProductCard_P-001-…`. Nobody
wrote that string, and a test targeting the clean identifier will match an inner element rather than
the tappable button.

Report these as **defects in the screen**, with the base identifier, and route them the way any
other finding is routed. Do not quietly generate tests against the welded string — that encodes the
bug into the test suite and makes it permanent.

## Afterwards

Offer to keep the map — it is worth keeping only if it is going somewhere a later run will look:

- Commit it to the app repo beside the screens it describes, so the next run starts from it.
- Or hand back the path and let the developer decide.

Ask with `AskUserQuestion`; do not commit it unprompted. And say plainly which screens came back
incomplete, rather than reporting a screen count as though it were coverage.
