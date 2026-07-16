import type { CategoryTaxonomy } from "@/schemas/category";
import type { Consent } from "@/schemas/consent";
import type { Event } from "@/schemas/event";
import type { Expense } from "@/schemas/expense";
import type { LedgerProfile } from "@/schemas/profile";
import type { TodoList } from "@/schemas/todo";
import type { User } from "@/schemas/user";
import type { FinancialWallet } from "@/schemas/wallet";
import type { Collection, Db, ObjectId } from "mongodb";

export const COLLECTIONS = {
  users: "users",
  ledgerProfiles: "ledger_profiles",
  financialWallets: "financial_wallets",
  categoryTaxonomies: "category_taxonomies",
  expenses: "expenses",
  events: "events",
  consent: "consent",
  authNonces: "auth_nonces",
  sessions: "sessions",
  reminderLogs: "reminder_logs",
  budgetAlertLogs: "budget_alert_logs",
  todoLists: "todo_lists",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export type UserDocument = Omit<User, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type LedgerProfileDocument = Omit<LedgerProfile, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type FinancialWalletDocument = Omit<FinancialWallet, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryTaxonomyDocument = Omit<CategoryTaxonomy, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseDocument = Omit<Expense, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type EventDocument = Omit<Event, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type ConsentDocument = Omit<Consent, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthNonceDocument = {
  _id: ObjectId;
  address: string;
  nonce: string;
  message: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
};

export type SessionDocument = {
  _id: ObjectId;
  address: string;
  tokenHash: string;
  userAgent: string;
  ip: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
};

export type ReminderLogDocument = {
  _id: ObjectId;
  eventId: ObjectId;
  occurrenceIso: string;
  lead: string;
  email: string;
  /** Channels that succeeded for this occurrence. */
  channels?: Array<"email">;
  sentAt: Date;
};

/** Dedupes budget-near-limit delivery (one per user/wallet/category/month/level). */
export type BudgetAlertLogDocument = {
  _id: ObjectId;
  userAddress: string;
  walletId: string;
  categoryId: string;
  month: string;
  level: "warning" | "exceeded";
  email: string;
  channels?: Array<"email">;
  sentAt: Date;
};

export type TodoListDocument = Omit<TodoList, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type Collections = {
  users: Collection<UserDocument>;
  ledgerProfiles: Collection<LedgerProfileDocument>;
  financialWallets: Collection<FinancialWalletDocument>;
  categoryTaxonomies: Collection<CategoryTaxonomyDocument>;
  expenses: Collection<ExpenseDocument>;
  events: Collection<EventDocument>;
  consent: Collection<ConsentDocument>;
  authNonces: Collection<AuthNonceDocument>;
  sessions: Collection<SessionDocument>;
  reminderLogs: Collection<ReminderLogDocument>;
  budgetAlertLogs: Collection<BudgetAlertLogDocument>;
  todoLists: Collection<TodoListDocument>;
};

export function getCollections(db: Db): Collections {
  return {
    users: db.collection<UserDocument>(COLLECTIONS.users),
    ledgerProfiles: db.collection<LedgerProfileDocument>(COLLECTIONS.ledgerProfiles),
    financialWallets: db.collection<FinancialWalletDocument>(COLLECTIONS.financialWallets),
    categoryTaxonomies: db.collection<CategoryTaxonomyDocument>(COLLECTIONS.categoryTaxonomies),
    expenses: db.collection<ExpenseDocument>(COLLECTIONS.expenses),
    events: db.collection<EventDocument>(COLLECTIONS.events),
    consent: db.collection<ConsentDocument>(COLLECTIONS.consent),
    authNonces: db.collection<AuthNonceDocument>(COLLECTIONS.authNonces),
    sessions: db.collection<SessionDocument>(COLLECTIONS.sessions),
    reminderLogs: db.collection<ReminderLogDocument>(COLLECTIONS.reminderLogs),
    budgetAlertLogs: db.collection<BudgetAlertLogDocument>(COLLECTIONS.budgetAlertLogs),
    todoLists: db.collection<TodoListDocument>(COLLECTIONS.todoLists),
  };
}
