import { MongoClient } from "mongodb";

const srvUri = process.env.MONGODB_URI;
if (!srvUri?.startsWith("mongodb+srv://")) {
  console.error("Set MONGODB_URI to a mongodb+srv:// string first.");
  process.exit(1);
}

const parsed = new URL(srvUri.replace("mongodb+srv://", "https://"));
const auth = `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}`;
const db = process.env.MONGODB_DB ?? "ledger";

const hosts = [
  "ac-rtmyaup-shard-00-00.ghfs3jt.mongodb.net:27017",
  "ac-rtmyaup-shard-00-01.ghfs3jt.mongodb.net:27017",
  "ac-rtmyaup-shard-00-02.ghfs3jt.mongodb.net:27017",
].join(",");

const directUri =
  `mongodb://${auth}@${hosts.split(",")[0]}/${db}` +
  "?ssl=true&authSource=admin&directConnection=true";

console.log("Testing direct connection to single shard…");

const client = new MongoClient(directUri, { serverSelectionTimeoutMS: 15_000 });
try {
  await client.connect();
  const ping = await client.db(db).command({ ping: 1 });
  console.log("Standard URI works. Ping:", ping.ok);
  console.log("");
  console.log("Fix: in Atlas go to Connect → Drivers → copy the Standard connection string");
  console.log("(not mongodb+srv) into MONGODB_URI in your .env");
} catch (err) {
  console.error("Standard URI failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.close();
}
