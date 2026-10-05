/**
 * Category editor helpers on the products list.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect } from 'vitest';
import { categoryOptions, describeCategorySaveError } from '../src/utils/productCategory';

describe('categoryOptions', () => {
  it('keeps the loaded order when the current category is in it', () => {
    expect(categoryOptions(['Dairy', 'Snacks', 'Staples'], 'Snacks')).toEqual(['Dairy', 'Snacks', 'Staples']);
  });
  it('puts a current category missing from the list first', () => {
    expect(categoryOptions(['Dairy', 'Staples'], 'Old Stuff')).toEqual(['Old Stuff', 'Dairy', 'Staples']);
  });
  it('drops duplicates and blanks', () => {
    expect(categoryOptions(['Dairy', '', 'Dairy', 'Staples'], 'Dairy')).toEqual(['Dairy', 'Staples']);
  });
  it('offers only the current category when the list did not load', () => {
    expect(categoryOptions([], 'Staples')).toEqual(['Staples']);
  });
});

describe('describeCategorySaveError', () => {
  it('explains a category that no longer exists (foreign key)', () => {
    const msg = 'That category no longer exists. Refresh the page and pick another one.';
    expect(describeCategorySaveError({ code: '23503', message: 'insert or update on table "master_products" violates foreign key constraint "master_products_category_fkey"' })).toBe(msg);
    expect(describeCategorySaveError({ message: 'violates foreign key constraint "master_products_category_fkey"' })).toBe(msg);
  });
  it('explains a save that matched no row', () => {
    expect(describeCategorySaveError({ code: 'PGRST116', message: 'x' })).toMatch(/^The category was not saved\. The product may have been deleted/);
  });
  it('passes other messages through, with a fallback', () => {
    expect(describeCategorySaveError({ message: 'network down' })).toBe('The category was not saved (network down).');
    expect(describeCategorySaveError(null)).toBe('The category was not saved. Please try again.');
  });
});
