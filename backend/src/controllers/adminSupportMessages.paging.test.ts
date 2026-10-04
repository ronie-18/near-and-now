/**
 * Support inbox paging (2026-10-04): the list used to be an unbounded
 * select('*'). It now takes ?page=&limit= (default 50, max 200), returns the
 * exact total, and keeps `messages` as the array it always was.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { listSupportMessages } from './adminSupportMessages.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

afterEach(() => vi.restoreAllMocks());

const rows = [{ id: 'm1', status: 'open' }];

async function call(query: Record<string, string>) {
  const fake = installFakeSupabase(supabaseAdmin, (c) => {
    if (c.table === 'support_messages') return { data: rows, error: null, count: 137 } as Result;
    return undefined;
  });
  const res = mockRes();
  await listSupportMessages({ query } as unknown as Request, res as never);
  return { fake, res, q: fake.on('support_messages', 'select')[0] };
}

describe('GET /api/admin/support-messages', () => {
  it('defaults to page 1 / 50 rows and returns the exact total', async () => {
    const { res, q } = await call({});
    expect(hasFilter(q, 'range', 0, 49)).toBe(true);
    expect(res.body).toEqual({ success: true, messages: rows, total: 137, page: 1, limit: 50 });
  });

  it('slices the requested page with a stable sort', async () => {
    const { q } = await call({ page: '3', limit: '20', status: 'open' });
    expect(hasFilter(q, 'range', 40, 59)).toBe(true);
    expect(hasFilter(q, 'eq', 'status', 'open')).toBe(true);
    const orders = q.filters.filter(([m]) => m === 'order');
    expect(orders).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
  });

  it('caps limit at 200 and ignores junk paging values', async () => {
    const { q: capped, res } = await call({ limit: '999' });
    expect(hasFilter(capped, 'range', 0, 199)).toBe(true);
    expect((res.body as { limit: number }).limit).toBe(200);
    const { q: junk } = await call({ page: '-2', limit: 'abc' });
    expect(hasFilter(junk, 'range', 0, 49)).toBe(true);
  });

  it('ignores a status outside open|resolved (the "all" tab)', async () => {
    const { q } = await call({ status: 'all' });
    expect(q.filters.some(([m]) => m === 'eq')).toBe(false);
  });
});
