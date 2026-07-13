import { resolveImportSub } from "@/frontend/auth/lib/category-import";
import {
  colIndex,
  isValidIsoDate,
  OBJECT_ID,
  parseCsv,
  stripBom,
  type ImportRowError,
  type ImportRowNotice,
} from "@/frontend/auth/lib/csv";
import { normalizeRecurring } from "@/lib/recurring";
import type { Category, Expense, FinancialWallet, RecurringInterval } from "@/frontend/lib/types";

export type { ImportRowError, ImportRowNotice };
export type ExpenseImportRow = Omit<Expense, "id">;

export type ParseExpenseCsvResult = {
  rows: ExpenseImportRow[];
  errors: ImportRowError[];
  notices: ImportRowNotice[];
  categories: Category[];
  stats: {
    newCategories: number;
    newSubcategories: number;
    walletRemapped: number;
  };
};

function parseRecurringFromCsv(value: string): RecurringInterval | false {
  const v = value.trim().toLowerCase();
  if (!v || v === "no" || v === "false") return false;
  const normalized = normalizeRecurring(v);
  return normalized === false ? false : normalized;
}

function resolveWallet(
  walletId: string,
  name: string,
  wallets: FinancialWallet[],
  defaultWalletId?: string,
): { walletId: string; remapped?: boolean } | { error: string } {
  const id = walletId.trim();
  const trimmed = name.trim();

  if (id && OBJECT_ID.test(id)) {
    const byId = wallets.find((w) => w.id.toLowerCase() === id.toLowerCase());
    if (byId) return { walletId: byId.id };
  }

  if (trimmed) {
    const byName = wallets.find((w) => w.name.toLowerCase() === trimmed.toLowerCase());
    if (byName) return { walletId: byName.id };
  }

  const fallbackId = defaultWalletId ?? wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id;
  if (!fallbackId) return { error: "No wallet available" };

  if (id || trimmed) {
    return { walletId: fallbackId, remapped: true };
  }

  return { walletId: fallbackId };
}

export function parseExpenseCsv(
  text: string,
  wallets: FinancialWallet[],
  categories: Category[],
  defaultWalletId?: string,
  existingIds: Iterable<string> = [],
): ParseExpenseCsvResult {
  const rows: ExpenseImportRow[] = [];
  const errors: ImportRowError[] = [];
  const notices: ImportRowNotice[] = [];
  const ledgerIds = new Set([...existingIds].map((id) => id.toLowerCase()));
  const seenInFile = new Set<string>();
  let workingCategories = categories.map((c) => ({ ...c, subs: [...c.subs] }));
  let newCategories = 0;
  let newSubcategories = 0;
  let walletRemapped = 0;

  const parsed = parseCsv(stripBom(text));
  if (!parsed.length) {
    return {
      rows,
      errors: [{ row: 0, message: "The file is empty." }],
      notices: [],
      categories: workingCategories,
      stats: { newCategories: 0, newSubcategories: 0, walletRemapped: 0 },
    };
  }

  const headerRow = parsed[0].map((h) => h.trim());
  const headerMap = Object.fromEntries(headerRow.map((h, i) => [h.toLowerCase(), i]));

  const dateIdx = colIndex(headerMap, "date");
  const amountIdx = colIndex(headerMap, "amount");
  if (dateIdx === undefined || amountIdx === undefined) {
    return {
      rows,
      errors: [{ row: 0, message: "Missing required columns: Date and Amount." }],
      notices: [],
      categories: workingCategories,
      stats: { newCategories: 0, newSubcategories: 0, walletRemapped: 0 },
    };
  }

  const idIdx = colIndex(headerMap, "id");
  const walletIdIdx = colIndex(headerMap, "walletid", "wallet id");
  const walletIdx = colIndex(headerMap, "wallet");
  const typeIdx = colIndex(headerMap, "type", "kind");
  const catIdIdx = colIndex(headerMap, "categoryid", "category id");
  const catIdx = colIndex(headerMap, "category");
  const subIdIdx = colIndex(headerMap, "subcategoryid", "subcategory id");
  const subIdx = colIndex(headerMap, "subcategory", "sub");
  const noteIdx = colIndex(headerMap, "note");
  const recurringIdx = colIndex(headerMap, "recurring");

  parsed.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const get = (idx: number | undefined) => (idx === undefined ? "" : (cells[idx] ?? "").trim());

    const csvId = get(idIdx);
    if (csvId) {
      if (!OBJECT_ID.test(csvId)) {
        errors.push({ row: rowNum, message: `Invalid ID "${csvId}".` });
        return;
      }
      const normalizedId = csvId.toLowerCase();
      if (ledgerIds.has(normalizedId)) {
        errors.push({ row: rowNum, message: "Transaction already in your ledger (duplicate ID)." });
        return;
      }
      if (seenInFile.has(normalizedId)) {
        errors.push({ row: rowNum, message: "Duplicate ID in this file." });
        return;
      }
      seenInFile.add(normalizedId);
    }

    const date = get(dateIdx);
    if (!isValidIsoDate(date)) {
      errors.push({ row: rowNum, message: `Invalid date "${date || "(empty)"}" — use YYYY-MM-DD.` });
      return;
    }

    const amountRaw = get(amountIdx).replace(/,/g, "");
    const amount = Math.round(parseFloat(amountRaw) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ row: rowNum, message: `Invalid amount "${get(amountIdx) || "(empty)"}".` });
      return;
    }

    const kindRaw = get(typeIdx).toLowerCase();
    const kind: "expense" | "income" = kindRaw === "income" ? "income" : "expense";

    const walletResult = resolveWallet(get(walletIdIdx), get(walletIdx), wallets, defaultWalletId);
    if ("error" in walletResult) {
      errors.push({ row: rowNum, message: walletResult.error });
      return;
    }
    if (walletResult.remapped) {
      const label = get(walletIdx) || get(walletIdIdx) || "unknown";
      const active = wallets.find((w) => w.id === walletResult.walletId);
      notices.push({
        row: rowNum,
        message: `Wallet "${label}" not found — will import into "${active?.name ?? "active wallet"}".`,
      });
      walletRemapped++;
    }

    const subResolved = resolveImportSub(workingCategories, {
      kind,
      catName: get(catIdx),
      catId: get(catIdIdx),
      subName: get(subIdx),
      subId: get(subIdIdx),
    });
    if ("error" in subResolved) {
      errors.push({ row: rowNum, message: subResolved.error });
      return;
    }
    workingCategories = subResolved.categories;
    if (subResolved.newCategory) newCategories++;
    if (subResolved.newSubcategory) newSubcategories++;

    const noteRaw = get(noteIdx);
    const subDisplay = get(subIdx);
    const note = noteRaw || subDisplay || "Transaction";

    rows.push({
      walletId: walletResult.walletId,
      kind,
      date,
      sub: subResolved.subId,
      amount,
      note,
      recurring: recurringIdx === undefined ? false : parseRecurringFromCsv(get(recurringIdx)),
    });
  });

  return {
    rows,
    errors,
    notices,
    categories: workingCategories,
    stats: { newCategories, newSubcategories, walletRemapped },
  };
}
