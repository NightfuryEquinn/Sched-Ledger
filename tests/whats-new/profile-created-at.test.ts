import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();

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

describe("profile route exposes createdAt", () => {
  let memory: MemoryDb;

  beforeAll(() => {
    memory = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(() => {
    memory._reset();
    resetRateLimitsForTests();
  });

  test("GET /api/profile returns a parseable ISO createdAt", async () => {
    const cookie = await signIn();

    const res = await app.request("/api/profile", { headers: { cookie } });
    expect(res.status).toBe(200);

    const { profile } = (await res.json()) as {
      profile: { id: string; currentMonth: string; createdAt: string };
    };

    expect(typeof profile.createdAt).toBe("string");
    expect(Number.isFinite(Date.parse(profile.createdAt))).toBe(true);
    /* The What's New gate compares this against now, so a fresh profile must
       read as newly created rather than as some epoch default. */
    expect(Date.now() - Date.parse(profile.createdAt)).toBeLessThan(60_000);
  });

  test("PATCH /api/profile keeps createdAt on the response", async () => {
    const cookie = await signIn();

    const res = await app.request("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ currentMonth: "2026-07" }),
    });
    expect(res.status).toBe(200);

    const { profile } = (await res.json()) as {
      profile: { currentMonth: string; createdAt: string };
    };

    expect(profile.currentMonth).toBe("2026-07");
    expect(Number.isFinite(Date.parse(profile.createdAt))).toBe(true);
  });

  test("profile response still withholds ownership keys", async () => {
    const cookie = await signIn();

    const res = await app.request("/api/profile", { headers: { cookie } });
    const { profile } = (await res.json()) as { profile: Record<string, unknown> };

    expect(Object.keys(profile).sort()).toEqual([
      "createdAt",
      "currentMonth",
      "id",
      "tourPreference",
      "toursSeen",
    ]);
  });
});
