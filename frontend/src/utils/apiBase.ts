/** Backend API origin for checkout, payments, and other server-side Supabase operations. */
export function getApiBase(): string {
  let base = (import.meta.env.VITE_API_URL || import.meta.env.EXPO_PUBLIC_API_BASE_URL || '')
    .toString()
    .replace(/\/$/, '');
  if (import.meta.env.DEV && base.startsWith('https://')) {
    return '';
  }
  return base;
}

/**
 * Route address/order mutations through the Express API (service role), not browser → Supabase.
 * - Production: set `VITE_API_URL` to your deployed API origin (often same Vercel host as the SPA).
 * - Development: if `VITE_API_URL` is https (e.g. Vercel URL in .env), base is empty and requests use
 *   same-origin `/api/...`; Vite proxies those to the local backend (`VITE_API_PROXY_TARGET` or :3000), not to `VITE_API_URL`.
 */
export function shouldUseBackendApi(): boolean {
  if (getApiBase()) return true;
  return Boolean(import.meta.env.DEV);
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
