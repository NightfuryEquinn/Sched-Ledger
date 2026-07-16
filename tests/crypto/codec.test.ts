import { describe, expect, test } from "bun:test";
import {
  decodeExpense,
  decodeWallet,
  encodeExpenseCreate,
  encodeWalletFinancials,
} from "@/frontend/lib/crypto/codec";
import {
  buildDerivationMessage,
  deriveKeyFromSignature,
} from "@/frontend/lib/crypto/e2ee";
import { Wallet } from "ethers";

async function testKey() {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(buildDerivationMessage(wallet.address));
  return deriveKeyFromSignature(signature);
}

describe("crypto codec", () => {
  test("encodeExpenseCreate encrypts secrets and leaves metadata plaintext", async () => {
    const key = await testKey();
    const wire = await encodeExpenseCreate(
      {
        walletId: "507f1f77bcf86cd799439011",
        kind: "expense",
        date: "2026-07-01",
        sub: "groceries",
        amount: 25,
        note: "fruit",
        recurring: false,
      },
      key,
    );
    expect(wire.enc).toBe(1);
    expect(wire.payload).toBeTruthy();
    expect(wire.walletId).toBe("507f1f77bcf86cd799439011");
    expect(wire.date).toBe("2026-07-01");
    expect(wire.kind).toBe("expense");
    expect(wire.recurring).toBe(false);
    expect(wire).not.toHaveProperty("sub");
    expect(wire).not.toHaveProperty("amount");
    expect(wire).not.toHaveProperty("note");
    expect(wire.seriesKey).toBeUndefined();
  });

  test("recurring expenses include a stable seriesKey", async () => {
    const key = await testKey();
    const a = await encodeExpenseCreate(
      {
        walletId: "507f1f77bcf86cd799439011",
        kind: "expense",
        date: "2026-07-01",
        sub: "internet",
        amount: 99,
        note: "fiber",
        recurring: "monthly",
      },
      key,
    );
    const b = await encodeExpenseCreate(
      {
        walletId: "507f1f77bcf86cd799439011",
        kind: "expense",
        date: "2026-08-01",
        sub: "internet",
        amount: 99,
        note: "fiber",
        recurring: "monthly",
      },
      key,
    );
    expect(a.seriesKey).toMatch(/^[a-f0-9]{64}$/);
    expect(a.seriesKey).toBe(b.seriesKey);
  });

  test("decodeExpense decrypts enc=1 payloads", async () => {
    const key = await testKey();
    const wire = await encodeExpenseCreate(
      {
        walletId: "507f1f77bcf86cd799439011",
        kind: "expense",
        date: "2026-07-10",
        sub: "meal",
        amount: 18.5,
        note: "lunch",
        recurring: false,
      },
      key,
    );
    const decoded = await decodeExpense(
      { id: "exp1", ...wire },
      key,
    );
    expect(decoded).toMatchObject({
      id: "exp1",
      sub: "meal",
      amount: 18.5,
      note: "lunch",
      date: "2026-07-10",
    });
  });

  test("decodeExpense supports legacy plaintext records", async () => {
    const key = await testKey();
    const decoded = await decodeExpense(
      {
        id: "legacy",
        walletId: "w1",
        kind: "expense",
        date: "2026-01-01",
        recurring: false,
        sub: "petrol",
        amount: 40,
        note: "tank",
      },
      key,
    );
    expect(decoded.sub).toBe("petrol");
    expect(decoded.amount).toBe(40);
  });

  test("encodeWalletFinancials encrypts budgets and balances", async () => {
    const key = await testKey();
    const wire = await encodeWalletFinancials(
      { income: 5000, startingBalance: 100, budgets: { food: 800, transport: 200 } },
      key,
    );
    expect(wire.enc).toBe(1);
    const decoded = await decodeWallet(
      {
        id: "w1",
        name: "Main",
        currency: "MYR",
        fundingMode: "monthly",
        isDefault: true,
        ...wire,
      },
      key,
    );
    expect(decoded.income).toBe(5000);
    expect(decoded.startingBalance).toBe(100);
    expect(decoded.budgets).toEqual({ food: 800, transport: 200 });
  });

  test("decodeWallet supports legacy plaintext wallets", async () => {
    const key = await testKey();
    const decoded = await decodeWallet(
      {
        id: "w1",
        name: "Cash",
        currency: "USD",
        fundingMode: "starting",
        isDefault: false,
        income: 0,
        startingBalance: 250,
        budgets: { food: 100 },
      },
      key,
    );
    expect(decoded.startingBalance).toBe(250);
    expect(decoded.budgets.food).toBe(100);
  });
});
