import { CAT_BY_ID, CURRENCY, SUB_BY_ID } from "@/frontend/lib/data";
import type { Expense } from "@/frontend/lib/types";

function escapeCsv(value: unknown): string {
  const s = String(value == null ? "" : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExpenseCsv(expenses: Expense[]): string {
  const header = ["Date", "Category", "Subcategory", "Note", "Amount", "Currency", "Recurring"];
  const rows = expenses
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((e) => {
      const sub = SUB_BY_ID[e.sub];
      const cat = sub ? CAT_BY_ID[sub.catId] : null;
      return [
        e.date,
        cat?.name ?? "",
        sub?.name ?? "",
        e.note,
        e.amount.toFixed(2),
        CURRENCY.code,
        e.recurring ? "yes" : "no",
      ]
        .map(escapeCsv)
        .join(",");
    });
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadExpenseCsv(expenses: Expense[]): void {
  const blob = new Blob([`\uFEFF${buildExpenseCsv(expenses)}`], {
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
