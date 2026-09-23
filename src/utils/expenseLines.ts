/** Keep up to 3 decimal places (matches store / Hisaab). */
function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type ParsedExpenseLine = { amount: number; label: string };

export type ParseExpenseBulkResult = {
  expenses: ParsedExpenseLine[];
  errors: string[];
};

export type CardMatchable = { id: string; name: string };

/**
 * Whole-word match of card name anywhere in the label.
 * Longest card name wins if several match.
 * e.g. "sephora chase", "chase", "chase sephora" all match card "chase".
 */
export function matchCardInLabel(
  label: string,
  cards: CardMatchable[],
): string | undefined {
  const words = label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0 || cards.length === 0) return undefined;

  let best: { id: string; nameLen: number } | undefined;
  for (const card of cards) {
    const nameWords = card.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    if (nameWords.length === 0) continue;
    for (let i = 0; i <= words.length - nameWords.length; i++) {
      const hit = nameWords.every((w, j) => words[i + j] === w);
      if (!hit) continue;
      const nameLen = nameWords.join(' ').length;
      if (!best || nameLen > best.nameLen) {
        best = { id: card.id, nameLen };
      }
      break;
    }
  }
  return best?.id;
}

/**
 * Parse bulk expense lines for a pot, e.g.:
 * -2
 * -4 sephora chase
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

/** Period spend on a card / credit limit as a percent (one decimal). */
export function creditUtilization(periodSpend: number, creditLimit: number): number {
  if (!(creditLimit > 0)) return 0;
  return Math.round((periodSpend / creditLimit) * 1000) / 10;
}
