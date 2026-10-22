/** A session keeps its pipeline intact while waiting; cancellation always releases it. */
export class AsrPauseGate {
  constructor() {
    this.paused = false;
    this.waiters = new Set();
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    for (const wake of this.waiters) wake();
  }
  async wait(signal) {
    while (this.paused && !signal.aborted) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          this.waiters.delete(wake);
          signal.removeEventListener("abort", abort);
        };
        const wake = () => {
          cleanup();
          resolve();
        };
        const abort = () => {
          cleanup();
          reject(signal.reason || new DOMException("Cancelled", "AbortError"));
        };
        this.waiters.add(wake);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    if (signal.aborted)
      throw signal.reason || new DOMException("Cancelled", "AbortError");
  }
}
