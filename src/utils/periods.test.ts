import { describe, expect, it } from 'vitest';
import { buildPeriodsFromAnchor, DEFAULT_ANCHOR, periodForRange } from './periods';
import { matchPotName } from './expenseLines';

describe('periodForRange', () => {
  const periods = buildPeriodsFromAnchor(DEFAULT_ANCHOR, '2026-09-19', 1);

  it('picks the period with the most overlap', () => {
    const { period } = periodForRange(periods, '2026-09-20', '2026-10-18');
    expect(period.start).toBe('2026-09-21');
    expect(period.end).toBe('2026-10-18');
  });

  it('creates later periods when needed', () => {
    const { period, periods: next } = periodForRange(periods, '2026-11-15', '2026-12-13');
    expect(period.start).toBe('2026-11-16');
    expect(next.length).toBeGreaterThan(periods.length);
  });

  it('falls back to the period containing the start without an end', () => {
    const { period } = periodForRange(periods, '2026-09-20');
    expect(period.start).toBe('2026-08-24');
  });
});

describe('matchPotName', () => {
  const names = ['Food', 'Other', 'Insurance etc', 'Costco Membership', 'Savings'];

  it('matches exact, prefix, and first word', () => {
    expect(matchPotName('food', names)).toBe('Food');
    expect(matchPotName('Costco', names)).toBe('Costco Membership');
    expect(matchPotName('Insurance and car stuff', names)).toBe('Insurance etc');
    expect(matchPotName('swami uncle', names)).toBeUndefined();
  });
});
