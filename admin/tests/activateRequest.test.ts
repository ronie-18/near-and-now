/**
 * The exact HTTP request "Make all active" sends, built by the real
 * supabase-js client (no network: fetch is captured). PostgREST runs a PATCH
 * with order + limit as a limited update; checked against production with a
 * no-op request on 2026-10-05.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  requests: [] as Array<{ method: string; url: string; headers: Record<string, string>; body: string }>,
  /** Bodies to answer with, in order; an empty list answers "[]". */
  reply: [] as string[],
}));

vi.mock('../src/services/supabase', async () => {
  const { createClient: make } = await import('@supabase/supabase-js');
  const client = make('https://example.supabase.co', 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
        h.requests.push({ method: init?.method ?? 'GET', url: String(input), headers, body: String(init?.body ?? '') });
        return new Response(h.reply.shift() ?? '[]', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  return { getAdminClient: () => client, supabase: client, supabaseAdmin: client };
});

import { activateInactiveProducts } from '../src/services/adminService';

void createClient;

describe('activateInactiveProducts request', () => {
  it('is a PATCH of is_active=true on inactive rows, ordered by id, limited, returning the ids', async () => {
    const result = await activateInactiveProducts({ category: 'Staples' });
    expect(result).toEqual({ activated: 0, error: null });
    expect(h.requests).toHaveLength(1);
    const [req] = h.requests;
    expect(req.method).toBe('PATCH');
    const url = new URL(req.url);
    expect(url.pathname).toBe('/rest/v1/master_products');
    expect([...url.searchParams.entries()].sort()).toEqual(
      [
        ['category', 'eq.Staples'],
        ['is_active', 'not.is.true'],
        ['order', 'id.asc'],
        ['limit', '500'],
        ['select', 'id'],
      ].sort(),
    );
    expect(JSON.parse(req.body)).toEqual({ is_active: true });
    expect(req.headers.prefer).toContain('return=representation');
  });

  it('the next batch starts after the highest id of the previous one', async () => {
    h.requests.length = 0;
    const ids = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    h.reply = [JSON.stringify(ids.map((id) => ({ id }))), '[]'];
    const result = await activateInactiveProducts({});
    expect(result).toEqual({ activated: 500, error: null });
    expect(h.requests).toHaveLength(2);
    expect(new URL(h.requests[1].url).searchParams.get('id')).toBe(`gt.${ids[499]}`);
  });
});
