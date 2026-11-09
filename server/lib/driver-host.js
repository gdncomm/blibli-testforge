// The TestForgeDriver command queue (127.0.0.1:8789), hosted by the dashboard so a macro replay works with
// no Claude session open (feasibility-macros.md G1, D-040).
//
// Same wire protocol as test-forge-driver-mcp's src/queue.ts — the XCUITest runner cannot tell the two
// apart. Ownership is first-come: whichever process binds the port hosts, the other is a client.
// The MCP's own listen() already falls back to client mode when the port is taken, so an MCP started
// after the dashboard simply talks to this queue. When the MCP got there first and later exits, the
// port frees up and the watchdog below takes it over within REHOST_INTERVAL_MS — the runner exits
// when /health fails, so the gap has to stay short.
import { createServer } from "node:http";

const MAX_COMMANDS = 100;
const MAX_RESULTS = 100;
const MAX_BODY_BYTES = 4 * 1_048_576;
const REHOST_INTERVAL_MS = 2_000;

export class DriverHost {
	constructor({ port = Number(process.env.TEST_FORGE_DRIVER_PORT || 8789), host = "127.0.0.1" } = {}) {
		this.port = port;
		this.host = host;
		this.commands = [];
		this.results = new Map();
		this.nextID = 1;
		this.server = null;
		this.lastPolledAt = null;
		this.watchdog = null;
	}

	get isHosting() {
		return this.server !== null;
	}

	get endpoint() {
		return `http://${this.host}:${this.port}`;
	}

	enqueue(body) {
		if (this.commands.length >= MAX_COMMANDS) this.commands.shift();
		const id = this.nextID++;
		this.commands.push({ ...body, id });
		return id;
	}

	/** Destructive on purpose: a command applied twice toggles something back off. */
	drain() {
		this.lastPolledAt = Date.now();
		return this.commands.splice(0, this.commands.length);
	}

	recordResult(body) {
		this.results.set(body.id, { ...body, at: new Date().toISOString() });
		if (this.results.size > MAX_RESULTS) this.results.delete(this.results.keys().next().value);
	}

	result(id) {
		return this.results.get(id) ?? null;
	}

	/** Seconds since the runner last drained; null when it never has. A stale value means no runner. */
	get lastPolledSecondsAgo() {
		return this.lastPolledAt === null ? null : Math.round((Date.now() - this.lastPolledAt) / 1000);
	}

	listen() {
		if (this.server) return Promise.resolve(true);
		const server = createServer((request, response) => this.handle(request, response));
		return new Promise((settle) => {
			server.once("error", () => {
				server.close();
				settle(false);
			});
			server.listen(this.port, this.host, () => {
				this.server = server;
				this.port = server.address().port;
				server.unref();
				settle(true);
			});
		});
	}

	/** Binds now if the port is free, then keeps re-trying while someone else holds it. */
	async start() {
		await this.listen();
		this.watchdog = setInterval(() => {
			if (!this.isHosting) this.listen();
		}, REHOST_INTERVAL_MS);
		this.watchdog.unref();
		return this.isHosting;
	}

	close() {
		clearInterval(this.watchdog);
		this.watchdog = null;
		this.server?.close();
		this.server = null;
	}

	/** Who serves the queue right now: this process, another one (the test-forge-driver MCP), or nobody. */
	async status() {
		if (this.isHosting) {
			return { reachable: true, hostedBy: "test-forge", queued: this.commands.length, lastPolledSecondsAgo: this.lastPolledSecondsAgo };
		}
		try {
			const response = await fetch(`${this.endpoint}/health`, { signal: AbortSignal.timeout(2_000) });
			const health = await response.json();
			return { reachable: true, hostedBy: health.hostedBy ?? "unknown", queued: health.queued, lastPolledSecondsAgo: health.lastPolledSecondsAgo ?? null };
		} catch {
			return { reachable: false, hostedBy: null };
		}
	}

	handle(request, response) {
		const url = new URL(request.url, "http://localhost");
		const reply = (code, value) => {
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
			return reply(200, { ok: true, hostedBy: "test-forge", queued: this.commands.length, lastPolledSecondsAgo: this.lastPolledSecondsAgo });
		}
		if (request.method === "GET" && url.pathname === "/commands") return reply(200, { ok: true, commands: this.drain() });
		if (request.method === "GET" && url.pathname === "/result") {
			const found = this.result(Number(url.searchParams.get("id")));
			return reply(200, { ok: true, result: found, pending: !found });
		}
		if (request.method === "POST" && (url.pathname === "/result" || url.pathname === "/command")) {
			const chunks = [];
			let size = 0;
			request.on("data", (chunk) => {
				size += chunk.length;
				if (size > MAX_BODY_BYTES) return request.destroy();
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
					return reply(400, { ok: false, error: String(error?.message ?? error) });
				}
			});
			return;
		}
		reply(404, { ok: false, error: "not found" });
	}
}

export const driverHost = new DriverHost();
