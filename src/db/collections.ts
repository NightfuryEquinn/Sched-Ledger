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
  pushSubscriptions: "push_subscriptions",
  todoLists: "todo_lists",
  capitalPlans: "capital_plans",
  rateLimits: "rate_limits",
} as const;

/** Shared rate-limit bucket document (keyed by limit prefix + client key). */
export type RateLimitDocument = {
  _id: string;
  count: number;
  /** Window end — Date so the TTL index can expire stale buckets. */
  resetAt: Date;
};

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

/**
 * Mongo storage shape for expenses.
 * Linked ids are ObjectIds in the DB (serialized to hex strings on read).
 * `recurring: true` is a legacy value still present in older rows.
 */
export type ExpenseDocument = Omit<
  Expense,
  "createdAt" | "updatedAt" | "walletId" | "eventId" | "recurring" | "skipped"
> & {
  _id: ObjectId;
  walletId?: ObjectId | string;
  eventId?: ObjectId | string;
  recurring: Expense["recurring"] | true;
  skipped?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Mongo storage shape for events (`expenseId` stored as ObjectId). */
export type EventDocument = Omit<Event, "createdAt" | "updatedAt" | "expenseId"> & {
  _id: ObjectId;
  expenseId?: ObjectId | string;
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
  /** Opaque users._id hex — primary ownership key after cutover. */
  accountId?: string;
  /** Legacy SIWE address; kept for old sessions until backfill. */
  address?: string;
  tokenHash: string;
  userAgent: string;
  ip: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
};

/** Delivery channels a reminder can go out on. */
export type ReminderChannel = "email" | "push";

/**
 * A browser push endpoint registered by one device. Presence of a row is the
 * account's push opt-in; disabling notifications deletes it.
 */
export type PushSubscriptionDocument = {
  _id: ObjectId;
  accountId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: Date;
  lastSeenAt: Date;
};

export type ReminderLogDocument = {
  _id: ObjectId;
  eventId: ObjectId;
  occurrenceIso: string;
  lead: string;
  email: string;
  /** Channels that succeeded for this occurrence (absent on pre-push rows). */
  channels?: ReminderChannel[];
  sentAt: Date;
};

/** Dedupes budget-near-limit delivery (one per user/wallet/category/month/level). */
export type BudgetAlertLogDocument = {
  _id: ObjectId;
  accountId: string;
  /** Legacy ownership key; unset after backfill. */
  userAddress?: string;
  walletId: string;
  categoryId: string;
  month: string;
  level: "warning" | "exceeded";
  email: string;
  channels?: ReminderChannel[];
  sentAt: Date;
};

export type TodoListDocument = Omit<TodoList, "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CapitalPlanDocument = {
  _id: ObjectId;
  accountId: string;
  enc: 1;
  payload: string;
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
  pushSubscriptions: Collection<PushSubscriptionDocument>;
  todoLists: Collection<TodoListDocument>;
  capitalPlans: Collection<CapitalPlanDocument>;
};

/** Get typed collection handles for the connected database. */
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
    pushSubscriptions: db.collection<PushSubscriptionDocument>(COLLECTIONS.pushSubscriptions),
    todoLists: db.collection<TodoListDocument>(COLLECTIONS.todoLists),
    capitalPlans: db.collection<CapitalPlanDocument>(COLLECTIONS.capitalPlans),
  };
}
