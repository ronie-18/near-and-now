import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../config/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceLineItem {
  line_no: number;
  product_id?: string;
  product_name: string;
  hsn_code: string;
  unit: string;
  mrp: number;
  selling_price: number;
  quantity: number;
  discount_amount: number;
  taxable_value: number;
  gst_percent: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  cess_percent: number;
  cess_amount: number;
  line_total: number;
}

/**
 * One store's self-contained slice of a (possibly multi-store) order — its
 * own seller identity and its own items/taxable/GST totals only. A real
 * multi-vendor marketplace invoice (this one included, per 2026-08-26
 * product decision) issues one tax-invoice section per seller, never a
 * single mixed table across stores that were never actually the same legal
 * seller.
 */
export interface StoreInvoiceGroup {
  store_order_id: string;
  seller_name: string;
  seller_address: string;
  seller_gstin: string;
  seller_fssai: string;
  seller_pan: string;
  seller_cin: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxable_value: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
}

/** One row of the platform-fee breakdown page (seller = Near & Now itself, not any store). */
export interface FeeLine {
  label: string;
  total: number;
  base: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
}

export interface InvoiceData {
  order_id: string;
  invoice_number: string;
  invoice_date: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  buyer_address: string;
  buyer_state: string;
  buyer_pincode: string;
  place_of_supply: string;
  reverse_charge: boolean;

  // Per-store sections (one tax-invoice page-set each).
  store_groups: StoreInvoiceGroup[];

  // Platform fee-breakdown page (seller = Near & Now).
  fee_seller_name: string;
  fee_lines: FeeLine[];
  fees_total: number;
  fees_cgst_total: number;
  fees_sgst_total: number;
  delivery_fee: number;
  tip_amount: number;

  discount_amount: number;
  taxable_amount: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  cess_total: number;
  subtotal: number;
  grand_total: number;
  amount_in_words: string;

  payment_method: string;
  payment_status: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;

  // Flat item list across every store — kept because invoice_items has no
  // per-store grouping concept, and generateStorePDF/generateDeliveryPDF
  // (unchanged by this pass — see bug_fixes_2026-07-23.md) still expect one
  // flat list. Equal to store_groups.flatMap(g => g.items).
  items: InvoiceLineItem[];
  // First store's identity — same backward-compatibility reason as `items`.
  seller_name: string;
  seller_address: string;
  seller_gstin: string;
  seller_fssai: string;
  seller_pan: string;
  seller_cin: string;

  delivery_partner_name?: string;
  delivery_partner_phone?: string;
  store_order_id?: string;
}

type DocumentType = 'customer' | 'store' | 'delivery';

// ---------------------------------------------------------------------------
// GST helpers
// ---------------------------------------------------------------------------

function calcGstSplit(
  taxableValue: number,
  gstPercent: number,
  isInterState: boolean
): {
  cgst_percent: number; cgst_amount: number;
  sgst_percent: number; sgst_amount: number;
  igst_percent: number; igst_amount: number;
} {
  const half = gstPercent / 2;
  if (isInterState) {
    const igst = round2(taxableValue * gstPercent / 100);
    return { cgst_percent: 0, cgst_amount: 0, sgst_percent: 0, sgst_amount: 0, igst_percent: gstPercent, igst_amount: igst };
  }
  const cgst = round2(taxableValue * half / 100);
  const sgst = round2(taxableValue * half / 100);
  return { cgst_percent: half, cgst_amount: cgst, sgst_percent: half, sgst_amount: sgst, igst_percent: 0, igst_amount: 0 };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Amount in words
// ---------------------------------------------------------------------------

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
               'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
               'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function wordsBelow100(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

function wordsBelow1000(n: number): string {
  if (n < 100) return wordsBelow100(n);
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + wordsBelow100(n % 100) : '');
}

function amountToWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  function convert(n: number): string {
    if (n === 0) return '';
    if (n < 1000) return wordsBelow1000(n);
    if (n < 100000) return wordsBelow1000(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + wordsBelow1000(n % 1000) : '');
    if (n < 10000000) return wordsBelow1000(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return wordsBelow1000(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupeeWords = rupees === 0 ? 'Zero' : convert(rupees);
  const paiseWords = paise > 0 ? ' and ' + wordsBelow100(paise) + ' Paise' : '';
  return 'INR ' + rupeeWords + paiseWords + ' Only';
}

// ---------------------------------------------------------------------------
// Fetch order data from Supabase
// ---------------------------------------------------------------------------

async function fetchOrderData(orderId: string) {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('customer_orders')
    .select(`
      id, order_code, customer_id, status, payment_status, payment_method,
      subtotal_amount, delivery_fee, discount_amount, total_amount, tip_amount,
      delivery_address, placed_at, created_at,
      razorpay_payment_id
    `)
    .eq('id', orderId)
    .single();
  if (orderErr) throw new Error(`Order not found: ${orderErr.message}`);

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('name, surname, phone, address, city, state, pincode')
    .eq('user_id', (order as any).customer_id)
    .maybeSingle();

  const { data: appUser } = await supabaseAdmin
    .from('app_users')
    .select('name, email, phone')
    .eq('id', (order as any).customer_id)
    .maybeSingle();

  // ALL store orders for this customer order — an order with items from
  // multiple stores has one row per store here. Previously only the first
  // was ever used (storeOrders?.[0]), which silently merged every other
  // store's items/identity under whichever store happened to be first.
  const { data: storeOrders, error: soErr } = await supabaseAdmin
    .from('store_orders')
    .select('id, store_id, delivery_partner_id, status')
    .eq('customer_order_id', orderId);
  if (soErr) throw new Error(`Store orders not found: ${soErr.message}`);
  if (!storeOrders?.length) throw new Error('No store orders found for this order');

  const storeOrderIds = storeOrders.map((s: any) => s.id);
  const { data: oi } = await supabaseAdmin
    .from('order_items')
    .select('id, store_order_id, product_id, product_name, unit, unit_price, quantity, item_status')
    .in('store_order_id', storeOrderIds);
  // Items the shopkeeper marked unavailable were never fulfilled/charged —
  // excluding them here keeps every total consistent by construction.
  const allItems: any[] = (oi || []).filter((it: any) => it.item_status !== 'unavailable');

  // Real per-product GST rate + HSN code for accurate line-item tax
  // reporting. order_items only stores unit_price (already GST-inclusive at
  // the product's own rate) — rate and HSN both live on master_products via
  // products.master_product_id. Previously hsn_code was never fetched at
  // all; every line item printed a hardcoded '2106' regardless of the real
  // product.
  const productIds = [...new Set(allItems.map((it: any) => it.product_id).filter(Boolean))];
  const masterIdByProduct = new Map<string, string>();
  if (productIds.length) {
    const { data: productRows } = await supabaseAdmin
      .from('products')
      .select('id, master_product_id')
      .in('id', productIds);
    for (const p of productRows || []) masterIdByProduct.set((p as any).id, (p as any).master_product_id);
  }

  const masterIds = [...new Set(Array.from(masterIdByProduct.values()))];
  const masterInfoById = new Map<string, { gst_rate: number; is_loose: boolean; hsn_code: string }>();
  if (masterIds.length) {
    const { data: masterRows } = await supabaseAdmin
      .from('master_products')
      .select('id, gst_rate, is_loose, hsn_code')
      .in('id', masterIds);
    for (const m of masterRows || []) {
      masterInfoById.set((m as any).id, {
        gst_rate: Number((m as any).gst_rate) || 0,
        is_loose: Boolean((m as any).is_loose),
        hsn_code: ((m as any).hsn_code || '').trim(),
      });
    }
  }

  for (const it of allItems) {
    const masterId = masterIdByProduct.get(it.product_id);
    const info = masterId ? masterInfoById.get(masterId) : undefined;
    // Loose products carry no per-item GST (matches checkout pricing rule).
    it.gst_rate = info?.is_loose ? 0 : (info?.gst_rate ?? 0);
    it.hsn_code = info?.hsn_code || '';
  }

  // Group items by their own store order — this is what actually drives the
  // per-store invoice pages.
  const itemsByStoreOrder = new Map<string, any[]>();
  for (const it of allItems) {
    const list = itemsByStoreOrder.get(it.store_order_id) || [];
    list.push(it);
    itemsByStoreOrder.set(it.store_order_id, list);
  }

  // All stores involved, fetched in one batch (was: only stores?.[0]).
  const storeIds = [...new Set(storeOrders.map((s: any) => s.store_id).filter(Boolean))];
  const storesById = new Map<string, any>();
  if (storeIds.length) {
    const { data: storeRows } = await supabaseAdmin
      .from('stores')
      .select('id, name, phone, address')
      .in('id', storeIds);
    for (const s of storeRows || []) storesById.set((s as any).id, s);
  }

  // Delivery partner shown on the delivery slip — same store used before
  // (first store order's partner) since a single rider typically runs the
  // whole multi-store pickup sequence for one customer order.
  const firstStoreOrder = storeOrders[0];
  let deliveryPartner: any = null;
  if (firstStoreOrder?.delivery_partner_id) {
    const { data: dp } = await supabaseAdmin
      .from('delivery_partners')
      .select('user_id, name, phone')
      .eq('user_id', firstStoreOrder.delivery_partner_id)
      .maybeSingle();
    deliveryPartner = dp;
  }

  // razorpay_order_id lives in customer_payments, not customer_orders
  const { data: payment } = await supabaseAdmin
    .from('customer_payments')
    .select('razorpay_order_id')
    .eq('customer_order_id', orderId)
    .maybeSingle();

  return {
    order, customer, appUser, storeOrders, itemsByStoreOrder, storesById,
    deliveryPartner, payment,
  };
}

// ---------------------------------------------------------------------------
// Build InvoiceData from raw DB rows
// ---------------------------------------------------------------------------

function buildLineItems(items: any[], isInterState: boolean): InvoiceLineItem[] {
  return items.map((item: any, idx: number) => {
    const qty = Number(item.quantity || 1);
    const unitPrice = Number(item.unit_price || 0);
    const sellingTotal = round2(unitPrice * qty);

    const gstPercent = Number(item.gst_rate) || 0;
    const taxableValue = round2(sellingTotal / (1 + gstPercent / 100));
    const gst = calcGstSplit(taxableValue, gstPercent, isInterState);

    const mrp = round2(taxableValue + gst.cgst_amount + gst.sgst_amount + gst.igst_amount);
    const discountAmt = 0;
    const lineTotal = round2(mrp - discountAmt);

    return {
      line_no: idx + 1,
      product_id: item.product_id || undefined,
      product_name: item.product_name || 'Product',
      hsn_code: item.hsn_code || '',
      unit: item.unit || 'nos',
      mrp,
      selling_price: unitPrice,
      quantity: qty,
      discount_amount: discountAmt,
      taxable_value: taxableValue,
      gst_percent: gstPercent,
      ...gst,
      cess_percent: 0,
      cess_amount: 0,
      line_total: lineTotal,
    };
  });
}

function buildInvoiceData(raw: Awaited<ReturnType<typeof fetchOrderData>>): InvoiceData {
  const { order, customer, appUser, storeOrders, itemsByStoreOrder, storesById, deliveryPartner, payment } = raw;
  const o = order as any;

  const buyerName = [customer?.name, customer?.surname].filter(Boolean).join(' ') || appUser?.name || 'Customer';
  const buyerPhone = customer?.phone || appUser?.phone || '';
  const buyerEmail = appUser?.email || '';
  const buyerState = customer?.state || '';
  const buyerPincode = customer?.pincode || '';
  const buyerAddress = o.delivery_address || [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ');

  const isInterState = false; // assume intra-state (same state for now)

  // ── Per-store sections ──────────────────────────────────────────────────
  // stores.gstin/fssai/pan don't exist as columns yet (no shopkeeper-facing
  // way to enter them either) — every store's registration fields render as
  // "N/A", same fallback the footer/seller blocks already used before this
  // change; not something this pass adds or fixes.
  const storeGroups: StoreInvoiceGroup[] = storeOrders.map((so: any) => {
    const store = storesById.get(so.store_id);
    const rawItems = itemsByStoreOrder.get(so.id) || [];
    const lineItems = buildLineItems(rawItems, isInterState);

    return {
      store_order_id: so.id,
      seller_name: store?.name || 'Near & Now Partner Store',
      seller_address: store?.address || '',
      seller_gstin: '',
      seller_fssai: '',
      seller_pan: '',
      seller_cin: '',
      items: lineItems,
      subtotal: round2(lineItems.reduce((s, i) => s + i.line_total, 0)),
      taxable_value: round2(lineItems.reduce((s, i) => s + i.taxable_value, 0)),
      cgst_total: round2(lineItems.reduce((s, i) => s + i.cgst_amount, 0)),
      sgst_total: round2(lineItems.reduce((s, i) => s + i.sgst_amount, 0)),
      igst_total: round2(lineItems.reduce((s, i) => s + i.igst_amount, 0)),
    };
  });

  const itemsSubtotal = round2(storeGroups.reduce((s, g) => s + g.subtotal, 0));
  const itemsTaxableAmount = round2(storeGroups.reduce((s, g) => s + g.taxable_value, 0));
  const itemsCgstTotal = round2(storeGroups.reduce((s, g) => s + g.cgst_total, 0));
  const itemsSgstTotal = round2(storeGroups.reduce((s, g) => s + g.sgst_total, 0));
  const itemsIgstTotal = round2(storeGroups.reduce((s, g) => s + g.igst_total, 0));

  // ── Platform fee breakdown (seller = Near & Now, not any store) ────────
  // Fixed amounts with embedded 5% GST — matches the backend's own
  // order-total source of truth exactly (database.service.ts's
  // PLATFORM_FEE/HANDLING_FEE = 9.5/5.5). The previous version of this file
  // additionally invented a separate flat 5% "checkout GST" layer on top of
  // the item subtotal (DEFAULT_GST_RATE) — that layer was removed from
  // actual checkout pricing on 2026-07-31 (see checkoutCalculations.ts /
  // database.service.ts comments) as a double-count, but this invoice
  // generator kept charging for it anyway, inflating grand_total above what
  // the customer actually paid. Removed here; grand_total now reconciles to
  // order.total_amount (ground truth) instead of being independently
  // re-derived with a phantom extra charge.
  const feeGstRate = 0.05;
  const platformFeeWithGst = 9.50;
  const handlingFeeWithGst = 5.50;

  const platformFeeBase = round2(platformFeeWithGst / (1 + feeGstRate));
  const platformFeeGst = round2(platformFeeWithGst - platformFeeBase);
  const handlingFeeBase = round2(handlingFeeWithGst / (1 + feeGstRate));
  const handlingFeeGst = round2(handlingFeeWithGst - handlingFeeBase);

  const feeLines: FeeLine[] = [
    {
      label: 'Platform / Processing Fee',
      total: platformFeeWithGst,
      base: platformFeeBase,
      cgst_percent: 2.5, cgst_amount: round2(platformFeeGst / 2),
      sgst_percent: 2.5, sgst_amount: round2(platformFeeGst / 2),
      igst_percent: 0, igst_amount: 0,
    },
    {
      label: 'Handling Fee',
      total: handlingFeeWithGst,
      base: handlingFeeBase,
      cgst_percent: 2.5, cgst_amount: round2(handlingFeeGst / 2),
      sgst_percent: 2.5, sgst_amount: round2(handlingFeeGst / 2),
      igst_percent: 0, igst_amount: 0,
    },
  ];
  const feesTotal = round2(feeLines.reduce((s, f) => s + f.total, 0));
  const feesCgstTotal = round2(feeLines.reduce((s, f) => s + f.cgst_amount, 0));
  const feesSgstTotal = round2(feeLines.reduce((s, f) => s + f.sgst_amount, 0));

  const deliveryFee = round2(Number(o.delivery_fee || 0));
  const tipAmount = round2(Number(o.tip_amount || 0));
  const discountAmount = round2(Number(o.discount_amount || 0));

  const cgstTotal = round2(itemsCgstTotal + feesCgstTotal);
  const sgstTotal = round2(itemsSgstTotal + feesSgstTotal);
  const igstTotal = itemsIgstTotal;
  const taxableAmount = round2(itemsTaxableAmount + platformFeeBase + handlingFeeBase);

  const computedSubtotal = round2(itemsSubtotal + feesTotal + deliveryFee + tipAmount - discountAmount);

  // grand_total is what the customer was actually charged — ground truth
  // from the order row, not re-derived (see comment above). Logged, not
  // silently overwritten, if it ever drifts from the computed breakdown so a
  // real discrepancy stays visible instead of being hidden by always
  // trusting one side.
  const dbTotal = Number(o.total_amount);
  const grandTotal = Number.isFinite(dbTotal) && dbTotal > 0 ? round2(dbTotal) : computedSubtotal;
  if (Number.isFinite(dbTotal) && Math.abs(grandTotal - computedSubtotal) > 0.5) {
    console.warn(
      `[INVOICE] order ${o.id}: computed breakdown (${computedSubtotal}) doesn't match order.total_amount (${grandTotal}) — showing the actual charged amount, but the breakdown above it may not fully reconcile.`
    );
  }

  const flatItems = storeGroups.flatMap((g) => g.items);
  const firstGroup = storeGroups[0];

  return {
    order_id: o.id,
    invoice_number: '', // filled after DB insert
    invoice_date: new Date(o.placed_at || o.created_at).toISOString().slice(0, 10),
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_email: buyerEmail,
    buyer_address: buyerAddress,
    buyer_state: buyerState,
    buyer_pincode: buyerPincode,
    place_of_supply: buyerState || 'India',
    reverse_charge: false,

    store_groups: storeGroups,

    fee_seller_name: 'Near & Now Digital Commerce',
    fee_lines: feeLines,
    fees_total: feesTotal,
    fees_cgst_total: feesCgstTotal,
    fees_sgst_total: feesSgstTotal,
    delivery_fee: deliveryFee,
    tip_amount: tipAmount,

    discount_amount: discountAmount,
    taxable_amount: taxableAmount,
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    igst_total: igstTotal,
    cess_total: 0,
    subtotal: computedSubtotal,
    grand_total: grandTotal,
    amount_in_words: amountToWords(grandTotal),

    payment_method: String(o.payment_method || 'razorpay'),
    payment_status: String(o.payment_status || 'paid'),
    razorpay_payment_id: o.razorpay_payment_id || '',
    razorpay_order_id: (payment as any)?.razorpay_order_id || '',

    items: flatItems,
    seller_name: firstGroup?.seller_name || 'Near & Now Partner Store',
    seller_address: firstGroup?.seller_address || '',
    seller_gstin: firstGroup?.seller_gstin || '',
    seller_fssai: firstGroup?.seller_fssai || '',
    seller_pan: firstGroup?.seller_pan || '',
    seller_cin: firstGroup?.seller_cin || '',

    delivery_partner_name: deliveryPartner?.name || '',
    delivery_partner_phone: deliveryPartner?.phone || '',
    store_order_id: firstGroup?.store_order_id || '',
  };
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

// Brand colours
const BRAND_DARK = '#1a1a2e';
const BRAND_ACCENT = '#e94560';
const GREY_LIGHT = '#f5f5f5';
const GREY_TEXT = '#666666';

function r(n: number): string {
  return '₹' + n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Customer tax invoice — one page-set per store, plus one fee-breakdown page
// ---------------------------------------------------------------------------

function generateCustomerPDF(inv: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 30, bottom: 30, left: 30, right: 30 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 30, R = 565, W = R - L; // 535pt usable
    const PAGE_BOTTOM = doc.page.height - 30;

    const vLine = (rx: number, y1: number, y2: number) =>
      doc.moveTo(rx, y1).lineTo(rx, y2).strokeColor('#000000').lineWidth(0.5).stroke();
    const box = (x: number, ry: number, w: number, h: number) =>
      doc.rect(x, ry, w, h).strokeColor('#000000').lineWidth(0.5).stroke();
    const t = (text: string, x: number, ry: number, opts: Record<string, unknown> = {}) =>
      doc.text(text, x, ry, { lineBreak: false, ...opts });

    // ── Header — identical on every page ────────────────────────────────
    function drawHeader(y: number): number {
      const h = 54;
      box(L, y, W, h);
      const divX = L + 275;
      vLine(divX, y, y + h);

      doc.rect(L + 5, y + 9, 36, 36).fill('#FF8C00').stroke();
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      t('N&N', L + 14, y + 23);

      doc.fillColor('#1a1a1a').fontSize(19).font('Helvetica-Bold');
      t('NEAR & NOW', L + 48, y + 9);
      doc.fillColor('#FF8C00').fontSize(8.5).font('Helvetica-Oblique');
      t('Digital Dukan, Local Dil Se', L + 48, y + 34);

      doc.fillColor('#1a1a1a').fontSize(17).font('Helvetica-Bold');
      t('Tax Invoice', divX + 5, y + 18, { width: R - divX - 10, align: 'right' });

      return y + h;
    }

    // ── Seller block — parameterized so it can render either a store's own
    //    identity or Near & Now's (fee-breakdown page) ───────────────────
    function drawSellerBlock(
      y: number,
      seller: { name: string; address: string; gstin: string; fssai: string; pan: string; cin: string },
    ): number {
      const qrW = 135;
      const infoW = W - qrW;
      const qrX = L + infoW;

      const labelH = 14;
      box(L, y, W, labelH);
      vLine(qrX, y, y + labelH);
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      t('Sold By / Seller', L + 4, y + 3);
      y += labelH;

      const nameH = 26;
      box(L, y, infoW, nameH);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t(seller.name, L + 4, y + 3);
      if (seller.address) {
        doc.fillColor('#000000').fontSize(7).font('Helvetica');
        t(seller.address, L + 4, y + 14, { width: infoW - 8, ellipsis: true });
      }

      const infoRows = [
        { label: 'GSTIN', value: seller.gstin || 'N/A', labelW: 95 },
        { label: 'FSSAI License Number', value: seller.fssai || 'N/A', labelW: 95 },
        { label: 'CIN', value: seller.cin || 'N/A', labelW: 95 },
        { label: 'PAN', value: seller.pan || 'N/A', labelW: 95 },
      ];
      const infoRowH = 13;
      let rowY = y + nameH;
      infoRows.forEach(row => {
        box(L, rowY, infoW, infoRowH);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
        t(row.label, L + 4, rowY + 3);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        t(': ' + row.value, L + row.labelW + 4, rowY + 3, { width: infoW - row.labelW - 10, ellipsis: true });
        rowY += infoRowH;
      });

      const totalSellerH = nameH + infoRows.length * infoRowH;

      box(qrX, y, qrW, totalSellerH);
      const qrSize = 52;
      const qrPX = qrX + (qrW - qrSize) / 2;
      const qrPY = y + 6;
      box(qrPX, qrPY, qrSize, qrSize);
      doc.moveTo(qrPX, qrPY).lineTo(qrPX + qrSize, qrPY + qrSize).strokeColor('#aaaaaa').lineWidth(0.3).stroke();
      doc.moveTo(qrPX + qrSize, qrPY).lineTo(qrPX, qrPY + qrSize).strokeColor('#aaaaaa').lineWidth(0.3).stroke();
      doc.lineWidth(0.5).strokeColor('#000000');

      doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
      t(`Invoice Number : ${inv.invoice_number}`, qrX + 3, qrPY + qrSize + 5, { width: qrW - 6, align: 'center' });

      return y + totalSellerH;
    }

    // ── Invoice To / Order block — fixed to avoid the address/pincode
    //    overlap: address gets its own row sized to however many lines it
    //    actually wraps to (computed via heightOfString), pincode moved to
    //    its own row below it instead of being crammed into the same label
    //    as the full address text. ───────────────────────────────────────
    function drawBuyerBlock(y: number): number {
      const splitX = L + Math.round(W * 0.58);
      const buyerLabelW = 90;
      const addressValueW = splitX - L - buyerLabelW - 8;

      const invoiceDateStr = (() => {
        try {
          return new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          });
        } catch {
          return inv.invoice_date;
        }
      })();

      doc.fontSize(7.5).font('Helvetica');
      const addressH = Math.max(12, doc.heightOfString(inv.buyer_address || '', { width: addressValueW }));

      const fixedRows: [string, string][] = [
        ['Invoice To', 'Near & Now'],
        ['Name', inv.buyer_name],
      ];
      const rowH = 15;
      const addressRowH = addressH + 4;
      const tailRows: [string, string][] = [
        ['Pincode', inv.buyer_pincode || ''],
        ['State', inv.buyer_state || ''],
      ];

      const blockH = fixedRows.length * rowH + addressRowH + tailRows.length * rowH + 6;
      box(L, y, W, blockH);
      vLine(splitX, y, y + blockH);

      let ly = y + 4;
      fixedRows.forEach(([label, value]) => {
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
        t(label, L + 4, ly);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        t(': ' + value, L + buyerLabelW, ly, { width: splitX - L - buyerLabelW - 8, ellipsis: true });
        ly += rowH;
      });

      // Address — own row, wraps to as many lines as it needs.
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('Address', L + 4, ly);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      doc.text(': ' + (inv.buyer_address || ''), L + buyerLabelW, ly, {
        width: addressValueW, lineBreak: true,
      });
      ly += addressRowH;

      tailRows.forEach(([label, value]) => {
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
        t(label, L + 4, ly);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        t(': ' + value, L + buyerLabelW, ly, { width: splitX - L - buyerLabelW - 8, ellipsis: true });
        ly += rowH;
      });

      // Right column: order details
      const odX = splitX + 5;
      const odLW = 65;
      let oy = y + 4;

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('Order Id', odX, oy);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': ' + inv.order_id, odX + odLW, oy, { width: R - odX - odLW - 5, ellipsis: true });
      oy += 14;

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('Invoice Date', odX, oy);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': ' + invoiceDateStr, odX + odLW, oy);
      oy += 14;

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('Place of Supply', odX, oy);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': ' + (inv.place_of_supply || inv.buyer_state || ''), odX + odLW + 20, oy, { width: R - odX - odLW - 25, ellipsis: true });

      return y + blockH;
    }

    const colDefs = [
      { label: 'Sr. no',             w: 25 },
      { label: 'HSN',                w: 35 },
      { label: 'Item Description',   w: 95 },
      { label: 'MRP',                w: 32 },
      { label: 'Discount',           w: 32 },
      { label: 'Qty.',               w: 22 },
      { label: 'Taxable\nValue',     w: 40 },
      { label: 'CGST\n(%)',          w: 28 },
      { label: 'CGST\n(INR)',        w: 32 },
      { label: 'SGST\n(%)',          w: 28 },
      { label: 'SGST\n(INR)',        w: 32 },
      { label: 'Cess\n(%)',          w: 28 },
      { label: 'Additional\nCess Val', w: 40 },
      { label: 'Total',              w: 36 },
    ];
    const rawW = colDefs.reduce((s, c) => s + c.w, 0);
    const scale = W / rawW;
    const cw = colDefs.map(c => c.w * scale);
    const ROW_H = 26;
    const HDR_H = 22;

    function drawTableHeader(y: number): number {
      box(L, y, W, HDR_H);
      let cx = L;
      colDefs.forEach((col, i) => {
        if (i > 0) vLine(cx, y, y + HDR_H);
        doc.fillColor('#000000').fontSize(6.5).font('Helvetica-Bold')
          .text(col.label, cx + 1, y + 2, { width: cw[i] - 2, align: 'center', lineBreak: true });
        cx += cw[i];
      });
      return y + HDR_H;
    }

    // Renders the items table for one store, paginating (new page + repeated
    // table header) whenever a row would run past the bottom margin — a
    // single-store invoice with enough line items now correctly spans
    // multiple pages instead of the old implementation, which had no
    // pagination at all and just let rows run off the page.
    function drawItemsTable(startY: number, items: InvoiceLineItem[]): number {
      let y = startY;
      y = drawTableHeader(y);

      items.forEach(item => {
        if (y + ROW_H > PAGE_BOTTOM) {
          doc.addPage();
          y = drawHeader(30);
          y = drawTableHeader(y);
        }
        box(L, y, W, ROW_H);
        let cx = L;
        const vals = [
          String(item.line_no),
          item.hsn_code || 'N/A',
          item.product_name,
          item.mrp.toFixed(2),
          item.discount_amount.toFixed(2),
          String(item.quantity),
          item.taxable_value.toFixed(2),
          String(item.cgst_percent),
          item.cgst_amount.toFixed(2),
          String(item.sgst_percent),
          item.sgst_amount.toFixed(2),
          String(item.cess_percent),
          item.cess_amount.toFixed(2),
          item.line_total.toFixed(2),
        ];
        vals.forEach((v, i) => {
          if (i > 0) vLine(cx, y, y + ROW_H);
          const align: 'left' | 'right' | 'center' = i === 2 ? 'left' : (i < 2 ? 'center' : 'right');
          doc.fillColor('#000000').fontSize(7).font('Helvetica')
            .text(v, cx + 2, y + 4, { width: cw[i] - 4, align, lineBreak: false, ellipsis: true });
          cx += cw[i];
        });
        y += ROW_H;
      });

      return y;
    }

    function drawTotalRow(y: number, totalQty: number, cgst: number, sgst: number, total: number): number {
      if (y + 14 > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(30);
      }
      const totRowH = 14;
      box(L, y, W, totRowH);
      let cx = L;
      colDefs.forEach((_, i) => {
        if (i > 0) vLine(cx, y, y + totRowH);
        let val = '';
        if (i === 0) val = 'Total';
        else if (i === 5) val = String(totalQty);
        else if (i === 8) val = cgst.toFixed(2);
        else if (i === 10) val = sgst.toFixed(2);
        else if (i === 13) val = total.toFixed(2);
        if (val) {
          doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
            .text(val, cx + 2, y + 3, { width: cw[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false });
        }
        cx += cw[i];
      });
      return y + totRowH;
    }

    // Amount-in-words — fixed to size its box from the actual wrapped
    // height of the text instead of a fixed 16pt (which is what caused the
    // value to visibly run into the block below it whenever it wrapped to a
    // second line, e.g. any total in the thousands).
    function drawAmountInWords(y: number, words: string): number {
      const labelW = 55;
      const valueW = W - labelW - 5;
      doc.fontSize(7.5).font('Helvetica');
      const textH = doc.heightOfString(words, { width: valueW });
      // Minimum 20, not 16 — the "Amount in / Words" label itself wraps to two
      // lines at y+4/y+12, which needs ~20pt to fit comfortably even when the
      // value text is short enough to fit on one line.
      const wH = Math.max(20, textH + 8);

      if (y + wH > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(30);
      }

      box(L, y, W, wH);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('Amount in', L + 4, y + 4);
      t('Words', L + 4, y + 12);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      doc.text(words, L + labelW, y + 4, { width: valueW, lineBreak: true });
      return y + wH;
    }

    function drawFooterSellerBlock(y: number): number {
      if (y + 60 > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(30);
      }
      const sigW = 110;
      const infoW = W - sigW;
      const sigX = L + infoW;
      const fH = 60;
      box(L, y, W, fH);
      vLine(sigX, y, y + fH);

      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      t('Near & Now Digital Commerce ', L + 4, y + 5);
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Oblique');
      doc.text('(formerly known as Near & Now)', L + 4 + doc.widthOfString('Near & Now Digital Commerce '), y + 5, {
        lineBreak: false, width: infoW - 10,
      });

      const midX = L + infoW / 2;
      const labelW1 = 30;
      const labelW2 = 100;

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('GSTIN', L + 4, y + 22);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': N/A', L + labelW1 + 4, y + 22, { width: midX - L - labelW1 - 8, ellipsis: true });
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('CIN', L + 4, y + 36);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': N/A', L + labelW1 + 4, y + 36, { width: midX - L - labelW1 - 8, ellipsis: true });

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('FSSAI License Number', midX + 4, y + 22);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': N/A', midX + labelW2 + 4, y + 22, { width: sigX - midX - labelW2 - 8, ellipsis: true });
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      t('PAN', midX + 4, y + 36);
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
      t(': N/A', midX + labelW1 + 4, y + 36, { width: sigX - midX - labelW1 - 8, ellipsis: true });

      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      t('Authorised Signatory', sigX + 3, y + fH - 14, { width: sigW - 6, align: 'center' });

      return y + fH;
    }

    function drawReverseChargeAndTerms(y: number): void {
      if (y + 14 > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(30);
      }
      const rcH = 14;
      box(L, y, W, rcH);
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      t(`Whether the tax is payable on reverse charge - ${inv.reverse_charge ? 'Yes' : 'No'}`, L + 4, y + 3);
      y += rcH;

      y += 5;
      if (y + 60 > PAGE_BOTTOM) {
        doc.addPage();
        y = drawHeader(30) + 5;
      }
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold').text('Terms & Conditions:', L, y);
      y += 13;
      const terms = [
        '1. If you have any issues or queries in respect of your order, please contact customer chat support through the Near & Now platform or drop in an email.',
        "2. In case you need to get more information about the seller's FSSAI status, please visit https://foscos.fssai.gov.in/ and use the FBO search option with FSSAI License / Registration number.",
        '3. Please note that we never ask for bank account details such as CVV, account number, UPI Pin, etc. across our support channels. For your safety please do not share these details with anyone over any medium.',
        '4. MRP displayed on the platform is as printed on the product package. Actual MRP and amount payable may be a function of offers/discounts and/or the revised GST rates made effective by Govt.',
      ];
      terms.forEach(term => {
        doc.fillColor('#000000').fontSize(6.5).font('Helvetica').text(term, L, doc.y, { width: W, lineBreak: true });
        doc.y = doc.y + 2;
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // One page-set per store — each is a self-contained tax invoice for
    // that store's own items only, per the 2026-08-26 product decision:
    // stores were never meant to share one invoice page.
    // ═══════════════════════════════════════════════════════════════════
    inv.store_groups.forEach((group, idx) => {
      if (idx > 0) doc.addPage();
      let y = 30;
      y = drawHeader(y);
      y = drawSellerBlock(y, {
        name: group.seller_name, address: group.seller_address,
        gstin: group.seller_gstin, fssai: group.seller_fssai,
        pan: group.seller_pan, cin: group.seller_cin,
      });
      y = drawBuyerBlock(y);
      y = drawItemsTable(y, group.items);
      const totalQty = group.items.reduce((s, it) => s + it.quantity, 0);
      y = drawTotalRow(y, totalQty, group.cgst_total, group.sgst_total, group.subtotal);
      y = drawAmountInWords(y, amountToWords(group.subtotal));
      y = drawFooterSellerBlock(y);
      drawReverseChargeAndTerms(y);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Final page — platform fee breakdown (seller = Near & Now), GST-split
    // per fee, plus the whole order's grand total reconciling everything
    // above (every store's subtotal + these fees + delivery + tip - discount).
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    {
      let y = 30;
      y = drawHeader(y);
      y = drawSellerBlock(y, {
        name: inv.fee_seller_name, address: '', gstin: '', fssai: '', pan: '', cin: '',
      });
      y = drawBuyerBlock(y);

      // Fee table — same visual language as the items table, but its own
      // narrower column set (no HSN/MRP/discount, since these are service
      // fees, not products).
      const feeColDefs = [
        { label: 'Sr. no', w: 30 },
        { label: 'Description', w: 160 },
        { label: 'Taxable\nValue', w: 70 },
        { label: 'CGST\n(%)', w: 45 },
        { label: 'CGST\n(INR)', w: 55 },
        { label: 'SGST\n(%)', w: 45 },
        { label: 'SGST\n(INR)', w: 55 },
        { label: 'Total', w: 75 },
      ];
      const feeRawW = feeColDefs.reduce((s, c) => s + c.w, 0);
      const feeScale = W / feeRawW;
      const feeCw = feeColDefs.map(c => c.w * feeScale);

      const feeHdrH = 22;
      box(L, y, W, feeHdrH);
      let cx = L;
      feeColDefs.forEach((col, i) => {
        if (i > 0) vLine(cx, y, y + feeHdrH);
        doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold')
          .text(col.label, cx + 1, y + 4, { width: feeCw[i] - 2, align: 'center', lineBreak: true });
        cx += feeCw[i];
      });
      y += feeHdrH;

      const feeRowH = 20;
      inv.fee_lines.forEach((fee, idx) => {
        box(L, y, W, feeRowH);
        cx = L;
        const vals = [
          String(idx + 1), fee.label, fee.base.toFixed(2),
          String(fee.cgst_percent), fee.cgst_amount.toFixed(2),
          String(fee.sgst_percent), fee.sgst_amount.toFixed(2),
          fee.total.toFixed(2),
        ];
        vals.forEach((v, i) => {
          if (i > 0) vLine(cx, y, y + feeRowH);
          const align: 'left' | 'right' | 'center' = i === 1 ? 'left' : (i === 0 ? 'center' : 'right');
          doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
            .text(v, cx + 3, y + 5, { width: feeCw[i] - 5, align, lineBreak: false, ellipsis: true });
          cx += feeCw[i];
        });
        y += feeRowH;
      });

      // Non-GST lines: delivery fee, tip, discount — shown for completeness
      // so this page's own total is traceable, even though they carry no tax.
      const extraRows: [string, number][] = [
        ['Delivery Fee (no GST)', inv.delivery_fee],
        ...(inv.tip_amount > 0 ? [['Delivery Tip (no GST)', inv.tip_amount] as [string, number]] : []),
        ...(inv.discount_amount > 0 ? [['Discount', -inv.discount_amount] as [string, number]] : []),
      ];
      extraRows.forEach(([label, amt]) => {
        box(L, y, W, feeRowH);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        t(label, L + 6, y + 5, { width: W - 120 });
        t((amt < 0 ? '-' : '') + r(Math.abs(amt)), L + W - 90, y + 5, { width: 84, align: 'right' });
        y += feeRowH;
      });

      // This page's own total (fees + delivery + tip - discount).
      const feePageTotal = round2(
        inv.fees_total + inv.delivery_fee + inv.tip_amount - inv.discount_amount
      );
      box(L, y, W, feeRowH);
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      t('Total (this page)', L + 6, y + 5, { width: W - 120 });
      t(r(feePageTotal), L + W - 90, y + 5, { width: 84, align: 'right' });
      y += feeRowH;
      y += 10;

      // Whole-order grand total — every store's subtotal + this page's total.
      const allStoresTotal = round2(inv.store_groups.reduce((s, g) => s + g.subtotal, 0));
      box(L, y, W, 20);
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      t(`Store items total (all ${inv.store_groups.length} store${inv.store_groups.length > 1 ? 's' : ''})`, L + 6, y + 6, { width: W - 140 });
      t(r(allStoresTotal), L + W - 90, y + 6, { width: 84, align: 'right' });
      y += 20;
      box(L, y, W, 22);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold');
      t('ORDER GRAND TOTAL', L + 6, y + 6, { width: W - 140 });
      t(r(inv.grand_total), L + W - 92, y + 6, { width: 86, align: 'right' });
      y += 22;

      y = drawAmountInWords(y + 8, inv.amount_in_words);
      y = drawFooterSellerBlock(y);
      drawReverseChargeAndTerms(y);
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Store (merchant) copy and delivery slip — left as one document per order
// (not per store) for now; see bug_fixes_2026-07-23.md for the known
// per-store scoping gap this shares with what the customer PDF used to do.
// ---------------------------------------------------------------------------

function generateStorePDF(inv: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    const L = 40;

    // Header
    doc.rect(L, 30, W, 60).fill(BRAND_DARK);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('NEAR & NOW', L + 14, 44);
    doc.fillColor('#aaaaff').fontSize(9).font('Helvetica').text('MERCHANT / STORE COPY', L + 14, 68);
    doc.fillColor('#ffffff').fontSize(9).text(`Invoice: ${inv.invoice_number}`, L + W - 160, 44);
    doc.fillColor('#ffffff').fontSize(9).text(`Date: ${inv.invoice_date}`, L + W - 160, 58);
    doc.fillColor(BRAND_ACCENT).fontSize(9).text(`Order: ${inv.order_id.slice(0, 8).toUpperCase()}`, L + W - 160, 72);

    doc.moveDown(4.5);

    // Store details
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('STORE DETAILS', L, doc.y);
    doc.moveDown(0.3);
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(inv.seller_name, L)
      .text(inv.seller_address || '', L);
    if (inv.seller_gstin) doc.text(`GSTIN: ${inv.seller_gstin}`, L);
    if (inv.seller_fssai) doc.text(`FSSAI: ${inv.seller_fssai}`, L);
    if (inv.seller_pan) doc.text(`PAN: ${inv.seller_pan}`, L);

    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.5);

    // Delivery address (customer address shown to merchant for packing)
    doc.rect(L, doc.y, W, 40).fill(GREY_LIGHT);
    const daY = doc.y + 6;
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9)
      .text('DELIVERY ADDRESS:', L + 8, daY);
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(`${inv.buyer_name}  |  ${inv.buyer_phone}`, L + 8, daY + 14)
      .text(inv.buyer_address || '', L + 8, doc.y + 2, { width: W - 16, ellipsis: true });
    doc.moveDown(2.2);

    // Items table
    const cols2 = { no: 0, name: 30, qty: 240, unit: 300, rate: 360, total: 440 };

    doc.rect(L, doc.y, W, 18).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    const hY2 = doc.y + 5;
    doc.text('#', L + cols2.no + 4, hY2, { width: cols2.name - cols2.no - 8, align: 'center' });
    doc.text('ITEM / PRODUCT', L + cols2.name + 2, hY2);
    doc.text('QTY', L + cols2.qty + 2, hY2, { width: cols2.unit - cols2.qty - 4, align: 'right' });
    doc.text('UNIT', L + cols2.unit + 2, hY2, { width: cols2.rate - cols2.unit - 4, align: 'center' });
    doc.text('RATE', L + cols2.rate + 2, hY2, { width: cols2.total - cols2.rate - 4, align: 'right' });
    doc.text('AMOUNT', L + cols2.total + 2, hY2, { width: W - cols2.total - 4, align: 'right' });
    doc.moveDown(1.6);

    let rowY2 = doc.y;
    inv.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : GREY_LIGHT;
      doc.rect(L, rowY2, W, 18).fill(bg);
      doc.fillColor('#333333').font('Helvetica').fontSize(9);
      doc.text(String(item.line_no), L + cols2.no + 4, rowY2 + 5, { width: cols2.name - cols2.no - 8, align: 'center' });
      doc.text(item.product_name, L + cols2.name + 2, rowY2 + 5, { width: cols2.qty - cols2.name - 4, ellipsis: true });
      doc.text(item.quantity.toString(), L + cols2.qty + 2, rowY2 + 5, { width: cols2.unit - cols2.qty - 4, align: 'right' });
      doc.text(item.unit || 'nos', L + cols2.unit + 2, rowY2 + 5, { width: cols2.rate - cols2.unit - 4, align: 'center' });
      doc.text(r(item.selling_price), L + cols2.rate + 2, rowY2 + 5, { width: cols2.total - cols2.rate - 4, align: 'right' });
      doc.text(r(item.line_total), L + cols2.total + 2, rowY2 + 5, { width: W - cols2.total - 4, align: 'right' });
      rowY2 += 18;
    });

    doc.y = rowY2;
    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#cccccc').stroke();

    // Totals
    const tX = L + W - 220;
    doc.moveDown(0.5);
    function totRow2(label: string, val: string, bold = false) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(bold ? BRAND_DARK : '#333333')
        .text(label, tX, doc.y, { width: 130, align: 'left' })
        .text(val, tX + 130, doc.y - 11, { width: 90, align: 'right' });
      doc.moveDown(0.4);
    }
    totRow2('Subtotal:', r(inv.subtotal));
    if (inv.discount_amount > 0) totRow2('Discount:', `-${r(inv.discount_amount)}`);
    totRow2('Tax (incl.):', r(round2(inv.cgst_total + inv.sgst_total + inv.igst_total)));
    totRow2('Delivery Fee:', r(inv.delivery_fee));
    doc.rect(tX, doc.y, 220, 22).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
      .text('TOTAL:', tX + 6, doc.y + 5, { width: 130, align: 'left' })
      .text(r(inv.grand_total), tX + 130, doc.y - 13, { width: 84, align: 'right' });
    doc.moveDown(2.5);

    // Payment
    doc.rect(L, doc.y, W, 22).fill(GREY_LIGHT);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(9)
      .text(`Payment: ${inv.payment_method.toUpperCase()}  |  Status: ${inv.payment_status.toUpperCase()}  |  Ref: ${inv.razorpay_payment_id || 'N/A'}`, L + 8, doc.y + 6, { width: W - 16 });
    doc.moveDown(2);

    // Note for merchant
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(8)
      .text('Note: This is your merchant copy. Please retain for records and payout reconciliation.', L, doc.y, { width: W, align: 'left' });

    // Footer
    doc.moveDown(1.5);
    doc.rect(L, doc.y, W, 1).fill('#dddddd');
    doc.moveDown(0.6);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(7.5)
      .text('Near & Now — Merchant Copy | Not for customer distribution', L, doc.y, { align: 'center', width: W });

    doc.end();
  });
}

function generateDeliveryPDF(inv: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    const L = 40;

    // Header
    doc.rect(L, 30, W, 60).fill(BRAND_DARK);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('NEAR & NOW', L + 14, 44, { width: W - 180 });
    doc.fillColor('#88ff88').fontSize(9).font('Helvetica').text('DELIVERY SLIP', L + 14, 68);
    doc.fillColor('#ffffff').fontSize(9).text(`Slip: ${inv.invoice_number}`, L + W - 160, 44, { width: 150, align: 'right' });
    doc.fillColor('#ffffff').fontSize(9).text(`Date: ${inv.invoice_date}`, L + W - 160, 58, { width: 150, align: 'right' });
    doc.fillColor(BRAND_ACCENT).fontSize(9).text(`Order: ${inv.order_id.slice(0, 8).toUpperCase()}`, L + W - 160, 72, { width: 150, align: 'right' });

    doc.moveDown(4.5);

    // Delivery details
    doc.rect(L, doc.y, W, 70).fill(GREY_LIGHT);
    const ddY = doc.y + 8;

    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(10).text('DELIVER TO:', L + 10, ddY, { width: W - 20 });
    doc.fillColor('#222222').font('Helvetica-Bold').fontSize(12)
      .text(inv.buyer_name, L + 10, ddY + 16, { width: W - 20 });
    doc.font('Helvetica').fontSize(10)
      .text(inv.buyer_phone, L + 10, doc.y + 2, { width: W - 20 })
      .text(inv.buyer_address || '', L + 10, doc.y + 2, { width: W - 20, ellipsis: true });

    doc.moveDown(3.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.6);

    // Pickup from
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('PICKUP FROM:', L, doc.y, { width: W });
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(inv.seller_name, L, doc.y, { width: W })
      .text(inv.seller_address || '', L, doc.y, { width: W });

    doc.moveDown(1);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.6);

    // Items summary (minimal - just count and names)
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('ORDER CONTENTS:', L, doc.y, { width: W });
    doc.moveDown(0.4);

    inv.items.forEach((item) => {
      doc.fillColor('#333333').font('Helvetica').fontSize(9)
        .text(`• ${item.product_name}  ×  ${item.quantity} ${item.unit}`, L + 8, doc.y, { width: W - 16 });
    });

    doc.moveDown(1);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.6);

    // Payment info
    doc.rect(L, doc.y, W, 26).fill(GREY_LIGHT);
    const pyY = doc.y + 7;
    const isCOD = (inv.payment_method || '').toLowerCase().includes('cod') ||
                  (inv.payment_method || '').toLowerCase().includes('cash');
    const payLabel = isCOD ? `COLLECT CASH: ${r(inv.grand_total)}` : `PREPAID — DO NOT COLLECT`;
    doc.fillColor(isCOD ? BRAND_ACCENT : '#007700').font('Helvetica-Bold').fontSize(11)
      .text(payLabel, L, pyY, { align: 'center', width: W });
    doc.moveDown(2.5);

    // Delivery partner section
    if (inv.delivery_partner_name) {
      doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(8)
        .text(`Assigned To: ${inv.delivery_partner_name}  |  ${inv.delivery_partner_phone}`, L, doc.y, { width: W });
      doc.moveDown(0.6);
    }

    // Footer
    doc.moveDown(1.2);
    doc.rect(L, doc.y, W, 1).fill('#dddddd');
    doc.moveDown(0.6);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(7.5)
      .text('Near & Now — Delivery Slip | Operational Use Only', L, doc.y, { align: 'center', width: W });

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const BUCKET = 'invoices';
const SIGNED_URL_TTL = 3600; // 1 hour

async function ensureBucketExists(): Promise<void> {
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!error) return;
  const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (createErr && !createErr.message?.includes('already exists')) {
    throw new Error(`Failed to create storage bucket: ${createErr.message}`);
  }
}

async function uploadPDF(path: string, buffer: Buffer): Promise<{ path: string; size: number }> {
  await ensureBucketExists();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { path, size: buffer.length };
}

export async function getSignedInvoiceUrl(storagePath: string, ttl = SIGNED_URL_TTL): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttl);
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message}`);
  return data.signedUrl;
}

function storagePath(docType: DocumentType, invoiceNumber: string, date: string): string {
  const [year, month] = date.slice(0, 7).split('-');
  return `${docType}/${year}/${month}/${invoiceNumber}.pdf`;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function upsertInvoiceHeader(data: InvoiceData): Promise<{ id: string; invoice_number: string }> {
  // Check if invoice already exists for this order
  const { data: existing } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number')
    .eq('order_id', data.order_id)
    .maybeSingle();

  if (existing) return existing as { id: string; invoice_number: string };

  const row = {
    order_id: data.order_id,
    invoice_date: data.invoice_date,
    seller_name: data.seller_name,
    seller_address: data.seller_address,
    seller_gstin: data.seller_gstin,
    seller_fssai: data.seller_fssai,
    seller_pan: data.seller_pan,
    seller_cin: data.seller_cin,
    buyer_name: data.buyer_name,
    buyer_phone: data.buyer_phone,
    buyer_email: data.buyer_email,
    buyer_address: data.buyer_address,
    buyer_state: data.buyer_state,
    buyer_pincode: data.buyer_pincode,
    place_of_supply: data.place_of_supply,
    reverse_charge: data.reverse_charge,
    subtotal: data.subtotal,
    discount_amount: data.discount_amount,
    taxable_amount: data.taxable_amount,
    cgst_total: data.cgst_total,
    sgst_total: data.sgst_total,
    igst_total: data.igst_total,
    cess_total: data.cess_total,
    delivery_fee: data.delivery_fee,
    grand_total: data.grand_total,
    amount_in_words: data.amount_in_words,
    payment_method: data.payment_method,
    payment_status: data.payment_status,
    razorpay_payment_id: data.razorpay_payment_id,
    razorpay_order_id: data.razorpay_order_id,
    status: 'generated',
  };

  const { data: inserted, error } = await supabaseAdmin
    .from('invoices')
    .insert(row)
    .select('id, invoice_number')
    .single();

  if (error) throw new Error(`Failed to insert invoice: ${error.message}`);
  return inserted as { id: string; invoice_number: string };
}

async function upsertInvoiceItems(invoiceId: string, items: InvoiceLineItem[]): Promise<void> {
  const { count } = await supabaseAdmin
    .from('invoice_items')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId);

  if ((count ?? 0) > 0) return; // already inserted

  const rows = items.map((item) => ({
    invoice_id: invoiceId,
    line_no: item.line_no,
    product_id: item.product_id || null,
    product_name: item.product_name,
    hsn_code: item.hsn_code,
    unit: item.unit,
    mrp: item.mrp,
    selling_price: item.selling_price,
    quantity: item.quantity,
    discount_amount: item.discount_amount,
    taxable_value: item.taxable_value,
    gst_percent: item.gst_percent,
    cgst_percent: item.cgst_percent,
    cgst_amount: item.cgst_amount,
    sgst_percent: item.sgst_percent,
    sgst_amount: item.sgst_amount,
    igst_percent: item.igst_percent,
    igst_amount: item.igst_amount,
    cess_percent: item.cess_percent,
    cess_amount: item.cess_amount,
    line_total: item.line_total,
  }));

  const { error } = await supabaseAdmin.from('invoice_items').insert(rows);
  if (error) throw new Error(`Failed to insert invoice items: ${error.message}`);
}

async function upsertDocument(
  invoiceId: string,
  docType: DocumentType,
  pdfPath: string,
  fileSize: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('invoice_documents')
    .upsert(
      { invoice_id: invoiceId, document_type: docType, pdf_path: pdfPath, file_size: fileSize, mime_type: 'application/pdf', generated_at: new Date().toISOString() },
      { onConflict: 'invoice_id,document_type' }
    );
  if (error) throw new Error(`Failed to upsert document record: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class InvoiceService {
  /**
   * Main entry point. Idempotent — safe to call multiple times for same order.
   * Generates all 3 document types and uploads to Supabase Storage.
   */
  async generateForOrder(orderId: string): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const raw = await fetchOrderData(orderId);
    const invData = buildInvoiceData(raw);

    // 1. Create/fetch invoice header (idempotent via existing check)
    const { id: invoiceId, invoice_number } = await upsertInvoiceHeader(invData);
    invData.invoice_number = invoice_number;

    // 2. Insert line items (idempotent)
    await upsertInvoiceItems(invoiceId, invData.items);

    // 3. Generate + upload all 3 PDFs in parallel
    const docTypes: DocumentType[] = ['customer', 'store', 'delivery'];
    await Promise.all(
      docTypes.map(async (docType) => {
        // Check if already generated
        const { data: existing } = await supabaseAdmin
          .from('invoice_documents')
          .select('id')
          .eq('invoice_id', invoiceId)
          .eq('document_type', docType)
          .maybeSingle();
        if (existing) return; // already exists, skip

        const buffer = await this.renderPDF(invData, docType);
        const path = storagePath(docType, invoice_number, invData.invoice_date);
        const { size } = await uploadPDF(path, buffer);
        await upsertDocument(invoiceId, docType, path, size);
      })
    );

    console.log(`[INVOICE] Generated for order ${orderId} → ${invoice_number}`);
    return { invoiceId, invoiceNumber: invoice_number };
  }

  /**
   * Regenerate all 3 PDFs for an order (overwrites storage files).
   */
  async regenerateForOrder(orderId: string): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const raw = await fetchOrderData(orderId);
    const invData = buildInvoiceData(raw);

    const { id: invoiceId, invoice_number } = await upsertInvoiceHeader(invData);
    invData.invoice_number = invoice_number;

    await upsertInvoiceItems(invoiceId, invData.items);

    const docTypes: DocumentType[] = ['customer', 'store', 'delivery'];
    await Promise.all(
      docTypes.map(async (docType) => {
        const buffer = await this.renderPDF(invData, docType);
        const path = storagePath(docType, invoice_number, invData.invoice_date);
        const { size } = await uploadPDF(path, buffer); // upsert: true overwrites
        await upsertDocument(invoiceId, docType, path, size);
      })
    );

    return { invoiceId, invoiceNumber: invoice_number };
  }

  /**
   * Get a signed download URL for a specific document type.
   * Returns null if document not yet generated.
   */
  async getSignedUrl(orderId: string, docType: DocumentType, ttl = SIGNED_URL_TTL): Promise<string | null> {
    const { data: inv } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!inv) return null;

    const { data: doc } = await supabaseAdmin
      .from('invoice_documents')
      .select('pdf_path')
      .eq('invoice_id', (inv as any).id)
      .eq('document_type', docType)
      .maybeSingle();

    if (!doc) return null;

    return getSignedInvoiceUrl((doc as any).pdf_path, ttl);
  }

  /**
   * Get document metadata without generating a URL.
   */
  async getDocumentRecord(orderId: string, docType: DocumentType) {
    const { data: inv } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, invoice_date, grand_total')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!inv) return null;

    const { data: doc } = await supabaseAdmin
      .from('invoice_documents')
      .select('*')
      .eq('invoice_id', (inv as any).id)
      .eq('document_type', docType)
      .maybeSingle();

    return doc ? { invoice: inv, document: doc } : null;
  }

  private async renderPDF(inv: InvoiceData, docType: DocumentType): Promise<Buffer> {
    switch (docType) {
      case 'customer': return generateCustomerPDF(inv);
      case 'store':    return generateStorePDF(inv);
      case 'delivery': return generateDeliveryPDF(inv);
    }
  }
}

export const invoiceService = new InvoiceService();
