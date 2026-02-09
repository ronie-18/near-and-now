/**
 * Converts products_rows.csv to master_products format.
 * - Sets is_loose = true for products whose name starts with "Loose" or "loose" exclusively
 * - Generates SQL INSERT script and new CSV for master_products table
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT_CSV = path.join(__dirname, '../products_rows.csv');
const OUTPUT_SQL = path.join(__dirname, '../supabase/seed-master-products.sql');
const OUTPUT_CSV = path.join(__dirname, '../master_products_seed.csv');

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ',') {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return { header, rows };
}

function shouldBeLoose(name) {
  const n = String(name || '').trim();
  return /^Loose\s/i.test(n);
}

const csvContent = fs.readFileSync(INPUT_CSV, 'utf8');
const { header, rows } = parseCSV(csvContent);

console.log(`Read ${rows.length} rows from products_rows.csv`);

// master_products columns (omit id - DB generates via gen_random_uuid())
const MP_COLUMNS = [
  'name', 'category', 'brand', 'description', 'image_url',
  'base_price', 'discounted_price', 'unit', 'is_loose',
  'min_quantity', 'max_quantity', 'rating', 'rating_count', 'is_active'
];

const sqlStatements = [];
const newCsvRows = [MP_COLUMNS.join(',')];
const BATCH_SIZE = 100;
let looseCount = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const values = batch.map((row) => {
    const name = (row.name || '').trim();
    const isLoose = shouldBeLoose(name);
    if (isLoose) looseCount++;

    const basePrice = parseFloat(row.base_price) || 0;
    const discountedPrice = parseFloat(row.discounted_price) ?? basePrice;
    const minQty = parseFloat(row.min_quantity) || 1;
    const maxQty = parseFloat(row.max_quantity) || 100;
    const rating = parseFloat(row.rating) || 4;

    return `(${escapeSql(name)}, ${escapeSql(row.category)}, ${escapeSql(row.brand) || 'NULL'}, ${escapeSql(row.description) || 'NULL'}, ${escapeSql(row.image_url) || 'NULL'}, ${basePrice}, ${discountedPrice}, ${escapeSql(row.unit || 'piece')}, ${isLoose}, ${minQty}, ${maxQty}, ${rating}, ${parseInt(row.rating_count) || 0}, ${row.is_active === 'false' ? 'false' : 'true'})`;
  });

  sqlStatements.push(
    `INSERT INTO master_products (${MP_COLUMNS.join(', ')}) VALUES\n` +
    values.join(',\n') +
    ';'
  );
}

// Write SQL
let sql = `-- Seed master_products from products_rows.csv
-- Run AFTER categories exist. Categories must match: Personal Care, Staples, etc.
-- Products with name starting "Loose" have is_loose = true (${looseCount} products)

`;
sql += sqlStatements.join('\n\n');

fs.writeFileSync(OUTPUT_SQL, sql);
console.log(`Wrote ${OUTPUT_SQL}`);

// Write new CSV
for (const row of rows) {
  const name = (row.name || '').trim();
  const isLoose = shouldBeLoose(name);
  const basePrice = parseFloat(row.base_price) || 0;
  const discountedPrice = parseFloat(row.discounted_price) ?? basePrice;

  const csvRow = [
    `"${String(name).replace(/"/g, '""')}"`,
    `"${String(row.category || '').replace(/"/g, '""')}"`,
    row.brand ? `"${String(row.brand).replace(/"/g, '""')}"` : '""',
    row.description ? `"${String(row.description).replace(/"/g, '""')}"` : '""',
    row.image_url ? `"${String(row.image_url).replace(/"/g, '""')}"` : '""',
    basePrice,
    discountedPrice,
    `"${String(row.unit || 'piece').replace(/"/g, '""')}"`,
    isLoose ? 'true' : 'false',
    parseFloat(row.min_quantity) || 1,
    parseFloat(row.max_quantity) || 100,
    parseFloat(row.rating) || 4,
    parseInt(row.rating_count) || 0,
    row.is_active === 'false' ? 'false' : 'true'
  ];
  newCsvRows.push(csvRow.join(','));
}

fs.writeFileSync(OUTPUT_CSV, newCsvRows.join('\n'));
console.log(`Wrote ${OUTPUT_CSV}`);
console.log(`is_loose=true for ${looseCount} products (name starts with Loose)`);
