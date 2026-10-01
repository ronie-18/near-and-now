/**
 * Multi-store ownership (2026-10-02): one shopkeeper account can own several
 * stores. Pins the backend half: adding a store, live-store filtering, the
 * default-store rule, per-store labelling, and that client-supplied store ids
 * are checked against what the caller actually owns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { createStore, getStores, createSupportMessage, updateStore, MAX_STORES_PER_OWNER } from './storeOwner.controller.js';
import { requireShopkeeperAuth, ShopkeeperController } from './shopkeeper.controller.js';
import { submitProductSubmission } from './productSubmissions.controller.js';
import { notificationService } from '../services/notification.service.js';
import { installFakeSupabase, hasFilter, mockRes, type Call, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const OWNER = 'owner-1';
const authed = (body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ headers: { authorization: 'Bearer tok' }, body, params: {}, query: {}, ...extra }) as unknown as Request;
const isTokenLookup = (c: Call) => c.table === 'app_users' && c.op === 'select' && hasFilter(c, 'eq', 'session_token', 'tok');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('POST /store-owner/stores (createStore)', () => {
  const valid = { name: 'Fresh Mart – Park St', address: '12 Park Street, Kolkata', latitude: 22.55, longitude: 88.35 };
  const existingStores = [
    { id: 's2', phone: '+919000000002', expo_push_token: 'ExponentPushToken[new]', owner_image_url: 'https://img/owner.jpg', created_at: '2026-09-01' },
    { id: 's1', phone: '+919000000001', expo_push_token: 'ExponentPushToken[old]', owner_image_url: null, created_at: '2026-01-01' },
  ];
  function setup(stores: unknown[] = existingStores) {
    return installFakeSupabase(supabaseAdmin, (c) => {
      if (isTokenLookup(c)) return ok({ id: OWNER, session_token_issued_at: new Date().toISOString() });
      if (c.table === 'app_users' && c.op === 'select') return ok({ name: 'Ravi', phone: '+919999999999' });
      if (c.table === 'stores' && c.op === 'select') return ok(stores);
      if (c.table === 'stores' && c.op === 'insert') return ok({ id: 'new-store', ...(c.payload as object) });
      return undefined;
    });
  }

  it('creates an offline, unapproved store and copies the owner-level push token and photo', async () => {
    const fake = setup();
    const res = mockRes();
    await createStore(authed(valid), res as never);

    expect(res.statusCode).toBe(201);
    const insert = fake.on('stores', 'insert')[0];
    expect(insert.payload).toMatchObject({
      owner_id: OWNER,
      name: 'Fresh Mart – Park St',
      address: '12 Park Street, Kolkata',
      latitude: 22.55,
      longitude: 88.35,
      is_active: false,
      is_approved: false,
      expo_push_token: 'ExponentPushToken[new]', // from the most recent store
      owner_image_url: 'https://img/owner.jpg',
      phone: '+919000000002',
    });
    // Counted against live stores only.
    expect(hasFilter(fake.on('stores', 'select')[0], 'is', 'deleted_at', null)).toBe(true);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ type: 'store_added' });
    expect(res.body).toMatchObject({ success: true, store: { id: 'new-store' } });
  });

  it.each([
    ['no name', { ...valid, name: '   ' }],
    ['name too long', { ...valid, name: 'x'.repeat(101) }],
    ['no address', { ...valid, address: '' }],
    ['no location', { name: valid.name, address: valid.address }],
    ['the 0,0 placeholder location', { ...valid, latitude: 0, longitude: 0 }],
    ['an impossible latitude', { ...valid, latitude: 123 }],
  ])('rejects %s with 400 and inserts nothing', async (_label, body) => {
    const fake = setup();
    const res = mockRes();
    await createStore(authed(body), res as never);
    expect(res.statusCode).toBe(400);
    expect(fake.on('stores', 'insert')).toHaveLength(0);
  });

  it(`refuses an 11th store (limit ${MAX_STORES_PER_OWNER}) with 409`, async () => {
    const ten = Array.from({ length: MAX_STORES_PER_OWNER }, (_, i) => ({ id: `s${i}`, created_at: '2026-01-01' }));
    const fake = setup(ten);
    const res = mockRes();
    await createStore(authed(valid), res as never);
    expect(res.statusCode).toBe(409);
    expect(fake.on('stores', 'insert')).toHaveLength(0);
  });

  it('a first-ever additional store with no prior stores still works (nothing to copy)', async () => {
    const fake = setup([]);
    const res = mockRes();
    await createStore(authed(valid), res as never);
    expect(res.statusCode).toBe(201);
    expect(fake.on('stores', 'insert')[0].payload).toMatchObject({ expo_push_token: null, owner_image_url: null, phone: '+919999999999' });
  });

  it('ignores a client-supplied phone (riders call the store phone)', async () => {
    const fake = setup();
    await createStore(authed({ ...valid, phone: '+910000000000' }), mockRes() as never);
    expect(fake.on('stores', 'insert')[0].payload).toMatchObject({ phone: '+919000000002' });
  });

  it("updating the owner's photo applies it to all of the owner's live stores", async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (isTokenLookup(c)) return ok({ id: OWNER, session_token_issued_at: null });
      if (c.table === 'stores' && c.op === 'select') return ok({ id: 's1' });
      if (c.table === 'stores' && c.op === 'update') return ok({ id: 's1', name: 'Store 1' });
      return undefined;
    });
    const res = mockRes();
    await updateStore(authed({ owner_image_url: 'https://img/new.jpg' }, { params: { id: 's1' } }), res as never);
    const updates = fake.on('stores', 'update');
    expect(updates).toHaveLength(2);
    const sync = updates[1];
    expect(sync.payload).toMatchObject({ owner_image_url: 'https://img/new.jpg' });
    expect(hasFilter(sync, 'eq', 'owner_id', OWNER)).toBe(true);
    expect(hasFilter(sync, 'is', 'deleted_at', null)).toBe(true);
    expect(hasFilter(sync, 'neq', 'id', 's1')).toBe(true);
  });

  it('requires a valid session', async () => {
    const fake = installFakeSupabase(supabaseAdmin, () => ok(null));
    const res = mockRes();
    await createStore(authed(valid), res as never);
    expect(res.statusCode).toBe(401);
    expect(fake.on('stores', 'insert')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('GET /store-owner/stores', () => {
  it('lists live stores only, oldest first', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      isTokenLookup(c) ? ok({ id: OWNER, session_token_issued_at: null }) : c.table === 'stores' ? ok([{ id: 's1' }]) : undefined
    );
    const res = mockRes();
    await getStores(authed(), res as never);
    const q = fake.on('stores', 'select')[0];
    expect(hasFilter(q, 'eq', 'owner_id', OWNER)).toBe(true);
    expect(hasFilter(q, 'is', 'deleted_at', null)).toBe(true);
    expect(hasFilter(q, 'order', 'created_at', { ascending: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('shopkeeper auth: default store and approved-store list', () => {
  async function runAuth(stores: unknown[]) {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'app_users' ? ok({ id: OWNER, role: 'shopkeeper', session_token_issued_at: null }) : c.table === 'stores' ? ok(stores) : undefined
    );
    const req = authed();
    const next = vi.fn();
    await requireShopkeeperAuth(req, mockRes() as never, next);
    return { req, next, fake };
  }

  it('a newly added pending store does not become the default; deleted stores are excluded', async () => {
    const { req, next, fake } = await runAuth([
      { id: 'new-pending', is_approved: false },
      { id: 'approved', is_approved: true },
    ]);
    expect(next).toHaveBeenCalled();
    expect(req.shopkeeperStoreId).toBe('approved');
    expect(req.shopkeeperApprovedStoreIds).toEqual(['approved']);
    expect(req.shopkeeperStoreIds).toEqual(['new-pending', 'approved']);
    expect(hasFilter(fake.on('stores')[0], 'is', 'deleted_at', null)).toBe(true);
  });

  it('with no approved store, falls back to the first', async () => {
    const { req } = await runAuth([{ id: 'a', is_approved: false }, { id: 'b', is_approved: false }]);
    expect(req.shopkeeperStoreId).toBe('a');
    expect(req.shopkeeperHasApprovedStore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('GET /shopkeeper/profile with two stores', () => {
  it('returns every live store and the default one (no maybeSingle multi-row failure)', async () => {
    const stores = [{ id: 'a', name: 'A', is_approved: true }, { id: 'b', name: 'B', is_approved: false }];
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.table === 'app_users' ? ok({ id: OWNER, name: 'Ravi' }) : c.table === 'stores' ? ok(stores) : undefined
    );
    const res = mockRes();
    await new ShopkeeperController().getProfile({ shopkeeperId: OWNER, shopkeeperStoreId: 'a' } as unknown as Request, res as never);
    expect(res.body).toMatchObject({ success: true, store: { id: 'a' }, stores });
    expect(fake.on('stores')[0].terminal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('GET /shopkeeper/orders labels each allocation with its store', () => {
  it('includes store_name per allocation across stores', async () => {
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'order_store_allocations') {
        return ok([
          { id: 'al1', order_id: 'o1', store_id: 'a', status: 'pending_acceptance', created_at: '2026-10-02' },
          { id: 'al2', order_id: 'o2', store_id: 'b', status: 'pending_acceptance', created_at: '2026-10-02' },
        ]);
      }
      if (c.table === 'customer_orders') {
        return ok([
          { id: 'o1', order_code: 'NN-1', payment_method: 'cod' },
          { id: 'o2', order_code: 'NN-2', payment_method: 'cod' },
        ]);
      }
      if (c.table === 'order_items') return ok([]);
      if (c.table === 'stores') return ok([{ id: 'a', name: 'Store A' }, { id: 'b', name: 'Store B' }]);
      return undefined;
    });
    const res = mockRes();
    await new ShopkeeperController().getIncomingOrders(
      { shopkeeperStoreIds: ['a', 'b'], query: {} } as unknown as Request,
      res as never
    );
    const orders = (res.body as { orders: Array<{ store_id: string; store_name: string }> }).orders;
    expect(orders.map((o) => [o.store_id, o.store_name])).toEqual([['a', 'Store A'], ['b', 'Store B']]);
  });
});

// ---------------------------------------------------------------------------
describe('client-supplied store ids are checked against ownership', () => {
  const submission = { name: 'Organic Honey', category: 'Grocery', base_price: 200, discounted_price: 180, unit: 'jar', min_quantity: 1, max_quantity: 5, image_url: 'https://img/h.jpg' };
  const sk = (body: Record<string, unknown>) =>
    ({ body, shopkeeperId: OWNER, shopkeeperStoreId: 'a', shopkeeperApprovedStoreIds: ['a', 'b'] }) as unknown as Request;
  const setup = () =>
    installFakeSupabase(supabaseAdmin, (c) => (c.op === 'insert' ? ok({ id: 'sub-1', ...(c.payload as object) }) : undefined));

  it('a product submission for another approved store of mine is filed there', async () => {
    const fake = setup();
    await submitProductSubmission(sk({ ...submission, store_id: 'b' }), mockRes() as never);
    expect(fake.on('product_submissions', 'insert')[0].payload).toMatchObject({ store_id: 'b' });
  });

  it('a store id that is not one of my approved stores is refused', async () => {
    const fake = setup();
    const res = mockRes();
    await submitProductSubmission(sk({ ...submission, store_id: 'someone-elses' }), res as never);
    expect(res.statusCode).toBe(403);
    expect(fake.on('product_submissions')).toHaveLength(0);
  });

  it('no store id → the default (first approved) store, as before', async () => {
    const fake = setup();
    await submitProductSubmission(sk(submission), mockRes() as never);
    expect(fake.on('product_submissions', 'insert')[0].payload).toMatchObject({ store_id: 'a' });
  });

  it('a support message is filed under my chosen store, and a foreign id falls back to my first store', async () => {
    const stores = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const run = async (store_id: string) => {
      const fake = installFakeSupabase(supabaseAdmin, (c) => {
        if (isTokenLookup(c)) return ok({ id: OWNER, session_token_issued_at: null });
        if (c.table === 'app_users') return ok({ name: 'Ravi', phone: '+91' });
        if (c.table === 'stores') return ok(stores);
        if (c.op === 'insert' && c.table === 'support_messages') return ok({ id: 'm1' });
        return undefined;
      });
      await createSupportMessage(authed({ message: 'Help', store_id }), mockRes() as never);
      return fake.on('support_messages', 'insert')[0].payload as { store_id: string };
    };
    expect((await run('b')).store_id).toBe('b');
    expect((await run('not-mine')).store_id).toBe('a');
  });
});

// ---------------------------------------------------------------------------
describe('shopkeeper order notifications name the store only for multi-store owners', () => {
  async function bodyFor(liveStoreCount: number) {
    type Persistable = { persistNotification: (...args: unknown[]) => Promise<void> };
    const persist = vi.spyOn(notificationService as unknown as Persistable, 'persistNotification').mockResolvedValue(undefined);
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'stores' && c.terminal === 'maybeSingle') return ok({ name: 'Store B', expo_push_token: null, owner_id: OWNER });
      if (c.table === 'stores') return { data: null, error: null, count: liveStoreCount } as Result;
      return undefined;
    });
    await notificationService.notifyShopkeeperNewOrder('b', 'o1', 'NN-1');
    return (persist.mock.calls[0] as unknown[])[4] as string;
  }

  it('one store: wording unchanged', async () => {
    expect(await bodyFor(1)).toBe('Order #NN-1 has arrived. Tap to review and accept.');
  });

  it('several stores: says which store', async () => {
    expect(await bodyFor(3)).toBe('Order #NN-1 has arrived at Store B. Tap to review and accept.');
  });
});
