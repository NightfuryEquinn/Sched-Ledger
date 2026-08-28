import { buildCsv, downloadCsv } from "@/frontend/auth/lib/csv";
import { resolveCategoryType } from "@/frontend/lib/categories";
import { isRecurring, recurringLabel } from "@/frontend/lib/stats";
import type { CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";

export function buildExpenseCsv(
  expenses: Expense[],
  wallets: FinancialWallet[] = [],
  categoryIndex?: CategoryIndex,
) {
  const walletById = Object.fromEntries(wallets.map((w) => [w.id, w]));
  const header = [
    "ID",
    "Date",
    "WalletId",
    "Wallet",
    "Type",
    "CategoryId",
    "Category",
    // Without this, a savings envelope re-imports as a plain expense category
    // and its transactions start counting as spending.
    "CategoryType",
    "SubcategoryId",
    "Subcategory",
    "Note",
    "Amount",
    "Currency",
    "Recurring",
  ];
  const rows = expenses
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((e) => {
      const sub = categoryIndex?.subById[e.sub];
      const cat = sub ? categoryIndex?.catById[sub.catId] : null;
      const w = walletById[e.walletId];
      const currency = w?.currency ?? "MYR";
      const kind = e.kind ?? "expense";
      return [
        e.id,
        e.date,
        w?.id ?? e.walletId,
        w?.name ?? "",
        kind,
        cat?.id ?? "",
        cat?.name ?? "",
        cat ? resolveCategoryType({ id: cat.id ?? sub?.catId ?? "", type: cat.type as never }) : "",
        sub?.id ?? e.sub,
        sub?.name ?? "",
        e.note,
        e.amount.toFixed(2),
        currency,
        isRecurring(e) ? recurringLabel(e.recurring) : "no",
      ];
    });
  return buildCsv(header, rows);
}

export function downloadExpenseCsv(
  expenses: Expense[],
  wallets: FinancialWallet[] = [],
  categoryIndex?: CategoryIndex,
): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`ledger-transactions-${date}.csv`, buildExpenseCsv(expenses, wallets, categoryIndex));
}
