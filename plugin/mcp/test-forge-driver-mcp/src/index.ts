#!/usr/bin/env node
// MCP server exposing live UI-driving commands to a persistent XCUITest harness (TestForgeDriverKit's
// TestForgeDriverRunner, subclassed by the host project's own test target). This is the "screen" half of
// test-flow-recorder's live execution model — the "data" half is NetworkLens's own MCP server,
// unchanged and used alongside this one, not replaced by it.
//
// Every tool here is a thin wrapper around sendCommand(): enqueue a { kind, ...params } command,
// wait for the harness to poll, execute, and report back. There is no file-based fallback (see
// control.ts) — a harness that isn't running means the command simply cannot happen, and every
// tool says so plainly rather than pretending to succeed.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { controlEndpoint, harnessHeartbeat, isQueueUp, sendCommand } from "./control.js";

const run = promisify(execFile);

/** The app under test. Deliberately has no default: a bundle id that happens to be right for one
 *  app makes this server look healthy while pointing at the wrong process. NETWORKLENS_BUNDLE_ID is
 *  accepted as well so one setting can serve both servers. */
const BUNDLE_ID = process.env.TEST_FORGE_BUNDLE_ID || process.env.NETWORKLENS_BUNDLE_ID || "";

/** The same root ArtifactRecorder writes screenshots into, so one case's stills and its video land
 *  in the same folder. TestForgeDriverConfiguration reads the same variable and falls back to the same
 *  name — change one and the two halves of a case's evidence split across two directories. */
const MEDIA_ROOT = process.env.TEST_FORGE_MEDIA_ROOT || process.env.TEST_FORGE_DRIVER_MEDIA_ROOT
  || join(homedir(), "Documents", "TestForge-Test");

/** Recordings in flight, keyed by case folder. `simctl recordVideo` finalizes the movie container
 *  only when it is signalled, so the child process has to be held rather than fired and forgotten. */
const recordings = new Map<string, { child: ChildProcess; path: string }>();

/** Resolved once. `recordVideo` stops only on a signal, and a signal sent to the `xcrun` wrapper
 *  never reaches the recorder behind it — the recording then runs until the whole process tree
 *  dies, leaving a file that is minutes long and hundreds of MB. Holding simctl itself is what
 *  makes stopping work. */
let simctlPath: string | null = null;

/** The simulator every host-side command targets.
 *
 *  `booted` is only unambiguous while exactly one simulator is booted. With two, simctl picks one
 *  and reports nothing — a recording of the wrong device shows the same app on the same screen as
 *  the right one, so the failure survives every check a reviewer would think to make. Observed on
 *  2026-09-06: 10 clips recorded off an idle second simulator while the harness drove the first.
 *
 *  `TEST_FORGE_DEVICE_UDID` pins it. Otherwise the single booted device is used, and more than one is an
 *  error rather than a guess. */
const DEVICE_UDID = process.env.TEST_FORGE_DEVICE_UDID || "";

let resolvedDevice: string | null = null;

async function bootedDevices(): Promise<string[]> {
  const { stdout } = await run("xcrun", ["simctl", "list", "devices", "booted", "-j"], { timeout: 30_000 });
  const parsed = JSON.parse(stdout) as { devices: Record<string, Array<{ udid: string; name: string }>> };
  return Object.values(parsed.devices).flat().map((device) => device.udid);
}

async function targetDevice(): Promise<string> {
  if (DEVICE_UDID) return DEVICE_UDID;
  if (resolvedDevice) return resolvedDevice;
  const booted = await bootedDevices();
  if (booted.length === 0) {
    throw new Error("no booted simulator. Boot the one the harness runs on, or set TEST_FORGE_DEVICE_UDID.");
  }
  if (booted.length > 1) {
    throw new Error(
      `${booted.length} simulators are booted (${booted.join(", ")}), so a host-side command cannot ` +
      "tell which one the harness is driving. Shut the others down, or set TEST_FORGE_DEVICE_UDID to the " +
      "device the harness was launched against."
    );
  }
  resolvedDevice = booted[0];
  return resolvedDevice;
}

async function resolveSimctl(): Promise<string> {
  if (simctlPath) return simctlPath;
  const { stdout } = await run("xcrun", ["--find", "simctl"], { timeout: 20_000 });
  simctlPath = stdout.trim();
  return simctlPath;
}

/** Case ids name directories here, so collapse anything that could escape one. */
function caseFolder(caseId: string): string {
  const cleaned = caseId.replace(/[^A-Za-z0-9\-_]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unnamed-case";
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** Every identifier lookup is type-agnostic by default (XCUIElement `.any` descendant match) —
 *  deliberately, after this session's own experience guessing wrong between `.otherElements`,
 *  `.staticTexts` and `.buttons` for the same accessibility identifier on different view kinds.
 *  Narrowing to a specific type is opt-in, for the cases that actually need disambiguation
 *  (e.g. counting buttons inside a container). */
const ElementType = z
  .enum([
    "any",
    "button",
    "staticText",
    "textField",
    "textView",
    "image",
    "cell",
    "other",
    "scrollView",
    "collectionView",
    "table",
    "tabBar",
    "navigationBar",
    "switch",
  ])
  .optional()
  .describe("XCUIElement type to match. Defaults to 'any' — a type-agnostic identifier lookup.");

/** Which of several same-identifier matches to act on. Omitted means the first. */
const ElementIndex = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("0-based index among matches, for a repeated identifier (e.g. the third tab). Defaults to the first match.");

const server = new McpServer({ name: "test-forge-driver", version: "0.1.0" });

/** Reports whether the running command against a harness reached one, and how it answered. */
function report(label: string, result: Awaited<ReturnType<typeof sendCommand>>) {
  if (!result.reachable) {
    return text(`${label}: no harness reachable.\n${result.error}`);
  }
  if (!result.ok) {
    return text(`${label}: harness reported an error.\n${result.error}`);
  }
  return text(`${label}: ${JSON.stringify(result.outcome)}`);
}

/** Reports a `simctl` failure as text rather than throwing — a missing simulator is an answer. */
async function simctl(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await run("xcrun", ["simctl", ...args], { timeout: 20_000 });
    return { ok: true, output: (stdout || stderr || "").trim() };
  } catch (error: any) {
    return { ok: false, output: String(error?.stderr || error?.message || error).trim() };
  }
}

server.tool(
  "test_forge_status",
  "Whether the persistent TestForgeDriverSession harness is reachable, which simulator is booted, and where commands are going. Start here when nothing else answers.",
  {},
  async () => {
    const endpoint = await controlEndpoint();
    const queueUp = await isQueueUp();
    const heartbeat = await harnessHeartbeat();
    // A heartbeat older than a few poll intervals means the harness stopped collecting, which
    // looks identical to "never started" from any other command's point of view.
    const isAttached = heartbeat !== null && heartbeat < 5;
    const devices = await simctl(["list", "devices", "booted"]);
    return text(
      [
        `control endpoint: ${endpoint}`,
        `queue listening: ${queueUp}`,
        `harness attached: ${isAttached}${heartbeat === null ? " (never polled)" : ` (last polled ${heartbeat.toFixed(1)}s ago)`}`,
        isAttached
          ? ""
          : "No harness is collecting — start it with: xcodebuild test-without-building -workspace <your>.xcworkspace -scheme TestForgeDriver -configuration Debug -destination \"platform=iOS Simulator,id=$SIM\"",
        `bundle id: ${BUNDLE_ID || "(unset — set TEST_FORGE_BUNDLE_ID)"}`,
        `media root: ${MEDIA_ROOT}`,
        recordings.size ? `recording now: ${[...recordings.keys()].join(", ")}` : "",
        `target device: ${await targetDevice().catch((error) => `UNRESOLVED — ${String(error.message || error)}`)}`,
        `booted devices:\n${devices.output || "(none)"}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
);

server.tool(
  "test_forge_open_deeplink",
  "Opens a URL on the booted simulator via simctl, routing straight to a screen instead of tapping through Home. Runs host-side, so it works even with no harness running. Prefer the app's https universal-link form over a custom scheme: a registered custom scheme can be accepted by the system and still not route, which looks identical to a broken deeplink.",
  {
    url: z.string().describe("The deeplink to open, e.g. https://<host>/<path>?<query>"),
  },
  async (args) => {
    const opened = await simctl(["openurl", await targetDevice(), args.url]);
    if (!opened.ok) {
      return text(`test_forge_open_deeplink failed: ${opened.output}`);
    }
    return text(`test_forge_open_deeplink: opened ${args.url}. Confirm the screen with test_forge_wait_for_exists — simctl reports the handoff, not the destination.`);
  }
);

server.tool(
  "test_forge_tap",
  "Taps the element with this accessibility identifier, waiting for it to exist, lay out a valid frame, and "
  + "become hittable. Refuses rather than taps when it never becomes hittable — something covering it (a "
  + "keyboard, sheet or overlay) is the usual cause, and a tap that lands on the covering view would otherwise "
  + "report success. Returns hittable, so a pass is evidence rather than a constant.",
  {
    identifier: z.string(),
    elementType: ElementType,
    index: ElementIndex,
    force: z
      .boolean()
      .optional()
      .describe(
        "Tap the element's coordinate even when the hit test says it is covered. Only for when you have "
        + "confirmed from a screenshot that the element is reachable and the hit test is wrong; the result "
        + "reports forced: true so the evidence records it."
      ),
  },
  async (args) => report("test_forge_tap", await sendCommand({ kind: "tap", ...args }))
);

server.tool(
  "test_forge_tap_by_label",
  "Taps an element by the text a person actually sees, for components that expose no accessibility identifier. "
  + "Combine with index to reach the Nth match. Returns matches — how many elements carried this label — and "
  + "ambiguous: true when several did and no index was given, in which case the tap went to the first and may "
  + "not be the one you meant. Prefer test_forge_tap on an identifier wherever one exists.",
  {
    label: z.string(),
    labelMatch: z
      .enum(["exact", "contains", "beginsWith"])
      .optional()
      .describe("How to match the label. Defaults to exact."),
    elementType: ElementType,
    index: ElementIndex,
    force: z
      .boolean()
      .optional()
      .describe(
        "Tap the element's coordinate even when the hit test says it is covered. Only for when you have "
        + "confirmed from a screenshot that the element is reachable and the hit test is wrong; the result "
        + "reports forced: true so the evidence records it."
      ),
  },
  async (args) => report("test_forge_tap_by_label", await sendCommand({ kind: "tapByLabel", ...args }))
);

server.tool(
  "test_forge_type",
  "Taps the element into focus, types text into it, then DISMISSES THE KEYBOARD. Returns valueAfter, the "
  + "field's value once typing finished: keystrokes sent to a field that never took focus go to whatever "
  + "holds first responder, and nothing else about the command looks wrong when that happens. The keyboard "
  + "comes down because one left up covers the lower half of the screen for every case that follows — their "
  + "screenshots then fail to show what their verdict is about, and anything beneath it is unhittable. Pass "
  + "keepKeyboard only when the case is about the keyboard itself.",
  {
    identifier: z.string(),
    text: z.string(),
    elementType: ElementType,
    keepKeyboard: z
      .boolean()
      .optional()
      .describe("Leave the keyboard up after typing. Only for a case whose assertion is about the keyboard."),
  },
  async (args) => report("test_forge_type", await sendCommand({ kind: "type", ...args }))
);

server.tool(
  "test_forge_scroll_until_exists",
  "Scrolls a scroll view with a deep swipe-up until the target identifier appears. Does NOT tap it — follow "
  + "with test_forge_tap. Returns found alongside hittable, because scrolling something into the accessibility tree is "
  + "not the same as scrolling it into reach: it can satisfy found while sitting under a keyboard or a floating "
  + "bar, and a tap then lands on that instead.",
  {
    identifier: z.string(),
    scrollViewIdentifier: z.string().optional().describe("Defaults to the screen's first scroll view when omitted."),
    elementType: ElementType,
    maxAttempts: z.number().int().min(1).max(30).optional(),
  },
  async (args) => report("test_forge_scroll_until_exists", await sendCommand({ kind: "scrollUntilExists", ...args }))
);

server.tool(
  "test_forge_swipe",
  "One directional swipe on a scroll view, with no specific target element in mind — e.g. the scroll-down-then-up sequence a Back to top control reacts to, or left/right through a carousel.",
  {
    direction: z.enum(["up", "down", "left", "right"]),
    scrollViewIdentifier: z.string().optional().describe("Defaults to the screen's first scroll view when omitted."),
  },
  async (args) => report("test_forge_swipe", await sendCommand({ kind: "swipe", ...args }))
);

server.tool(
  "test_forge_scroll_to_top",
  "Swipes back down until an optional top marker appears, or the attempts run out — for a 'returned to the top of the page' expectation with no single control to tap.",
  {
    identifier: z.string().optional().describe("A marker expected at the top. Omitted means swipe a fixed number of times and report."),
    scrollViewIdentifier: z.string().optional().describe("Defaults to the screen's first scroll view when omitted."),
    elementType: ElementType,
    maxAttempts: z.number().int().min(1).max(30).optional(),
  },
  async (args) => report("test_forge_scroll_to_top", await sendCommand({ kind: "scrollToTop", ...args }))
);

server.tool(
  "test_forge_wait_for_exists",
  "Polls until the identifier exists, or the timeout elapses.",
  {
    identifier: z.string(),
    elementType: ElementType,
    timeout: z.number().positive().optional().describe("Seconds. Defaults to 10."),
  },
  async (args) => report("test_forge_wait_for_exists", await sendCommand({ kind: "waitForExists", ...args }))
);

server.tool(
  "test_forge_wait_for_not_exists",
  "Polls until the identifier no longer exists, or the timeout elapses — e.g. confirming a dismissed modal.",
  {
    identifier: z.string(),
    elementType: ElementType,
    timeout: z.number().positive().optional().describe("Seconds. Defaults to 10."),
  },
  async (args) => report("test_forge_wait_for_not_exists", await sendCommand({ kind: "waitForNotExists", ...args }))
);

server.tool(
  "test_forge_get_label",
  "Reads the current label/text of one element — for asserting on displayed copy (e.g. a schedule tab's \"Today\"/\"Tomorrow\" text).",
  {
    identifier: z.string(),
    elementType: ElementType,
  },
  async (args) => report("test_forge_get_label", await sendCommand({ kind: "getLabel", ...args }))
);

server.tool(
  "test_forge_get_labels",
  "Reads labels in accessibility-tree order — one call for an ordering or label-formatting assertion across a whole row (e.g. Today / Tomorrow / 17 Aug). Scope it: pass containerIdentifier, or an elementType narrower than 'any'. An unscoped sweep of a screen as deep as Home is a query XCUITest abandons, and the harness refuses it rather than risk the session.",
  {
    containerIdentifier: z.string().optional().describe("Scope to this container's descendants. Omit only when elementType narrows the sweep."),
    elementType: ElementType,
  },
  async (args) => report("test_forge_get_labels", await sendCommand({ kind: "getLabels", ...args }))
);

server.tool(
  "test_forge_dump_tree",
  "The live accessibility tree. Use this the moment a lookup fails unexpectedly — it is the only way to see an element that exists but is unhittable, or carries a different identifier than the code suggests.",
  {
    identifier: z.string().optional().describe("Dump only this element's subtree. Omitted means the whole app."),
    elementType: ElementType,
  },
  async (args) => report("test_forge_dump_tree", await sendCommand({ kind: "dumpTree", ...args }))
);

server.tool(
  "test_forge_get_element_count",
  "Counts elements of one type inside a container identifier — e.g. how many tab buttons are currently rendered.",
  {
    containerIdentifier: z.string(),
    elementType: ElementType,
  },
  async (args) => report("test_forge_get_element_count", await sendCommand({ kind: "getElementCount", ...args }))
);

server.tool(
  "test_forge_get_frame",
  "Reads one element's current on-screen frame (x, y, width, height) — for position/order/alignment assertions.",
  {
    identifier: z.string(),
    elementType: ElementType,
  },
  async (args) => report("test_forge_get_frame", await sendCommand({ kind: "getFrame", ...args }))
);

server.tool(
  "test_forge_assert_spacing",
  "Edge-to-edge gap between two elements along one axis, against an expected value and tolerance from the "
  + "test case doc — for padding/spacing assertions a human eye cannot judge on an all-white background with "
  + "no visible separator between stacked sections, cells or views. Reads both elements' frames via the same "
  + "path as test_forge_get_frame and diffs the relevant edge: verticalGap = B.minY - A.maxY, horizontalGap = "
  + "B.minX - A.maxX. Pass A as the element that comes first (above, or to the left) — a negative actual "
  + "means the elements overlap rather than merely touch. Returns actual, frameA and frameB alongside pass, "
  + "so a failure is debuggable without a follow-up test_forge_get_frame call.",
  {
    identifierA: z.string().describe("The first element — above (vertical) or left (horizontal) of B."),
    elementTypeA: ElementType,
    identifierB: z.string().describe("The second element — below (vertical) or right (horizontal) of A."),
    elementTypeB: ElementType,
    axis: z.enum(["vertical", "horizontal"]).optional().describe("Defaults to vertical."),
    expected: z.number().describe("Expected gap in points, from the test case doc."),
    tolerance: z.number().min(0).optional().describe("Allowed deviation in points. Defaults to 0 (exact match)."),
  },
  async (args) => report("test_forge_assert_spacing", await sendCommand({ kind: "assertSpacing", ...args }))
);

server.tool(
  "test_forge_simctl",
  "Generic passthrough to `xcrun simctl <args>` on the target simulator — host-side, no harness needed. "
  + "Covers whatever simctl itself supports (privacy grant/revoke/reset, push, status_bar override, "
  + "location, spawn defaults read/write/delete for UserDefaults, erase, uninstall, and anything else "
  + "`xcrun simctl help` lists) rather than wrapping one subcommand at a time. Any literal '$DEVICE' token "
  + "in args is replaced with the resolved target device UDID first, so a test case's precondition step "
  + "can write e.g. [\"spawn\", \"$DEVICE\", \"defaults\", \"delete\", \"<bundle id>\", \"hasSeenOnboarding\"] "
  + "without resolving the UDID itself.",
  {
    args: z.array(z.string()).min(1).describe("simctl subcommand and arguments, e.g. [\"privacy\", \"grant\", \"$DEVICE\", \"photos\", \"<bundle id>\"]."),
  },
  async (args) => {
    const device = await targetDevice().catch(() => null);
    const resolvedArgs = args.args.map((arg) => (device && arg === "$DEVICE" ? device : arg));
    const result = await simctl(resolvedArgs);
    return text(`test_forge_simctl ${resolvedArgs.join(" ")}: ${result.ok ? "ok" : "failed"}\n${result.output}`);
  }
);

server.tool(
  "test_forge_alert_tap",
  "Taps a system alert's button by its exact title — e.g. dismissing a routing chooser.",
  {
    buttonTitle: z.string(),
  },
  async (args) => report("test_forge_alert_tap", await sendCommand({ kind: "alertTap", ...args }))
);

server.tool(
  "test_forge_screenshot",
  "Captures the current screen via ArtifactRecorder, writing a numbered PNG under the media root. Dismisses "
  + "the keyboard first unless keepKeyboard is set. Returns the device that produced the image (name, OS "
  + "version, UDID, screen size in points) — evidence from a multi-device sweep is unreadable without it — "
  + "and, when mustBeVisible is given, whether each of those identifiers is actually unobscured in the frame "
  + "that was captured. THE ACCESSIBILITY TREE SEES THROUGH A KEYBOARD AND THE CAMERA DOES NOT: a verdict "
  + "read off the tree can be correct while the screenshot handed to the reviewer does not show it. Pass "
  + "mustBeVisible with whatever the case is asserting about, and treat visible:false as an evidence "
  + "failure, not a cosmetic one. Pass caseId so each test case gets its own folder and step numbering.",
  {
    label: z.string().describe("Short label for the filename, e.g. 'schedule-tabs-visible'."),
    caseId: z
      .string()
      .optional()
      .describe("Test case id, e.g. 'EP-001'. Names the folder, matching test_forge_start_recording's."),
    mustBeVisible: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Identifier(s) the case is asserting about. Each is reported as visible, or obscured with "
        + "the fraction covered — so a screenshot that does not support its own row is caught here."),
    keepKeyboard: z
      .boolean()
      .optional()
      .describe("Capture with the keyboard up. Only for a case whose assertion is about the keyboard."),
  },
  async (args) => report("test_forge_screenshot", await sendCommand({ kind: "screenshot", ...args }))
);

server.tool(
  "test_forge_dismiss_keyboard",
  "Brings the software keyboard down through its own dismiss key, never by tapping a blank area — a blind "
  + "tap to shed focus is how a run navigates itself off the screen. Returns whether one was up and whether "
  + "it is gone. Call it before test_forge_start_recording: a recording cannot be re-shot after the fact, so a "
  + "keyboard left up ruins the clip for the whole case.",
  {},
  async () => report("test_forge_dismiss_keyboard", await sendCommand({ kind: "dismissKeyboard" }))
);

server.tool(
  "test_forge_device_info",
  "The simulator this session is driving: device name, OS version, UDID and screen size in points. Call it "
  + "once at the start of a run and record it against every case. With several simulators booted, nothing "
  + "else in a result says which one produced a given screenshot, and a case that passed on a 6.7-inch "
  + "screen has not been shown to pass on a 4.7-inch one.",
  {},
  async () => report("test_forge_device_info", await sendCommand({ kind: "deviceInfo" }))
);

server.tool(
  "test_forge_relaunch_app",
  "Terminates and relaunches the app under test, without restarting the harness — the way a file-based NetworkLens mock (armed via mcp__networklens__* but not yet live-activated) actually takes effect.",
  {},
  async () => report("test_forge_relaunch_app", await sendCommand({ kind: "relaunchApp" }))
);

server.tool(
  "test_forge_assert_exists",
  "Structural pass/fail: does the identifier's current existence match what was expected.",
  {
    identifier: z.string(),
    elementType: ElementType,
    expected: z.boolean().optional().describe("Defaults to true (asserting the element exists)."),
  },
  async (args) => report("test_forge_assert_exists", await sendCommand({ kind: "assertExists", ...args }))
);

server.tool(
  "test_forge_start_recording",
  "Starts a screen recording of the booted simulator for one test case, writing <case>.mov beside that case's screenshots. Runs host-side via simctl, so it needs no harness. Always finish with test_forge_stop_recording — simctl only finalizes a playable file when it is signalled to stop.",
  {
    caseId: z.string().describe("Test case id, e.g. 'EP-001' — also the folder and file name."),
  },
  async (args) => {
    const folder = caseFolder(args.caseId);
    const inFlight = recordings.get(folder);
    if (inFlight) {
      return text(`test_forge_start_recording: already recording ${folder} to ${inFlight.path}. Stop that first.`);
    }

    // A clip cannot be re-shot once the case has moved on, so the keyboard comes down before the
    // recording starts rather than being noted as a defect in the finished file. Best effort: a
    // harness that is not up is not a reason to refuse a host-side recording.
    try {
      await sendCommand({ kind: "dismissKeyboard" });
    } catch {
      // no harness, or nothing to dismiss — the recording is still worth starting
    }

    const directory = join(MEDIA_ROOT, folder);
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${folder}.mov`);
    // hevc over h264: same source, roughly a quarter of the bytes, and these get attached to a
    // Confluence page by hand.
    const child = spawn(
      await resolveSimctl(),
      ["io", await targetDevice(), "recordVideo", "--codec", "hevc", "--force", path],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    // An unbooted simulator or an unwritable destination fails within a moment. Reporting success
    // before that point would be a guess, and the guess is only ever found out at stop time.
    const failure = await new Promise<string | null>((resolve) => {
      const settle = setTimeout(() => resolve(null), 1_500);
      child.once("exit", (code) => {
        clearTimeout(settle);
        resolve(stderr.trim() || `simctl exited with code ${code}`);
      });
      child.once("error", (error) => {
        clearTimeout(settle);
        resolve(String(error));
      });
    });
    if (failure !== null) {
      return text(`test_forge_start_recording failed: ${failure}`);
    }

    recordings.set(folder, { child, path });
    return text(`test_forge_start_recording: recording ${folder} to ${path}`);
  }
);

server.tool(
  "test_forge_stop_recording",
  "Stops this test case's recording and reports the finished .mov with its size. A run that ends without this leaves a truncated, unplayable file.",
  {
    caseId: z.string().describe("The same case id test_forge_start_recording was given."),
  },
  async (args) => {
    const folder = caseFolder(args.caseId);
    const recording = recordings.get(folder);
    if (!recording) {
      const active = [...recordings.keys()];
      return text(`test_forge_stop_recording: nothing is recording for ${folder}. Active: ${active.length ? active.join(", ") : "(none)"}`);
    }

    recordings.delete(folder);
    recording.child.kill("SIGINT");
    await new Promise<void>((resolve) => {
      const giveUp = setTimeout(resolve, 15_000);
      recording.child.once("exit", () => {
        clearTimeout(giveUp);
        resolve();
      });
    });

    try {
      const info = await stat(recording.path);
      return text(`test_forge_stop_recording: ${recording.path} (${(info.size / 1_048_576).toFixed(1)} MB)`);
    } catch {
      return text(`test_forge_stop_recording: stopped, but nothing was written to ${recording.path}.`);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
