import { create } from 'zustand';
import type {
  Category,
  Expense,
  HisaabParseResult,
  IncomeEntry,
  PayPeriod,
  PendingNote,
  PeriodMeta,
  Pot,
} from './types';
import { categoryFromPot } from './services/hisaabParser';
import { parseExpenseBulkLines } from './utils/expenseLines';
import {
  DEFAULT_ANCHOR,
  buildPeriodsFromAnchor,
  ensurePeriodForDate,
  findPeriodByStart,
  makePeriod,
} from './utils/periods';

const STORAGE_KEY = 'pennywise-v2';
const LEGACY_KEY = 'pennywise-step1';

type Persisted = {
  categories: Category[];
  pots: Pot[];
  expenses: Expense[];
  pending: PendingNote[];
  periods: PayPeriod[];
  selectedPeriodId: string;
  periodMetas: PeriodMeta[];
  incomeEntries: IncomeEntry[];
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function defaultCategories(periodId: string): Category[] {
  // Names only — dedications start at $0; users set amounts via Budget / Hisaab.
  const seed: { id: string; name: string }[] = [
    { id: 'cat-food', name: 'Food' },
    { id: 'cat-other', name: 'Other' },
    { id: 'cat-gas', name: 'Gas' },
    { id: 'cat-rent', name: 'Rent' },
    { id: 'cat-insurance', name: 'Insurance etc' },
    { id: 'cat-savings', name: 'Savings' },
    { id: 'cat-costco', name: 'Costco Membership' },
  ];
  return seed.map((c) => ({
    id: c.id,
    name: c.name,
    budgetsByPeriod: { [periodId]: 0 },
  }));
}

function emptyMeta(periodId: string): PeriodMeta {
  return { periodId, overallBudget: 0, incomeLump: 0 };
}

function defaultState(): Persisted {
  const periods = buildPeriodsFromAnchor(DEFAULT_ANCHOR, '2026-09-19', 3);
  const first = periods[0] ?? makePeriod(DEFAULT_ANCHOR);
  return {
    categories: defaultCategories(first.id),
    pots: [],
    expenses: [],
    pending: [],
    periods,
    selectedPeriodId: first.id,
    periodMetas: [emptyMeta(first.id)],
    incomeEntries: [],
  };
}

function migrateLegacy(raw: string): Persisted | null {
  try {
    const parsed = JSON.parse(raw) as {
      categories?: { id: string; name: string; budget?: number; budgetsByPeriod?: Record<string, number> }[];
      pots?: Pot[];
      expenses?: Expense[];
      pending?: PendingNote[];
    };
    const base = defaultState();
    const pid = base.selectedPeriodId;
    const categories: Category[] = (parsed.categories?.length ? parsed.categories : base.categories).map((c) => {
      const legacy = c as { id: string; name: string; budget?: number; budgetsByPeriod?: Record<string, number> };
      return {
        id: legacy.id,
        name: legacy.name,
        budgetsByPeriod: legacy.budgetsByPeriod ?? { [pid]: legacy.budget ?? 0 },
      };
    });
    return {
      ...base,
      categories,
      pots: (parsed.pots ?? []).map((p) => ({ ...p, periodId: p.periodId ?? pid })),
      expenses: (parsed.expenses ?? []).map((e) => ({ ...e, periodId: e.periodId ?? pid })),
      pending: (parsed.pending ?? []).map((p) => ({ ...p, periodId: p.periodId ?? pid })),
    };
  } catch {
    return null;
  }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      const periods =
        parsed.periods?.length > 0
          ? parsed.periods
          : buildPeriodsFromAnchor(DEFAULT_ANCHOR, '2026-09-19', 3);
      const selectedPeriodId =
        periods.find((p) => p.id === parsed.selectedPeriodId)?.id ?? periods[0].id;
      return {
        categories: parsed.categories?.length ? parsed.categories : defaultCategories(selectedPeriodId),
        pots: parsed.pots ?? [],
        expenses: parsed.expenses ?? [],
        pending: parsed.pending ?? [],
        periods,
        selectedPeriodId,
        periodMetas: parsed.periodMetas ?? [emptyMeta(selectedPeriodId)],
        incomeEntries: parsed.incomeEntries ?? [],
      };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateLegacy(legacy);
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    /* fall through */
  }
  return defaultState();
}

function persist(state: Persisted) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categories: state.categories,
      pots: state.pots,
      expenses: state.expenses,
      pending: state.pending,
      periods: state.periods,
      selectedPeriodId: state.selectedPeriodId,
      periodMetas: state.periodMetas,
      incomeEntries: state.incomeEntries,
    }),
  );
}

function ensureCategory(
  categories: Category[],
  name: string,
  periodId: string,
): { categories: Category[]; id: string } {
  const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return { categories, id: existing.id };
  const created: Category = { id: uid('cat'), name, budgetsByPeriod: { [periodId]: 0 } };
  return { categories: [...categories, created], id: created.id };
}

function getMeta(metas: PeriodMeta[], periodId: string): PeriodMeta {
  return metas.find((m) => m.periodId === periodId) ?? emptyMeta(periodId);
}

function expenseDateForPeriod(period: PayPeriod | undefined, date?: string): string {
  if (date) return date;
  const today = todayIso();
  if (period && today >= period.start && today <= period.end) return today;
  return period?.start ?? today;
}

type Store = Persisted & {
  setSelectedPeriodId: (id: string) => void;
  ensurePeriodsThrough: (date: string) => void;
  confirmParse: (result: HisaabParseResult) => void;
  updateCategoryName: (id: string, name: string) => void;
  updateCategoryBudget: (
    id: string,
    budget: number,
    periodId?: string,
    scope?: 'this' | 'following',
  ) => void;
  updatePotOpening: (
    potId: string,
    openingAmount: number,
    scope?: 'this' | 'following',
  ) => void;
  addCategory: (name: string) => string;
  deleteCategory: (id: string) => void;
  updateExpense: (
    id: string,
    patch: Partial<Pick<Expense, 'amount' | 'label' | 'categoryId' | 'date' | 'potId'>>,
  ) => void;
  deleteExpense: (id: string) => void;
  addExpenseToPot: (params: {
    potId: string;
    amount: number;
    label?: string;
    date?: string;
  }) => boolean;
  addBulkExpensesToPot: (
    potId: string,
    text: string,
  ) => { added: number; errors: string[] };
  deletePending: (id: string) => void;
  setOverallBudget: (periodId: string, amount: number) => void;
  setIncomeLump: (periodId: string, amount: number) => void;
  addIncomeEntry: (entry: Omit<IncomeEntry, 'id'> & { id?: string }) => void;
  deleteIncomeEntry: (id: string) => void;
  clearTransactions: () => void;
  clearAll: () => void;
  /** Align category budgets ↔ pot openings for a period (pots are source of truth). */
  syncPeriodAllocations: (periodId?: string) => void;
  /** Ensure every category has a pot row for this period (openings stay period-scoped). */
  ensurePeriodPots: (periodId?: string) => void;
};

export const useStore = create<Store>((set, get) => {
  const initial = load();
  return {
    ...initial,

    setSelectedPeriodId: (id) => {
      const next = { ...get(), selectedPeriodId: id };
      persist(next);
      set({ selectedPeriodId: id });
      get().ensurePeriodPots(id);
    },

    ensurePeriodsThrough: (date) => {
      const { periods, period } = ensurePeriodForDate(get().periods, date);
      const metas = get().periodMetas.some((m) => m.periodId === period.id)
        ? get().periodMetas
        : [...get().periodMetas, emptyMeta(period.id)];
      const next = { ...get(), periods, periodMetas: metas };
      persist(next);
      set({ periods, periodMetas: metas });
    },

    confirmParse: (result) => {
      let periods = get().periods;
      let periodId = get().selectedPeriodId;

      if (result.periodStart) {
        const { periods: nextPeriods, period } = ensurePeriodForDate(periods, result.periodStart);
        periods = nextPeriods;
        // Prefer exact start match
        const byStart = findPeriodByStart(periods, result.periodStart) ?? period;
        periodId = byStart.id;
        if (!periods.some((p) => p.id === byStart.id)) {
          periods = [...periods, byStart].sort((a, b) => a.start.localeCompare(b.start));
        }
      }

      const period = periods.find((p) => p.id === periodId) ?? periods[0];
      periodId = period.id;
      const date =
        todayIso() >= period.start && todayIso() <= period.end ? todayIso() : period.start;

      let categories = [...get().categories];
      let periodMetas = get().periodMetas;
      if (!periodMetas.some((m) => m.periodId === periodId)) {
        periodMetas = [...periodMetas, emptyMeta(periodId)];
      }

      const potIdMap = new Map<string, string>();
      const newPots: Pot[] = [];
      const newExpenses: Expense[] = [];
      const t = nowIso();

      for (const p of result.pots) {
        const id = uid('pot');
        potIdMap.set(p.tempId, id);
        newPots.push({
          id,
          name: p.name,
          openingAmount: p.openingAmount,
          periodId,
          createdAt: t,
        });
      }

      for (const e of result.expenses) {
        const ensured = ensureCategory(categories, e.categoryName, periodId);
        categories = ensured.categories;
        const potId = potIdMap.get(e.potTempId);
        if (!potId) continue;
        newExpenses.push({
          id: uid('exp'),
          amount: e.amount,
          label: e.label,
          categoryId: ensured.id,
          potId,
          periodId,
          date,
          createdAt: t,
        });
      }

      // Dedicate category budgets from pot openings (Food - 500 → Food budget 500)
      for (const p of newPots) {
        const ensured = ensureCategory(categories, p.name, periodId);
        categories = ensured.categories.map((c) =>
          c.id === ensured.id
            ? {
                ...c,
                budgetsByPeriod: {
                  ...c.budgetsByPeriod,
                  [periodId]: money(p.openingAmount),
                },
              }
            : c,
        );
      }

      const newPending: PendingNote[] = result.pending.map((text) => ({
        id: uid('pend'),
        text,
        periodId,
        createdAt: t,
      }));

      const next: Persisted = {
        categories,
        pots: [...get().pots, ...newPots],
        expenses: [...get().expenses, ...newExpenses],
        pending: [...get().pending, ...newPending],
        periods,
        selectedPeriodId: periodId,
        periodMetas,
        incomeEntries: get().incomeEntries,
      };
      persist(next);
      set(next);
    },

    updateCategoryName: (id, name) => {
      const categories = get().categories.map((c) =>
        c.id === id ? { ...c, name: name.trim() || c.name } : c,
      );
      const next = { ...get(), categories };
      persist(next);
      set({ categories });
    },

    updateCategoryBudget: (id, budget, periodId, scope = 'this') => {
      const pid = periodId ?? get().selectedPeriodId;
      const amount = Math.max(0, money(budget));
      const cat = get().categories.find((c) => c.id === id);
      if (!cat) return;

      const targets = periodIdsFromInclusive(get().periods, pid, scope);
      let categories = get().categories;
      let pots = get().pots;
      const t = nowIso();

      for (const targetId of targets) {
        categories = categories.map((c) =>
          c.id === id
            ? { ...c, budgetsByPeriod: { ...c.budgetsByPeriod, [targetId]: amount } }
            : c,
        );
        const match = pots.find(
          (p) => p.periodId === targetId && p.name.toLowerCase() === cat.name.toLowerCase(),
        );
        if (match) {
          pots = pots.map((p) => (p.id === match.id ? { ...p, openingAmount: amount } : p));
        } else {
          pots = [
            ...pots,
            {
              id: uid('pot'),
              name: cat.name,
              openingAmount: amount,
              periodId: targetId,
              createdAt: t,
            },
          ];
        }
      }

      const next = { ...get(), categories, pots };
      persist(next);
      set({ categories, pots });
    },

    updatePotOpening: (potId, openingAmount, scope = 'this') => {
      const amount = Math.max(0, money(openingAmount));
      const pot = get().pots.find((p) => p.id === potId);
      if (!pot) return;

      const targets = periodIdsFromInclusive(get().periods, pot.periodId, scope);
      let categories = get().categories;
      let pots = get().pots;
      const t = nowIso();

      for (const targetId of targets) {
        const ensured = ensureCategory(categories, pot.name, targetId);
        categories = ensured.categories.map((c) =>
          c.id === ensured.id
            ? { ...c, budgetsByPeriod: { ...c.budgetsByPeriod, [targetId]: amount } }
            : c,
        );
        const match = pots.find(
          (p) => p.periodId === targetId && p.name.toLowerCase() === pot.name.toLowerCase(),
        );
        if (match) {
          pots = pots.map((p) => (p.id === match.id ? { ...p, openingAmount: amount } : p));
        } else {
          pots = [
            ...pots,
            {
              id: uid('pot'),
              name: pot.name,
              openingAmount: amount,
              periodId: targetId,
              createdAt: t,
            },
          ];
        }
      }

      const next = { ...get(), pots, categories };
      persist(next);
      set({ pots, categories });
    },

    addCategory: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return '';
      const existing = get().categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing.id;
      const pid = get().selectedPeriodId;
      const created: Category = { id: uid('cat'), name: trimmed, budgetsByPeriod: { [pid]: 0 } };
      const categories = [...get().categories, created];
      const next = { ...get(), categories };
      persist(next);
      set({ categories });
      get().ensurePeriodPots(pid);
      return created.id;
    },

    deleteCategory: (id) => {
      const cats = get().categories;
      if (cats.length <= 1) return;
      const target = cats.find((c) => c.id === id);
      if (!target) return;

      let categories = cats.filter((c) => c.id !== id);
      let other = categories.find((c) => c.name.toLowerCase() === 'other');
      if (!other) {
        other = { id: uid('cat'), name: 'Other', budgetsByPeriod: {} };
        categories = [...categories, other];
      }
      const fallbackId = target.name.toLowerCase() === 'other' ? categories[0]?.id : other.id;
      if (!fallbackId) return;

      const expenses = get().expenses.map((e) =>
        e.categoryId === id ? { ...e, categoryId: fallbackId } : e,
      );
      const next = { ...get(), categories, expenses };
      persist(next);
      set({ categories, expenses });
    },

    updateExpense: (id, patch) => {
      let pots = get().pots;
      const expenses = get().expenses.map((e) => {
        if (e.id !== id) return e;
        const amount = patch.amount !== undefined ? Math.max(0, money(patch.amount)) : e.amount;
        const categoryId = patch.categoryId ?? e.categoryId;
        let potId = e.potId;
        // Keep pot linkage in sync when category changes so pot remainders update
        if (patch.categoryId && patch.categoryId !== e.categoryId) {
          const cat = get().categories.find((c) => c.id === categoryId);
          if (cat) {
            const match = pots.find(
              (p) =>
                p.periodId === e.periodId && p.name.toLowerCase() === cat.name.toLowerCase(),
            );
            if (match) {
              potId = match.id;
            } else {
              const created: Pot = {
                id: uid('pot'),
                name: cat.name,
                openingAmount: getCategoryBudget(cat, e.periodId),
                periodId: e.periodId,
                createdAt: nowIso(),
              };
              pots = [...pots, created];
              potId = created.id;
            }
          }
        }
        return {
          ...e,
          ...patch,
          amount,
          categoryId,
          potId,
          label: patch.label !== undefined ? patch.label.trim() || e.label : e.label,
        };
      });
      const next = { ...get(), expenses, pots };
      persist(next);
      set({ expenses, pots });
    },

    deleteExpense: (id) => {
      const expenses = get().expenses.filter((e) => e.id !== id);
      const next = { ...get(), expenses };
      persist(next);
      set({ expenses });
    },

    addExpenseToPot: (params) => {
      const pot = get().pots.find((p) => p.id === params.potId);
      if (!pot) return false;
      const amount = Math.max(0, money(params.amount));
      if (!(amount > 0)) return false;

      let categories = get().categories;
      const catName = categoryFromPot(pot.name);
      const ensured = ensureCategory(categories, catName, pot.periodId);
      categories = ensured.categories;

      const period = get().periods.find((p) => p.id === pot.periodId);
      const t = nowIso();
      const expense: Expense = {
        id: uid('exp'),
        amount,
        label: (params.label ?? '').trim() || 'expense',
        categoryId: ensured.id,
        potId: pot.id,
        periodId: pot.periodId,
        date: expenseDateForPeriod(period, params.date),
        createdAt: t,
      };
      const next = { ...get(), categories, expenses: [...get().expenses, expense] };
      persist(next);
      set({ categories, expenses: next.expenses });
      return true;
    },

    addBulkExpensesToPot: (potId, text) => {
      const pot = get().pots.find((p) => p.id === potId);
      if (!pot) return { added: 0, errors: ['Pot not found.'] };

      const { expenses: parsed, errors } = parseExpenseBulkLines(text);
      if (parsed.length === 0) {
        return { added: 0, errors: errors.length ? errors : ['No valid expense lines.'] };
      }

      let categories = get().categories;
      const catName = categoryFromPot(pot.name);
      const ensured = ensureCategory(categories, catName, pot.periodId);
      categories = ensured.categories;

      const period = get().periods.find((p) => p.id === pot.periodId);
      const date = expenseDateForPeriod(period);
      const t = nowIso();
      const newExpenses: Expense[] = parsed.map((row) => ({
        id: uid('exp'),
        amount: row.amount,
        label: row.label,
        categoryId: ensured.id,
        potId: pot.id,
        periodId: pot.periodId,
        date,
        createdAt: t,
      }));

      const next = {
        ...get(),
        categories,
        expenses: [...get().expenses, ...newExpenses],
      };
      persist(next);
      set({ categories, expenses: next.expenses });
      return { added: newExpenses.length, errors };
    },

    deletePending: (id) => {
      const pending = get().pending.filter((p) => p.id !== id);
      const next = { ...get(), pending };
      persist(next);
      set({ pending });
    },

    setOverallBudget: (periodId, amount) => {
      const metas = [...get().periodMetas];
      const idx = metas.findIndex((m) => m.periodId === periodId);
      const meta = { ...getMeta(metas, periodId), overallBudget: Math.max(0, money(amount)) };
      if (idx >= 0) metas[idx] = meta;
      else metas.push(meta);
      const next = { ...get(), periodMetas: metas };
      persist(next);
      set({ periodMetas: metas });
    },

    setIncomeLump: (periodId, amount) => {
      const metas = [...get().periodMetas];
      const idx = metas.findIndex((m) => m.periodId === periodId);
      const meta = { ...getMeta(metas, periodId), incomeLump: Math.max(0, money(amount)) };
      if (idx >= 0) metas[idx] = meta;
      else metas.push(meta);
      const next = { ...get(), periodMetas: metas };
      persist(next);
      set({ periodMetas: metas });
    },

    addIncomeEntry: (entry) => {
      const row: IncomeEntry = {
        id: entry.id ?? uid('inc'),
        amount: Math.max(0, money(entry.amount)),
        label: entry.label.trim() || 'Income',
        date: entry.date,
        periodId: entry.periodId,
      };
      const incomeEntries = [...get().incomeEntries, row];
      const next = { ...get(), incomeEntries };
      persist(next);
      set({ incomeEntries });
    },

    deleteIncomeEntry: (id) => {
      const incomeEntries = get().incomeEntries.filter((e) => e.id !== id);
      const next = { ...get(), incomeEntries };
      persist(next);
      set({ incomeEntries });
    },

    clearTransactions: () => {
      const pid = get().selectedPeriodId;
      const next: Persisted = {
        ...get(),
        pots: get().pots.filter((p) => p.periodId !== pid),
        expenses: get().expenses.filter((e) => e.periodId !== pid),
        pending: get().pending.filter((p) => p.periodId !== pid),
        incomeEntries: get().incomeEntries.filter((e) => e.periodId !== pid),
        periodMetas: get().periodMetas.map((m) =>
          m.periodId === pid ? emptyMeta(pid) : m,
        ),
      };
      persist(next);
      set({
        pots: next.pots,
        expenses: next.expenses,
        pending: next.pending,
        incomeEntries: next.incomeEntries,
        periodMetas: next.periodMetas,
      });
    },

    clearAll: () => {
      const next = defaultState();
      persist(next);
      set(next);
    },

    syncPeriodAllocations: (periodId) => {
      const pid = periodId ?? get().selectedPeriodId;
      let categories = [...get().categories];
      let changed = false;

      // Pot openings are the allocations from income — mirror onto category budgets
      for (const pot of get().pots.filter((p) => p.periodId === pid)) {
        const ensured = ensureCategory(categories, pot.name, pid);
        if (ensured.categories.length !== categories.length) changed = true;
        categories = ensured.categories;
        const cat = categories.find((c) => c.id === ensured.id)!;
        const nextAmount = money(pot.openingAmount);
        if (getCategoryBudget(cat, pid) !== nextAmount) {
          changed = true;
          categories = categories.map((c) =>
            c.id === ensured.id
              ? { ...c, budgetsByPeriod: { ...c.budgetsByPeriod, [pid]: nextAmount } }
              : c,
          );
        }
      }

      if (!changed) return;
      const next = { ...get(), categories };
      persist(next);
      set({ categories });
    },

    ensurePeriodPots: (periodId) => {
      const pid = periodId ?? get().selectedPeriodId;
      const toAdd = potsToCreateForPeriod(
        get().categories,
        get().pots,
        pid,
        get().periods,
      );
      if (toAdd.length === 0) return;
      const t = nowIso();
      const pots = [
        ...get().pots,
        ...toAdd.map((row) => ({
          id: uid('pot'),
          name: row.name,
          openingAmount: row.openingAmount,
          periodId: row.periodId,
          createdAt: t,
        })),
      ];
      // Set budgetsByPeriod for new pots only when this period has no dedication yet
      let categories = get().categories;
      for (const row of toAdd) {
        const ensured = ensureCategory(categories, row.name, pid);
        categories = ensured.categories.map((c) => {
          if (c.id !== ensured.id) return c;
          if (pid in c.budgetsByPeriod) return c;
          return {
            ...c,
            budgetsByPeriod: { ...c.budgetsByPeriod, [pid]: row.openingAmount },
          };
        });
      }
      const next = { ...get(), pots, categories };
      persist(next);
      set({ pots, categories });
    },
  };
});

/** Period ids from `periodId` through the end of the sorted list (or just that id). */
export function periodIdsFromInclusive(
  periods: PayPeriod[],
  periodId: string,
  scope: 'this' | 'following',
): string[] {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const idx = sorted.findIndex((p) => p.id === periodId);
  if (idx < 0) return [periodId];
  if (scope === 'this') return [periodId];
  return sorted.slice(idx).map((p) => p.id);
}

export function previousPeriodId(periods: PayPeriod[], periodId: string): string | undefined {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const idx = sorted.findIndex((p) => p.id === periodId);
  if (idx <= 0) return undefined;
  return sorted[idx - 1]?.id;
}

/**
 * Opening for a new pot in `periodId`: explicit dedication for this period if set,
 * otherwise previous period’s pot opening, else previous dedication, else 0.
 */
export function openingForNewPeriodPot(
  name: string,
  periodId: string,
  categories: Category[],
  pots: Pot[],
  periods: PayPeriod[],
): number {
  const cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (cat && periodId in cat.budgetsByPeriod) {
    return getCategoryBudget(cat, periodId);
  }
  const prevId = previousPeriodId(periods, periodId);
  if (!prevId) return 0;
  const prevPot = pots.find(
    (p) => p.periodId === prevId && p.name.toLowerCase() === name.toLowerCase(),
  );
  if (prevPot) return money(prevPot.openingAmount);
  if (cat) return getCategoryBudget(cat, prevId);
  return 0;
}

/**
 * Pots that need to be created so every category has a row for this period.
 * Openings carry forward from the previous period when this period has no dedication yet.
 */
export function potsToCreateForPeriod(
  categories: Category[],
  pots: Pot[],
  periodId: string,
  periods: PayPeriod[] = [],
): { name: string; openingAmount: number; periodId: string }[] {
  const covered = new Set(
    pots.filter((p) => p.periodId === periodId).map((p) => p.name.toLowerCase()),
  );
  return categories
    .filter((c) => !covered.has(c.name.toLowerCase()))
    .map((c) => ({
      name: c.name,
      openingAmount: openingForNewPeriodPot(c.name, periodId, categories, pots, periods),
      periodId,
    }));
}

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function potSpent(potId: string, expenses: Expense[]): number {
  return money(expenses.filter((e) => e.potId === potId).reduce((s, e) => s + e.amount, 0));
}

export function categorySpent(categoryId: string, expenses: Expense[]): number {
  return money(expenses.filter((e) => e.categoryId === categoryId).reduce((s, e) => s + e.amount, 0));
}

export function getCategoryBudget(cat: Category, periodId: string): number {
  return cat.budgetsByPeriod[periodId] ?? 0;
}

/**
 * Money locked into pots for a period.
 * Every pot opening subtracts from income whether spent or not (e.g. $2k Savings).
 */
export function getTotalDedicated(
  _categories: Category[],
  pots: Pot[],
  periodId: string,
): number {
  return money(
    pots.filter((p) => p.periodId === periodId).reduce((s, p) => s + p.openingAmount, 0),
  );
}

export function getPeriodIncome(
  periodId: string,
  metas: PeriodMeta[],
  entries: IncomeEntry[],
): number {
  const lump = getMeta(metas, periodId).incomeLump;
  const lines = entries.filter((e) => e.periodId === periodId).reduce((s, e) => s + e.amount, 0);
  return money(lump + lines);
}

export function getPeriodMeta(metas: PeriodMeta[], periodId: string): PeriodMeta {
  return getMeta(metas, periodId);
}
