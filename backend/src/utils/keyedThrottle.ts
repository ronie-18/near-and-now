/**
 * Per-key "at most once every N ms" gate for the order-tracking watchdogs.
 *
 * Replaces bare `Map<orderId, timestamp>`s that were never pruned: every order
 * whose tracking screen was ever opened stayed in memory until the process
 * restarted (backlog item 16, 2026-10-02). An entry older than the interval no
 * longer throttles anything, so dropping it is behaviour-preserving; pruning
 * runs only once the map passes `pruneAbove` entries, so it costs nothing in
 * normal operation.
 */
export class KeyedThrottle {
  private readonly last = new Map<string, number>();

  constructor(private readonly intervalMs: number, private readonly pruneAbove = 1000) {}

  /** True if `key` ran within the interval. Does not record anything. */
  isThrottled(key: string, now = Date.now()): boolean {
    const at = this.last.get(key);
    return at !== undefined && now - at < this.intervalMs;
  }

  /** Record that `key` ran now. */
  mark(key: string, now = Date.now()): void {
    this.last.set(key, now);
    if (this.last.size > this.pruneAbove) {
      for (const [k, at] of this.last) {
        if (now - at >= this.intervalMs) this.last.delete(k);
      }
    }
  }

  /** Check-and-record in one step: true means "go ahead" (and it's now recorded). */
  tryAcquire(key: string, now = Date.now()): boolean {
    if (this.isThrottled(key, now)) return false;
    this.mark(key, now);
    return true;
  }

  get size(): number {
    return this.last.size;
  }
}
