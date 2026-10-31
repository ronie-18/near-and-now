import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { fetchJsonWithTimeout, UPSTREAM_TIMEOUTS_MS } from '../utils/fetchWithTimeout.js';
import { RazorpayApiError } from './payment.service.js';

/**
 * Store payouts by bank transfer through RazorpayX (2026-10-28). See
 * supabase/migrations/20261028020000_store_payouts_razorpayx.sql for the
 * tables and the overall flow. Nothing here runs unless
 * STORE_PAYOUTS_ENABLED=true and RAZORPAYX_ACCOUNT_NUMBER is set, and no
 * money moves without an admin explicitly sending a prepared batch.
 *
 * Env:
 *   STORE_PAYOUTS_ENABLED      'true' to switch on
 *   RAZORPAYX_ACCOUNT_NUMBER   the RazorpayX account payouts are sent from
 *   RAZORPAYX_KEY_ID/SECRET    optional; default to RAZORPAY_KEY_ID/SECRET
 *   RAZORPAYX_WEBHOOK_SECRET   optional; when RazorpayX webhooks use their own secret
 *   STORE_COMMISSION_PERCENT   platform commission taken off store earnings (default 0)
 *   STORE_PAYOUT_HOLD_HOURS    only orders delivered at least this long ago (default 24)
 *   STORE_PAYOUT_MODE          IMPS (default) | NEFT | RTGS
 */

const BASE_URL = 'https://api.razorpay.com/v1';
const VALIDATION_AMOUNT_PAISE = 100; // penny drop
const PAYOUT_MODES = new Set(['IMPS', 'NEFT', 'RTGS']);

export function storePayoutsConfig() {
  const commission = Number(process.env.STORE_COMMISSION_PERCENT);
  const hold = Number(process.env.STORE_PAYOUT_HOLD_HOURS);
  const mode = String(process.env.STORE_PAYOUT_MODE || 'IMPS').toUpperCase();
  return {
    enabled: process.env.STORE_PAYOUTS_ENABLED === 'true',
    accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER || '',
    keyId: process.env.RAZORPAYX_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAYX_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
    commissionPercent: Number.isFinite(commission) && commission >= 0 && commission < 100 ? commission : 0,
    holdHours: Number.isFinite(hold) && hold >= 0 ? hold : 24,
    mode: PAYOUT_MODES.has(mode) ? mode : 'IMPS',
  };
}

/** Why payouts can't run right now, or null when they can. */
export function payoutsBlockedReason(): string | null {
  const cfg = storePayoutsConfig();
  if (!cfg.enabled) return 'Store payouts are not enabled (STORE_PAYOUTS_ENABLED).';
  if (!cfg.accountNumber) return 'RAZORPAYX_ACCOUNT_NUMBER is not set.';
  if (!cfg.keyId || !cfg.keySecret) return 'RazorpayX API keys are not set.';
  return null;
}

/** An error the admin can act on; the controller answers it with `status`. */
export class PayoutError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = 'PayoutError';
  }
}

function assertReady() {
  const reason = payoutsBlockedReason();
  if (reason) throw new PayoutError(reason, 503);
}

function razorpayX(method: string, path: string, body?: object, idempotencyKey?: string) {
  const cfg = storePayoutsConfig();
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['X-Payout-Idempotency'] = idempotencyKey;
  return fetchJsonWithTimeout<any>('RazorpayX', `${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }, UPSTREAM_TIMEOUTS_MS.razorpay).then(({ response, json }) => {
    if (!response.ok) throw new RazorpayApiError(json?.error?.description || 'RazorpayX API error');
    return json;
  });
}

// ── Bank account registration + penny-drop validation ─────────────────────

export type PayoutAccount = {
  store_id: string;
  razorpayx_contact_id: string;
  razorpayx_fund_account_id: string;
  bank_fingerprint: string;
  account_last4: string;
  ifsc: string;
  holder_name: string;
  validation_id: string | null;
  validation_status: 'pending' | 'verified' | 'name_mismatch' | 'failed';
  validated_name: string | null;
  validated_at: string | null;
  failure_reason: string | null;
  name_accepted_by: string | null;
};

type StoreBank = {
  id: string;
  name: string | null;
  phone: string | null;
  owner_id: string | null;
  bank_account_number: string | null;
  bank_ifsc_code: string | null;
  bank_account_holder_name: string | null;
};

export function bankFingerprint(accountNumber: string, ifsc: string, holderName: string): string {
  return crypto.createHash('sha256').update(`${accountNumber.trim()}|${ifsc.trim().toUpperCase()}|${holderName.trim().toUpperCase()}`).digest('hex');
}

/** The approved bank fields still missing before a store can be registered. */
export function missingBankFields(store: Pick<StoreBank, 'bank_account_number' | 'bank_ifsc_code' | 'bank_account_holder_name'>): string[] {
  const missing: string[] = [];
  if (!store.bank_account_holder_name) missing.push('account holder name');
  if (!store.bank_account_number) missing.push('account number');
  if (!store.bank_ifsc_code) missing.push('IFSC');
  return missing;
}

const NAME_TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SRI', 'SMT', 'KUMARI', 'M', 'S']);
const nameTokens = (name: string) =>
  name.toUpperCase().replace(/[^A-Z]+/g, ' ').trim().split(' ').filter((t) => t && !NAME_TITLES.has(t));

/**
 * Whether the name the bank returned is the holder name the store gave, allowing
 * for missing middle names and initials ("R K DAS" ≈ "Ramesh Kumar Das").
 * Every word of the shorter name must match a different word of the longer one.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  return short.every((t) => {
    const i = long.findIndex((u, idx) =>
      !used.has(idx) && (u === t || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u)))
    );
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

async function loadStoreBank(storeId: string): Promise<StoreBank> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id, name, phone, owner_id, bank_account_number, bank_ifsc_code, bank_account_holder_name')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PayoutError('Store not found', 404);
  return data as StoreBank;
}

export async function getPayoutAccount(storeId: string): Promise<PayoutAccount | null> {
  const { data, error } = await supabaseAdmin.from('store_payout_accounts').select('*').eq('store_id', storeId).maybeSingle();
  if (error) throw error;
  return (data as PayoutAccount | null) ?? null;
}

/**
 * Registers the store's approved bank details with RazorpayX (contact + bank
 * fund account) and starts a penny-drop validation. Re-registering after the
 * details changed creates a new fund account and retires the old one.
 */
export async function registerStoreBankAccount(storeId: string, adminId: string | undefined): Promise<PayoutAccount> {
  assertReady();
  const store = await loadStoreBank(storeId);
  const missing = missingBankFields(store);
  if (missing.length) throw new PayoutError(`The store's approved bank details are missing: ${missing.join(', ')}.`, 400);

  const account = store.bank_account_number!.trim();
  const ifsc = store.bank_ifsc_code!.trim().toUpperCase();
  const holder = store.bank_account_holder_name!.trim();
  const fingerprint = bankFingerprint(account, ifsc, holder);
  const existing = await getPayoutAccount(storeId);
  if (existing && existing.bank_fingerprint === fingerprint && existing.validation_status !== 'failed') {
    return existing; // already registered with these exact details
  }

  let contactId = existing?.razorpayx_contact_id;
  if (!contactId) {
    const { data: owner } = store.owner_id
      ? await supabaseAdmin.from('app_users').select('email').eq('id', store.owner_id).maybeSingle()
      : { data: null };
    const contact = await razorpayX('POST', '/contacts', {
      name: (store.name || holder).slice(0, 50),
      type: 'vendor',
      reference_id: storeId,
      ...(owner?.email ? { email: owner.email } : {}),
      ...(store.phone ? { contact: store.phone } : {}),
      notes: { store_id: storeId },
    });
    contactId = String(contact.id);
  }

  const fundAccount = await razorpayX('POST', '/fund_accounts', {
    contact_id: contactId,
    account_type: 'bank_account',
    bank_account: { name: holder, ifsc, account_number: account },
  });
  const fundAccountId = String(fundAccount.id);
  if (existing?.razorpayx_fund_account_id && existing.razorpayx_fund_account_id !== fundAccountId) {
    try {
      await razorpayX('PATCH', `/fund_accounts/${existing.razorpayx_fund_account_id}`, { active: false });
    } catch (err) {
      console.warn('[PAYOUTS] could not deactivate the old fund account (ignored)', { storeId, error: (err as Error).message });
    }
  }

  const validation = await razorpayX('POST', '/fund_accounts/validations', {
    account_number: storePayoutsConfig().accountNumber,
    fund_account: { id: fundAccountId },
    amount: VALIDATION_AMOUNT_PAISE,
    currency: 'INR',
    notes: { store_id: storeId },
  });

  const now = new Date().toISOString();
  const row = {
    store_id: storeId,
    razorpayx_contact_id: contactId,
    razorpayx_fund_account_id: fundAccountId,
    bank_fingerprint: fingerprint,
    account_last4: account.slice(-4),
    ifsc,
    holder_name: holder,
    validation_id: String(validation.id),
    validation_status: 'pending' as const,
    validated_name: null,
    validated_at: null,
    failure_reason: null,
    name_accepted_by: null,
    registered_by: adminId ?? null,
    updated_at: now,
  };
  const { data: saved, error } = await supabaseAdmin.from('store_payout_accounts').upsert(row, { onConflict: 'store_id' }).select('*').single();
  if (error) throw error;

  // Small validations often complete synchronously.
  if (validation.status && validation.status !== 'created') {
    return (await applyValidationResult(validation)) ?? (saved as PayoutAccount);
  }
  return saved as PayoutAccount;
}

/** Books a fund-account validation result (webhook or refresh). */
export async function applyValidationResult(validation: any): Promise<PayoutAccount | null> {
  const validationId = String(validation?.id || '');
  if (!validationId) return null;
  const { data: account, error } = await supabaseAdmin
    .from('store_payout_accounts')
    .select('*')
    .eq('validation_id', validationId)
    .maybeSingle();
  if (error) throw error;
  if (!account) {
    console.warn('[PAYOUTS] validation result for an unknown/replaced registration', { validationId });
    return null;
  }
  const acct = account as PayoutAccount;
  const status = String(validation.status || '');
  if (status !== 'completed' && status !== 'failed') return acct; // still running

  const registeredName: string | null = validation.results?.registered_name ?? null;
  const accountActive = status === 'completed' && validation.results?.account_status === 'active';
  let next: PayoutAccount['validation_status'];
  let reason: string | null = null;
  if (!accountActive) {
    next = 'failed';
    reason = status === 'failed' ? 'The bank could not validate this account.' : `Account status: ${validation.results?.account_status ?? 'unknown'}`;
  } else if (registeredName && !namesMatch(registeredName, acct.holder_name)) {
    next = 'name_mismatch';
    reason = `The bank has "${registeredName}" on this account.`;
  } else {
    next = 'verified';
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('store_payout_accounts')
    .update({
      validation_status: next,
      validated_name: registeredName,
      validated_at: new Date().toISOString(),
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', acct.store_id)
    .eq('validation_id', validationId)
    .eq('validation_status', 'pending')
    .select('*');
  if (updateErr) throw updateErr;
  return (updated?.[0] as PayoutAccount | undefined) ?? (await getPayoutAccount(acct.store_id));
}

export async function refreshValidation(storeId: string): Promise<PayoutAccount> {
  assertReady();
  const account = await getPayoutAccount(storeId);
  if (!account?.validation_id) throw new PayoutError('This store has not been registered yet.', 404);
  if (account.validation_status !== 'pending') return account;
  const validation = await razorpayX('GET', `/fund_accounts/validations/${account.validation_id}`);
  return (await applyValidationResult(validation)) ?? account;
}

/** An admin checked the passbook and accepts the bank's spelling of the name. */
export async function acceptValidatedName(storeId: string, adminId: string | undefined): Promise<PayoutAccount> {
  const { data, error } = await supabaseAdmin
    .from('store_payout_accounts')
    .update({ validation_status: 'verified', name_accepted_by: adminId ?? null, failure_reason: null, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('validation_status', 'name_mismatch')
    .select('*');
  if (error) throw error;
  if (!data?.length) throw new PayoutError('There is no name mismatch to accept for this store.');
  return data[0] as PayoutAccount;
}

// ── Batches ─────────────────────────────────────────────────────────────────

export type PayoutBatch = {
  id: string;
  store_id: string;
  amount: number | string;
  gross_amount: number | string;
  commission_amount: number | string;
  commission_percent: number | string;
  line_count: number;
  status: 'draft' | 'processing' | 'processed' | 'failed' | 'reversed' | 'cancelled';
  razorpayx_fund_account_id: string | null;
  razorpayx_payout_id: string | null;
  razorpayx_status: string | null;
  mode: string | null;
  utr: string | null;
  failure_reason: string | null;
  send_attempts: number;
  created_at: string;
  approved_at: string | null;
  processed_at: string | null;
};

export async function getBatch(batchId: string): Promise<PayoutBatch> {
  const { data, error } = await supabaseAdmin.from('store_payout_batches').select('*').eq('id', batchId).maybeSingle();
  if (error) throw error;
  if (!data) throw new PayoutError('Payout batch not found', 404);
  return data as PayoutBatch;
}

/**
 * Drafts one batch per verified store with everything delivered (and past
 * the hold period) that hasn't been paid yet. Moves no money.
 */
export async function prepareBatches(storeIds: string[] | undefined, adminId: string | undefined) {
  assertReady();
  const cfg = storePayoutsConfig();
  let query = supabaseAdmin.from('store_payout_accounts').select('store_id').eq('validation_status', 'verified');
  if (storeIds?.length) query = query.in('store_id', storeIds);
  const { data: accounts, error } = await query;
  if (error) throw error;

  const deliveredBefore = new Date(Date.now() - cfg.holdHours * 3600_000).toISOString();
  // Stores are independent (the function locks per store), so they run together.
  const results = await Promise.all(((accounts || []) as Array<{ store_id: string }>).map(async ({ store_id }) => {
    const { data: batch, error: rpcErr } = await supabaseAdmin.rpc('prepare_store_payout_batch', {
      p_store_id: store_id,
      p_delivered_before: deliveredBefore,
      p_commission_percent: cfg.commissionPercent,
      p_created_by: adminId ?? null,
    });
    if (rpcErr) {
      if (String((rpcErr as { message?: string }).message || '').includes('BATCH_ALREADY_OPEN')) {
        return { store_id, skipped: 'A payout for this store is already prepared or in progress.' };
      }
      throw rpcErr;
    }
    // A plpgsql function returning a NULL composite comes back as all-null fields.
    if (batch && (batch as PayoutBatch).id) return { store_id, batch: batch as PayoutBatch };
    return { store_id, skipped: 'Nothing delivered and unpaid yet.' };
  }));
  const created = results.flatMap((r) => ('batch' in r && r.batch ? [r.batch] : []));
  const skipped = results.flatMap((r) => ('skipped' in r && r.skipped ? [{ store_id: r.store_id, reason: r.skipped }] : []));
  return { created, skipped, delivered_before: deliveredBefore };
}

const LIVE_PAYOUT_STATUSES = new Set(['queued', 'pending', 'scheduled', 'processing', 'processed']);

/** A payout an earlier, interrupted send may already have created. */
async function findExistingPayout(batchId: string): Promise<any | null> {
  const list = await razorpayX('GET', `/payouts?account_number=${encodeURIComponent(storePayoutsConfig().accountNumber)}&reference_id=${encodeURIComponent(batchId)}`);
  const items: any[] = Array.isArray(list?.items) ? list.items : [];
  return items.find((p) => p?.reference_id === batchId && LIVE_PAYOUT_STATUSES.has(String(p.status))) ?? null;
}

async function releaseLines(batchId: string) {
  // Back to the pool: the next prepared batch picks these orders up again.
  const { error } = await supabaseAdmin.from('store_payouts').delete().eq('payout_batch_id', batchId);
  if (error) throw error;
}

/**
 * Approves and sends a draft batch as one RazorpayX payout. The batch id is
 * both the idempotency key and the payout's reference_id; a batch that was
 * sent before (attempt interrupted) first adopts any payout already created
 * for it, so a retry can never pay twice.
 */
export async function sendBatch(batchId: string, adminId: string | undefined): Promise<PayoutBatch> {
  assertReady();
  const cfg = storePayoutsConfig();
  const batch = await getBatch(batchId);
  if (batch.status !== 'draft') throw new PayoutError(`This payout is already ${batch.status}.`);

  const [account, store] = await Promise.all([getPayoutAccount(batch.store_id), loadStoreBank(batch.store_id)]);
  if (!account || account.validation_status !== 'verified') {
    throw new PayoutError("The store's bank account is not verified yet.");
  }
  if (missingBankFields(store).length || bankFingerprint(store.bank_account_number!, store.bank_ifsc_code!, store.bank_account_holder_name!) !== account.bank_fingerprint) {
    throw new PayoutError("The store's bank details changed since they were verified — register them again first.");
  }

  // Claim the draft (two admins clicking Send at once: exactly one wins).
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('store_payout_batches')
    .update({
      status: 'processing',
      approved_by: adminId ?? null,
      approved_at: new Date().toISOString(),
      razorpayx_fund_account_id: account.razorpayx_fund_account_id,
      mode: cfg.mode,
      send_attempts: batch.send_attempts + 1,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('status', 'draft')
    .eq('send_attempts', batch.send_attempts)
    .select('*');
  if (claimErr) throw claimErr;
  if (!claimed?.length) throw new PayoutError('This payout was just sent by someone else.');

  try {
    const earlier = batch.send_attempts > 0 ? await findExistingPayout(batchId) : null;
    const payout = earlier ?? await razorpayX('POST', '/payouts', {
      account_number: cfg.accountNumber,
      fund_account_id: account.razorpayx_fund_account_id,
      amount: Math.round(Number(batch.amount) * 100),
      currency: 'INR',
      mode: cfg.mode,
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: batchId,
      narration: 'Near and Now payout',
      notes: { store_id: batch.store_id, batch_id: batchId },
    }, batchId);
    return (await applyPayoutUpdate(payout)) ?? (await getBatch(batchId));
  } catch (err) {
    // Back to draft so it can be retried — safely, see findExistingPayout.
    await supabaseAdmin
      .from('store_payout_batches')
      .update({ status: 'draft', failure_reason: (err as Error).message?.slice(0, 500) || 'Send failed', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('status', 'processing')
      .is('razorpayx_payout_id', null);
    throw err;
  }
}

/** Cancels a draft that was never sent (or whose sends never reached RazorpayX). */
export async function cancelBatch(batchId: string): Promise<PayoutBatch> {
  const batch = await getBatch(batchId);
  if (batch.status !== 'draft') throw new PayoutError(`Only a prepared payout can be cancelled; this one is ${batch.status}.`);
  if (batch.send_attempts > 0) {
    assertReady();
    const earlier = await findExistingPayout(batchId);
    if (earlier) {
      await applyPayoutUpdate(earlier);
      throw new PayoutError('RazorpayX already has this payout — it cannot be cancelled here.');
    }
  }
  const { data, error } = await supabaseAdmin
    .from('store_payout_batches')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('status', 'draft')
    .select('*');
  if (error) throw error;
  if (!data?.length) throw new PayoutError('This payout changed meanwhile — refresh and try again.');
  await releaseLines(batchId);
  return data[0] as PayoutBatch;
}

/** Re-reads the payout from RazorpayX (when webhooks are late or not set up). */
export async function refreshBatch(batchId: string): Promise<PayoutBatch> {
  assertReady();
  const batch = await getBatch(batchId);
  if (batch.razorpayx_payout_id) {
    const payout = await razorpayX('GET', `/payouts/${batch.razorpayx_payout_id}`);
    return (await applyPayoutUpdate(payout)) ?? batch;
  }
  if (batch.send_attempts > 0) {
    const earlier = await findExistingPayout(batchId);
    if (earlier) return (await applyPayoutUpdate(earlier)) ?? batch;
  }
  return batch;
}

function mapPayoutStatus(status: string): PayoutBatch['status'] | null {
  if (status === 'processed') return 'processed';
  if (status === 'reversed') return 'reversed';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'failed';
  if (LIVE_PAYOUT_STATUSES.has(status)) return 'processing';
  return null;
}

// Which batch states a payout update may move a batch out of.
const ALLOWED_FROM: Record<PayoutBatch['status'], ReadonlyArray<PayoutBatch['status']>> = {
  processing: ['draft', 'processing'],
  processed: ['draft', 'processing'],
  failed: ['draft', 'processing'],
  reversed: ['draft', 'processing', 'processed'],
  draft: [],
  cancelled: [],
};

/**
 * Books a RazorpayX payout's state onto its batch (webhook, send, refresh).
 * The batch comes from the payout's reference_id, which only sendBatch sets.
 */
export async function applyPayoutUpdate(payout: any): Promise<PayoutBatch | null> {
  const batchId: string = payout?.reference_id || payout?.notes?.batch_id || '';
  const status = String(payout?.status || '');
  if (!batchId || !payout?.id) return null;

  const { data: row, error } = await supabaseAdmin.from('store_payout_batches').select('*').eq('id', batchId).maybeSingle();
  if (error) throw error;
  if (!row) {
    console.warn('[PAYOUTS] payout update for an unknown batch', { batchId, payoutId: payout.id, status });
    return null;
  }
  const batch = row as PayoutBatch;
  if (batch.razorpayx_payout_id && batch.razorpayx_payout_id !== payout.id) {
    console.error('CRITICAL [PAYOUTS] a second RazorpayX payout exists for one batch', { batchId, known: batch.razorpayx_payout_id, other: payout.id });
    await supabaseAdmin.from('admin_notifications').insert({
      type: 'store_payout_review',
      title: 'Duplicate store payout',
      message: `Payout batch ${batchId} has a second RazorpayX payout (${payout.id}) besides ${batch.razorpayx_payout_id}. Check RazorpayX.`,
      data: { batch_id: batchId, payout_id: payout.id, known_payout_id: batch.razorpayx_payout_id },
    });
    return batch;
  }

  const next = mapPayoutStatus(status);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { razorpayx_payout_id: payout.id, razorpayx_status: status, updated_at: now };
  if (payout.utr) patch.utr = payout.utr;
  const reason = payout.failure_reason || payout.status_details?.description;
  if (next && next !== batch.status && ALLOWED_FROM[next].includes(batch.status)) {
    patch.status = next;
    if (next === 'processed') patch.processed_at = now;
    if (next === 'failed' || next === 'reversed') patch.failure_reason = String(reason || status).slice(0, 500);
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('store_payout_batches')
    .update(patch)
    .eq('id', batchId)
    .eq('status', batch.status)
    .select('*');
  if (updateErr) throw updateErr;
  if (!updated?.length) return getBatch(batchId); // moved on concurrently; the later update wins

  const moved = patch.status as PayoutBatch['status'] | undefined;
  if (moved === 'processed') {
    const { error: linesErr } = await supabaseAdmin
      .from('store_payouts')
      .update({ status: 'paid', paid_at: now, updated_at: now })
      .eq('payout_batch_id', batchId);
    if (linesErr) throw linesErr;
  } else if (moved === 'failed' || moved === 'reversed') {
    await releaseLines(batchId);
    await supabaseAdmin.from('admin_notifications').insert({
      type: 'store_payout_review',
      title: moved === 'reversed' ? 'Store payout reversed' : 'Store payout failed',
      message: `₹${Number(batch.amount).toFixed(2)} to store ${batch.store_id} ${moved}: ${patch.failure_reason}. Its orders are back in the next payout.`,
      data: { batch_id: batchId, store_id: batch.store_id, payout_id: payout.id, status },
    });
  }
  return updated[0] as PayoutBatch;
}

/** RazorpayX webhooks (payout.* and fund_account.validation.*), from processWebhookEvent. */
export async function handleRazorpayXWebhook(event: any, eventId: string): Promise<void> {
  const type = String(event?.event || '');
  if (type.startsWith('payout.')) {
    const payout = event?.payload?.payout?.entity;
    const batch = await applyPayoutUpdate(payout);
    console.log('[PAYOUTS] webhook', { eventId, type, payoutId: payout?.id, batchId: batch?.id ?? null, batchStatus: batch?.status ?? null });
    return;
  }
  if (type.startsWith('fund_account.validation.')) {
    const payload = event?.payload || {};
    const validation =
      payload['fund_account.validation']?.entity ??
      Object.values(payload).map((v: any) => v?.entity).find((e: any) => String(e?.id || '').startsWith('fav_'));
    const account = await applyValidationResult(validation);
    console.log('[PAYOUTS] validation webhook', { eventId, type, storeId: account?.store_id ?? null, status: account?.validation_status ?? null });
  }
}

// ── Read models ─────────────────────────────────────────────────────────────

/** Admin page: every approved store's payout readiness, plus recent batches. */
export async function listForAdmin() {
  const cfg = storePayoutsConfig();
  const [{ data: stores, error: storesErr }, { data: accounts, error: accErr }, { data: batches, error: batchErr }] = await Promise.all([
    supabaseAdmin
      .from('stores')
      .select('id, name, bank_account_number, bank_ifsc_code, bank_account_holder_name')
      .eq('is_approved', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabaseAdmin.from('store_payout_accounts').select('*'),
    supabaseAdmin.from('store_payout_batches')
      .select('id, store_id, amount, gross_amount, commission_amount, line_count, status, razorpayx_status, mode, utr, failure_reason, send_attempts, created_at, approved_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (storesErr) throw storesErr;
  if (accErr) throw accErr;
  if (batchErr) throw batchErr;

  const accountByStore = new Map(((accounts || []) as PayoutAccount[]).map((a) => [a.store_id, a]));
  const nameByStore = new Map(((stores || []) as StoreBank[]).map((s) => [s.id, s.name]));
  return {
    enabled: cfg.enabled,
    blocked_reason: payoutsBlockedReason(),
    config: { commission_percent: cfg.commissionPercent, hold_hours: cfg.holdHours, mode: cfg.mode },
    stores: ((stores || []) as StoreBank[]).map((s) => {
      const a = accountByStore.get(s.id);
      const missing = missingBankFields(s);
      return {
        store_id: s.id,
        store_name: s.name,
        missing_bank_fields: missing,
        account: a
          ? {
              status: a.validation_status,
              account_last4: a.account_last4,
              ifsc: a.ifsc,
              holder_name: a.holder_name,
              validated_name: a.validated_name,
              failure_reason: a.failure_reason,
              name_accepted: !!a.name_accepted_by,
              bank_changed: !missing.length && bankFingerprint(s.bank_account_number!, s.bank_ifsc_code!, s.bank_account_holder_name!) !== a.bank_fingerprint,
            }
          : null,
      };
    }),
    batches: ((batches || []) as PayoutBatch[]).map((b) => ({ ...b, store_name: nameByStore.get(b.store_id) ?? null })),
  };
}

/** Shopkeeper app: this store's bank-transfer history. */
export async function listForStore(storeId: string) {
  const [{ data: account }, { data: batches, error }] = await Promise.all([
    supabaseAdmin.from('store_payout_accounts').select('validation_status, account_last4').eq('store_id', storeId).maybeSingle(),
    supabaseAdmin.from('store_payout_batches')
      .select('id, amount, line_count, status, utr, created_at, processed_at')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (error) throw error;
  return {
    enabled: storePayoutsConfig().enabled,
    account: account ? { status: (account as any).validation_status, account_last4: (account as any).account_last4 } : null,
    payouts: (batches || []).map((b: any) => ({
      id: b.id,
      amount: Number(b.amount),
      orders: b.line_count,
      // Shopkeepers see paid / on its way / not paid — not internal states.
      status: b.status === 'processed' ? 'paid' : b.status === 'draft' || b.status === 'processing' ? 'in_progress' : 'failed',
      utr: b.utr,
      created_at: b.created_at,
      paid_at: b.processed_at,
    })),
  };
}
