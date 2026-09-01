import { buildCsv, downloadCsv } from "@/frontend/auth/lib/csv";
import type { CategoryIndex } from "@/frontend/lib/categories";
import { buildPiggies } from "@/frontend/lib/piggies";
import type { Expense } from "@/frontend/lib/types";

function buildPiggiesCsv(savingsTxns: Expense[], categoryIndex: CategoryIndex, currency = "MYR") {
  const piggies = buildPiggies(savingsTxns, categoryIndex);
  const header = [
    "CategoryId",
    "Category",
    "SubcategoryId",
    "Subcategory",
    "Balance",
    "Deposited",
    "Withdrawn",
    "Target",
    "Deadline",
    "Progress",
    "Currency",
  ];
  const rows = piggies.flatMap((p) => [
    [
      p.catId,
      p.name,
      "",
      "(total)",
      p.balance.toFixed(2),
      p.deposited.toFixed(2),
      p.withdrawn.toFixed(2),
      p.target != null ? p.target.toFixed(2) : "",
      p.deadline ?? "",
      p.progress != null ? `${Math.round(p.progress * 100)}%` : "",
      currency,
    ],
    ...p.piglets.map((s) => [
      p.catId,
      p.name,
      s.subId,
      s.name,
      s.balance.toFixed(2),
      s.deposited.toFixed(2),
      s.withdrawn.toFixed(2),
      s.target != null ? s.target.toFixed(2) : "",
      s.deadline ?? "",
      s.progress != null ? `${Math.round(s.progress * 100)}%` : "",
      currency,
    ]),
  ]);

  return buildCsv(header, rows);
}

export function downloadPiggiesCsv(
  savingsTxns: Expense[],
  categoryIndex: CategoryIndex,
  currency = "MYR",
): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`ledger-piggies-${date}.csv`, buildPiggiesCsv(savingsTxns, categoryIndex, currency));
}
