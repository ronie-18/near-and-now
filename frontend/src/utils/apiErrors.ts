/**
 * Consistent, locatable error messages for the customer app.
 *
 * Every user-facing failure message is built here so it always says
 *   1. what the user was trying to do,
 *   2. where in the code it failed (a short `where` tag such as
 *      "HomePage.fetchData"), and
 *   3. the underlying reason when one is available.
 *
 * The `where` tag is what lets us find the failing call in the codebase
 * from a screenshot or a support ticket.
 */

export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  where?: string;
  requestId?: string;
}

export class ApiError extends Error {
  status: number;
  where?: string;
  code?: string;
  requestId?: string;

  constructor(message: string, status: number, extra: Partial<ApiErrorBody> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.where = extra.where;
    this.code = extra.code;
    this.requestId = extra.requestId;
  }
}

/** Pull the most useful human-readable reason out of any thrown value. */
export function errorReason(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const anyErr = err as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown };
  for (const candidate of [anyErr.message, anyErr.error, anyErr.details, anyErr.hint]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  try {
    const json = JSON.stringify(err);
    return json === '{}' ? '' : json;
  } catch {
    return '';
  }
}

/**
 * Build a message like:
 *   "Could not load the home page products (HomePage.fetchData): network timeout"
 */
export function describeError(where: string, action: string, err?: unknown): string {
  const reason = errorReason(err);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const base = `${action} (${where})`;
  if (isOffline) return `${base}: you appear to be offline.`;
  if (err instanceof ApiError && err.requestId) {
    return reason ? `${base}: ${reason} [ref ${err.requestId}]` : `${base} [ref ${err.requestId}]`;
  }
  return reason ? `${base}: ${reason}` : `${base}.`;
}

/**
 * Turn a non-OK fetch Response into an ApiError carrying the backend's
 * `where`/`requestId` so the UI message points at the failing endpoint.
 */
export async function apiErrorFromResponse(res: Response, where: string): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let body: ApiErrorBody = {};
  try {
    body = text ? (JSON.parse(text) as ApiErrorBody) : {};
  } catch {
    /* not JSON */
  }
  const trimmed = text.trim().toLowerCase();
  const looksLikeHtml = trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
  const message =
    body.error ||
    body.message ||
    (looksLikeHtml
      ? `The API at ${res.url || 'this address'} returned a web page instead of JSON. Check VITE_API_URL and the API deployment.`
      : text || `${res.status} ${res.statusText}`.trim());
  return new ApiError(message, res.status, {
    where: body.where || where,
    code: body.code,
    requestId: body.requestId || res.headers.get('x-request-id') || undefined
  });
}

/** fetch() wrapper: throws ApiError (with location info) on non-2xx. */
export async function fetchJson<T>(url: string, init: RequestInit | undefined, where: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (networkErr) {
    throw new ApiError(
      describeError(where, `Could not reach the server at ${url}`, networkErr),
      0,
      { where }
    );
  }
  if (!res.ok) throw await apiErrorFromResponse(res, where);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
