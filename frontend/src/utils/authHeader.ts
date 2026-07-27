/**
 * Shared helper for attaching the customer's session token (persisted at
 * OTP verification, see backend auth.controller.ts) as a Bearer token on
 * backend API calls that now require requireCustomer auth — orders,
 * customer addresses, etc. Returns {} when no session exists so callers can
 * spread it into fetch() headers unconditionally.
 */
export function getAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('userToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Drop-in replacement for `fetch()` on any backend call that attaches
 * getAuthHeaders() — i.e. an authenticated customer API call. Previously a
 * 401 here (expired/revoked session) was never detected anywhere on the
 * website: the customer stayed on-page with `isAuthenticated: true` while
 * every subsequent call silently failed, with no path back to login short of
 * manually finding logout. On a 401, clears the same session keys
 * `logoutUser` (AuthContext.tsx) already clears and sends the customer to
 * `/login` — a hard redirect rather than client-side navigation, since this
 * runs outside the React tree and no route-level guard component exists to
 * catch this otherwise (the one that used to exist, `ProtectedRoute.tsx`,
 * was dead code with zero importers and was deleted).
 */
export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    try {
      localStorage.removeItem('userId');
      localStorage.removeItem('userToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('customerData');
      localStorage.removeItem('authLoginPhone');
    } catch {
      // best-effort — still redirect even if storage access fails
    }
    window.location.href = '/login';
  }
  return response;
}
