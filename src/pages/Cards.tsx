import { useMemo, useState } from 'react';
import { StatTile } from '@/components/charts';
import { cardSpent, formatMoney, useStore } from '@/store';
import { creditUtilization } from '@/utils/expenseLines';
import { periodLabel } from '@/utils/periods';

const UTIL_TARGET = 10;

function utilTone(pct: number): 'lime' | 'amber' | 'coral' {
  if (pct <= UTIL_TARGET) return 'lime';
  if (pct <= 30) return 'amber';
  return 'coral';
}

function utilBarColor(pct: number): string {
  if (pct <= UTIL_TARGET) return '#5a9e3e';
  if (pct <= 30) return '#e8a317';
  return '#e85d4c';
}

export function CardsPage() {
  const cards = useStore((s) => s.cards);
  const allExpenses = useStore((s) => s.expenses);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const periods = useStore((s) => s.periods);
  const addCard = useStore((s) => s.addCard);
  const updateCard = useStore((s) => s.updateCard);
  const deleteCard = useStore((s) => s.deleteCard);

  const period = periods.find((p) => p.id === selectedPeriodId);
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.periodId === selectedPeriodId),
    [allExpenses, selectedPeriodId],
  );

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'credit' | 'debit'>('credit');
  const [limitDraft, setLimitDraft] = useState('');
  const [limitEdits, setLimitEdits] = useState<Record<string, string>>({});
  const [nameEdits, setNameEdits] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    return [...cards]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const spent = cardSpent(c.id, expenses);
        const util = c.kind === 'credit' ? creditUtilization(spent, c.creditLimit) : 0;
        return { ...c, spent, util };
      });
  }, [cards, expenses]);

  const creditOver = rows.filter((r) => r.kind === 'credit' && r.util > UTIL_TARGET).length;
  const totalCardSpend = moneySum(rows.map((r) => r.spent));

  const submitAdd = () => {
    if (!name.trim()) return;
    const lim = Number.parseFloat(limitDraft.replace(/[$,\s]/g, ''));
    addCard({
      name: name.trim(),
      kind,
      creditLimit: kind === 'credit' && Number.isFinite(lim) ? lim : 0,
    });
    setName('');
    setLimitDraft('');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Cards</h1>
        <p className="mt-1 text-sm text-muted">
          Editing{' '}
          <span className="font-semibold text-ink">
            {period ? periodLabel(period) : 'selected period'}
          </span>{' '}
          spend · name cards the way you type them in expenses (e.g. chase)
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Cards" value={String(cards.length)} tone="navy" />
        <StatTile label="Card spend this period" value={formatMoney(totalCardSpend)} tone="coral" />
        <StatTile
          label="Credit over 10%"
          value={String(creditOver)}
          hint="Aim ≤10% of limit for a healthier score"
          tone={creditOver > 0 ? 'coral' : 'lime'}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Add card</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="text-xs text-muted" htmlFor="card-name">
              Name (keyword)
            </label>
            <input
              id="card-name"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="chase"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAdd();
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted" htmlFor="card-kind">
              Type
            </label>
            <select
              id="card-kind"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'credit' | 'debit')}
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          {kind === 'credit' ? (
            <div className="sm:w-36">
              <label className="text-xs text-muted" htmlFor="card-limit">
                Credit limit
              </label>
              <input
                id="card-limit"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm tabular outline-none focus:ring-2 focus:ring-accent"
                placeholder="5000"
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={submitAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            No cards yet. Add chase, amex, etc. — then type that word anywhere in an expense label.
          </p>
        ) : (
          rows.map((c) => {
            const tone = utilTone(c.util);
            const nameValue = nameEdits[c.id] ?? c.name;
            const limitValue = limitEdits[c.id] ?? String(c.creditLimit || '');
            const barPct =
              c.kind === 'credit' && c.creditLimit > 0
                ? Math.min(100, (c.spent / c.creditLimit) * 100)
                : 0;
            return (
              <article
                key={c.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent"
                        value={nameValue}
                        onChange={(e) => setNameEdits((d) => ({ ...d, [c.id]: e.target.value }))}
                        onBlur={() => {
                          if (nameEdits[c.id] === undefined) return;
                          updateCard(c.id, { name: nameValue });
                          setNameEdits((d) => {
                            const next = { ...d };
                            delete next[c.id];
                            return next;
                          });
                        }}
                      />
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.kind === 'credit'
                            ? 'bg-amber-soft text-amber'
                            : 'bg-sky-soft text-sky'
                        }`}
                      >
                        {c.kind}
                      </span>
                    </div>
                    {c.kind === 'credit' ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="text-xs text-muted" htmlFor={`lim-${c.id}`}>
                            Limit
                          </label>
                          <input
                            id={`lim-${c.id}`}
                            inputMode="decimal"
                            className="mt-1 w-32 rounded-lg border border-line px-2 py-1.5 text-sm tabular outline-none focus:ring-2 focus:ring-accent"
                            value={limitValue}
                            onChange={(e) =>
                              setLimitEdits((d) => ({ ...d, [c.id]: e.target.value }))
                            }
                            onBlur={() => {
                              if (limitEdits[c.id] === undefined) return;
                              const n = Number.parseFloat(limitValue.replace(/[$,\s]/g, ''));
                              updateCard(c.id, {
                                creditLimit: Number.isFinite(n) ? n : 0,
                              });
                              setLimitEdits((d) => {
                                const next = { ...d };
                                delete next[c.id];
                                return next;
                              });
                            }}
                          />
                        </div>
                        <p className="pb-1.5 text-xs text-muted">
                          Target ≤{UTIL_TARGET}% · now{' '}
                          <span
                            className={`font-semibold tabular ${
                              tone === 'lime'
                                ? 'text-lime'
                                : tone === 'amber'
                                  ? 'text-amber'
                                  : 'text-coral'
                            }`}
                          >
                            {c.util}%
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">Debit — spend tracked, no utilization target</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted">This period</p>
                    <p className="text-xl font-bold tabular">{formatMoney(c.spent)}</p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-danger"
                      onClick={() => {
                        if (confirm(`Remove card “${c.name}”? Expenses keep their labels.`)) {
                          deleteCard(c.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {c.kind === 'credit' && c.creditLimit > 0 ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>
                        {formatMoney(c.spent)} of {formatMoney(c.creditLimit)}
                      </span>
                      <span>10% = {formatMoney(c.creditLimit * 0.1)}</span>
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-line">
                      <div
                        className="absolute inset-y-0 left-[10%] w-px bg-ink/30"
                        title="10% target"
                      />
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barPct}%`,
                          background: utilBarColor(c.util),
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function moneySum(amounts: number[]): number {
  return Math.round(amounts.reduce((s, n) => s + n, 0) * 1000) / 1000;
}
