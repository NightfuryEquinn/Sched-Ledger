import { normalizeRecurring } from "@/lib/recurring";
import type { CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";

export type ExpenseImportRow = Omit<Expense, "id">;

export type ImportRowError = {
  row: number;
  message: string;
};

export type ParseExpenseCsvResult = {
  rows: ExpenseImportRow[];
  errors: ImportRowError[];
};

const MAX_IMPORT_ROWS = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** RFC 4180-style CSV parser (handles quoted fields and embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      /* handled with \n */
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function colIndex(headers: Record<string, number>, ...names: string[]): number | undefined {
  for (const name of names) {
    const idx = headers[name.toLowerCase()];
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseRecurringFromCsv(value: string): RecurringInterval | false {
  const v = value.trim().toLowerCase();
  if (!v || v === "no" || v === "false") return false;
  const normalized = normalizeRecurring(v);
  return normalized === false ? false : normalized;
}

function resolveSub(
  catName: string,
  subName: string,
  kind: "expense" | "income",
  categoryIndex: CategoryIndex,
): string | null {
  const subLower = subName.trim().toLowerCase();
  if (!subLower) return null;

  if (kind === "income") {
    const sub = categoryIndex.incomeCategory.subs.find((s) => s.name.toLowerCase() === subLower);
    return sub?.id ?? null;
  }

  const catLower = catName.trim().toLowerCase();
  if (catLower) {
    const cat = categoryIndex.expenseCategories.find((c) => c.name.toLowerCase() === catLower);
    if (cat) {
      const sub = cat.subs.find((s) => s.name.toLowerCase() === subLower);
      if (sub) return sub.id;
    }
    return null;
  }

  for (const cat of categoryIndex.expenseCategories) {
    const sub = cat.subs.find((s) => s.name.toLowerCase() === subLower);
    if (sub) return sub.id;
  }
  return null;
}

function resolveWallet(
  name: string,
  wallets: FinancialWallet[],
  defaultWalletId?: string,
): { walletId: string } | { error: string } {
  const trimmed = name.trim();
  if (trimmed) {
    const match = wallets.find((w) => w.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return { walletId: match.id };
    return { error: `Unknown wallet "${trimmed}"` };
  }
  if (defaultWalletId) return { walletId: defaultWalletId };
  const fallback = wallets.find((w) => w.isDefault) ?? wallets[0];
  if (fallback) return { walletId: fallback.id };
  return { error: "No wallet available" };
}

export function parseExpenseCsv(
  text: string,
  wallets: FinancialWallet[],
  categoryIndex: CategoryIndex,
  defaultWalletId?: string,
): ParseExpenseCsvResult {
  const rows: ExpenseImportRow[] = [];
  const errors: ImportRowError[] = [];

  const parsed = parseCsv(stripBom(text));
  if (!parsed.length) {
    return { rows, errors: [{ row: 0, message: "The file is empty." }] };
  }

  const headerRow = parsed[0].map((h) => h.trim());
  const headerMap = Object.fromEntries(headerRow.map((h, i) => [h.toLowerCase(), i]));

  const dateIdx = colIndex(headerMap, "date");
  const amountIdx = colIndex(headerMap, "amount");
  if (dateIdx === undefined || amountIdx === undefined) {
    return {
      rows,
      errors: [{ row: 0, message: "Missing required columns: Date and Amount." }],
    };
  }

  const walletIdx = colIndex(headerMap, "wallet");
  const typeIdx = colIndex(headerMap, "type", "kind");
  const catIdx = colIndex(headerMap, "category");
  const subIdx = colIndex(headerMap, "subcategory", "sub");
  const noteIdx = colIndex(headerMap, "note");
  const recurringIdx = colIndex(headerMap, "recurring");

  const dataRows = parsed.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows,
      errors: [{ row: 0, message: `Too many rows — import up to ${MAX_IMPORT_ROWS} at a time.` }],
    };
  }

  dataRows.forEach((cells, i) => {
    const rowNum = i + 2;
    const get = (idx: number | undefined) => (idx === undefined ? "" : (cells[idx] ?? "").trim());

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

    const walletResult = resolveWallet(get(walletIdx), wallets, defaultWalletId);
    if ("error" in walletResult) {
      errors.push({ row: rowNum, message: walletResult.error });
      return;
    }

    const subName = get(subIdx);
    const sub = resolveSub(get(catIdx), subName, kind, categoryIndex);
    if (!sub) {
      const label = subName || get(catIdx) || "(empty)";
      errors.push({ row: rowNum, message: `Unknown category or subcategory "${label}".` });
      return;
    }

    const noteRaw = get(noteIdx);
    const subDisplay = categoryIndex.subById[sub]?.name ?? subName;
    const note = noteRaw || subDisplay || "Transaction";

    rows.push({
      walletId: walletResult.walletId,
      kind,
      date,
      sub,
      amount,
      note,
      recurring: recurringIdx === undefined ? false : parseRecurringFromCsv(get(recurringIdx)),
    });
  });

  return { rows, errors };
}
