import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { randomObjectId } from "@/api/lib/ids";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { COLLECTIONS } from "@/db";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();
const SAME_DATE = "2024-06-15";
const PAGE_SIZE = 100;

/** Sign in and return session cookie. */
async function signIn(): Promise<string> {
  const wallet = Wallet.createRandom();

  const challengeRes = await app.request("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address }),
  });
  const challenge = (await challengeRes.json()) as { message: string };
  const signature = await wallet.signMessage(challenge.message);

  const verifyRes = await app.request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address, message: challenge.message, signature }),
  });
  const setCookie = verifyRes.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  return `${SESSION_COOKIE}=${match![1]!}`;
}

describe("expenses pagination", () => {
  let memoryDb: MemoryDb;
  let cookie = "";
  let accountId = "";
  let walletId = "";

  beforeAll(() => {
    memoryDb = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(async () => {
    resetRateLimitsForTests();
    memoryDb._reset();
    cookie = await signIn();

    const meRes = await app.request("/api/users/me", { headers: { cookie } });
    const me = (await meRes.json()) as { user: { id: string } };
    accountId = me.user.id;

    walletId = new ObjectId().toHexString();
    await memoryDb.collection(COLLECTIONS.financialWallets).insertOne({
      _id: new ObjectId(walletId),
      accountId,
      enc: 1,
      payload: "wallet",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = Array.from({ length: 250 }, (_, i) => ({
      _id: randomObjectId(),
      accountId,
      walletId: new ObjectId(walletId),
      kind: "expense" as const,
      date: SAME_DATE,
      recurring: false,
      enc: 1,
      payload: `row-${i}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await memoryDb.collection(COLLECTIONS.expenses).insertMany(rows);
  });

  test("returns every row when many share the same date", async () => {
    const seen = new Set<string>();
    let before: string | undefined;
    let beforeId: string | undefined;

    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (before) qs.set("before", before);
      if (beforeId) qs.set("beforeId", beforeId);

      const res = await app.request(`/api/expenses?${qs}`, { headers: { cookie } });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        expenses: Array<{ id: string }>;
        hasMore: boolean;
        nextBefore: string | null;
        nextBeforeId: string | null;
      };

      for (const row of body.expenses) seen.add(row.id);

      if (!body.hasMore) break;
      before = body.nextBefore ?? undefined;
      beforeId = body.nextBeforeId ?? undefined;
    }

    expect(seen.size).toBe(250);
  });
});
