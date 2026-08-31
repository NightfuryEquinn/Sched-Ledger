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

async function createWallet(cookie: string): Promise<string> {
  const res = await app.request("/api/wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ currency: "MYR", enc: 1, payload: "wallet-ciphertext" }),
  });
  expect(res.status).toBe(201);
  const { wallet } = (await res.json()) as { wallet: { id: string } };

  return wallet.id;
}

async function createPlan(cookie: string): Promise<string> {
  const res = await app.request("/api/capital-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ enc: 1, payload: "plan-ciphertext" }),
  });
  expect(res.status).toBe(201);
  const { capitalPlan } = (await res.json()) as { capitalPlan: { id: string } };

  return capitalPlan.id;
}

async function createExpense(
  cookie: string,
  walletId: string,
  capitalPlanId?: string,
): Promise<string> {
  const res = await app.request("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      walletId,
      date: "2026-08-01",
      enc: 1,
      payload: "expense-ciphertext",
      ...(capitalPlanId ? { capitalPlanId } : {}),
    }),
  });
  expect(res.status).toBe(201);
  const { expense } = (await res.json()) as { expense: { id: string } };

  return expense.id;
}

/** Read one expense's capitalPlanId back through the API, as a client would. */
async function planIdOf(cookie: string, expenseId: string): Promise<string | undefined> {
  const res = await app.request("/api/expenses", { headers: { cookie } });
  const { expenses } = (await res.json()) as {
    expenses: { id: string; capitalPlanId?: string }[];
  };
  const found = expenses.find((e) => e.id === expenseId);
  expect(found).toBeDefined();

  return found!.capitalPlanId;
}

describe("capital plan routes", () => {
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

  test("deleting a plan releases the savings assigned to it", async () => {
    const cookie = await signIn();
    const walletId = await createWallet(cookie);
    const planId = await createPlan(cookie);
    const assigned = await createExpense(cookie, walletId, planId);

    expect(await planIdOf(cookie, assigned)).toBe(planId);

    const res = await app.request(`/api/capital-plans/${planId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);

    // Released, not deleted — the deposit is real money and goes back to its
    // savings envelope rather than vanishing from both trackers.
    expect(await planIdOf(cookie, assigned)).toBeUndefined();
  });

  test("leaves other plans' and unassigned expenses alone", async () => {
    const cookie = await signIn();
    const walletId = await createWallet(cookie);
    const doomed = await createPlan(cookie);
    const keeper = await createPlan(cookie);

    const onDoomed = await createExpense(cookie, walletId, doomed);
    const onKeeper = await createExpense(cookie, walletId, keeper);
    const unassigned = await createExpense(cookie, walletId);

    await app.request(`/api/capital-plans/${doomed}`, { method: "DELETE", headers: { cookie } });

    expect(await planIdOf(cookie, onDoomed)).toBeUndefined();
    expect(await planIdOf(cookie, onKeeper)).toBe(keeper);
    expect(await planIdOf(cookie, unassigned)).toBeUndefined();
  });

  test("releases a legacy hex-string capitalPlanId too", async () => {
    const cookie = await signIn();
    const walletId = await createWallet(cookie);
    const planId = await createPlan(cookie);
    const legacy = await createExpense(cookie, walletId, planId);

    // Rows predating the ObjectId write path store the id as a hex string; an
    // ObjectId-only filter would skip exactly the rows this cleanup exists for.
    const docs = memory.collection("expenses")._docs as { _id: unknown; capitalPlanId?: unknown }[];
    const doc = docs.find((d) => String(d._id) === legacy)!;
    doc.capitalPlanId = planId;

    await app.request(`/api/capital-plans/${planId}`, { method: "DELETE", headers: { cookie } });

    expect(await planIdOf(cookie, legacy)).toBeUndefined();
  });

  test("another account cannot delete the plan or release its savings", async () => {
    const owner = await signIn();
    const walletId = await createWallet(owner);
    const planId = await createPlan(owner);
    const assigned = await createExpense(owner, walletId, planId);

    const stranger = await signIn();
    const res = await app.request(`/api/capital-plans/${planId}`, {
      method: "DELETE",
      headers: { cookie: stranger },
    });
    expect(res.status).toBe(404);

    expect(await planIdOf(owner, assigned)).toBe(planId);
  });
});
