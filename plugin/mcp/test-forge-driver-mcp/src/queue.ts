// The command queue the persistent TestForgeDriverSession XCUITest harness polls, hosted by this server.
//
// A near-identical sibling of networklens-mcp's own queue.ts (same design, same reasons — see
// that file's header). Kept as a separate instance rather than sharing NetworkLens's queue: that
// queue drains destructively on every GET /commands, so two independent pollers (the app's
// LensControlChannel and this harness) would steal each other's commands if they shared one.
//
// Deliberately NOT port 8788 — that is NetworkLens's own queue.

import { createServer, Server } from "node:http";

const PORT = Number(process.env.TEST_FORGE_DRIVER_CONTROL_PORT || 8789);

/** Bounded so a harness that never collects cannot grow this without limit. */
const MAX_COMMANDS = 100;
const MAX_RESULTS = 100;
const MAX_BODY_BYTES = 4 * 1_048_576;

export interface QueuedCommand {
  id: number;
  [key: string]: unknown;
}

export interface CommandResult {
  id: number;
  value?: unknown;
  error?: string;
  at: string;
}

class CommandQueue {
  private commands: QueuedCommand[] = [];
  private results = new Map<number, CommandResult>();
  private nextID = 1;
  private server: Server | null = null;
  /** When the harness last drained. It polls on a timer, so this doubles as its heartbeat —
   *  the only way to tell "a queue is listening" from "a harness is attached to it". */
  private lastDrainAt: number | null = null;

  /** True once this process owns the port, so callers skip the HTTP round trip to themselves. */
  get isHosting(): boolean {
    return this.server !== null;
  }

  get endpoint(): string {
    return `http://127.0.0.1:${PORT}`;
  }

  enqueue(body: Record<string, unknown>): number {
    if (this.commands.length >= MAX_COMMANDS) this.commands.shift();
    const id = this.nextID++;
    this.commands.push({ ...body, id });
    return id;
  }

  /** Draining is destructive on purpose: a command applied twice taps something twice. */
  drain(): QueuedCommand[] {
    this.lastDrainAt = Date.now();
    return this.commands.splice(0, this.commands.length);
  }

  /** Seconds since the harness last polled, or null if it never has. */
  get secondsSinceDrain(): number | null {
    if (this.lastDrainAt === null) return null;
    return (Date.now() - this.lastDrainAt) / 1_000;
  }

  recordResult(body: { id: number; value?: unknown; error?: string }): void {
    this.results.set(body.id, { ...body, at: new Date().toISOString() });
    if (this.results.size > MAX_RESULTS) {
      const oldest = this.results.keys().next().value;
      if (oldest !== undefined) this.results.delete(oldest);
    }
  }

  result(id: number): CommandResult | null {
    return this.results.get(id) ?? null;
  }

  /**
   * Binds the port, or reports why it could not.
   *
   * A port already taken is the ordinary case, not a failure: another editor
   * window is running its own copy of this server, and its queue serves the
   * harness just as well. The caller falls back to speaking to it over HTTP.
   */
  async listen(): Promise<boolean> {
    if (this.server) return true;
    const server = createServer((request, response) => this.handle(request, response));
    return new Promise((settle) => {
      server.once("error", () => {
        server.close();
        settle(false);
      });
      server.listen(PORT, "127.0.0.1", () => {
        this.server = server;
        // Never hold the process open: stdio closing is what ends this server,
        // and a listening socket would otherwise keep it alive as an orphan.
        server.unref();
        settle(true);
      });
    });
  }

  close(): void {
    this.server?.close();
    this.server = null;
  }

  private handle(request: any, response: any): void {
    const url = new URL(request.url, "http://localhost");
    const reply = (code: number, value: unknown) => {
      response.writeHead(code, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST, GET, OPTIONS",
      });
      response.end(JSON.stringify(value));
    };

    if (request.method === "OPTIONS") return reply(204, {});

    if (request.method === "GET" && url.pathname === "/health") {
      return reply(200, {
        ok: true,
        hostedBy: "test-forge-driver-mcp",
        queued: this.commands.length,
        lastPolledSecondsAgo: this.secondsSinceDrain,
      });
    }

    if (request.method === "GET" && url.pathname === "/commands") {
      return reply(200, { ok: true, commands: this.drain() });
    }

    if (request.method === "GET" && url.pathname === "/result") {
      const found = this.result(Number(url.searchParams.get("id")));
      return reply(200, { ok: true, result: found, pending: !found });
    }

    if (request.method === "POST" && (url.pathname === "/result" || url.pathname === "/command")) {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (url.pathname === "/result") {
            this.recordResult(body);
            return reply(200, { ok: true });
          }
          const id = this.enqueue(body);
          return reply(200, { ok: true, id, queued: this.commands.length });
        } catch (error) {
          return reply(400, { ok: false, error: String((error as Error)?.message ?? error) });
        }
      });
      return;
    }

    reply(404, { ok: false, error: "not found" });
  }
}

export const queue = new CommandQueue();
