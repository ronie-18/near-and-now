import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { hasPermission } from '../utils/adminPermissions.js';
import { sendError } from '../utils/httpError.js';

declare module 'express' {
  interface Request {
    adminId?: string;
    /**
     * Role from the same admins row requireAdmin just checked for
     * status='active'. requirePermission uses it instead of reading that row
     * again (one round trip less on every admin API call).
     */
    adminRole?: string;
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
    if (error) {
      return sendError(res, where, 'Could not check the admin session with the database.', error, 500);
    }
    if (!session || session.logged_out_at) {
      return sendError(res, where, 'Your admin session is invalid or has expired — please log in again.', undefined, 401);
    }

    // `status='active'` was previously checked only at login (admin.controller.ts's login()).
    // A super_admin deactivating another admin via AdminManagementPage did not revoke that
    // admin's existing session — every already-issued token kept working here and in
    // requirePermission below until it expired on its own. Found 2026-10-01 during an
    // access-control audit; mirrors the is_suspended check customerAuth.middleware.ts already
    // has for customers.
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('status, role')
      .eq('id', session.admin_id)
      .maybeSingle();
    if (adminError) {
      return sendError(res, where, 'Could not check the admin account with the database.', adminError, 500);
    }
    if (!admin || (admin as { status: string }).status !== 'active') {
      return sendError(res, where, 'Your admin account is no longer active — please contact a super admin.', undefined, 401);
    }

    req.adminId = session.admin_id;
    req.adminRole = (admin as { role: string }).role;
    next();
  } catch (err) {
    return sendError(res, where, 'Could not verify the admin session.', err, 500);
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
      // requireAdmin already read this admin's row (and rejected it unless
      // status='active'); use the role from that same row. Only when this
      // runs without requireAdmin in front of it is the row read here.
      let role = req.adminRole;
      if (role === undefined) {
        const { data: caller, error } = await supabaseAdmin
          .from('admins')
          .select('role')
          .eq('id', req.adminId)
          .maybeSingle();

        if (error || !caller) {
          return res.status(401).json({ error: 'Invalid admin session' });
        }
        role = (caller as { role: string }).role;
      }

      if (!hasPermission(role, permission)) {
        return res.status(403).json({ error: `Missing permission: ${permission}` });
      }

      next();
    } catch (err) {
      console.error('requirePermission auth check failed:', err);
      res.status(500).json({ error: 'Authentication check failed' });
    }
  };
}
