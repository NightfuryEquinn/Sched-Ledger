import type { Collection, Db, ObjectId } from "mongodb";
import type { Consent } from "@/schemas/consent";
import type { Expense } from "@/schemas/expense";
import type { Event } from "@/schemas/event";
import type { LedgerProfile } from "@/schemas/profile";
import type { User } from "@/schemas/user";

export const COLLECTIONS = {
  users: "users",
  ledgerProfiles: "ledger_profiles",
  expenses: "expenses",
  events: "events",
  consent: "consent",
  authNonces: "auth_nonces",
  sessions: "sessions",
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

export type Collections = {
  users: Collection<UserDocument>;
  ledgerProfiles: Collection<LedgerProfileDocument>;
  expenses: Collection<ExpenseDocument>;
  events: Collection<EventDocument>;
  consent: Collection<ConsentDocument>;
  authNonces: Collection<AuthNonceDocument>;
  sessions: Collection<SessionDocument>;
};

export function getCollections(db: Db): Collections {
  return {
    users: db.collection<UserDocument>(COLLECTIONS.users),
    ledgerProfiles: db.collection<LedgerProfileDocument>(COLLECTIONS.ledgerProfiles),
    expenses: db.collection<ExpenseDocument>(COLLECTIONS.expenses),
    events: db.collection<EventDocument>(COLLECTIONS.events),
    consent: db.collection<ConsentDocument>(COLLECTIONS.consent),
    authNonces: db.collection<AuthNonceDocument>(COLLECTIONS.authNonces),
    sessions: db.collection<SessionDocument>(COLLECTIONS.sessions),
  };
}
