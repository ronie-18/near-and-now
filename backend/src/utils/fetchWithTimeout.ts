/**
 * Outbound HTTP with a deadline. Node's built-in fetch has no overall timeout
 * (undici only gives up after its 5-minute header/body defaults), so a hung
 * Google / Expo / Razorpay endpoint used to hold the caller's request open for
 * minutes. Every outbound fetch in the backend goes through here.
 * (Backlog item 19, fixed 2026-10-02.)
 *
 * The deadline covers the whole exchange, including reading the body: the
 * signal stays attached to the response stream, so a server that sends headers
 * and then stalls is cut off too.
 */

/**
 * Per-upstream deadlines (ms). Exported (and mutable) so tests can shorten them.
 *  - google:   interactive lookups (autocomplete, geocode, directions, roads) —
 *              normally well under a second.
 *  - expoPush: background notification sends; never awaited by a user request.
 *  - razorpay: deliberately generous. Some calls move money (capture, refund) and
 *              aborting one that would have succeeded is worse than waiting.
 */
export const UPSTREAM_TIMEOUTS_MS = {
  google: 8_000,
  expoPush: 10_000,
  razorpay: 30_000,
};

export class UpstreamTimeoutError extends Error {
  /** Read by httpError.ts inferStatus(), so sendError() answers 504. */
  readonly status = 504;

  constructor(readonly service: string, readonly timeoutMs: number) {
    super(`${service} did not respond within ${timeoutMs / 1000} s`);
    this.name = 'UpstreamTimeoutError';
  }
}

/**
 * fetch() + `response.json()` under one deadline. Same semantics as the bare
 * calls it replaces — a non-JSON body still throws (SyntaxError) — except that
 * a timeout throws UpstreamTimeoutError instead of hanging. Returns the
 * Response too, for callers that check `.ok`/`.status`.
 */
export async function fetchJsonWithTimeout<T = unknown>(
  service: string,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<{ response: Response; json: T }> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal });
    const json = (await response.json()) as T;
    return { response, json };
  } catch (err) {
    if (signal.aborted) throw new UpstreamTimeoutError(service, timeoutMs);
    throw err;
  }
}
