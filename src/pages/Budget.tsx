import { useEffect, useMemo, useState } from 'react';
import { StatTile } from '@/components/charts';
import {
  categorySpent,
  formatMoney,
  getCategoryBudget,
  getPeriodIncome,
  getPeriodMeta,
  getTotalDedicated,
  potSpent,
  useStore,
} from '@/store';
import { colorForName, softForName } from '@/utils/chartColors';
import { periodLabel } from '@/utils/periods';

export function BudgetPage() {
  const categories = useStore((s) => s.categories);
  const allExpenses = useStore((s) => s.expenses);
  const allPots = useStore((s) => s.pots);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const periods = useStore((s) => s.periods);
  const periodMetas = useStore((s) => s.periodMetas);
  const incomeEntries = useStore((s) => s.incomeEntries);
  const updateCategoryBudget = useStore((s) => s.updateCategoryBudget);
  const updatePotOpening = useStore((s) => s.updatePotOpening);
  const setIncomeLump = useStore((s) => s.setIncomeLump);
  const addIncomeEntry = useStore((s) => s.addIncomeEntry);
  const deleteIncomeEntry = useStore((s) => s.deleteIncomeEntry);
  const syncPeriodAllocations = useStore((s) => s.syncPeriodAllocations);
  const ensurePeriodPots = useStore((s) => s.ensurePeriodPots);

  const period = periods.find((p) => p.id === selectedPeriodId);
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.periodId === selectedPeriodId),
    [allExpenses, selectedPeriodId],
  );
  const pots = useMemo(
    () => allPots.filter((p) => p.periodId === selectedPeriodId),
    [allPots, selectedPeriodId],
  );
  const meta = getPeriodMeta(periodMetas, selectedPeriodId);
  const periodIncomeEntries = incomeEntries.filter((e) => e.periodId === selectedPeriodId);
  const income = getPeriodIncome(selectedPeriodId, periodMetas, incomeEntries);
  const dedicated = getTotalDedicated(categories, allPots, selectedPeriodId);
  const unallocated = Math.round((income - dedicated) * 1000) / 1000;

  const [incomeLumpDraft, setIncomeLumpDraft] = useState(String(meta.incomeLump || ''));
  const [incAmount, setIncAmount] = useState('');
  const [incLabel, setIncLabel] = useState('');

  useEffect(() => {
    setIncomeLumpDraft(String(meta.incomeLump || ''));
  }, [selectedPeriodId, meta.incomeLump]);

  // Keep pots ↔ dedications aligned so every allocation subtracts from income
  useEffect(() => {
    ensurePeriodPots(selectedPeriodId);
    syncPeriodAllocations(selectedPeriodId);
  }, [selectedPeriodId, ensurePeriodPots, syncPeriodAllocations]);

  const potRows = useMemo(() => {
    return pots.map((p) => {
      const spent = potSpent(p.id, expenses);
      const remaining = Math.round((p.openingAmount - spent) * 1000) / 1000;
      const pct = p.openingAmount > 0 ? Math.min(999, (spent / p.openingAmount) * 100) : 0;
      return { ...p, spent, remaining, pct };
    });
  }, [pots, expenses]);

  const categoryRows = useMemo(() => {
    return categories
      .map((c) => {
        const pot = pots.find((p) => p.name.toLowerCase() === c.name.toLowerCase());
        // Pot opening is the real allocation from income
        const budget = pot ? pot.openingAmount : getCategoryBudget(c, selectedPeriodId);
        const spent = categorySpent(c.id, expenses);
        const remaining = Math.round((budget - spent) * 1000) / 1000;
        const pct = budget > 0 ? Math.min(999, (spent / budget) * 100) : spent > 0 ? 100 : 0;
        return { ...c, budget, spent, remaining, pct, potId: pot?.id };
      })
      .sort((a, b) => {
        const aActive = a.budget > 0 || a.spent > 0 ? 0 : 1;
        const bActive = b.budget > 0 || b.spent > 0 ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.name.localeCompare(b.name);
      });
  }, [categories, expenses, selectedPeriodId, pots]);

  const totalSpent = useMemo(
    () => Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 1000) / 1000,
    [expenses],
  );
  /** Dedicated but not yet spent — still locked (e.g. $2k Savings untouched). */
  const sittingInPots = Math.round((dedicated - totalSpent) * 1000) / 1000;

  const askDedicationScope = (
    name: string,
    amount: number,
  ): 'this' | 'following' | null => {
    if (
      !confirm(
        `Change dedication for “${name}” to ${formatMoney(amount)}?`,
      )
    ) {
      return null;
    }
    const following = confirm(
      `Also apply to all FOLLOWING periods?\n\nOK = this period + following\nCancel = this period only`,
    );
    return following ? 'following' : 'this';
  };

  const applyCategoryDedication = (
    categoryId: string,
    name: string,
    raw: string,
    previous: number,
    input: HTMLInputElement,
  ) => {
    const n = Number.parseFloat(raw.replace(/[$,\s]/g, ''));
    const amount = Number.isFinite(n) ? Math.max(0, n) : 0;
    if (amount === previous) return;
    const scope = askDedicationScope(name, amount);
    if (!scope) {
      input.value = String(previous);
      return;
    }
    updateCategoryBudget(categoryId, amount, selectedPeriodId, scope);
  };

  const applyPotOpening = (
    potId: string,
    name: string,
    raw: string,
    previous: number,
    input: HTMLInputElement,
  ) => {
    const n = Number.parseFloat(raw.replace(/[$,\s]/g, ''));
    const amount = Number.isFinite(n) ? Math.max(0, n) : 0;
    if (amount === previous) return;
    const scope = askDedicationScope(name, amount);
    if (!scope) {
      input.value = String(previous);
      return;
    }
    updatePotOpening(potId, amount, scope);
  };

  const saveIncomeLump = () => {
    const n = Number.parseFloat(incomeLumpDraft.replace(/[$,\s]/g, ''));
    setIncomeLump(selectedPeriodId, Number.isFinite(n) ? n : 0);
  };

  const addIncome = () => {
    const n = Number.parseFloat(incAmount.replace(/[$,\s]/g, ''));
    if (!(n > 0)) return;
    addIncomeEntry({
      amount: n,
      label: incLabel.trim() || 'Paycheck',
      date: period?.start ?? new Date().toISOString().slice(0, 10),
      periodId: selectedPeriodId,
    });
    setIncAmount('');
    setIncLabel('');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Budget</h1>
        <p className="mt-1 text-sm text-muted">
          Editing{' '}
          <span className="font-semibold text-ink">
            {period ? periodLabel(period) : 'selected period'}
          </span>{' '}
          only · dedications & pots for this 4-week chunk
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">4-week income</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted" htmlFor="incomeLump">
              Base / lump income
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="incomeLump"
                inputMode="decimal"
                className="w-full rounded-lg border border-line px-3 py-2 tabular outline-none focus:ring-2 focus:ring-accent"
                value={incomeLumpDraft}
                onChange={(e) => setIncomeLumpDraft(e.target.value)}
                onBlur={saveIncomeLump}
              />
              <button
                type="button"
                onClick={saveIncomeLump}
                className="rounded-lg border border-line px-3 py-2 text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-accent-soft/50 p-3">
            <p className="text-xs text-muted">Total income this period</p>
            <p className="text-2xl font-bold tabular text-accent">{formatMoney(income)}</p>
            <p className="text-xs text-muted">lump + line items</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="Label (e.g. Paycheck)"
            value={incLabel}
            onChange={(e) => setIncLabel(e.target.value)}
          />
          <input
            className="w-full sm:w-32 rounded-lg border border-line px-3 py-2 text-sm tabular"
            placeholder="Amount"
            inputMode="decimal"
            value={incAmount}
            onChange={(e) => setIncAmount(e.target.value)}
          />
          <button
            type="button"
            onClick={addIncome}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Add income
          </button>
        </div>
        {periodIncomeEntries.length > 0 ? (
          <ul className="divide-y divide-line text-sm">
            {periodIncomeEntries.map((e) => (
              <li key={e.id} className="flex justify-between py-2">
                <span>
                  {e.label} <span className="text-xs text-muted">{e.date}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular font-medium text-accent">+{formatMoney(e.amount)}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-danger"
                    onClick={() => deleteIncomeEntry(e.id)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Income" value={formatMoney(income)} tone="teal" />
        <StatTile
          label="Dedicated"
          value={formatMoney(dedicated)}
          hint="All pot openings (incl. unspent Savings)"
          tone="amber"
        />
        <StatTile
          label="Unallocated"
          value={formatMoney(unallocated)}
          hint="Income − every pot allocation"
          tone={unallocated < 0 ? 'rose' : 'sky'}
        />
      </section>

      <section className="rounded-2xl border border-sky/30 bg-sky-soft/50 p-4 text-sm space-y-1 shadow-soft">
        <p>
          <span className="font-semibold tabular text-accent">{formatMoney(income)}</span> income −{' '}
          <span className="font-semibold tabular text-amber">{formatMoney(dedicated)}</span> dedicated to pots ={' '}
          <span className={`font-semibold tabular ${unallocated < 0 ? 'text-rose' : 'text-sky'}`}>
            {formatMoney(unallocated)}
          </span>{' '}
          left to allocate.
        </p>
        <p className="text-muted">
          Spent from pots {formatMoney(totalSpent)} · still sitting in pots (unspent dedications){' '}
          <span className="font-semibold text-ink tabular">{formatMoney(Math.max(0, sittingInPots))}</span>
        </p>
        <p className="text-xs text-muted">
          Savings and other unspent pots still count against income — they are allocated, not free cash.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Dedications (edit → updates pot)
        </h2>
        <p className="mt-1 text-xs text-muted">
          Setting Food to $500 deducts $500 from unallocated income. You can apply the change to
          this period only, or this and all following periods.
        </p>
        {categoryRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No categories yet — paste Hisaab or add one on Transactions.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {categoryRows.map((c) => {
              const over = c.budget > 0 && c.remaining < 0;
              const accent = colorForName(c.name);
              return (
                <li key={c.id} className="rounded-xl p-3" style={{ background: softForName(c.name) }}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
                      {c.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-muted">
                        Dedicated
                        <input
                          inputMode="decimal"
                          className="w-24 rounded-md border border-line px-2 py-1 tabular text-ink outline-none focus:ring-2 focus:ring-accent"
                          defaultValue={String(c.budget)}
                          key={`${c.id}-${selectedPeriodId}-${c.budget}`}
                          onBlur={(e) => {
                            applyCategoryDedication(
                              c.id,
                              c.name,
                              e.target.value,
                              c.budget,
                              e.target,
                            );
                          }}
                        />
                      </label>
                      <span className={`tabular font-semibold ${over ? 'text-danger' : 'text-accent'}`}>
                        {formatMoney(c.remaining)} left in pot
                      </span>
                    </div>
                  </div>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>
                      Spent {formatMoney(c.spent)}
                      {c.budget > 0 ? ` of ${formatMoney(c.budget)} dedicated` : ''}
                    </span>
                    <span>{c.budget > 0 ? `${Math.round(c.pct)}%` : ''}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, c.pct)}%`,
                        background: over ? '#c43c2c' : accent,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pots (live from dedications + transactions)</h2>
        {potRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No pots this period.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {potRows.map((p) => {
              const over = p.remaining < 0;
              const accent = colorForName(p.name);
              return (
                <li key={p.id} className="rounded-xl p-3" style={{ background: softForName(p.name) }}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
                      {p.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-muted">
                        Opening
                        <input
                          inputMode="decimal"
                          className="w-24 rounded-md border border-line px-2 py-1 tabular outline-none focus:ring-2 focus:ring-accent"
                          defaultValue={String(p.openingAmount)}
                          key={`${p.id}-${p.openingAmount}`}
                          onBlur={(e) => {
                            applyPotOpening(
                              p.id,
                              p.name,
                              e.target.value,
                              p.openingAmount,
                              e.target,
                            );
                          }}
                        />
                      </label>
                      <span
                        className="tabular font-semibold"
                        style={{ color: over ? '#c43c2c' : accent }}
                      >
                        {formatMoney(p.remaining)} left
                      </span>
                    </div>
                  </div>
                  <div className="mb-1 text-xs text-muted">
                    Spent {formatMoney(p.spent)} of {formatMoney(p.openingAmount)}
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, p.pct)}%`,
                        background: over ? '#c43c2c' : accent,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
