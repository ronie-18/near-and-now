/**
 * Admin session helpers — session read, logout, and the route-guard check.
 *
 * The actual login call lives in adminAuthService.ts's authenticateAdmin()
 * (POST /api/admin/login on the Express backend). This file previously also
 * contained a second, entirely separate login/token-refresh path
 * (secureAdminLogin/refreshAccessToken/getAccessToken/secureAdminFetch)
 * calling a Supabase Edge Function (supabase/functions/admin-auth) — dead
 * code with zero real callers (confirmed 2026-07-27: nothing anywhere in
 * the app ever calls secureAdminLogin, so the sessionStorage keys it would
 * have written — adminAccessToken/adminRefreshToken/adminTokenExpiry —
 * are never actually set). Removed rather than left as a trap; the real
 * session is the one authenticateAdmin writes under 'adminToken'.
 */

import { getAdminClient } from './supabase';
import { apiUrl } from '../utils/apiBase';
import { getAdminToken, getAdminDataRaw, getAdminTokenExpiry, clearAdminSession } from './adminSession';

/**
 * Secure admin logout — invalidates the server-side session row and clears local storage.
 */
export async function secureAdminLogout(): Promise<void> {
  try {
    const token = getAdminToken();
    if (token) {
      // Audit-log the logout server-side (POST /api/admin/logout, requireAdmin
      // — must run before the session-row delete below, while the token is
      // still valid) rather than the old logSecurityEvent() call this
      // replaces, which always silently failed: security_events only grants
      // SELECT/INSERT to service_role, so that anon-key write 401'd every
      // time. Found 2026-08-13 via a live click-test of the new Security Log
      // page. Best-effort — a failed audit write should never block logout.
      await fetch(apiUrl('/api/admin/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch((error) => console.error('Failed to record logout audit log:', error));

      await getAdminClient()
        .from('admin_sessions')
        .delete()
        .eq('session_token', token);
    }
  } catch (error) {
    console.error('Error during logout:', error);
  } finally {
    // Always clear local storage regardless of server-side success.
    clearAdminSession();
  }
}

/**
 * Get current admin data
 */
export function getCurrentAdmin(): any | null {
  const adminData = getAdminDataRaw();

  if (!adminData) {
    return null;
  }

  try {
    return JSON.parse(adminData);
  } catch {
    return null;
  }
}

/**
 * Check if admin is authenticated — validated against the real session row
 * `authenticateAdmin` writes (admin_sessions.session_token), not just the
 * client-side clock.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const adminToken = getAdminToken();
  const adminData = getAdminDataRaw();
  const adminTokenExpiry = getAdminTokenExpiry();

  if (!adminToken || !adminData) {
    return false;
  }

  // Check if the client-side clock thinks the token is still fresh.
  if (adminTokenExpiry) {
    const expiry = parseInt(adminTokenExpiry);
    if (Date.now() >= expiry) {
      clearAdminSession();
      return false;
    }
  }

  // The client clock alone isn't enough: the server-side admin_sessions row
  // (which every RLS-gated Supabase query actually checks via
  // is_admin_authenticated()) can be expired or logged-out independently —
  // e.g. logged out from another tab, or a shorter server-side expiry.
  // Without this check, the guard would render the page while every real
  // data fetch on it silently 401s/empty-results against a dead session.
  try {
    const { data, error } = await getAdminClient()
      .from('admin_sessions')
      .select('expires_at, logged_out_at')
      .eq('session_token', adminToken)
      .maybeSingle();

    if (error) {
      // Network/transient failure — don't force a logout on a blip.
      return true;
    }

    const stillValid =
      !!data && data.logged_out_at == null && new Date(data.expires_at).getTime() > Date.now();

    if (!stillValid) {
      clearAdminSession();
      return false;
    }
  } catch {
    // Transient failure (offline, etc.) — fail open rather than logging out.
    return true;
  }

  return true;
}
