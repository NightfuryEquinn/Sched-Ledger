import { MongoClient } from "mongodb";
import { spawnSync } from "node:child_process";

type SrvRecord = { host: string; port: number };

/** Bun on Windows fails `dns.resolveSrv` for Atlas — fall back to nslookup. */
function resolveSrvViaNslookup(srvName: string): SrvRecord[] {
  const result = spawnSync("nslookup", ["-type=SRV", srvName], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`nslookup failed for ${srvName}`);
  }

  const records: SrvRecord[] = [];
  const lines = result.stdout.split(/\r?\n/);
  let pendingPort: number | null = null;

  for (const line of lines) {
    const portMatch = line.match(/port\s*=\s*(\d+)/i);
    if (portMatch) {
      pendingPort = Number(portMatch[1]);
      continue;
    }
    const hostMatch = line.match(/svr hostname\s*=\s*(\S+)/i);
    if (hostMatch?.[1] && pendingPort) {
      records.push({ host: hostMatch[1], port: pendingPort });
      pendingPort = null;
    }
  }

  if (!records.length) {
    throw new Error(`No SRV records found for ${srvName}`);
  }

  return records;
}

async function resolveSrvViaDns(srvName: string): Promise<SrvRecord[]> {
  const dns = await import("node:dns/promises");
  const records = await dns.resolveSrv(srvName);
  return records.map((r) => ({ host: r.name, port: r.port }));
}

function buildDirectUri(
  auth: string,
  host: string,
  port: number,
  dbName: string,
  search: string,
): string {
  const params = new URLSearchParams(search);
  params.set("ssl", "true");
  params.set("authSource", params.get("authSource") ?? "admin");
  params.set("directConnection", "true");
  const qs = params.toString();
  return `mongodb://${auth}${host}:${port}/${dbName}${qs ? `?${qs}` : ""}`;
}

async function findWritableShard(
  auth: string,
  records: SrvRecord[],
  dbName: string,
  search: string,
): Promise<string> {
  let lastError: unknown;

  for (const { host, port } of records) {
    const uri = buildDirectUri(auth, host, port, dbName, search);
    const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 });
    try {
      await probe.connect();
      const hello = await probe.db("admin").command({ hello: 1 });
      if (hello.isWritablePrimary) {
        await probe.close();
        return uri;
      }
    } catch (err) {
      lastError = err;
    } finally {
      await probe.close().catch(() => {});
    }
  }

  throw new Error("Could not find a writable Atlas shard", { cause: lastError });
}

/**
 * Converts `mongodb+srv://` to a direct `mongodb://` URI.
 * Only needed on Windows where Bun cannot resolve Atlas SRV records.
 * Vercel/Linux should pass the SRV URI through to the MongoDB driver.
 */
export async function resolveMongoUri(uri: string): Promise<string> {
  if (!uri.startsWith("mongodb+srv://")) return uri;
  if (process.platform !== "win32") return uri;

  const parsed = new URL(uri.replace("mongodb+srv://", "https://"));
  const srvName = `_mongodb._tcp.${parsed.hostname}`;
  const dbName = parsed.pathname.replace(/^\//, "") || process.env.MONGODB_DB || "ledger";

  let records: SrvRecord[];
  try {
    records = await resolveSrvViaDns(srvName);
  } catch {
    records = resolveSrvViaNslookup(srvName);
  }

  const auth = parsed.username
    ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
    : "";

  return findWritableShard(auth, records, dbName, parsed.search);
}
