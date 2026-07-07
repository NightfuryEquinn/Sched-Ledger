import { MongoClient, type Db } from "mongodb";
import { resolveMongoUri } from "./resolve-uri";

const dbName = process.env.MONGODB_DB ?? "ledger";

let client: MongoClient | null = null;
let db: Db | null = null;

async function openClient(uri: string): Promise<Db> {
  const resolved = await resolveMongoUri(uri);
  if (resolved !== uri) {
    console.log("Resolved mongodb+srv URI to direct connection (Bun DNS workaround).");
  }

  const next = new MongoClient(resolved, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  await next.connect();
  client = next;
  return client.db(dbName);
}

export async function connectDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  try {
    db = await openClient(uri);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not connect to MongoDB: ${message}`, { cause: err });
  }

  const { ensureIndexes } = await import("./indexes");
  await ensureIndexes(db);

  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() before handling requests.");
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
