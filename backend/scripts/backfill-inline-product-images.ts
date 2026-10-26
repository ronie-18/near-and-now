/**
 * One-off: move inline `data:` product photos already in the database into
 * the product-images bucket and store their public URLs instead.
 *
 * New ones can't appear any more (services/productImageStorage.ts runs on
 * submit, admin edit and approval; checkout drops inline images from
 * order_items), but rows written before 2026-10-26 still carry them:
 *   - master_products.image_url    — echoed into every checkout (1 MB cap → 413)
 *   - product_submissions.image_url — bloats the unpaginated review lists
 *   - order_items.image_url         — bloats every order poll
 *
 * Usage (from backend/, with the usual .env holding SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/backfill-inline-product-images.ts           # dry run: counts only
 *   npx tsx scripts/backfill-inline-product-images.ts --apply   # upload + update
 *
 * Safe to re-run: objects are named by content hash (upsert), and every update
 * only applies while the row still holds an inline image (the filter is on the
 * prefix — the full value would not fit in the request URL). A row whose bytes
 * are not a JPEG/PNG/WebP/GIF is reported and left alone.
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from '../src/config/database.js';
import { isInlineImage, storeInlineProductImage } from '../src/services/productImageStorage.js';

const TABLES = ['master_products', 'product_submissions', 'order_items'] as const;
const PAGE = 500;
const apply = process.argv.includes('--apply');

async function inlineIds(table: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .like('image_url', 'data:%')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    if (!data || data.length < PAGE) return ids;
  }
}

async function main() {
  // The same photo is often on a product, its submission and many order rows.
  const urlByContent = new Map<string, string>();

  for (const table of TABLES) {
    // Collect every id before writing: updated rows drop out of the filter,
    // which would shift any range-based paging done while updating.
    const ids = await inlineIds(table);
    console.log(`${table}: ${ids.length} row(s) with an inline image`);
    if (!apply || ids.length === 0) continue;

    let moved = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      const { data: row, error } = await supabaseAdmin.from(table).select('image_url').eq('id', id).maybeSingle();
      if (error) throw new Error(`${table} ${id}: ${error.message}`);
      const inline = (row as { image_url?: unknown } | null)?.image_url;
      if (!isInlineImage(inline)) continue;

      const key = createHash('sha256').update(inline).digest('hex');
      let url = urlByContent.get(key);
      if (!url) {
        try {
          url = await storeInlineProductImage(inline);
        } catch (e) {
          skipped.push(`${id} (${(e as Error).message})`);
          continue;
        }
        urlByContent.set(key, url);
      }

      const { error: updErr } = await supabaseAdmin.from(table).update({ image_url: url }).eq('id', id).like('image_url', 'data:%');
      if (updErr) throw new Error(`${table} ${id}: ${updErr.message}`);
      moved++;
    }
    console.log(`${table}: moved ${moved}, skipped ${skipped.length}`);
    for (const s of skipped) console.log(`  skipped ${s}`);
  }

  if (!apply) console.log('\nDry run — nothing changed. Re-run with --apply to move them.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
