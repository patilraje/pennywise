import { describe, expect, it } from 'vitest';
import { potsToCreateForPeriod } from '../store';
import type { Category, Pot } from '../types';

describe('potsToCreateForPeriod', () => {
  const categories: Category[] = [
    { id: 'cat-food', name: 'Food', budgetsByPeriod: { 'pp-a': 500, 'pp-b': 0 } },
    { id: 'cat-gas', name: 'Gas', budgetsByPeriod: { 'pp-a': 350 } },
  ];

  it('creates missing pots using only that period’s dedication', () => {
    const pots: Pot[] = [
      {
        id: 'pot-food-a',
        name: 'Food',
        openingAmount: 500,
        periodId: 'pp-a',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const missingB = potsToCreateForPeriod(categories, pots, 'pp-b');
    expect(missingB).toEqual([
      { name: 'Food', openingAmount: 0, periodId: 'pp-b' },
      { name: 'Gas', openingAmount: 0, periodId: 'pp-b' },
    ]);

    // Period A still only needs Gas; does not rewrite Food’s 500
    const missingA = potsToCreateForPeriod(categories, pots, 'pp-a');
    expect(missingA).toEqual([{ name: 'Gas', openingAmount: 350, periodId: 'pp-a' }]);
  });

  it('does not duplicate when pot already exists for the period', () => {
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
    expect(potsToCreateForPeriod(categories, pots, 'pp-b')).toEqual([]);
  });
});
