import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

/** Ensure Mongo indexes for the current schema (accountId ownership). */
export async function ensureIndexes(db: Db): Promise<void> {
  /* Name uniqueness moved client-side once todo lists are E2EE. */
  try {
    await db.collection(COLLECTIONS.todoLists).dropIndex("userAddress_1_name_1");
  } catch {
    /* Index may already be absent. */
  }

  /* Wallet names moved into E2EE payload; drop plaintext name index. */
  try {
    await db.collection(COLLECTIONS.financialWallets).dropIndex("userAddress_1_name_1");
  } catch {
    /* Index may already be absent. */
  }

  /* Legacy address-keyed indexes — drop after accountId backfill. */
  const legacyDrops: Array<[string, string]> = [
    [COLLECTIONS.ledgerProfiles, "userAddress_1"],
    [COLLECTIONS.financialWallets, "userAddress_1_isDefault_1"],
    [COLLECTIONS.categoryTaxonomies, "userAddress_1"],
    [COLLECTIONS.expenses, "userAddress_1_walletId_1_date_-1"],
    [COLLECTIONS.expenses, "userAddress_1_date_-1"],
    [COLLECTIONS.expenses, "userAddress_1_recurring_1_date_-1"],
    [COLLECTIONS.events, "userAddress_1_date_1"],
    [COLLECTIONS.consent, "userAddress_1"],
    [COLLECTIONS.sessions, "address_1_createdAt_-1"],
    [COLLECTIONS.todoLists, "userAddress_1_createdAt_1"],
    [COLLECTIONS.budgetAlertLogs, "userAddress_1_walletId_1_categoryId_1_month_1_level_1"],
  ];

  for (const [coll, index] of legacyDrops) {
    try {
      await db.collection(coll).dropIndex(index);
    } catch {
      /* Index may already be absent. */
    }
  }

  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ address: 1 }, { unique: true }),
    db.collection(COLLECTIONS.ledgerProfiles).createIndex({ accountId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.financialWallets).createIndex(
      { accountId: 1, isDefault: 1 },
      { partialFilterExpression: { isDefault: true } },
    ),
    db.collection(COLLECTIONS.categoryTaxonomies).createIndex({ accountId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.expenses).createIndex({ accountId: 1, walletId: 1, date: -1 }),
    db.collection(COLLECTIONS.expenses).createIndex({ accountId: 1, date: -1 }),
    db.collection(COLLECTIONS.expenses).createIndex({ accountId: 1, recurring: 1, date: -1 }),
    /* Lookup for cron materialization dedupe (legacy plaintext series). */
    db.collection(COLLECTIONS.expenses).createIndex(
      { accountId: 1, walletId: 1, sub: 1, note: 1, recurring: 1, date: 1 },
      {
        name: "recurring_occurrence_lookup",
        partialFilterExpression: {
          recurring: { $in: [true, "monthly", "quarterly", "yearly"] },
          walletId: { $exists: true },
        },
      },
    ),
    /* Lookup for encrypted recurring series dedupe. */
    db.collection(COLLECTIONS.expenses).createIndex(
      { accountId: 1, walletId: 1, seriesKey: 1, recurring: 1, date: 1 },
      {
        name: "recurring_encrypted_occurrence_lookup",
        partialFilterExpression: {
          enc: 1,
          recurring: { $in: [true, "monthly", "quarterly", "yearly"] },
          walletId: { $exists: true },
          seriesKey: { $exists: true },
        },
      },
    ),
    db.collection(COLLECTIONS.events).createIndex({ accountId: 1, date: 1 }),
    db.collection(COLLECTIONS.consent).createIndex({ accountId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.authNonces).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(COLLECTIONS.authNonces).createIndex({ address: 1, nonce: 1 }),
    db.collection(COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ accountId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection(COLLECTIONS.reminderLogs)
      .createIndex({ eventId: 1, occurrenceIso: 1, lead: 1 }, { unique: true }),
    db.collection(COLLECTIONS.budgetAlertLogs).createIndex(
      { accountId: 1, walletId: 1, categoryId: 1, month: 1, level: 1 },
      { unique: true },
    ),
    db.collection(COLLECTIONS.todoLists).createIndex({ accountId: 1, createdAt: 1 }),
    db.collection(COLLECTIONS.capitalPlans).createIndex({ accountId: 1, createdAt: 1 }),
    db.collection(COLLECTIONS.vehicles).createIndex({ accountId: 1, createdAt: 1 }),
    db.collection(COLLECTIONS.vehicleFills).createIndex({ accountId: 1, vehicleId: 1, date: -1 }),
    db.collection(COLLECTIONS.vehicleFills).createIndex({ accountId: 1, date: -1 }),
    /* Push subscriptions: one row per browser endpoint, fanned out per account. */
    db.collection(COLLECTIONS.pushSubscriptions).createIndex({ endpoint: 1 }, { unique: true }),
    db.collection(COLLECTIONS.pushSubscriptions).createIndex({ accountId: 1 }),
    /* TTL cleanup for shared rate-limit buckets (resetAt is epoch ms). */
    db.collection(COLLECTIONS.rateLimits).createIndex(
      { resetAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    /* Cron reminder scan: only events that opted into email notify. */
    db.collection(COLLECTIONS.events).createIndex(
      { notify: 1 },
      { partialFilterExpression: { notify: true }, name: "events_notify_true" },
    ),
  ]);
}
