import type { Expense, FinancialWallet } from "@/frontend/lib/types";
import type { CategoryIndex } from "@/frontend/lib/types";
import { isRecurring, recurringLabel } from "@/frontend/lib/stats";

function escapeCsv(value: unknown): string {
  const s = String(value == null ? "" : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExpenseCsv(
  expenses: Expense[],
  wallets: FinancialWallet[] = [],
  categoryIndex?: { subById: Record<string, { name: string; catId: string }>; catById: Record<string, { name: string }> },
) {
  const walletById = Object.fromEntries(wallets.map((w) => [w.id, w]));
  const header = ["Date", "Wallet", "Type", "Category", "Subcategory", "Note", "Amount", "Currency", "Recurring"];
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
        e.date,
        w?.name ?? "",
        kind,
        cat?.name ?? "",
        sub?.name ?? "",
        e.note,
        e.amount.toFixed(2),
        currency,
        isRecurring(e) ? recurringLabel(e.recurring) : "no",
      ]
        .map(escapeCsv)
        .join(",");
    });
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadExpenseCsv(
  expenses: Expense[],
  wallets: FinancialWallet[] = [],
  categoryIndex?: CategoryIndex,
): void {
  const blob = new Blob([`\uFEFF${buildExpenseCsv(expenses, wallets, categoryIndex)}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
