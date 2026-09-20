import { FormEvent, useState } from 'react';
import { parseHisaabPaste } from '@/services/hisaabParser';
import { formatMoney, useStore } from '@/store';
import type { HisaabParseResult } from '@/types';

export function AskPennyWisePage() {
  const confirmParse = useStore((s) => s.confirmParse);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const periods = useStore((s) => s.periods);
  const pots = useStore((s) => s.pots);
  const expenses = useStore((s) => s.expenses);
  const clearAll = useStore((s) => s.clearAll);

  const period = periods.find((p) => p.id === selectedPeriodId);
  const periodPots = pots.filter((p) => p.periodId === selectedPeriodId);
  const periodExpenses = expenses.filter((e) => e.periodId === selectedPeriodId);

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<HisaabParseResult | null>(null);

  const onParse = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPreview(parseHisaabPaste(text));
  };

  const onConfirm = () => {
    if (!preview) return;
    confirmParse(preview);
    setPreview(null);
    setText('');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Ask PennyWise</h1>
        <p className="mt-1 text-sm text-muted">
          Paste Hisaab notes
          {period ? ` (saves to ${period.start} – ${period.end}, or the dates in your paste)` : ''}.
          Review, then confirm.
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
          placeholder={`August 24 - September 20\nHisaab\n\nFood - 500\n-30.16 food\n...`}
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

      {preview ? (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium">{preview.summary}</p>

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
              {preview.pots.map((p) => (
                <li key={p.tempId} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="tabular font-medium">{formatMoney(p.openingAmount)}</span>
                </li>
              ))}
              {!preview.pots.length ? <li className="text-muted">None</li> : null}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Expenses</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {preview.expenses.map((e) => (
                <li key={e.tempId} className="flex justify-between gap-3">
                  <span>
                    {e.label} <span className="text-muted">· {e.categoryName}</span>
                  </span>
                  <span className="tabular font-medium text-danger">-{formatMoney(e.amount)}</span>
                </li>
              ))}
              {!preview.expenses.length ? <li className="text-muted">None</li> : null}
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
