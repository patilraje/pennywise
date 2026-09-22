import { describe, expect, it } from 'vitest';
import {
  openingForNewPeriodPot,
  periodIdsFromInclusive,
  potsToCreateForPeriod,
  previousPeriodId,
} from '../store';
import type { Category, PayPeriod, Pot } from '../types';

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
