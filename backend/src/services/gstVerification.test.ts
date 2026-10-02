/**
 * Live GSTIN verification via AppyFlow (2026-10-02): service behaviour, the
 * checkout endpoint, order placement, and Near & Now's own GSTIN on invoices.
 * AppyFlow itself is faked (no paid calls in tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { clearGstinVerificationCache, verifyGstin, gstinRejectionMessage } from './gstVerification.service.js';
import gstinRoutes from '../routes/gstin.routes.js';
import { OrdersController } from '../controllers/orders.controller.js';
import { databaseService } from './database.service.js';
import { platformGstin } from './invoice.service.js';
import { installFakeSupabase, mockRes } from '../test/fakeSupabase.js';

const ACTIVE = '29AAHCR4320E1ZJ';
const KEY = 'test-key-secret';

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[] = [];
function fakeAppyflow(reply: { status?: number; json?: unknown; throws?: Error }) {
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    if (reply.throws) throw reply.throws;
    return { ok: (reply.status ?? 200) < 400, status: reply.status ?? 200, json: async () => reply.json };
  }));
}
const activeReply = {
  taxpayerInfo: { gstin: ACTIVE, lgnm: 'RAZORPAY SOFTWARE PRIVATE LIMITED', tradeNam: 'Razorpay', sts: 'Active', pradr: { addr: { stcd: 'Karnataka' } } },
};

beforeEach(() => {
  clearGstinVerificationCache();
  process.env.APPYFLOW_KEY_SECRET = KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.APPYFLOW_KEY_SECRET;
  delete process.env.NEAR_AND_NOW_GSTIN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('verifyGstin', () => {
  it('Active → verified, with the registry legal name; key sent in the POST body, not the URL', async () => {
    fakeAppyflow({ json: activeReply });
    const v = await verifyGstin(' 29aahcr4320e1zj ');
    expect(v).toMatchObject({ result: 'active', gstin: ACTIVE, legalName: 'RAZORPAY SOFTWARE PRIVATE LIMITED', tradeName: 'Razorpay', stateName: 'Karnataka' });
    expect(sent[0].url).toBe('https://appyflow.in/api/verifyGST');
    expect(sent[0].url).not.toContain(KEY);
    expect(sent[0].body).toEqual({ gstNo: ACTIVE, key_secret: KEY });
  });

  it.each(['Cancelled', 'Suspended'])('%s → inactive, with a rejection message', async (sts) => {
    fakeAppyflow({ json: { taxpayerInfo: { gstin: ACTIVE, lgnm: 'X', sts } } });
    const v = await verifyGstin(ACTIVE);
    expect(v).toMatchObject({ result: 'inactive', registryStatus: sts });
    expect(gstinRejectionMessage(v)).toContain(sts.toLowerCase());
  });

  it('unknown to the registry → not_found', async () => {
    fakeAppyflow({ json: { error: true, message: 'Invalid GSTIN Number' } });
    const v = await verifyGstin(ACTIVE);
    expect(v.result).toBe('not_found');
    expect(gstinRejectionMessage(v)).toMatch(/isn't registered/);
  });

  it.each([
    ['bad key', { json: { error: true, message: 'Invalid key_secret' } }],
    ['out of credits', { json: { error: true, message: 'Insufficient credits, please recharge' } }],
    ['HTTP 500', { status: 500, json: {} }],
    ['network failure', { throws: new TypeError('fetch failed') }],
  ])('%s → unavailable (never a rejection)', async (_label, reply) => {
    fakeAppyflow(reply);
    const v = await verifyGstin(ACTIVE);
    expect(v.result).toBe('unavailable');
    expect(gstinRejectionMessage(v)).toBeNull();
  });

  it("a record for a different GSTIN (AppyFlow's trial/sample response) is never accepted", async () => {
    // The exact shape seen live on 2026-10-02: both queries answered with this.
    fakeAppyflow({ json: { taxpayerInfo: { gstin: '03DOXPM4071K1ZE', lgnm: 'DISHANT MAHAJAN', tradeNam: 'AppyFlow Technologies', sts: 'Active', pradr: { addr: { stcd: 'Punjab' } } } } });
    const v = await verifyGstin('19AAYFN8032H1ZM');
    expect(v.result).toBe('unavailable');
    expect(gstinRejectionMessage(v)).toBeNull(); // not a rejection either — the order still goes through
  });

  it('a record with no GSTIN at all is not accepted', async () => {
    fakeAppyflow({ json: { taxpayerInfo: { lgnm: 'Someone', sts: 'Active' } } });
    expect((await verifyGstin(ACTIVE)).result).toBe('unavailable');
  });

  it('placing an order during a sample/trial response keeps the typed name (never "DISHANT MAHAJAN")', async () => {
    fakeAppyflow({ json: { taxpayerInfo: { gstin: '03DOXPM4071K1ZE', lgnm: 'DISHANT MAHAJAN', sts: 'Active' } } });
    const place = vi.spyOn(databaseService, 'placeCheckoutOrder').mockResolvedValue({ id: 'o1' } as never);
    await new OrdersController().placeCheckout(
      { body: { gstin: '19AAYFN8032H1ZM', gstin_business_name: 'Near and Now' }, customerId: 'c1' } as unknown as Request,
      mockRes() as never
    );
    expect(place.mock.calls[0][0]).toMatchObject({ gstin_business_name: 'Near and Now' });
  });

  it('a mistyped GSTIN is rejected offline — no paid lookup', async () => {
    fakeAppyflow({ json: activeReply });
    const v = await verifyGstin('22AAAAA0000A1Z5');
    expect(v.result).toBe('invalid');
    expect(sent).toHaveLength(0);
  });

  it('no key configured → unavailable, no call made', async () => {
    delete process.env.APPYFLOW_KEY_SECRET;
    fakeAppyflow({ json: activeReply });
    expect((await verifyGstin(ACTIVE)).result).toBe('unavailable');
    expect(sent).toHaveLength(0);
  });

  it('caches a result (one paid lookup), shares an in-flight one, and never caches "unavailable"', async () => {
    fakeAppyflow({ json: activeReply });
    await Promise.all([verifyGstin(ACTIVE), verifyGstin(ACTIVE)]);
    await verifyGstin(ACTIVE);
    expect(sent).toHaveLength(1);

    clearGstinVerificationCache();
    fakeAppyflow({ status: 500, json: {} });
    await verifyGstin(ACTIVE);
    await verifyGstin(ACTIVE);
    expect(sent).toHaveLength(2); // retried, not cached
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/gstin/verify', () => {
  async function call(body: unknown): Promise<{ status: number; json: any }> {
    installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'app_users' ? { data: { id: 'cust-1', role: 'customer', session_token_issued_at: new Date().toISOString(), is_suspended: false }, error: null } : undefined
    );
    const app = express();
    app.use(express.json());
    app.use('/api/gstin', gstinRoutes);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      return await new Promise((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/api/gstin/verify', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' } },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode!, json: JSON.parse(data) }));
          }
        );
        req.on('error', reject);
        req.end(JSON.stringify(body));
      });
    } finally {
      server.close();
    }
  }

  it('returns verified + legal name for an Active GSTIN', async () => {
    fakeAppyflow({ json: activeReply });
    const { status, json } = await call({ gstin: ACTIVE });
    expect(status).toBe(200);
    expect(json).toMatchObject({ success: true, verified: true, result: 'active', legal_name: 'RAZORPAY SOFTWARE PRIVATE LIMITED', message: null });
  });

  it('returns a rejection message for a cancelled GSTIN', async () => {
    fakeAppyflow({ json: { taxpayerInfo: { gstin: ACTIVE, lgnm: 'X', sts: 'Cancelled' } } });
    const { json } = await call({ gstin: ACTIVE });
    expect(json).toMatchObject({ verified: false, result: 'inactive' });
    expect(json.message).toMatch(/cancelled/);
  });

  it('requires a gstin', async () => {
    expect((await call({})).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('placing an order with a GSTIN', () => {
  const controller = new OrdersController();
  const req = (body: Record<string, unknown>) => ({ body, customerId: 'cust-1' }) as unknown as Request;

  it('a cancelled GSTIN is refused before the order is created', async () => {
    fakeAppyflow({ json: { taxpayerInfo: { gstin: ACTIVE, lgnm: 'X', sts: 'Cancelled' } } });
    const place = vi.spyOn(databaseService, 'placeCheckoutOrder').mockResolvedValue({ id: 'o1' } as never);
    const res = mockRes();
    await controller.placeCheckout(req({ gstin: ACTIVE, gstin_business_name: 'Typed Name' }), res as never);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ field: 'gstin' });
    expect(place).not.toHaveBeenCalled();
  });

  it("an Active GSTIN saves the registry's legal name, not the typed one", async () => {
    fakeAppyflow({ json: activeReply });
    const place = vi.spyOn(databaseService, 'placeCheckoutOrder').mockResolvedValue({ id: 'o1' } as never);
    await controller.placeCheckout(req({ gstin: ACTIVE, gstin_business_name: 'typed name' }), mockRes() as never);
    expect(place.mock.calls[0][0]).toMatchObject({ gstin: ACTIVE, gstin_business_name: 'RAZORPAY SOFTWARE PRIVATE LIMITED', user_id: 'cust-1' });
  });

  it('provider down → the order still goes through, with the typed name', async () => {
    fakeAppyflow({ throws: new TypeError('fetch failed') });
    const place = vi.spyOn(databaseService, 'placeCheckoutOrder').mockResolvedValue({ id: 'o1' } as never);
    const res = mockRes();
    await controller.placeCheckout(req({ gstin: ACTIVE, gstin_business_name: 'typed name' }), res as never);
    expect(res.statusCode).toBe(201);
    expect(place.mock.calls[0][0]).toMatchObject({ gstin_business_name: 'typed name' });
  });

  it('no GSTIN → no lookup at all', async () => {
    fakeAppyflow({ json: activeReply });
    vi.spyOn(databaseService, 'placeCheckoutOrder').mockResolvedValue({ id: 'o1' } as never);
    await controller.placeCheckout(req({}), mockRes() as never);
    expect(sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("Near & Now's own GSTIN on invoices", () => {
  it('defaults to 19AAYFN8032H1ZM (West Bengal)', () => {
    expect(platformGstin()).toBe('19AAYFN8032H1ZM');
  });
  it('can be overridden from the environment, and an invalid value is never printed', () => {
    process.env.NEAR_AND_NOW_GSTIN = '29aahcr4320e1zj';
    expect(platformGstin()).toBe('29AAHCR4320E1ZJ');
    process.env.NEAR_AND_NOW_GSTIN = '19AAYFN8032H1ZX'; // wrong check character
    expect(platformGstin()).toBe('');
  });
});
