/**
 * Stat-card share: the real percentage of the catalog, not a rounded guess.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect } from 'vitest';
import { formatShare } from '../src/utils/format';

describe('formatShare', () => {
  const cases: Array<[number, number, string]> = [
    [19464, 43224, '45.03%'],
    [19541, 43476, '44.95%'],
    [23935, 43476, '55.05%'],
    [1, 2, '50%'],
    [1, 8, '12.5%'],
    [1, 3, '33.33%'],
    [0, 43476, '0%'],
    [43476, 43476, '100%'],
    [1, 43476, '<0.01%'],
    [43475, 43476, '>99.99%'],
    [5, 43476, '0.01%'],
    [3, 43476, '<0.01%'],
    [5, 0, ''],
    [NaN, 10, ''],
  ];
  for (const [part, total, expected] of cases) {
    it(`${part} of ${total} → ${expected || '(empty)'}`, () => expect(formatShare(part, total)).toBe(expected));
  }
});
