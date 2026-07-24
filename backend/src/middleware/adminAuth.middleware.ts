import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { hasPermission } from '../utils/adminPermissions.js';

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

/**
 * Role-based permission gate — run after requireAdmin (needs req.adminId
 * already set). Previously nothing below the React component layer checked
 * role at all: hasPermission() in the admin frontend was only ever consulted
 * to decide what UI to render, so any authenticated admin session regardless
 * of role — including `viewer` — could call any of these routes directly
 * (devtools, curl, a saved Postman request) and it would succeed identically
 * to a super_admin calling it. Mirrors the role-lookup pattern
 * admin.controller.ts's createAdmin/updateAdmin/deleteAdmin already use for
 * admin-management, generalized to every permission string in adminPermissions.ts.
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { data: caller, error } = await supabaseAdmin
      .from('admins')
      .select('role')
      .eq('id', req.adminId)
      .maybeSingle();

    if (error || !caller) {
      return res.status(401).json({ error: 'Invalid admin session' });
    }

    if (!hasPermission((caller as { role: string }).role, permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }

    next();
  };
}
