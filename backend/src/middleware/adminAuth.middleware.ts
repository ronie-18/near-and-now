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

  // No try/catch previously — a thrown error (Supabase network/gateway
  // blip) became an unhandled promise rejection, fatal to the whole Node
  // process with no global handler to catch it. Found 2026-08-26 during a
  // crash-risk audit; same fix applied to every auth middleware in the app.
  try {
    const now = new Date().toISOString();
    const { data: session, error } = await supabaseAdmin
      .from('admin_sessions')
      .select('admin_id, expires_at, logged_out_at')
      .eq('session_token', token)
      .gt('expires_at', now)
      .maybeSingle();

    // Every RLS-level session check (is_admin_authenticated(), admin_has_permission())
    // already requires logged_out_at IS NULL too — this Express layer was the
    // one place that didn't, previously checking only expires_at. Not
    // exploitable today (the only logout path deletes the session row outright
    // rather than setting logged_out_at), but a future "revoke this session"
    // feature that sets it instead would otherwise keep this layer accepting
    // an admin-revoked token for up to the full session TTL while Supabase
    // calls correctly reject it. Found 2026-08-10 during an admin-panel
    // auth/permissions audit.
    if (error || !session || session.logged_out_at) {
      return res.status(401).json({ error: 'Invalid or expired admin session' });
    }

    req.adminId = session.admin_id;
    next();
  } catch (err) {
    console.error('requireAdmin auth check failed:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
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
    try {
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
    } catch (err) {
      console.error('requirePermission auth check failed:', err);
      res.status(500).json({ error: 'Authentication check failed' });
    }
  };
}
