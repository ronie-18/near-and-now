import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env before reading keys. This module is imported during server startup *before* server.ts runs
// its second dotenv (repo root). Without both files, SUPABASE_SERVICE_ROLE_KEY may be missing and
// supabaseAdmin falls back to anon → RLS "permission denied" on customer_orders inserts.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Skip the override:true loads under the test runner — otherwise real .env secrets silently
// clobber whatever a test deliberately set on process.env before importing this module.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: true });
  // `npm run dev --workspace=backend` often has cwd = repo root; prefer that .env last.
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
}

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

/**
 * Used to silently alias to the anon `supabase` client when the service-role
 * key was missing/malformed — meaning every one of the ~100 call sites across
 * this codebase that use `supabaseAdmin` expecting it to bypass RLS would
 * instead silently run as anon and get RLS-filtered, degrading into
 * confusing empty-result bugs (or outright "permission denied" on inserts)
 * instead of a clear, loud failure. A Proxy that throws on first actual use
 * closes this for all ~100 call sites at once — no need to manually add a
 * config-check to each — while still letting the server boot without the key
 * (the two flows that already have a friendlier upfront check via
 * `isSupabaseServiceRoleConfigured` still get their nicer message first;
 * everything else now fails loudly instead of silently).
 */
function createMisconfiguredAdminClient(): SupabaseClient {
  const fail = (): never => {
    throw new Error(
      'supabaseAdmin was used but SUPABASE_SERVICE_ROLE_KEY is missing or malformed — ' +
        'see the console errors logged at startup above for details. Set a valid ' +
        'service_role key (Supabase → Settings → API) in backend/.env.'
    );
  };
  return new Proxy({} as SupabaseClient, {
    get: fail
  });
}

// Admin client for user creation (bypasses RLS) - service role key only on server
export const supabaseAdmin: SupabaseClient = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : createMisconfiguredAdminClient();

/**
 * Fresh, one-off service-role client — NOT the shared `supabaseAdmin` singleton.
 *
 * Any call that logs the client itself into a real Supabase Auth session
 * (`auth.verifyOtp`, `auth.signInWithPassword`, `auth.setSession`, ...) mutates
 * that client's in-memory session, and `persistSession: false` does NOT prevent
 * this — it only skips writing to storage. Every subsequent `.from()` request
 * made through that same client then authenticates as the logged-in session's
 * `authenticated` role instead of the original `service_role` apikey, because
 * supabase-js prefers an active session over the client's own apikey when
 * building the Authorization header.
 *
 * `supabaseAdmin` is a module-level singleton reused across every request in a
 * warm serverless instance, so doing this on it doesn't just affect the one
 * caller — it silently downgrades EVERY later request on that instance (any
 * user, any role) until the instance recycles. This bit riderAuthBridge.service.ts's
 * mintRiderRealtimeSession, which calls `auth.verifyOtp` to mint each rider a
 * realtime session: the first rider login on a warm instance would permanently
 * swap that instance's `supabaseAdmin` from service_role to that rider's own
 * `authenticated` session, and every app_users query after it (for anyone)
 * started failing with "permission denied for table app_users" — full table
 * grants only exist for service_role; `authenticated` only has a column-scoped
 * SELECT grant, so `select('*')` / `insert().select()` (RETURNING *) break.
 * Use this factory instead for any code path that calls a session-mutating
 * auth method, so the mutation is scoped to a throwaway client.
 */
export function createServiceRoleClient(): SupabaseClient {
  if (!supabaseServiceKey) return createMisconfiguredAdminClient();
  return createClient(supabaseUrl!, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** Saved-address merge uses service role to read app_users / customer_saved_addresses under RLS. */
export const isSupabaseServiceRoleConfigured = Boolean(supabaseServiceKey);

/**
 * Stable secret for signing ephemeral signup tickets (utils/signupTicket.ts) — derived
 * from the service role key rather than its own env var, so it's guaranteed identical
 * across every serverless instance (the key is already mandatory config; no new secret
 * to provision). Never expose this value directly — only the HMAC digest below.
 */
export const signupTicketSigningSecret = crypto
  .createHmac('sha256', supabaseServiceKey || supabaseAnonKey)
  .update('signup-ticket-v1')
  .digest('hex');

export default supabase;
