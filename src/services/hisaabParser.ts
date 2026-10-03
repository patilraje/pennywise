import type { HisaabParseResult, ProposedExpense, ProposedPot } from '../types';
import { matchPotName } from '../utils/expenseLines';
import { parseDateRangeHeader } from '../utils/periods';

export type HisaabParseOptions = {
  /** Existing pot/category names; named headings with no expenses must match one to stay a pot. */
  knownPotNames?: string[];
};

const HEADING_NAME = String.raw`[A-Za-z][A-Za-z0-9 '’&./()]*?`;

/** Keep up to 3 decimal places (some Hisaab lines use tenths of a cent). */
function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Category = pot heading (Food, Other, Gas, …), never guessed from the expense label.
 */
export function categoryFromPot(potName: string): string {
  const name = potName.trim();
  if (!name || /^pot\s*\d+$/i.test(name)) return 'Other';
  return name;
}

export function guessCategoryName(_label: string, potName?: string): string {
  return categoryFromPot(potName || 'Other');
}

function isDateRangeHeader(line: string): boolean {
  return parseDateRangeHeader(line) != null;
}

function isIgnorableHeader(line: string): boolean {
  if (/^(hisaab|starting)/i.test(line)) return true;
  if (/^to be added$/i.test(line)) return true;
  if (isDateRangeHeader(line)) return true;
  return false;
}

export function parseHisaabPaste(
  text: string,
  opts: HisaabParseOptions = {},
): HisaabParseResult {
  const knownPotNames = opts.knownPotNames ?? [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const pots: ProposedPot[] = [];
  const expenses: ProposedExpense[] = [];
  const pending: string[] = [];
  const warnings: string[] = [];

  let periodStart: string | undefined;
  let periodEnd: string | undefined;

  let currentTempId: string | null = null;
  let currentName = '';
  let currentOpening = 0;
  let running = 0;
  let sawExpense = false;
  let potIndex = 0;
  /** Letters-only line waiting for its amount on the next line (e.g. "Savings" then "2039.06"). */
  let pendingName: { name: string; raw: string } | null = null;
  /** Original heading line for named pots, so empty unknown ones can become pending notes. */
  const headingLines = new Map<string, string>();

  const flushPendingName = () => {
    if (pendingName) pending.push(pendingName.raw);
    pendingName = null;
  };

  const startPot = (opening: number, name?: string, headingRaw?: string) => {
    potIndex += 1;
    currentTempId = uid('pot');
    if (headingRaw) headingLines.set(currentTempId, headingRaw);
    currentName = (name?.trim() || `Pot ${potIndex}`).replace(/\s+/g, ' ');
    currentOpening = opening;
    running = opening;
    sawExpense = false;
    pots.push({
      tempId: currentTempId,
      name: currentName,
      openingAmount: opening,
    });
  };

  const checkBalance = (claimed: number) => {
    if (Math.abs(claimed - running) > 0.02) {
      warnings.push(
        `Balance check for ${currentName}: noted $${claimed.toFixed(3)} vs computed $${running.toFixed(3)}`,
      );
    }
  };

  const addExpense = (amount: number, labelRaw: string) => {
    if (!currentTempId) {
      warnings.push(`Expense before a pot opening: -${amount} ${labelRaw}`.trim());
      return;
    }
    const cleaned = labelRaw
      .replace(/^[-–—\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const label = cleaned || 'expense';
    running = money(running - amount);
    sawExpense = true;
    expenses.push({
      tempId: uid('exp'),
      amount,
      label,
      categoryName: categoryFromPot(currentName),
      potTempId: currentTempId,
    });
  };

  for (const raw of lines) {
    const line = raw
      .replace(/,/g, '')
      .replace(/[–—]/g, '-')
      .replace(/\u00a0/g, ' ')
      .trim();

    const range = parseDateRangeHeader(line);
    if (range && !periodStart) {
      periodStart = range.start;
      periodEnd = range.end;
      continue;
    }

    if (isIgnorableHeader(line)) continue;

    if (/^\?\?/.test(line)) {
      flushPendingName();
      pending.push(raw);
      continue;
    }

    if (/to be added/i.test(line) && !/^-/.test(line)) {
      flushPendingName();
      pending.push(raw);
      continue;
    }

    // "Food 400", "Food - 400", "Insurance and car stuff 145"
    const namedPot = line.match(new RegExp(`^(${HEADING_NAME})\\s*-?\\s*(\\d+(?:\\.\\d+)?)$`));
    if (namedPot) {
      flushPendingName();
      startPot(money(Number(namedPot[2])), namedPot[1].trim(), raw);
      continue;
    }

    // Name alone; its dedication follows on the next line
    if (new RegExp(`^${HEADING_NAME}$`).test(line)) {
      flushPendingName();
      pendingName = { name: line, raw };
      continue;
    }

    const expense = line.match(/^-(\d+(?:\.\d+)?)\s*(.*)$/);
    if (expense) {
      if (pendingName) {
        const { name, raw: headingRaw } = pendingName;
        pendingName = null;
        startPot(0, name, headingRaw);
      }
      addExpense(money(Number(expense[1])), expense[2] || '');
      continue;
    }

    const namedBare = pendingName ? line.match(/^(\d+(?:\.\d+)?)\.?$/) : null;
    if (namedBare && pendingName) {
      const { name, raw: headingRaw } = pendingName;
      pendingName = null;
      startPot(money(Number(namedBare[1])), name, headingRaw);
      continue;
    }
    flushPendingName();

    const eqBal = line.match(/^=\s*(-?\d+(?:\.\d+)?)$/);
    if (eqBal) {
      checkBalance(money(Number(eqBal[1])));
      continue;
    }

    const remainingNote = line.match(/^(\d+(?:\.\d+)?)\s+(?:full fund remaining|remaining)\b(.*)$/i);
    if (remainingNote) {
      const n = money(Number(remainingNote[1]));
      if (!currentTempId) {
        startPot(n, remainingNote[2]?.trim() || undefined);
      } else if (!sawExpense && Math.abs(n - currentOpening) <= 0.02) {
        // opening confirm
      } else {
        checkBalance(n);
      }
      continue;
    }

    const bare = line.match(/^(\d+(?:\.\d+)?)\.?$/);
    if (bare) {
      const n = money(Number(bare[1]));
      if (currentTempId && !sawExpense && Math.abs(n - currentOpening) <= 0.02) {
        continue;
      }
      if (currentTempId && sawExpense && Math.abs(n - running) <= 1) {
        checkBalance(n);
        continue;
      }
      startPot(n);
      continue;
    }

    const pendingAmt = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (pendingAmt && /credit|statement|to be|old|another|upcoming/i.test(pendingAmt[2])) {
      pending.push(raw);
      continue;
    }

    warnings.push(`Unrecognized line: ${raw}`);
  }
  flushPendingName();

  // A named heading with no expenses that matches no existing pot is just a note (e.g. "swami uncle 351.93")
  const potsWithExpenses = new Set(expenses.map((e) => e.potTempId));
  for (let i = pots.length - 1; i >= 0; i--) {
    const p = pots[i];
    const headingRaw = headingLines.get(p.tempId);
    if (!headingRaw || potsWithExpenses.has(p.tempId)) continue;
    if (matchPotName(p.name, knownPotNames)) continue;
    pots.splice(i, 1);
    pending.push(headingRaw);
  }

  const periodNote = periodStart ? ` for ${periodStart}${periodEnd ? `–${periodEnd}` : ''}` : '';
  const summary =
    pots.length === 0 && expenses.length === 0
      ? 'No pots or expenses found. Paste Hisaab notes with openings and -amount lines.'
      : `Parsed ${pots.length} pot(s) and ${expenses.length} expense(s)${periodNote}${
          pending.length ? `, ${pending.length} pending note(s)` : ''
        }. Confirm to save.`;

  return { pots, expenses, pending, warnings, summary, periodStart, periodEnd };
}
