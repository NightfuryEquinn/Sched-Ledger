import {
  normalizeRecurring,
  recurringDueDay,
  recurringLabel,
  recurringMonthlyEquivalent,
  recurringOccursInMonth,
  recurringScheduleKey,
  type RecurringField,
  type RecurringInterval,
} from "@/lib/recurring";
import type { CategoryIndex } from "./categories";
import { catOfSub, isArchivedCategory, isIncomeCategory, isSavingsSub, isSpendingCategory } from "./categories";
import { CURRENT_MONTH_KEY, SUB_BY_ID, TODAY_ISO, monthLabel, monthsWindow, roundMoney } from "./data";
import type { Budgets, Expense, FinancialWallet, LedgerEvent } from "./types";
import { holdsByCategory, totalActiveHolds } from "./envelope-holds";
import { displayGlyph } from "@/lib/glyphs";

export {
  normalizeRecurring,
  recurringDueDay,
  recurringLabel,
  recurringMonthlyEquivalent,
  recurringOccursInMonth,
  recurringScheduleKey
};
export type { RecurringField, RecurringInterval };

export type ChartPeriod = "daily" | "monthly" | "quarterly" | "yearly";
export type ChartBar = { key: string; label: string; spent: number; earned: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function quarterOf(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, quarter: Math.ceil(month / 3) };
}

function quartersWindow(anchorMonth: string, size = 6) {
  let { year, quarter } = quarterOf(anchorMonth);
  const out: { year: number; quarter: number; key: string; label: string }[] = [];
  for (let i = 0; i < size; i++) {
    out.unshift({ year, quarter, key: `${year}-Q${quarter}`, label: `Q${quarter}` });
    quarter -= 1;
    if (quarter < 1) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

/**
 * Spend (outgoing, excluding savings envelopes) and income totals for a set of
 * transactions, rounded to cents so float drift never leaks into a bar.
 */
function flowTotals(expenses: Expense[], index?: CategoryIndex) {
  let spent = 0;
  let earned = 0;

  for (const e of expenses) {
    if (isIncome(e)) {
      earned += e.amount;
      continue;
    }
    if (isSavings(e, index)) continue;
    spent += e.amount;
  }

  return { spent: roundMoney(spent), earned: roundMoney(earned) };
}

export function spendingChartSeries(
  period: ChartPeriod,
  expenses: Expense[],
  anchorMonth: string,
  index?: CategoryIndex,
): ChartBar[] {
  if (period === "daily") {
    const [year, month] = anchorMonth.split("-").map(Number);
    const days = new Date(year, month, 0).getDate();
    const bars: ChartBar[] = [];
    for (let d = 1; d <= days; d++) {
      const key = `${anchorMonth}-${pad2(d)}`;
      const totals = flowTotals(expenses.filter((e) => e.date === key), index);
      bars.push({ key, label: String(d), ...totals });
    }
    return bars;
  }

  if (period === "monthly") {
    return monthsWindow(anchorMonth).map((mo) => {
      const totals = flowTotals(monthExpenses(expenses, mo.key), index);
      return { key: mo.key, label: monthLabel(mo.key).split(" ")[0], ...totals };
    });
  }

  if (period === "quarterly") {
    return quartersWindow(anchorMonth).map(({ year, quarter, key, label }) => {
      const startM = (quarter - 1) * 3 + 1;
      let spent = 0;
      let earned = 0;
      for (let i = 0; i < 3; i++) {
        const monthKey = `${year}-${pad2(startM + i)}`;
        const totals = flowTotals(monthExpenses(expenses, monthKey), index);
        spent += totals.spent;
        earned += totals.earned;
      }
      return {
        key,
        label: `${label} '${String(year).slice(2)}`,
        spent: roundMoney(spent),
        earned: roundMoney(earned),
      };
    });
  }

  const anchorYear = Number(anchorMonth.split("-")[0]);
  const bars: ChartBar[] = [];
  for (let i = 5; i >= 0; i--) {
    const year = anchorYear - i;
    const key = String(year);
    const totals = flowTotals(expenses.filter((e) => e.date.startsWith(`${year}-`)), index);
    bars.push({ key, label: key, ...totals });
  }
  return bars;
}

/**
 * One line of a day's spend or income: a category total. Subcategories are
 * folded into their parent, so "Meal" and "Snacks" read as one Food & Dining
 * row carrying the category's name, color, and glyph.
 */
export type FlowEntry = {
  id: string;
  name: string;
  color: string;
  glyph: string;
  amount: number;
  count: number;
};

/** A single day of the trend line, broken down by spend / income category. */
export type DayFlow = {
  /** ISO date, `YYYY-MM-DD`. */
  day: string;
  /** Day of month, matching the trend chart's x label. */
  label: string;
  spent: number;
  earned: number;
  spend: FlowEntry[];
  earn: FlowEntry[];
};

/**
 * Display meta for a subcategory's parent category, falling back to the static
 * taxonomy. Subs with no known parent all collapse into one "Uncategorized" row.
 */
export function catMetaOf(sub: string, index?: CategoryIndex) {
  const catId = catOf(sub, index);
  const cat = index?.catById[catId];

  return {
    id: catId || "uncategorized",
    name: cat?.name ?? (catId || "Uncategorized"),
    color: cat?.color ?? SUB_BY_ID[sub]?.color ?? "#8b93a1",
    glyph: displayGlyph(cat?.glyph, catId),
  };
}

/** Fold one transaction into a day's per-category bucket. */
function addToBucket(bucket: Map<string, FlowEntry>, e: Expense, index?: CategoryIndex) {
  const meta = catMetaOf(e.sub, index);
  const prev = bucket.get(meta.id);

  if (prev) {
    prev.amount += e.amount;
    prev.count += 1;
    return;
  }

  bucket.set(meta.id, { ...meta, amount: e.amount, count: 1 });
}

/** Largest slice first, then alphabetical so equal amounts keep a stable order. */
function byAmountDesc(a: FlowEntry, b: FlowEntry) {
  return b.amount - a.amount || a.name.localeCompare(b.name);
}

function sealEntries(bucket?: Map<string, FlowEntry>) {
  return [...(bucket?.values() ?? [])]
    .map((entry) => ({ ...entry, amount: roundMoney(entry.amount) }))
    .sort(byAmountDesc);
}

/**
 * Per-day spend and income for `monthKey`, each broken down by category with
 * its subcategories combined. Mirrors the overview trend line: savings
 * envelopes are left out of spend. Days run 1..`upToDay` (defaults to the whole
 * month) so the series lines up with the plotted points.
 */
export function dayFlowSeries(
  expenses: Expense[],
  monthKey: string,
  index?: CategoryIndex,
  upToDay?: number,
): DayFlow[] {
  const [year, month] = monthKey.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  const last = Math.max(1, Math.min(upToDay ?? days, days));
  const spendByDay = new Map<string, Map<string, FlowEntry>>();
  const earnByDay = new Map<string, Map<string, FlowEntry>>();

  for (const e of expenses) {
    if (!inMonth(e.date, monthKey)) continue;
    const income = isIncome(e);
    if (!income && isSavings(e, index)) continue;
    const target = income ? earnByDay : spendByDay;
    let bucket = target.get(e.date);
    if (!bucket) {
      bucket = new Map();
      target.set(e.date, bucket);
    }
    addToBucket(bucket, e, index);
  }

  const out: DayFlow[] = [];
  for (let d = 1; d <= last; d++) {
    const day = `${monthKey}-${pad2(d)}`;
    const spend = sealEntries(spendByDay.get(day));
    const earn = sealEntries(earnByDay.get(day));
    out.push({
      day,
      label: String(d),
      spent: roundMoney(spend.reduce((s, x) => s + x.amount, 0)),
      earned: roundMoney(earn.reduce((s, x) => s + x.amount, 0)),
      spend,
      earn,
    });
  }

  return out;
}

export function chartActiveKey(period: ChartPeriod, anchorMonth: string) {
  if (period === "monthly") return anchorMonth;
  if (period === "daily") {
    return anchorMonth === CURRENT_MONTH_KEY ? TODAY_ISO : `${anchorMonth}-01`;
  }
  if (period === "quarterly") {
    const { year, quarter } = quarterOf(anchorMonth);
    return `${year}-Q${quarter}`;
  }
  return anchorMonth.split("-")[0];
}

export function chartBudgetForPeriod(period: ChartPeriod, monthlyBudget: number, anchorMonth: string) {
  if (!monthlyBudget) return 0;
  if (period === "monthly") return monthlyBudget;
  if (period === "daily") {
    const [year, month] = anchorMonth.split("-").map(Number);
    const days = new Date(year, month, 0).getDate();
    return monthlyBudget / days;
  }
  if (period === "quarterly") return monthlyBudget * 3;
  return monthlyBudget * 12;
}

export function chartSelectionMonth(period: ChartPeriod, key: string) {
  if (period === "monthly") return key;
  if (period === "daily") return key.slice(0, 7);
  if (period === "quarterly") {
    const [yearPart, quarterPart] = key.split("-Q");
    const quarter = Number(quarterPart);
    const month = pad2((quarter - 1) * 3 + 1);
    return `${yearPart}-${month}`;
  }
  return `${key}-01`;
}

export const inMonth = (iso: string, key: string) => iso.slice(0, 7) === key;

export function monthExpenses(expenses: Expense[], key: string) {
  return expenses.filter((e) => inMonth(e.date, key));
}

export function sumBy<T>(list: T[], keyFn: (item: T) => string) {
  const m: Record<string, number> = {};
  list.forEach((e) => {
    const k = keyFn(e);
    m[k] = (m[k] || 0) + (e as unknown as { amount: number }).amount;
  });
  return m;
}

export const isIncome = (e: Expense) => e.kind === "income";
export const isOutgoing = (e: Expense) => e.kind !== "income";

export function isRecurring(e: Pick<Expense, "recurring">) {
  return normalizeRecurring(e.recurring) !== false;
}

export function recurringSchedulesForMonth(expenses: Expense[], monthKey: string) {
  const anchors = expenses.filter((e) => isOutgoing(e) && isRecurring(e));
  const byKey = new Map<string, Expense>();
  anchors.forEach((e) => {
    const key = recurringScheduleKey(e);
    const prev = byKey.get(key);
    if (!prev || e.date > prev.date) byKey.set(key, e);
  });
  return [...byKey.values()]
    .filter((e) => recurringOccursInMonth(e, monthKey))
    .sort(
      (a, b) =>
        recurringDueDay(a, monthKey) - recurringDueDay(b, monthKey) ||
        a.note.localeCompare(b.note),
    );
}

export function catOf(sub: string, index?: CategoryIndex) {
  if (index) return catOfSub(sub, index.subById);

  return SUB_BY_ID[sub]?.catId ?? "";
}

/** Which pool a transaction belongs to for every analytics calculation. */
export type TxClass = "spend" | "savings" | "income";

/**
 * Single source of truth for splitting transactions into spend / savings /
 * income, honouring user-created categories of all three types.
 *
 * Resolution order matters:
 *
 * 1. `kind` is authoritative for income. The transaction form only offers
 *    income categories when kind is income, and the CSV importer rejects
 *    kind/type mismatches, so this needs no taxonomy lookup — and it keeps
 *    working when a category is later deleted.
 * 2. The taxonomy is authoritative for savings, via the category's `type`.
 *    This is what picks up user-created savings envelopes; the static
 *    `SUB_BY_ID` fallback below cannot see them, which is why callers that
 *    classify should always pass an index.
 * 3. Everything else is spend — including subcategories orphaned by a deleted
 *    category. An orphan's type is genuinely unrecoverable, so spend is both
 *    the safe default and the correct answer for the common case of a deleted
 *    expense category. Archived categories (see `buildCategoryIndex`) stay in
 *    the index precisely so savings history does not fall through to here.
 */
export function classifyTx(e: Expense, index?: CategoryIndex): TxClass {
  if (isIncome(e)) return "income";

  const savings = index
    ? isSavingsSub(e.sub, index.subById, index.catById)
    : catOf(e.sub) === "savings";

  return savings ? "savings" : "spend";
}

export function isSavings(e: Expense, index?: CategoryIndex) {
  return classifyTx(e, index) === "savings";
}

/** True when the transaction counts toward spending (not savings, not income). */
export function isSpend(e: Expense, index?: CategoryIndex) {
  return classifyTx(e, index) === "spend";
}

export type WalletFunding = Pick<FinancialWallet, "fundingMode" | "income" | "startingBalance">;

export function walletBalance(expenses: Expense[], wallet: WalletFunding, index?: CategoryIndex) {
  let spent = 0;
  let saved = 0;
  let earned = 0;

  for (const e of expenses) {
    if (isIncome(e)) {
      earned += e.amount;
      continue;
    }
    if (isSavings(e, index)) saved += e.amount;
    else spent += e.amount;
  }

  return wallet.startingBalance + earned - spent - saved;
}

export function monthStats(
  expenses: Expense[],
  budgets: Budgets,
  wallet: WalletFunding,
  key: string,
  index?: CategoryIndex,
  events?: LedgerEvent[],
) {
  const list: Expense[] = [];
  let spent = 0;
  let saved = 0;
  let earned = 0;
  const byCat: Record<string, number> = {};

  for (const e of expenses) {
    if (!inMonth(e.date, key)) continue;
    list.push(e);
    if (isIncome(e)) {
      earned += e.amount;
      continue;
    }

    const cat = catOf(e.sub, index);

    if (isSavings(e, index)) {
      saved += e.amount;
      if (cat) byCat[cat] = (byCat[cat] || 0) + e.amount;
      continue;
    }

    spent += e.amount;
    if (cat) byCat[cat] = (byCat[cat] || 0) + e.amount;
  }

  const envelopeBudgets = Object.fromEntries(
    Object.entries(budgets).filter(([id]) => {
      const cat = index?.catById[id];
      // A retired envelope keeps its stored budget but must stop counting
      // toward the month's totals, or the budget line never comes back down.
      if (cat) return !isIncomeCategory(cat) && !isArchivedCategory(cat);

      return id !== "income";
    }),
  );
  const spendingBudgets = Object.fromEntries(
    Object.entries(envelopeBudgets).filter(([id]) => {
      const cat = index?.catById[id];
      if (cat) return isSpendingCategory(cat);

      return id !== "savings";
    }),
  );
  const totalBudget = Object.values(envelopeBudgets).reduce((s, v) => s + v, 0);
  const spendingBudget = Object.values(spendingBudgets).reduce((s, v) => s + v, 0);
  const byCatHeld = events ? holdsByCategory(events, key) : {};
  const totalHeld = events ? totalActiveHolds(events, key) : 0;
  const balance = walletBalance(expenses, wallet, index);
  const monthlyPool = wallet.fundingMode === "monthly" ? wallet.income + earned : earned;
  const remaining =
    wallet.fundingMode === "monthly"
      ? wallet.income + earned - spent - saved
      : balance;

  return {
    list,
    spent,
    saved,
    earned,
    byCat,
    byCatHeld,
    totalHeld,
    totalBudget,
    spendingBudget,
    remaining,
    balance,
    fundingMode: wallet.fundingMode,
    monthlyPool,
  };
}
