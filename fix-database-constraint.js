// Automatic Database Fix Script
// This will update the order_status constraint to include 'shipped'

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mpbszymyubxavjoxhzfm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnN6eW15dWJ4YXZqb3hoemZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyOTc5OTQsImV4cCI6MjA2OTg3Mzk5NH0.NnHFwGCkNpTWorV8O6vgn6uuqYPRek1QK4Sk_rcqLOg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fixOrderStatusConstraint() {
  console.log('🔧 Starting database constraint fix...\n');

  try {
    // Step 1: Drop the old constraint
    console.log('Step 1: Dropping old constraint...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;'
    });

    if (dropError) {
      console.error('❌ Error dropping constraint:', dropError);
      console.log('\n⚠️  This script requires admin privileges.');
      console.log('Please run the SQL manually in Supabase SQL Editor:\n');
      printManualInstructions();
      return;
    }

    console.log('✅ Old constraint dropped\n');

    // Step 2: Add new constraint with 'shipped'
    console.log('Step 2: Adding new constraint with shipped status...');
    const { error: addError } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE orders 
            ADD CONSTRAINT orders_order_status_check 
            CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));`
    });

    if (addError) {
      console.error('❌ Error adding constraint:', addError);
      console.log('\n⚠️  This script requires admin privileges.');
      console.log('Please run the SQL manually in Supabase SQL Editor:\n');
      printManualInstructions();
      return;
    }

    console.log('✅ New constraint added successfully!\n');
    console.log('🎉 Database fix completed! You can now use "shipped" status.\n');
    console.log('Refresh your admin page and try updating order status again.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n⚠️  Automatic fix failed. Please run the SQL manually:\n');
    printManualInstructions();
  }
}

function printManualInstructions() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('MANUAL FIX INSTRUCTIONS:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('1. Go to: https://mpbszymyubxavjoxhzfm.supabase.co');
  console.log('2. Click "SQL Editor" in the left sidebar');
  console.log('3. Copy and paste this SQL:\n');
  console.log('-- Drop old constraint');
  console.log('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;\n');
  console.log('-- Add new constraint with shipped');
  console.log('ALTER TABLE orders');
  console.log('ADD CONSTRAINT orders_order_status_check');
  console.log("CHECK (order_status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled'));\n");
  console.log('4. Click "Run" button');
  console.log('5. Refresh your admin page\n');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run the fix
console.log('═══════════════════════════════════════════════════════════');
console.log('DATABASE CONSTRAINT FIX TOOL');
console.log('═══════════════════════════════════════════════════════════\n');

fixOrderStatusConstraint();
