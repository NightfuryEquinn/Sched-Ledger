import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { COLLECTIONS } from "@/db";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const emailSends: Array<{ to: string; subject: string }> = [];

mock.module("@/api/lib/email", () => ({
  emailConfigured: () => true,
  sendEmail: async (input: { to: string; subject: string }) => {
    emailSends.push({ to: input.to, subject: input.subject });

    return { ok: true, id: "test" };
  },
  reminderEmailHtml: () => ({ html: "<p/>", text: "reminder", subject: "Upcoming" }),
}));

const app = createApiApp();

/** Sign in and return cookie plus account id. */
async function signInWithEmail(notifyEmail: string): Promise<{ cookie: string; accountId: string }> {
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
  const cookie = `${SESSION_COOKIE}=${match![1]!}`;

  const meRes = await app.request("/api/users/me", { headers: { cookie } });
  const me = (await meRes.json()) as { user: { id: string } };

  await app.request("/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ notifyEmail }),
  });

  return { cookie, accountId: me.user.id };
}

describe("event reminder email routing", () => {
  let memoryDb: MemoryDb;

  beforeAll(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    memoryDb = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(() => {
    resetRateLimitsForTests();
    memoryDb._reset();
    emailSends.length = 0;
  });

  test("confirmation uses the account notify email, not a foreign event email", async () => {
    const { cookie } = await signInWithEmail("owner@example.com");

    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        catId: "bill",
        date: "2026-09-01",
        notify: true,
        lead: "1d",
        email: "attacker@evil.example",
        notifyDetails: { title: "Rent" },
        enc: 1,
        payload: "ciphertext",
      }),
    });
    expect(res.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(emailSends.some((s) => s.to === "owner@example.com")).toBe(true);
    expect(emailSends.some((s) => s.to === "attacker@evil.example")).toBe(false);
  });
});
