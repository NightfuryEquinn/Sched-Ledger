/**
 * Remove users inactive for over ACCOUNT_STALE_DAYS and all their owned data.
 *
 * Activity is users.lastSeenAt (set on login / session renew). Falls back to
 * max(sessions.lastSeenAt) then users.createdAt when lastSeenAt is missing.
 *
 * Usage:
 *   bun scripts/prune-stale-users.ts --dry-run
 *   bun scripts/prune-stale-users.ts --yes
 *
 * Requires MONGODB_URI (and optional MONGODB_DB) from the environment / .env.
 */

import { ObjectId, MongoClient, type Db } from "mongodb";
import { ACCOUNT_STALE_DAYS, ACCOUNT_STALE_MS } from "../src/lib/account-retention";
import { COLLECTIONS } from "../src/db/collections";
import { resolveMongoUri } from "../src/db/resolve-uri";

/** Collections keyed by opaque accountId. */
const OWNED_BY_ACCOUNT_ID = [
  COLLECTIONS.ledgerProfiles,
  COLLECTIONS.financialWallets,
  COLLECTIONS.categoryTaxonomies,
  COLLECTIONS.expenses,
  COLLECTIONS.events,
  COLLECTIONS.todoLists,
  COLLECTIONS.capitalPlans,
  COLLECTIONS.vehicles,
  COLLECTIONS.vehicleFills,
  COLLECTIONS.consent,
  COLLECTIONS.budgetAlertLogs,
  COLLECTIONS.pushSubscriptions,
  COLLECTIONS.sessions,
] as const;

type DeleteCounts = Record<string, number>;

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive exact match for a wallet address field. */
function addressMatch(address: string) {
  return { $regex: `^${escapeRegex(address)}$`, $options: "i" };
}

/** Print CLI help. */
function printHelp(): void {
  console.log(`Prune users inactive for over ${ACCOUNT_STALE_DAYS} days (and their data).

Usage:
  bun scripts/prune-stale-users.ts --dry-run
  bun scripts/prune-stale-users.ts --yes
  bun scripts/prune-stale-users.ts --help

Options:
  --dry-run     List stale accounts and document counts; do not delete
  --yes, -y     Skip the confirmation prompt
  --help, -h    Show this help
`);
}

/** Confirm a destructive action via stdin. */
async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);

  for await (const line of console) {
    const answer = String(line).trim().toLowerCase();

    return answer === "y" || answer === "yes";
  }

  return false;
}

/** Resolve the best-known last activity timestamp for a user. */
async function resolveLastActivity(
  db: Db,
  accountId: string,
  address: string | undefined,
  createdAt: Date,
  lastSeenAt: Date | undefined,
): Promise<Date> {
  if (lastSeenAt instanceof Date && !Number.isNaN(lastSeenAt.getTime())) {
    return lastSeenAt;
  }

  const sessions = db.collection(COLLECTIONS.sessions);
  const byAccount = await sessions
    .find({ accountId })
    .project({ lastSeenAt: 1 })
    .sort({ lastSeenAt: -1 })
    .limit(1)
    .next();

  if (byAccount?.lastSeenAt instanceof Date) {
    return byAccount.lastSeenAt;
  }

  if (address) {
    const byAddress = await sessions
      .find({ address: addressMatch(address) })
      .project({ lastSeenAt: 1 })
      .sort({ lastSeenAt: -1 })
      .limit(1)
      .next();

    if (byAddress?.lastSeenAt instanceof Date) {
      return byAddress.lastSeenAt;
    }
  }

  return createdAt instanceof Date ? createdAt : new Date(0);
}

/** Delete (or count) all data owned by one account. */
async function purgeAccount(
  db: Db,
  opts: {
    accountId: string;
    address: string | undefined;
    dryRun: boolean;
  },
): Promise<DeleteCounts> {
  const { accountId, address, dryRun } = opts;
  const counts: DeleteCounts = {};

  const events = await db
    .collection(COLLECTIONS.events)
    .find({ accountId })
    .project({ _id: 1 })
    .toArray();
  const eventIds = events.map((ev) => ev._id);

  if (eventIds.length) {
    const filter = { eventId: { $in: eventIds } };
    if (dryRun) {
      counts[COLLECTIONS.reminderLogs] = await db
        .collection(COLLECTIONS.reminderLogs)
        .countDocuments(filter);
    } else {
      const result = await db.collection(COLLECTIONS.reminderLogs).deleteMany(filter);
      counts[COLLECTIONS.reminderLogs] = result.deletedCount;
    }
  }

  for (const name of OWNED_BY_ACCOUNT_ID) {
    const filter = { accountId };
    if (dryRun) {
      counts[name] = await db.collection(name).countDocuments(filter);
    } else {
      const result = await db.collection(name).deleteMany(filter);
      counts[name] = result.deletedCount;
    }
  }

  /* Legacy sessions that still key by address only. */
  if (address) {
    const legacySessionFilter = {
      address: addressMatch(address),
      accountId: { $exists: false },
    };
    if (dryRun) {
      counts["sessions(legacy)"] = await db
        .collection(COLLECTIONS.sessions)
        .countDocuments(legacySessionFilter);
    } else {
      const result = await db.collection(COLLECTIONS.sessions).deleteMany(legacySessionFilter);
      counts["sessions(legacy)"] = result.deletedCount;
    }

    const nonceFilter = { address: addressMatch(address) };
    if (dryRun) {
      counts[COLLECTIONS.authNonces] = await db
        .collection(COLLECTIONS.authNonces)
        .countDocuments(nonceFilter);
    } else {
      const result = await db.collection(COLLECTIONS.authNonces).deleteMany(nonceFilter);
      counts[COLLECTIONS.authNonces] = result.deletedCount;
    }
  }

  const userFilter = { _id: new ObjectId(accountId) };
  if (dryRun) {
    counts[COLLECTIONS.users] = await db.collection(COLLECTIONS.users).countDocuments(userFilter);
  } else {
    const result = await db.collection(COLLECTIONS.users).deleteOne(userFilter);
    counts[COLLECTIONS.users] = result.deletedCount;
  }

  return counts;
}

/** Format a counts map as a compact summary string. */
function formatCounts(counts: DeleteCounts): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name}=${n}`)
    .join(" ") || "(no docs)";
}

/** Run the stale-user prune (or dry-run). */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");

  if (!dryRun && !yes && args.filter((a) => !a.startsWith("-")).length) {
    console.error("Unknown arguments. Use --help for usage.");
    process.exit(1);
  }

  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  const uri = await resolveMongoUri(rawUri);
  const dbName = process.env.MONGODB_DB?.trim() || "ledger";
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  const cutoff = new Date(Date.now() - ACCOUNT_STALE_MS);

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection(COLLECTIONS.users);
    const cursor = users.find(
      {},
      { projection: { address: 1, createdAt: 1, lastSeenAt: 1 } },
    );

    const stale: Array<{
      accountId: string;
      address: string | undefined;
      lastActivity: Date;
    }> = [];

    for await (const user of cursor) {
      const accountId = user._id.toHexString();
      const address = typeof user.address === "string" ? user.address : undefined;
      const createdAt = user.createdAt instanceof Date ? user.createdAt : new Date(0);
      const lastSeenAt = user.lastSeenAt instanceof Date ? user.lastSeenAt : undefined;
      const lastActivity = await resolveLastActivity(db, accountId, address, createdAt, lastSeenAt);

      if (lastActivity.getTime() < cutoff.getTime()) {
        stale.push({ accountId, address, lastActivity });
      }
    }

    console.log(`Database: ${dbName}`);
    console.log(`Cutoff:   ${cutoff.toISOString()} (${ACCOUNT_STALE_DAYS} days)`);
    console.log(`Stale:    ${stale.length} account(s)`);

    if (!stale.length) {
      console.log("Nothing to prune.");
      return;
    }

    if (!dryRun && !yes) {
      const ok = await confirm(`Delete ${stale.length} stale account(s) and all their data?`);
      if (!ok) {
        console.log("Aborted.");
        process.exit(1);
      }
    }

    let purged = 0;
    for (const row of stale) {
      const counts = await purgeAccount(db, {
        accountId: row.accountId,
        address: row.address,
        dryRun,
      });
      purged++;
      const label = row.address ?? row.accountId;
      const prefix = dryRun ? "[dry-run]" : "purged";
      console.log(
        `${prefix} ${label} lastActivity=${row.lastActivity.toISOString()} ${formatCounts(counts)}`,
      );
    }

    console.log(`Done. accounts=${purged}${dryRun ? " (dry-run)" : ""}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed:", message);
  if (err instanceof Error && err.cause) {
    console.error("Cause:", err.cause instanceof Error ? err.cause.message : err.cause);
  }
  process.exit(1);
});
