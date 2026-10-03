import { create } from 'zustand';
import type {
  Card,
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
import { matchCardInLabel, matchPotName, parseExpenseBulkLines } from './utils/expenseLines';
import {
  DEFAULT_ANCHOR,
  buildPeriodsFromAnchor,
  ensurePeriodForDate,
  makePeriod,
  periodForRange,
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
  cards: Card[];
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
    cards: [],
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
        cards: Array.isArray(parsed.cards) ? parsed.cards : [],
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
      cards: state.cards,
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
  confirmParse: (
    result: HisaabParseResult,
    decisions?: Record<string, DuplicateDecision>,
  ) => ParseMergeStats;
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
  deletePot: (potId: string, scope?: 'this' | 'following') => void;
  addCategory: (name: string) => string;
  deleteCategory: (id: string) => void;
  updateExpense: (
    id: string,
    patch: Partial<Pick<Expense, 'amount' | 'label' | 'categoryId' | 'date' | 'potId' | 'cardId'>>,
  ) => void;
  deleteExpense: (id: string) => void;
  addExpenseToPot: (params: {
    potId: string;
    amount: number;
    label?: string;
    date?: string;
    cardId?: string;
  }) => boolean;
  addBulkExpensesToPot: (
    potId: string,
    text: string,
  ) => { added: number; errors: string[] };
  addCard: (input: { name: string; kind: 'credit' | 'debit'; creditLimit?: number }) => string;
  updateCard: (
    id: string,
    patch: Partial<Pick<Card, 'name' | 'kind' | 'creditLimit'>>,
  ) => void;
  deleteCard: (id: string) => void;
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

    confirmParse: (result, decisions = {}) => {
      let periods = get().periods;
      let periodId = get().selectedPeriodId;

      if (result.periodStart) {
        const picked = periodForRange(periods, result.periodStart, result.periodEnd);
        periods = picked.periods;
        periodId = picked.period.id;
      }

      const period = periods.find((p) => p.id === periodId) ?? periods[0];
      periodId = period.id;
      const date =
        todayIso() >= period.start && todayIso() <= period.end ? todayIso() : period.start;

      let periodMetas = get().periodMetas;
      if (!periodMetas.some((m) => m.periodId === periodId)) {
        periodMetas = [...periodMetas, emptyMeta(periodId)];
      }
      {
        const staged = { ...get(), periods, periodMetas, selectedPeriodId: periodId };
        persist(staged);
        set({ periods, periodMetas, selectedPeriodId: periodId });
      }
      get().ensurePeriodPots(periodId);

      const merged = mergeParseIntoPeriod(result, {
        categories: get().categories,
        pots: get().pots,
        expenses: get().expenses,
        pending: get().pending,
        cards: get().cards,
        periods,
        periodId,
        date,
      }, decisions);

      const next: Persisted = {
        ...get(),
        categories: merged.categories,
        pots: merged.pots,
        expenses: merged.expenses,
        pending: merged.pending,
        periods,
        selectedPeriodId: periodId,
        periodMetas,
      };
      persist(next);
      set(next);
      return merged.stats;
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
        if (targetId !== pid && !isCategoryActiveInPeriod(cat, targetId, get().periods)) continue;
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
        const existingCat = categories.find(
          (c) => c.name.toLowerCase() === pot.name.toLowerCase(),
        );
        if (
          targetId !== pot.periodId &&
          existingCat &&
          !isCategoryActiveInPeriod(existingCat, targetId, get().periods)
        ) {
          continue;
        }
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

    deletePot: (potId, scope = 'this') => {
      const pot = get().pots.find((p) => p.id === potId);
      if (!pot) return;
      const periods = get().periods;
      const nameKey = pot.name.toLowerCase();
      const targets = new Set(periodIdsFromInclusive(periods, pot.periodId, scope));

      const removedPotIds = new Set(
        get()
          .pots.filter((p) => targets.has(p.periodId) && p.name.toLowerCase() === nameKey)
          .map((p) => p.id),
      );
      removedPotIds.add(pot.id);
      const pots = get().pots.filter((p) => !removedPotIds.has(p.id));
      const expenses = get().expenses.filter((e) => !removedPotIds.has(e.potId));

      const fromStart = periodStartOf(pot.periodId, periods);
      const categories = get().categories.map((c) => {
        if (c.name.toLowerCase() !== nameKey) return c;
        const budgetsByPeriod = { ...c.budgetsByPeriod };
        for (const pid of targets) budgetsByPeriod[pid] = 0;
        if (scope === 'following' && fromStart) {
          return { ...c, budgetsByPeriod, removedFromPeriod: fromStart };
        }
        const removedPeriods = [...new Set([...(c.removedPeriods ?? []), pot.periodId])];
        return { ...c, budgetsByPeriod, removedPeriods };
      });

      const next = { ...get(), pots, expenses, categories };
      persist(next);
      set({ pots, expenses, categories });
    },

    addCategory: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return '';
      const existing = get().categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        const pid = get().selectedPeriodId;
        if (!isCategoryActiveInPeriod(existing, pid, get().periods)) {
          const categories = get().categories.map((c) =>
            c.id === existing.id ? reviveCategoryInPeriod(c, pid, get().periods) : c,
          );
          const next = { ...get(), categories };
          persist(next);
          set({ categories });
          get().ensurePeriodPots(pid);
        }
        return existing.id;
      }
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
          cardId:
            patch.cardId !== undefined
              ? patch.cardId || undefined
              : patch.label !== undefined
                ? matchCardInLabel(patch.label.trim() || e.label, get().cards) ?? e.cardId
                : e.cardId,
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
      const label = (params.label ?? '').trim() || 'expense';
      const cardId =
        params.cardId !== undefined
          ? params.cardId || undefined
          : matchCardInLabel(label, get().cards);
      const expense: Expense = {
        id: uid('exp'),
        amount,
        label,
        categoryId: ensured.id,
        potId: pot.id,
        periodId: pot.periodId,
        date: expenseDateForPeriod(period, params.date),
        createdAt: t,
        ...(cardId ? { cardId } : {}),
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
      const cards = get().cards;
      const newExpenses: Expense[] = parsed.map((row) => {
        const cardId = matchCardInLabel(row.label, cards);
        return {
          id: uid('exp'),
          amount: row.amount,
          label: row.label,
          categoryId: ensured.id,
          potId: pot.id,
          periodId: pot.periodId,
          date,
          createdAt: t,
          ...(cardId ? { cardId } : {}),
        };
      });

      const next = {
        ...get(),
        categories,
        expenses: [...get().expenses, ...newExpenses],
      };
      persist(next);
      set({ categories, expenses: next.expenses });
      return { added: newExpenses.length, errors };
    },

    addCard: (input) => {
      const name = input.name.trim();
      if (!name) return '';
      const existing = get().cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;
      const kind = input.kind === 'debit' ? 'debit' : 'credit';
      const created: Card = {
        id: uid('card'),
        name,
        kind,
        creditLimit: kind === 'credit' ? Math.max(0, money(input.creditLimit ?? 0)) : 0,
        createdAt: nowIso(),
      };
      const cards = [...get().cards, created];
      const next = { ...get(), cards };
      persist(next);
      set({ cards });
      return created.id;
    },

    updateCard: (id, patch) => {
      const cards = get().cards.map((c) => {
        if (c.id !== id) return c;
        const kind = patch.kind ?? c.kind;
        const name = patch.name !== undefined ? patch.name.trim() || c.name : c.name;
        const creditLimit =
          kind === 'debit'
            ? 0
            : patch.creditLimit !== undefined
              ? Math.max(0, money(patch.creditLimit))
              : c.creditLimit;
        return { ...c, name, kind, creditLimit };
      });
      const next = { ...get(), cards };
      persist(next);
      set({ cards });
    },

    deleteCard: (id) => {
      const cards = get().cards.filter((c) => c.id !== id);
      const expenses = get().expenses.map((e) =>
        e.cardId === id ? { ...e, cardId: undefined } : e,
      );
      const next = { ...get(), cards, expenses };
      persist(next);
      set({ cards, expenses });
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

export type ParseMergeStats = {
  potsUpdated: number;
  potsCreated: number;
  expensesAdded: number;
  expensesSkipped: number;
  keptBoth: number;
  replaced: number;
  pendingAdded: number;
};

/** What to do with a pasted line that matches an already-saved expense. */
export type DuplicateDecision = { keepSaved: boolean; addPasted: boolean };

export type ParseDuplicate = { expenseTempId: string; existing: Expense };

function expenseKey(potId: string, amount: number, label: string): string {
  return `${potId}|${money(amount)}|${label.trim().toLowerCase()}`;
}

/** Parsed pot tempId → existing pot in the period with a matching name. */
export function resolveParsedPots(
  result: HisaabParseResult,
  pots: Pot[],
  periodId: string,
): Map<string, Pot> {
  const periodPots = pots.filter((p) => p.periodId === periodId);
  const names = periodPots.map((p) => p.name);
  const out = new Map<string, Pot>();
  for (const p of result.pots) {
    const matched = matchPotName(p.name, names);
    if (!matched) continue;
    const pot = periodPots.find((x) => x.name.toLowerCase() === matched.toLowerCase());
    if (pot) out.set(p.tempId, pot);
  }
  return out;
}

/**
 * Pasted expenses that match an already-saved expense in the same pot (amount + label),
 * paired one-to-one: two saved "-10 kfc" and three pasted give two pairs.
 */
export function findParseDuplicates(
  result: HisaabParseResult,
  ctx: { pots: Pot[]; expenses: Expense[]; periodId: string },
): ParseDuplicate[] {
  const potMap = resolveParsedPots(result, ctx.pots, ctx.periodId);
  if (potMap.size === 0) return [];
  const saved = new Map<string, Expense[]>();
  for (const e of ctx.expenses) {
    if (e.periodId !== ctx.periodId) continue;
    const key = expenseKey(e.potId, e.amount, e.label);
    saved.set(key, [...(saved.get(key) ?? []), e]);
  }
  const out: ParseDuplicate[] = [];
  for (const e of result.expenses) {
    const pot = potMap.get(e.potTempId);
    if (!pot) continue;
    const queue = saved.get(expenseKey(pot.id, e.amount, e.label));
    const existing = queue?.shift();
    if (existing) out.push({ expenseTempId: e.tempId, existing });
  }
  return out;
}

/**
 * Merge a parsed Hisaab paste into one period: reuse that period's pots by name and
 * set their openings/dedications. Pasted lines matching a saved expense follow
 * `decisions`; without a decision they are skipped, so re-pasting adds nothing.
 */
export function mergeParseIntoPeriod(
  result: HisaabParseResult,
  ctx: {
    categories: Category[];
    pots: Pot[];
    expenses: Expense[];
    pending: PendingNote[];
    cards: Card[];
    periods: PayPeriod[];
    periodId: string;
    date: string;
  },
  decisions: Record<string, DuplicateDecision> = {},
): {
  categories: Category[];
  pots: Pot[];
  expenses: Expense[];
  pending: PendingNote[];
  stats: ParseMergeStats;
} {
  const { periodId, periods, date, cards } = ctx;
  let categories = [...ctx.categories];
  let pots = [...ctx.pots];
  const t = nowIso();
  const stats: ParseMergeStats = {
    potsUpdated: 0,
    potsCreated: 0,
    expensesAdded: 0,
    expensesSkipped: 0,
    keptBoth: 0,
    replaced: 0,
    pendingAdded: 0,
  };

  const existingPots = resolveParsedPots(result, ctx.pots, periodId);
  const duplicates = new Map(
    findParseDuplicates(result, { pots: ctx.pots, expenses: ctx.expenses, periodId }).map((d) => [
      d.expenseTempId,
      d.existing,
    ]),
  );

  const potIdMap = new Map<string, { id: string; name: string }>();
  for (const p of result.pots) {
    const opening = money(p.openingAmount);
    const existing = existingPots.get(p.tempId);
    let potName: string;
    if (existing) {
      pots = pots.map((x) => (x.id === existing.id ? { ...x, openingAmount: opening } : x));
      potIdMap.set(p.tempId, { id: existing.id, name: existing.name });
      potName = existing.name;
      stats.potsUpdated += 1;
    } else {
      // Category may exist but its pot was removed for this period — bring it back
      const catName = matchPotName(p.name, categories.map((c) => c.name)) ?? p.name;
      categories = categories.map((c) =>
        c.name.toLowerCase() === catName.toLowerCase()
          ? reviveCategoryInPeriod(c, periodId, periods)
          : c,
      );
      const id = uid('pot');
      pots = [...pots, { id, name: catName, openingAmount: opening, periodId, createdAt: t }];
      potIdMap.set(p.tempId, { id, name: catName });
      potName = catName;
      stats.potsCreated += 1;
    }
    const ensured = ensureCategory(categories, potName, periodId);
    categories = ensured.categories.map((c) =>
      c.id === ensured.id
        ? { ...c, budgetsByPeriod: { ...c.budgetsByPeriod, [periodId]: opening } }
        : c,
    );
  }

  const newExpenses: Expense[] = [];
  const removedIds = new Set<string>();
  for (const e of result.expenses) {
    const pot = potIdMap.get(e.potTempId);
    if (!pot) continue;
    const saved = duplicates.get(e.tempId);
    if (saved) {
      const decision = decisions[e.tempId] ?? { keepSaved: true, addPasted: false };
      if (!decision.addPasted) {
        stats.expensesSkipped += 1;
        continue;
      }
      if (decision.keepSaved) {
        stats.keptBoth += 1;
      } else {
        removedIds.add(saved.id);
        stats.replaced += 1;
      }
    }
    const ensured = ensureCategory(categories, categoryFromPot(pot.name), periodId);
    categories = ensured.categories;
    const cardId = matchCardInLabel(e.label, cards);
    newExpenses.push({
      id: uid('exp'),
      amount: money(e.amount),
      label: e.label,
      categoryId: ensured.id,
      potId: pot.id,
      periodId,
      date,
      createdAt: t,
      ...(cardId ? { cardId } : {}),
    });
  }
  stats.expensesAdded = newExpenses.length - stats.keptBoth - stats.replaced;

  const existingNotes = new Set(
    ctx.pending
      .filter((n) => n.periodId === periodId)
      .map((n) => n.text.trim().toLowerCase()),
  );
  const newPending: PendingNote[] = [];
  for (const text of result.pending) {
    const key = text.trim().toLowerCase();
    if (existingNotes.has(key)) continue;
    existingNotes.add(key);
    newPending.push({ id: uid('pend'), text, periodId, createdAt: t });
  }
  stats.pendingAdded = newPending.length;

  return {
    categories,
    pots,
    expenses: [...ctx.expenses.filter((e) => !removedIds.has(e.id)), ...newExpenses],
    pending: [...ctx.pending, ...newPending],
    stats,
  };
}

export function periodStartOf(periodId: string, periods: PayPeriod[]): string | undefined {
  const found = periods.find((p) => p.id === periodId);
  if (found) return found.start;
  return periodId.match(/^pp-(\d{4}-\d{2}-\d{2})_/)?.[1];
}

/** False when the category's pot was removed for this period (or from an earlier period on). */
export function isCategoryActiveInPeriod(
  cat: Category,
  periodId: string,
  periods: PayPeriod[] = [],
): boolean {
  if (cat.removedPeriods?.includes(periodId)) return false;
  if (cat.removedFromPeriod) {
    const start = periodStartOf(periodId, periods);
    if (start && start >= cat.removedFromPeriod) return false;
  }
  return true;
}

/** Re-enable a category for one period, keeping other removals in place. */
export function reviveCategoryInPeriod(
  cat: Category,
  periodId: string,
  periods: PayPeriod[],
): Category {
  let removedPeriods = (cat.removedPeriods ?? []).filter((id) => id !== periodId);
  let removedFromPeriod = cat.removedFromPeriod;
  const start = periodStartOf(periodId, periods);
  if (removedFromPeriod && start && start >= removedFromPeriod) {
    const gap = periods
      .filter((p) => p.start >= removedFromPeriod! && p.start < start)
      .map((p) => p.id);
    removedPeriods = [...new Set([...removedPeriods, ...gap])];
    removedFromPeriod = undefined;
  }
  const next: Category = { ...cat, removedPeriods };
  if (removedFromPeriod) next.removedFromPeriod = removedFromPeriod;
  else delete next.removedFromPeriod;
  if (next.removedPeriods?.length === 0) delete next.removedPeriods;
  return next;
}

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
    .filter((c) => isCategoryActiveInPeriod(c, periodId, periods))
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

export function cardSpent(cardId: string, expenses: Expense[]): number {
  return money(expenses.filter((e) => e.cardId === cardId).reduce((s, e) => s + e.amount, 0));
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
