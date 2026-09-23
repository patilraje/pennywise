export type Card = {
  id: string;
  name: string;
  kind: 'credit' | 'debit';
  /** Credit limit; 0 for debit cards. */
  creditLimit: number;
  createdAt: string;
};

export type PayPeriod = {
  id: string;
  start: string;
  end: string;
};

export type PeriodMeta = {
  periodId: string;
  /** Dedicated overall budget for the 4-week chunk. */
  overallBudget: number;
  /** Base / lump income for the period (added to income line items). */
  incomeLump: number;
};

export type IncomeEntry = {
  id: string;
  amount: number;
  label: string;
  date: string;
  periodId: string;
};

export type Category = {
  id: string;
  name: string;
  /** Per-period category budgets. */
  budgetsByPeriod: Record<string, number>;
};

export type Pot = {
  id: string;
  name: string;
  openingAmount: number;
  periodId: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  amount: number;
  label: string;
  categoryId: string;
  potId: string;
  periodId: string;
  date: string;
  createdAt: string;
  /** Optional card used for this expense. */
  cardId?: string;
};

export type PendingNote = {
  id: string;
  text: string;
  periodId: string;
  createdAt: string;
};

export type ProposedPot = {
  tempId: string;
  name: string;
  openingAmount: number;
};

export type ProposedExpense = {
  tempId: string;
  amount: number;
  label: string;
  categoryName: string;
  potTempId: string;
};

export type HisaabParseResult = {
  pots: ProposedPot[];
  expenses: ProposedExpense[];
  pending: string[];
  warnings: string[];
  summary: string;
  /** ISO start date if paste included a date-range header. */
  periodStart?: string;
  periodEnd?: string;
};
