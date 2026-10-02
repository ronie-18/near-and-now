/**
 * Live GSTIN verification against the GST registry, through a paid provider
 * (2026-10-02). Provider: AppyFlow (`APPYFLOW_KEY_SECRET`). Written so another
 * provider (e.g. Cashfree) can be added as a second lookup function.
 *
 * Order of checks, cheapest first:
 *  1. Offline format + check character (utils/gstin.ts) — free. A mistyped
 *     number never costs a paid lookup.
 *  2. In-memory cache — a GSTIN already looked up recently isn't paid for
 *     again (per server instance; cleared on restart).
 *  3. The provider, with a hard deadline (fetchWithTimeout).
 *
 * Results:
 *  - 'active'      registered and Active — safe to print on a tax invoice.
 *  - 'inactive'    registered but Cancelled / Suspended / etc.
 *  - 'not_found'   the registry doesn't know this GSTIN.
 *  - 'invalid'     failed the offline check (never sent to the provider).
 *  - 'unavailable' couldn't verify: no key configured, provider down, out of
 *                  credits. Callers must NOT treat this as a rejection —
 *                  checkout is never blocked because the provider is down.
 */
import { fetchJsonWithTimeout, UPSTREAM_TIMEOUTS_MS } from '../utils/fetchWithTimeout.js';
import { gstinHint, isValidGstin, normalizeGstin } from '../utils/gstin.js';

export type GstinVerification =
  | { result: 'active'; gstin: string; legalName: string; tradeName: string; registryStatus: string; stateName: string }
  | { result: 'inactive'; gstin: string; legalName: string; registryStatus: string }
  | { result: 'not_found'; gstin: string; message: string }
  | { result: 'invalid'; gstin: string; message: string }
  | { result: 'unavailable'; gstin: string; reason: string };

const APPYFLOW_URL = 'https://appyflow.in/api/verifyGST';

/** Exported for tests. Active results are stable; negative ones are re-checked sooner. */
export const GSTIN_CACHE_TTL_MS = { active: 24 * 60 * 60 * 1000, negative: 6 * 60 * 60 * 1000 };

const cache = new Map<string, { value: GstinVerification; expiresAt: number }>();
const inflight = new Map<string, Promise<GstinVerification>>();

/** Tests only. */
export function clearGstinVerificationCache(): void {
  cache.clear();
  inflight.clear();
}

export function isGstVerificationConfigured(): boolean {
  return Boolean(process.env.APPYFLOW_KEY_SECRET?.trim());
}

// A provider-side problem (bad/expired key, no credits, throttled) is
// "couldn't verify", not "this GSTIN is fake" — never reject a customer for it.
const PROVIDER_PROBLEM = /key|secret|credit|balance|recharge|unauthori[sz]ed|authenticat|forbidden|limit|expired|plan|subscription|quota/i;

// Only a message that clearly says the registry has no such GSTIN counts as
// 'not_found'. Anything else — including wording never seen before — is
// 'unavailable', so an unexpected error can never refuse a genuine customer.
// (Was the reverse — any error not matching PROVIDER_PROBLEM meant
// 'not_found' — fixed 2026-10-02 after the first live test.)
const NOT_FOUND = /not\s*found|no\s*(record|data|detail|result)s?|does\s*n[o']?t\s*exist|not\s*registered|invalid\s*gst(in)?\b|not\s*(a\s*)?valid\s*gst/i;

type AppyflowResponse = {
  error?: boolean;
  message?: string;
  taxpayerInfo?: {
    gstin?: string;
    lgnm?: string;
    tradeNam?: string;
    sts?: string;
    pradr?: { addr?: { stcd?: string }; stcd?: string };
  };
};

async function lookupAppyflow(gstin: string, keySecret: string): Promise<GstinVerification> {
  let json: AppyflowResponse;
  let ok: boolean;
  try {
    // POST with a JSON body (not ?key_secret= in the URL), so the key never
    // ends up in a URL, proxy log or error message.
    const { response, json: body } = await fetchJsonWithTimeout<AppyflowResponse>(
      'AppyFlow GST',
      APPYFLOW_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gstNo: gstin, key_secret: keySecret }) },
      UPSTREAM_TIMEOUTS_MS.google // same interactive-lookup budget (8 s)
    );
    json = body ?? {};
    ok = response.ok;
  } catch (err) {
    return { result: 'unavailable', gstin, reason: err instanceof Error ? err.message : 'request failed' };
  }

  const info = json.taxpayerInfo;
  // The record must be for the GSTIN we asked about. Found in the first live
  // test (2026-10-02): AppyFlow answered two different GSTINs with its own
  // sample record (03DOXPM4071K1ZE, "DISHANT MAHAJAN" / "AppyFlow
  // Technologies") — a demo/trial-mode response. Accepting it would have
  // marked any GSTIN Active and replaced the customer's business name on
  // their tax invoice with someone else's. A missing or different GSTIN is
  // "couldn't verify", never a result.
  if (info && (info.gstin || info.lgnm || info.sts)) {
    const returned = normalizeGstin(info.gstin ?? '');
    if (returned !== gstin) {
      console.warn('[gstVerification] AppyFlow returned a record for a different GSTIN — ignoring it', {
        asked: gstin,
        returned: returned || '(none)',
      });
      return { result: 'unavailable', gstin, reason: 'provider returned a record for a different GSTIN (sample/trial response?)' };
    }
    const registryStatus = String(info.sts || '').trim();
    const legalName = String(info.lgnm || '').trim();
    if (registryStatus.toLowerCase() === 'active') {
      return {
        result: 'active',
        gstin,
        legalName,
        tradeName: String(info.tradeNam || '').trim(),
        registryStatus,
        stateName: String(info.pradr?.addr?.stcd ?? info.pradr?.stcd ?? '').trim(),
      };
    }
    return { result: 'inactive', gstin, legalName, registryStatus: registryStatus || 'Not active' };
  }

  const message = String(json.message || '').trim();
  if (ok && json.error && !PROVIDER_PROBLEM.test(message) && NOT_FOUND.test(message)) {
    return { result: 'not_found', gstin, message };
  }
  console.warn('[gstVerification] AppyFlow could not verify', { gstin, httpOk: ok, message: message || '(none)' });
  return { result: 'unavailable', gstin, reason: message || 'unexpected provider response' };
}

/** Verify a GSTIN. Never throws. */
export async function verifyGstin(raw: string): Promise<GstinVerification> {
  const gstin = normalizeGstin(raw);
  if (!isValidGstin(gstin)) return { result: 'invalid', gstin, message: gstinHint(gstin) ?? 'Invalid GSTIN' };

  const keySecret = process.env.APPYFLOW_KEY_SECRET?.trim();
  if (!keySecret) return { result: 'unavailable', gstin, reason: 'GST verification is not configured (APPYFLOW_KEY_SECRET unset)' };

  const hit = cache.get(gstin);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const pending = inflight.get(gstin);
  if (pending) return pending;

  const request = lookupAppyflow(gstin, keySecret)
    .then((value) => {
      // 'unavailable' is never cached — the next attempt should retry.
      if (value.result !== 'unavailable') {
        const ttl = value.result === 'active' ? GSTIN_CACHE_TTL_MS.active : GSTIN_CACHE_TTL_MS.negative;
        cache.set(gstin, { value, expiresAt: Date.now() + ttl });
      }
      return value;
    })
    .finally(() => inflight.delete(gstin));
  inflight.set(gstin, request);
  return request;
}

/** One-line, customer-facing explanation for a rejected GSTIN, or null if it's acceptable. */
export function gstinRejectionMessage(v: GstinVerification): string | null {
  switch (v.result) {
    case 'inactive':
      return `This GSTIN is ${v.registryStatus.toLowerCase()} on the GST portal, so it can't be used for a GST invoice.`;
    case 'not_found':
      return "This GSTIN isn't registered on the GST portal. Please check the number.";
    case 'invalid':
      return v.message;
    default:
      return null; // 'active' is accepted; 'unavailable' must never block checkout
  }
}
