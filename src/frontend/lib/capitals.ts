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
