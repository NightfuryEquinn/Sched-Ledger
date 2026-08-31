import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();

const VALID_ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-token-abc";
const VALID_KEYS = { p256dh: "a".repeat(80), auth: "b".repeat(20) };

/** Sign in a fresh wallet and return its session cookie header value. */
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

describe("push routes", () => {
  let memoryDb: MemoryDb;

  beforeAll(() => {
    memoryDb = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    memoryDb._reset();
  });

  test("rejects non-HTTPS push endpoints", async () => {
    const cookie = await signIn();
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        endpoint: "http://169.254.169.254/latest/meta-data/",
        keys: VALID_KEYS,
      }),
    });

    expect(res.status).toBe(400);
  });

  test("rejects endpoints from unknown hosts", async () => {
    const cookie = await signIn();
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        endpoint: "https://evil.example.com/push",
        keys: VALID_KEYS,
      }),
    });

    expect(res.status).toBe(400);
  });

  test("blocks cross-account endpoint hijack", async () => {
    const cookieA = await signIn();
    const cookieB = await signIn();

    const ok = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieA },
      body: JSON.stringify({ endpoint: VALID_ENDPOINT, keys: VALID_KEYS }),
    });
    expect(ok.status).toBe(200);

    const hijack = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieB },
      body: JSON.stringify({ endpoint: VALID_ENDPOINT, keys: VALID_KEYS }),
    });
    expect(hijack.status).toBe(409);
  });

  test("allows the same account to refresh its subscription", async () => {
    const cookie = await signIn();

    const first = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ endpoint: VALID_ENDPOINT, keys: VALID_KEYS }),
    });
    expect(first.status).toBe(200);

    const second = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        endpoint: VALID_ENDPOINT,
        keys: { p256dh: "c".repeat(80), auth: "d".repeat(20) },
      }),
    });
    expect(second.status).toBe(200);
  });
});
