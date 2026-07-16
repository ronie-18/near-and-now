import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';

const SESSION_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days of inactivity

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
 * The session is a sliding 25-day window, not a fixed one: every single
 * authenticated request renews `session_token_issued_at` to the current
 * time, so the 25-day clock always counts from the customer's actual last
 * activity, to the second — not their original login. Only 25 days of
 * genuine inactivity — no request at all — lets the token actually expire
 * and forces a fresh OTP login, regardless of whether they ever tapped
 * "logout".
 */
export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role, session_token_issued_at')
    .eq('session_token', token)
    .eq('role', 'customer')
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
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
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    // Renew on every request so the 25-day window always counts from the
    // customer's actual last activity. Fire-and-forget: don't hold up the
    // request on this write, and a missed renewal just means the next
    // request renews it instead. Filtered by role too, matching the SELECT
    // above, so this can never touch a non-customer row even in principle.
    void (async () => {
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
}
