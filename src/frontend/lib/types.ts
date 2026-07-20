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
  /** Optional link to a schedule event (plaintext metadata). */
  eventId?: string;
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
  exceptDates?: string[];
  until?: string | null;
  notify: boolean;
  lead: string;
  email: string;
  comments: EventComment[];
  /** Optional link to a ledger expense created from this event. */
  expenseId?: string;
  /** Encrypted envelope hold (amounts stay in E2EE payload). */
  budgetHoldEnabled?: boolean;
  budgetHoldAmount?: number;
  budgetHoldCategoryId?: string;
  /** Occurrence dates where a hold was released after payment. */
  budgetHoldReleasedDates?: string[];
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
  | "calculator"
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
  type?: "expense" | "income" | "savings";
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

/** On-device passphrase vault blob (no plaintext keys). */
export type IdentityVault = {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
};

/** In-memory / migration-only secrets — never persist to localStorage. */
export type LegacyIdentitySecrets = {
  mnemonic: string;
  privateKey: string;
};

export type IdentityRecord = {
  address: string;
  codename?: string;
  /** Encrypted mnemonic + privateKey (in-app wallets). */
  vault?: IdentityVault;
  /**
   * @deprecated ACTIVE MIGRATION — read-only until vaulted; never write to localStorage.
   * Prefer sessionSecrets + vault.
   */
  mnemonic?: string;
  /**
   * @deprecated ACTIVE MIGRATION — read-only until vaulted; never write to localStorage.
   */
  privateKey?: string;
  injected?: boolean;
  lastSeen?: number;
};
