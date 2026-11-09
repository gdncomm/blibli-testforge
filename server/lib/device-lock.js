// One simulator, one driver: anything that drives the device (a /test-forge-run, a replay, a chat turn that
// calls a TestForgeDriver tool, a Driver Console click) must hold this lock. Waiters are served FIFO.
import { EventEmitter } from "node:events";

class DeviceLock extends EventEmitter {
	holder = null; // { ownerId, label, since }
	waiters = [];

	/** Resolves once `ownerId` holds the lock. Re-entrant for the current holder. */
	acquire(ownerId, label) {
		if (this.holder?.ownerId === ownerId) return Promise.resolve();
		if (!this.holder) {
			this.#grant(ownerId, label);
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			this.waiters.push({ ownerId, label, resolve, reject });
			this.emit("change", this.status());
		});
	}

	/** Non-blocking variant for direct Driver Console clicks: true when free or already ours. */
	tryAcquire(ownerId, label) {
		if (this.holder && this.holder.ownerId !== ownerId) return false;
		if (!this.holder) this.#grant(ownerId, label);
		return true;
	}

	release(ownerId) {
		this.waiters = this.waiters.filter((waiter) => {
			if (waiter.ownerId !== ownerId) return true;
			waiter.reject(new Error("released while waiting"));
			return false;
		});
		if (this.holder?.ownerId !== ownerId) return;
		this.holder = null;
		const next = this.waiters.shift();
		if (next) {
			this.#grant(next.ownerId, next.label);
			next.resolve();
		} else {
			this.emit("change", this.status());
		}
	}

	isWaiting(ownerId) {
		return this.waiters.some((waiter) => waiter.ownerId === ownerId);
	}

	status() {
		return { holder: this.holder, waiting: this.waiters.map(({ ownerId, label }) => ({ ownerId, label })) };
	}

	#grant(ownerId, label) {
		this.holder = { ownerId, label, since: new Date().toISOString() };
		this.emit("change", this.status());
	}
}

export const deviceLock = new DeviceLock();
