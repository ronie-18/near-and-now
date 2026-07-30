/**
 * Checkout Bill Calculations
 *
 * CALCULATION FLOW:
 * 1. Taxable value = item total (each item's own price already has its real
 *    per-product GST baked in server-side — no further checkout-page markup)
 * 2. MRP = Taxable value (no checkout-page GST overlay)
 * 3. Final amount = MRP - discount
 */

import { PLATFORM_FEE, HANDLING_FEE } from './deliveryFees';

const FEE_GST_RATE = 5; // 5% GST on platform and handling fees

interface GSTBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface CheckoutTotals {
  // Item totals
  itemsTaxableValue: number; // Base price without GST (taxable value)
  itemsGST: GSTBreakdown; // GST calculated on taxable value
  itemsMRP: number; // MRP = Taxable value + GST
  itemsTotal: number; // Final = MRP - discount

  // Fee breakdown (with embedded GST)
  platformFeeTotal: number; // ₹9.50
  platformFeeBase: number; // ₹9.05
  platformFeeGST: number; // ₹0.45

  handlingFeeTotal: number; // ₹5.50
  handlingFeeBase: number; // ₹5.24
  handlingFeeGST: number; // ₹0.26

  // Delivery
  deliveryFee: number; // No GST

  // Discount
  discount: number;

  // Totals
  subtotal: number; // Items + platform + handling + delivery - discount
  totalGST: GSTBreakdown; // All GST combined
  grandTotal: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate complete checkout totals with proper GST breakdown
 * Matches backend invoice.service.ts logic exactly
 */
export function calculateCheckoutTotals(
  cartSubtotal: number,
  deliveryFee: number,
  discount: number = 0
): CheckoutTotals {
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Calculate Items - Taxable value, MRP
  // ═══════════════════════════════════════════════════════════════════════════
  // Cart subtotal is the taxable value. Each item's own price already has its
  // real per-product GST baked in server-side (master_products.gst_rate, via
  // transformProductRowToProduct/priceWithGst) — by design, the checkout page
  // no longer adds a further flat 5% on top of that (that extra line was a
  // double-count, not a real additional charge). itemsGST is kept at zero
  // rather than removed from the type so existing callers reading the field
  // don't break; it plays no part in itemsMRP/itemsTotal/grandTotal below.
  const itemsTaxableValue = round2(cartSubtotal);
  const itemsGST: GSTBreakdown = { cgst: 0, sgst: 0, igst: 0, total: 0 };

  // MRP = Taxable value (no checkout-page GST overlay added)
  const itemsMRP = itemsTaxableValue;

  // Final item total = MRP - discount
  const itemsTotal = round2(itemsMRP - discount);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Platform & Handling Fees (Reverse GST Calculation)
  // ═══════════════════════════════════════════════════════════════════════════
  // These fees have GST embedded. We need to extract the base and GST.
  // Formula: base = total / (1 + gst_rate)

  const platformFeeTotal = PLATFORM_FEE; // ₹9.50
  const platformFeeBase = round2(platformFeeTotal / (1 + FEE_GST_RATE / 100));
  const platformFeeGST = round2(platformFeeTotal - platformFeeBase);

  const handlingFeeTotal = HANDLING_FEE; // ₹5.50
  const handlingFeeBase = round2(handlingFeeTotal / (1 + FEE_GST_RATE / 100));
  const handlingFeeGST = round2(handlingFeeTotal - handlingFeeBase);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Calculate Totals
  // ═══════════════════════════════════════════════════════════════════════════

  // Subtotal = Items total + Platform fee + Handling fee + Delivery
  const subtotal = round2(
    itemsTotal + platformFeeTotal + handlingFeeTotal + deliveryFee
  );

  // Total GST = Items GST + Platform fee GST + Handling fee GST
  const totalFeeGST = round2(platformFeeGST + handlingFeeGST);
  const feeCGST = round2(totalFeeGST / 2);
  const feeSGST = round2(totalFeeGST / 2);

  const totalGST: GSTBreakdown = {
    cgst: round2(itemsGST.cgst + feeCGST),
    sgst: round2(itemsGST.sgst + feeSGST),
    igst: 0,
    total: round2(itemsGST.total + totalFeeGST)
  };

  const grandTotal = subtotal;

  return {
    itemsTaxableValue,
    itemsGST,
    itemsMRP,
    itemsTotal,
    platformFeeTotal,
    platformFeeBase,
    platformFeeGST,
    handlingFeeTotal,
    handlingFeeBase,
    handlingFeeGST,
    deliveryFee,
    discount,
    subtotal,
    totalGST,
    grandTotal
  };
}

/**
 * Simple calculation for backward compatibility
 */
export function calculateOrderTotals(cartTotal: number, deliveryFee: number, discount: number = 0) {
  const totals = calculateCheckoutTotals(cartTotal, deliveryFee, discount);
  return {
    subtotal: totals.itemsTaxableValue,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    orderTotal: totals.grandTotal
  };
}
