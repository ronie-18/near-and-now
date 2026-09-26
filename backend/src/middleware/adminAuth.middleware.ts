import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { sendError } from '../utils/httpError.js';

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

  const where = 'adminAuth.requireAdmin';
  if (!token) {
    return sendError(res, where, 'Admin login required (no x-admin-token or Authorization: Bearer token was sent).', undefined, 401);
  }

  try {
    const now = new Date().toISOString();
    const { data: session, error } = await supabaseAdmin
      .from('admin_sessions')
      .select('admin_id, expires_at')
      .eq('session_token', token)
      .gt('expires_at', now)
      .maybeSingle();

    if (error) {
      return sendError(res, where, 'Could not check the admin session with the database.', error, 500);
    }
    if (!session) {
      return sendError(res, where, 'Your admin session is invalid or has expired — please log in again.', undefined, 401);
    }

    req.adminId = session.admin_id;
    next();
  } catch (err) {
    return sendError(res, where, 'Could not verify the admin session.', err, 500);
  }
}
