# Data-plane driver contract

The platform-neutral vocabulary a data-plane driver must implement, and the file formats that make
it swappable. This is `contracts/commands.md`'s sibling: that file drives the screen, this one drives
what the app under test is fed. A run needs both — a case that checks an empty state is only
meaningful if the data plane proves the empty body was the one actually served.

A driver is complete when it satisfies this file, nothing more. **One driver exists against it**:
`networklens` (upstream's in-process interceptor, the only mock channel); `proxy` is declared only,
not built — see the registry at the end.

## The seven verbs

Same names as the browser lens, on purpose, so an agent's vocabulary does not fork per platform.

| Verb | Does |
|---|---|
| `state` | reports the rules currently held and whether mocking is on or off |
| `arm` | installs a rule — a named variant on an endpoint, with an optional `match` |
| `disarm` | removes a rule |
| `variant` | switches which named response an already-armed rule serves |
| `scenario` | applies (or records) a named bundle of arms in one call |
| `edit` | changes a one-off variant's body in place, without re-arming |
| `export` | emits a pack — the armed rules plus the scenarios that reference them |

## The NDJSON trace

One `{"exchange": {…}}` object per line. **Append-and-revise**: a line is written when an exchange
finishes, and again on every later edit to it — so the *last* line for a given exchange id is current
state and every earlier line for that id is audit trail. A reader folds by id and takes the last line,
never just counts lines or reads the first match.

Rotates, keeping one prior generation. `preflight.py` and `capture_baseline.py` both glob
`trace*.ndjson` to cover this; upstream's own `src/trace.ts` reads only `trace.ndjson`, unrotated —
that gap is real, and this plugin's readers (`scripts/dataplane.py`'s `exchanges()`) close it on
the read side.

Fields the gate at `preflight.py:326` (`gate_mock_proof`) actually reads:

| Field | Gate behaviour |
|---|---|
| `endpointKey` | suffix-matched against the endpoint just armed |
| `startedAt` | must be within `DEFAULT_TRACE_AGE = 900`s of now, else WARN — a previous run's trace, not this one's |
| `isMockServed` | truthy only when the bytes came from the fixture — **this is what makes the gate trustworthy: proof of response provenance, not a claim of it** |

This schema has zero platform surface. Upstream's `src/trace.ts` and `src/redact.ts` are the
reference implementation; any future driver must write byte-compatible lines so nothing downstream
needs to know which driver produced the file.

`scripts/dataplane.py` also exposes `endpoint_key()` — the canonical copy, in this plugin, of the
endpoint-key templating rule — for any script (`check_network_trail.py` today) that needs to
normalise a raw method+path from outside the trace into the same `"METHOD /templated/path"` key
every exchange's `endpointKey` already carries.

## The pack

`.networklens-pack.json`, `formatVersion: 1`. Holds scenarios plus the rules they reference.

**Import replaces by endpoint key + match, never by id** — "the same endpoint mocked on two devices
has two ids."

### Rule semantics every driver's rule engine must satisfy identically

- Endpoint key is `"METHOD /templated/path"` — numeric, UUID, and 16+-hex path segments template to
  `{id}`; query is dropped from the key.
- `match` is on `query` (`"*"` = any value), case-insensitive `headers`, and `bodyContains`, AND-ed
  together. All-empty `match` is a catch-all.
- **Narrowest match wins; ties go to the earlier-armed rule** — so the answer never depends on
  arming order.
- Identity of a rule is `endpointKey` **plus** `match`, not the endpoint alone. Hit counts are keyed
  by rule id.
- The five standard variants stay byte-compatible with upstream's `CapturedVariants`. `empty` hollows
  containers but **keeps the envelope** — a bare `{}` makes the app render its error state and proves
  nothing about the case under test.
- `passThrough` does not consume a hit.

## The six capabilities a run actually consumes

A driver is done when it can do these six. Nothing else is load-bearing.

The four already named in `contracts/commands.md`'s "Data layer" table:

- arm a named variant on an endpoint
- push a body for a one-off variant
- report whether writes reach the running app
- prove a response was mock-served

Plus two more, used by `capture_baseline.py` and missing from that table — a gap `commands.md`
should eventually pick up too, though this file is the authority now:

- **capture a real response body** — seed a baseline from a live 200 before any mocking touches it
- **a master mocking switch, off** — capture must happen with mocking disabled, or the "real"
  response is actually a fixture

## The shared redactor

In lockstep with `check_baseline.py:46` and upstream `redact.ts:13`. A driver's own redaction must
match this exactly, byte for byte — a baseline captured through one driver and checked through
another otherwise disagrees on what was supposed to be secret.

| | |
|---|---|
| Headers redacted | `authorization`, `cookie`, `set-cookie`, `x-api-key` |
| Body fields redacted, **by prefix match** | `card`, `cvv`, `pan`, `password`, `token`, `secret` |
| Placeholder | exactly `<redacted>` — not `***`, not `REDACTED`, not truncated: `check_baseline.py` compares against this exact literal to catch a field that leaked |

## Driver registry

| Driver | Role | Attach | Mock-served proof |
|---|---|---|---|
| `networklens` | the only mock channel | upstream's own MCP server and in-process interceptor, registered and used exactly as upstream ships it, never vendored; used where the app already links it | same trace schema, upstream's own writer |
| `proxy` | declared, not built | system proxy + `xcrun simctl keychain booted add-root-cert` | not designed yet — deferred because nothing in scope needs it |

`proxy` is the only mode that reaches `WKWebView` traffic and the only one needing zero app
cooperation. It stays a declared second mode because nothing in this plan's scope requires it yet.

`scripts/dataplane.py` accepts `TEST_FORGE_DATA_PLANE=networklens` as an alias for `simctl` — both resolve
NetworkLens under the booted simulator's own container, so the driver-registry name above actually
works as an env value rather than only "leave `TEST_FORGE_DATA_PLANE` unset" doing so. Those two are
the only valid `TEST_FORGE_DATA_PLANE` values; anything else fails loudly. "Never vendored" is
literal: this plugin registers no `networklens` MCP server of its own — a `networklens` run depends
on the **host project** registering one in its own `.mcp.json` (as `BlibliMobile-iOS` does), the
same kind of external prerequisite `test-forge-driver` already has in the harness process.

### Fidelity matrix — five things only an in-process interceptor sees

No out-of-process driver (`proxy`) can ever see these; `networklens` can, because it sits
inside the process above TLS:

1. **`WKWebView` traffic** — web views network outside the app's `URLProtocol` chain.
2. **Background sessions** — `install(into:)` returns `false` rather than pretending.
3. **Non-`URLSession` stacks** — gRPC, raw sockets, `Network.framework`, SDKs with their own transport.
4. **Streaming** — SSE and chunked responses arrive buffered, all at once, never mid-stream.
5. **Any host the interceptor was configured to exclude.**
