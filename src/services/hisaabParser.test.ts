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

const septSample = `Sept 20 - oct 18

swami uncle 351.93

Food 400
-25.52 safeway chase
-27.93 tacos discover
-24.58 trader joe’s discover 
-10.81 kfc discover 

Other 1000
-13.31 niki ciggs discover 
-9.45 usps envelopes discover 
-10.64 fry’s flowers and candy discover
-19 visible discover
-6.43 soundcloud discover
-5.4 printing tempe library chase

Gas 350
-71.70 sam’s club chase 
-74.66 sam’s club chase

Rent 1015
-954.53 huntington

Insurance and car stuff 145

Savings 2039.06
-1000 federal tax return 2021 huntington

Costco 5
`;

const knownPotNames = [
  'Food',
  'Other',
  'Gas',
  'Rent',
  'Insurance etc',
  'Savings',
  'Costco Membership',
];

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

  it('parses "Name 123" headings from the Sept paste', () => {
    const res = parseHisaabPaste(septSample, { knownPotNames });
    expect(res.periodStart).toBe('2026-09-20');
    expect(res.periodEnd).toBe('2026-10-18');
    expect(res.pots.map((p) => [p.name, p.openingAmount])).toEqual([
      ['Food', 400],
      ['Other', 1000],
      ['Gas', 350],
      ['Rent', 1015],
      ['Insurance and car stuff', 145],
      ['Savings', 2039.06],
      ['Costco', 5],
    ]);
    expect(res.expenses).toHaveLength(14);
    expect(res.pending).toEqual(['swami uncle 351.93']);
    expect(res.warnings.filter((w) => /Unrecognized|before a pot/.test(w))).toEqual([]);

    const potName = (tempId: string) => res.pots.find((p) => p.tempId === tempId)?.name;
    const savings = res.expenses.filter((e) => potName(e.potTempId) === 'Savings');
    expect(savings.map((e) => e.amount)).toEqual([1000]);
    expect(res.expenses.filter((e) => potName(e.potTempId) === 'Food')).toHaveLength(4);
  });

  it('accepts the dedication on the line under the pot name', () => {
    const res = parseHisaabPaste(`Savings\n2039.06\n-1000 tax huntington\nFood\n400`, {
      knownPotNames,
    });
    expect(res.pots.map((p) => [p.name, p.openingAmount])).toEqual([
      ['Savings', 2039.06],
      ['Food', 400],
    ]);
    expect(res.expenses).toHaveLength(1);
  });

  it('keeps an empty heading as a pot only when it matches a known pot', () => {
    const res = parseHisaabPaste(`Insurance and car stuff 145\nswami uncle 351.93`, {
      knownPotNames,
    });
    expect(res.pots.map((p) => p.name)).toEqual(['Insurance and car stuff']);
    expect(res.pending).toEqual(['swami uncle 351.93']);
  });
});
