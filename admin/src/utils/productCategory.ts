/**
 * Moving a catalog product to another existing category from the products
 * list. master_products.category is the category's name and a foreign key to
 * categories(name), so only names that exist can be saved; the change applies
 * in every store.
 */

/**
 * Category names to offer, in the given order. The product's current category
 * is always included (first) even if the loaded list does not have it, so the
 * picker never shows a different category than the one saved.
 */
export function categoryOptions(categoryNames: string[], current: string): string[] {
  const names = categoryNames.filter((name, i) => name && categoryNames.indexOf(name) === i);
  return current && !names.includes(current) ? [current, ...names] : names;
}

/** A readable reason for a failed category save. */
export function describeCategorySaveError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  // master_products_category_fkey: the category was deleted or renamed meanwhile.
  if (e.code === '23503' || message.includes('master_products_category_fkey')) {
    return 'That category no longer exists. Refresh the page and pick another one.';
  }
  // .single() on an update that matched no row: the product is gone, or the
  // database refused the change for this admin session.
  if (e.code === 'PGRST116') {
    return 'The category was not saved. The product may have been deleted, or your session cannot edit products. Refresh and try again.';
  }
  return message ? `The category was not saved (${message}).` : 'The category was not saved. Please try again.';
}
