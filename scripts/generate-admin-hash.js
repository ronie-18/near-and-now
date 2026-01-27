/**
 * Generate bcrypt hash for initial admin password
 * Run this script to generate a password hash for the initial super admin
 *
 * Usage: node scripts/generate-admin-hash.js
 */

import bcrypt from 'bcryptjs';

// Default password for initial super admin
// CHANGE THIS IMMEDIATELY AFTER FIRST LOGIN!
const DEFAULT_PASSWORD = 'Admin@123';

// Generate hash with 10 salt rounds
const saltRounds = 10;

console.log('\n🔐 Generating bcrypt hash for initial admin password...\n');
console.log('Password:', DEFAULT_PASSWORD);
console.log('Salt Rounds:', saltRounds);
console.log('\n⚠️  IMPORTANT: Change this password immediately after first login!\n');

bcrypt.hash(DEFAULT_PASSWORD, saltRounds, (err, hash) => {
  if (err) {
    console.error('❌ Error generating hash:', err);
    process.exit(1);
  }

  console.log('✅ Hash generated successfully!\n');
  console.log('Copy this hash and use it in your SQL INSERT statement:\n');
  console.log('─'.repeat(80));
  console.log(hash);
  console.log('─'.repeat(80));
  console.log('\n📝 Full SQL Statement:\n');
  console.log(`INSERT INTO public.admins (email, password_hash, full_name, role, permissions, status)
VALUES (
  'superadmin@nearnow.com',
  '${hash}',
  'Super Administrator',
  'super_admin',
  '["*"]'::jsonb,
  'active'
)
ON CONFLICT (email) DO NOTHING;`);
  console.log('\n✅ Run this SQL in Supabase SQL Editor to create your initial admin.\n');
});
