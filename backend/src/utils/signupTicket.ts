import crypto from 'crypto';
import { signupTicketSigningSecret } from '../config/database.js';

/**
 * Proof that a phone number completed OTP verification for a specific signup
 * role (shopkeeper / delivery_partner), before `signup/complete` is allowed
 * to create the account. Closes the gap where signup/complete previously
 * trusted the phone number in the request body with no proof OTP ran.
 *
 * Self-contained/signed (HMAC), not stored in the DB. Signed with a secret
 * derived from SUPABASE_SERVICE_ROLE_KEY (see config/database.ts) rather than
 * a per-process random value or a dedicated env var — the backend runs on
 * Vercel's serverless platform, so the OTP-verify request that creates a
 * ticket and the signup/complete request that verifies it routinely land on
 * different cold-started instances. Deriving from the service role key (which
 * every instance already has, identically, or the backend can't function at
 * all) makes the secret stable across instances with no new config to set.
 */

const TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type SignupTicketRole = 'shopkeeper' | 'delivery_partner';

function sign(payload: string): string {
  return crypto.createHmac('sha256', signupTicketSigningSecret).update(payload).digest('hex');
}

export function createSignupTicket(phone: string, role: SignupTicketRole): string {
  const payload = JSON.stringify({ phone: String(phone).trim(), role, exp: Date.now() + TICKET_TTL_MS });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySignupTicket(ticket: unknown, phone: string, role: SignupTicketRole): boolean {
  if (!ticket || typeof ticket !== 'string') return false;
  const [encodedPayload, signature] = ticket.split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = sign(encodedPayload);
  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  let parsed: { phone: string; role: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (Date.now() > parsed.exp) return false;
  if (parsed.role !== role) return false;
  if (parsed.phone !== String(phone).trim()) return false;

  return true;
}
