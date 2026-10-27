/**
 * 2026-10-27: photos used to be uploaded straight to Storage with the anon
 * key, so five public buckets let anyone insert / overwrite / delete. Uploads
 * now get a one-photo token from the backend for a path it picks in the
 * caller's own folder. Pins: who may ask, which folder each caller gets, a
 * fresh path per upload, content-type checks, and the storage failure path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { createImageUploadUrl } from '../services/imageUploadUrls.js';
import { getImageUploadUrl } from './storeOwner.controller.js';
import { DeliveryPartnerController } from './deliveryPartner.controller.js';
import { createProductImageUploadUrl } from './adminProductImages.controller.js';
import { installFakeSupabase, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
const PUBLIC = 'https://proj.supabase.co/storage/v1/object/public/';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

let signed: Array<{ bucket: string; path: string }>;
let signError: { message: string } | null;
let realStorage: unknown;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  signed = [];
  signError = null;
  realStorage = supabaseAdmin.storage;
  (supabaseAdmin as unknown as { storage: unknown }).storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: async (path: string) => {
        signed.push({ bucket, path });
        return signError ? { data: null, error: signError } : { data: { path, token: `tok-${signed.length}`, signedUrl: 'x' }, error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${PUBLIC}${bucket}/${path}` } }),
    }),
  };
});
afterEach(() => {
  (supabaseAdmin as unknown as { storage: unknown }).storage = realStorage;
  vi.restoreAllMocks();
});

describe('createImageUploadUrl', () => {
  it('signs a fresh path in the given folder and returns the token and public URL', async () => {
    const a = await createImageUploadUrl('store-owner-images', 'user-1', 'image/jpeg', 'avatar-');
    const b = await createImageUploadUrl('store-owner-images', 'user-1', 'image/jpeg', 'avatar-');
    expect(a.path).toMatch(new RegExp(`^user-1/avatar-${UUID}\\.jpg$`));
    expect(b.path).not.toBe(a.path); // never the same object twice → nothing is overwritten
    expect(a).toMatchObject({ bucket: 'store-owner-images', token: 'tok-1', public_url: `${PUBLIC}store-owner-images/${a.path}` });
  });

  it('picks the extension from the content type', async () => {
    expect((await createImageUploadUrl('store-images', 's1', 'image/png')).path).toMatch(/\.png$/);
    expect((await createImageUploadUrl('delivery_partner_image', 'r1', 'IMAGE/HEIC')).path).toMatch(/\.heic$/);
    expect((await createImageUploadUrl('product-images', 'products', 'image/gif')).path).toMatch(/\.gif$/);
  });

  it('refuses a non-image or a type the bucket does not take (400), without signing', async () => {
    for (const [bucket, type] of [['store-images', 'application/pdf'], ['store-images', 'image/gif'], ['product-images', 'image/heic'], ['store-images', undefined]] as const) {
      await expect(createImageUploadUrl(bucket, 'f', type)).rejects.toMatchObject({ status: 400 });
    }
    expect(signed).toHaveLength(0);
  });

  it('turns a storage failure into a readable 502', async () => {
    signError = { message: 'storage down' };
    await expect(createImageUploadUrl('store-images', 's1', 'image/jpeg')).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/photo upload/) });
  });
});

describe('POST /store-owner/upload-url', () => {
  const req = (body: unknown, token = 'shop-token') =>
    ({ headers: { authorization: token ? `Bearer ${token}` : '' }, body }) as unknown as Request;
  const setup = (opts: { ownsApprovedStore: boolean }) =>
    installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'app_users') return ok({ id: 'owner-1', session_token_issued_at: new Date().toISOString() });
      if (c.table === 'stores') return ok(opts.ownsApprovedStore ? { id: 'store-1' } : null);
      return undefined;
    });

  it("issues an owner photo in the caller's own folder — no store needed", async () => {
    setup({ ownsApprovedStore: false });
    const res = mockRes();
    await getImageUploadUrl(req({ kind: 'owner_photo', content_type: 'image/jpeg' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(signed).toEqual([{ bucket: 'store-owner-images', path: expect.stringMatching(new RegExp(`^owner-1/avatar-${UUID}\\.jpg$`)) }]);
  });

  it("issues a gallery photo in the store's folder when the caller owns that approved store", async () => {
    const fake = setup({ ownsApprovedStore: true });
    const res = mockRes();
    await getImageUploadUrl(req({ kind: 'store_image', store_id: 'store-1', content_type: 'image/webp' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(signed[0]).toEqual({ bucket: 'store-images', path: expect.stringMatching(new RegExp(`^store-1/${UUID}\\.webp$`)) });
    const storeCheck = fake.on('stores')[0];
    expect(storeCheck.filters).toEqual(expect.arrayContaining([['eq', 'id', 'store-1'], ['eq', 'owner_id', 'owner-1'], ['eq', 'is_approved', true]]));
  });

  it("refuses someone else's (or an unapproved) store with 403 and signs nothing", async () => {
    setup({ ownsApprovedStore: false });
    const res = mockRes();
    await getImageUploadUrl(req({ kind: 'store_image', store_id: 'store-9', content_type: 'image/jpeg' }), res as never);
    expect(res.statusCode).toBe(403);
    expect(signed).toHaveLength(0);
  });

  it('401s without a valid session, 400s an unknown kind', async () => {
    installFakeSupabase(supabaseAdmin, () => ok(null));
    const anonRes = mockRes();
    await getImageUploadUrl(req({ kind: 'owner_photo', content_type: 'image/jpeg' }, 'bad'), anonRes as never);
    expect(anonRes.statusCode).toBe(401);

    setup({ ownsApprovedStore: true });
    const badRes = mockRes();
    await getImageUploadUrl(req({ kind: 'anything', content_type: 'image/jpeg' }), badRes as never);
    expect(badRes.statusCode).toBe(400);
    expect(signed).toHaveLength(0);
  });
});

describe('POST /delivery-partner/profile-photo/upload-url', () => {
  it("issues a photo in the rider's own folder", async () => {
    const res = mockRes();
    await new DeliveryPartnerController().createProfilePhotoUploadUrl({ riderId: 'rider-7', body: { content_type: 'image/png' } } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
    expect(signed).toEqual([{ bucket: 'delivery_partner_image', path: expect.stringMatching(new RegExp(`^rider-7/avatar-${UUID}\\.png$`)) }]);
  });
});

describe('POST /api/admin/product-images/upload-url', () => {
  it('issues a catalogue photo under products/', async () => {
    const res = mockRes();
    await createProductImageUploadUrl({ adminId: 'a1', body: { content_type: 'image/jpeg' } } as unknown as Request, res as never);
    expect(res.statusCode).toBe(200);
    expect(signed).toEqual([{ bucket: 'product-images', path: expect.stringMatching(new RegExp(`^products/${UUID}\\.jpg$`)) }]);
    expect(res.body).toMatchObject({ success: true, bucket: 'product-images', token: 'tok-1' });
  });
});

describe('the admin route is gated on products.edit', () => {
  it('lets a super admin through and refuses a viewer', async () => {
    const express = (await import('express')).default;
    const routes = (await import('../routes/adminProductImages.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/admin', routes);
    const srv = app.listen(0);
    const port = (srv.address() as { port: number }).port;
    const call = async (role: string) => {
      installFakeSupabase(supabaseAdmin, (c) => {
        if (c.table === 'admin_sessions') return ok([{ admin_id: 'a1', expires_at: '2099-01-01T00:00:00Z', logged_out_at: null }]);
        if (c.table === 'admins') return ok([{ status: 'active', role }]);
        return undefined;
      });
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/product-images/upload-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': 'tok' },
        body: JSON.stringify({ content_type: 'image/jpeg' }),
      });
      return r.status;
    };
    try {
      expect(await call('viewer')).toBe(403);
      expect(signed).toHaveLength(0);
      expect(await call('super_admin')).toBe(200);
      expect(signed).toHaveLength(1);
    } finally {
      srv.close();
    }
  });
});
