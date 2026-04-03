/**
 * Generates supabase/seed-master-products.sql and supabase/seed-master-products-v2.sql
 * from a master products CSV (same columns as master_products_seed.csv / final_corrected_products.csv).
 * Category rows come from ../categories_seed.csv (id, name, description, image_url, display_order).
 *
 * Usage:
 *   node scripts/generate-master-seeds-from-csv.js [path/to.csv]
 * Default input: ../master_products_seed.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = path.join(__dirname, '../master_products_seed.csv');
const CATEGORIES_CSV = path.join(__dirname, '../categories_seed.csv');
const OUT_V1 = path.join(__dirname, '../supabase/seed-master-products.sql');
const OUT_V2 = path.join(__dirname, '../supabase/seed-master-products-v2.sql');

const BATCH_SIZE = 100;

function parseCSV(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  return rows;
}

function escapeSql(str) {
  if (str === null || str === undefined || str === '') return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function normalizeHsnForSql(h) {
  if (h == null || String(h).trim() === '') return 'NULL';
  const s = String(h).trim();
  if (/^\d+\.0$/.test(s)) return escapeSql(s.slice(0, -2));
  return escapeSql(s);
}

function numOrNull(v) {
  if (v == null || String(v).trim() === '') return 'NULL';
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function rowToObject(header, cells) {
  const o = {};
  header.forEach((h, i) => {
    o[h.trim()] = cells[i] !== undefined ? cells[i] : '';
  });
  return o;
}

function shouldBeLoose(name) {
  return /^Loose\s/i.test(String(name || '').trim());
}

function buildV1Values(r) {
  const name = (r.name || '').replace(/^"|"$/g, '');
  const basePrice = parseFloat(r.base_price) || 0;
  const discountedPrice =
    r.discounted_price !== undefined && r.discounted_price !== ''
      ? parseFloat(r.discounted_price)
      : basePrice;
  const minQty = parseFloat(r.min_quantity) || 1;
  const maxQty = parseFloat(r.max_quantity) || 100;
  const rating = parseFloat(r.rating) || 4;
  const isLoose =
    String(r.is_loose || '').toLowerCase() === 'true'
      ? true
      : String(r.is_loose || '').toLowerCase() === 'false'
        ? false
        : shouldBeLoose(name);
  const brand = (r.brand || '').replace(/^"|"$/g, '');
  const desc = (r.description || '').replace(/^"|"$/g, '');
  const imageUrl = (r.image_url || '').replace(/^"|"$/g, '');
  const unit = (r.unit || 'piece').replace(/^"|"$/g, '');
  const isActive = String(r.is_active || '').toLowerCase() === 'false' ? 'false' : 'true';
  return `(${escapeSql(name)}, ${escapeSql((r.category || '').replace(/^"|"$/g, ''))}, ${escapeSql(brand)}, ${escapeSql(desc)}, ${escapeSql(imageUrl) || 'NULL'}, ${basePrice}, ${discountedPrice}, ${escapeSql(unit)}, ${isLoose}, ${minQty}, ${maxQty}, ${rating}, ${parseInt(r.rating_count, 10) || 0}, ${isActive})`;
}

function buildV2Values(r) {
  const v1 = buildV1Values(r);
  const inner = v1.slice(1, -1);
  const hsn = normalizeHsnForSql(r.hsn_code);
  const hsnDesc = escapeSql((r.hsn_description || '').replace(/^"|"$/g, ''));
  const gst = numOrNull(r.gst_rate);
  const cgst = numOrNull(r.cgst);
  const sgst = numOrNull(r.sgst);
  return `(${inner}, ${hsn}, ${hsnDesc}, ${gst}, ${cgst}, ${sgst})`;
}

function buildCategoriesUpsertSql() {
  if (!fs.existsSync(CATEGORIES_CSV)) {
    throw new Error(`Missing ${CATEGORIES_CSV}`);
  }
  const raw = fs.readFileSync(CATEGORIES_CSV, 'utf8');
  const table = parseCSV(raw);
  if (table.length < 2) {
    throw new Error('categories_seed.csv has no data rows');
  }
  const header = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((cells) => rowToObject(header, cells));
  const tuples = rows.map((r) => {
    const id = String(r.id || '').trim();
    const name = (r.name || '').replace(/^"|"$/g, '');
    const desc = (r.description || '').replace(/^"|"$/g, '').trim();
    const img = (r.image_url || '').replace(/^"|"$/g, '').trim();
    const ord = parseInt(r.display_order, 10);
    const orderVal = Number.isFinite(ord) ? ord : 0;
    const descSql = desc === '' ? 'NULL' : escapeSql(desc);
    const imgSql = img === '' ? 'NULL' : escapeSql(img);
    return `('${id}'::uuid, ${escapeSql(name)}, ${descSql}, ${imgSql}, ${orderVal})`;
  });
  return `-- Categories (from categories_seed.csv): insert or refresh metadata by unique name
INSERT INTO categories (id, name, description, image_url, display_order) VALUES
${tuples.join(',\n')}
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  display_order = EXCLUDED.display_order,
  updated_at = now();
`;
}

const v2Footer = `
-- =====================================================
-- Step 6: Re-link products — one row per (store, master_product)
-- products table has: store_id, master_product_id, is_active
-- =====================================================
INSERT INTO products (store_id, master_product_id, is_active)
SELECT s.id, mp.id, COALESCE(mp.is_active, true)
FROM stores s
CROSS JOIN master_products mp
WHERE s.is_active = true
  AND COALESCE(mp.is_active, true) = true
ON CONFLICT (store_id, master_product_id) DO NOTHING;

-- =====================================================
-- Verify
-- =====================================================
SELECT COUNT(*) AS master_products_count FROM master_products;
SELECT COUNT(*) AS products_count        FROM products;
`;

function main() {
  const categoriesUpsert = buildCategoriesUpsertSql();
  const inputPath = path.resolve(process.argv[2] || DEFAULT_CSV);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const table = parseCSV(raw);
  if (table.length < 2) {
    console.error('No data rows in', inputPath);
    process.exit(1);
  }
  const header = table[0].map((h) => h.trim());
  const dataRows = table.slice(1).map((cells) => rowToObject(header, cells));

  const v1Batches = [];
  const v2Batches = [];
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);
    v1Batches.push(
      `INSERT INTO master_products (name, category, brand, description, image_url, base_price, discounted_price, unit, is_loose, min_quantity, max_quantity, rating, rating_count, is_active) VALUES\n` +
        batch.map(buildV1Values).join(',\n') +
        ';'
    );
    v2Batches.push(
      `INSERT INTO master_products (name, category, brand, description, image_url, base_price, discounted_price, unit, is_loose, min_quantity, max_quantity, rating, rating_count, is_active, hsn_code, hsn_description, gst_rate, cgst, sgst) VALUES\n` +
        batch.map(buildV2Values).join(',\n') +
        ';'
    );
  }

  const v1Content =
    `-- Seed master_products (with brand and description)
-- Ensures required categories exist, then inserts products.
-- Generated by: node scripts/generate-master-seeds-from-csv.js
-- Source CSV: ${path.basename(inputPath)}

${categoriesUpsert}

` +
    v1Batches.join('\n\n') +
    '\n';

  const v2Content =
    `-- =====================================================
-- SEED v2: Repopulate master_products with HSN / GST data
-- Generated by: node scripts/generate-master-seeds-from-csv.js
-- Source CSV: ${path.basename(inputPath)}
-- Run AFTER migrate-master-products-to-old.sql (one-time schema backup)
-- =====================================================

-- Step 1: Clear rows that reference products (store inventory).
-- order_items.product_id → products.id (ON DELETE RESTRICT)
DELETE FROM order_items;

-- Step 2: Delete all products rows.
-- The FK (master_product_id → master_products.id) is ON DELETE RESTRICT,
-- so we must clear products before we can delete master_products.
DELETE FROM products;

-- Step 3: Delete all existing master_products rows
DELETE FROM master_products;

-- Step 4: Upsert categories
${categoriesUpsert}

-- Step 5: Insert all master_products with HSN / GST data
` +
    v2Batches.join('\n\n') +
    v2Footer;

  fs.writeFileSync(OUT_V1, v1Content);
  fs.writeFileSync(OUT_V2, v2Content);
  console.log(`Wrote ${OUT_V1}`);
  console.log(`Wrote ${OUT_V2}`);
  console.log(`Rows: ${dataRows.length} (from ${inputPath})`);
}

main();
