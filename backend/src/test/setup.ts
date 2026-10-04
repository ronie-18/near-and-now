/**
 * Minimal Supabase env so `config/database` can load during tests.
 *
 * The service-role value must parse as a JWT whose payload role is
 * `service_role`: config/database.ts replaces `supabaseAdmin` with a client
 * that throws on first use when the key is missing or malformed, which made
 * every fake-Supabase test fail on a machine without a real backend/.env
 * (the previous placeholder 'test-service-role-key' is not a JWT).
 * Header/signature are not verified locally, so they can be anything.
 */
const fakeServiceRoleJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test-signature`;

process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= fakeServiceRoleJwt;
