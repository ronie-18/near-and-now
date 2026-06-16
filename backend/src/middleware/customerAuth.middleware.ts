import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';

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
    .select('id, role')
    .eq('session_token', token)
    .eq('role', 'customer')
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.customerId = (user as any).id;
  next();
}
