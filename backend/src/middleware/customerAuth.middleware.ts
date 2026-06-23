import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

  if ((user as any).session_token_issued_at) {
    const issuedAt = new Date((user as any).session_token_issued_at).getTime();
    if (Date.now() - issuedAt > SESSION_TTL_MS) {
      await supabaseAdmin
        .from('app_users')
        .update({ session_token: null, session_token_issued_at: null })
        .eq('session_token', token);
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
  }

  req.customerId = (user as any).id;
  next();
}
