import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

console.log("Testing connection (URI type:", uri.startsWith("mongodb+srv") ? "SRV" : "standard", ")");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

try {
  await client.connect();
  const ping = await client.db(process.env.MONGODB_DB ?? "ledger").command({ ping: 1 });
  console.log("Connected successfully. Ping:", ping.ok);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Connection failed:", message);
  if (err instanceof Error && err.cause) {
    console.error("Cause:", err.cause instanceof Error ? err.cause.message : err.cause);
  }
  process.exit(1);
} finally {
  await client.close();
}
