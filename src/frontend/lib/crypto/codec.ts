import {
  decryptJson,
  encryptJson,
  expenseSeriesKey,
  type ExpenseSecrets,
  type WalletSecrets,
} from "@/frontend/lib/crypto/e2ee";
import type { Budgets, Expense, FinancialWallet } from "@/frontend/lib/types";
import { normalizeRecurring } from "@/frontend/lib/stats";
import type { RecurringField } from "@/lib/recurring";

export type ExpenseWire = {
  id: string;
  walletId: string;
  kind: "expense" | "income";
  date: string;
  recurring: RecurringField | false;
  enc?: 1;
  payload?: string;
  seriesKey?: string;
  /** Legacy plaintext fields (pre-E2EE or migration). */
  sub?: string;
  amount?: number;
  note?: string;
};

export type WalletWire = FinancialWallet & {
  enc?: 1;
  payload?: string;
};

export async function decodeExpense(wire: ExpenseWire, key: CryptoKey): Promise<Expense> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<ExpenseSecrets>(key, wire.payload);
    return {
      id: wire.id,
      walletId: wire.walletId,
      kind: wire.kind ?? "expense",
      date: wire.date,
      recurring: normalizeRecurring(wire.recurring),
      ...secrets,
    };
  }
  if (wire.sub == null || wire.amount == null) {
    throw new Error("Expense is encrypted but no key is available");
  }
  return {
    id: wire.id,
    walletId: wire.walletId,
    kind: wire.kind ?? "expense",
    date: wire.date,
    sub: wire.sub,
    amount: wire.amount,
    note: wire.note ?? "",
    recurring: normalizeRecurring(wire.recurring),
  };
}

export async function encodeExpenseCreate(
  expense: Pick<Expense, "walletId" | "kind" | "date" | "sub" | "amount" | "note" | "recurring">,
  key: CryptoKey,
) {
  const payload = await encryptJson(key, {
    sub: expense.sub,
    amount: expense.amount,
    note: expense.note ?? "",
  } satisfies ExpenseSecrets);
  const recurring = normalizeRecurring(expense.recurring);
  const seriesKey =
    recurring !== false
      ? await expenseSeriesKey({
          walletId: expense.walletId,
          sub: expense.sub,
          note: expense.note ?? "",
          recurring,
        })
      : undefined;
  return {
    walletId: expense.walletId,
    kind: expense.kind ?? "expense",
    date: expense.date,
    recurring,
    enc: 1 as const,
    payload,
    ...(seriesKey ? { seriesKey } : {}),
  };
}

export async function encodeExpenseUpdate(
  expense: Partial<Omit<Expense, "id">> & Pick<Expense, "sub" | "amount" | "note">,
  key: CryptoKey,
) {
  const payload = await encryptJson(key, {
    sub: expense.sub,
    amount: expense.amount,
    note: expense.note ?? "",
  } satisfies ExpenseSecrets);
  const patch: Record<string, unknown> = { enc: 1, payload };
  if (expense.walletId) patch.walletId = expense.walletId;
  if (expense.kind) patch.kind = expense.kind;
  if (expense.date) patch.date = expense.date;
  if (expense.recurring !== undefined) {
    patch.recurring = normalizeRecurring(expense.recurring);
    const recurring = patch.recurring as RecurringField | false;
    if (recurring !== false && expense.walletId) {
      patch.seriesKey = await expenseSeriesKey({
        walletId: expense.walletId,
        sub: expense.sub,
        note: expense.note ?? "",
        recurring,
      });
    } else {
      patch.seriesKey = null;
    }
  }
  return patch;
}

export async function decodeWallet(wire: WalletWire, key: CryptoKey): Promise<FinancialWallet> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<WalletSecrets>(key, wire.payload);
    return {
      id: wire.id,
      name: wire.name,
      currency: wire.currency,
      fundingMode: wire.fundingMode ?? "monthly",
      isDefault: wire.isDefault,
      ...secrets,
    };
  }
  return {
    id: wire.id,
    name: wire.name,
    currency: wire.currency,
    fundingMode: wire.fundingMode ?? "monthly",
    income: wire.income ?? 0,
    startingBalance: wire.startingBalance ?? 0,
    budgets: wire.budgets ?? {},
    isDefault: wire.isDefault,
  };
}

export async function encodeWalletFinancials(
  data: { income?: number; startingBalance?: number; budgets?: Budgets },
  key: CryptoKey,
) {
  return {
    enc: 1 as const,
    payload: await encryptJson(key, {
      income: data.income ?? 0,
      startingBalance: data.startingBalance ?? 0,
      budgets: data.budgets ?? {},
    } satisfies WalletSecrets),
  };
}
