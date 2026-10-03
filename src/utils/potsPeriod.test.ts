import { describe, expect, it } from 'vitest';
import {
  findParseDuplicates,
  isCategoryActiveInPeriod,
  mergeParseIntoPeriod,
  openingForNewPeriodPot,
  periodIdsFromInclusive,
  potsToCreateForPeriod,
  previousPeriodId,
  reviveCategoryInPeriod,
} from '../store';
import type { Category, Expense, HisaabParseResult, PayPeriod, Pot } from '../types';

const periods: PayPeriod[] = [
  { id: 'pp-a', start: '2026-08-24', end: '2026-09-20' },
  { id: 'pp-b', start: '2026-09-21', end: '2026-10-18' },
  { id: 'pp-c', start: '2026-10-19', end: '2026-11-15' },
];

describe('previousPeriodId / periodIdsFromInclusive', () => {
  it('finds previous period by start date', () => {
    expect(previousPeriodId(periods, 'pp-b')).toBe('pp-a');
    expect(previousPeriodId(periods, 'pp-a')).toBeUndefined();
  });

  it('scopes this vs following', () => {
    expect(periodIdsFromInclusive(periods, 'pp-b', 'this')).toEqual(['pp-b']);
    expect(periodIdsFromInclusive(periods, 'pp-b', 'following')).toEqual(['pp-b', 'pp-c']);
  });
});

describe('potsToCreateForPeriod carry-forward', () => {
  const categories: Category[] = [
    { id: 'cat-food', name: 'Food', budgetsByPeriod: { 'pp-a': 500 } },
    { id: 'cat-gas', name: 'Gas', budgetsByPeriod: { 'pp-a': 350 } },
  ];

  it('carries previous pot opening into a new period', () => {
    const pots: Pot[] = [
      {
        id: 'pot-food-a',
        name: 'Food',
        openingAmount: 500,
        periodId: 'pp-a',
        createdAt: 't',
      },
      {
        id: 'pot-gas-a',
        name: 'Gas',
        openingAmount: 350,
        periodId: 'pp-a',
        createdAt: 't',
      },
    ];

    const missingB = potsToCreateForPeriod(categories, pots, 'pp-b', periods);
    expect(missingB).toEqual([
      { name: 'Food', openingAmount: 500, periodId: 'pp-b' },
      { name: 'Gas', openingAmount: 350, periodId: 'pp-b' },
    ]);
  });

  it('uses explicit dedication for this period instead of overwriting', () => {
    const cats: Category[] = [
      {
        id: 'cat-food',
        name: 'Food',
        budgetsByPeriod: { 'pp-a': 500, 'pp-b': 200 },
      },
    ];
    const pots: Pot[] = [
      {
        id: '1',
        name: 'Food',
        openingAmount: 500,
        periodId: 'pp-a',
        createdAt: 't',
      },
    ];
    expect(openingForNewPeriodPot('Food', 'pp-b', cats, pots, periods)).toBe(200);
  });

  it('does not duplicate when pot already exists', () => {
    const pots: Pot[] = [
      {
        id: '1',
        name: 'Food',
        openingAmount: 100,
        periodId: 'pp-b',
        createdAt: 't',
      },
      {
        id: '2',
        name: 'Gas',
        openingAmount: 50,
        periodId: 'pp-b',
        createdAt: 't',
      },
    ];
    expect(potsToCreateForPeriod(categories, pots, 'pp-b', periods)).toEqual([]);
  });
});

describe('removed pots', () => {
  it('skips a category removed for one period only', () => {
    const cats: Category[] = [
      { id: 'c1', name: 'Food', budgetsByPeriod: {}, removedPeriods: ['pp-b'] },
    ];
    expect(potsToCreateForPeriod(cats, [], 'pp-b', periods)).toEqual([]);
    expect(potsToCreateForPeriod(cats, [], 'pp-c', periods)).toHaveLength(1);
  });

  it('skips a category removed from a period onward', () => {
    const cats: Category[] = [
      { id: 'c1', name: 'Food', budgetsByPeriod: {}, removedFromPeriod: '2026-09-21' },
    ];
    expect(potsToCreateForPeriod(cats, [], 'pp-a', periods)).toHaveLength(1);
    expect(potsToCreateForPeriod(cats, [], 'pp-b', periods)).toEqual([]);
    expect(potsToCreateForPeriod(cats, [], 'pp-c', periods)).toEqual([]);
  });

  it('reviving one period keeps the earlier removed periods hidden', () => {
    const cat: Category = {
      id: 'c1',
      name: 'Food',
      budgetsByPeriod: {},
      removedFromPeriod: '2026-09-21',
    };
    const revived = reviveCategoryInPeriod(cat, 'pp-c', periods);
    expect(isCategoryActiveInPeriod(revived, 'pp-b', periods)).toBe(false);
    expect(isCategoryActiveInPeriod(revived, 'pp-c', periods)).toBe(true);
  });
});

describe('mergeParseIntoPeriod', () => {
  const baseCats: Category[] = [
    { id: 'cat-food', name: 'Food', budgetsByPeriod: { 'pp-b': 300 } },
    { id: 'cat-costco', name: 'Costco Membership', budgetsByPeriod: {} },
  ];
  const basePots: Pot[] = [
    { id: 'pot-food', name: 'Food', openingAmount: 300, periodId: 'pp-b', createdAt: 't' },
    {
      id: 'pot-costco',
      name: 'Costco Membership',
      openingAmount: 0,
      periodId: 'pp-b',
      createdAt: 't',
    },
  ];
  const parsed: HisaabParseResult = {
    pots: [
      { tempId: 't-food', name: 'Food', openingAmount: 400 },
      { tempId: 't-costco', name: 'Costco', openingAmount: 5 },
    ],
    expenses: [
      { tempId: 'e1', amount: 25.52, label: 'safeway chase', categoryName: 'Food', potTempId: 't-food' },
      { tempId: 'e2', amount: 10, label: 'kfc', categoryName: 'Food', potTempId: 't-food' },
      { tempId: 'e3', amount: 10, label: 'kfc', categoryName: 'Food', potTempId: 't-food' },
    ],
    pending: ['swami uncle 351.93'],
    warnings: [],
    summary: '',
  };
  const ctx = {
    categories: baseCats,
    pots: basePots,
    expenses: [] as Expense[],
    pending: [],
    cards: [{ id: 'card-chase', name: 'chase', kind: 'credit' as const, creditLimit: 1000, createdAt: 't' }],
    periods,
    periodId: 'pp-b',
    date: '2026-09-21',
  };

  it('updates existing pots instead of creating new ones', () => {
    const out = mergeParseIntoPeriod(parsed, ctx);
    expect(out.pots).toHaveLength(2);
    expect(out.pots.find((p) => p.id === 'pot-food')?.openingAmount).toBe(400);
    expect(out.pots.find((p) => p.id === 'pot-costco')?.openingAmount).toBe(5);
    expect(out.categories.find((c) => c.id === 'cat-food')?.budgetsByPeriod['pp-b']).toBe(400);
    expect(out.expenses).toHaveLength(3);
    expect(out.expenses.every((e) => e.potId === 'pot-food' && e.categoryId === 'cat-food')).toBe(true);
    expect(out.expenses[0].cardId).toBe('card-chase');
    expect(out.stats).toMatchObject({ potsUpdated: 2, potsCreated: 0, expensesAdded: 3 });
  });

  it('re-pasting the same text adds nothing; one new line is added once', () => {
    const first = mergeParseIntoPeriod(parsed, ctx);
    const again = mergeParseIntoPeriod(parsed, { ...ctx, ...first });
    expect(again.expenses).toHaveLength(3);
    expect(again.pending).toHaveLength(1);
    expect(again.stats.expensesSkipped).toBe(3);

    const withExtra: HisaabParseResult = {
      ...parsed,
      expenses: [
        ...parsed.expenses,
        { tempId: 'e4', amount: 10, label: 'kfc', categoryName: 'Food', potTempId: 't-food' },
      ],
    };
    const third = mergeParseIntoPeriod(withExtra, { ...ctx, ...again });
    expect(third.expenses).toHaveLength(4);
    expect(third.stats.expensesAdded).toBe(1);
  });
});

describe('duplicate review', () => {
  const pots: Pot[] = [
    { id: 'pot-food', name: 'Food', openingAmount: 400, periodId: 'pp-b', createdAt: 't' },
  ];
  const saved = (id: string, amount: number, label: string): Expense => ({
    id,
    amount,
    label,
    categoryId: 'cat-food',
    potId: 'pot-food',
    periodId: 'pp-b',
    date: '2026-09-22',
    createdAt: 't',
  });
  const existing = [saved('s1', 10, 'kfc'), saved('s2', 10, 'KFC'), saved('s3', 25.52, 'safeway chase')];
  const pasted = (tempId: string, amount: number, label: string) => ({
    tempId,
    amount,
    label,
    categoryName: 'Food',
    potTempId: 't-food',
  });
  const result: HisaabParseResult = {
    pots: [{ tempId: 't-food', name: 'Food', openingAmount: 400 }],
    expenses: [
      pasted('p1', 10, 'kfc'),
      pasted('p2', 10, 'kfc'),
      pasted('p3', 10, 'kfc'),
      pasted('p4', 25.52, 'safeway chase'),
    ],
    pending: [],
    warnings: [],
    summary: '',
  };
  const ctx = {
    categories: [{ id: 'cat-food', name: 'Food', budgetsByPeriod: {} }] as Category[],
    pots,
    expenses: existing,
    pending: [],
    cards: [{ id: 'card-chase', name: 'chase', kind: 'credit' as const, creditLimit: 0, createdAt: 't' }],
    periods,
    periodId: 'pp-b',
    date: '2026-09-21',
  };

  it('pairs pasted lines with saved ones count by count', () => {
    const dups = findParseDuplicates(result, { pots, expenses: existing, periodId: 'pp-b' });
    expect(dups.map((d) => [d.expenseTempId, d.existing.id])).toEqual([
      ['p1', 's1'],
      ['p2', 's2'],
      ['p4', 's3'],
    ]);
  });

  it('without decisions skips duplicates and adds the extra line', () => {
    const out = mergeParseIntoPeriod(result, ctx);
    expect(out.expenses).toHaveLength(4);
    expect(out.stats).toMatchObject({ expensesAdded: 1, expensesSkipped: 3, keptBoth: 0, replaced: 0 });
  });

  it('keep saved adds nothing for that pair', () => {
    const out = mergeParseIntoPeriod(result, ctx, { p1: { keepSaved: true, addPasted: false } });
    expect(out.expenses.filter((e) => e.label.toLowerCase() === 'kfc')).toHaveLength(3);
  });

  it('keep both adds the pasted expense', () => {
    const out = mergeParseIntoPeriod(result, ctx, { p1: { keepSaved: true, addPasted: true } });
    expect(out.expenses.filter((e) => e.label.toLowerCase() === 'kfc')).toHaveLength(4);
    expect(out.stats.keptBoth).toBe(1);
  });

  it('replace removes the saved expense and adds the pasted one with its card', () => {
    const out = mergeParseIntoPeriod(result, ctx, { p4: { keepSaved: false, addPasted: true } });
    expect(out.expenses.some((e) => e.id === 's3')).toBe(false);
    const added = out.expenses.filter((e) => e.label === 'safeway chase');
    expect(added).toHaveLength(1);
    expect(added[0].cardId).toBe('card-chase');
    expect(out.stats.replaced).toBe(1);
  });
});
