import { waitUntil } from '@vercel/functions';

/**
 * Runs `work` without making the caller wait for it — and, on Vercel, keeps
 * the serverless function alive until it settles.
 *
 * The production API runs on Vercel serverless (api/index.ts). There, a bare
 * un-awaited promise started before `res.json()` can be frozen the moment the
 * response is sent, so "fire-and-forget" order-flow work (re-homing a store's
 * declined items, dispatching to riders, store notifications) could silently
 * never finish — and with finalize_order_if_ready refusing to dispatch while
 * items are between stores, that left orders stuck. `waitUntil` tells the
 * platform to keep the invocation running until the promise settles.
 * Off Vercel (local dev, a container) it is a no-op and the promise simply
 * runs on the event loop as before.
 *
 * Errors are logged, never thrown — same contract as the `.catch(console.error)`
 * calls this replaces.
 */
export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const task = Promise.resolve()
    .then(work)
    .catch((err) => console.error(`[background] ${label} failed:`, err));
  try {
    waitUntil(task);
  } catch (err) {
    // No request context (e.g. called from a timer). The task still runs.
    console.warn(`[background] ${label}: waitUntil unavailable`, err);
  }
}
