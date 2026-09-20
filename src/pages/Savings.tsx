import { useMemo } from 'react';
import { ColumnChart, DonutChart, StatTile } from '@/components/charts';
import { formatMoney, potSpent, useStore } from '@/store';
import type { Expense, PayPeriod, Pot } from '@/types';
import { colorAt, softAt } from '@/utils/chartColors';
import { periodLabel, periodShortLabel } from '@/utils/periods';

function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function isSavingsName(name: string): boolean {
  return name.trim().toLowerCase() === 'savings';
}

export type PeriodSavings = {
  period: PayPeriod;
  savingsFundRemaining: number;
  unspentFromOthers: number;
  leftoverPots: { name: string; remaining: number }[];
  totalThisPeriod: number;
};

export function computePeriodSavings(
  period: PayPeriod,
  pots: Pot[],
  expenses: Expense[],
): PeriodSavings {
  const periodPots = pots.filter((p) => p.periodId === period.id);
  const periodExpenses = expenses.filter((e) => e.periodId === period.id);

  let savingsFundRemaining = 0;
  const leftoverPots: { name: string; remaining: number }[] = [];

  for (const pot of periodPots) {
    const spent = potSpent(pot.id, periodExpenses);
    const remaining = money(pot.openingAmount - spent);
    if (isSavingsName(pot.name)) {
      savingsFundRemaining = money(savingsFundRemaining + Math.max(0, remaining));
    } else if (remaining > 0) {
      leftoverPots.push({ name: pot.name, remaining });
    }
  }

  leftoverPots.sort((a, b) => b.remaining - a.remaining);
  const unspentFromOthers = money(leftoverPots.reduce((s, p) => s + p.remaining, 0));

  return {
    period,
    savingsFundRemaining,
    unspentFromOthers,
    leftoverPots,
    totalThisPeriod: money(savingsFundRemaining + unspentFromOthers),
  };
}

function leftoverSummary(leftovers: { name: string; remaining: number }[]): string {
  if (leftovers.length === 0) return 'no unspent pot leftovers';
  return leftovers
    .map((p) => `${formatMoney(p.remaining)} unspent from ${p.name}`)
    .join(', ');
}

export function SavingsPage() {
  const periods = useStore((s) => s.periods);
  const pots = useStore((s) => s.pots);
  const expenses = useStore((s) => s.expenses);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);

  const rows = useMemo(() => {
    return [...periods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((p) => computePeriodSavings(p, pots, expenses))
      .filter(
        (r) =>
          r.totalThisPeriod > 0 ||
          pots.some((p) => p.periodId === r.period.id) ||
          expenses.some((e) => e.periodId === r.period.id),
      );
  }, [periods, pots, expenses]);

  const overallSavings = useMemo(
    () => money(rows.reduce((s, r) => s + r.totalThisPeriod, 0)),
    [rows],
  );

  const overallSavingsFund = useMemo(
    () => money(rows.reduce((s, r) => s + r.savingsFundRemaining, 0)),
    [rows],
  );

  const overallLeftovers = useMemo(
    () => money(rows.reduce((s, r) => s + r.unspentFromOthers, 0)),
    [rows],
  );

  const chartRows = rows.filter((r) => r.totalThisPeriod > 0 || r.period.id === selectedPeriodId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Savings</h1>
        <p className="mt-1 text-sm text-muted">
          Savings pot remaining + unspent dedicated funds — still in your pocket
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Overall savings"
          value={formatMoney(overallSavings)}
          hint="Still in your pocket across all periods"
          tone="lime"
        />
        <StatTile
          label="Savings fund"
          value={formatMoney(overallSavingsFund)}
          hint="Unspent from Savings pots"
          tone="teal"
        />
        <StatTile
          label="Pot leftovers"
          value={formatMoney(overallLeftovers)}
          hint="Unspent from Food, Gas, etc."
          tone="amber"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Overall mix</h2>
          <div className="mt-3 flex justify-center">
            <DonutChart
              slices={[
                { label: 'Savings fund', value: overallSavingsFund, color: '#0f7a6a' },
                { label: 'Pot leftovers', value: overallLeftovers, color: '#e8a317' },
              ]}
              centerLabel="pocket"
              centerValue={formatMoney(overallSavings)}
              size={170}
            />
          </div>
          <div className="mt-3 flex justify-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Savings fund
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Leftovers
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Saved per period
          </h2>
          {chartRows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No periods with savings yet.</p>
          ) : (
            <div className="mt-4">
              <ColumnChart
                bars={chartRows.map((r, i) => ({
                  label: periodShortLabel(r.period),
                  value: r.totalThisPeriod,
                  color: colorAt(i),
                  soft: softAt(i),
                  sub: `Fund ${formatMoney(r.savingsFundRemaining)} · left ${formatMoney(r.unspentFromOthers)}`,
                }))}
                height={180}
              />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Period summaries
        </h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Paste Hisaab or set pot dedications to see savings.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {[...rows].reverse().map((r, i) => (
              <li
                key={r.period.id}
                className={`rounded-xl border p-4 ${
                  r.period.id === selectedPeriodId
                    ? 'border-lime/40 bg-lime-soft/50'
                    : 'border-line'
                }`}
                style={
                  r.period.id === selectedPeriodId
                    ? undefined
                    : { borderLeftWidth: 4, borderLeftColor: colorAt(i) }
                }
              >
                <p className="text-sm font-semibold">{periodLabel(r.period)}</p>
                <p className="mt-2 text-sm leading-relaxed">
                  Savings fund remaining{' '}
                  <span className="font-semibold tabular text-accent">
                    {formatMoney(r.savingsFundRemaining)}
                  </span>
                  {r.leftoverPots.length > 0 ? (
                    <>, {leftoverSummary(r.leftoverPots)}</>
                  ) : (
                    <> · no unspent leftovers from other pots</>
                  )}
                  . Total savings this period{' '}
                  <span className="font-semibold tabular text-lime">
                    {formatMoney(r.totalThisPeriod)}
                  </span>
                  .
                </p>
                {r.leftoverPots.length > 0 ? (
                  <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                    {r.leftoverPots.map((p) => (
                      <li
                        key={p.name}
                        className="flex justify-between rounded-md bg-canvas/80 px-2 py-1.5 text-xs"
                      >
                        <span>{p.name}</span>
                        <span className="tabular font-medium">{formatMoney(p.remaining)} left</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-lime/30 bg-lime-soft/40 p-4 text-sm shadow-soft">
        <p>
          <span className="font-semibold text-lime">
            Overall savings = {formatMoney(overallSavings)}
          </span>{' '}
          ({formatMoney(overallSavingsFund)} in Savings pots +{' '}
          {formatMoney(overallLeftovers)} unspent from other dedications).
        </p>
      </section>
    </div>
  );
}
