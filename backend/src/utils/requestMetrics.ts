import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request database metrics and a per-rider request-rate alert
 * (monitoring, 2026-10-05). Logging only: nothing here changes a response.
 *
 * - `requestContext` runs each request inside `requestDbStats`, and the
 *   Supabase clients (config/database.ts) send every PostgREST/RPC/storage
 *   call through `instrumentedFetch`, so the request's log line can report
 *   how many database calls it made and how long they took in total.
 * - `runInBackground` work is started outside the request's context
 *   (`outsideRequest`), so background jobs (the order sweep, notifications)
 *   are not counted against the request that happened to start them.
 * - `recordRiderRequest` counts requests per rider per minute on this
 *   instance and logs one `rider_request_rate` warning (then at most one
 *   every 5 minutes per rider) when a rider goes over the threshold — the
 *   pattern a client-side polling loop produces. Serverless instances do not
 *   share memory, so this is a per-instance, lower-bound signal.
 */
export interface DbStats {
  calls: number;
  ms: number;
}

const requestDbStats = new AsyncLocalStorage<DbStats>();

export function runWithDbStats<T>(stats: DbStats, fn: () => T): T {
  return requestDbStats.run(stats, fn);
}

export function outsideRequest<T>(fn: () => T): T {
  return requestDbStats.exit(fn);
}

export const instrumentedFetch: typeof fetch = async (input, init) => {
  const stats = requestDbStats.getStore();
  if (!stats) return fetch(input, init);
  const started = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    stats.calls += 1;
    stats.ms += performance.now() - started;
  }
};

/** A rider app normally makes ~25 requests a minute; a polling loop makes hundreds. */
export const RIDER_RATE_ALERT_PER_MINUTE = 60;
const RIDER_RATE_WINDOW_MS = 60_000;
const RIDER_ALERT_COOLDOWN_MS = 5 * 60_000;

const riderWindows = new Map<string, { windowStart: number; count: number; lastAlertAt: number }>();

export function recordRiderRequest(riderId: string, now: number = Date.now()): void {
  let w = riderWindows.get(riderId);
  if (!w) {
    w = { windowStart: now, count: 0, lastAlertAt: 0 };
    riderWindows.set(riderId, w);
  }
  if (now - w.windowStart >= RIDER_RATE_WINDOW_MS) {
    w.windowStart = now;
    w.count = 0;
  }
  w.count += 1;
  if (w.count > RIDER_RATE_ALERT_PER_MINUTE && now - w.lastAlertAt >= RIDER_ALERT_COOLDOWN_MS) {
    w.lastAlertAt = now;
    console.warn(JSON.stringify({
      level: 'warn',
      alert: 'rider_request_rate',
      riderId,
      requestsLastMinute: w.count,
      threshold: RIDER_RATE_ALERT_PER_MINUTE,
    }));
  }
  // Bound memory on a long-lived instance: drop riders idle for a window.
  if (riderWindows.size > 5000) {
    for (const [id, win] of riderWindows) if (now - win.windowStart >= RIDER_RATE_WINDOW_MS) riderWindows.delete(id);
  }
}

/** Test hook. */
export function resetRiderRateWindows(): void {
  riderWindows.clear();
}
