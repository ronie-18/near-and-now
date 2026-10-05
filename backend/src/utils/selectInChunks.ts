/**
 * PostgREST puts `.in()` lists in the request URL, so a list that keeps
 * growing (every order a rider ever delivered) eventually exceeds the URL
 * limit and the whole request fails. `selectInChunks` runs the same read for
 * slices of at most `size` ids, concurrently, and returns what the single
 * read would have: rows in chunk (= id-list) order, or `{ data: null, error }`
 * if any slice failed. With `ids.length <= size` it is exactly the one
 * original query.
 */
export const IN_LIST_CHUNK_SIZE = 100;

export async function selectInChunks<T>(
  ids: readonly string[],
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size: number = IN_LIST_CHUNK_SIZE
): Promise<{ data: T[] | null; error: unknown }> {
  if (ids.length <= size) return query([...ids]);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  const results = await Promise.all(chunks.map((chunk) => query(chunk)));
  const failed = results.find((r) => r.error);
  if (failed) return { data: null, error: failed.error };
  return { data: results.flatMap((r) => r.data ?? []), error: null };
}
