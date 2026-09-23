import { describe, expect, it } from 'vitest';
import {
  creditUtilization,
  matchCardInLabel,
  parseExpenseBulkLines,
} from './expenseLines';

const cards = [
  { id: 'c1', name: 'chase' },
  { id: 'c2', name: 'amex' },
  { id: 'c3', name: 'chase freedom' },
];

describe('matchCardInLabel', () => {
  it('matches card keyword anywhere in the label', () => {
    expect(matchCardInLabel('sephora chase', cards)).toBe('c1');
    expect(matchCardInLabel('chase', cards)).toBe('c1');
    expect(matchCardInLabel('chase sephora', cards)).toBe('c1');
  });

  it('prefers the longest card name', () => {
    expect(matchCardInLabel('ulta chase freedom', cards)).toBe('c3');
  });

  it('returns undefined when no card keyword', () => {
    expect(matchCardInLabel('sephora only', cards)).toBeUndefined();
  });
});

describe('parseExpenseBulkLines', () => {
  it('keeps card words in the label for later matching', () => {
    const { expenses, errors } = parseExpenseBulkLines(
      '-1 sephora chase\n-1 chase\n-1 chase sephora',
    );
    expect(errors).toEqual([]);
    expect(expenses.map((e) => e.label)).toEqual([
      'sephora chase',
      'chase',
      'chase sephora',
    ]);
  });
});

describe('creditUtilization', () => {
  it('computes percent of limit', () => {
    expect(creditUtilization(100, 1000)).toBe(10);
    expect(creditUtilization(50, 0)).toBe(0);
  });
});
