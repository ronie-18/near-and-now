/**
 * Shared session hooks for the persistent app shell.
 *
 * The shell used to remount on every navigation, so a one-shot
 * `getCurrentAdmin()` in the header and sidebar was "fresh enough". With the
 * layout route mounting once per session, the stored admin must be re-read
 * explicitly: on route change and whenever adminSession.ts fires
 * ADMIN_SESSION_EVENT (login, profile save via updateStoredAdminData, logout).
 * Storage stays the single source of truth — nothing here caches adminData
 * beyond a mirror that refreshes on those two signals.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentAdmin, secureAdminLogout } from '../services/secureAdminAuth';
import { ADMIN_SESSION_EVENT, clearAdminSession } from '../services/adminSession';

export interface AdminSessionUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
  permissions?: string[];
  [key: string]: unknown;
}

function readAdmin(): AdminSessionUser | null {
  const value: unknown = getCurrentAdmin();
  if (!value || typeof value !== 'object') return null;
  return value as AdminSessionUser;
}

/** Only swap state when the stored object actually changed (cheap re-render guard). */
function sameAdmin(a: AdminSessionUser | null, b: AdminSessionUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * The signed-in admin as stored by the login flow, or null. Re-reads on
 * mount, on `location.pathname` change and on ADMIN_SESSION_EVENT.
 */
export function useCurrentAdmin(): AdminSessionUser | null {
  const { pathname } = useLocation();
  const [admin, setAdmin] = useState<AdminSessionUser | null>(readAdmin);

  const refresh = useCallback(() => {
    const next = readAdmin();
    setAdmin((prev) => (sameAdmin(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    window.addEventListener(ADMIN_SESSION_EVENT, refresh);
    return () => window.removeEventListener(ADMIN_SESSION_EVENT, refresh);
  }, [refresh]);

  return admin;
}

/**
 * Logout shared by the header menu and the sidebar footer.
 * `secureAdminLogout()` posts the audit log, deletes the admin_sessions row
 * and always clears local storage; if it throws anyway we still clear the
 * session locally and send the admin to /login.
 */
export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await secureAdminLogout();
      navigate('/login');
    } catch {
      clearAdminSession();
      navigate('/login');
    }
  }, [navigate]);
}
