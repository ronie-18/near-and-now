import { describe, it, expect } from 'vitest';
import { selectInChunks } from './selectInChunks.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

describe('selectInChunks', () => {
  it('runs the single original query when the list fits', async () => {
    const seen: string[][] = [];
    const r = await selectInChunks(ids(100), async (c) => { seen.push(c); return { data: c.map((id) => ({ id })), error: null }; });
    expect(seen).toHaveLength(1);
    expect(r.data).toHaveLength(100);
  });

  it('splits longer lists, keeps id-list order, and fails as a whole if any slice fails', async () => {
    const seen: string[][] = [];
    const r = await selectInChunks(ids(250), async (c) => { seen.push(c); return { data: c.map((id) => ({ id })), error: null }; });
    expect(seen.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(r.data!.map((x) => x.id)).toEqual(ids(250));
    const bad = await selectInChunks(ids(250), async (c) => (c[0] === 'id100' ? { data: null, error: 'boom' } : { data: [], error: null }));
    expect(bad).toEqual({ data: null, error: 'boom' });
  });
});
