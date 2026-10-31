/**
 * RazorpayX store payouts (2026-10-28): bank registration + penny-drop check,
 * batch preparation, the send path's double-pay protections, payout webhooks
 * and the switched-off default. RazorpayX is a recorded fetch stub — nothing
 * here reaches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { paymentService } from './payment.service.js';
import {
  applyPayoutUpdate,
  applyValidationResult,
  bankFingerprint,
  cancelBatch,
  listForAdmin,
  namesMatch,
  prepareBatches,
  registerStoreBankAccount,
  sendBatch,
} from './storePayouts.service.js';
import { installFakeSupabase, hasFilter, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const ENV_KEYS = ['STORE_PAYOUTS_ENABLED', 'RAZORPAYX_ACCOUNT_NUMBER', 'RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET', 'STORE_COMMISSION_PERCENT', 'STORE_PAYOUT_HOLD_HOURS', 'RAZORPAYX_WEBHOOK_SECRET'] as const;
let savedEnv: Record<string, string | undefined> = {};

type Req = { method: string; path: string; body: any; headers: Record<string, string> };
let requests: Req[] = [];
/** RazorpayX stub: `routes` answers by "METHOD /path" prefix. */
function stubRazorpayX(routes: Record<string, (r: Req) => { status?: number; body: unknown }>) {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = String(url).replace('https://api.razorpay.com/v1', '');
    const r: Req = { method: String(init.method), path, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> };
    requests.push(r);
    const key = Object.keys(routes).find((k) => `${r.method} ${path}`.startsWith(k));
    if (!key) throw new Error(`unexpected RazorpayX call ${r.method} ${path}`);
    const { status = 200, body } = routes[key](r);
    return { ok: status < 400, status, json: async () => body };
  }));
}

const STORE = { id: 's1', name: 'Maa Tara Stores', phone: '+919000000001', owner_id: 'u1', bank_account_number: '123456789012', bank_ifsc_code: 'SBIN0001234', bank_account_holder_name: 'Ramesh Kumar Das' };
const FP = bankFingerprint(STORE.bank_account_number, STORE.bank_ifsc_code, STORE.bank_account_holder_name);
const verifiedAccount = (over: Record<string, unknown> = {}) => ({
  store_id: 's1', razorpayx_contact_id: 'cont_1', razorpayx_fund_account_id: 'fa_1', bank_fingerprint: FP, account_last4: '9012', ifsc: 'SBIN0001234',
  holder_name: 'Ramesh Kumar Das', validation_id: 'fav_1', validation_status: 'verified', validated_name: 'RAMESH K DAS', validated_at: 'x', failure_reason: null, name_accepted_by: null, ...over,
});
const draftBatch = (over: Record<string, unknown> = {}) => ({
  id: 'batch-1', store_id: 's1', amount: 135, gross_amount: 150, commission_amount: 15, commission_percent: 10, line_count: 1, status: 'draft',
  razorpayx_fund_account_id: null, razorpayx_payout_id: null, razorpayx_status: null, mode: null, utr: null, failure_reason: null, send_attempts: 0,
  created_at: 'x', approved_at: null, processed_at: null, ...over,
});

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.STORE_PAYOUTS_ENABLED = 'true';
  process.env.RAZORPAYX_ACCOUNT_NUMBER = '7878780080316316';
  process.env.RAZORPAYX_KEY_ID = 'rzp_test_x';
  process.env.RAZORPAYX_KEY_SECRET = 'xsecret';
  process.env.STORE_COMMISSION_PERCENT = '10';
  process.env.STORE_PAYOUT_HOLD_HOURS = '24';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stubRazorpayX({});
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('namesMatch (bank name vs. holder name)', () => {
  it.each([
    ['RAMESH KUMAR DAS', 'Ramesh Kumar Das', true],
    ['R K DAS', 'Ramesh Kumar Das', true],
    ['MR RAMESH DAS', 'Ramesh Kumar Das', true],
    ['MAA TARA STORES', 'Maa Tara Stores', true],
    ['SURESH DAS', 'Ramesh Kumar Das', false],
    ['', 'Ramesh', false],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(namesMatch(a, b)).toBe(expected);
  });
});

describe('switched off (default)', () => {
  it('refuses every money action with the reason, and touches neither the DB nor RazorpayX', async () => {
    delete process.env.STORE_PAYOUTS_ENABLED;
    const fake = installFakeSupabase(supabaseAdmin);
    await expect(registerStoreBankAccount('s1', 'a1')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('not enabled') });
    await expect(prepareBatches(undefined, 'a1')).rejects.toMatchObject({ status: 503 });
    await expect(sendBatch('batch-1', 'a1')).rejects.toMatchObject({ status: 503 });
    expect(fake.calls).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it('the admin page still loads and says why', async () => {
    delete process.env.STORE_PAYOUTS_ENABLED;
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'stores' ? ok([STORE]) : ok([])));
    const page = await listForAdmin();
    expect(page.enabled).toBe(false);
    expect(page.blocked_reason).toContain('not enabled');
    expect(page.stores[0]).toMatchObject({ store_id: 's1', missing_bank_fields: [], account: null });
  });
});

describe('registerStoreBankAccount', () => {
  it('needs the approved holder name, account number and IFSC first', async () => {
    installFakeSupabase(supabaseAdmin, (c) => (c.table === 'stores' ? ok({ ...STORE, bank_account_holder_name: null }) : undefined));
    await expect(registerStoreBankAccount('s1', 'a1')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('account holder name') });
    expect(requests).toHaveLength(0);
  });

  it('creates contact + bank fund account, starts a ₹1 penny drop from the RazorpayX account, stores only last4', async () => {
    stubRazorpayX({
      'POST /contacts': () => ({ body: { id: 'cont_1' } }),
      'POST /fund_accounts/validations': () => ({ body: { id: 'fav_1', status: 'created' } }),
      'POST /fund_accounts': () => ({ body: { id: 'fa_1' } }),
    });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'stores') return ok(STORE);
      if (c.table === 'app_users') return ok({ email: 'owner@example.com' });
      if (c.table === 'store_payout_accounts' && c.op === 'select') return ok(null);
      if (c.table === 'store_payout_accounts' && c.op === 'upsert') return ok({ ...(c.payload as object) });
      return undefined;
    });

    const account = await registerStoreBankAccount('s1', 'a1');

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /contacts', 'POST /fund_accounts', 'POST /fund_accounts/validations']);
    expect(requests[0].body).toMatchObject({ name: 'Maa Tara Stores', type: 'vendor', reference_id: 's1', email: 'owner@example.com' });
    expect(requests[1].body).toEqual({ contact_id: 'cont_1', account_type: 'bank_account', bank_account: { name: 'Ramesh Kumar Das', ifsc: 'SBIN0001234', account_number: '123456789012' } });
    expect(requests[2].body).toMatchObject({ account_number: '7878780080316316', fund_account: { id: 'fa_1' }, amount: 100 });
    const saved = fake.on('store_payout_accounts', 'upsert')[0].payload as Record<string, unknown>;
    expect(saved).toMatchObject({ store_id: 's1', account_last4: '9012', bank_fingerprint: FP, validation_status: 'pending', validation_id: 'fav_1' });
    expect(JSON.stringify(saved)).not.toContain('123456789012');
    expect(account.validation_status).toBe('pending');
  });

  it('does nothing when the same details are already registered', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'stores') return ok(STORE);
      if (c.table === 'store_payout_accounts') return ok(verifiedAccount());
      return undefined;
    });
    const account = await registerStoreBankAccount('s1', 'a1');
    expect(account.validation_status).toBe('verified');
    expect(requests).toHaveLength(0);
  });
});

describe('applyValidationResult', () => {
  const pending = verifiedAccount({ validation_status: 'pending', validated_name: null });
  const run = async (validation: unknown) => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_payout_accounts' && c.op === 'select') return ok(pending);
      if (c.table === 'store_payout_accounts' && c.op === 'update') return ok([{ ...pending, ...(c.payload as object) }]);
      return undefined;
    });
    await applyValidationResult(validation);
    return fake.on('store_payout_accounts', 'update')[0];
  };

  it('verified when the account is active and the bank name matches', async () => {
    const update = await run({ id: 'fav_1', status: 'completed', results: { account_status: 'active', registered_name: 'R K DAS' } });
    expect(update.payload).toMatchObject({ validation_status: 'verified', validated_name: 'R K DAS' });
    expect(hasFilter(update, 'eq', 'validation_status', 'pending')).toBe(true);
  });

  it('name_mismatch when the bank has someone else', async () => {
    const update = await run({ id: 'fav_1', status: 'completed', results: { account_status: 'active', registered_name: 'SURESH PAUL' } });
    expect(update.payload).toMatchObject({ validation_status: 'name_mismatch', failure_reason: expect.stringContaining('SURESH PAUL') });
  });

  it('failed for an invalid account', async () => {
    const update = await run({ id: 'fav_1', status: 'completed', results: { account_status: 'invalid', registered_name: null } });
    expect(update.payload).toMatchObject({ validation_status: 'failed' });
  });
});

describe('prepareBatches', () => {
  it('asks the database for one batch per verified store with the configured hold and commission', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_payout_accounts') return ok([{ store_id: 's1' }, { store_id: 's2' }, { store_id: 's3' }]);
      if (c.table === 'rpc:prepare_store_payout_batch') {
        const store = (c.payload as { p_store_id: string }).p_store_id;
        if (store === 's1') return ok(draftBatch());
        if (store === 's2') return { data: null, error: { message: 'BATCH_ALREADY_OPEN' } };
        return ok({ id: null, store_id: null }); // NULL composite: nothing to pay
      }
      return undefined;
    });
    const before = Date.now();
    const result = await prepareBatches(undefined, 'a1');

    expect(hasFilter(fake.on('store_payout_accounts')[0], 'eq', 'validation_status', 'verified')).toBe(true);
    const args = fake.on('rpc:prepare_store_payout_batch')[0].payload as Record<string, unknown>;
    expect(args).toMatchObject({ p_store_id: 's1', p_commission_percent: 10, p_created_by: 'a1' });
    expect(Math.abs(before - 24 * 3600_000 - Date.parse(String(args.p_delivered_before)))).toBeLessThan(5000);
    expect(result.created.map((b) => b.id)).toEqual(['batch-1']);
    expect(result.skipped).toEqual([
      { store_id: 's2', reason: expect.stringContaining('already prepared') },
      { store_id: 's3', reason: expect.stringContaining('Nothing') },
    ]);
    expect(requests).toHaveLength(0); // preparing never calls RazorpayX
  });
});

describe('sendBatch', () => {
  function world(batch: Record<string, unknown>, extra: (c: Call) => Result | undefined = () => undefined) {
    let current = { ...batch };
    return installFakeSupabase(supabaseAdmin, (c) => {
      const r = extra(c); if (r) return r;
      if (c.table === 'store_payout_batches' && c.op === 'select') return ok(current);
      if (c.table === 'store_payout_batches' && c.op === 'update') { current = { ...current, ...(c.payload as object) }; return ok([current]); }
      if (c.table === 'store_payout_accounts') return ok(verifiedAccount());
      if (c.table === 'stores') return ok(STORE);
      return undefined;
    });
  }

  it('claims the draft, sends one IMPS payout keyed by the batch id, and books its state', async () => {
    stubRazorpayX({ 'POST /payouts': () => ({ body: { id: 'pout_1', status: 'processing', reference_id: 'batch-1' } }) });
    const fake = world(draftBatch());

    const batch = await sendBatch('batch-1', 'a1');

    const claim = fake.on('store_payout_batches', 'update')[0];
    expect(claim.payload).toMatchObject({ status: 'processing', approved_by: 'a1', send_attempts: 1, razorpayx_fund_account_id: 'fa_1' });
    expect(hasFilter(claim, 'eq', 'status', 'draft')).toBe(true);
    expect(hasFilter(claim, 'eq', 'send_attempts', 0)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers['X-Payout-Idempotency']).toBe('batch-1');
    expect(requests[0].body).toMatchObject({ account_number: '7878780080316316', fund_account_id: 'fa_1', amount: 13500, mode: 'IMPS', reference_id: 'batch-1', queue_if_low_balance: true });
    expect(batch).toMatchObject({ status: 'processing', razorpayx_payout_id: 'pout_1' });
  });

  it('refuses when the store\'s bank details changed after verification', async () => {
    world(draftBatch(), (c) => (c.table === 'stores' ? ok({ ...STORE, bank_account_number: '999999999999' }) : undefined));
    await expect(sendBatch('batch-1', 'a1')).rejects.toMatchObject({ message: expect.stringContaining('changed') });
    expect(requests).toHaveLength(0);
  });

  it('refuses an unverified account', async () => {
    world(draftBatch(), (c) => (c.table === 'store_payout_accounts' ? ok(verifiedAccount({ validation_status: 'name_mismatch' })) : undefined));
    await expect(sendBatch('batch-1', 'a1')).rejects.toMatchObject({ message: expect.stringContaining('not verified') });
    expect(requests).toHaveLength(0);
  });

  it('a retry after an interrupted send adopts the payout RazorpayX already has — never a second POST', async () => {
    stubRazorpayX({ 'GET /payouts?': () => ({ body: { items: [{ id: 'pout_1', status: 'processed', reference_id: 'batch-1', utr: 'UTR123' }] } }) });
    const fake = world(draftBatch({ send_attempts: 1, failure_reason: 'RazorpayX did not respond' }));

    const batch = await sendBatch('batch-1', 'a1');

    expect(requests.map((r) => r.method)).toEqual(['GET']);
    expect(requests[0].path).toContain('reference_id=batch-1');
    expect(batch).toMatchObject({ status: 'processed', razorpayx_payout_id: 'pout_1', utr: 'UTR123' });
    expect(fake.on('store_payouts', 'update')[0].payload).toMatchObject({ status: 'paid' });
  });

  it('puts the batch back to draft when RazorpayX refuses, so it can be retried', async () => {
    stubRazorpayX({ 'POST /payouts': () => ({ status: 400, body: { error: { description: 'Insufficient balance' } } }) });
    const fake = world(draftBatch());
    await expect(sendBatch('batch-1', 'a1')).rejects.toThrow('Insufficient balance');
    const revert = fake.on('store_payout_batches', 'update')[1];
    expect(revert.payload).toMatchObject({ status: 'draft', failure_reason: 'Insufficient balance' });
    expect(hasFilter(revert, 'is', 'razorpayx_payout_id', null)).toBe(true);
  });

  it('only a draft can be sent', async () => {
    world(draftBatch({ status: 'processing' }));
    await expect(sendBatch('batch-1', 'a1')).rejects.toMatchObject({ message: expect.stringContaining('already processing') });
  });
});

describe('payout updates (webhook / refresh)', () => {
  function world(batch: Record<string, unknown>) {
    let current = { ...batch };
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_payout_batches' && c.op === 'select') return ok(current);
      if (c.table === 'store_payout_batches' && c.op === 'update') { current = { ...current, ...(c.payload as object) }; return ok([current]); }
      return undefined;
    });
  }

  it('processed: batch processed with UTR, every line paid', async () => {
    const fake = world(draftBatch({ status: 'processing', razorpayx_payout_id: 'pout_1' }));
    const batch = await applyPayoutUpdate({ id: 'pout_1', status: 'processed', reference_id: 'batch-1', utr: 'UTR9' });
    expect(batch).toMatchObject({ status: 'processed', utr: 'UTR9' });
    const lines = fake.on('store_payouts', 'update')[0];
    expect(lines.payload).toMatchObject({ status: 'paid' });
    expect(hasFilter(lines, 'eq', 'payout_batch_id', 'batch-1')).toBe(true);
  });

  it('failed: lines released back to the pool and an admin told', async () => {
    const fake = world(draftBatch({ status: 'processing', razorpayx_payout_id: 'pout_1' }));
    const batch = await applyPayoutUpdate({ id: 'pout_1', status: 'failed', reference_id: 'batch-1', status_details: { description: 'Beneficiary bank offline' } });
    expect(batch).toMatchObject({ status: 'failed', failure_reason: 'Beneficiary bank offline' });
    expect(hasFilter(fake.on('store_payouts', 'delete')[0], 'eq', 'payout_batch_id', 'batch-1')).toBe(true);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ type: 'store_payout_review' });
  });

  it('reversed after processed (bank returned it) is allowed; processed after failed is not', async () => {
    world(draftBatch({ status: 'processed', razorpayx_payout_id: 'pout_1' }));
    expect(await applyPayoutUpdate({ id: 'pout_1', status: 'reversed', reference_id: 'batch-1' })).toMatchObject({ status: 'reversed' });

    world(draftBatch({ status: 'failed', razorpayx_payout_id: 'pout_1' }));
    expect(await applyPayoutUpdate({ id: 'pout_1', status: 'processed', reference_id: 'batch-1' })).toMatchObject({ status: 'failed' });
  });

  it('a second, different payout for one batch is flagged and changes nothing', async () => {
    const fake = world(draftBatch({ status: 'processing', razorpayx_payout_id: 'pout_1' }));
    await applyPayoutUpdate({ id: 'pout_2', status: 'processed', reference_id: 'batch-1' });
    expect(fake.on('store_payout_batches', 'update')).toHaveLength(0);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ title: 'Duplicate store payout' });
  });

  it('arrives through the shared webhook, signed with the RazorpayX secret', async () => {
    process.env.RAZORPAYX_WEBHOOK_SECRET = 'x_webhook_secret';
    const event = { event: 'payout.processed', id: 'evt_p', payload: { payout: { entity: { id: 'pout_1', status: 'processed', reference_id: 'batch-1' } } } };
    const raw = Buffer.from(JSON.stringify(event));
    const sig = crypto.createHmac('sha256', 'x_webhook_secret').update(raw).digest('hex');
    await expect(paymentService.verifyWebhook({ 'x-razorpay-signature': sig }, raw)).resolves.toBe(true);
    await expect(paymentService.verifyWebhook({ 'x-razorpay-signature': '0'.repeat(64) }, raw)).resolves.toBe(false);

    const fake = world(draftBatch({ status: 'processing', razorpayx_payout_id: 'pout_1' }));
    await paymentService.processWebhookEvent(event);
    expect(fake.on('store_payout_batches', 'update')[0].payload).toMatchObject({ status: 'processed' });
  });
});

describe('cancelBatch', () => {
  it('cancels a never-sent draft and releases its lines', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_payout_batches' && c.op === 'select') return ok(draftBatch());
      if (c.table === 'store_payout_batches' && c.op === 'update') return ok([draftBatch({ status: 'cancelled' })]);
      return undefined;
    });
    await expect(cancelBatch('batch-1')).resolves.toMatchObject({ status: 'cancelled' });
    expect(fake.on('store_payouts', 'delete')).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it('will not cancel a batch RazorpayX already has from an interrupted send', async () => {
    stubRazorpayX({ 'GET /payouts?': () => ({ body: { items: [{ id: 'pout_1', status: 'processing', reference_id: 'batch-1' }] } }) });
    let current: Record<string, unknown> = draftBatch({ send_attempts: 1 });
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_payout_batches' && c.op === 'select') return ok(current);
      if (c.table === 'store_payout_batches' && c.op === 'update') { current = { ...current, ...(c.payload as object) }; return ok([current]); }
      return undefined;
    });
    await expect(cancelBatch('batch-1')).rejects.toMatchObject({ message: expect.stringContaining('already has this payout') });
    expect(current).toMatchObject({ status: 'processing', razorpayx_payout_id: 'pout_1' });
    expect(fake.on('store_payouts', 'delete')).toHaveLength(0);
  });
});
