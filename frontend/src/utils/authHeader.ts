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
