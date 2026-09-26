import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { sendError } from '../utils/httpError.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 * Validated tokens are remembered briefly so the tracking page's polling
 * (several requests per second across users) does not cost one DB round-trip each.
 * 30 s is short enough that logout / token rotation is felt almost immediately.
 */
const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_CACHE_MAX = 5_000;

declare module 'express' {
  interface Request {
    customerId?: string;
  }
}

interface CachedSession {
  customerId: string;
  issuedAt: number | null;
  cachedAt: number;
}

const sessionCache = new Map<string, CachedSession>();

function rememberSession(token: string, session: CachedSession): void {
  if (sessionCache.size >= AUTH_CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = sessionCache.keys().next().value;
    if (oldest) sessionCache.delete(oldest);
  }
  sessionCache.set(token, session);
}

/** Call when a customer logs out or a token is rotated so the cache does not outlive it. */
export function forgetCustomerSession(token: string): void {
  sessionCache.delete(token);
}

/**
 * Validates a customer's session token against app_users.session_token
 * (persisted at OTP verification — see auth.controller.ts verifyOTP).
 *
 * This replaces the legacy pattern of treating the customer's raw UUID as
 * the Bearer token: UUIDs are not secrets (they appear in API responses,
 * URLs, and logs), so any caller who observed one could forge auth. A real
 * random session token, checked here, cannot be guessed or harvested the
 * same way.
 */
export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const where = 'customerAuth.requireCustomer';
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return sendError(res, where, 'You need to be logged in for this request (no Authorization: Bearer token was sent).', undefined, 401);
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return sendError(res, where, 'You need to be logged in for this request (the Authorization token was empty).', undefined, 401);
  }

  try {
    const now = Date.now();
    let session = sessionCache.get(token);
    if (session && now - session.cachedAt > AUTH_CACHE_TTL_MS) {
      sessionCache.delete(token);
      session = undefined;
    }

    if (!session) {
      const { data: user, error } = await supabaseAdmin
        .from('app_users')
        .select('id, role, session_token_issued_at')
        .eq('session_token', token)
        .eq('role', 'customer')
        .maybeSingle();

      if (error) {
        return sendError(res, where, 'Could not check your login session with the database.', error, 500);
      }
      if (!user) {
        return sendError(res, where, 'Your login session is invalid or has expired — please log in again.', undefined, 401);
      }
      const issuedAtRaw = (user as { session_token_issued_at?: string | null }).session_token_issued_at;
      session = {
        customerId: (user as { id: string }).id,
        issuedAt: issuedAtRaw ? new Date(issuedAtRaw).getTime() : null,
        cachedAt: now
      };
      rememberSession(token, session);
    }

    if (session.issuedAt != null && now - session.issuedAt > SESSION_TTL_MS) {
      sessionCache.delete(token);
      await supabaseAdmin
        .from('app_users')
        .update({ session_token: null, session_token_issued_at: null })
        .eq('session_token', token);
      return sendError(res, where, 'Your login session has expired after 30 days — please log in again.', undefined, 401);
    }

    req.customerId = session.customerId;
    next();
  } catch (err) {
    return sendError(res, where, 'Could not verify your login session.', err, 500);
  }
}
