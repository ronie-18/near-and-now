/**
 * Price editor rules on the products list: the same rules as the full edit
 * form (price above zero, MRP optional and at least the price).
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect } from 'vitest';
import { validatePriceEdit, describePriceSaveError } from '../src/utils/productPrice';

describe('validatePriceEdit', () => {
  const cases: Array<[string, { price: string; mrp: string }, ReturnType<typeof validatePriceEdit>]> = [
    ['discount kept', { price: '152', mrp: '160' }, { ok: true, price: 152, mrp: 160 }],
    ['paise allowed', { price: '49.50', mrp: '55.25' }, { ok: true, price: 49.5, mrp: 55.25 }],
    ['blank MRP means no discount', { price: '60', mrp: '  ' }, { ok: true, price: 60, mrp: 60 }],
    ['MRP equal to price', { price: '60', mrp: '60' }, { ok: true, price: 60, mrp: 60 }],
    ['spaces trimmed', { price: ' 70 ', mrp: ' 80 ' }, { ok: true, price: 70, mrp: 80 }],
    ['raising price above the old MRP needs a new MRP', { price: '170', mrp: '160' }, { ok: false, errors: { mrp: 'MRP must be at least the discounted price' } }],
    ['blank price', { price: '', mrp: '160' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0' } }],
    ['zero price', { price: '0', mrp: '' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0' } }],
    ['negative price', { price: '-5', mrp: '10' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0' } }],
    ['not a number', { price: '12abc', mrp: '' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0' } }],
    ['zero MRP', { price: '10', mrp: '0' }, { ok: false, errors: { mrp: 'Enter an MRP above ₹0, or leave it blank' } }],
    ['bad price and bad MRP', { price: '0', mrp: 'x' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0', mrp: 'Enter an MRP above ₹0, or leave it blank' } }],
    ['bad price, MRP not compared', { price: '', mrp: '5' }, { ok: false, errors: { price: 'Enter a discounted price above ₹0' } }],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => expect(validatePriceEdit(input)).toEqual(expected));
  }
});

describe('describePriceSaveError', () => {
  it('names the MRP rule for the database check', () => {
    expect(describePriceSaveError({ code: '23514', message: 'new row violates check constraint "check_discounted_price"' }))
      .toBe('The discounted price cannot be higher than the MRP.');
  });
  it('explains a save that matched no row', () => {
    expect(describePriceSaveError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }))
      .toMatch(/^The price was not saved\. The product may have been deleted/);
  });
  it('passes other database messages through', () => {
    expect(describePriceSaveError({ message: 'network down' })).toBe('The price was not saved (network down).');
  });
  it('has a fallback with no message', () => {
    expect(describePriceSaveError(null)).toBe('The price was not saved. Please try again.');
    expect(describePriceSaveError(new Error(''))).toBe('The price was not saved. Please try again.');
  });
});
