#!/usr/bin/env python3
"""Renders a token-bearing NetworkLens pack template into a concrete pack, resolved to now.

A NetworkLens pack stores each response body as base64, so its timestamps are invisible to review
and to grep — a pack captured months ago carries absolute timestamps that have since gone stale,
and nothing about the file says so. Two commands fix that:

  templatize  pack.json -o template.json
      Decodes every body to plain JSON and rewrites each epoch-millis literal as an offset token
      ({{anchor+90m}}), so the template is readable, diffable, and carries no absolute time.

  render      template.json -o pack.json [--anchor-at <iso8601|epoch_ms>]
      Resolves the tokens against the current clock (or --anchor-at) and re-encodes the bodies,
      producing a pack that lens_import_pack accepts.

Intervals between timestamps survive both directions exactly, so a schedule that was "starts 2h
before the anchor, ends 4h after" stays that regardless of the day it is rendered on.

Tokens, as JSON strings — a whole-string token becomes a number, an embedded one is substituted in
place (which is how ids like "<start>-<end>" keep working):

    {{now}} {{anchor}} {{startOfDay}} {{endOfDay}}   and any of those ±<count><unit>
    units: s m h d                                   e.g. {{now-2h}} {{startOfDay+3d}} {{anchor+45m}}
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TOKEN_PATTERN = re.compile(r"\{\{\s*(now|anchor|startOfDay|endOfDay)\s*(?:([+-])\s*(\d+)\s*([smhd]))?\s*\}\}")
EPOCH_MILLIS_PATTERN = re.compile(r"(?<![\d.])1[5-9]\d{11}(?![\d.])")
UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}

# UTC unless TEST_FORGE_TIMEZONE_OFFSET_HOURS says otherwise. An app that renders date labels in local time
# needs its own offset: a template anchored in the wrong zone puts a "starts today" schedule on the
# wrong calendar day for a third of every day. Read from the environment rather than taken as a flag
# because this module is imported as a library as well as run as a command.
DEFAULT_TIMEZONE = timezone(timedelta(hours=float(os.environ.get("TEST_FORGE_TIMEZONE_OFFSET_HOURS", "0"))))


def parse_anchor(raw: str | None) -> datetime:
    if raw is None:
        return datetime.now(tz=DEFAULT_TIMEZONE)
    if raw.isdigit():
        return datetime.fromtimestamp(int(raw) / 1000, tz=DEFAULT_TIMEZONE)
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=DEFAULT_TIMEZONE)
    return parsed


def resolve_token(base: str, sign: str | None, count: str | None, unit: str | None, anchor: datetime) -> int:
    if base in ("now", "anchor"):
        moment = anchor
    elif base == "startOfDay":
        moment = anchor.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        moment = anchor.replace(hour=23, minute=59, second=59, microsecond=0)

    if sign and count and unit:
        delta = timedelta(seconds=int(count) * UNIT_SECONDS[unit])
        moment = moment + delta if sign == "+" else moment - delta

    return int(moment.timestamp() * 1000)


def resolve_value(value: Any, anchor: datetime, stats: dict[str, int]) -> Any:
    if isinstance(value, dict):
        return {key: resolve_value(item, anchor, stats) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve_value(item, anchor, stats) for item in value]
    if not isinstance(value, str):
        return value

    whole = TOKEN_PATTERN.fullmatch(value.strip())
    if whole:
        stats["resolved"] += 1
        return resolve_token(whole.group(1), whole.group(2), whole.group(3), whole.group(4), anchor)

    def substitute(match: re.Match[str]) -> str:
        stats["resolved"] += 1
        return str(resolve_token(match.group(1), match.group(2), match.group(3), match.group(4), anchor))

    return TOKEN_PATTERN.sub(substitute, value)


def each_step_body(pack: dict[str, Any]):
    """Yields every `respond` payload in the pack, the one place a body can live."""
    for mock in pack.get("mocks", []):
        for variant in mock.get("variants", []):
            for step in variant.get("steps", []):
                respond = step.get("respond", {}).get("_0")
                if isinstance(respond, dict):
                    yield mock, variant, respond


def templatize(pack: dict[str, Any], anchor_override: str | None) -> dict[str, Any]:
    """Decodes bodies and turns absolute epoch millis into offsets from a per-body anchor.

    The anchor is that body's own earliest timestamp unless overridden, so the token offsets read
    as "how far into the schedule" rather than as an arbitrary distance from an unrelated instant.
    """
    for mock, variant, respond in each_step_body(pack):
        encoded = respond.get("body")
        if not isinstance(encoded, str) or not encoded:
            continue
        try:
            decoded = base64.b64decode(encoded).decode("utf-8")
            body = json.loads(decoded)
        except (ValueError, UnicodeDecodeError) as error:
            print(f"  ! {mock['endpointKey']} / {variant.get('name')}: body left as-is ({error})", file=sys.stderr)
            continue

        found = sorted({int(value) for value in EPOCH_MILLIS_PATTERN.findall(json.dumps(body))})
        respond.pop("body", None)
        if not found:
            respond["bodyJSON"] = body
            print(f"  = {mock['endpointKey']} / {variant.get('name')}: decoded, no timestamps")
            continue

        anchor_ms = int(anchor_override) if anchor_override and anchor_override.isdigit() else found[0]
        replacements = {value: offset_token(value, anchor_ms) for value in found}
        respond["bodyJSON"] = apply_replacements(body, replacements)
        anchor_readable = datetime.fromtimestamp(anchor_ms / 1000, tz=DEFAULT_TIMEZONE).isoformat()
        print(f"  ~ {mock['endpointKey']} / {variant.get('name')}: {len(found)} timestamps, anchor {anchor_readable}")

    pack["templateFormat"] = 1
    return pack


def offset_token(value: int, anchor_ms: int) -> str:
    delta_seconds = round((value - anchor_ms) / 1000)
    if delta_seconds == 0:
        return "{{anchor}}"
    sign = "+" if delta_seconds > 0 else "-"
    magnitude = abs(delta_seconds)
    for unit in ("d", "h", "m"):
        size = UNIT_SECONDS[unit]
        if magnitude % size == 0 and magnitude >= size:
            return f"{{{{anchor{sign}{magnitude // size}{unit}}}}}"
    return f"{{{{anchor{sign}{magnitude}s}}}}"


def apply_replacements(value: Any, replacements: dict[int, str]) -> Any:
    if isinstance(value, dict):
        return {key: apply_replacements(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [apply_replacements(item, replacements) for item in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in replacements:
        return replacements[value]
    if isinstance(value, str):
        rendered = value
        for original, token in replacements.items():
            rendered = rendered.replace(str(original), token)
        return rendered
    return value


def render(template: dict[str, Any], anchor: datetime) -> dict[str, Any]:
    stats = {"resolved": 0}
    for mock, variant, respond in each_step_body(template):
        body = respond.pop("bodyJSON", None)
        if body is None:
            continue
        resolved = resolve_value(body, anchor, stats)
        respond["body"] = base64.b64encode(json.dumps(resolved, separators=(",", ":")).encode("utf-8")).decode("ascii")
        print(f"  → {mock['endpointKey']} / {variant.get('name')}: rendered")
    template.pop("templateFormat", None)
    template["notes"] = f"{template.get('notes', '').strip()} Rendered by render_fixture.py at {anchor.isoformat()}.".strip()
    print(f"  {stats['resolved']} token(s) resolved against {anchor.isoformat()}")
    return template


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("templatize", "render"))
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument(
        "--anchor-at",
        help="render: the instant {{now}}/{{anchor}} resolve to (ISO 8601 or epoch millis). "
        "templatize: force this anchor instead of each body's earliest timestamp.",
    )
    args = parser.parse_args()

    document = json.loads(args.input.read_text())
    if args.command == "templatize":
        result = templatize(document, args.anchor_at)
    else:
        result = render(document, parse_anchor(args.anchor_at))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
