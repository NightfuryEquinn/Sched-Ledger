import { SUB_BY_ID } from "./data";
import type { Budgets, Expense } from "./types";

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

export const catOf = (sub: string) => SUB_BY_ID[sub]!.catId;
export const isSavings = (e: Expense) => catOf(e.sub) === "savings";

export function monthStats(
  expenses: Expense[],
  budgets: Budgets,
  income: number,
  key: string,
) {
  const list = monthExpenses(expenses, key);
  const spent = list.filter((e) => !isSavings(e)).reduce((s, e) => s + e.amount, 0);
  const saved = list.filter(isSavings).reduce((s, e) => s + e.amount, 0);
  const byCat = sumBy(list, (e) => catOf(e.sub));
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  return { list, spent, saved, byCat, totalBudget, remaining: income - spent - saved };
}
