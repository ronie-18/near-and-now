/**
 * Checkout GST Calculations
 * Matches the invoice service calculation logic exactly
 */

import { PLATFORM_FEE, HANDLING_FEE } from './deliveryFees';

const DEFAULT_GST_RATE = 5; // 5% GST for food items
const FEE_GST_RATE = 5; // 5% GST on platform and handling fees

interface GSTBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface CheckoutTotals {
  // Item totals
  itemsSubtotal: number; // Items price without GST
  itemsGST: GSTBreakdown;
  itemsTotal: number; // Items with GST
  
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
 * Calculate GST split for intra-state (CGST + SGST)
 */
function calcGSTSplit(taxableValue: number, gstPercent: number, isInterState: boolean = false): GSTBreakdown {
  const half = gstPercent / 2;
  
  if (isInterState) {
    const igst = round2(taxableValue * gstPercent / 100);
    return { cgst: 0, sgst: 0, igst, total: igst };
  }
  
  const cgst = round2(taxableValue * half / 100);
  const sgst = round2(taxableValue * half / 100);
  return { cgst, sgst, igst: 0, total: cgst + sgst };
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
  // STEP 1: Calculate Items GST (on cart subtotal)
  // ═══════════════════════════════════════════════════════════════════════════
  // Cart subtotal is the base price (taxable value)
  const itemsSubtotal = round2(cartSubtotal);
  const itemsGST = calcGSTSplit(itemsSubtotal, DEFAULT_GST_RATE);
  const itemsTotal = round2(itemsSubtotal + itemsGST.total);
  
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
  
  // Subtotal = Items (with GST) + Platform fee + Handling fee + Delivery - Discount
  const subtotal = round2(
    itemsTotal + platformFeeTotal + handlingFeeTotal + deliveryFee - discount
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
    itemsSubtotal,
    itemsGST,
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
    subtotal: totals.itemsSubtotal,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    orderTotal: totals.grandTotal
  };
}
