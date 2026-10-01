import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { sendError } from '../utils/httpError.js';

const SESSION_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days of inactivity
// Renew the sliding window at most this often. Renewing on *every* request
// meant one app_users write per authenticated call — ~720/hour for a customer
// sitting on the tracking screen (5 s poll) — for no benefit: against a 25-day
// window, an hour of granularity is invisible. (Backlog item 20, 2026-10-02.)
export const SESSION_RENEW_AFTER_MS = 60 * 60 * 1000;

declare module 'express' {
  interface Request {
    customerId?: string;
  }
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
 *
 * The session is a sliding 25-day window, not a fixed one: authenticated
 * requests renew `session_token_issued_at` (at most once an hour — see
 * SESSION_RENEW_AFTER_MS), so the 25-day clock counts from the customer's
 * actual last activity, to within an hour — not their original login. Only 25 days of
 * genuine inactivity — no request at all — lets the token actually expire
 * and forces a fresh OTP login, regardless of whether they ever tapped
 * "logout".
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

  // This runs on every authenticated customer request, ahead of every
  // controller — unlike controllers (all of which wrap their bodies in
  // try/catch), this had no try/catch at all. A thrown error here (e.g.
  // Supabase returning a non-JSON response during a maintenance/gateway
  // blip, a DNS failure) becomes an unhandled promise rejection, which is
  // fatal to the whole Node process (no global handler exists either — see
  // server.ts), taking down every other in-flight request, not just this
  // one. Found 2026-08-26 during a crash-risk audit.
  try {
    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('id, role, session_token_issued_at, is_suspended')
      .eq('session_token', token)
      .eq('role', 'customer')
      .maybeSingle();

    if (error) {
      return sendError(res, where, 'Could not check your login session with the database.', error, 500);
    }
    if (!user) {
      return sendError(res, where, 'Your login session is invalid or has expired — please log in again.', undefined, 401);
    }

    if ((user as any).is_suspended) {
      return sendError(res, where, 'This account has been suspended.', undefined, 403);
    }

    const issuedAtRaw = (user as any).session_token_issued_at;
    if (issuedAtRaw) {
      const issuedAt = new Date(issuedAtRaw).getTime();
      const age = Date.now() - issuedAt;
      if (age > SESSION_TTL_MS) {
        try {
          await supabaseAdmin
            .from('app_users')
            .update({ session_token: null, session_token_issued_at: null })
            .eq('session_token', token)
            .eq('role', 'customer');
        } catch {
          // Best-effort cleanup — still expire the request either way; a failed
          // clear just means this row gets cleared on some future expired hit.
        }
        return sendError(res, where, 'Your login session expired after 25 days without activity — please log in again.', undefined, 401);
      }
      // Renew (at most hourly) so the 25-day window counts from the customer's
      // actual last activity. Fire-and-forget: don't hold up the request on
      // this write, and a missed renewal just means a later request renews it.
      // Filtered by role too, matching the SELECT above, so this can never
      // touch a non-customer row even in principle.
      if (age > SESSION_RENEW_AFTER_MS) void (async () => {
        try {
          await supabaseAdmin
            .from('app_users')
            .update({ session_token_issued_at: new Date().toISOString() })
            .eq('session_token', token)
            .eq('role', 'customer');
        } catch {
          // Best-effort — a missed renewal just means the next request renews it.
        }
      })();
    }

    req.customerId = (user as any).id;
    next();
  } catch (err) {
    return sendError(res, where, 'Could not verify your login session.', err, 500);
  }
}
