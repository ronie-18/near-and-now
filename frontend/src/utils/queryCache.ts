/**
 * Tiny in-memory read cache with TTL and in-flight de-duplication.
 *
 * Why: the home, category, search and product pages all need the same
 * product rows. Without this every page (and every search keystroke)
 * re-downloaded the whole catalogue from Supabase. With it, the first
 * caller pays for the network round-trip and everyone else within the TTL
 * gets the same promise/result instantly.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Default freshness window for catalogue data (products, categories). */
export const DEFAULT_TTL_MS = 60_000;

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

/** Drop one key, or every key that starts with `prefix`. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inFlight.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/** Read a value synchronously if it is fresh, without triggering a load. */
export function peekCache<T>(key: string): T | undefined {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  return undefined;
}
