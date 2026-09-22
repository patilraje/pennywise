/** Keep up to 3 decimal places (matches store / Hisaab). */
function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type ParsedExpenseLine = { amount: number; label: string };

export type ParseExpenseBulkResult = {
  expenses: ParsedExpenseLine[];
  errors: string[];
};

/**
 * Parse bulk expense lines for a pot, e.g.:
 * -2
 * -4 sephora
 * -10 ulta
 */
export function parseExpenseBulkLines(text: string): ParseExpenseBulkResult {
  const expenses: ParsedExpenseLine[] = [];
  const errors: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/,/g, '')
      .replace(/[–—]/g, '-')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!line) continue;

    const dashed = line.match(/^-(\d+(?:\.\d+)?)\s*(.*)$/);
    if (dashed) {
      const amount = money(Number(dashed[1]));
      if (!(amount > 0)) {
        errors.push(`Invalid amount: ${raw}`);
        continue;
      }
      const label = dashed[2].replace(/^[-–—\s]+/, '').trim() || 'expense';
      expenses.push({ amount, label });
      continue;
    }

    const plain = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (plain) {
      const amount = money(Number(plain[1]));
      if (!(amount > 0)) {
        errors.push(`Invalid amount: ${raw}`);
        continue;
      }
      expenses.push({ amount, label: plain[2].trim() });
      continue;
    }

    errors.push(`Unrecognized line: ${raw}`);
  }

  return { expenses, errors };
}
