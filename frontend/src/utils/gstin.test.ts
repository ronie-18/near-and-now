import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GSTIN_EXAMPLE, gstinHint, isValidGstin } from './gstin';

// utils/gstin.ts is a word-for-word copy of backend/src/utils/gstin.ts (and
// nearandnowcustomerapp/lib/gstin.ts). If they drift, the website could accept
// a GSTIN the backend rejects at checkout, or word errors differently.
describe('website GSTIN validator', () => {
  it('is identical to the backend copy', () => {
    const website = readFileSync(resolve(__dirname, 'gstin.ts'), 'utf8');
    const backend = readFileSync(resolve(__dirname, '../../../backend/src/utils/gstin.ts'), 'utf8');
    expect(website).toBe(backend);
  });

  it('the admin panel copy is identical too', () => {
    const admin = readFileSync(resolve(__dirname, '../../../admin/src/utils/gstin.ts'), 'utf8');
    const backend = readFileSync(resolve(__dirname, '../../../backend/src/utils/gstin.ts'), 'utf8');
    expect(admin).toBe(backend);
  });

  it.each([
    ['29AAHCR4320E1ZJ', true],
    ['27AAPFU0939F1ZV', true],
    [GSTIN_EXAMPLE, true],
    ['22AAAAA0000A1Z5', false], // the old placeholder — wrong check character
    ['29AAHCR4321E1ZJ', false], // one digit mistyped
  ])('%s → %s', (g, ok) => {
    expect(isValidGstin(g)).toBe(ok);
  });

  it('explains a typo', () => {
    expect(gstinHint('22AAAAA0000A1Z5')).toMatch(/mistyped/);
  });
});
