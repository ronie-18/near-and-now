/**
 * PostgREST returns at most `max-rows` (1000 on Supabase) rows per request and
 * says nothing when it truncates. Reads that must see *every* matching row
 * (broadcast recipients, store stock at checkout) page through them here.
 *
 * `page(from, to)` builds the query for one inclusive range — it must apply a
 * stable `.order()` (e.g. on the primary key), or rows can repeat or go
 * missing between pages. Throws the first error a page returns.
 */
export const FETCH_ALL_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_ALL_PAGE_SIZE) {
    const { data, error } = await page(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < FETCH_ALL_PAGE_SIZE) return rows;
  }
}
