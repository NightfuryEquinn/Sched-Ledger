/**
 * Apply a decrypted backup into the live ledger via existing save APIs.
 * Client-only; remaps wallets by name+currency when ids differ.
 */

import type {
  Category,
  Expense,
  FinancialWallet,
  LedgerEvent,
  TodoList,
} from "@/frontend/lib/types";
import type { LedgerBackupPlain } from "./encrypted-backup";

type BackupRestoreApi = {
  saveCategories: (categories: Category[]) => Promise<unknown>;
  saveWallet: (wallet: Omit<FinancialWallet, "id"> & { id?: string }) => Promise<FinancialWallet>;
  saveExpense: (expense: Omit<Expense, "id"> & { id?: string }) => Promise<unknown>;
  saveEvent: (event: Omit<LedgerEvent, "id"> & { id?: string }) => Promise<unknown>;
  saveTodoList: (list: Omit<TodoList, "id"> & { id?: string }) => Promise<unknown>;
};

export type BackupRestoreResult = {
  wallets: number;
  categories: boolean;
  expenses: number;
  events: number;
  todos: number;
  failed: number;
};

/** Restore backup rows into the unlocked ledger (batched sequential writes). */
export async function restoreBackupToLedger(
  plain: LedgerBackupPlain,
  current: {
    address: string;
    wallets: FinancialWallet[];
    expenses: Expense[];
    events: LedgerEvent[];
    todoLists: TodoList[];
  },
  api: BackupRestoreApi,
): Promise<BackupRestoreResult> {
  if (plain.address.toLowerCase() !== current.address.toLowerCase()) {
    throw new Error("Backup belongs to a different wallet address.");
  }

  const result: BackupRestoreResult = {
    wallets: 0,
    categories: false,
    expenses: 0,
    events: 0,
    todos: 0,
    failed: 0,
  };

  if (plain.categories?.length) {
    await api.saveCategories(plain.categories);
    result.categories = true;
  }

  const walletIdMap = new Map<string, string>();
  for (const w of current.wallets) {
    walletIdMap.set(w.id, w.id);
  }

  for (const bw of plain.wallets ?? []) {
    const match = current.wallets.find(
      (w) =>
        w.name.toLowerCase() === bw.name.toLowerCase() &&
        w.currency === bw.currency,
    );
    if (match) {
      walletIdMap.set(bw.id, match.id);
      continue;
    }
    try {
      const { id: _ignore, ...rest } = bw;
      const created = await api.saveWallet({ ...rest, isDefault: false });
      walletIdMap.set(bw.id, created.id);
      result.wallets++;
    } catch {
      result.failed++;
    }
  }

  const defaultWalletId =
    current.wallets.find((w) => w.isDefault)?.id ?? current.wallets[0]?.id;

  const existingExpenseIds = new Set(current.expenses.map((e) => e.id));
  for (const row of plain.expenses ?? []) {
    if (existingExpenseIds.has(row.id)) continue;
    const walletId = walletIdMap.get(row.walletId) ?? defaultWalletId;
    if (!walletId) {
      result.failed++;
      continue;
    }
    try {
      const { id: _id, ...rest } = row;
      await api.saveExpense({ ...rest, walletId });
      result.expenses++;
    } catch {
      result.failed++;
    }
  }

  const existingEventIds = new Set(current.events.map((e) => e.id));
  for (const row of plain.events ?? []) {
    if (existingEventIds.has(row.id)) continue;
    try {
      const { id: _id, ...rest } = row;
      await api.saveEvent(rest);
      result.events++;
    } catch {
      result.failed++;
    }
  }

  const existingTodoIds = new Set(current.todoLists.map((t) => t.id));
  for (const row of plain.todoLists ?? []) {
    if (existingTodoIds.has(row.id)) continue;
    try {
      const { id: _id, ...rest } = row;
      await api.saveTodoList(rest);
      result.todos++;
    } catch {
      result.failed++;
    }
  }

  return result;
}
