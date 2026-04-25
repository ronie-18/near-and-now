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

export interface InvoiceData {
  order_id: string;
  invoice_number: string;
  invoice_date: string;
  seller_name: string;
  seller_address: string;
  seller_gstin: string;
  seller_fssai: string;
  seller_pan: string;
  seller_cin: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  buyer_address: string;
  buyer_state: string;
  buyer_pincode: string;
  place_of_supply: string;
  reverse_charge: boolean;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  cess_total: number;
  delivery_fee: number;
  grand_total: number;
  amount_in_words: string;
  payment_method: string;
  payment_status: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  items: InvoiceLineItem[];
  delivery_partner_name?: string;
  delivery_partner_phone?: string;
  store_order_id?: string;
}

type DocumentType = 'customer' | 'store' | 'delivery';

// ---------------------------------------------------------------------------
// GST helpers
// ---------------------------------------------------------------------------

// Near & Now is a grocery/quick-commerce app. Default GST rate for food items is 5%.
// HSN 0402 (milk), 1101 (flour), 1006 (rice), 2106 (misc food): 0–12%.
// Using 5% as a safe default. Override per-product if HSN mapping is available.
const DEFAULT_GST_RATE = 5;

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
  // Fetch main order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('customer_orders')
    .select(`
      id, order_code, customer_id, status, payment_status, payment_method,
      subtotal_amount, delivery_fee, discount_amount, total_amount,
      delivery_address, placed_at, created_at,
      razorpay_payment_id
    `)
    .eq('id', orderId)
    .single();
  if (orderErr) throw new Error(`Order not found: ${orderErr.message}`);

  // Customer profile
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

  // Store order(s) + items
  const { data: storeOrders, error: soErr } = await supabaseAdmin
    .from('store_orders')
    .select('id, store_id, delivery_partner_id, status')
    .eq('customer_order_id', orderId);
  if (soErr) throw new Error(`Store orders not found: ${soErr.message}`);

  const storeOrder = storeOrders?.[0];

  // Items
  const storeOrderIds = (storeOrders || []).map((s: any) => s.id);
  let items: any[] = [];
  if (storeOrderIds.length) {
    const { data: oi } = await supabaseAdmin
      .from('order_items')
      .select('id, store_order_id, product_id, product_name, unit, unit_price, quantity')
      .in('store_order_id', storeOrderIds);
    items = oi || [];
  }

  // Store details
  let store: any = null;
  if (storeOrder?.store_id) {
    const { data: s } = await supabaseAdmin
      .from('stores')
      .select('id, name, phone, address')
      .eq('id', storeOrder.store_id)
      .maybeSingle();
    store = s;
  }

  // Delivery partner
  let deliveryPartner: any = null;
  if (storeOrder?.delivery_partner_id) {
    const { data: dp } = await supabaseAdmin
      .from('delivery_partners')
      .select('user_id, name, phone')
      .eq('user_id', storeOrder.delivery_partner_id)
      .maybeSingle();
    deliveryPartner = dp;
  }

  // razorpay_order_id lives in customer_payments, not customer_orders
  const { data: payment } = await supabaseAdmin
    .from('customer_payments')
    .select('razorpay_order_id')
    .eq('customer_order_id', orderId)
    .maybeSingle();

  return { order, customer, appUser, storeOrder, items, store, deliveryPartner, payment };
}

// ---------------------------------------------------------------------------
// Build InvoiceData from raw DB rows
// ---------------------------------------------------------------------------

function buildInvoiceData(raw: Awaited<ReturnType<typeof fetchOrderData>>): InvoiceData {
  const { order, customer, appUser, storeOrder, items, store, deliveryPartner, payment } = raw;
  const o = order as any;

  const buyerName = [customer?.name, customer?.surname].filter(Boolean).join(' ') || appUser?.name || 'Customer';
  const buyerPhone = customer?.phone || appUser?.phone || '';
  const buyerEmail = appUser?.email || '';
  const buyerState = customer?.state || '';
  const buyerPincode = customer?.pincode || '';
  const buyerAddress = o.delivery_address || [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ');

  const isInterState = false; // assume intra-state (same state for now)

  const lineItems: InvoiceLineItem[] = items.map((item: any, idx: number) => {
    const qty = Number(item.quantity || 1);
    const sellingPrice = Number(item.unit_price || 0);
    const mrp = sellingPrice; // no separate MRP in current schema
    const lineSubtotal = round2(sellingPrice * qty);
    const discountAmt = 0;
    const taxableValue = round2(lineSubtotal - discountAmt);
    const gstPercent = DEFAULT_GST_RATE;
    const gst = calcGstSplit(taxableValue, gstPercent, isInterState);

    return {
      line_no: idx + 1,
      product_id: item.product_id || undefined,
      product_name: item.product_name || 'Product',
      hsn_code: '2106', // default HSN for misc food preparations
      unit: item.unit || 'nos',
      mrp,
      selling_price: sellingPrice,
      quantity: qty,
      discount_amount: discountAmt,
      taxable_value: taxableValue,
      gst_percent: gstPercent,
      ...gst,
      cess_percent: 0,
      cess_amount: 0,
      line_total: round2(taxableValue + gst.cgst_amount + gst.sgst_amount + gst.igst_amount),
    };
  });

  const subtotal = round2(lineItems.reduce((s, i) => s + i.line_total, 0));
  const discountAmount = round2(Number(o.discount_amount || 0));
  const deliveryFee = round2(Number(o.delivery_fee || 0));
  const taxableAmount = round2(lineItems.reduce((s, i) => s + i.taxable_value, 0));
  const cgstTotal = round2(lineItems.reduce((s, i) => s + i.cgst_amount, 0));
  const sgstTotal = round2(lineItems.reduce((s, i) => s + i.sgst_amount, 0));
  const igstTotal = round2(lineItems.reduce((s, i) => s + i.igst_amount, 0));
  const cessTotal = round2(lineItems.reduce((s, i) => s + i.cess_amount, 0));
  const grandTotal = round2(Number(o.total_amount || 0));

  return {
    order_id: o.id,
    invoice_number: '', // filled after DB insert
    invoice_date: new Date(o.placed_at || o.created_at).toISOString().slice(0, 10),
    seller_name: store?.name || 'Near & Now Partner Store',
    seller_address: store?.address || '',
    seller_gstin: '',
    seller_fssai: '',
    seller_pan: '',
    seller_cin: '',
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_email: buyerEmail,
    buyer_address: buyerAddress,
    buyer_state: buyerState,
    buyer_pincode: buyerPincode,
    place_of_supply: buyerState || 'India',
    reverse_charge: false,
    subtotal,
    discount_amount: discountAmount,
    taxable_amount: taxableAmount,
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    igst_total: igstTotal,
    cess_total: cessTotal,
    delivery_fee: deliveryFee,
    grand_total: grandTotal,
    amount_in_words: amountToWords(grandTotal),
    payment_method: String(o.payment_method || 'razorpay'),
    payment_status: String(o.payment_status || 'paid'),
    razorpay_payment_id: o.razorpay_payment_id || '',
    razorpay_order_id: (payment as any)?.razorpay_order_id || '',
    items: lineItems,
    delivery_partner_name: deliveryPartner?.name || '',
    delivery_partner_phone: deliveryPartner?.phone || '',
    store_order_id: storeOrder?.id || '',
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

function generateCustomerPDF(inv: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80; // usable width
    const L = 40; // left margin

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(L, 30, W, 60).fill(BRAND_DARK);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('NEAR & NOW', L + 14, 44);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica').text('TAX INVOICE', L + 14, 68);
    doc.fillColor('#ffffff').fontSize(9).text(`Invoice: ${inv.invoice_number}`, L + W - 160, 44);
    doc.fillColor('#ffffff').fontSize(9).text(`Date: ${inv.invoice_date}`, L + W - 160, 58);
    doc.fillColor(BRAND_ACCENT).fontSize(9).text(`Order: ${inv.order_id.slice(0, 8).toUpperCase()}`, L + W - 160, 72);

    doc.moveDown(4.5);

    // ── Seller / Buyer block ─────────────────────────────────────────────────
    doc.fillColor(BRAND_DARK).fontSize(9).font('Helvetica-Bold').text('SOLD BY', L, doc.y);
    const sellerY = doc.y + 4;
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(inv.seller_name, L, sellerY)
      .text(inv.seller_address || '', L, doc.y);
    if (inv.seller_gstin) doc.text(`GSTIN: ${inv.seller_gstin}`, L, doc.y);
    if (inv.seller_fssai) doc.text(`FSSAI: ${inv.seller_fssai}`, L, doc.y);

    const buyerX = L + W / 2 + 10;
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('BILL TO', buyerX, sellerY - 13);
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(inv.buyer_name, buyerX, sellerY)
      .text(inv.buyer_phone, buyerX, doc.y)
      .text(inv.buyer_address || '', buyerX, doc.y, { width: W / 2 - 10 });
    if (inv.buyer_state) doc.text(`State: ${inv.buyer_state}  PIN: ${inv.buyer_pincode}`, buyerX, doc.y);

    doc.moveDown(1);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.5);

    // Payment info bar
    doc.rect(L, doc.y, W, 20).fill(GREY_LIGHT);
    doc.fillColor(GREY_TEXT).fontSize(8).font('Helvetica')
      .text(`Payment: ${inv.payment_method.toUpperCase()}  |  Status: ${inv.payment_status.toUpperCase()}`, L + 8, doc.y + 5);
    if (inv.razorpay_payment_id) {
      doc.text(`Razorpay ID: ${inv.razorpay_payment_id}`, L + 260, doc.y - 8);
    }
    doc.moveDown(1.8);

    // ── Items Table ──────────────────────────────────────────────────────────
    const cols = { no: 0, name: 20, hsn: 180, qty: 240, rate: 290, taxable: 355, gst: 415, total: 475 };

    // Table header
    doc.rect(L, doc.y, W, 18).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    const hY = doc.y + 4;
    doc.text('#', L + cols.no + 2, hY);
    doc.text('ITEM', L + cols.name, hY);
    doc.text('HSN', L + cols.hsn, hY);
    doc.text('QTY', L + cols.qty, hY);
    doc.text('RATE', L + cols.rate, hY);
    doc.text('TAXABLE', L + cols.taxable, hY);
    doc.text('GST', L + cols.gst, hY);
    doc.text('TOTAL', L + cols.total, hY);
    doc.moveDown(1.6);

    // Rows
    let rowY = doc.y;
    inv.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : GREY_LIGHT;
      doc.rect(L, rowY, W, 16).fill(bg);
      doc.fillColor('#333333').font('Helvetica').fontSize(8);
      doc.text(String(item.line_no), L + cols.no + 2, rowY + 3, { width: 18 });
      doc.text(item.product_name, L + cols.name, rowY + 3, { width: 155, ellipsis: true });
      doc.text(item.hsn_code, L + cols.hsn, rowY + 3);
      doc.text(item.quantity.toString(), L + cols.qty, rowY + 3);
      doc.text(r(item.selling_price), L + cols.rate, rowY + 3);
      doc.text(r(item.taxable_value), L + cols.taxable, rowY + 3);
      doc.text(`${item.gst_percent}%`, L + cols.gst, rowY + 3);
      doc.text(r(item.line_total), L + cols.total, rowY + 3);
      rowY += 16;
    });

    doc.y = rowY;
    doc.moveDown(0.3);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#cccccc').stroke();

    // ── Totals ───────────────────────────────────────────────────────────────
    const totalsX = L + W - 220;
    const totalsW = 220;
    doc.moveDown(0.5);
    const totStart = doc.y;

    function totRow(label: string, val: string, bold = false) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(bold ? BRAND_DARK : '#333333')
        .text(label, totalsX, doc.y, { width: 140 })
        .text(val, totalsX + 140, doc.y - 11, { width: 80, align: 'right' });
      doc.moveDown(0.4);
    }

    totRow('Subtotal:', r(inv.subtotal));
    if (inv.discount_amount > 0) totRow('Discount:', `-${r(inv.discount_amount)}`);
    totRow('Taxable Amount:', r(inv.taxable_amount));
    if (inv.cgst_total > 0) totRow(`CGST (${inv.items[0]?.cgst_percent || 0}%):`, r(inv.cgst_total));
    if (inv.sgst_total > 0) totRow(`SGST (${inv.items[0]?.sgst_percent || 0}%):`, r(inv.sgst_total));
    if (inv.igst_total > 0) totRow(`IGST (${inv.items[0]?.igst_percent || 0}%):`, r(inv.igst_total));
    if (inv.cess_total > 0) totRow('CESS:', r(inv.cess_total));
    totRow('Delivery Fee:', r(inv.delivery_fee));

    // Grand total box
    doc.rect(totalsX, doc.y, totalsW, 22).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
      .text('GRAND TOTAL:', totalsX + 6, doc.y + 5, { width: 140 })
      .text(r(inv.grand_total), totalsX + 140, doc.y - 13, { width: 74, align: 'right' });
    doc.moveDown(2.2);

    // Amount in words
    doc.rect(L, doc.y, totalsX - L - 10, doc.y - totStart + 60).fill(GREY_LIGHT);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(8)
      .text('Amount in Words:', L + 6, totStart + 4)
      .text(inv.amount_in_words, L + 6, totStart + 16, { width: totalsX - L - 20 });

    // ── GST Summary ──────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('GST SUMMARY', L, doc.y);
    doc.moveDown(0.3);

    doc.rect(L, doc.y, W, 16).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    const gY = doc.y + 3;
    doc.text('HSN Code', L + 4, gY);
    doc.text('Taxable (₹)', L + 80, gY);
    doc.text('CGST', L + 180, gY);
    doc.text('SGST', L + 270, gY);
    doc.text('IGST', L + 360, gY);
    doc.text('Total Tax', L + 440, gY);
    doc.moveDown(1.5);

    // Group by HSN
    const hsnMap = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();
    inv.items.forEach((item) => {
      const cur = hsnMap.get(item.hsn_code) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      hsnMap.set(item.hsn_code, {
        taxable: round2(cur.taxable + item.taxable_value),
        cgst: round2(cur.cgst + item.cgst_amount),
        sgst: round2(cur.sgst + item.sgst_amount),
        igst: round2(cur.igst + item.igst_amount),
      });
    });

    let gRowY = doc.y;
    Array.from(hsnMap.entries()).forEach(([hsn, vals], i) => {
      doc.rect(L, gRowY, W, 15).fill(i % 2 === 0 ? '#ffffff' : GREY_LIGHT);
      doc.fillColor('#333333').font('Helvetica').fontSize(8);
      doc.text(hsn, L + 4, gRowY + 3);
      doc.text(r(vals.taxable), L + 80, gRowY + 3);
      doc.text(r(vals.cgst), L + 180, gRowY + 3);
      doc.text(r(vals.sgst), L + 270, gRowY + 3);
      doc.text(r(vals.igst), L + 360, gRowY + 3);
      doc.text(r(vals.cgst + vals.sgst + vals.igst), L + 440, gRowY + 3);
      gRowY += 15;
    });

    doc.y = gRowY;

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.rect(L, doc.y, W, 1).fill('#dddddd');
    doc.moveDown(0.5);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(7.5)
      .text('This is a computer-generated invoice. No signature required.', L, doc.y, { align: 'center', width: W });
    doc.text('Near & Now — Your Neighbourhood, Delivered.', L, doc.y + 2, { align: 'center', width: W });
    if (inv.razorpay_payment_id) {
      doc.text(`Payment Reference: ${inv.razorpay_payment_id}`, L, doc.y + 2, { align: 'center', width: W });
    }

    doc.end();
  });
}

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
    const cols2 = { no: 0, name: 20, qty: 220, unit: 280, rate: 340, total: 430 };

    doc.rect(L, doc.y, W, 18).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    const hY2 = doc.y + 4;
    doc.text('#', L + cols2.no + 2, hY2);
    doc.text('ITEM / PRODUCT', L + cols2.name, hY2);
    doc.text('QTY', L + cols2.qty, hY2);
    doc.text('UNIT', L + cols2.unit, hY2);
    doc.text('RATE', L + cols2.rate, hY2);
    doc.text('AMOUNT', L + cols2.total, hY2);
    doc.moveDown(1.6);

    let rowY2 = doc.y;
    inv.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : GREY_LIGHT;
      doc.rect(L, rowY2, W, 18).fill(bg);
      doc.fillColor('#333333').font('Helvetica').fontSize(9);
      doc.text(String(item.line_no), L + cols2.no + 2, rowY2 + 4, { width: 18 });
      doc.text(item.product_name, L + cols2.name, rowY2 + 4, { width: 195, ellipsis: true });
      doc.text(item.quantity.toString(), L + cols2.qty, rowY2 + 4);
      doc.text(item.unit || 'nos', L + cols2.unit, rowY2 + 4);
      doc.text(r(item.selling_price), L + cols2.rate, rowY2 + 4);
      doc.text(r(item.line_total), L + cols2.total, rowY2 + 4);
      rowY2 += 18;
    });

    doc.y = rowY2;
    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#cccccc').stroke();

    // Totals
    const tX = L + W - 200;
    doc.moveDown(0.5);
    function totRow2(label: string, val: string, bold = false) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(bold ? BRAND_DARK : '#333333')
        .text(label, tX, doc.y, { width: 120 })
        .text(val, tX + 120, doc.y - 11, { width: 80, align: 'right' });
      doc.moveDown(0.4);
    }
    totRow2('Subtotal:', r(inv.subtotal));
    if (inv.discount_amount > 0) totRow2('Discount:', `-${r(inv.discount_amount)}`);
    totRow2('Tax (incl.):', r(round2(inv.cgst_total + inv.sgst_total + inv.igst_total)));
    totRow2('Delivery Fee:', r(inv.delivery_fee));
    doc.rect(tX, doc.y, 200, 22).fill(BRAND_DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
      .text('TOTAL:', tX + 6, doc.y + 5, { width: 120 })
      .text(r(inv.grand_total), tX + 120, doc.y - 13, { width: 74, align: 'right' });
    doc.moveDown(2.5);

    // Payment
    doc.rect(L, doc.y, W, 22).fill(GREY_LIGHT);
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(9)
      .text(`Payment: ${inv.payment_method.toUpperCase()}  |  Status: ${inv.payment_status.toUpperCase()}  |  Ref: ${inv.razorpay_payment_id || 'N/A'}`, L + 8, doc.y + 5);
    doc.moveDown(2);

    // Note for merchant
    doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(8)
      .text('Note: This is your merchant copy. Please retain for records and payout reconciliation.', L, doc.y, { width: W });

    // Footer
    doc.moveDown(1.5);
    doc.rect(L, doc.y, W, 1).fill('#dddddd');
    doc.moveDown(0.5);
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
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('NEAR & NOW', L + 14, 44);
    doc.fillColor('#88ff88').fontSize(9).font('Helvetica').text('DELIVERY SLIP', L + 14, 68);
    doc.fillColor('#ffffff').fontSize(9).text(`Slip: ${inv.invoice_number}`, L + W - 160, 44);
    doc.fillColor('#ffffff').fontSize(9).text(`Date: ${inv.invoice_date}`, L + W - 160, 58);
    doc.fillColor(BRAND_ACCENT).fontSize(9).text(`Order: ${inv.order_id.slice(0, 8).toUpperCase()}`, L + W - 160, 72);

    doc.moveDown(4.5);

    // Delivery details
    doc.rect(L, doc.y, W, 70).fill(GREY_LIGHT);
    const ddY = doc.y + 8;

    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(10).text('DELIVER TO:', L + 10, ddY);
    doc.fillColor('#222222').font('Helvetica-Bold').fontSize(12)
      .text(inv.buyer_name, L + 10, ddY + 16);
    doc.font('Helvetica').fontSize(10)
      .text(inv.buyer_phone, L + 10, doc.y + 2)
      .text(inv.buyer_address || '', L + 10, doc.y + 2, { width: W - 20, ellipsis: true });

    doc.moveDown(3.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.5);

    // Pickup from
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('PICKUP FROM:', L, doc.y);
    doc.fillColor('#333333').font('Helvetica').fontSize(9)
      .text(inv.seller_name, L)
      .text(inv.seller_address || '', L);

    doc.moveDown(1);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.5);

    // Items summary (minimal - just count and names)
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9).text('ORDER CONTENTS:', L, doc.y);
    doc.moveDown(0.3);

    inv.items.forEach((item) => {
      doc.fillColor('#333333').font('Helvetica').fontSize(9)
        .text(`• ${item.product_name}  ×  ${item.quantity} ${item.unit}`, L + 8, doc.y);
    });

    doc.moveDown(1);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dddddd').stroke();
    doc.moveDown(0.5);

    // Payment info
    doc.rect(L, doc.y, W, 26).fill(GREY_LIGHT);
    const pyY = doc.y + 6;
    const isCOD = (inv.payment_method || '').toLowerCase().includes('cod') ||
                  (inv.payment_method || '').toLowerCase().includes('cash');
    const payLabel = isCOD ? `COLLECT CASH: ${r(inv.grand_total)}` : `PREPAID — DO NOT COLLECT`;
    doc.fillColor(isCOD ? BRAND_ACCENT : '#007700').font('Helvetica-Bold').fontSize(11)
      .text(payLabel, L + 10, pyY, { align: 'center', width: W - 20 });
    doc.moveDown(2.5);

    // Delivery partner section
    if (inv.delivery_partner_name) {
      doc.fillColor(GREY_TEXT).font('Helvetica').fontSize(8)
        .text(`Assigned To: ${inv.delivery_partner_name}  |  ${inv.delivery_partner_phone}`, L, doc.y);
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(1);
    doc.rect(L, doc.y, W, 1).fill('#dddddd');
    doc.moveDown(0.5);
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
