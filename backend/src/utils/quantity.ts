/**
 * Shared cart-item quantity validation for both real order-creation paths
 * (orders.controller.ts's createOrder and database.service.ts's
 * placeCheckoutOrder). Neither previously checked item.quantity at all —
 * only unit price was re-derived server-side, so a client could send any
 * quantity (negative, fractional, or far past what admin configured on
 * master_products.min_quantity/max_quantity) and it would be inserted as-is.
 */
// Loose/weighed products (is_loose = true on master_products) are sold in
// 0.25 kg steps — matching the website cart's own stepping (CartContext.tsx
// addToCart/decreaseCartQuantity). Everything else must be a whole unit.
const LOOSE_STEP = 0.25;

export function validateQuantity(
  rawQuantity: unknown,
  bounds: { min_quantity?: number | string | null; max_quantity?: number | string | null } | undefined,
  productLabel: string,
  isLoose = false
): number {
  const quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Invalid quantity for "${productLabel}".`);
  }
  if (isLoose) {
    // Allow small float error from repeated 0.25 addition/subtraction on the client.
    const steps = quantity / LOOSE_STEP;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) {
      throw new Error(`Invalid quantity for "${productLabel}".`);
    }
  } else if (!Number.isInteger(quantity)) {
    throw new Error(`Invalid quantity for "${productLabel}".`);
  }

  const min = Number(bounds?.min_quantity);
  const minQuantity = Number.isFinite(min) && min > 0 ? min : isLoose ? LOOSE_STEP : 1;
  const max = Number(bounds?.max_quantity);
  const maxQuantity = Number.isFinite(max) && max > 0 ? max : Infinity;

  if (quantity < minQuantity || quantity > maxQuantity) {
    throw new Error(
      `Quantity for "${productLabel}" must be between ${minQuantity} and ${Number.isFinite(maxQuantity) ? maxQuantity : 'unlimited'}.`
    );
  }

  return quantity;
}
