import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV files to clean
const csvFiles = [
  path.join(__dirname, '..', 'master_products_seed.csv'),
  path.join(__dirname, '..', 'products_rows.csv')
];

console.log('🧹 Removing Sampoorti products from CSV files...\n');

csvFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  console.log(`📄 Processing: ${path.basename(filePath)}`);

  // Read the file
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Keep header and filter out Sampoorti products
  const header = lines[0];
  const dataLines = lines.slice(1);

  // Filter out lines containing "Sampoorti" (case-insensitive)
  const filteredLines = dataLines.filter(line => {
    const lowerLine = line.toLowerCase();
    return !lowerLine.includes('sampoorti');
  });

  const removedCount = dataLines.length - filteredLines.length;

  if (removedCount > 0) {
    // Write back to file
    const newContent = [header, ...filteredLines].join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`   ✅ Removed ${removedCount} Sampoorti product(s)`);
  } else {
    console.log(`   ℹ️  No Sampoorti products found`);
  }

  console.log('');
});

console.log('✨ CSV cleanup complete!\n');
console.log('📋 Summary:');
console.log('   - Removed all products containing "Sampoorti" from CSV files');
console.log('   - Files are ready for re-seeding without Sampoorti products');
console.log('\n⚠️  Next step: Run the SQL script in Supabase to remove from database');
