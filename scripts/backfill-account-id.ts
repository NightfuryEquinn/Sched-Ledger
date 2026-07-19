/**
 * Backfill opaque accountId onto ownership-keyed collections.
 *
 * For each users doc, sets accountId = _id hex where userAddress/address matched
 * (case-insensitive), then unsets the legacy ownership field.
 *
 * Usage:
 *   bun scripts/backfill-account-id.ts
 *   bun scripts/backfill-account-id.ts --dry-run
 *
 * Requires MONGODB_URI (and optional MONGODB_DB) from the environment / .env.
 */

import { MongoClient } from "mongodb";
import { COLLECTIONS } from "../src/db/collections";
import { resolveMongoUri } from "../src/db/resolve-uri";

const OWNED_BY_USER_ADDRESS = [
  COLLECTIONS.ledgerProfiles,
  COLLECTIONS.financialWallets,
  COLLECTIONS.categoryTaxonomies,
  COLLECTIONS.expenses,
  COLLECTIONS.events,
  COLLECTIONS.todoLists,
  COLLECTIONS.consent,
  COLLECTIONS.budgetAlertLogs,
] as const;

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive exact match for a legacy address field. */
function addressMatch(address: string) {
  return { $regex: `^${escapeRegex(address)}$`, $options: "i" };
}

/** Print CLI help. */
function printHelp(): void {
  console.log(`Backfill accountId from users._id onto owned collections.

Usage:
  bun scripts/backfill-account-id.ts [--dry-run]
  bun scripts/backfill-account-id.ts --help
`);
}

/** Run the backfill (or dry-run). */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  const uri = await resolveMongoUri(rawUri);
  const dbName = process.env.MONGODB_DB?.trim() || "ledger";
  const client = new MongoClient(uri);

  await client.connect();
  const db = client.db(dbName);
  const users = db.collection(COLLECTIONS.users);
  const cursor = users.find({}, { projection: { address: 1 } });

  let usersScanned = 0;
  let modified = 0;

  for await (const user of cursor) {
    usersScanned++;
    const accountId = user._id.toHexString();
    const address = typeof user.address === "string" ? user.address.toLowerCase() : null;
    if (!address) {
      console.warn(`skip user ${accountId}: missing address`);
      continue;
    }

    const match = addressMatch(address);

    for (const name of OWNED_BY_USER_ADDRESS) {
      const filter = { userAddress: match, accountId: { $exists: false } };
      if (dryRun) {
        const count = await db.collection(name).countDocuments(filter);
        if (count) console.log(`[dry-run] ${name}: would set accountId on ${count} docs for ${address}`);
        modified += count;
        continue;
      }

      const result = await db.collection(name).updateMany(
        { userAddress: match },
        { $set: { accountId }, $unset: { userAddress: "" } },
      );
      modified += result.modifiedCount;
      if (result.modifiedCount) {
        console.log(`${name}: set accountId on ${result.modifiedCount} docs for ${address}`);
      }
    }

    const sessions = db.collection(COLLECTIONS.sessions);
    const sessionFilter = { address: match, accountId: { $exists: false } };
    if (dryRun) {
      const count = await sessions.countDocuments(sessionFilter);
      if (count) console.log(`[dry-run] sessions: would set accountId on ${count} docs for ${address}`);
      modified += count;
    } else {
      const result = await sessions.updateMany(
        { address: match },
        { $set: { accountId }, $unset: { address: "" } },
      );
      modified += result.modifiedCount;
      if (result.modifiedCount) {
        console.log(`sessions: set accountId on ${result.modifiedCount} docs for ${address}`);
      }
    }
  }

  console.log(`Done. users=${usersScanned} modified=${modified}${dryRun ? " (dry-run)" : ""}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
