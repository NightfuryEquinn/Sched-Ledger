import { CAPITAL_TEMPLATES, type CapitalTemplate } from "@/frontend/lib/capitalTemplates";
import { slugId } from "@/frontend/lib/categories";
import type { CapitalItem, CapitalPlan, CapitalTemplateId } from "@/frontend/lib/types";

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

/** Unpaid total minus initial budget, floored at zero. */
export function planRemainingNeed(plan: CapitalPlan): number {
  return Math.max(0, planUnpaidTotal(plan) - (plan.initialBudget ?? 0));
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

/**
 * Monthly amount still needed: remaining need ÷ months until target.
 * Null when months cannot be computed (no/past target).
 */
export function planMonthlySave(plan: CapitalPlan, today: Date = new Date()): number | null {
  const months = planMonthsUntilTarget(plan, today);

  if (months === null) return null;

  return planRemainingNeed(plan) / months;
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
