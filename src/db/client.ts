import { MongoClient, type Db } from "mongodb";
import { resolveMongoUri } from "./resolve-uri";

const dbName = process.env.MONGODB_DB ?? "ledger";

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db> | null = null;

const CONNECT_TIMEOUT_MS = 12_000;

async function openClient(uri: string): Promise<Db> {
  const resolved = await resolveMongoUri(uri);
  if (resolved !== uri) {
    console.log("Resolved mongodb+srv URI to direct connection (Bun DNS workaround).");
  }

  const next = new MongoClient(resolved, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
  });
  await next.connect();
  client = next;
  return client.db(dbName);
}

export async function connectDb(): Promise<Db> {
  if (db) return db;
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  connecting = (async () => {
    try {
      const nextDb = await openClient(uri);
      const { ensureIndexes } = await import("./indexes");
      await ensureIndexes(nextDb);
      db = nextDb;
      return db;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not connect to MongoDB: ${message}`, { cause: err });
    } finally {
      connecting = null;
    }
  })();

  return connecting;
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
