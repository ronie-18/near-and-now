/**
 * Rules for changing a catalog product's discounted price and MRP from the
 * products list. They match the full edit form (EditProductPage): the discounted
 * price must be above zero, the MRP is optional (blank means "no discount",
 * i.e. the same as the discounted price) and must not be below it,
 * which master_products also enforces (check_discounted_price).
 *
 * Discounted price is master_products.discounted_price and MRP is base_price; both
 * apply in every store.
 */

export type PriceField = 'price' | 'mrp';
export type PriceFieldErrors = Partial<Record<PriceField, string>>;

export type PriceEditResult =
  | { ok: true; price: number; mrp: number }
  | { ok: false; errors: PriceFieldErrors };

const toNumber = (text: string) => (text.trim() ? Number(text.trim()) : NaN);

export function validatePriceEdit(input: { price: string; mrp: string }): PriceEditResult {
  const errors: PriceFieldErrors = {};
  const price = toNumber(input.price);
  const mrpText = input.mrp.trim();
  const mrp = mrpText ? toNumber(mrpText) : price;

  if (!Number.isFinite(price) || price <= 0) {
    errors.price = 'Enter a discounted price above ₹0';
  }
  if (mrpText && (!Number.isFinite(mrp) || mrp <= 0)) {
    errors.mrp = 'Enter an MRP above ₹0, or leave it blank';
  } else if (!errors.price && mrp < price) {
    errors.mrp = 'MRP must be at least the discounted price';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, price, mrp };
}

/** A readable reason for a failed price save. */
export function describePriceSaveError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  if (message.includes('check_discounted_price')) {
    return 'The discounted price cannot be higher than the MRP.';
  }
  // .single() on an update that matched no row: the product is gone, or the
  // database refused the change for this admin session.
  if (e.code === 'PGRST116') {
    return 'The price was not saved. The product may have been deleted, or your session cannot edit products. Refresh and try again.';
  }
  return message ? `The price was not saved (${message}).` : 'The price was not saved. Please try again.';
}
