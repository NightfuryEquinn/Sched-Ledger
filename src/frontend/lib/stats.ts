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
import { catOfSub, isIncomeCategory, isSavingsSub, isSpendingCategory } from "./categories";
import { CURRENT_MONTH_KEY, SUB_BY_ID, TODAY_ISO, monthLabel, monthsWindow } from "./data";
import type { Budgets, Expense, FinancialWallet, LedgerEvent } from "./types";
import { holdsByCategory, totalActiveHolds } from "./envelope-holds";

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
export type ChartBar = { key: string; label: string; spent: number };

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

function outgoingSpend(expenses: Expense[], index?: CategoryIndex) {
  return expenses.filter((e) => isOutgoing(e) && !isSavings(e, index));
}

function roundSpent(expenses: Expense[]) {
  return Math.round(expenses.reduce((s, e) => s + e.amount, 0));
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
      const spent = roundSpent(outgoingSpend(expenses.filter((e) => e.date === key), index));
      bars.push({ key, label: String(d), spent });
    }
    return bars;
  }

  if (period === "monthly") {
    return monthsWindow(anchorMonth).map((mo) => {
      const spent = roundSpent(outgoingSpend(monthExpenses(expenses, mo.key), index));
      return { key: mo.key, label: monthLabel(mo.key).split(" ")[0], spent };
    });
  }

  if (period === "quarterly") {
    return quartersWindow(anchorMonth).map(({ year, quarter, key, label }) => {
      const startM = (quarter - 1) * 3 + 1;
      let spent = 0;
      for (let i = 0; i < 3; i++) {
        const monthKey = `${year}-${pad2(startM + i)}`;
        spent += roundSpent(outgoingSpend(monthExpenses(expenses, monthKey), index));
      }
      return { key, label: `${label} '${String(year).slice(2)}`, spent };
    });
  }

  const anchorYear = Number(anchorMonth.split("-")[0]);
  const bars: ChartBar[] = [];
  for (let i = 5; i >= 0; i--) {
    const year = anchorYear - i;
    const key = String(year);
    const spent = roundSpent(
      outgoingSpend(expenses.filter((e) => e.date.startsWith(`${year}-`)), index),
    );
    bars.push({ key, label: key, spent });
  }
  return bars;
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

export function isSavings(e: Expense, index?: CategoryIndex) {
  if (isIncome(e)) return false;
  if (index) return isSavingsSub(e.sub, index.subById, index.catById);

  return catOf(e.sub) === "savings";
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
      if (cat) return !isIncomeCategory(cat);

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
