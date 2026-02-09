/**
 * Enriches master_products_seed.csv with brand and description for each product.
 * Uses web-researched brand mappings and generates accurate product descriptions.
 * Run: node scripts/enrich-products-brand-description.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_CSV = path.join(__dirname, '../master_products_seed.csv');
const OUTPUT_CSV = path.join(__dirname, '../master_products_seed.csv');
const OUTPUT_SQL = path.join(__dirname, '../supabase/seed-master-products.sql');

// Known brands: multi-word first (longest match wins), then single-word
// Sorted by length descending so "Bombay Shaving Company" matches before "Bombay"
const KNOWN_BRANDS = [
  'Bombay Shaving Company',
  "Head & Shoulders",
  "L'Oreal Paris",
  "L'Oreal Casting",
  'Organic India',
  'Secret Temptation',
  'Super Saver',
  'Glow & Lovely',
  'Center Fruit',
  'Retro Rush',
  'Mogu Mogu',
  'Real Fruit Power',
  'Aquawhite',
  'Swazz Matic',
  'Clinic Plus',
  'Bella Vita',
  'Agro Fresh',
  'Godrej No.1',
  'Godrej Fab',
  'Godrej',
  'Gold Touch',
  'Mishti Dhampur',
  'Tide Naturals',
  'Tide',
  'Freshgold',
  'Everyuth',
  'Sunsilk',
  'Whisper Ultra',
  'Whisper',
  'Nivea Men',
  'Nivea',
  'Yogabar',
  'Diggam',
  'Boro Plus',
  'Karachi',
  'Unibic',
  'Sunlight',
  'Mukharochak',
  'Storia',
  'Wagh Bakri',
  'VLCC',
  'Pears',
  'Tulips',
  'Dabur',
  'Himalaya',
  'Vaseline',
  'Joy',
  'Joy Skin',
  'Joy Honey',
  'Joy Complete',
  'Cetaphil',
  'Emami',
  'Everest',
  'Fruittella',
  'Niine',
  'Elly',
  'Zodiac',
  'Swaccha',
  'Sampoorti',
  'Sugar Pop',
  'Lakme',
  'Garnier',
  'Cadbury',
  "Wrigley's",
  'Dettol',
  'Ganesh',
  'Lays',
  'Lux',
  'Sunrise',
  'Yutika',
  'Provedic',
  'Mamypoko',
  'Hilton',
  'Colgate',
  'Cremica',
  'Maaza',
  'Bombay Shaving',
  'Organic',
  'Tata',
  'Tata Tea',
  'Tata Agni',
  'Crax',
  'Super',
];

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

function extractBrand(name) {
  const n = String(name || '').trim();
  if (!n) return '';

  // Loose products - brand is often the product type or generic
  if (/^Loose\s+/i.test(n)) {
    const rest = n.replace(/^Loose\s+/i, '').trim();
    // For "Loose Moong Dal" -> brand could be generic; use first meaningful word
    const firstWord = rest.split(/\s+/)[0] || '';
    if (/^(Moong|Toor|Basmati|Chana|Ratna|Masoor|Kabli|Whole|Miniket|Sona|Sugar|Tarka|Cardamom|Gobindo|Mouri|Atop|Pasta|Tomatoes|Potatoes|Gota|Garlic)$/i.test(firstWord)) {
      return ''; // Loose staples - no distinct brand
    }
  }

  // Match known multi-word brands first (longest first)
  const sorted = [...KNOWN_BRANDS].sort((a, b) => b.length - a.length);
  for (const brand of sorted) {
    if (n.startsWith(brand) || n.toLowerCase().startsWith(brand.toLowerCase())) {
      return brand;
    }
  }

  // Fallback: first word (or first two for compound names)
  const words = n.split(/\s+/);
  if (words.length >= 2 && /^[A-Z]/.test(words[1])) {
    return `${words[0]} ${words[1]}`;
  }
  return words[0] || '';
}

// Description templates by category + product-type hints
// Format: concise, factual, 1-2 sentences
function generateDescription(name, category, brand, unit) {
  const n = name || '';
  const cat = (category || '').toLowerCase();
  const b = brand || '';

  // Personal Care - product-specific
  if (cat.includes('personal') || cat.includes('care')) {
    if (/Lakme|9 To 5|Vitamin C|Serum/i.test(n)) return 'Lightweight serum enriched with Kakadu Plum (100x more Vitamin C than oranges). Reduces dullness, fights aging and pollution damage. Dermatologically tested.';
    if (/Garnier|Micellar/i.test(n)) return 'No-rinse micellar water that removes makeup, dirt and impurities. Fragrance-free, alcohol-free formula suitable for all skin types.';
    if (/Dettol.*Soap/i.test(n)) return 'Antiseptic soap with germ protection. Refreshing formula for daily hygiene. From Reckitt Benckiser.';
    if (/Head & Shoulders|Anti Dandruff/i.test(n)) return 'Anti-dandruff shampoo with pyrithione zinc. Leaves hair smooth and dandruff-free. From Procter & Gamble.';
    if (/Lux.*Soap/i.test(n)) return 'Luxurious bathing soap with skin-nourishing oils. Available in multiple fragrances. From Unilever.';
    if (/Himalaya.*Baby|Baby Powder/i.test(n)) return 'Gentle baby powder with 100% herbal actives. Ayurvedic formula, mild and soothing for delicate skin. From Himalaya Wellness.';
    if (/Bella Vita|Perfume|Oud|Eau De Parfum/i.test(n)) return 'Long-lasting fragrance with premium notes. Indian fragrance brand.';
    if (/Niine.*Sanitary|Sanitary Pads/i.test(n)) return 'Comfortable sanitary pads for daily use. Absorbent and soft. Indian feminine hygiene brand.';
    if (/Mamypoko|Diaper|Pants/i.test(n)) return 'Extra absorbent baby diapers from Unicharm. Designed for comfortable fit and leak protection.';
    if (/Tide|Detergent/i.test(n)) return 'Detergent powder for effective laundry cleaning. From Procter & Gamble.';
    if (/Godrej.*Soap|Godrej No/i.test(n)) return 'Milk cream soap with natural ingredients. From Godrej Consumer.';
    if (/Godrej Fab|Liquid Detergent/i.test(n)) return 'Liquid detergent for washing machines. Effective stain removal. From Godrej Consumer.';
    if (/L'Oreal|Hair Fall|Shampoo|Casting|Creme Gloss/i.test(n)) return 'Hair care from L\'Oréal Paris. Formulated for strength and nourishment.';
    if (/Joy.*Lotion|Joy Skin|Joy Honey|Joy Complete/i.test(n)) return 'Nourishing body lotion for soft, hydrated skin. From ITC.';
    if (/Vaseline|Gluta-Hya|Intensive Care|Aloe/i.test(n)) return 'Moisturizing body care from Vaseline (Unilever). Hydrates and protects skin.';
    if (/Cetaphil|Gentle|Cleanser|Skin/i.test(n)) return 'Dermatologist-recommended gentle cleanser. Suitable for sensitive skin. From Galderma.';
    if (/Sugar Pop/i.test(n)) return 'Makeup and beauty products from Sugar Cosmetics. Trendy, long-lasting formulas.';
    if (/Glow & Lovely|Facewash|Bright Glow/i.test(n)) return 'Face wash for radiant, even-toned skin. From Hindustan Unilever.';
    if (/Colgate|Toothpaste|Bamboo|Charcoal/i.test(n)) return 'Oral care from Colgate-Palmolive. Trusted for cavity protection and fresh breath.';
    if (/Swaccha|Soap|Neem|Tulsi|Haldi|Silver Suraksha/i.test(n)) return 'Herbal soap with natural ingredients like neem, tulsi and turmeric.';
    if (/Everyuth|Facewash|Tulsi|Turmeric/i.test(n)) return 'Natural face wash with tulsi and turmeric. From Emami.';
    if (/Clinic Plus|Shampoo/i.test(n)) return 'Hair care shampoo for strength and nourishment. From Hindustan Unilever.';
    if (/Sunsilk|Shampoo|Black Shine/i.test(n)) return 'Hair shampoo from Unilever. Formulated for shine and care.';
    if (/Whisper|Sanitary|Pads/i.test(n)) return 'Feminine hygiene product from Procter & Gamble. Ultra absorbent.';
    if (/Nivea|Nivea Men|Dark Spot Reduction/i.test(n)) return 'Skincare from Nivea (Beiersdorf). Formulated for men.';
    if (/Secret Temptation/i.test(n)) return 'Body deodorant for women. From ITC.';
    if (/Bombay Shaving|Razor|Shaving Foam/i.test(n)) return 'Men\'s grooming products from Bombay Shaving Company. Indian D2C brand.';
    if (/Boro Plus|Antiseptic|Cream/i.test(n)) return 'Antiseptic cream for minor cuts and wounds. From Emami.';
    if (/Pears|Soap|Pure|Gentle/i.test(n)) return 'Gentle bathing soap with natural oils. From Hindustan Unilever.';
    if (/Tulips|Wet Wipes|Baby/i.test(n)) return 'Gentle baby wipes for sensitive skin.';
    if (/Dabur|Toothpaste|Red/i.test(n)) return 'Ayurvedic toothpaste from Dabur. Red formula with traditional ingredients.';
    if (/VLCC|Papaya.*Apricot|Apricot.*Facescrub/i.test(n)) return 'Skincare from VLCC. Helps improve skin texture.';
    if (/Zodiac|Comb/i.test(n)) return 'Hair comb from Zodiac. Unisex design.';
    if (/Elly|Elastic|Band/i.test(n)) return 'Hair accessories.';
    if (/Aquawhite|Toothbrush/i.test(n)) return 'Soft-bristle toothbrush for oral hygiene.';
  }

  // Chocolates & Candies
  if (cat.includes('chocolate') || cat.includes('candies')) {
    if (/Cadbury|Fuse|Dairy Milk|Crispello|Roast Almond/i.test(n)) return 'Chocolate from Cadbury (Mondelez). Premium milk chocolate.';
    if (/Wrigley|Doublemint|Mints|Chewy/i.test(n)) return 'Chewing gum and mints from Wrigley (Mars Wrigley).';
    if (/Center Fruit|Chewing Gum/i.test(n)) return 'Liquid-filled chewing gum. From Perfetti Van Melle.';
    if (/Fruittella|Toffee|Chewy/i.test(n)) return 'Chewy toffee from Perfetti Van Melle.';
    if (/Retro Rush|Candy/i.test(n)) return 'Flavored candy.';
  }

  // Soft Drinks & Beverages
  if (cat.includes('soft') || cat.includes('drink') || cat.includes('beverage')) {
    if (/Maaza|Mango/i.test(n)) return 'Mango drink from Coca-Cola India. Made with Alphonso mango pulp.';
    if (/Real Fruit Power|Juice/i.test(n)) return 'Mixed fruit juice. Real fruit content.';
    if (/Freshgold|Juice|Pomegranate|Mix Fruit/i.test(n)) return 'Fruit juice in tetra pack.';
    if (/Mogu Mogu|Juice|Nata De Coco|Strawberry/i.test(n)) return 'Juice drink with nata de coco jelly. From Sappe.';
    if (/Storia|Coconut Water/i.test(n)) return 'Natural coconut water. Refreshing and hydrating.';
    if (/Organic India|Tulsi Green Tea/i.test(n)) return 'Organic tulsi green tea. From Organic India.';
    if (/Tata|Agni|Tea Gold/i.test(n)) return 'Tea from Tata Consumer. Premium Indian tea.';
    if (/Wagh Bakri|Ginger|Tea|Instant/i.test(n)) return 'Instant ginger tea from Wagh Bakri.';
  }

  // Staples, Spices, Dairy
  if (cat.includes('staples') || cat.includes('spice') || cat.includes('dairy')) {
    if (/Sampoorti/i.test(n)) return 'Premium staples and spices. Quality assured.';
    if (/Ganesh|Chana|Sattu/i.test(n)) return 'Roasted gram sattu. Traditional Indian staple.';
    if (/Agro Fresh|Dalia|Atta/i.test(n)) return 'Fresh atta and dalia. Quality grains.';
    if (/Diggam|Atta|Chakki/i.test(n)) return 'Chakki fresh atta. Stone-ground wheat flour.';
    if (/Everest|Turmeric|Mirchi|Spice/i.test(n)) return 'Spices from Everest. Trusted Indian brand.';
    if (/Sunrise|Paneer|Butter|Readymix/i.test(n)) return 'Ready-mix for paneer butter masala.';
    if (/Provedic|Ghee|Desi/i.test(n)) return 'Pure desi ghee. Traditional clarified butter.';
    if (/Gold Touch|Ghee/i.test(n)) return 'Premium ghee. Pure and natural.';
    if (/Emami|Oil|Soyabean|Refined/i.test(n)) return 'Refined soybean oil. From Emami.';
  }

  // Snacks & Bakery
  if (cat.includes('snack') || cat.includes('bakery')) {
    if (/Lays|Potato Chips|Magic Masala|Indian/i.test(n)) return 'Potato chips from Lay\'s (PepsiCo). Indian flavors.';
    if (/Cremica|Cookie|Cracker|Coconut/i.test(n)) return 'Biscuits and cookies from Cremica (Mrs. Bector\'s).';
    if (/Karachi|Cookie|Ajwain/i.test(n)) return 'Premium cookies. Traditional recipe.';
    if (/Crax|Curls|chatpata|Masala/i.test(n)) return 'Crunchy snack from Crax (DFM Foods).';
    if (/Unibic|Biscuit|Fruit|Nut/i.test(n)) return 'Premium biscuits from Unibic.';
    if (/Mukharochak|Chanachur|Namkeen/i.test(n)) return 'Traditional Bengali chanachur. Sweet and sour flavor.';
  }

  // Detergents
  if (cat.includes('detergent')) {
    if (/Sunlight|Detergent/i.test(n)) return 'Detergent powder from Unilever. Effective cleaning.';
    if (/Swazz Matic|Detergent/i.test(n)) return 'Top load detergent powder.';
  }

  // Salt, Sugar, Oils, Dry Fruits
  if (cat.includes('salt') || cat.includes('sugar')) {
    if (/Sampoorti|Iodised|Salt/i.test(n)) return 'Iodised salt. Essential for daily cooking.';
    if (/Mishti Dhampur|Sugar|Premium/i.test(n)) return 'Premium quality sugar. From Mishti Dhampur.';
    if (/Hilton|Rock Salt|Notlih/i.test(n)) return 'Natural rock salt. From Hilton Agro Foods.';
  }

  if (cat.includes('oil')) {
    if (/Emami|Oil/i.test(n)) return 'Refined cooking oil. From Emami.';
  }

  if (cat.includes('dry') || cat.includes('fruit')) {
    if (/Super Saver|Dry Fruit|Mixed/i.test(n)) return 'Premium mixed dry fruits.';
  }

  // Breakfast cereals
  if (cat.includes('breakfast') || cat.includes('cereal')) {
    if (/Yogabar|Muesli|Fruits|Nuts|Seeds/i.test(n)) return 'Healthy muesli with fruits, nuts and seeds. From Yogabar.';
  }

  // Vegetables (Loose)
  if (cat.includes('vegetable')) {
    if (/Loose|Tomatoes|Potatoes/i.test(n)) return 'Fresh vegetables. Sold by weight.';
  }

  // Pasta
  if (cat.includes('pasta')) {
    if (/Loose|Pasta/i.test(n)) return 'Loose pasta. Sold by weight.';
  }

  // Generic fallback
  const productType = n.split(' - ')[0] || n;
  if (b) {
    return `${b} product. ${productType}. Quality assured.`;
  }
  return `${productType}. Quality product.`;
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

// Main
const content = fs.readFileSync(INPUT_CSV, 'utf8');
const { header, rows } = parseCSV(content);

console.log(`Enriching ${rows.length} products...`);

const enriched = rows.map((row) => {
  const name = (row.name || '').replace(/^"|"$/g, '');
  const category = (row.category || '').replace(/^"|"$/g, '');
  const unit = (row.unit || '').replace(/^"|"$/g, '');

  const brand = extractBrand(name);
  const description = generateDescription(name, category, brand, unit);

  return {
    ...row,
    brand: brand || row.brand,
    description: description || row.description,
  };
});

// Write CSV
const headerLine = 'name,category,brand,description,image_url,base_price,discounted_price,unit,is_loose,min_quantity,max_quantity,rating,rating_count,is_active';
const csvLines = [headerLine];

for (const r of enriched) {
  const name = (r.name || '').replace(/^"|"$/g, '');
  const category = (r.category || '').replace(/^"|"$/g, '');
  const brand = r.brand || '';
  const description = (r.description || '').replace(/"/g, '""');
  const image_url = (r.image_url || '').replace(/^"|"$/g, '');
  const base_price = r.base_price || 0;
  const discounted_price = r.discounted_price || 0;
  const unit = (r.unit || 'piece').replace(/^"|"$/g, '');
  const is_loose = shouldBeLoose(name) ? 'true' : 'false';
  const min_quantity = r.min_quantity || 1;
  const max_quantity = r.max_quantity || 100;
  const rating = r.rating || 4.5;
  const rating_count = r.rating_count || 0;
  const is_active = r.is_active || 'true';

  csvLines.push(
    [
      escapeCsv(name),
      escapeCsv(category),
      escapeCsv(brand),
      escapeCsv(description),
      escapeCsv(image_url),
      base_price,
      discounted_price,
      escapeCsv(unit),
      is_loose,
      min_quantity,
      max_quantity,
      rating,
      rating_count,
      is_active,
    ].join(',')
  );
}

fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'));
console.log(`Wrote ${OUTPUT_CSV}`);

// Regenerate SQL seed
function escapeSql(str) {
  if (str === null || str === undefined || str === '') return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function shouldBeLoose(name) {
  return /^Loose\s/i.test(String(name || '').trim());
}

const BATCH_SIZE = 100;
const sqlStatements = [];
for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
  const batch = enriched.slice(i, i + BATCH_SIZE);
  const values = batch.map((r) => {
    const name = (r.name || '').replace(/^"|"$/g, '');
    const basePrice = parseFloat(r.base_price) || 0;
    const discountedPrice = parseFloat(r.discounted_price) ?? basePrice;
    const minQty = parseFloat(r.min_quantity) || 1;
    const maxQty = parseFloat(r.max_quantity) || 100;
    const rating = parseFloat(r.rating) || 4;
    const isLoose = shouldBeLoose(name);
    const brand = (r.brand || '').replace(/^"|"$/g, '');
    const desc = (r.description || '').replace(/^"|"$/g, '');
    const imageUrl = (r.image_url || '').replace(/^"|"$/g, '');
    const unit = (r.unit || 'piece').replace(/^"|"$/g, '');
    const isActive = r.is_active === 'false' ? 'false' : 'true';
    return `(${escapeSql(name)}, ${escapeSql((r.category || '').replace(/^"|"$/g, ''))}, ${escapeSql(brand)}, ${escapeSql(desc)}, ${escapeSql(imageUrl) || 'NULL'}, ${basePrice}, ${discountedPrice}, ${escapeSql(unit)}, ${isLoose}, ${minQty}, ${maxQty}, ${rating}, ${parseInt(r.rating_count) || 0}, ${isActive})`;
  });
  sqlStatements.push(
    `INSERT INTO master_products (name, category, brand, description, image_url, base_price, discounted_price, unit, is_loose, min_quantity, max_quantity, rating, rating_count, is_active) VALUES\n` +
    values.join(',\n') +
    ';'
  );
}

const sqlContent = `-- Seed master_products (with brand and description)
-- Run AFTER categories exist.
-- Generated from enriched master_products_seed.csv

` + sqlStatements.join('\n\n');

fs.writeFileSync(OUTPUT_SQL, sqlContent);
console.log(`Wrote ${OUTPUT_SQL}`);
console.log('Done. Brands and descriptions enriched, SQL seed updated.');
