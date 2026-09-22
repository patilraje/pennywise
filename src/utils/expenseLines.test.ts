import { describe, expect, it } from 'vitest';
import { parseExpenseBulkLines } from './expenseLines';

describe('parseExpenseBulkLines', () => {
  it('parses dashed Hisaab-style lines', () => {
    const { expenses, errors } = parseExpenseBulkLines('-2\n-4 sephora\n-10 ulta');
    expect(errors).toEqual([]);
    expect(expenses).toEqual([
      { amount: 2, label: 'expense' },
      { amount: 4, label: 'sephora' },
      { amount: 10, label: 'ulta' },
    ]);
  });

  it('parses amount + label without dash', () => {
    const { expenses } = parseExpenseBulkLines('15.50 coffee shop');
    expect(expenses).toEqual([{ amount: 15.5, label: 'coffee shop' }]);
  });
});
