import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { paymentService } from '../services/payment.service.js';
import { validateQuantity } from '../utils/quantity.js';

// The customer-facing confirmation screen's own countdown is 30s
// (ADD_MORE_WINDOW_SECONDS in nearandnowcustomerapp); this is a server-side
// backstop with a small grace period for request latency, not a second
// independent timer the customer sees — a request arriving after this is
// rejected outright, closing the window a client could otherwise keep open
// by delaying its own request.
const ADD_ITEMS_WINDOW_MS = 35_000;

type SubmittedItem = { product_id?: string; quantity?: number };
type TrustedItem = {
  store_order_id: string;
  product_id: string; // per-store products.id, not master_product_id
  product_name: string;
  unit: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

/**
 * Diffs the submitted items against the order's existing store_orders and
 * re-prices everything server-side — never trusts a client-supplied price,
 * same SECURITY-010 pattern as the main checkout. An item whose product
 * isn't carried by any store already part of this order is rejected outright
 * (out of scope: adding a brand-new store to an already-placed order).
 */
async function resolveTrustedItems(
  customerOrderId: string,
  submitted: SubmittedItem[]
): Promise<{ items: TrustedItem[]; error?: string }> {
  const { data: storeOrders } = await supabaseAdmin
    .from('store_orders')
    .select('id, store_id')
    .eq('customer_order_id', customerOrderId);

  const storeOrderByStoreId = new Map((storeOrders ?? []).map((so: any) => [so.store_id, so.id]));
  const storeIds = [...storeOrderByStoreId.keys()];
  if (storeIds.length === 0) {
    return { items: [], error: 'This order has no stores to add items to.' };
  }

  const masterProductIds = [...new Set(submitted.map((it) => it.product_id).filter(Boolean))] as string[];
  if (masterProductIds.length === 0) {
    return { items: [], error: 'No items to add.' };
  }

  const { data: productRows, error: productsError } = await supabaseAdmin
    .from('products')
    .select('id, store_id, master_product_id')
    .in('store_id', storeIds)
    .in('master_product_id', masterProductIds)
    .eq('is_active', true);
  if (productsError) throw new Error('Failed to verify product availability');

  const { data: masterRows, error: masterError } = await supabaseAdmin
    .from('master_products')
    .select('id, name, unit, image_url, discounted_price, gst_rate, is_loose, min_quantity, max_quantity')
    .in('id', masterProductIds);
  if (masterError) throw new Error('Failed to verify product prices');
  const masterById = new Map((masterRows ?? []).map((row: any) => [row.id, row]));

  // Prefer a store this order already has more items from, so an item
  // available at more than one of the order's stores doesn't get assigned to
  // whichever store_order happens first in an otherwise-arbitrary DB row
  // order. Existing counts are fixed for the whole batch (fetched once, not
  // re-read per item), so multiple new items for the same ambiguous product
  // all land on the same store consistently rather than drifting mid-batch.
  const { data: existingItemRows } = await supabaseAdmin
    .from('order_items')
    .select('store_order_id')
    .in('store_order_id', [...storeOrderByStoreId.values()]);
  const existingCountByStoreOrderId = new Map<string, number>();
  for (const row of existingItemRows ?? []) {
    const soId = (row as any).store_order_id;
    existingCountByStoreOrderId.set(soId, (existingCountByStoreOrderId.get(soId) ?? 0) + 1);
  }

  const productOptionsByMaster = new Map<string, Array<{ store_id: string; product_id: string }>>();
  for (const row of productRows ?? []) {
    const list = productOptionsByMaster.get((row as any).master_product_id) ?? [];
    list.push({ store_id: (row as any).store_id, product_id: row.id });
    productOptionsByMaster.set((row as any).master_product_id, list);
  }
  for (const options of productOptionsByMaster.values()) {
    options.sort((a, b) => {
      const countA = existingCountByStoreOrderId.get(storeOrderByStoreId.get(a.store_id)!) ?? 0;
      const countB = existingCountByStoreOrderId.get(storeOrderByStoreId.get(b.store_id)!) ?? 0;
      if (countB !== countA) return countB - countA; // most existing items first
      return a.store_id.localeCompare(b.store_id); // deterministic tiebreak
    });
  }

  const items: TrustedItem[] = [];
  for (const sub of submitted) {
    const masterId = sub.product_id;
    if (!masterId) continue;
    const master = masterById.get(masterId);
    if (!master) {
      return { items: [], error: `Product is no longer available.` };
    }
    const options = productOptionsByMaster.get(masterId) ?? [];
    if (options.length === 0) {
      return { items: [], error: `"${master.name}" isn't available from the store(s) in this order.` };
    }
    const option = options[0];
    const storeOrderId = storeOrderByStoreId.get(option.store_id);
    if (!storeOrderId) continue;

    const preTax = Number(master.discounted_price) || 0;
    const isLoose = Boolean(master.is_loose);
    const gstRate = isLoose ? 0 : Math.max(0, Number(master.gst_rate) || 0);
    const unitPrice = preTax + (preTax * gstRate) / 100;

    let quantity: number;
    try {
      quantity = validateQuantity(
        sub.quantity,
        { min_quantity: master.min_quantity ?? null, max_quantity: master.max_quantity ?? null },
        master.name
      );
    } catch (err: any) {
      return { items: [], error: err?.message || `Invalid quantity for "${master.name}".` };
    }

    items.push({
      store_order_id: storeOrderId,
      product_id: option.product_id,
      product_name: master.name,
      unit: master.unit,
      image_url: master.image_url ?? null,
      unit_price: unitPrice,
      quantity,
      subtotal: unitPrice * quantity,
    });
  }

  return { items };
}

/**
 * POST /api/orders/:orderId/add-items/create-payment
 * Re-prices the submitted items, rejects if the 30s(+grace) add-more window
 * has closed, and opens a separate Razorpay order for just the delta —
 * the original order's own payment is never touched.
 */
export async function createAdditionPayment(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const items = Array.isArray(req.body?.items) ? (req.body.items as SubmittedItem[]) : [];

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('customer_orders')
      .select('id, customer_id, placed_at')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order || order.customer_id !== req.customerId) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const placedAt = order.placed_at ? new Date(order.placed_at).getTime() : null;
    if (!placedAt || Date.now() - placedAt > ADD_ITEMS_WINDOW_MS) {
      return res.status(400).json({ success: false, error: 'The add-items window for this order has closed.' });
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items to add.' });
    }

    // A pending request already has a live Razorpay order backing it — don't
    // create a second one for the same customer_order (e.g. a screen remount
    // re-firing the confirmation screen's once-only effect, or two sessions
    // on the same account). Reject rather than silently double-charging;
    // the normal single-attempt path never reaches this branch.
    const { data: existingPending } = await supabaseAdmin
      .from('order_addition_requests')
      .select('id')
      .eq('customer_order_id', orderId)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingPending) {
      return res.status(409).json({ success: false, error: 'An add-items payment for this order is already in progress.' });
    }

    const { items: trustedItems, error: resolveError } = await resolveTrustedItems(orderId, items);
    if (resolveError) {
      return res.status(400).json({ success: false, error: resolveError });
    }

    const subtotalAmount = trustedItems.reduce((sum, it) => sum + it.subtotal, 0);
    if (subtotalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'No items to add.' });
    }

    const { data: request, error: insertErr } = await supabaseAdmin
      .from('order_addition_requests')
      .insert({ customer_order_id: orderId, items: trustedItems, subtotal_amount: subtotalAmount })
      .select()
      .single();
    if (insertErr) {
      // 23505 = unique_violation on the partial index (migration 20260906000000)
      // — a concurrent call for this same order won the race between our
      // SELECT check above and this INSERT. That's the actual race-safe
      // guard; the earlier check is just a fast-path for the common case.
      if ((insertErr as any).code === '23505') {
        return res.status(409).json({ success: false, error: 'An add-items payment for this order is already in progress.' });
      }
      throw insertErr;
    }

    const paymentOrder = await paymentService.createAdditionPaymentOrder({
      additionRequestId: request.id,
      customerOrderId: orderId,
      amount: subtotalAmount,
    });

    await supabaseAdmin
      .from('order_addition_requests')
      .update({ razorpay_order_id: paymentOrder.razorpay_order_id })
      .eq('id', request.id);

    res.json({
      success: true,
      request_id: request.id,
      subtotal_amount: subtotalAmount,
      razorpay_order_id: paymentOrder.razorpay_order_id,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      key_id: paymentOrder.key_id,
      razorpay_mode: paymentOrder.razorpay_mode,
    });
  } catch (error: any) {
    console.error('❌ createAdditionPayment error:', error);
    const statusCode = error?.statusCode === 400 ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error?.message || 'Failed to prepare payment' });
  }
}

/**
 * POST /api/orders/:orderId/add-items/verify-payment
 * Same signature-verify + strict-amount-check pattern as the main checkout's
 * verifyPayment, scoped to this addition request instead of the order's
 * total. Only on success does apply_order_addition_request() actually
 * insert the items and roll the order's totals forward.
 */
export async function verifyAdditionPayment(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    const { request_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!request_id || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
    }

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('order_addition_requests')
      .select('*, customer_orders!inner(customer_id)')
      .eq('id', request_id)
      .eq('customer_order_id', orderId)
      .maybeSingle();

    if (fetchErr || !request || (request as any).customer_orders.customer_id !== req.customerId) {
      return res.status(404).json({ success: false, error: 'Addition request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, error: `This addition was already ${request.status}.` });
    }
    if (request.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    const isValid = await paymentService.verifyPayment({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      signature: razorpay_signature,
    });
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    const captureResult = await paymentService.ensurePaymentCaptured(razorpay_payment_id);
    if (captureResult.status !== 'captured') {
      return res.status(400).json({ success: false, error: `Payment not captured (status: ${captureResult.status})` });
    }

    const payment = await paymentService.getPaymentDetails(razorpay_payment_id) as any;
    const trustedAmountPaise = Math.round(Number(request.subtotal_amount) * 100);
    const strictChecksPassed =
      String(payment?.status).toLowerCase() === 'captured' &&
      payment?.order_id === razorpay_order_id &&
      Number(payment?.amount || 0) === trustedAmountPaise;

    if (!strictChecksPassed) {
      console.warn('[ADD-ITEMS] Strict checks failed', { request_id, orderId, payment });
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    const { data: applied, error: applyErr } = await supabaseAdmin
      .rpc('apply_order_addition_request', { p_request_id: request_id, p_razorpay_payment_id: razorpay_payment_id });
    if (applyErr) throw applyErr;
    if (!applied) {
      return res.status(404).json({ success: false, error: 'Addition request not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ verifyAdditionPayment error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to verify payment' });
  }
}
