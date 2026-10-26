/**
 * 2026-10-26 review of 333879c (4 MB JSON cap on the product-submission
 * routes). An inline `data:image/…;base64,…` product photo was stored as-is,
 * copied into master_products.image_url on approval, and echoed back by the
 * website / customer app in every checkout — whose 1 MB cap then answered 413.
 * Pins: inline photos are moved to the product-images bucket on submit, admin
 * edit and approval; only the public URL is stored; https links pass through;
 * non-images are a 400; order_items never keeps an inline image.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { AppError } from '../utils/httpError.js';
import { decodeInlineImage, isInlineImage, storeInlineProductImage } from '../services/productImageStorage.js';
import { submitProductSubmission, editProductSubmission, reviewProductSubmission } from './productSubmissions.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const dataUrl = (buf: Buffer, label = 'image/jpeg') => `data:${label};base64,${buf.toString('base64')}`;
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const PUBLIC = 'https://proj.supabase.co/storage/v1/object/public/product-images/';

type UploadResult = { error: { message: string } | null };
let uploads: Array<{ path: string; contentType?: string; upsert?: boolean; bytes: number }>;
let uploadResults: UploadResult[];
let createBucket: ReturnType<typeof vi.fn>;
let realStorage: unknown;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'notifyProductSubmissionReviewed').mockResolvedValue(undefined as never);
  vi.spyOn(notificationService, 'notifyAdminsOfReviewAction').mockResolvedValue(undefined as never);

  uploads = [];
  uploadResults = [];
  createBucket = vi.fn(async () => ({ data: null, error: null }));
  realStorage = supabaseAdmin.storage;
  (supabaseAdmin as unknown as { storage: unknown }).storage = {
    createBucket,
    from: (bucket: string) => {
      expect(bucket).toBe('product-images');
      return {
        upload: async (path: string, body: Buffer, opts: { contentType?: string; upsert?: boolean }) => {
          uploads.push({ path, contentType: opts.contentType, upsert: opts.upsert, bytes: body.length });
          return { data: { path }, ...(uploadResults.shift() ?? { error: null }) };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${PUBLIC}${path}` } }),
      };
    },
  };
});
afterEach(() => {
  (supabaseAdmin as unknown as { storage: unknown }).storage = realStorage;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('productImageStorage', () => {
  it('recognises inline images only', () => {
    expect(isInlineImage(dataUrl(JPEG))).toBe(true);
    expect(isInlineImage('  DATA:image/png;base64,AAAA')).toBe(true);
    expect(isInlineImage('https://cdn.example.com/a.jpg')).toBe(false);
    expect(isInlineImage(null)).toBe(false);
  });

  it('types the image by its bytes, not its label (old app builds label PNGs as JPEG)', () => {
    expect(decodeInlineImage(dataUrl(PNG, 'image/jpeg'))).toMatchObject({ ext: 'png', contentType: 'image/png' });
    expect(decodeInlineImage(dataUrl(GIF))).toMatchObject({ ext: 'gif', contentType: 'image/gif' });
  });

  it('rejects a non-image or a non-base64 data URL with a 400', () => {
    for (const bad of [dataUrl(Buffer.from('%PDF-1.7 not a photo')), dataUrl(Buffer.from('hello')), 'data:text/plain,hello']) {
      let thrown: unknown;
      try {
        decodeInlineImage(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).status).toBe(400);
    }
  });

  it('passes an https link through without uploading', async () => {
    await expect(storeInlineProductImage('https://cdn.example.com/a.jpg')).resolves.toBe('https://cdn.example.com/a.jpg');
    expect(uploads).toHaveLength(0);
  });

  it('uploads an inline photo under its content hash and returns the public URL', async () => {
    const url = await storeInlineProductImage(dataUrl(JPEG));
    expect(url).toBe(`${PUBLIC}submissions/${sha(JPEG)}.jpg`);
    expect(uploads).toEqual([{ path: `submissions/${sha(JPEG)}.jpg`, contentType: 'image/jpeg', upsert: true, bytes: JPEG.length }]);

    // Same photo again (retry, admin re-save) → same object.
    await storeInlineProductImage(dataUrl(JPEG));
    expect(uploads[1].path).toBe(uploads[0].path);
  });

  it('creates the bucket once if it is missing, then retries', async () => {
    uploadResults = [{ error: { message: 'Bucket not found' } }, { error: null }];
    await expect(storeInlineProductImage(dataUrl(PNG))).resolves.toBe(`${PUBLIC}submissions/${sha(PNG)}.png`);
    expect(createBucket).toHaveBeenCalledTimes(1);
    expect(createBucket.mock.calls[0][0]).toBe('product-images');
    expect(uploads).toHaveLength(2);
  });

  it('turns any other upload failure into a 502 with a readable message', async () => {
    uploadResults = [{ error: { message: 'storage down' } }];
    await expect(storeInlineProductImage(dataUrl(JPEG))).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/product photo/i) });
  });
});

// ---------------------------------------------------------------------------
const FIELDS = {
  name: 'Mango pickle',
  category: 'Pickles',
  unit: '500g',
  base_price: 120,
  discounted_price: 100,
};

describe('POST /shopkeeper/product-submissions', () => {
  const req = (image_url: string) =>
    ({ shopkeeperId: 'u1', shopkeeperStoreId: 's1', shopkeeperApprovedStoreIds: ['s1'], body: { ...FIELDS, image_url } }) as unknown as Request;

  it('stores the Storage URL, not the inline photo', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.op === 'insert' ? ok({ id: 'sub-1' }) : undefined));
    const res = mockRes();
    await submitProductSubmission(req(dataUrl(JPEG)), res as never);

    expect(res.statusCode).toBe(200);
    const insert = fake.on('product_submissions', 'insert')[0];
    expect((insert.payload as { image_url: string }).image_url).toBe(`${PUBLIC}submissions/${sha(JPEG)}.jpg`);
  });

  it('keeps a pasted https link as-is', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.op === 'insert' ? ok({ id: 'sub-1' }) : undefined));
    await submitProductSubmission(req('https://cdn.example.com/p.jpg'), mockRes() as never);
    expect((fake.on('product_submissions', 'insert')[0].payload as { image_url: string }).image_url).toBe('https://cdn.example.com/p.jpg');
    expect(uploads).toHaveLength(0);
  });

  it('400s a photo that is not an image, and writes nothing', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    const res = mockRes();
    await submitProductSubmission(req(dataUrl(Buffer.from('hello'))), res as never);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: expect.stringMatching(/JPEG, PNG/) });
    expect(fake.on('product_submissions')).toHaveLength(0);
  });
});

describe('PATCH /api/admin/product-submissions/:id', () => {
  it('moves an inline photo the console re-sends into Storage', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) =>
      c.op === 'update' ? ok({ id: 'sub-1', stores: { name: 'Shop' } }) : undefined
    );
    const res = mockRes();
    await editProductSubmission({ params: { id: 'sub-1' }, body: { ...FIELDS, image_url: dataUrl(JPEG) } } as unknown as Request, res as never);

    expect(res.statusCode).toBe(200);
    const update = fake.on('product_submissions', 'update')[0];
    expect((update.payload as { image_url: string }).image_url).toBe(`${PUBLIC}submissions/${sha(JPEG)}.jpg`);
  });
});

describe('POST /api/admin/product-submissions/:id/review', () => {
  const review = (status: 'approved' | 'rejected') =>
    ({
      params: { id: 'sub-1' },
      adminId: 'a1',
      body: status === 'approved' ? { status, hsn_code: '2001', gst_rate: 12 } : { status, rejection_reason: 'Blurry' },
    }) as unknown as Request;
  const rpcRow = { id: 'sub-1', store_id: 's1', name: 'Mango pickle' };

  it('moves a legacy inline photo to Storage before approving, so master_products gets a URL', async () => {
    const order: string[] = [];
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      order.push(`${c.table}:${c.op}`);
      if (c.table === 'product_submissions' && c.op === 'select') return ok({ image_url: dataUrl(JPEG) });
      if (c.table === 'rpc:review_product_submission') return ok(rpcRow);
      return undefined;
    });
    const res = mockRes();
    await reviewProductSubmission(review('approved'), res as never);

    expect(res.statusCode).toBe(200);
    const update = fake.on('product_submissions', 'update')[0];
    expect(update.payload).toEqual({ image_url: `${PUBLIC}submissions/${sha(JPEG)}.jpg` });
    expect(hasFilter(update, 'eq', 'status', 'pending')).toBe(true);
    expect(order).toEqual(['product_submissions:select', 'product_submissions:update', 'rpc:review_product_submission:select']);
  });

  it('touches nothing extra when the row already has a URL', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'product_submissions') return ok({ image_url: 'https://cdn.example.com/p.jpg' });
      if (c.table === 'rpc:review_product_submission') return ok(rpcRow);
      return undefined;
    });
    await reviewProductSubmission(review('approved'), mockRes() as never);
    expect(fake.on('product_submissions', 'update')).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });

  it('does not read the image when rejecting', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => (c.table === 'rpc:review_product_submission' ? ok(rpcRow) : undefined));
    await reviewProductSubmission(review('rejected'), mockRes() as never);
    expect(fake.on('product_submissions')).toHaveLength(0);
  });
});
