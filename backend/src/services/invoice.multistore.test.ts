import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression coverage for the 2026-08-26 invoice rewrite: multi-store
// pages, real HSN codes, and the platform-fee breakdown page. Added because
// the pre-existing invoice.service.test.ts only exercised isolated math and
// storage plumbing — nothing here previously ran fetchOrderData/
// buildInvoiceData/generateCustomerPDF end to end with real (mocked) data.
// ---------------------------------------------------------------------------

vi.mock('../config/database.js', () => ({
  supabaseAdmin: { from: vi.fn(), storage: { getBucket: vi.fn(), createBucket: vi.fn(), from: vi.fn() } },
  supabase: {},
  isSupabaseServiceRoleConfigured: true,
}));

import { invoiceService } from './invoice.service.js';
import { supabaseAdmin } from '../config/database.js';

function chain(result: any) {
  const c: any = {};
  ['select', 'eq', 'in', 'insert', 'upsert', 'update'].forEach((m) => { c[m] = vi.fn(() => c); });
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.single = vi.fn().mockResolvedValue(result);
  c.insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve(result) }) }));
  // Real Supabase query builders are thenable — code paths here that await
  // the chain directly (no terminal .single()/.maybeSingle(), used for
  // multi-row selects like store_orders/order_items/products/master_products
  // /stores) need this to resolve to `result`, not the chain object itself.
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function setupMocks(opts: { storeCount: 1 | 2; itemsPerStore: number; totalAmount: number }) {
  const orderRow = {
    id: 'order-abc-123', order_code: 'NN20260826-0099', customer_id: 'cust-1',
    status: 'order_delivered', payment_status: 'paid', payment_method: 'razorpay',
    subtotal_amount: 2000, delivery_fee: 0, discount_amount: 0, total_amount: opts.totalAmount,
    tip_amount: 0,
    delivery_address: 'Prantik Flat no 1, 87/2, Baghajatin Place, Birnagar, Garia, Kolkata, West Bengal 700086, India',
    placed_at: '2026-08-26T10:00:00Z', created_at: '2026-08-26T10:00:00Z', razorpay_payment_id: 'pay_test123',
  };

  const storeOrders = Array.from({ length: opts.storeCount }, (_, i) => ({
    id: `so-${i + 1}`, store_id: `store-${i + 1}`, delivery_partner_id: 'partner-1', status: 'order_delivered',
  }));

  const items: any[] = [];
  let n = 1;
  for (const so of storeOrders) {
    for (let i = 0; i < opts.itemsPerStore; i++) {
      items.push({
        id: `item-${n}`, store_order_id: so.id, product_id: `prod-${n}`,
        product_name: `Test Product ${n}`, unit: 'pc', unit_price: 105 + n, quantity: 1, item_status: 'confirmed',
      });
      n++;
    }
  }

  const products = items.map((it) => ({ id: it.product_id, master_product_id: `mp-${it.product_id}` }));
  const masterProducts = items.map((it) => ({ id: `mp-${it.product_id}`, gst_rate: 5, is_loose: false, hsn_code: '21069099' }));
  const stores = storeOrders.map((so, i) => ({ id: so.store_id, name: `Test Store ${i + 1}`, phone: '9999999999', address: `${i + 1} Store Street, Kolkata` }));

  const tables: Record<string, any> = {
    customer_orders: chain({ data: orderRow, error: null }),
    customers: chain({ data: { name: 'Rounak', surname: '', phone: '9876543210', address: 'X', city: 'Kolkata', state: 'West Bengal', pincode: '700086' }, error: null }),
    app_users: chain({ data: { name: 'Rounak', email: 'r@example.com', phone: '9876543210' }, error: null }),
    store_orders: chain({ data: storeOrders, error: null }),
    order_items: chain({ data: items, error: null }),
    products: chain({ data: products, error: null }),
    master_products: chain({ data: masterProducts, error: null }),
    stores: chain({ data: stores, error: null }),
    delivery_partners: chain({ data: { user_id: 'partner-1', name: 'Rider One', phone: '9000000000' }, error: null }),
    customer_payments: chain({ data: { razorpay_order_id: 'order_rzp_1' }, error: null }),
    invoices: chain({ data: null, error: null }),
    invoice_items: chain({ data: null, error: null }),
    invoice_documents: chain({ data: null, error: null }),
  };

  tables.invoices.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  tables.invoices.insert = vi.fn(() => ({
    select: () => ({ single: () => Promise.resolve({ data: { id: 'inv-1', invoice_number: 'INV-2026-000099' }, error: null }) }),
  }));

  let insertedItemRows: any[] = [];
  tables.invoice_items.select = vi.fn(() => tables.invoice_items);
  tables.invoice_items.eq = vi.fn(() => Promise.resolve({ count: 0, error: null }));
  tables.invoice_items.insert = vi.fn((rows: any[]) => { insertedItemRows = rows; return Promise.resolve({ error: null }); });

  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    if (!tables[table]) throw new Error(`Unmocked table: ${table}`);
    return tables[table];
  });

  const uploaded: Record<string, Buffer> = {};
  (supabaseAdmin.storage.getBucket as any).mockResolvedValue({ error: null });
  (supabaseAdmin.storage.from as any).mockReturnValue({
    upload: vi.fn((path: string, buf: Buffer) => { uploaded[path] = buf; return Promise.resolve({ error: null }); }),
  });

  return { uploaded, getInsertedItemRows: () => insertedItemRows };
}

function pdfPageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

describe('invoice generation — multi-store pages, HSN, fee breakdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('single-store order: one store page + one fee-breakdown page', async () => {
    const { uploaded } = setupMocks({ storeCount: 1, itemsPerStore: 3, totalAmount: 500 });
    await invoiceService.generateForOrder('order-abc-123');
    const pdfPath = Object.keys(uploaded).find((p) => p.startsWith('customer/'));
    expect(pdfPath).toBeTruthy();
    expect(pdfPageCount(uploaded[pdfPath!])).toBe(2);
  });

  it('two-store order: two store pages + one fee-breakdown page, never merged into one table', async () => {
    const { uploaded } = setupMocks({ storeCount: 2, itemsPerStore: 3, totalAmount: 500 });
    await invoiceService.generateForOrder('order-abc-123');
    const pdfPath = Object.keys(uploaded).find((p) => p.startsWith('customer/'));
    expect(pdfPath).toBeTruthy();
    expect(pdfPageCount(uploaded[pdfPath!])).toBe(3);
  });

  it('paginates a single store\'s items table across pages when it overflows one page', async () => {
    const { uploaded } = setupMocks({ storeCount: 1, itemsPerStore: 40, totalAmount: 5000 });
    await invoiceService.generateForOrder('order-abc-123');
    const pdfPath = Object.keys(uploaded).find((p) => p.startsWith('customer/'));
    expect(pdfPath).toBeTruthy();
    // 40 rows at 26pt each can't fit one page — table continuation + fee page = 3+.
    expect(pdfPageCount(uploaded[pdfPath!])).toBeGreaterThanOrEqual(3);
  });

  it('persists the real per-product HSN code, not a hardcoded default', async () => {
    const { getInsertedItemRows } = setupMocks({ storeCount: 1, itemsPerStore: 2, totalAmount: 500 });
    await invoiceService.generateForOrder('order-abc-123');
    const rows = getInsertedItemRows();
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.hsn_code).toBe('21069099');
      expect(row.hsn_code).not.toBe('2106'); // the old hardcoded default
    }
  });

  it('grand_total reconciles to order.total_amount, not an independently re-derived (and inflated) figure', async () => {
    const { getInsertedItemRows } = setupMocks({ storeCount: 1, itemsPerStore: 1, totalAmount: 130.55 });
    // Sanity: with 1 item at price ~106 and total_amount forced to 130.55,
    // the old buggy layer-2-GST logic would have produced a different
    // (higher) independently-computed grand_total. We can't reach into
    // buildInvoiceData directly (not exported), so this is asserted via the
    // invoice header row inserted into the DB.
    let insertedHeader: any = null;
    const originalFrom = (supabaseAdmin.from as any).getMockImplementation();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      const c = originalFrom(table);
      if (table === 'invoices') {
        const origInsert = c.insert;
        c.insert = vi.fn((row: any) => { insertedHeader = row; return origInsert(row); });
      }
      return c;
    });
    await invoiceService.generateForOrder('order-abc-123');
    getInsertedItemRows();
    expect(insertedHeader?.grand_total).toBe(130.55);
  });
});
