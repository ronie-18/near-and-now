import type { Request, Response } from 'express';

/**
 * Structured API error responses.
 *
 * Every error the API returns has the same shape:
 *   {
 *     error:     "Could not load the product categories",   // sentence for the UI
 *     where:     "ProductsController.getCategories",         // code location
 *     requestId: "b1f3…",                                     // matches the server log line
 *     code?:     "PGRST301",                                  // upstream code when available
 *     detail?:   "permission denied for table categories"    // upstream message (non-prod only,
 *                                                             //  or when the error is a client error)
 *   }
 *
 * `where` + `requestId` are what let us jump from a screenshot straight to
 * the failing handler and the matching CloudWatch log line.
 */

export class AppError extends Error {
  status: number;
  code?: string;
  expose: boolean;

  constructor(message: string, status = 500, options: { code?: string; expose?: boolean } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = options.code;
    // Client errors (4xx) are always safe to expose; server errors only outside production.
    this.expose = options.expose ?? status < 500;
  }
}

const isProd = process.env.NODE_ENV === 'production';

/** Best-effort human-readable reason from an unknown thrown value (Supabase, Twilio, Zod, Error…). */
export function errorReason(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  const anyErr = err as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; error_description?: unknown };
  for (const candidate of [anyErr.message, anyErr.error_description, anyErr.error, anyErr.details, anyErr.hint]) {
    if (typeof candidate === 'string' && candidate.trim() && candidate !== '{}') return candidate;
  }
  try {
    const json = JSON.stringify(err);
    return json === '{}' ? '' : json;
  } catch {
    return '';
  }
}

export function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

/**
 * Infer an HTTP status from common upstream error shapes:
 *  - AppError → its status
 *  - PostgREST "PGRST116" (no rows for .single()) → 404
 *  - Postgres 23505 (unique violation) → 409, 23503 (FK) → 400, 42501 (RLS) → 403
 *  - Anything else → fallback
 */
export function inferStatus(err: unknown, fallback = 500): number {
  if (err instanceof AppError) return err.status;
  const status = (err as { status?: unknown; statusCode?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status <= 599) return status;
  switch (errorCode(err)) {
    case 'PGRST116':
      return 404;
    case '23505':
      return 409;
    case '23503':
    case '22P02':
    case '23502':
      return 400;
    case '42501':
      return 403;
    default:
      return fallback;
  }
}

/**
 * Send a structured error. `where` is the controller method, `friendly` is the
 * sentence shown to users. The upstream reason is attached as `detail` when it
 * is safe to expose (client errors always; server errors only outside production).
 */
export function sendError(
  res: Response,
  where: string,
  friendly: string,
  err?: unknown,
  statusOverride?: number,
  /** Extra fields merged into the body, for clients that expect a legacy envelope (e.g. { success: false }). */
  extra?: Record<string, unknown>
): Response {
  const status = statusOverride ?? inferStatus(err);
  const requestId = (res.req as Request | undefined)?.requestId;
  const reason = errorReason(err);
  const code = errorCode(err);
  const expose = err instanceof AppError ? err.expose : status < 500 || !isProd;

  if (status >= 500) {
    console.error(`[${requestId ?? '-'}] ${where} → ${status}: ${friendly}${reason ? ` | ${reason}` : ''}`, err instanceof Error ? err.stack : err);
  } else {
    console.warn(`[${requestId ?? '-'}] ${where} → ${status}: ${friendly}${reason ? ` | ${reason}` : ''}`);
  }

  const body: Record<string, unknown> = {
    success: false,
    ...(extra ?? {}),
    error: err instanceof AppError && err.expose ? err.message : friendly,
    where,
    requestId
  };
  if (code) body.code = code;
  if (expose && reason && reason !== friendly) body.detail = reason;
  return res.status(status).json(body);
}

/** Shorthand for validation-style 400s inside handlers. */
export function badRequest(res: Response, where: string, message: string): Response {
  return sendError(res, where, message, undefined, 400);
}

export function notFound(res: Response, where: string, message: string): Response {
  return sendError(res, where, message, undefined, 404);
}
