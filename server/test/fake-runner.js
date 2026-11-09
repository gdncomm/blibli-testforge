// Stands in for the XCUITest runner: polls a queue's /commands like TestForgeDriverRunner does and posts a
// result for each command, answered by `respond(command)`. Returning `undefined` from respond leaves
// the command unanswered — how a frozen app or a dead session looks from the host.
export function startFakeRunner(base, respond, { pollMs = 20 } = {}) {
	const seen = [];
	let stopped = false;
	const loop = async () => {
		while (!stopped) {
			try {
				const { commands } = await (await fetch(`${base}/commands`)).json();
				for (const command of commands) {
					seen.push(command);
					const outcome = await respond(command);
					if (outcome === undefined) continue;
					await fetch(`${base}/result`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						// Same envelope as TestForgeDriverRunner: outcome under `value`, failures as top-level `error`.
						body: JSON.stringify(outcome.error === undefined ? { id: command.id, value: outcome } : { id: command.id, error: outcome.error }),
					});
				}
			} catch {
				// The queue going away mid-test is a case some tests exercise on purpose.
			}
			await new Promise((resolve) => setTimeout(resolve, pollMs));
		}
	};
	const running = loop();
	return {
		seen,
		stop: async () => {
			stopped = true;
			await running;
		},
	};
}
