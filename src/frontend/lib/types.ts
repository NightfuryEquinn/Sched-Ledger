import type { RecurringInterval } from "@/lib/recurring";

export type { RecurringInterval };

export type Expense = {
  id: string;
  walletId: string;
  kind: "expense" | "income";
  date: string;
  sub: string;
  amount: number;
  note: string;
  recurring: RecurringInterval | false;
};

export type FinancialWallet = {
  id: string;
  name: string;
  currency: string;
  fundingMode: "monthly" | "starting";
  income: number;
  startingBalance: number;
  budgets: Budgets;
  isDefault: boolean;
};

export type EventComment = {
  id: string;
  text: string;
  at: string;
};

export type LedgerEvent = {
  id: string;
  title: string;
  catId: string;
  customLabel?: string;
  customGlyph?: string;
  date: string;
  allDay: boolean;
  time: string | null;
  repeat: string;
  notify: boolean;
  lead: string;
  email: string;
  comments: EventComment[];
};

export type Budgets = Record<string, number>;

export type Account = {
  address: string;
  codename: string;
  injected?: boolean;
};

export type ViewId =
  | "overview"
  | "transactions"
  | "budgets"
  | "categories"
  | "schedule"
  | "insights"
  | "recurring"
  | "todos"
  | "transparency";

export type MonthEntry = {
  key: string;
  year: number;
  m: number;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  glyph: string;
  type?: "expense" | "income";
  builtin?: boolean;
  subs: { id: string; name: string }[];
};

export type CategoryIndex = import("./categories").CategoryIndex;

export type TodoTask = {
  id: string;
  title: string;
  done: boolean;
};

export type TodoList = {
  id: string;
  name: string;
  icon: string;
  tasks: TodoTask[];
};

export type IdentityRecord = {
  address: string;
  codename?: string;
  mnemonic?: string;
  privateKey?: string;
  injected?: boolean;
  lastSeen?: number;
};
