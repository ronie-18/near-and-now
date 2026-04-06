import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env before reading keys. This module is imported during server startup *before* server.ts runs
// its second dotenv (repo root). Without both files, SUPABASE_SERVICE_ROLE_KEY may be missing and
// supabaseAdmin falls back to anon → RLS "permission denied" on customer_orders inserts.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: true });
// `npm run dev --workspace=backend` often has cwd = repo root; prefer that .env last.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

/** Supabase JWTs embed role; anon key mistakenly pasted as service role still hits RLS. */
function jwtRoleFromSupabaseKey(token: string | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const rawServiceRoleKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const serviceRoleJwtRole = jwtRoleFromSupabaseKey(rawServiceRoleKey);
const supabaseServiceKey =
  rawServiceRoleKey && serviceRoleJwtRole === 'service_role' ? rawServiceRoleKey : undefined;

if (rawServiceRoleKey && serviceRoleJwtRole && serviceRoleJwtRole !== 'service_role') {
  console.error(
    `[database] SUPABASE_SERVICE_ROLE_KEY is set but JWT role is "${serviceRoleJwtRole}", not service_role. ` +
      `Orders will fail with RLS. Use the service_role secret from Supabase → Settings → API (not the anon key).`
  );
}
if (rawServiceRoleKey && !serviceRoleJwtRole) {
  console.error(
    '[database] Could not parse SUPABASE_SERVICE_ROLE_KEY as a JWT — check for typos, quotes, or newlines in .env.'
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for user creation (bypasses RLS) - service role key only on server
export const supabaseAdmin: SupabaseClient = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : supabase;

/** Saved-address merge uses service role to read app_users / customer_saved_addresses under RLS. */
export const isSupabaseServiceRoleConfigured = Boolean(supabaseServiceKey);

export default supabase;
