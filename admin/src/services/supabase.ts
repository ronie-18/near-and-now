import { createClient } from '@supabase/supabase-js';
import { getAdminToken, clearAdminSession } from './adminSession';

// Supabase configuration (from .env)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase configuration!');
  console.error('VITE_SUPABASE_URL:', SUPABASE_URL ? '✓ Set' : '✗ Missing');
  console.error('VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
  console.error('Available env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
}

// Create Supabase client for public operations (anon key, RLS applies)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Frontend admin client uses anon key — privileged operations go through the backend API
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Returns a Supabase client that includes the admin session token in the
 * x-admin-token header. PostgREST passes this header into the DB session so
 * is_admin_authenticated() can validate it via admin_sessions, bypassing RLS.
 *
 * When there's no token (expired/logged-out mid-session — the route-level
 * `AdminAuthGuard` only checks this once, on mount, not on every call here),
 * this used to silently fall back to a plain anon client instead of erroring
 * — every RLS-gated query would then just come back empty/blocked, with no
 * indication to the admin *why* the page looks broken. Now it redirects to
 * login instead, matching what the mount-time guard already does, so a
 * session that dies mid-use gets the same "please log in again" outcome
 * instead of a silently-anonymous one. Still returns the anon client as the
 * function's return value (a redirect is async/navigational, not something
 * that can replace a synchronous return) — callers in flight will get an
 * RLS-empty result for this one request while the redirect takes effect.
 */
export function getAdminClient() {
  const token = getAdminToken() || '';
  if (!token) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      clearAdminSession();
      window.location.href = '/login';
    }
    return supabaseAdmin;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { 'x-admin-token': token }
    },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Product types
export interface Product {
  unit: string;
  id: string;
  name: string;
  price: number;
  /** GST % from master_products (e.g. 18). Omitted for loose products (no GST on selling price). */
  gst_rate?: number;
  original_price?: number;
  description?: string;
  image?: string;
  image_url?: string;
  images?: string[]; // Array of additional image URLs
  category: string;
  in_stock: boolean;
  rating?: number;
  size?: string;
  weight?: string;
  created_at?: string;
  updated_at?: string;
  isLoose?: boolean;
  brand?: string;
  min_quantity?: number;
  max_quantity?: number;
  hsn_code?: string;
  hsn_description?: string;
  cgst?: number;
  sgst?: number;
  rating_count?: number;
}
