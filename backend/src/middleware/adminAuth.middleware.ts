import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';

declare module 'express' {
  interface Request {
    adminId?: string;
  }
}

/**
 * Validates an admin session token against admin_sessions.session_token.
 * Accepts the token in either the x-admin-token header (used by the admin
 * panel's getAdminClient()) or as Authorization: Bearer <token>.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token =
    (req.headers['x-admin-token'] as string | undefined)?.trim() ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined);

  if (!token) {
    return res.status(401).json({ error: 'Missing admin token' });
  }

  const now = new Date().toISOString();
  const { data: session, error } = await supabaseAdmin
    .from('admin_sessions')
    .select('admin_id, expires_at')
    .eq('session_token', token)
    .gt('expires_at', now)
    .maybeSingle();

  if (error || !session) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }

  req.adminId = session.admin_id;
  next();
}
