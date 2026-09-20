import { describe, expect, it } from 'vitest';
import { parseHisaabPaste, categoryFromPot } from './hisaabParser';
import {
  buildPeriodsFromAnchor,
  DEFAULT_ANCHOR,
  makePeriod,
  parseDateRangeHeader,
} from '../utils/periods';

const legacySample = `Hisaab 

500
-30.16 food
469.84
-9.52 patel
460.32


1195
-322.63 car
=872.37
-9.92 frys
862.45
-2.55 park mobil 
-15 gas for setu
-12.68 miss a gift 
-75.61 perfume gift
=756.61


350
-100.18 gas
=249.82
-50 setu orig 68
199.




to be added
27.71 credit one old statement 
?? another statement 
`;

const fullSample = `August 24 - September 20
Hisaab 
 
Food - 500
500
-30.16 food
-9.52 patel
-3.44 taco bell

Other - 1000
-322.63 car
-15.01 gas for setu
-2.79 gas station nutella 
-50 setu gas

Gas - 350
-100.18 gas
-50 setu orig 68

Rent  - 1000
1000
-1013.905
`;

describe('periods', () => {
  it('Aug 24 four-week chunk ends Sep 20', () => {
    const p = makePeriod(DEFAULT_ANCHOR);
    expect(p.start).toBe('2026-08-24');
    expect(p.end).toBe('2026-09-20');
  });

  it('builds next period from Sep 21', () => {
    const periods = buildPeriodsFromAnchor(DEFAULT_ANCHOR, '2026-09-19', 1);
    expect(periods[0]?.end).toBe('2026-09-20');
    expect(periods[1]?.start).toBe('2026-09-21');
  });

  it('parses August 24 - September 20 header', () => {
    const r = parseDateRangeHeader('August 24 - September 20');
    expect(r?.start).toBe('2026-08-24');
    expect(r?.end).toBe('2026-09-20');
  });
});

describe('hisaabParser', () => {
  it('uses pot name as category', () => {
    expect(categoryFromPot('Other')).toBe('Other');
  });

  it('parses legacy bare-number pots', () => {
    const res = parseHisaabPaste(legacySample);
    expect(res.pots.length).toBe(3);
    expect(res.expenses).toHaveLength(10);
  });

  it('parses date header and pot categories', () => {
    const res = parseHisaabPaste(fullSample);
    expect(res.periodStart).toBe('2026-08-24');
    expect(res.periodEnd).toBe('2026-09-20');
    const underOther = res.expenses.filter((e) => e.categoryName === 'Other');
    expect(underOther.some((e) => /gas station nutella/i.test(e.label))).toBe(true);
  });
});
