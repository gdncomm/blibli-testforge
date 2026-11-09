#!/usr/bin/env python3
"""Resolves where the data plane lives, so no other script shells to `simctl` on its own.

Every data-plane driver named in `contracts/dataplane.md`'s registry exposes the same two things a
script actually needs: a directory holding `trace*.ndjson`, and (today) a session file shaped like
NetworkLens's own. `preflight.py` and `capture_baseline.py` used to resolve both by shelling to
`xcrun simctl get_app_container` inline, once each, and each kept its own copy of the trace-rotation
glob. Two copies is how the two of them drift: one already reads `trace*.ndjson` to catch a rotation,
the other has to remember to as well.

This module is the single dispatch point on `TEST_FORGE_DATA_PLANE`. Two values are live: `simctl` and
`networklens` — both NetworkLens under the booted simulator's own container, the same driver;
`networklens` is `contracts/dataplane.md`'s own driver-registry name and is accepted as an alias
so a run that sets `TEST_FORGE_DATA_PLANE=networklens` (matching the contract's own vocabulary) actually
works, rather than only "leave it unset" doing so. Any other value fails loudly rather than
silently resolving `simctl` anyway, because a stale trace that answers "yes" is exactly the failure this whole skill exists to
catch.

Usage: imported, not run directly. `python3 -m dataplane <bundle-id>` prints the resolved container
and trace directory, for a quick manual check.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

LENS_RELATIVE = "Library/Application Support/NetworkLens"
DEFAULT_DATA_PLANE = "simctl"

# The canonical copy of the endpoint-key templating rule in this plugin — three patterns, one
# templating rule, one join, matching the `endpointKey` NetworkLens writes on every trace exchange.
# A Python caller (`check_network_trail.py` today) needs this on the
# read side to turn a case document's own "GET /products/123" into the same key a trace exchange's
# `endpointKey` already carries; it takes a bare pathname — stripping
# a scheme, host or query string is the caller's job, not this function's.
_UUID_SEGMENT = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_NUMERIC_SEGMENT = re.compile(r"^\d+$")
_LONG_HEX_SEGMENT = re.compile(r"^[0-9a-fA-F]{16,}$")


def _templatable(segment: str) -> bool:
    return bool(_NUMERIC_SEGMENT.match(segment) or _UUID_SEGMENT.match(segment)
                or _LONG_HEX_SEGMENT.match(segment))


def endpoint_key(method: str, pathname: str) -> str:
    """`"METHOD /templated/path"`, the same shape a trace exchange's `endpointKey` carries.

    A numeric-only segment, a UUID, or a 16+-hex-char segment templates to `{id}`; query is not this
    function's concern because `pathname` is assumed already bare.
    """
    segments = [segment for segment in pathname.split("/") if segment]
    templated = ["{id}" if _templatable(segment) else segment for segment in segments]
    return f"{method.upper()} /{'/'.join(templated)}"


def data_plane() -> str:
    return os.environ.get("TEST_FORGE_DATA_PLANE", DEFAULT_DATA_PLANE)


def _simctl_container(bundle_id: str) -> Path | None:
    """Always ask simctl. The app is reinstalled on every build and its container uuid changes."""
    result = subprocess.run(["xcrun", "simctl", "get_app_container", "booted", bundle_id, "data"],
                            capture_output=True, text=True)
    path = result.stdout.strip()
    return Path(path) if path.startswith("/") else None


def container_path(bundle_id: str) -> Path | None:
    """The app's data container, however the active data plane locates it.

    Same name and signature as the `container_path()` that used to live in `preflight.py` — every
    caller of that function now gets here instead, and nothing about what it returns changes for the
    default plane.
    """
    plane = data_plane()
    if plane in ("simctl", "networklens"):
        return _simctl_container(bundle_id)
    raise SystemExit(f"TEST_FORGE_DATA_PLANE={plane!r} has no driver yet — see contracts/dataplane.md's "
                     "driver registry. Unset it, or set it to 'simctl' or 'networklens', to use "
                     "NetworkLens under the booted simulator.")


def read_session(container: Path) -> tuple[dict[str, Any] | None, Path]:
    path = container / LENS_RELATIVE / "session.json"
    if not path.exists():
        return None, path
    try:
        return json.loads(path.read_text()), path
    except ValueError as error:
        raise SystemExit(f"session.json under the live container is not valid JSON ({error}). "
                         "The app owns this file — terminate the app before repairing it.")


def exchanges(lens_dir: Path) -> list[dict[str, Any]]:
    """Every exchange across the live trace and any rotated ones, oldest first.

    The trace rotates, keeping one prior generation, so a rotation immediately after the call that
    proves mocking would otherwise lose that proof. Recency is judged by `startedAt`, not by which
    file a row landed in — this is the one place that globs `trace*.ndjson`; upstream's own
    `trace.ts` reads only `trace.ndjson`, unrotated, which `contracts/dataplane.md` documents as a
    real divergence, not one this function should paper over by guessing which file is current.
    """
    rows = []
    for trace in sorted((path for path in lens_dir.glob("trace*.ndjson") if path.is_file()),
                        key=lambda path: path.stat().st_mtime):
        for line in trace.read_text(errors="ignore").splitlines():
            try:
                rows.append(json.loads(line)["exchange"])
            except (ValueError, KeyError):
                continue
    return sorted(rows, key=lambda row: str(row.get("startedAt") or ""))


def trace_dir(bundle_id: str) -> Path:
    """The directory holding `trace*.ndjson` for the active data plane, or a loud failure.

    Convenience for a caller that only wants the trace directory and does not otherwise need the
    container path — `capture_baseline.py`'s `resolve_trace` is exactly this, plus its own
    `--trace` escape hatch for a driver this module cannot resolve yet.
    """
    container = container_path(bundle_id)
    if container is None:
        raise SystemExit(f"no booted container for {bundle_id} — is a simulator booted with the app installed?")
    return container / LENS_RELATIVE


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: dataplane.py <bundle-id>", file=sys.stderr)
        return 2
    bundle_id = sys.argv[1]
    container = container_path(bundle_id)
    if container is None:
        print(f"no booted simulator with {bundle_id} installed")
        return 1
    print(f"data plane   {data_plane()}")
    print(f"container    {container}")
    print(f"trace dir    {container / LENS_RELATIVE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
