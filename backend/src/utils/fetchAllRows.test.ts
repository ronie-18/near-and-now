import { describe, it, expect } from 'vitest';
import { fetchAllRows, FETCH_ALL_PAGE_SIZE } from './fetchAllRows.js';

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: offset + i }));

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap, page by page, until a short page', async () => {
    const ranges: Array<[number, number]> = [];
    const total = FETCH_ALL_PAGE_SIZE * 2 + 37;
    const all = await fetchAllRows((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: rows(Math.max(0, Math.min(to, total - 1) - from + 1), from), error: null });
    });
    expect(all).toHaveLength(total);
    expect(all[total - 1]).toEqual({ id: total - 1 });
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('an exact multiple of the page size needs one extra (empty) read to know it is done', async () => {
    let calls = 0;
    const all = await fetchAllRows((from) => {
      calls++;
      return Promise.resolve({ data: from === 0 ? rows(FETCH_ALL_PAGE_SIZE) : [], error: null });
    });
    expect(all).toHaveLength(FETCH_ALL_PAGE_SIZE);
    expect(calls).toBe(2);
  });

  it('null data is an empty page', async () => {
    expect(await fetchAllRows(() => Promise.resolve({ data: null, error: null }))).toEqual([]);
  });

  it('throws the first page error', async () => {
    const err = { code: '42501', message: 'denied' };
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: err }))).rejects.toBe(err);
  });
});
