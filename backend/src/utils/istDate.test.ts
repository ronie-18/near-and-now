import { describe, it, expect } from 'vitest';
import { istDateString } from './istDate.js';

describe('istDateString', () => {
  it('rolls over at 00:00 IST (18:30 UTC), not at UTC midnight', () => {
    expect(istDateString('2026-10-26T18:29:59Z')).toBe('2026-10-26');
    expect(istDateString('2026-10-26T18:30:00Z')).toBe('2026-10-27');
    expect(istDateString('2026-10-26T23:59:59Z')).toBe('2026-10-27');
  });

  it('crosses month and year ends in IST', () => {
    expect(istDateString('2026-10-31T19:00:00Z')).toBe('2026-11-01');
    expect(istDateString('2026-12-31T20:00:00Z')).toBe('2027-01-01');
  });

  it('accepts a Date, an ISO string with an offset, or epoch ms', () => {
    const at = new Date('2026-03-31T18:45:00Z');
    expect(istDateString(at)).toBe('2026-04-01');
    expect(istDateString('2026-04-01T00:15:00+05:30')).toBe('2026-04-01');
    expect(istDateString(at.getTime())).toBe('2026-04-01');
  });
});
