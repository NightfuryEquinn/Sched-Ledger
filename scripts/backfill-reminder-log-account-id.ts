/**
 * Backfill reminder_logs.accountId from the owning event's accountId.
 *
 * Usage:
 *   bun scripts/backfill-reminder-log-account-id.ts --dry-run
 *   bun scripts/backfill-reminder-log-account-id.ts --yes
 *
 * Requires MONGODB_URI (and optional MONGODB_DB) from the environment / .env.
 */

import { MongoClient, ObjectId } from "mongodb";
import { COLLECTIONS } from "../src/db/collections";
import { resolveMongoUri } from "../src/db/resolve-uri";

/** Print CLI help. */
function printHelp(): void {
  console.log(`Backfill reminder_logs.accountId from events.accountId.

Usage:
  bun scripts/backfill-reminder-log-account-id.ts --dry-run
  bun scripts/backfill-reminder-log-account-id.ts --yes
  bun scripts/backfill-reminder-log-account-id.ts --help

Options:
  --dry-run     Report rows that would be updated; do not write
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

/** Backfill missing accountId values on reminder log rows. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(args.length ? 0 : 1);
  }

  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");

  if (!dryRun && !yes) {
    console.error("Pass --dry-run or --yes. Use --help for usage.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to your .env file.");
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB ?? "ledger";
  const resolved = await resolveMongoUri(uri);
  const client = new MongoClient(resolved, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    const logs = db.collection(COLLECTIONS.reminderLogs);
    const events = db.collection(COLLECTIONS.events);

    const missing = await logs
      .find({ accountId: { $exists: false } })
      .project({ _id: 1, eventId: 1 })
      .toArray();

    if (!missing.length) {
      console.log("No reminder_logs rows missing accountId.");
      return;
    }

    console.log(`Found ${missing.length} reminder_logs row(s) missing accountId.`);

    let updated = 0;
    let orphaned = 0;

    for (const log of missing) {
      const event = await events.findOne(
        { _id: log.eventId instanceof ObjectId ? log.eventId : new ObjectId(String(log.eventId)) },
        { projection: { accountId: 1 } },
      );

      if (!event?.accountId) {
        orphaned++;
        console.warn(`  skip ${log._id}: event ${log.eventId} not found or has no accountId`);
        continue;
      }

      if (dryRun) {
        updated++;
        continue;
      }

      const result = await logs.updateOne(
        { _id: log._id, accountId: { $exists: false } },
        { $set: { accountId: event.accountId } },
      );

      if (result.modifiedCount) updated++;
    }

    if (dryRun) {
      console.log(`Would update ${updated} row(s); ${orphaned} orphaned.`);
      return;
    }

    if (!yes) {
      const ok = await confirm(`Update ${updated} reminder_logs row(s)?`);
      if (!ok) {
        console.log("Aborted.");
        process.exit(1);
      }
    }

    console.log(`Updated ${updated} row(s); ${orphaned} orphaned.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed:", message);
  process.exit(1);
});
