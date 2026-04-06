/**
 * GST rate from DB is a percentage (e.g. 18 means 18%).
 * Pre-tax amount × (1 + rate/100) = amount inclusive of GST for display and cart.
 */
export function parseGstRatePercent(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function priceWithGst(preTaxAmount: number, gstRatePercent: number): number {
  if (!Number.isFinite(preTaxAmount) || preTaxAmount < 0) return 0;
  return preTaxAmount + (preTaxAmount * gstRatePercent) / 100;
}
