/**
 * Activity log (2026-10-04): never-reviewed rows must not appear. The
 * store_images review gate (20260926000000) backfilled every pre-existing
 * photo as status='approved' with reviewed_by/reviewed_at NULL; Postgres
 * orders DESC NULLS FIRST, so those rows filled the slice and rendered as
 * "1 Jan 1970 — Unknown". Every source query now filters on both columns, and
 * ?source= narrows the aggregation to one table.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { listActivityLog, ACTIVITY_SOURCES } from './adminActivityLog.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

const SOURCE_TABLES = [
  'store_profile_change_requests',
  'rider_profile_change_requests',
  'product_submissions',
  'store_verification_documents',
  'delivery_partner_verification_documents',
  'store_images',
];

async function call(query: Record<string, string> = {}) {
  const fake = installFakeSupabase(supabaseAdmin, (c) => {
    if (c.table === 'admins') return ok([{ role: 'super_admin' }]);
    return ok([]);
  });
  const res = mockRes();
  await listActivityLog({ adminId: 'a1', query } as unknown as Request, res as never);
  return { fake, res };
}

describe('GET /api/admin/activity-log', () => {
  it('excludes rows with a NULL reviewed_at or reviewed_by from every source', async () => {
    const { fake, res } = await call();
    expect(res.statusCode).toBe(200);
    for (const table of SOURCE_TABLES) {
      const [q] = fake.on(table, 'select');
      expect(q, table).toBeDefined();
      expect(hasFilter(q, 'not', 'reviewed_at', 'is', null), `${table} reviewed_at`).toBe(true);
      expect(hasFilter(q, 'not', 'reviewed_by', 'is', null), `${table} reviewed_by`).toBe(true);
      expect(hasFilter(q, 'order', 'reviewed_at', { ascending: false }), `${table} order`).toBe(true);
    }
  });

  it('?source= runs only that source and skips the other five', async () => {
    const { fake, res } = await call({ source: 'store_image' });
    expect(res.statusCode).toBe(200);
    expect(fake.on('store_images', 'select')).toHaveLength(1);
    for (const table of SOURCE_TABLES.filter((t) => t !== 'store_images')) {
      expect(fake.on(table, 'select'), table).toHaveLength(0);
    }
  });

  it('rejects an unknown ?source= with 400 and names the valid values', async () => {
    const { res } = await call({ source: 'payments' });
    expect(res.statusCode).toBe(400);
    const body = res.body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    for (const s of ACTIVITY_SOURCES) expect(body.error).toContain(s);
  });
});
