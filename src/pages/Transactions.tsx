import { useEffect, useMemo, useState } from 'react';
import { DonutChart, HBarChart, StatTile } from '@/components/charts';
import {
  categorySpent,
  formatMoney,
  getCategoryBudget,
  potSpent,
  useStore,
} from '@/store';
import type { Expense } from '@/types';
import { colorForName, softForName } from '@/utils/chartColors';
import { periodLabel } from '@/utils/periods';

type EditDraft = {
  amount: string;
  label: string;
  categoryId: string;
  date: string;
  potId: string;
};

export function TransactionsPage() {
  const categories = useStore((s) => s.categories);
  const allExpenses = useStore((s) => s.expenses);
  const allPots = useStore((s) => s.pots);
  const allPending = useStore((s) => s.pending);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const updateCategoryName = useStore((s) => s.updateCategoryName);
  const updateCategoryBudget = useStore((s) => s.updateCategoryBudget);
  const addCategory = useStore((s) => s.addCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const updateExpense = useStore((s) => s.updateExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const addExpenseToPot = useStore((s) => s.addExpenseToPot);
  const addBulkExpensesToPot = useStore((s) => s.addBulkExpensesToPot);
  const deletePending = useStore((s) => s.deletePending);
  const clearTransactions = useStore((s) => s.clearTransactions);
  const ensurePeriodPots = useStore((s) => s.ensurePeriodPots);
  const periods = useStore((s) => s.periods);

  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [potAmountDraft, setPotAmountDraft] = useState<Record<string, string>>({});
  const [potLabelDraft, setPotLabelDraft] = useState<Record<string, string>>({});
  const [potBulkOpen, setPotBulkOpen] = useState<Record<string, boolean>>({});
  const [potBulkText, setPotBulkText] = useState<Record<string, string>>({});

  const expenses = useMemo(
    () => allExpenses.filter((e) => e.periodId === selectedPeriodId),
    [allExpenses, selectedPeriodId],
  );
  const pots = useMemo(
    () => allPots.filter((p) => p.periodId === selectedPeriodId),
    [allPots, selectedPeriodId],
  );
  const pending = useMemo(
    () => allPending.filter((p) => p.periodId === selectedPeriodId),
    [allPending, selectedPeriodId],
  );

  const period = periods.find((p) => p.id === selectedPeriodId);

  useEffect(() => {
    ensurePeriodPots(selectedPeriodId);
  }, [selectedPeriodId, ensurePeriodPots]);

  const hasActivity = expenses.length > 0 || pots.length > 0 || pending.length > 0;
  const categoriesWithSpend = useMemo(() => {
    return categories
      .map((c) => ({
        ...c,
        spent: categorySpent(c.id, expenses),
        items: expenses.filter((e) => e.categoryId === c.id),
      }))
      .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
  }, [categories, expenses]);

  const totalSpent = useMemo(
    () => Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 1000) / 1000,
    [expenses],
  );

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setDraft({
      amount: String(e.amount),
      label: e.label,
      categoryId: e.categoryId,
      date: e.date,
      potId: e.potId,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    const amount = Number.parseFloat(draft.amount.replace(/[$,\s]/g, ''));
    if (!(amount > 0)) {
      alert('Enter a valid amount greater than 0.');
      return;
    }
    updateExpense(editingId, {
      amount,
      label: draft.label,
      categoryId: draft.categoryId,
      date: draft.date,
      potId: draft.potId,
    });
    cancelEdit();
  };

  const submitPotExpense = (potId: string) => {
    const amountRaw = (potAmountDraft[potId] ?? '').replace(/[$,\s]/g, '');
    const amount = Number.parseFloat(amountRaw);
    if (!(amount > 0)) {
      alert('Enter an amount greater than 0.');
      return;
    }
    const ok = addExpenseToPot({
      potId,
      amount,
      label: potLabelDraft[potId] ?? '',
    });
    if (ok) {
      setPotAmountDraft((d) => ({ ...d, [potId]: '' }));
      setPotLabelDraft((d) => ({ ...d, [potId]: '' }));
    }
  };

  const submitPotBulk = (potId: string) => {
    const text = potBulkText[potId] ?? '';
    const { added, errors } = addBulkExpensesToPot(potId, text);
    if (added > 0) {
      setPotBulkText((d) => ({ ...d, [potId]: '' }));
      setPotBulkOpen((d) => ({ ...d, [potId]: false }));
    }
    if (errors.length) {
      alert(
        added > 0
          ? `Added ${added} expense(s). Some lines were skipped:\n${errors.join('\n')}`
          : errors.join('\n'),
      );
    } else if (added === 0) {
      alert('Paste lines like -4 sephora (one per line).');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Spending</h1>
          <p className="mt-1 text-sm text-muted">
            Editing{' '}
            <span className="font-semibold text-ink">
              {period ? periodLabel(period) : 'selected period'}
            </span>{' '}
            only · add expenses under each pot (single or bulk)
          </p>
        </div>
        {hasActivity ? (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  'Clear pots, expenses, and pending notes for the selected period? Category names and budgets will be kept.',
                )
              ) {
                clearTransactions();
              }
            }}
            className="rounded-lg border border-coral/40 bg-coral-soft px-4 py-2 text-sm font-semibold text-coral hover:bg-coral/10"
          >
            Clear all transactions
          </button>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Total spent" value={formatMoney(totalSpent)} tone="coral" />
        <StatTile
          label="Categories with spend"
          value={String(categoriesWithSpend.filter((c) => c.spent > 0).length)}
          tone="amber"
        />
      </section>

      {categoriesWithSpend.some((c) => c.spent > 0) ? (
        <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:grid-cols-2">
          <div className="flex flex-col items-center">
            <h2 className="self-start text-sm font-semibold uppercase tracking-wide text-muted">
              Spend mix
            </h2>
            <div className="mt-2">
              <DonutChart
                slices={categoriesWithSpend
                  .filter((c) => c.spent > 0)
                  .map((c) => ({
                    label: c.name,
                    value: c.spent,
                    color: colorForName(c.name),
                  }))}
                centerLabel="spent"
                centerValue={formatMoney(totalSpent)}
                size={160}
              />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              By category
            </h2>
            <div className="mt-3">
              <HBarChart
                bars={categoriesWithSpend
                  .filter((c) => c.spent > 0)
                  .map((c) => ({
                    label: c.name,
                    value: c.spent,
                    color: colorForName(c.name),
                  }))}
              />
            </div>
          </div>
        </section>
      ) : null}

      {pots.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pots</h2>
          <p className="mt-1 text-xs text-muted">
            Add one expense or bulk paste lines like <span className="font-mono">-4 sephora</span>{' '}
            under each pot.
          </p>
          <ul className="mt-4 space-y-4">
            {pots.map((p) => {
              const spent = potSpent(p.id, expenses);
              const rem = Math.round((p.openingAmount - spent) * 1000) / 1000;
              const color = colorForName(p.name);
              const potItems = expenses
                .filter((e) => e.potId === p.id)
                .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
              const bulkOpen = potBulkOpen[p.id] ?? false;

              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-line p-4 text-sm"
                  style={{ background: softForName(p.name), borderLeftWidth: 4, borderLeftColor: color }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      {p.name}
                    </span>
                    <span className="tabular" style={{ color }}>
                      {formatMoney(rem)} left
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Opened {formatMoney(p.openingAmount)} · spent {formatMoney(spent)}
                  </p>

                  <ul className="mt-3 divide-y divide-line/80 rounded-lg bg-surface/80">
                    {potItems.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{e.label}</p>
                          <p className="text-xs text-muted">{e.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="tabular font-semibold text-danger">
                            -{formatMoney(e.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-canvas"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete “${e.label}” (${formatMoney(e.amount)})?`)) {
                                deleteExpense(e.id);
                                if (editingId === e.id) cancelEdit();
                              }
                            }}
                            className="rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/5"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                    {potItems.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted">No expenses in this pot yet.</li>
                    ) : null}
                  </ul>

                  {!bulkOpen ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="sm:w-28">
                        <label className="text-xs text-muted" htmlFor={`pot-amt-${p.id}`}>
                          Amount
                        </label>
                        <input
                          id={`pot-amt-${p.id}`}
                          inputMode="decimal"
                          placeholder="4.00"
                          className="mt-1 w-full rounded-lg border border-line px-3 py-2 tabular outline-none focus:ring-2 focus:ring-accent"
                          value={potAmountDraft[p.id] ?? ''}
                          onChange={(ev) =>
                            setPotAmountDraft((d) => ({ ...d, [p.id]: ev.target.value }))
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') submitPotExpense(p.id);
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="text-xs text-muted" htmlFor={`pot-lbl-${p.id}`}>
                          Label
                        </label>
                        <input
                          id={`pot-lbl-${p.id}`}
                          placeholder="sephora"
                          className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
                          value={potLabelDraft[p.id] ?? ''}
                          onChange={(ev) =>
                            setPotLabelDraft((d) => ({ ...d, [p.id]: ev.target.value }))
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') submitPotExpense(p.id);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => submitPotExpense(p.id)}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white sm:self-end"
                      >
                        Add expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setPotBulkOpen((d) => ({ ...d, [p.id]: true }))}
                        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-ink sm:self-end"
                      >
                        Add in bulk
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Bulk add (one line per expense)
                      </label>
                      <textarea
                        className="min-h-[100px] w-full rounded-lg border border-line bg-surface p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-accent"
                        placeholder={`-2\n-4 sephora\n-10 ulta`}
                        value={potBulkText[p.id] ?? ''}
                        onChange={(ev) =>
                          setPotBulkText((d) => ({ ...d, [p.id]: ev.target.value }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => submitPotBulk(p.id)}
                          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
                        >
                          Add all
                        </button>
                        <button
                          type="button"
                          onClick={() => setPotBulkOpen((d) => ({ ...d, [p.id]: false }))}
                          className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {categoriesWithSpend.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          No categories yet. Add one below, or paste Hisaab notes in Ask PennyWise.
        </div>
      ) : (
        <div className="space-y-4">
          {categoriesWithSpend.map((cat) => {
            const budget = getCategoryBudget(cat, selectedPeriodId);
            const nameValue = nameDrafts[cat.id] ?? cat.name;
            const budgetValue = budgetDrafts[cat.id] ?? String(budget);
            const pct = budget > 0 ? Math.min(999, (cat.spent / budget) * 100) : cat.spent > 0 ? 100 : 0;
            const over = budget > 0 && cat.spent > budget;
            const accent = colorForName(cat.name);
            const soft = softForName(cat.name);

            return (
              <section
                key={cat.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-soft"
                style={{ borderLeftWidth: 4, borderLeftColor: accent }}
              >
                <div
                  className="-mx-4 -mt-4 mb-4 rounded-t-2xl px-4 py-2"
                  style={{ background: soft }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                    {cat.name}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted" htmlFor={`name-${cat.id}`}>
                      Category name
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={`name-${cat.id}`}
                        className="w-full rounded-lg border border-line px-3 py-2 text-base font-semibold outline-none focus:ring-2 focus:ring-accent"
                        value={nameValue}
                        onChange={(e) => setNameDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateCategoryName(cat.id, nameValue);
                            setNameDrafts((d) => {
                              const next = { ...d };
                              delete next[cat.id];
                              return next;
                            });
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateCategoryName(cat.id, nameValue);
                          setNameDrafts((d) => {
                            const next = { ...d };
                            delete next[cat.id];
                            return next;
                          });
                        }}
                        className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-canvas"
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                  <div className="w-full sm:w-36">
                    <label className="text-xs font-medium text-muted" htmlFor={`budget-${cat.id}`}>
                      Budget
                    </label>
                    <input
                      id={`budget-${cat.id}`}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-line px-3 py-2 tabular outline-none focus:ring-2 focus:ring-accent"
                      value={budgetValue}
                      onChange={(e) => setBudgetDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                      onBlur={() => {
                        if (budgetDrafts[cat.id] !== undefined) {
                          const n = Number.parseFloat(budgetValue.replace(/[$,\s]/g, ''));
                          updateCategoryBudget(
                            cat.id,
                            Number.isFinite(n) ? n : 0,
                            selectedPeriodId,
                          );
                          setBudgetDrafts((d) => {
                            const next = { ...d };
                            delete next[cat.id];
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const count = cat.items.length;
                      const msg =
                        count > 0
                          ? `Remove category “${cat.name}”? ${count} expense(s) will move to Other.`
                          : `Remove category “${cat.name}”?`;
                      if (categories.length <= 1) {
                        alert('Keep at least one category.');
                        return;
                      }
                      if (confirm(msg)) deleteCategory(cat.id);
                    }}
                    className="rounded-lg border border-danger/40 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/5 sm:self-end"
                  >
                    Remove category
                  </button>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>
                      Spent {formatMoney(cat.spent)}
                      {budget > 0 ? ` of ${formatMoney(budget)}` : ''}
                    </span>
                    <span className={over ? 'font-semibold text-danger' : ''}>
                      {budget > 0 ? `${Math.round(pct)}%` : 'no budget'}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: over ? '#c43c2c' : accent,
                      }}
                    />
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-line">
                  {cat.items.map((e) => {
                    const pot = pots.find((p) => p.id === e.potId);
                    const isEditing = editingId === e.id && draft;

                    if (isEditing && draft) {
                      return (
                        <li key={e.id} className="space-y-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="text-xs text-muted" htmlFor={`lbl-${e.id}`}>
                                Label
                              </label>
                              <input
                                id={`lbl-${e.id}`}
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                                value={draft.label}
                                onChange={(ev) => setDraft({ ...draft, label: ev.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted" htmlFor={`amt-${e.id}`}>
                                Amount
                              </label>
                              <input
                                id={`amt-${e.id}`}
                                inputMode="decimal"
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm tabular outline-none focus:ring-2 focus:ring-accent"
                                value={draft.amount}
                                onChange={(ev) => setDraft({ ...draft, amount: ev.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted" htmlFor={`cat-${e.id}`}>
                                Category
                              </label>
                              <select
                                id={`cat-${e.id}`}
                                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                                value={draft.categoryId}
                                onChange={(ev) => setDraft({ ...draft, categoryId: ev.target.value })}
                              >
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted" htmlFor={`pot-${e.id}`}>
                                Pot
                              </label>
                              <select
                                id={`pot-${e.id}`}
                                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                                value={draft.potId}
                                onChange={(ev) => setDraft({ ...draft, potId: ev.target.value })}
                              >
                                {pots.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted" htmlFor={`date-${e.id}`}>
                                Date
                              </label>
                              <input
                                id={`date-${e.id}`}
                                type="date"
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                                value={draft.date}
                                onChange={(ev) => setDraft({ ...draft, date: ev.target.value })}
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={saveEdit}
                              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{e.label}</p>
                          <p className="text-xs text-muted">
                            {e.date}
                            {pot ? ` · ${pot.name}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="tabular font-semibold text-danger">-{formatMoney(e.amount)}</span>
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink hover:bg-canvas"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete “${e.label}” (${formatMoney(e.amount)})?`)) {
                                deleteExpense(e.id);
                                if (editingId === e.id) cancelEdit();
                              }
                            }}
                            className="rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/5"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {!cat.items.length ? (
                    <li className="py-2 text-sm text-muted">No expenses in this category yet.</li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Add category</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g. Subscriptions"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCategoryName.trim()) {
                addCategory(newCategoryName);
                setNewCategoryName('');
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newCategoryName.trim()) return;
              addCategory(newCategoryName);
              setNewCategoryName('');
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
      </section>

      {pending.length > 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pending notes</h2>
          <p className="mt-1 text-xs text-muted">Not counted as spending.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {pending.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
                <span className="text-muted">{p.text}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Remove this pending note?')) deletePending(p.id);
                  }}
                  className="shrink-0 text-xs font-semibold text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
