import crypto from 'crypto';

/**
 * Proof that a phone number completed OTP verification for a specific signup
 * role (shopkeeper / delivery_partner), before `signup/complete` is allowed
 * to create the account. Closes the gap where signup/complete previously
 * trusted the phone number in the request body with no proof OTP ran.
 *
 * Self-contained/signed (HMAC), not stored in the DB — it only needs to
 * survive the few minutes between OTP verification and the signup form
 * being submitted, so a per-process secret is sufficient (single backend
 * instance; falls back to env var if ever run behind multiple instances).
 */

const SECRET = process.env.SIGNUP_TICKET_SECRET || crypto.randomBytes(32).toString('hex');
const TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type SignupTicketRole = 'shopkeeper' | 'delivery_partner';

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
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
