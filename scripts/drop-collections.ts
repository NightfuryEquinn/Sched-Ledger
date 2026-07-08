/**
 * Drop MongoDB collections for Sched Ledger.
 *
 * Usage:
 *   bun scripts/drop-collections.ts --list
 *   bun scripts/drop-collections.ts expenses events
 *   bun scripts/drop-collections.ts users sessions --yes
 *   bun scripts/drop-collections.ts --all --yes
 *
 * Collection names may be Mongo names (expenses) or COLLECTION keys (financialWallets).
 * Requires MONGODB_URI (and optional MONGODB_DB) from the environment / .env.
 */

import { MongoClient } from "mongodb";
import { COLLECTIONS, type CollectionName } from "../src/db/collections";
import { resolveMongoUri } from "../src/db/resolve-uri";

const KNOWN = Object.values(COLLECTIONS) as CollectionName[];
const KEY_TO_NAME = new Map(Object.entries(COLLECTIONS).map(([k, v]) => [k.toLowerCase(), v]));
const NAME_SET = new Set(KNOWN.map((n) => n.toLowerCase()));

function printHelp(): void {
  console.log(`Drop MongoDB collections.

Usage:
  bun scripts/drop-collections.ts --list
  bun scripts/drop-collections.ts <collection...> [--yes]
  bun scripts/drop-collections.ts --all [--yes]

Options:
  --list, -l    List known app collections and exit
  --all, -a     Drop every collection in the database
  --yes, -y     Skip the confirmation prompt
  --help, -h    Show this help

Collections (Mongo name | key):
${KNOWN.map((name) => {
  const key = Object.entries(COLLECTIONS).find(([, v]) => v === name)?.[0] ?? name;
  return `  ${name.padEnd(22)} ${key}`;
}).join("\n")}`);
}

function resolveName(raw: string): string {
  const lower = raw.toLowerCase();
  if (NAME_SET.has(lower)) {
    return KNOWN.find((n) => n.toLowerCase() === lower)!;
  }
  const fromKey = KEY_TO_NAME.get(lower);
  if (fromKey) return fromKey;
  return raw;
}

async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);
  for await (const line of console) {
    const answer = String(line).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
  return false;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(args.length ? 0 : 1);
  }

  if (args.includes("--list") || args.includes("-l")) {
    console.log(`Known collections (db=${process.env.MONGODB_DB ?? "ledger"}):`);
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      console.log(`  ${name.padEnd(22)} (${key})`);
    }
    return;
  }

  const yes = args.includes("--yes") || args.includes("-y");
  const dropAll = args.includes("--all") || args.includes("-a");
  const targets = args
    .filter((a) => !a.startsWith("-"))
    .map(resolveName);

  if (!dropAll && !targets.length) {
    console.error("Pass collection names or --all. Use --help for usage.");
    process.exit(1);
  }
  if (dropAll && targets.length) {
    console.error("Do not combine --all with named collections.");
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
    const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);

    const toDrop = dropAll
      ? existing
      : [...new Set(targets)];

    if (!toDrop.length) {
      console.log(`No collections to drop in "${dbName}".`);
      return;
    }

    if (!dropAll) {
      const missing = toDrop.filter((n) => !existing.includes(n));
      if (missing.length) {
        console.warn(`Not present (will skip): ${missing.join(", ")}`);
      }
    }

    const present = toDrop.filter((n) => existing.includes(n));
    if (!present.length) {
      console.log(`Nothing to drop in "${dbName}".`);
      return;
    }

    console.log(`Database: ${dbName}`);
    console.log(`Will drop (${present.length}):`);
    for (const name of present) console.log(`  - ${name}`);

    if (!yes) {
      const ok = await confirm("This cannot be undone. Continue?");
      if (!ok) {
        console.log("Aborted.");
        process.exit(1);
      }
    }

    for (const name of present) {
      await db.collection(name).drop();
      console.log(`Dropped ${name}`);
    }
    console.log(`Done. Dropped ${present.length} collection(s).`);
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
