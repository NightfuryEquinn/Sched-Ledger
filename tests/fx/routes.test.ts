import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();
let fetchCalls = 0;

const originalFetch = globalThis.fetch;

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

describe("fx routes", () => {
  let memoryDb: MemoryDb;

  beforeAll(() => {
    memoryDb = installMemoryDb();
    globalThis.fetch = (async (...args) => {
      fetchCalls++;
      return originalFetch(...args);
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    uninstallMemoryDb();
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    memoryDb._reset();
    fetchCalls = 0;
    delete process.env.EXCHANGE_RATE_API_KEY;
  });

  test("rejects unsupported currency codes before upstream fetch", async () => {
    const cookie = await signIn();
    const res = await app.request("/api/fx/latest/ZZZ", { headers: { cookie } });

    expect(res.status).toBe(400);
    expect(fetchCalls).toBe(0);
  });

  test("accepts supported currency codes", async () => {
    process.env.EXCHANGE_RATE_API_KEY = "test-key";
    const cookie = await signIn();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          result: "success",
          base_code: "USD",
          conversion_rates: { USD: 1, MYR: 4.5 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const res = await app.request("/api/fx/latest/USD", { headers: { cookie } });
    expect(res.status).toBe(200);
  });
});
