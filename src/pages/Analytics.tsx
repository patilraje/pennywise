import { useMemo } from 'react';
import {
  CompareBars,
  DonutChart,
  HBarChart,
  StatTile,
} from '@/components/charts';
import {
  categorySpent,
  formatMoney,
  getCategoryBudget,
  getPeriodIncome,
  getPeriodMeta,
  potSpent,
  useStore,
} from '@/store';
import { colorAt, colorForName, softAt } from '@/utils/chartColors';
import { periodLabel, periodShortLabel } from '@/utils/periods';

export function AnalyticsPage() {
  const categories = useStore((s) => s.categories);
  const allExpenses = useStore((s) => s.expenses);
  const allPots = useStore((s) => s.pots);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const periods = useStore((s) => s.periods);
  const periodMetas = useStore((s) => s.periodMetas);
  const incomeEntries = useStore((s) => s.incomeEntries);

  const period = periods.find((p) => p.id === selectedPeriodId);
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.periodId === selectedPeriodId),
    [allExpenses, selectedPeriodId],
  );
  const pots = useMemo(
    () => allPots.filter((p) => p.periodId === selectedPeriodId),
    [allPots, selectedPeriodId],
  );

  const income = getPeriodIncome(selectedPeriodId, periodMetas, incomeEntries);
  const meta = getPeriodMeta(periodMetas, selectedPeriodId);
  const totalSpent = useMemo(
    () => Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 1000) / 1000,
    [expenses],
  );
  const incomeLeft = Math.round((income - totalSpent) * 1000) / 1000;

  const byCategory = useMemo(() => {
    return categories
      .map((c) => {
        const spent = categorySpent(c.id, expenses);
        const budget = getCategoryBudget(c, selectedPeriodId);
        return { id: c.id, name: c.name, spent, budget };
      })
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [categories, expenses, selectedPeriodId]);

  const potRows = pots.map((p) => {
    const spent = potSpent(p.id, expenses);
    return {
      ...p,
      spent,
      remaining: Math.round((p.openingAmount - spent) * 1000) / 1000,
    };
  });

  const history = useMemo(() => {
    return [...periods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(-6)
      .map((p) => {
        const spent = allExpenses
          .filter((e) => e.periodId === p.id)
          .reduce((s, e) => s + e.amount, 0);
        const inc = getPeriodIncome(p.id, periodMetas, incomeEntries);
        return {
          id: p.id,
          label: periodShortLabel(p),
          spent: Math.round(spent * 1000) / 1000,
          income: inc,
          isActive: p.id === selectedPeriodId,
        };
      });
  }, [periods, allExpenses, periodMetas, incomeEntries, selectedPeriodId]);

  const donutSlices = byCategory.map((c, i) => ({
    label: c.name,
    value: c.spent,
    color: colorForName(c.name) || colorAt(i),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          {period ? periodLabel(period) : 'Selected period'} · colorful spend picture
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Income" value={formatMoney(income)} tone="teal" />
        <StatTile label="Spent" value={formatMoney(totalSpent)} tone="coral" />
        <StatTile
          label="Left from income"
          value={formatMoney(incomeLeft)}
          hint={
            meta.overallBudget > 0
              ? `Budget ${formatMoney(meta.overallBudget)}`
              : undefined
          }
          tone={incomeLeft < 0 ? 'rose' : 'sky'}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Income vs spend
          </h2>
          <div className="mt-4">
            <CompareBars
              left={{ label: 'Income', value: income, color: '#0f7a6a' }}
              right={{ label: 'Spent', value: totalSpent, color: '#e85d4c' }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Spend mix
          </h2>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <DonutChart
              slices={donutSlices}
              centerLabel="spent"
              centerValue={formatMoney(totalSpent)}
              size={168}
            />
            <ul className="w-full flex-1 space-y-1.5 text-sm">
              {donutSlices.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="tabular font-semibold">{formatMoney(s.value)}</span>
                </li>
              ))}
              {donutSlices.length === 0 ? (
                <li className="text-muted">No spending this period.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Spend by category
        </h2>
        {byCategory.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No spending this period.</p>
        ) : (
          <div className="mt-4">
            <HBarChart
              bars={byCategory.map((c) => ({
                label: c.name,
                value: c.spent,
                color: colorForName(c.name),
                right:
                  c.budget > 0
                    ? `${formatMoney(c.spent)} / ${formatMoney(c.budget)}`
                    : formatMoney(c.spent),
              }))}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pots left</h2>
        {potRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No pots this period.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {potRows.map((p, i) => {
              const color = colorForName(p.name);
              const soft = softAt(i);
              const pct =
                p.openingAmount > 0
                  ? Math.min(100, Math.max(0, (p.remaining / p.openingAmount) * 100))
                  : 0;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-line p-3"
                  style={{ background: soft }}
                >
                  <div className="flex justify-between font-semibold text-sm">
                    <span>{p.name}</span>
                    <span className="tabular" style={{ color }}>
                      {formatMoney(p.remaining)} left
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatMoney(p.spent)} of {formatMoney(p.openingAmount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Period columns
        </h2>
        <p className="mt-1 text-xs text-muted">Income (teal) vs spend (coral) across recent periods</p>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-[320px] items-end gap-4" style={{ height: 180 }}>
            {history.map((h, i) => {
              const max = Math.max(h.income, h.spent, 1);
              const incH = Math.max(6, (h.income / max) * 120);
              const spH = Math.max(6, (h.spent / max) * 120);
              return (
                <div
                  key={h.id}
                  className={`flex flex-1 flex-col items-center gap-1 ${
                    h.isActive ? 'opacity-100' : 'opacity-80'
                  }`}
                >
                  <div className="flex items-end gap-1" style={{ height: 130 }}>
                    <div
                      className="w-3 rounded-t-md bg-accent sm:w-4"
                      style={{ height: incH, boxShadow: '0 4px 10px -4px #0f7a6a88' }}
                      title={`Income ${formatMoney(h.income)}`}
                    />
                    <div
                      className="w-3 rounded-t-md bg-coral sm:w-4"
                      style={{ height: spH, boxShadow: '0 4px 10px -4px #e85d4c88' }}
                      title={`Spent ${formatMoney(h.spent)}`}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      h.isActive ? 'text-sky' : 'text-muted'
                    }`}
                  >
                    {h.label}
                  </span>
                  <span className="sr-only">{i}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-coral" /> Spent
          </span>
        </div>
      </section>
    </div>
  );
}
