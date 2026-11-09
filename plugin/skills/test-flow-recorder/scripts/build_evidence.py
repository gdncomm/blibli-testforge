#!/usr/bin/env python3
"""Turns a run's results into the local report set and the DEV_TESTING_EVIDENCE page bodies.

Inputs are `cases.json` (parse_test_cases.py) and a `results.json` the run produces. What comes
out depends on `--layout`:

  single   one `<Feature>TestForgeRun.md`, plus one `evidence.html` and one `attachments.txt`.
           For a feature whose test cases live on a single Confluence page.

  multi    a folder: `README.md` holding the bird's-eye view, one `pages/<slug>.md` per source
           page, one `html/` body per page plus an index body, and media staged per page
           (`--media-dir`, which belongs outside the repo when `--out-dir` is committed).
           For a revamp or any feature whose cases are split across a parent page and children —
           a single 183-case document is not something a reviewer can read.

  auto     multi when the case set spans more than one page, single otherwise (the default).

Every document carries a table of contents, the run's attribution (who ran it, on what build), and
verdict badges. Local media paths are written `~`-relative: these documents get committed and
shared, and an absolute path under someone's home directory is both noise and personal data.

The test case pages are never written by this script or by anything downstream of it. It emits
bodies for the evidence pages, and nothing else.

`results.json` is either a bare array of case results or `{"run": {…}, "results": […]}`. The
envelope is where the run-level facts live — documentation posture, the scope paths, the confirmed
endpoint list — and the posture decides whether the report presents a discrepancy as an adjudicated
fault or as a disagreement. A discrepancy also carries an `authority` (`app-wrong`/`doc-wrong`/
`undecided`, per `contracts/healing.md`); `app-wrong` with no `techDoc` or `developer` among its
`expectationSources` is reported as unsupportable rather than rendered as settled.

Usage:
    build_evidence.py cases.json results.json --out-dir <dir> [--layout auto|single|multi]
        [--feature "<Feature Name>"] [--runner "Name"] [--run-label "..."]
        [--environment env.json] [--main-page <pageId>]
        [--posture documented|partial|undocumented]
"""

from __future__ import annotations

import argparse
import collections
import html
import json
import re
import shutil
import sys
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

VERDICTS = ("PASS", "DISCREPANCY", "BLOCKED", "UNVERIFIABLE")

# Emoji carries the colour everywhere; the span carries it in renderers that keep inline HTML
# (Confluence, most IDE previews). Neither alone covers both audiences.
VERDICT_STYLE = {
    "PASS": ("\U0001F7E2", "#1F883D"),
    "DISCREPANCY": ("\U0001F534", "#B42318"),
    "BLOCKED": ("\U0001F7E0", "#B54708"),
    "UNVERIFIABLE": ("\u26AA", "#6E7781"),
}

# `healing.md`'s authority verdicts. A discrepancy without one is unadjudicated, which is the honest
# default — and on scope with no tech document it is the *only* verdict reachable from evidence.
AUTHORITY_NOTES = {
    "app-wrong": "Behaviour contradicts a spec confirmed current — eligible for a fix.",
    "doc-wrong": "Behaviour is intentional; the test case or tech document is stale.",
    "undecided": "Two sources disagree and nobody has ruled yet. Not eligible for any code change.",
}

# An `app-wrong` verdict needs a spec or a person behind it. Code reading proves what the app does,
# never that it is wrong.
AUTHORITY_EVIDENCE = ("techDoc", "developer")

POSTURE_NOTES = {
    "documented": "",
    "partial": "This scope has no reference document. A discrepancy below records a **disagreement** "
               "between the test case document and the app — not a proven fault.",
    "undocumented": "This scope has no reference document. A discrepancy below records a **disagreement** "
                    "between the test case document and the app — not a proven fault.",
}

VERDICT_NOTES = {
    "PASS": "Observed behaviour matches the expected result.",
    "DISCREPANCY": "Observed behaviour differs from the expected result — needs a call on which side is wrong.",
    "BLOCKED": "The precondition could not be reached, so the expectation was never exercised.",
    "UNVERIFIABLE": "The expected result is not assertable as written; see Recommendations.",
}

HOME = str(Path.home())


def tilde(value: Any) -> str:
    """`/Users/someone/Documents/…` -> `~/Documents/…`, anywhere in a string."""
    return str(value or "").replace(HOME, "~")


def escape(value: Any) -> str:
    return html.escape(str(value or "").strip())


def strip_markup(value: str) -> str:
    """Markdown emphasis reads as literal asterisks in Confluence storage format."""
    return re.sub(r"\*\*(.+?)\*\*", r"\1", str(value or ""))


def cell(value: Any) -> str:
    """Confluence keeps hard line breaks inside a cell, which is how a multi-endpoint API cell reads.

    Expectations are quoted from the source sheet verbatim, and a sheet written in Confluence or
    markdown carries `code spans` and **emphasis** in that text. Escaping alone would publish the
    backticks and asterisks as literal characters, so they are converted after escaping — the order
    matters, since converting first would let the tags be escaped away.
    """
    text = escape(tilde(value)).replace("\n", "<br/>")
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", text)


def md_cell(value: Any) -> str:
    """A markdown table cell cannot hold a raw pipe or newline."""
    return tilde(value).strip().replace("|", "\\|").replace("\n", " ")


def image_embed(name: str, width: int = 260) -> str:
    return f'<ac:image ac:width="{width}"><ri:attachment ri:filename="{escape(name)}"/></ac:image>'


def video_embed(name: str, width: int = 260, height: int = 540) -> str:
    """Captures are portrait, so height has to be stated — the multimedia macro squares the player
    off its width otherwise and letterboxes every frame."""
    return ('<ac:structured-macro ac:name="multimedia" ac:schema-version="1">'
            f'<ac:parameter ac:name="name"><ri:attachment ri:filename="{escape(name)}"/></ac:parameter>'
            f'<ac:parameter ac:name="width">{width}</ac:parameter>'
            f'<ac:parameter ac:name="height">{height}</ac:parameter></ac:structured-macro>')


def review_block(results: list[dict[str, Any]]) -> list[str]:
    pending = awaiting_review(results)
    if not pending:
        return []
    parts = ["<h3>Waiting on a human</h3>",
             "<p>These cases ran. What is missing is a judgement no command can make — an easing "
             "curve, a mid-transition frame, a haptic. Each carries its recording, so the question "
             "a person has to answer is one glance away rather than a re-run away. They are out of "
             "the pass-rate denominator, exactly as blocked cases are: a case awaiting judgement has "
             "neither passed nor failed.</p>"]
    rows = ["<tr><th>Test Case ID</th><th>Reason</th><th>Verified by the run</th>"
            "<th>Left to a person</th><th>Suggested rewording</th><th>Evidence</th></tr>"]
    for result in pending:
        reason = str(result.get("unverifiableReason") or "")
        gloss = UNVERIFIABLE_REASONS.get(reason)
        reason_cell = (f"<code>{escape(reason)}</code><br/><em>{escape(gloss)}</em>" if gloss
                       else (f"<code>{escape(reason)}</code>" if reason
                             else "<em>no reason code recorded — this is a gap, not a verdict</em>"))
        partial = result.get("partialVerification") or {}
        listed = lambda items: "<br/>".join(f"— {cell(item)}" for item in items) or "—"
        rows.append(
            "<tr>"
            f"<td><strong>{escape(result['caseId'])}</strong></td>"
            f"<td>{reason_cell}</td>"
            f"<td>{listed(partial.get('verified') or [])}</td>"
            f"<td>{listed(partial.get('notVerified') or [])}</td>"
            f"<td>{cell((result.get('proposedRewording') or {}).get('suggestion') if isinstance(result.get('proposedRewording'), dict) else result.get('proposedRewording'))}</td>"
            f"<td>{evidence_cell(result)}</td>"
            "</tr>")
    parts.append('<table data-layout="full-width"><tbody>' + "".join(rows) + "</tbody></table>")
    missing = unreasoned(results)
    if missing:
        parts.append('<ac:structured-macro ac:name="warning" ac:schema-version="1"><ac:rich-text-body>'
                     f"<p>{len(missing)} case(s) are marked <code>UNVERIFIABLE</code> with no reason "
                     "code: " + escape(", ".join(missing))
                     + ". A verdict without a reason cannot be acted on and cannot be challenged — "
                       "it reads like a finding while carrying none of the information one needs.</p>"
                     "</ac:rich-text-body></ac:structured-macro>")
    return parts


def fix_block(results: list[dict[str, Any]]) -> list[str]:
    """Root cause and proposed fixes — a section, never a column.

    Two reasons it is shaped this way. The results table is fixed at eleven columns by contract, so a
    file path and a diff have nowhere to go in it. And these findings do not belong beside the
    recommendations for the test case document: those are for whoever owns the sheet, these are for
    whoever owns the code, and merging them makes both easier to leave unowned.
    """
    explained = [result for result in results if rca_of(result) or patch_of(result)]
    if not explained:
        return []
    patched = sum(1 for result in explained if patch_of(result).get("diff"))
    parts = ["<h3>Root cause and proposed fixes</h3>",
             "<p>What the run established about the code behind a finding. A root cause is recorded on "
             "any verdict, because proving what the app does and why is what lets a developer rule on "
             "a disagreement in a minute rather than an afternoon &mdash; but it is not authority, and "
             f"<strong>nothing here has been applied</strong>. Of {len(explained)} case(s) with a named "
             f"cause, {patched} {'carries' if patched == 1 else 'carry'} a diff: only a case "
             "adjudicated <code>app-wrong</code> whose "
             "change falls inside the whitelist gets one, and everything else stays a recommendation "
             "in prose on purpose.</p>"]
    rows = ["<tr><th>Test Case ID</th><th>Authority</th><th>Where</th><th>Cause</th>"
            "<th>Proposed change</th></tr>"]
    for result in explained:
        rca = rca_of(result)
        patch = patch_of(result)
        patch_class = str(patch.get("class") or "")
        if patch.get("diff"):
            proposal = (f"<code>{escape(patch_class or 'unset')}</code> &mdash; "
                        f"{escape(PATCH_CLASSES.get(patch_class, 'outside the whitelist'))}"
                        "<br/><em>diff below, not applied</em>")
        elif result.get("recommendation"):
            proposal = "<em>prose recommendation &mdash; see the recommendations table</em>"
        else:
            proposal = "<em>none proposed &mdash; the finding is the deliverable</em>"
        rows.append(
            "<tr>"
            f"<td><strong>{escape(result['caseId'])}</strong></td>"
            f"<td>{cell(authority_of(result) or '—')}</td>"
            f"<td><code>{escape(rca_location(rca))}</code></td>"
            f"<td>{cell(rca.get('cause'))}</td>"
            f"<td>{proposal}</td>"
            "</tr>")
    parts.append('<table data-layout="full-width"><tbody>' + "".join(rows) + "</tbody></table>")

    for result in explained:
        patch = patch_of(result)
        diff = str(patch.get("diff") or "").strip()
        if not diff:
            continue
        rationale = (f"<p>{cell(patch.get('rationale'))}</p>" if patch.get("rationale") else "")
        parts.append(
            '<ac:structured-macro ac:name="expand" ac:schema-version="1"><ac:parameter ac:name="title">'
            f'{escape(result["caseId"])} — proposed diff, not applied</ac:parameter><ac:rich-text-body>'
            + rationale
            + '<ac:structured-macro ac:name="code" ac:schema-version="1">'
              '<ac:parameter ac:name="language">diff</ac:parameter>'
              f"<ac:plain-text-body><![CDATA[{diff}]]></ac:plain-text-body>"
              "</ac:structured-macro></ac:rich-text-body></ac:structured-macro>")

    missing = unexplained(results)
    if missing:
        parts.append('<ac:structured-macro ac:name="warning" ac:schema-version="1"><ac:rich-text-body>'
                     f"<p>{len(missing)} case(s) are adjudicated <code>app-wrong</code> with no root "
                     "cause recorded: " + escape(", ".join(missing))
                     + ". Naming the app as the wrong side is the strongest verdict this run can "
                       "reach, and without a file and a mechanism behind it there is nothing for a "
                       "developer to act on or to argue with.</p>"
                     "</ac:rich-text-body></ac:structured-macro>")
    return parts


def network_trail_block(results: list[dict[str, Any]]) -> list[str]:
    """Network trail — a section, never a column, for the same reason `fix_block` is one: the
    results table is fixed at eleven columns, and per-endpoint findings have nowhere to sit in it.

    `scripts/check_network_trail.py` checks a case's whole API surface against the trace — endpoints
    it expected but that never fired, ones that fired but were not expected, ones that fired more
    than once — for whichever cases recorded a `networkWindowStart`/`networkWindowEnd`. This is
    informational only: it never changes `verdict`, because whether a gap is a test-writing miss, an
    app bug, or a call the `api` column simply didn't mention is a call for a person, not this script.
    """
    flagged = [result for result in results if any(network_trail_of(result).get(key)
                                                    for key in ("missing", "unexpected", "duplicates"))]
    if not flagged:
        return []
    parts = ["<h3>Network trail</h3>",
             "<p>Endpoints a case's own <code>api</code> column named that never fired, endpoints that "
             "fired without being named, and endpoints that fired more than once — checked against the "
             f"same trace <code>isMockServed</code> reads. {len(flagged)} case(s) below have a finding. "
             "<strong>None of this changes a verdict</strong>: it surfaces a gap for a person to rule "
             "on, the same way <code>contracts/healing.md</code> sends an expectation mismatch to "
             "adjudication rather than resolving it automatically.</p>"]
    rows = ["<tr><th>Test Case ID</th><th>Missing</th><th>Unexpected</th><th>Duplicates</th></tr>"]
    for result in flagged:
        trail = network_trail_of(result)
        missing = "<br/>".join(f"<code>{escape(key)}</code>" for key in trail.get("missing") or []) or "—"
        unexpected = "<br/>".join(f"<code>{escape(item['endpointKey'])}</code> &times;{item['count']}"
                                  for item in trail.get("unexpected") or []) or "—"
        duplicates = "<br/>".join(f"<code>{escape(item['endpointKey'])}</code> &times;{item['count']}"
                                  for item in trail.get("duplicates") or []) or "—"
        rows.append(
            "<tr>"
            f"<td><strong>{escape(result['caseId'])}</strong></td>"
            f"<td>{missing}</td>"
            f"<td>{unexpected}</td>"
            f"<td>{duplicates}</td>"
            "</tr>")
    parts.append('<table data-layout="full-width"><tbody>' + "".join(rows) + "</tbody></table>")
    return parts


def tracker_trail_block(results: list[dict[str, Any]]) -> list[str]:
    """Tracker trail — a section, never a column, same reason and same placement as
    `network_trail_block` (right after it): the results table is fixed at eleven columns.

    `scripts/check_tracker_validation.py` checks each case's named TRMS ids against the trace, for
    whichever cases recorded a `networkWindowStart`/`networkWindowEnd` — did the tracker fire in
    that window, and (when a saved TRMS snapshot resolved a contract) did the payload match it.
    Informational only, same rule as the network trail: never touches `verdict`.
    """
    flagged = [result for result in results if tracker_trail_of(result).get("unexpectedTrmsIds") or any(
        entry.get("fired") == 0 or entry.get("problems") or entry.get("contractError")
        for entry in tracker_trail_of(result).get("trackers", {}).values()
    )]
    if not flagged:
        return []
    parts = ["<h3>Tracker trail</h3>",
             "<p>TRMS ids each case names, checked against the trace for whether they fired in the "
             "case's window and, when a saved TRMS snapshot could be read, whether the payload "
             "matched it. <strong>None of this changes a verdict</strong> — the same "
             "<code>contracts/healing.md</code> reasoning as the Network trail section above: a "
             "miss is a call for a person, not this script.</p>"]
    rows = ["<tr><th>Test Case ID</th><th>TRMS ID</th><th>Fired</th><th>Finding</th></tr>"]
    for result in flagged:
        trail = tracker_trail_of(result)
        for trms_id, entry in trail.get("trackers", {}).items():
            parts = []
            if not entry.get("fired"):
                parts.append("<strong>did not fire in window</strong>")
            if entry.get("contractError"):
                parts.append(f"<em>no contract: {escape(entry['contractError'])}</em>")
            if entry.get("problems"):
                parts.append("<br/>".join(escape(problem) for problem in entry["problems"]))
            if not parts:
                continue
            finding = "<br/>".join(parts)
            rows.append(
                "<tr>"
                f"<td><strong>{escape(result['caseId'])}</strong></td>"
                f"<td><code>{escape(trms_id)}</code></td>"
                f"<td>{entry.get('fired', 0)}</td>"
                f"<td>{finding}</td>"
                "</tr>")
        for extra in trail.get("unexpectedTrmsIds") or []:
            rows.append(
                "<tr>"
                f"<td><strong>{escape(result['caseId'])}</strong></td>"
                f"<td><code>{escape(extra['trmsId'])}</code></td>"
                f"<td>{extra.get('fired', 0)}</td>"
                "<td><em>fired but not on this case's list</em></td>"
                "</tr>")
    parts.append('<table data-layout="full-width"><tbody>' + "".join(rows) + "</tbody></table>")
    return parts


def devices_used(results: list[dict[str, Any]]) -> list[tuple[tuple[str, str, str], list[str]]]:
    """Every device the run touched, with the cases it produced, in first-seen order.

    A list even when there is one device, so the report's shape does not change the day a second is
    added. A case id under more than one device is a matrix row, not a duplicate.
    """
    seen: dict[tuple[str, str, str], list[str]] = {}
    for result in results:
        device = result.get("device") or {}
        if not device:
            continue
        key = (device.get("deviceName") or "unknown", device.get("osVersion") or "unknown",
               device.get("screenPoints") or "unknown")
        seen.setdefault(key, []).append(result["caseId"])
    return list(seen.items())


def devices_table(results: list[dict[str, Any]]) -> list[str]:
    used = devices_used(results)
    if not used:
        return ["<p><em>No device recorded against any case — this run predates per-case device "
                "capture, so nothing here says which screen size the evidence was taken at.</em></p>"]
    parts = ["<h3>Devices</h3>"]
    if len(used) > 1:
        parts.append("<p>This run spans more than one device. A case id appearing under two of them is "
                     "the same case run at two screen sizes, which is the point of the sweep — the "
                     "Device column on each row says which one that row is.</p>")
    rows = ["<tr><th>Device</th><th>OS</th><th>Screen (pt)</th><th>Cases</th></tr>"]
    for (name, version, points), ids in used:
        rows.append(f"<tr><td>{escape(name)}</td><td>{escape(version)}</td>"
                    f"<td><code>{escape(points)}</code></td>"
                    f"<td>{len(ids)} — {escape(', '.join(ids))}</td></tr>")
    parts.append("<table><tbody>" + "".join(rows) + "</tbody></table>")
    return parts


def device_cell(result: dict[str, Any]) -> str:
    """A case has no device by inheritance.

    With several simulators booted, or a matrix sweeping a screen from smallest to largest, the
    run-level device is not the case-level one — and a per-row value cannot drift out of step with
    the evidence beside it the way a note at the top of the page can.
    """
    device = result.get("device") or {}
    if not device:
        return "<em>not recorded</em>"
    lines = [f"<strong>{escape(device.get('deviceName') or 'unknown device')}</strong>"]
    if device.get("osVersion"):
        lines.append(f"iOS {escape(device['osVersion'])}")
    if device.get("screenPoints"):
        lines.append(f"<code>{escape(device['screenPoints'])}</code> pt")
    return "<br/>".join(lines)


def integrity_note(result: dict[str, Any]) -> str:
    """What the captured frame does and does not show.

    The accessibility tree sees an element through a keyboard; the camera does not. A verdict read
    off the tree can be right while the image published beside it does not show what the row claims,
    and a reviewer who looks for it and cannot find it has been handed something worse than no
    evidence. `unchecked` is reported as itself — a gate that did not run and a gate that passed must
    not render identically.
    """
    integrity = result.get("evidenceIntegrity")
    if integrity is None:
        return "<p><em>visibility unchecked</em></p>"
    if integrity.get("clean"):
        return ""
    parts = []
    for entry in integrity.get("obscured") or []:
        fraction = entry.get("obscuredFraction")
        percent = f" ({round(float(fraction) * 100)}% covered)" if fraction is not None else ""
        parts.append(f"<code>{escape(entry.get('identifier'))}</code> hidden behind "
                     f"{escape(entry.get('obscuredBy') or 'an overlay')}{percent}")
    body = "; ".join(parts) or "the frame does not show the asserted element"
    return (f"<p><strong>Evidence does not show the assertion:</strong> {body}. "
            "The observation above still stands — it was read from the accessibility tree, which "
            "sees through the obstruction. The image does not.</p>")


def evidence_cell(result: dict[str, Any]) -> str:
    """The Evidence column holds the capture itself, never only its filename.

    A reviewer reading a filename is being asked to take the row on trust, which is the one thing
    this page exists not to do. Screenshots embed as images, recordings as a player; the filename
    stays underneath so a claim can still be traced to a file without opening it.
    """
    blocks: list[str] = []
    for name in media_names(result):
        embed = video_embed(name) if name.lower().endswith(".mov") else image_embed(name)
        blocks.append(f"{embed}<p><em>{escape(name)}</em></p>")
    if needs_recording(result) and not result.get("video"):
        blocks.append("<p><em>no recording — expected one for this case</em></p>")
    blocks.append(integrity_note(result))
    return "".join(blocks) or "—"


def badge(verdict: str) -> str:
    emoji, colour = VERDICT_STYLE.get(verdict.upper(), ("", "#6E7781"))
    return f'{emoji} <span style="color:{colour}">**{verdict.upper()}**</span>'


def field(label: str, value: Any) -> str:
    """Every `Label:` line reads as a label — bold, so a case's facts scan as a list not prose."""
    return f"- **{label}:** {tilde(value)}"


def anchor(heading: str) -> str:
    """GitHub's heading slug, so a table of contents actually lands on its section."""
    slug = heading.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug, flags=re.UNICODE)
    return re.sub(r"[\s]+", "-", slug)


def slugify(value: str) -> str:
    slug = re.sub(r"[^\w]+", "-", str(value or "").lower()).strip("-")
    return slug or "page"


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def read_results(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """`[…]`, or `{"run": {…}, "results": […]}`.

    The run-level fields the evidence contract requires — posture, scope paths, the confirmed
    endpoint list — have nowhere to live in a bare array, and every run written before they existed
    is a bare array. Both shapes stay readable so an older run still regenerates.
    """
    loaded = load(path)
    if isinstance(loaded, dict):
        return list(loaded.get("results") or []), dict(loaded.get("run") or {})
    return list(loaded), {}


def resolve_runner(explicit: str | None) -> str:
    if explicit:
        return explicit
    try:
        name = subprocess.run(["git", "config", "user.name"], capture_output=True, text=True).stdout.strip()
    except Exception:
        name = ""
    return name or "unattributed"


def index_cases(cases: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {case["caseId"]: case for case in cases}


def summary_counts(results: list[dict[str, Any]]) -> dict[str, int]:
    counts = {verdict: 0 for verdict in VERDICTS}
    for result in results:
        counts[result.get("verdict", "").upper()] = counts.get(result.get("verdict", "").upper(), 0) + 1
    return counts


def media_paths(result: dict[str, Any]) -> list[str]:
    """Screenshots, then every recording.

    `video` is a list once a case has been retried — `healing.md` records one recording per attempt,
    named `<caseId>-attempt<N>-<verdict>.mp4`, and the failed attempts are the visual proof of what
    the heal changed. A single string stays accepted: most cases pass first time and carry one.
    """
    paths = list(result.get("screenshots") or [])
    video = result.get("video")
    if isinstance(video, str):
        paths.append(video)
    elif video:
        paths.extend(video)
    return paths


def authority_of(result: dict[str, Any]) -> str:
    """Only a discrepancy has an authority, and `undecided` is the default rather than a blank."""
    if result.get("verdict", "").upper() != "DISCREPANCY":
        return ""
    return str(result.get("authority") or "undecided").lower()


def authority_badge(authority: str) -> str:
    if not authority:
        return "—"
    mark = {"app-wrong": "\U0001F6E0\uFE0F", "doc-wrong": "\U0001F4C4", "undecided": "\u2696\uFE0F"}
    return f"{mark.get(authority, '')} `{authority}`".strip()


def rca_of(result: dict[str, Any]) -> dict[str, Any]:
    """An RCA is welcome on any verdict, including `undecided` and `BLOCKED`.

    `healing.md` is explicit that code reading is not authority — but proving *what* the app does and
    *why* is most of a usable finding, and it is what turns an `undecided` into something a developer
    can rule on in a minute instead of an afternoon. So nothing gates this field on authority; only
    the patch beside it is gated.
    """
    rca = result.get("rca")
    return rca if isinstance(rca, dict) else {}


def patch_of(result: dict[str, Any]) -> dict[str, Any]:
    patch = result.get("patch")
    return patch if isinstance(patch, dict) else {}


def network_trail_of(result: dict[str, Any]) -> dict[str, Any]:
    """`scripts/check_network_trail.py`'s finding for this case, or `{}` when it was never checked
    (no `networkWindowStart`/`networkWindowEnd` was recorded, so the case has no trace window to
    check). The page only ever surfaces cases with an actual finding — see `network_trail_block()` —
    so this absent-means-unchecked case and a checked-and-clean case render identically here, which
    is fine: neither has anything the page needs to say."""
    trail = result.get("networkTrail")
    return trail if isinstance(trail, dict) else {}


def tracker_trail_of(result: dict[str, Any]) -> dict[str, Any]:
    """`scripts/check_tracker_validation.py`'s finding for this case, or `{}` when never checked —
    same absent-means-unchecked convention as `network_trail_of`."""
    trail = result.get("trackerTrail")
    return trail if isinstance(trail, dict) else {}


def rca_location(rca: dict[str, Any]) -> str:
    """`file:line` if both are there, because that is the form an editor and a reviewer both take."""
    location = str(rca.get("file") or "").strip()
    if not location:
        return "location not recorded"
    if rca.get("line"):
        location = f"{location}:{rca['line']}"
    symbol = str(rca.get("symbol") or "").strip()
    return f"{location} ({symbol})" if symbol else location


def patch_faults(results: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Patches that must not travel, each with the reason it is refused.

    A patch is a diff a later pass may apply without a human reading the code around it, so every
    condition here is one that would otherwise let a change land on authority nobody gave. This gate
    has no override flag, unlike the recording gate: a missing clip is a hole in the evidence, while
    an unauthorised patch is a code change waiting to happen.
    """
    faults: list[tuple[str, str]] = []
    for result in results:
        patch = patch_of(result)
        if not patch:
            continue
        case_id = result["caseId"]
        authority = authority_of(result)
        if authority != "app-wrong":
            held = authority or (result.get("verdict", "?").upper() + ", which has no authority")
            faults.append((case_id, f"authority is `{held}` — only `app-wrong` may carry a patch"))
        patch_class = str(patch.get("class") or "")
        if patch_class not in PATCH_CLASSES:
            faults.append((case_id, f"patch class `{patch_class or 'unset'}` is outside healing.md's "
                                    "whitelist — propose that change in prose instead"))
        if not rca_of(result):
            faults.append((case_id, "patch with no `rca` — a diff with no named cause is a guess"))
        if not str(patch.get("diff") or "").strip():
            faults.append((case_id, "patch with no `diff` — nothing to review, nothing to apply"))
        sites = patch.get("callSites")
        if patch_class in SINGLE_SITE_CLASSES and sites != 1:
            counted = sites if sites is not None else "unrecorded"
            faults.append((case_id, f"class `{patch_class}` exists because the change cannot reach "
                                    f"anywhere else, and `callSites` is {counted}"))
        if patch.get("applied"):
            faults.append((case_id, "`applied: true` in a run report — a run proposes, the "
                                    "apply-fixes pass applies"))
    return faults


def unexplained(results: list[dict[str, Any]]) -> list[str]:
    """`app-wrong` cases with no RCA at all — an adjudicated fault nobody can act on."""
    return [result["caseId"] for result in results
            if authority_of(result) == "app-wrong" and not rca_of(result)]


def unsupportable(results: list[dict[str, Any]]) -> list[str]:
    """`app-wrong` cases whose expectation never came from a spec or a person.

    The evidence contract calls this an unsupportable verdict, and it is the one drift the report can
    catch on its own: without it a legacy run's guesswork reads exactly like an adjudicated finding.
    """
    flagged = []
    for result in results:
        if authority_of(result) != "app-wrong":
            continue
        sources = {str(source) for source in result.get("expectationSources") or []}
        if not sources & set(AUTHORITY_EVIDENCE):
            flagged.append(result["caseId"])
    return flagged


# `BLOCKED` is exempt from the recording requirement: it never ran far enough to film anything.
# `UNVERIFIABLE` is *not* exempt, and treating it as though it were was a real gap. A case the machine
# cannot judge still ran — what is missing is the judgement, not the behaviour. The clip is then the
# whole deliverable, because it is what lets a person answer in one glance what no command can answer
# at all. Only a case with nothing verifiable in it and no human review pending has nothing to film.
RECORDED_VERDICTS = ("PASS", "DISCREPANCY", "UNVERIFIABLE")

# `healing.md`'s app-side whitelist, keyed by the `class` a patch has to declare. The whitelist bounds
# what may travel as a diff at all — a change is judged by its blast radius, not by how obvious it
# looks — and everything outside it is a recommendation in prose carrying no patch.
PATCH_CLASSES = {
    "spacing": "a spacing or padding constant",
    "text-property": "a font token, line limit or alignment",
    "colour-token": "a colour token",
    "single-site-constant": "a boolean or numeric constant with exactly one call site",
    "accessibility-identifier": "a missing accessibility identifier",
}

# Classes whose whole justification is that the change cannot reach anywhere else. `callSites` has to
# say so explicitly: "I only found one" and "there is only one" are different claims.
SINGLE_SITE_CLASSES = ("single-site-constant",)

UNVERIFIABLE_REASONS = {
    "animation-timing": "duration, easing, frame rate or smoothness — the driver has no frame clock",
    "intermediate-frame": "a state that exists only mid-transition; the tree and the shutter both land "
                          "after the UI settles, so the frame is unobservable rather than merely hard "
                          "to catch",
    "non-visual": "haptics, sound or announcements — nothing in the vocabulary has a sense for them",
    "subjective": "no observable predicate to be right or wrong about — a defect in the case, not the tool",
    "underspecified": "names no checkable property, so there is nothing to check",
    "device-absent": "answerable, but not on the devices this run used",
    "other-surface": "another platform, page or system owns the behaviour",
}


def awaiting_review(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Cases where the run produced the evidence and a person still has to make the call."""
    return [r for r in results
            if r.get("humanReviewRequired") or (r.get("partialVerification") or {}).get("notVerified")
            or str(r.get("verdict", "")).upper() == "UNVERIFIABLE"]


def unreasoned(results: list[dict[str, Any]]) -> list[str]:
    """`UNVERIFIABLE` with no reason code is a shrug, not a verdict — the report says so rather than
    letting it read like an adjudicated outcome."""
    return [r["caseId"] for r in results
            if str(r.get("verdict", "")).upper() == "UNVERIFIABLE" and not r.get("unverifiableReason")]

# Commands that change what the app is doing — a tap, a gesture, text entry, a navigation. A case
# built from these is a sequence, and a still frame can only show where it ended, not that the
# gesture landed, what moved, or what the app did in between.
ACTION_TOOLS = frozenset({
    "test_forge_tap", "test_forge_tap_by_label", "test_forge_swipe", "test_forge_scroll_until_exists", "test_forge_scroll_to_top",
    "test_forge_type", "test_forge_open_deeplink", "test_forge_relaunch_app", "test_forge_alert_tap",
})


def tool_of(command: Any) -> str:
    """A command is `{tool, args, result}`; older runs wrote it as the string `test_forge_tap(...)`."""
    if isinstance(command, dict):
        return str(command.get("tool") or "")
    return str(command).split("(", 1)[0].strip()


def interacts(result: dict[str, Any]) -> bool | None:
    """Whether the case drove the app, rather than only reading it.

    `interaction` on the result wins when it is set — a runner who knows the case better than its
    command list does says so once. Otherwise it is derived from the tools the case actually called.
    `None` means the case recorded no commands at all, so neither answer is evidence.
    """
    declared = result.get("interaction")
    if isinstance(declared, bool):
        return declared
    commands = result.get("commands")
    if not commands:
        return None
    return any(tool_of(command) in ACTION_TOOLS for command in commands)


def needs_recording(result: dict[str, Any]) -> bool:
    """A recording is owed by cases that *did* something, not by every case that reached a verdict.

    An existence or label check is fully settled by one still: a reviewer glances at the screenshot
    and the assertion is either visible or it is not. Filming that adds bytes and no evidence. A tap,
    swipe, scroll or navigation is the opposite — the claim is about a transition, and only a clip
    shows it.

    A case with no command list at all still owes one: an empty `commands` cannot prove the case was
    read-only, and this gate exists precisely because the quiet answer was wrong twice.
    """
    if result.get("verdict", "").upper() not in RECORDED_VERDICTS:
        return False
    return interacts(result) is not False


def unrecorded(results: list[dict[str, Any]]) -> list[str]:
    """Interacting cases with no recording behind them.

    Every other invariant in this skill fails closed; recording relied on the runner remembering to
    bracket the case, and across two runs it mostly did not. A silent omission becomes a visible one
    here, and `main` exits non-zero on it, so a run cannot report itself complete without the proof.
    """
    return [result["caseId"] for result in results if needs_recording(result) and not result.get("video")]


def undeclared(results: list[dict[str, Any]]) -> list[str]:
    """Cases whose recording requirement could only be decided by failing closed."""
    return [result["caseId"] for result in results
            if result.get("verdict", "").upper() in RECORDED_VERDICTS and interacts(result) is None]


def attachment_name(case_id: str, path: str) -> str:
    """`AB-003-01-first-step.png` — the case id has to be *in* the filename.

    Locally the case id is the folder, so the file itself is just `01-first-step.png`. A
    Confluence attachment has no folder: every case's first screenshot would arrive as `01-…` and
    collide, and a reviewer could not tell which case a file belonged to.
    """
    stem = Path(path).name
    return stem if stem.startswith(f"{case_id}-") or stem == f"{case_id}{Path(path).suffix}" else f"{case_id}-{stem}"


def media_names(result: dict[str, Any]) -> list[str]:
    return [attachment_name(result["caseId"], path) for path in media_paths(result)]


def stage_media(results: list[dict[str, Any]], media_dir: Path) -> list[tuple[str, Path]]:
    """Copies each capture under its attachment name. The originals stay put and stay canonical."""
    media_dir.mkdir(parents=True, exist_ok=True)
    staged: list[tuple[str, Path]] = []
    for result in results:
        for path in media_paths(result):
            # `~`-relative is the required form in results.json — these documents get committed, so an
            # absolute home path is both personal data and wrong on every other machine. Reading one
            # back without expanding it silently stages nothing and drops every Evidence line.
            source = Path(path).expanduser()
            target = media_dir / attachment_name(result["caseId"], path)
            if source.exists():
                shutil.copy2(source, target)
            staged.append((str(source), target))
    return staged


def group_by_page(cases: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Results bucketed by the source page their case came from, in first-seen order."""
    pages: dict[str, dict[str, Any]] = {}
    for result in results:
        case = cases.get(result["caseId"], {})
        page_id = case.get("pageId") or "unknown"
        page = pages.setdefault(page_id, {
            "pageId": page_id,
            "title": case.get("pageTitle") or "Unattributed cases",
            "results": [],
        })
        page["results"].append(result)
    for page in pages.values():
        page["slug"] = slugify(page["title"])
        page["total"] = sum(1 for case in cases.values() if case.get("pageId") == page["pageId"])
    return pages


# --- Markdown -------------------------------------------------------------------------------


def bar(counts: dict[str, int], width: int = 24) -> str:
    total = sum(counts.values()) or 1
    parts = []
    for verdict in VERDICTS:
        filled = round(counts.get(verdict, 0) / total * width)
        parts.append(VERDICT_STYLE[verdict][0] * filled)
    return "".join(parts) or "—"


def short_title(title: str) -> str:
    """Page titles all start `Test Cases - `; repeating it in every row buys nothing."""
    return re.sub(r"^test cases\s*[-–]\s*", "", str(title or ""), flags=re.IGNORECASE).strip() or str(title or "")


def headline(text: str, limit: int = 140) -> str:
    """First sentence, without splitting on the dot in `BliTab .fixed` or `background.start`."""
    match = re.search(r"(?<=[a-z0-9)\]\u201d])\.\s", str(text or ""))
    sentence = str(text or "")[: match.start() + 1] if match else str(text or "")
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "…"


def verdict_table(counts: dict[str, int], total_cases: int | None = None, scope: str = "on this page") -> list[str]:
    lines = ["| Verdict | Cases | |", "| --- | ---: | :-- |"]
    ran = sum(counts.values()) or 1
    for verdict in VERDICTS:
        count = counts.get(verdict, 0)
        share = f"{count / ran * 100:.0f}%" if count else "—"
        lines.append(f"| {badge(verdict)} | {count} | {share} |")
    footer = f"| **Total run** | **{sum(counts.values())}** | "
    footer += f"of {total_cases} {scope} |" if total_cases else "|"
    lines.append(footer)
    return lines


def run_metadata_block(run: dict[str, Any], results: list[dict[str, Any]]) -> list[str]:
    """The header a finding has to be read against — who ran it, and what they had to go on."""
    lines = [
        "## Run metadata",
        "",
        "| | |",
        "| --- | --- |",
        f"| **Run by** | {md_cell(run['runner'])} |",
        f"| **Driven by** | `test-flow-recorder` skill (Claude Code) against a booted simulator |",
        f"| **Run label** | {md_cell(run['label'])} |",
        f"| **Generated** | {datetime.now().strftime('%Y-%m-%d %H:%M')} |",
        f"| **Documentation posture** | `{md_cell(run.get('posture') or 'documented')}` |",
    ]
    sources = run.get("expectationSources") or sorted(
        {str(source) for result in results for source in result.get("expectationSources") or []})
    if sources:
        lines.append(f"| **Expectation sources** | {md_cell(', '.join(f'`{source}`' for source in sources))} |")
    for key in ("scopePaths", "referenceDocs"):
        value = run.get(key)
        if value:
            listed = ", ".join(f"`{tilde(item)}`" for item in value) if isinstance(value, list) else tilde(value)
            label = "Scope" if key == "scopePaths" else "Reference documents"
            lines.append(f"| **{label}** | {md_cell(listed)} |")
    endpoints = run.get("endpoints") or []
    if endpoints:
        # *How* each endpoint was established is the run's own provenance: a list built from a live
        # trace is a fact, one lifted from a code literal is a guess that happened to be right.
        how = collections.Counter(str(entry.get("how") or "?") for entry in endpoints
                                  if isinstance(entry, dict))
        detail = ", ".join(f"`{key}` {count}" for key, count in sorted(how.items())) or ""
        lines.append(f"| **Endpoints** | {len(endpoints)}"
                     + (f" ({md_cell(detail)}) |" if detail else " |"))
    if run.get("derivedReference"):
        lines.append(f"| **Derived reference** | `{md_cell(run['derivedReference'])}` |")
    attempts = [attempt for result in results for attempt in result.get("healAttempts") or []]
    if attempts:
        rolled = sum(1 for attempt in attempts if attempt.get("rolledBack"))
        lines.append(f"| **Heal attempts** | {len(attempts)} across "
                     f"{sum(1 for result in results if result.get('healAttempts'))} case(s), {rolled} rolled back |")
    for key, value in run["environment"].items():
        lines.append(f"| **{md_cell(key)}** | {md_cell(value)} |")
    lines.append("")
    return lines


def legend_block(run: dict[str, Any] | None = None, results: list[dict[str, Any]] | None = None) -> list[str]:
    lines = ["## Verdict legend", "", "| Verdict | Meaning |", "| --- | --- |"]
    lines += [f"| {badge(verdict)} | {VERDICT_NOTES[verdict]} |" for verdict in VERDICTS]
    lines.append("")
    if any(authority_of(result) for result in results or []):
        lines += ["Every discrepancy also carries an **authority** — which side the evidence says is wrong.", "",
                  "| Authority | Meaning |", "| --- | --- |"]
        lines += [f"| {authority_badge(key)} | {note} |" for key, note in AUTHORITY_NOTES.items()]
        lines.append("")
    caveat = POSTURE_NOTES.get(str((run or {}).get("posture") or "documented"), "")
    if caveat:
        lines += ["> [!IMPORTANT]", f"> {caveat}", ""]
    return lines


def case_section(result: dict[str, Any], case: dict[str, Any]) -> list[str]:
    verdict = result.get("verdict", "?").upper()
    heading = f"{result['caseId']} — {case.get('scenario', '(not in source document)')}"
    lines = [f"### {heading}", "", badge(verdict), ""]
    lines.append(field("Fixture", result.get("fixture") or "none"))
    lines.append(field("Expected", result.get("expected") or case.get("expected", "")))
    lines.append(field("Observed", result.get("observed", "")))
    lines.append(field("Source", f"page `{case.get('pageId', '?')}` v{case.get('pageVersion', '?')}, "
                                 f"hash `{case.get('sourceHash', '?')}`"))
    if case.get("requiresAuth"):
        source = case.get("authSource")
        suffix = f" [`{source}`]" if source else ""
        lines.append(field("Auth", f"signed-in user required — {case.get('authReason', 'unspecified')}{suffix}"))
    authority = authority_of(result)
    if authority:
        reason = tilde(result.get("authorityReason") or AUTHORITY_NOTES.get(authority, ""))
        lines.append(field("Authority", f"{authority_badge(authority)} — {reason}"))
    sources = result.get("expectationSources") or []
    if sources:
        lines.append(field("Judged against", ", ".join(f"`{source}`" for source in sources)))

    rca = rca_of(result)
    if rca:
        lines.append(field("Root cause", f"`{rca_location(rca)}` — {tilde(rca.get('cause', ''))}"))
    patch = patch_of(result)
    if patch:
        gloss = PATCH_CLASSES.get(str(patch.get("class") or ""), "**outside the whitelist**")
        lines.append(field("Proposed fix", f"`{patch.get('class', 'unset')}` — {gloss}. "
                                           "Not applied by this run."))

    media = [tilde(path) for path in media_paths(result)]
    if media:
        lines.append(field("Evidence", ", ".join(f"`{path}`" for path in media)))
    if needs_recording(result) and not result.get("video"):
        lines.append(field("Recording", "⚠️ **none captured** — this case drove the app but has no "
                                        "clip of the run behind it. See `contracts/evidence.md`"))

    steps = result.get("testForgeSteps") or []
    if steps:
        lines += ["", "<details><summary><b>Reproduce by hand</b></summary>", ""]
        lines += [f"{index}. {tilde(step)}" for index, step in enumerate(steps, start=1)]
        lines += ["", f"**Look for:** {tilde(result.get('expected') or case.get('expected', ''))}", "", "</details>"]

    commands = result.get("commands") or []
    if commands:
        lines += ["", "<details><summary><b>Commands run</b></summary>", ""]
        for command in commands:
            arguments = json.dumps(command.get("args", {}), separators=(",", ":"))
            lines.append(f"1. `{command.get('tool', '?')}({arguments})` → {tilde(command.get('result', ''))}")
        lines += ["", "</details>"]

    attempts = result.get("healAttempts") or []
    if attempts:
        lines += ["", "<details><summary><b>Heal attempts</b></summary>", "",
                  "| # | Class | Target | Change | Verdict | Kept |", "| ---: | --- | --- | --- | --- | --- |"]
        for index, attempt in enumerate(attempts, start=1):
            transition = f"{attempt.get('verdictBefore', '?')} → {attempt.get('verdictAfter', '?')}"
            kept = "no — rolled back" if attempt.get("rolledBack") else "yes"
            lines.append(f"| {index} | {md_cell(attempt.get('class'))} | `{md_cell(attempt.get('target'))}` "
                         f"| {md_cell(attempt.get('change'))} | {md_cell(transition)} | {kept} |")
        lines += ["", "</details>"]

    if patch.get("diff"):
        lines += ["", "<details><summary><b>Proposed diff — not applied</b></summary>", ""]
        if patch.get("rationale"):
            lines += [tilde(str(patch["rationale"])), ""]
        lines += ["```diff", str(patch["diff"]).rstrip(), "```", "", "</details>"]

    if result.get("notes"):
        lines += ["", f"> **Notes:** {tilde(result['notes'])}"]
    if result.get("recommendation"):
        recommendation = result["recommendation"]
        lines += ["", "> [!TIP]",
                  f"> **Raised by this run.** {tilde(recommendation.get('reason', ''))}",
                  ">",
                  f"> **Suggested action:** {tilde(recommendation.get('suggestion', ''))}"]
    lines.append("")
    return lines


def page_document(page: dict[str, Any], cases: dict[str, Any], run: dict[str, Any],
                  parent_link: str | None) -> str:
    results = page["results"]
    counts = summary_counts(results)
    title = page["title"]
    lines = [f"# {short_title(title)}", ""]
    if parent_link:
        lines += [f"[⬅ Back to the run overview]({parent_link})", ""]
    lines += [f"Source page `{page['pageId']}` · run by **{md_cell(run['runner'])}** · {md_cell(run['label'])}", "",
              bar(counts), ""]
    lines += verdict_table(counts, page.get("total"))
    lines.append("")

    lines += ["## Contents", ""]
    discrepancies = [result for result in results if result.get("verdict", "").upper() == "DISCREPANCY"]
    if discrepancies:
        lines.append(f"- [Discrepancies](#{anchor('Discrepancies')})")
    lines.append(f"- [Cases](#{anchor('Cases')})")
    for result in results:
        case = cases.get(result["caseId"], {})
        heading = f"{result['caseId']} — {case.get('scenario', '')}"
        emoji = VERDICT_STYLE.get(result.get("verdict", "").upper(), ("", ""))[0]
        lines.append(f"  - {emoji} [{result['caseId']}](#{anchor(heading)}) — {md_cell(case.get('scenario'))}")
    lines.append(f"- [Verdict legend](#{anchor('Verdict legend')})")
    lines.append(f"- [Run metadata](#{anchor('Run metadata')})")
    lines.append("")

    if discrepancies:
        lines += ["## Discrepancies", "",
                  "> [!CAUTION]",
                  f"> {len(discrepancies)} case(s) on this page did not match the expected result. "
                  "Each one names the source it disagrees with — the app, or the test case document.",
                  ""]
        lines += ["| Case | Scenario | Authority | Expected | Observed |", "| --- | --- | --- | --- | --- |"]
        for result in discrepancies:
            case = cases.get(result["caseId"], {})
            heading = f"{result['caseId']} — {case.get('scenario', '')}"
            lines.append(
                f"| [{result['caseId']}](#{anchor(heading)}) | {md_cell(case.get('scenario'))} "
                f"| {authority_badge(authority_of(result))} "
                f"| {md_cell(result.get('expected') or case.get('expected'))} | {md_cell(result.get('observed'))} |"
            )
        lines.append("")

    lines += ["## Cases", ""]
    for result in results:
        lines += case_section(result, cases.get(result["caseId"], {}))

    lines += legend_block(run, results)
    lines += run_metadata_block(run, results)
    return "\n".join(lines) + "\n"


def overview_document(feature: str, pages: dict[str, dict[str, Any]], cases: dict[str, Any],
                      results: list[dict[str, Any]], run: dict[str, Any],
                      page_links: dict[str, str], all_pages: list[tuple[str, str, int]]) -> str:
    counts = summary_counts(results)
    lines = [f"# {feature} — dev testing run", "",
             f"Run by **{md_cell(run['runner'])}** · {md_cell(run['label'])}", "",
             "Automated dev-side pass over the feature's Confluence test cases, driven from the "
             "`TestForgeDriverSession` harness against NetworkLens fixtures. Every case carries evidence, pass or "
             "fail. **The test case documents themselves are untouched by this run** — anything recommended "
             "against them is a recommendation only.", "",
             bar(counts), ""]
    lines += verdict_table(counts, len(cases), scope="across the feature")
    lines.append("")

    lines += ["## Contents", "",
              f"- [Coverage by page](#{anchor('Coverage by page')})",
              f"- [Open discrepancies](#{anchor('Open discrepancies')})",
              f"- [Verdict legend](#{anchor('Verdict legend')})",
              f"- [Run metadata](#{anchor('Run metadata')})",
              ""]

    lines += ["## Coverage by page", "",
              "| Page | Cases | Run | " + " | ".join(f"{VERDICT_STYLE[v][0]} {v.title()}" for v in VERDICTS) + " |",
              "| --- | ---: | ---: | " + " | ".join("---:" for _ in VERDICTS) + " |"]
    for page_id, title, total in all_pages:
        page = pages.get(page_id)
        link = page_links.get(page_id)
        name = f"[{md_cell(short_title(title))}]({link})" if link else md_cell(short_title(title))
        if not page:
            lines.append(f"| {name} | {total} | 0 | " + " | ".join("—" for _ in VERDICTS) + " |")
            continue
        page_counts = summary_counts(page["results"])
        cells = " | ".join(str(page_counts.get(verdict, 0) or "—") for verdict in VERDICTS)
        lines.append(f"| {name} | {total} | {len(page['results'])} | {cells} |")
    lines.append("")

    discrepancies = [result for result in results if result.get("verdict", "").upper() == "DISCREPANCY"]
    blocked = [result for result in results if result.get("verdict", "").upper() == "BLOCKED"]
    lines += ["## Open discrepancies", ""]
    if discrepancies or blocked:
        lines += ["> [!CAUTION]",
                  f"> {len(discrepancies)} discrepancy/-ies and {len(blocked)} blocked case(s) across the run.",
                  "",
                  "| Case | Page | Verdict | Authority | Scenario | Headline |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for result in discrepancies + blocked:
            case = cases.get(result["caseId"], {})
            page_id = case.get("pageId", "")
            link = page_links.get(page_id)
            heading = f"{result['caseId']} — {case.get('scenario', '')}"
            reference = f"[{result['caseId']}]({link}#{anchor(heading)})" if link else result["caseId"]
            lines.append(
                f"| {reference} | {md_cell(short_title(case.get('pageTitle')))} | {badge(result.get('verdict', '?'))} "
                f"| {authority_badge(authority_of(result))} "
                f"| {md_cell(case.get('scenario'))} | {md_cell(headline(result.get('observed')))} |"
            )
        lines.append("")
    else:
        lines += ["> [!TIP]", "> Nothing outstanding — every case run matched its expected result.", ""]

    lines += legend_block(run, results)
    lines += run_metadata_block(run, results)
    return "\n".join(lines) + "\n"


# --- Confluence bodies ----------------------------------------------------------------------


def page_body(title: str, results: list[dict[str, Any]], cases: dict[str, Any], run: dict[str, Any]) -> str:
    counts = summary_counts(results)
    parts: list[str] = [f"<h2>{escape(title)} — {escape(run['label'])}</h2>"]
    parts.append(f"<p>Run by <strong>{escape(run['runner'])}</strong>. Automated dev-side pass driven from the "
                 "TestForgeDriverSession harness against NetworkLens fixtures. Every case carries a screenshot, pass "
                 "or fail. The test case document itself is untouched by this run — anything this page "
                 "recommends changing there is a recommendation only.</p>")
    parts.append("<table><tbody><tr>" + "".join(f"<th>{verdict}</th>" for verdict in VERDICTS) + "</tr><tr>"
                 + "".join(f"<td>{counts.get(verdict, 0)}</td>" for verdict in VERDICTS) + "</tr></tbody></table>")

    caveat = POSTURE_NOTES.get(str(run.get("posture") or "documented"), "")
    if caveat:
        parts.append('<ac:structured-macro ac:name="warning" ac:schema-version="1"><ac:rich-text-body>'
                     f"<p>{escape(strip_markup(caveat))}</p></ac:rich-text-body></ac:structured-macro>")

    rows = "".join(f"<tr><th>{escape(key)}</th><td>{cell(value)}</td></tr>" for key, value in run["environment"].items())
    rows = (f"<tr><th>Run by</th><td>{escape(run['runner'])}</td></tr>"
            f"<tr><th>Documentation posture</th><td>{escape(run.get('posture') or 'documented')}</td></tr>" + rows)
    parts.append(f"<table><tbody>{rows}</tbody></table>")
    parts.extend(devices_table(results))
    parts.extend(review_block(results))

    # Fixed for every run — see "The results table" in contracts/evidence.md. Test Case ID leads,
    # Evidence is third from last, and the two comment columns close the row so a reviewer always
    # types in the same place regardless of which feature the page belongs to.
    header = ["Test Case ID", "Scenario", "Device", "Verdict", "Authority", "Expected", "Observed",
              "Fixture / scenario applied", "Evidence", "Developer Comments", "QA Comments"]
    table = ["<tr>" + "".join(f"<th>{name}</th>" for name in header) + "</tr>"]
    for result in results:
        case = cases.get(result["caseId"], {})
        identifier = escape(result["caseId"])
        if case.get("isPositionalId"):
            identifier += f" <em>(positional — row {case.get('positionInTable', '?')}, no id in source)</em>"
        verdict = escape(result.get("verdict", "?")).upper()
        colour = VERDICT_STYLE.get(verdict, ("", "#6E7781"))[1]
        evidence = evidence_cell(result)
        table.append(
            "<tr>"
            f"<td>{identifier}</td>"
            # A sheet carries a Scenario column or a Section column, rarely both — either one names
            # the row, and an empty cell here names nothing.
            f"<td>{cell(case.get('scenario') or case.get('section'))}</td>"
            f"<td>{device_cell(result)}</td>"
            f'<td><strong style="color:{colour}">{verdict}</strong></td>'
            f"<td>{cell(authority_of(result) or '—')}"
            + (f"<br/><em>{cell(result.get('authorityReason'))}</em>" if result.get("authorityReason") else "")
            + "</td>"
            f"<td>{cell(result.get('expected') or case.get('expected'))}</td>"
            f"<td>{cell(result.get('observed'))}</td>"
            f"<td>{cell(result.get('fixture') or 'none')}</td>"
            f"<td>{evidence}</td>"
            "<td></td>"
            "<td></td>"
            "</tr>"
        )
    parts.append("<h3>Results</h3>")
    parts.append('<table data-layout="full-width"><tbody>' + "".join(table) + "</tbody></table>")

    parts.append("<h3>Reproducing each case by hand</h3>")
    parts.append("<p>Each block below is the same sequence the harness ran, written in terms of what is "
                 "on screen rather than accessibility identifiers, so a case can be re-checked manually "
                 "without the automation.</p>")
    for result in results:
        case = cases.get(result["caseId"], {})
        steps = result.get("testForgeSteps") or []
        if not steps:
            continue
        listed = "".join(f"<li>{cell(step)}</li>" for step in steps)
        watch = f"<p><strong>Look for:</strong> {cell(result.get('expected') or case.get('expected'))}</p>"
        parts.append(
            '<ac:structured-macro ac:name="expand" ac:schema-version="1"><ac:parameter ac:name="title">'
            f'{escape(result["caseId"])} — {escape(case.get("scenario") or case.get("section"))}'
            "</ac:parameter><ac:rich-text-body>"
            f"<ol>{listed}</ol>{watch}</ac:rich-text-body></ac:structured-macro>"
        )

    healed = [result for result in results if result.get("healAttempts")]
    if healed:
        parts.append("<h3>Heal attempts</h3>")
        parts.append("<p>Where a case was retried, what was changed between attempts, and whether the change "
                     "was kept. A change that did not move the verdict is rolled back.</p>")
        rows = ["<tr><th>Test Case ID</th><th>Class</th><th>Target</th><th>Change</th>"
                "<th>Verdict</th><th>Kept</th></tr>"]
        for result in healed:
            for attempt in result["healAttempts"]:
                kept = "no — rolled back" if attempt.get("rolledBack") else "yes"
                rows.append(
                    "<tr>"
                    f"<td>{escape(result['caseId'])}</td>"
                    f"<td>{cell(attempt.get('class'))}</td>"
                    f"<td>{cell(attempt.get('target'))}</td>"
                    f"<td>{cell(attempt.get('change'))}</td>"
                    f"<td>{escape(attempt.get('verdictBefore'))} &rarr; {escape(attempt.get('verdictAfter'))}</td>"
                    f"<td>{escape(kept)}</td>"
                    "</tr>")
        parts.append("<table><tbody>" + "".join(rows) + "</tbody></table>")

    parts.extend(fix_block(results))
    parts.extend(network_trail_block(results))
    parts.extend(tracker_trail_block(results))

    recommendations = [result for result in results if result.get("recommendation")]
    if recommendations:
        parts.append("<h3>Recommendations for the test case document</h3>")
        parts.append("<p>Raised by this run, not applied. The test case document is written before "
                     "development and is owned outside this process — each item below is for a human to accept or reject.</p>")
        rows = ["<tr><th>Test Case ID</th><th>Why</th><th>Suggested wording</th></tr>"]
        for result in recommendations:
            recommendation = result["recommendation"]
            rows.append(
                "<tr>"
                f"<td>{escape(result['caseId'])}</td>"
                f"<td>{cell(recommendation.get('reason'))}</td>"
                f"<td>{cell(recommendation.get('suggestion'))}</td>"
                "</tr>"
            )
        parts.append("<table><tbody>" + "".join(rows) + "</tbody></table>")

    verdict_rows = "".join(
        f'<tr><td><strong style="color:{VERDICT_STYLE[verdict][1]}">{verdict}</strong></td>'
        f"<td>{VERDICT_NOTES[verdict]}</td></tr>" for verdict in VERDICTS)
    parts.append("<h3>What the verdicts mean</h3>")
    parts.append(f"<table><tbody>{verdict_rows}</tbody></table>")
    if any(authority_of(result) for result in results):
        authority_rows = "".join(f"<tr><td><code>{escape(key)}</code></td><td>{escape(note)}</td></tr>"
                                 for key, note in AUTHORITY_NOTES.items())
        parts.append("<h3>What the authority column means</h3>")
        parts.append(f"<table><tbody>{authority_rows}</tbody></table>")
    return "".join(parts)


def index_body(feature: str, pages: dict[str, dict[str, Any]], all_pages: list[tuple[str, str, int]],
               results: list[dict[str, Any]], run: dict[str, Any]) -> str:
    counts = summary_counts(results)
    parts = [f"<h2>{escape(feature)} — dev testing run, {escape(run['label'])}</h2>",
             f"<p>Run by <strong>{escape(run['runner'])}</strong>. One child page per test case document; this page is "
             "the overview. The test case documents are untouched by this run.</p>",
             "<table><tbody><tr>" + "".join(f"<th>{verdict}</th>" for verdict in VERDICTS) + "</tr><tr>"
             + "".join(f"<td>{counts.get(verdict, 0)}</td>" for verdict in VERDICTS) + "</tr></tbody></table>"]
    rows = ["<tr><th>Source page</th><th>Cases</th><th>Run</th>"
            + "".join(f"<th>{verdict}</th>" for verdict in VERDICTS) + "</tr>"]
    for page_id, title, total in all_pages:
        page = pages.get(page_id)
        page_counts = summary_counts(page["results"]) if page else {}
        run_count = len(page["results"]) if page else 0
        rows.append(f"<tr><td>{escape(title)}</td><td>{total}</td><td>{run_count}</td>"
                    + "".join(f"<td>{page_counts.get(verdict, 0)}</td>" for verdict in VERDICTS) + "</tr>")
    parts.append("<table><tbody>" + "".join(rows) + "</tbody></table>")
    explained = [result for result in results if rca_of(result) or patch_of(result)]
    if explained:
        patched = sum(1 for result in explained if patch_of(result).get("diff"))
        parts.append('<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body>'
                     f"<p>{len(explained)} finding(s) carry a named root cause, {patched} of them with "
                     "a proposed diff. Both live on the page of the case they belong to, under "
                     "<em>Root cause and proposed fixes</em>. Nothing has been applied.</p>"
                     "</ac:rich-text-body></ac:structured-macro>")
    environment_rows = (f"<tr><th>Run by</th><td>{escape(run['runner'])}</td></tr>"
                        f"<tr><th>Documentation posture</th>"
                        f"<td>{escape(run.get('posture') or 'documented')}</td></tr>") + "".join(
        f"<tr><th>{escape(key)}</th><td>{cell(value)}</td></tr>" for key, value in run["environment"].items())
    parts.append(f"<table><tbody>{environment_rows}</tbody></table>")
    return "".join(parts)


# --- Entry point ----------------------------------------------------------------------------


def write_attachments(path: Path, staged: list[tuple[str, Path]], scope: str) -> None:
    lines = [f"Drag every file in {scope} onto the DEV_TESTING_EVIDENCE page as an attachment.",
             "Names already match the Evidence column, so no renaming is needed.", ""]
    lines += [f"{target.name}    (copied from {tilde(source)})" for source, target in staged]
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cases", type=Path)
    parser.add_argument("results", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--layout", choices=("auto", "single", "multi"), default="auto")
    parser.add_argument("--feature", default="Feature")
    parser.add_argument("--runner", help="Who ran this pass. Defaults to `git config user.name`.")
    parser.add_argument("--run-label", default=datetime.now().strftime("%Y-%m-%d %H:%M"))
    parser.add_argument("--environment", type=Path, help="JSON object of build/simulator facts for the run header")
    parser.add_argument("--main-page", help="pageId of the parent test case page, listed first in the overview")
    parser.add_argument("--posture", choices=("documented", "partial", "undocumented"),
                        help="Documentation posture of the scope, per scan_scope.py. Overrides results.json's "
                             "`run.posture`. On anything but `documented` the report says so, because a "
                             "discrepancy there is a disagreement rather than a proven fault.")
    parser.add_argument("--media-dir", type=Path,
                        help="Where to stage the Confluence-named media copies. Defaults to <out-dir>/media — "
                             "point it outside the repo when --out-dir is a committed folder, since a run's "
                             "screenshots are tens of megabytes and belong under the media root, not in git.")
    parser.add_argument("--allow-missing-video", action="store_true",
                        help="Report anyway when an interacting case has no recording. The gap is still "
                             "printed and still marked in the report — this only stops it failing the run.")
    args = parser.parse_args()

    case_list = load(args.cases)
    cases = index_cases(case_list)
    results, run = read_results(args.results)
    run.update({
        "label": args.run_label,
        "runner": resolve_runner(args.runner),
        "environment": load(args.environment) if args.environment else {},
    })
    if args.posture:
        run["posture"] = args.posture
    run.setdefault("posture", "documented")

    page_totals: dict[str, tuple[str, int]] = {}
    for case in case_list:
        page_id = case.get("pageId") or "unknown"
        title, total = page_totals.get(page_id, (case.get("pageTitle") or "Unattributed cases", 0))
        page_totals[page_id] = (title, total + 1)
    ordered_pages = [(page_id, title, total) for page_id, (title, total) in page_totals.items()]
    if args.main_page:
        ordered_pages.sort(key=lambda row: (row[0] != args.main_page, row[1]))

    layout = args.layout
    if layout == "auto":
        layout = "multi" if len(page_totals) > 1 else "single"

    args.out_dir.mkdir(parents=True, exist_ok=True)
    media_root = args.media_dir or (args.out_dir / "media")
    pages = group_by_page(cases, results)
    counts = summary_counts(results)

    if layout == "single":
        page = next(iter(pages.values()), {"title": args.feature, "pageId": "?", "results": results, "total": len(cases)})
        (args.out_dir / f"{slugify(args.feature)}-test-forge-run.md").write_text(
            page_document(page, cases, run, parent_link=None))
        (args.out_dir / "evidence.html").write_text(
            page_body(page["title"], page["results"], cases, run))
        staged = stage_media(results, media_root)
        write_attachments(media_root / "attachments.txt", staged, tilde(media_root))
    else:
        pages_dir = args.out_dir / "pages"
        html_dir = args.out_dir / "html"
        pages_dir.mkdir(parents=True, exist_ok=True)
        html_dir.mkdir(parents=True, exist_ok=True)
        page_links = {page_id: f"pages/{page['slug']}.md" for page_id, page in pages.items()}
        staged: list[tuple[str, Path]] = []
        for page_id, page in pages.items():
            (pages_dir / f"{page['slug']}.md").write_text(
                page_document(page, cases, run, parent_link="../README.md"))
            (html_dir / f"{page['slug']}.html").write_text(
                page_body(page["title"], page["results"], cases, run))
            page_staged = stage_media(page["results"], media_root / page["slug"])
            write_attachments(media_root / page["slug"] / "attachments.txt",
                              page_staged, tilde(media_root / page["slug"]))
            staged += page_staged
        (args.out_dir / "README.md").write_text(
            overview_document(args.feature, pages, cases, results, run, page_links, ordered_pages))
        (html_dir / "index.html").write_text(
            index_body(args.feature, pages, ordered_pages, results, run))

    missing_media = [source for source, target in staged if not target.exists()]
    print(f"  layout: {layout}  ·  runner: {run['runner']}  ·  posture: {run['posture']}")
    print(f"  {len(results)} results: " + ", ".join(f"{verdict} {counts.get(verdict, 0)}" for verdict in VERDICTS))
    print(f"  {len(staged) - len(missing_media)} media file(s) staged under attachment names in {tilde(media_root)}")
    if layout == "multi":
        for page in pages.values():
            print(f"    - {page['title']}: {len(page['results'])}/{page['total']} → pages/{page['slug']}.md")
    for source in missing_media:
        print(f"  ! missing capture, nothing staged: {tilde(source)}")
    attempts = sum(len(result.get("healAttempts") or []) for result in results)
    if attempts:
        rolled = sum(1 for result in results for attempt in result.get("healAttempts") or []
                     if attempt.get("rolledBack"))
        print(f"  {attempts} heal attempt(s) recorded, {rolled} rolled back")
    authorities = [authority_of(result) for result in results if authority_of(result)]
    if authorities:
        print("  authority: " + ", ".join(f"{value} {authorities.count(value)}"
                                          for value in sorted(set(authorities))))
    explained = [result for result in results if rca_of(result)]
    if explained:
        patched = sum(1 for result in results if patch_of(result).get("diff"))
        print(f"  {len(explained)} case(s) with a root cause, {patched} with a proposed diff "
              "(nothing applied)")
    for case_id in unexplained(results):
        print(f"  ! {case_id}: authority `app-wrong` with no `rca` — the strongest verdict this run "
              "can reach, with no file or mechanism behind it")
    for case_id in unsupportable(results):
        print(f"  ! {case_id}: authority `app-wrong` with no `techDoc` or `developer` in "
              "expectationSources — not a supportable verdict, see contracts/healing.md")
    if run["posture"] != "documented" and any(authority_of(result) == "app-wrong" for result in results):
        print(f"  ! posture is `{run['posture']}` and an `app-wrong` authority is recorded — on scope with no "
              "tech document that verdict needs an explicit human ruling per case")
    unknown = [result["caseId"] for result in results if result["caseId"] not in cases]
    if unknown:
        print(f"  ! results reference unknown case ids: {', '.join(unknown)}")

    for case_id in undeclared(results):
        print(f"  ! {case_id}: no `commands` and no `interaction` flag — treated as interacting, so "
              "it owes a recording. Record the command trail, or set `interaction: false`.")

    read_only = [result["caseId"] for result in results
                 if result.get("verdict", "").upper() in RECORDED_VERDICTS and interacts(result) is False]
    if read_only:
        print(f"  {len(read_only)} read-only case(s) exempt from recording: {', '.join(read_only)}")

    # No override flag on purpose. An interacting case with no clip is a hole in the evidence, and
    # `--allow-missing-video` records that hole on the page. A patch on a case nobody adjudicated
    # `app-wrong` is a code change waiting for a pass that trusts this file, so it does not ship at
    # all.
    faults = patch_faults(results)
    if faults:
        refused = len({case_id for case_id, _ in faults})
        print(f"  ! {refused} patch(es) refused on {len(faults)} ground(s):")
        for case_id, reason in faults:
            print(f"    - {case_id}: {reason}")
        print("    See contracts/healing.md — a patch travels only on an `app-wrong` case, with an "
              "`rca`, a diff, and a whitelisted class. Anything else belongs in `recommendation`.")
        return 1

    missing_video = unrecorded(results)
    if missing_video and not args.allow_missing_video:
        print(f"  ! {len(missing_video)} interacting case(s) with no recording: "
              f"{', '.join(missing_video)}")
        print("    A case that taps, swipes, scrolls, types or navigates is bracketed by "
              "test_forge_start_recording/test_forge_stop_recording. Re-run those cases, or pass "
              "--allow-missing-video to accept the gap on the record.")
        return 1
    if missing_video:
        print(f"  ! {len(missing_video)} case(s) accepted with no recording: {', '.join(missing_video)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
