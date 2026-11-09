// Drives the persistent TestForgeDriverSession XCUITest harness on a booted simulator/device.
//
// The harness polls this queue; nothing here reaches it directly — same indirection
// networklens-mcp/control.ts uses, for the same reason: this server is spawned and killed by its
// MCP client, the harness is started separately (once, via xcodebuild/Xcode) and lives for the
// length of a QA session, and a queue survives either being down without the other losing state.
//
// Unlike NetworkLens, there is no file-based fallback here — a UI action has nothing to "write for
// next launch" the way a mock rule does. If the harness isn't polling, the command simply cannot
// run; every tool in index.ts surfaces that as a clear "harness unreachable" result rather than
// silently succeeding against nothing.

import { queue } from "./queue.js";

/**
 * An explicit sidecar, for pointing at a queue already hosted by another Claude Code window,
 * mirroring NETWORKLENS_SIDECAR — the same benefit applies: only one process needs to own the
 * port even with several sessions open.
 */
const EXPLICIT_SIDECAR = process.env.TEST_FORGE_DRIVER_SIDECAR?.replace(/\/$/, "") || null;

let hosting: Promise<boolean> | null = null;

/** Bound once, lazily: a server that never issues a command should not open a port. */
async function ready(): Promise<string> {
  if (EXPLICIT_SIDECAR) return EXPLICIT_SIDECAR;
  hosting ??= queue.listen();
  await hosting;
  return queue.endpoint;
}

/** The harness collects on a sub-second timer (far tighter than NetworkLens's mock-edit
 *  cadence — a UI action feels laggy at 2s where a mock swap does not), but the MCP-side poll
 *  interval here stays the same 250ms/6s shape as networklens-mcp/control.ts: there is no reason
 *  to invent a different cadence for watching the same kind of queue. */
// Comfortably above the harness's own longest wait (a command's `timeout`, 10s by default, and a
// scroll loop well past that) — a lower cap here reports "no harness collected it" for a command
// that is simply still running, which reads as an infrastructure fault rather than a slow lookup.
const ANSWER_TIMEOUT_MS = 90_000;
const POLL_MS = 250;

/** One HTTP call that treats a dead sidecar as an answer rather than a throw. */
async function call(path: string, init?: RequestInit): Promise<any | null> {
  const base = await ready();
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * What the harness did, or why it did nothing.
 *
 * `reachable` separates two failures a tool has to word differently: no harness polling at all
 * (nothing built/launched yet) versus a harness that answered with an error (a real assertion or
 * execution failure worth reporting as such, not as an infrastructure problem).
 */
export interface DriverResult {
  ok: boolean;
  reachable: boolean;
  outcome?: any;
  error?: string;
}

export async function isQueueUp(): Promise<boolean> {
  return (await call("/health")) !== null;
}

/**
 * Seconds since the harness last collected, or null if it never has.
 *
 * The queue answers `/health` whether or not a harness exists — this process usually hosts it —
 * so reachability says nothing about the harness. Its polling is the only real signal.
 */
export async function harnessHeartbeat(): Promise<number | null> {
  const health = await call("/health");
  const seconds = health?.lastPolledSecondsAgo;
  return typeof seconds === "number" ? seconds : null;
}

/** Where commands are going, for anything that has to explain itself to a human. */
export async function controlEndpoint(): Promise<string> {
  const base = await ready();
  return queue.isHosting ? `${base} (hosted here)` : base;
}

/**
 * Queues one command and waits for the harness to report back on it.
 *
 * Hosting the queue in this process is the common case, and going through loopback to reach an
 * object in the same heap would only add a way to fail.
 */
export async function sendCommand(body: Record<string, unknown>): Promise<DriverResult> {
  const base = await ready();
  const local = queue.isHosting && !EXPLICIT_SIDECAR;

  let id: number;
  if (local) {
    id = queue.enqueue(body);
  } else {
    const queued = await call("/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!queued?.ok || typeof queued.id !== "number") {
      return { ok: false, reachable: false, error: `no queue on ${base}` };
    }
    id = queued.id;
  }

  const deadline = Date.now() + ANSWER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((wait) => setTimeout(wait, POLL_MS));
    const result = local ? queue.result(id) : (await call(`/result?id=${id}`))?.result;
    if (result) {
      if (result.error) return { ok: false, reachable: true, error: String(result.error) };
      return { ok: true, reachable: true, outcome: result.value };
    }
  }
  return {
    ok: false,
    reachable: false,
    error: "queued, but no harness collected it — is TestForgeDriverSession running (testLiveSession, built once via xcodebuild)?",
  };
}
