import { CAPITAL_TEMPLATES, type CapitalTemplate } from "@/frontend/lib/capitalTemplates";
import { slugId, type CategoryIndex } from "@/frontend/lib/categories";
import { roundMoney } from "@/frontend/lib/data";
import { classifyTx } from "@/frontend/lib/stats";
import type { CapitalItem, CapitalPlan, CapitalTemplateId, Expense } from "@/frontend/lib/types";

/** Sum of every item's estimated cost. */
export function planTotal(plan: CapitalPlan): number {
  return plan.items.reduce((s, i) => s + i.estimatedCost, 0);
}

/** Sum of actual cost for items already marked paid (falls back to estimate). */
export function planPaidTotal(plan: CapitalPlan): number {
  return plan.items
    .filter((i) => i.paid)
    .reduce((s, i) => s + (i.actualCost ?? i.estimatedCost), 0);
}

/** Sum of estimated cost for items not yet paid. */
export function planUnpaidTotal(plan: CapitalPlan): number {
  return plan.items
    .filter((i) => !i.paid)
    .reduce((s, i) => s + i.estimatedCost, 0);
}

/** Plan budget (initialBudget), treating missing as 0. */
export function planBudget(plan: CapitalPlan): number {
  return plan.initialBudget ?? 0;
}

/** True when paid items exceed the plan budget. */
export function planIsOverbudget(plan: CapitalPlan): boolean {
  return planPaidTotal(plan) > planBudget(plan);
}

/**
 * Net savings assigned to a plan: deposits minus withdrawals with matching capitalPlanId.
 */
export function planUnspentTotal(plan: CapitalPlan, txns: Expense[], index?: CategoryIndex): number {
  let total = 0;

  for (const e of txns) {
    if (e.capitalPlanId !== plan.id) continue;
    const cls = classifyTx(e, index);
    if (cls !== "savings" && cls !== "withdrawal") continue;
    total += cls === "savings" ? e.amount : -e.amount;
  }

  return roundMoney(total);
}

/**
 * Remaining budget to save: max(0, budget − paid − unspent).
 * Paid items and capital-assigned savings both reduce the monthly save need.
 */
export function planRemainingNeed(
  plan: CapitalPlan,
  txns: Expense[] = [],
  index?: CategoryIndex,
): number {
  const unspent = txns.length ? planUnspentTotal(plan, txns, index) : 0;

  return Math.max(0, planBudget(plan) - planPaidTotal(plan) - unspent);
}

/**
 * Paid ÷ budget for the donut label.
 * Null when there is no budget yet.
 */
export function planBudgetProgress(plan: CapitalPlan): number | null {
  const budget = planBudget(plan);

  if (budget <= 0) return null;

  return planPaidTotal(plan) / budget;
}

/** YYYY-MM key for a Date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whole months from one YYYY-MM key to another (may be negative). */
function monthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);

  return (ty! - fy!) * 12 + (tm! - fm!);
}

/**
 * Whole calendar months until the plan's target month.
 * Returns null when there is no target or the target month is in the past.
 * Minimum 1 when the target is this month or later.
 */
export function planMonthsUntilTarget(plan: CapitalPlan, today: Date = new Date()): number | null {
  if (!plan.targetDate) return null;

  const diff = monthsBetween(monthKey(today), plan.targetDate.slice(0, 7));

  if (diff < 0) return null;

  return Math.max(1, diff);
}

/** True when the plan has a target date in the current month or later. */
export function planIsUpcoming(plan: CapitalPlan, today: Date = new Date()): boolean {
  return planMonthsUntilTarget(plan, today) !== null;
}

/**
 * Monthly amount still needed: (budget − paid − unspent) ÷ months until target.
 * Null when overbudget, or when months cannot be computed (no/past target).
 */
export function planMonthlySave(
  plan: CapitalPlan,
  today: Date = new Date(),
  txns: Expense[] = [],
  index?: CategoryIndex,
): number | null {
  if (planIsOverbudget(plan)) return null;

  const months = planMonthsUntilTarget(plan, today);

  if (months === null) return null;

  return planRemainingNeed(plan, txns, index) / months;
}

/** Sum of monthly save across plans (overbudget plans contribute 0). */
export function plansTotalMonthlySave(
  plans: CapitalPlan[],
  today: Date = new Date(),
  txns: Expense[] = [],
  index?: CategoryIndex,
): number {
  return plans.reduce((sum, p) => {
    const monthly = planMonthlySave(p, today, txns, index);

    return sum + (monthly ?? 0);
  }, 0);
}

/** Fraction of items marked paid, or null when the plan has no items yet. */
export function planProgress(plan: CapitalPlan): number | null {
  if (!plan.items.length) return null;
  return plan.items.filter((i) => i.paid).length / plan.items.length;
}

function itemId(name: string, existing: CapitalItem[]) {
  const base = slugId("item", name);
  if (!existing.some((i) => i.id === base)) return base;
  return `${base}_${Date.now().toString(36).slice(-4)}`;
}

/** Build a new item list for a fresh item name, avoiding id collisions. */
export function newCapitalItem(name: string, existing: CapitalItem[]): CapitalItem {
  return {
    id: itemId(name, existing),
    name,
    estimatedCost: 0,
    paid: false,
  };
}

/** Prefill a fresh plan's items from a built-in template. Names only — fully editable after. */
export function instantiateFromTemplate(templateId: CapitalTemplateId): CapitalItem[] {
  const template: CapitalTemplate | undefined = CAPITAL_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return [];

  const items: CapitalItem[] = [];
  for (const name of template.items) {
    items.push(newCapitalItem(name, items));
  }
  return items;
}
