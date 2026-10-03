import { FormEvent, useMemo, useState } from 'react';
import { parseHisaabPaste } from '@/services/hisaabParser';
import { findParseDuplicates, formatMoney, useStore, type DuplicateDecision } from '@/store';
import type { HisaabParseResult } from '@/types';
import { matchPotName } from '@/utils/expenseLines';
import { periodForRange, periodLabel } from '@/utils/periods';

export function AskPennyWisePage() {
  const confirmParse = useStore((s) => s.confirmParse);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const periods = useStore((s) => s.periods);
  const pots = useStore((s) => s.pots);
  const categories = useStore((s) => s.categories);
  const expenses = useStore((s) => s.expenses);
  const clearAll = useStore((s) => s.clearAll);
  const cards = useStore((s) => s.cards);

  const period = periods.find((p) => p.id === selectedPeriodId);
  const periodPots = pots.filter((p) => p.periodId === selectedPeriodId);
  const periodExpenses = expenses.filter((e) => e.periodId === selectedPeriodId);

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<HisaabParseResult | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [decisions, setDecisions] = useState<Record<string, DuplicateDecision>>({});

  const targetPeriod = useMemo(() => {
    if (!preview) return undefined;
    if (!preview.periodStart) return period;
    return periodForRange(periods, preview.periodStart, preview.periodEnd).period;
  }, [preview, periods, period]);

  const targetNames = useMemo(() => {
    const names = new Set(categories.map((c) => c.name));
    if (targetPeriod) {
      for (const p of pots) if (p.periodId === targetPeriod.id) names.add(p.name);
    }
    return [...names];
  }, [categories, pots, targetPeriod]);

  const duplicates = useMemo(() => {
    if (!preview || !targetPeriod) return [];
    return findParseDuplicates(preview, { pots, expenses, periodId: targetPeriod.id });
  }, [preview, targetPeriod, pots, expenses]);
  const duplicateIds = useMemo(
    () => new Set(duplicates.map((d) => d.expenseTempId)),
    [duplicates],
  );

  const decisionFor = (tempId: string): DuplicateDecision =>
    decisions[tempId] ?? { keepSaved: true, addPasted: false };

  const toggleDecision = (tempId: string, field: keyof DuplicateDecision) => {
    setDecisions((d) => {
      const current = d[tempId] ?? { keepSaved: true, addPasted: false };
      const next = { ...current, [field]: !current[field] };
      // At least one side must stay checked
      if (!next.keepSaved && !next.addPasted) {
        if (field === 'keepSaved') next.addPasted = true;
        else next.keepSaved = true;
      }
      return { ...d, [tempId]: next };
    });
  };

  const setAllDecisions = (decision: DuplicateDecision) => {
    setDecisions(Object.fromEntries(duplicates.map((d) => [d.expenseTempId, decision])));
  };

  const onParse = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSavedNote('');
    setDecisions({});
    setPreview(parseHisaabPaste(text, { knownPotNames: categories.map((c) => c.name) }));
  };

  const onConfirm = () => {
    if (!preview) return;
    const stats = confirmParse(preview, decisions);
    const parts = [
      `${stats.potsUpdated} pot(s) updated, ${stats.potsCreated} new`,
      `${stats.expensesAdded} new expense(s) added`,
    ];
    if (stats.keptBoth) parts.push(`${stats.keptBoth} duplicate(s) kept both`);
    if (stats.replaced) parts.push(`${stats.replaced} replaced`);
    if (stats.expensesSkipped) parts.push(`${stats.expensesSkipped} already saved (skipped)`);
    if (stats.pendingAdded) parts.push(`${stats.pendingAdded} pending note(s)`);
    setSavedNote(`Saved: ${parts.join(' · ')}.`);
    setPreview(null);
    setDecisions({});
    setText('');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Ask PennyWise</h1>
        <p className="mt-1 text-sm text-muted">
          Paste Hisaab notes
          {period ? ` (saves to ${period.start} – ${period.end}, or the dates in your paste)` : ''}.
          Pots already open for that period are updated; only new expenses are added.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-accent/25 bg-accent-soft/50 p-3 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Pots this period</p>
          <p className="mt-1 text-2xl font-bold tabular">{periodPots.length}</p>
        </div>
        <div className="rounded-xl border border-coral/25 bg-coral-soft p-3 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-coral">Expenses this period</p>
          <p className="mt-1 text-2xl font-bold tabular">{periodExpenses.length}</p>
        </div>
      </div>

      <form onSubmit={onParse} className="space-y-3">
        <textarea
          className="min-h-[220px] w-full rounded-xl border border-line bg-surface p-4 font-mono text-sm outline-none ring-accent focus:ring-2"
          placeholder={`Sept 20 - Oct 18\nFood 400\n-25.52 safeway chase\nSavings\n2039.06\n...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Parse paste
          </button>
          {preview ? (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Confirm all
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setText('');
            }}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium"
          >
            Clear draft
          </button>
        </div>
      </form>

      {savedNote ? (
        <p className="rounded-lg border border-accent/30 bg-accent-soft/50 p-3 text-sm">{savedNote}</p>
      ) : null}

      {preview ? (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium">{preview.summary}</p>
          {targetPeriod ? (
            <p className="text-sm text-muted">
              Saves to <span className="font-semibold text-ink">{periodLabel(targetPeriod)}</span>
            </p>
          ) : null}

          {preview.warnings.length > 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pots</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {preview.pots.map((p) => {
                const match = matchPotName(p.name, targetNames);
                return (
                  <li key={p.tempId} className="flex justify-between gap-3">
                    <span>
                      {p.name}{' '}
                      <span className="text-xs text-muted">
                        {match ? `· updates ${match}` : '· new pot'}
                      </span>
                    </span>
                    <span className="tabular font-medium">{formatMoney(p.openingAmount)}</span>
                  </li>
                );
              })}
              {!preview.pots.length ? <li className="text-muted">None</li> : null}
            </ul>
          </div>

          {duplicates.length > 0 ? (
            <div className="rounded-xl border border-amber/40 bg-amber-soft/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-amber">
                  Possible duplicates ({duplicates.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAllDecisions({ keepSaved: true, addPasted: false })}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold"
                  >
                    Keep saved for all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllDecisions({ keepSaved: true, addPasted: true })}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold"
                  >
                    Keep both for all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllDecisions({ keepSaved: false, addPasted: true })}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold"
                  >
                    Replace all
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">
                Same amount and label already saved in this pot. Check both to keep both (two real
                transactions), or pick one.
              </p>
              <ul className="mt-3 space-y-2">
                {duplicates.map((d) => {
                  const pasted = preview.expenses.find((e) => e.tempId === d.expenseTempId);
                  if (!pasted) return null;
                  const decision = decisionFor(d.expenseTempId);
                  const card = cards.find((c) => c.id === d.existing.cardId);
                  return (
                    <li key={d.expenseTempId} className="grid gap-2 sm:grid-cols-2">
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-surface p-2 text-sm ${
                          decision.keepSaved ? 'border-accent' : 'border-line opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={decision.keepSaved}
                          onChange={() => toggleDecision(d.expenseTempId, 'keepSaved')}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase text-muted">
                            Keep saved
                          </span>
                          <span className="flex justify-between gap-2">
                            <span className="truncate">{d.existing.label}</span>
                            <span className="tabular font-medium text-danger">
                              -{formatMoney(d.existing.amount)}
                            </span>
                          </span>
                          <span className="block text-xs text-muted">
                            {d.existing.date}
                            {card ? ` · ${card.name}` : ''}
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-surface p-2 text-sm ${
                          decision.addPasted ? 'border-accent' : 'border-line opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={decision.addPasted}
                          onChange={() => toggleDecision(d.expenseTempId, 'addPasted')}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase text-muted">
                            Add pasted
                          </span>
                          <span className="flex justify-between gap-2">
                            <span className="truncate">{pasted.label}</span>
                            <span className="tabular font-medium text-danger">
                              -{formatMoney(pasted.amount)}
                            </span>
                          </span>
                          <span className="block text-xs text-muted">
                            {decision.keepSaved && decision.addPasted
                              ? 'Keeping both'
                              : decision.addPasted
                                ? 'Replaces saved'
                                : 'Skipped'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {duplicates.length > 0 ? 'New expenses' : 'Expenses'}
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {preview.expenses
                .filter((e) => !duplicateIds.has(e.tempId))
                .map((e) => (
                  <li key={e.tempId} className="flex justify-between gap-3">
                    <span>
                      {e.label} <span className="text-muted">· {e.categoryName}</span>
                    </span>
                    <span className="tabular font-medium text-danger">-{formatMoney(e.amount)}</span>
                  </li>
                ))}
              {preview.expenses.length === duplicateIds.size ? (
                <li className="text-muted">None</li>
              ) : null}
            </ul>
          </div>

          {preview.pending.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pending (not spend)</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {preview.pending.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {(periodPots.length > 0 || periodExpenses.length > 0) && (
        <section className="rounded-xl border border-line bg-accent-soft/40 p-4 text-sm">
          <p>
            This period: <strong>{periodPots.length}</strong> pot(s),{' '}
            <strong>{periodExpenses.length}</strong> expense(s). Open{' '}
            <span className="font-semibold">Transactions</span> or <span className="font-semibold">Budget</span>.
          </p>
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear ALL periods and reset the app?')) clearAll();
            }}
            className="mt-3 text-xs font-medium text-danger underline"
          >
            Reset all data
          </button>
        </section>
      )}
    </div>
  );
}
