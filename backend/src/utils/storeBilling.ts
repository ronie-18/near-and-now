import { supabaseAdmin } from '../config/database.js';

const HOLDER_COLUMN = 'bank_account_holder_name';
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);

/**
 * Reads a store row for the billing screens with the account holder name
 * (migration 20261028000000). Until that migration is applied the column does
 * not exist and the read would fail outright, taking the existing billing
 * screens down with it — so it retries without the column and the name reads
 * as null. Safe to deploy before or after the migration.
 */
export async function selectStoreBillingRow(storeId: string, columns: string) {
  const withHolder = await supabaseAdmin
    .from('stores')
    .select(`${columns}, ${HOLDER_COLUMN}`)
    .eq('id', storeId)
    .maybeSingle();
  if (!withHolder.error || !MISSING_COLUMN_CODES.has(String((withHolder.error as { code?: string }).code))) {
    return withHolder as { data: Record<string, any> | null; error: unknown };
  }
  console.warn('[billing] stores.bank_account_holder_name is missing — apply migration 20261028000000');
  const without = await supabaseAdmin.from('stores').select(columns).eq('id', storeId).maybeSingle();
  return without as { data: Record<string, any> | null; error: unknown };
}
