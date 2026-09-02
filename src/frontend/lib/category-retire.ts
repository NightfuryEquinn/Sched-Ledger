import {
  isArchivedCategory,
  isArchivedSub,
  liveSubs,
  resolveCategoryType,
  type CategoryType,
} from "@/frontend/lib/categories";
import type { Category } from "@/frontend/lib/types";

export type RetireResult = { ok: true; categories: Category[] } | { ok: false; error: string };

/** Human label for a category type. */
export function typeLabel(type: CategoryType) {
  if (type === "income") return "Income";
  if (type === "savings") return "Savings";

  return "Expense";
}

/** True when history is still loading — treated as in-use so we never hard-delete. */
export function historyStillLoading(usedSubIds: Set<string> | null): usedSubIds is null {
  return usedSubIds === null;
}

/** True when any of the category's subs carries transaction history. */
export function categoryHasHistory(cat: Category, usedSubIds: Set<string>): boolean {
  return cat.subs.some((s) => usedSubIds.has(s.id));
}

/**
 * Last remaining live income or expense category cannot be retired —
 * validateTaxonomy requires at least one of each.
 */
export function isLastLiveOfType(categories: Category[], cat: Category): boolean {
  const type = resolveCategoryType(cat);
  if (type === "savings") return false;
  if (cat.archived) return false;

  return categories.filter((c) => !c.archived && resolveCategoryType(c) === type).length <= 1;
}

/**
 * Retire a category. Unused → hard delete. In use → archive. Built-in and
 * custom follow the same rule. History not loaded yet is refused rather than
 * guessed.
 */
export function retireCategory(
  categories: Category[],
  catId: string,
  usedSubIds: Set<string> | null,
): RetireResult {
  if (historyStillLoading(usedSubIds)) {
    return { ok: false, error: "Still loading your transaction history — try again in a moment." };
  }

  const cat = categories.find((c) => c.id === catId);
  if (!cat) return { ok: false, error: "Category not found." };

  if (isLastLiveOfType(categories, cat)) {
    return {
      ok: false,
      error: `Keep at least one ${typeLabel(resolveCategoryType(cat)).toLowerCase()} category.`,
    };
  }

  if (!categoryHasHistory(cat, usedSubIds)) {
    return { ok: true, categories: categories.filter((c) => c.id !== catId) };
  }

  return {
    ok: true,
    categories: categories.map((c) => (c.id === catId ? { ...c, archived: true } : c)),
  };
}

/** Bring an archived category (and its subs) back into the pickers. */
export function restoreCategory(categories: Category[], catId: string): Category[] {
  return categories.map((c) =>
    c.id === catId
      ? { ...c, archived: false, subs: c.subs.map((s) => ({ ...s, archived: false })) }
      : c,
  );
}

/** Bring an archived subcategory back into the pickers. */
export function restoreSub(categories: Category[], catId: string, subId: string): Category[] {
  return categories.map((c) => {
    if (c.id !== catId) return c;

    return {
      ...c,
      archived: false,
      subs: c.subs.map((s) => (s.id === subId ? { ...s, archived: false } : s)),
    };
  });
}

/**
 * Retire a subcategory. Unused → hard delete. In use → archive. Retiring the
 * last remaining (or last live) sub retires the parent instead. A parent left
 * with no live subs is archived so pickers never show an empty category.
 */
export function retireSub(
  categories: Category[],
  catId: string,
  subId: string,
  usedSubIds: Set<string> | null,
): RetireResult {
  if (historyStillLoading(usedSubIds)) {
    return { ok: false, error: "Still loading your transaction history — try again in a moment." };
  }

  const cat = categories.find((c) => c.id === catId);
  if (!cat) return { ok: false, error: "Category not found." };

  const sub = cat.subs.find((s) => s.id === subId);
  if (!sub) return { ok: false, error: "Subcategory not found." };

  const live = liveSubs(cat);
  const isLastLive = live.length <= 1 && !isArchivedSub(sub);
  const isLastTotal = cat.subs.length <= 1;

  if (isLastLive || isLastTotal) {
    return retireCategory(categories, catId, usedSubIds);
  }

  if (!usedSubIds.has(subId)) {
    return {
      ok: true,
      categories: categories.map((c) =>
        c.id === catId ? { ...c, subs: c.subs.filter((s) => s.id !== subId) } : c,
      ),
    };
  }

  const next = categories.map((c) => {
    if (c.id !== catId) return c;

    return {
      ...c,
      subs: c.subs.map((s) => (s.id === subId ? { ...s, archived: true } : s)),
    };
  });

  const parent = next.find((c) => c.id === catId);
  if (parent && liveSubs(parent).length === 0) {
    if (isLastLiveOfType(next, parent)) {
      return {
        ok: false,
        error: `Keep at least one ${typeLabel(resolveCategoryType(parent)).toLowerCase()} category.`,
      };
    }

    return {
      ok: true,
      categories: next.map((c) => (c.id === catId ? { ...c, archived: true } : c)),
    };
  }

  return { ok: true, categories: next };
}

/**
 * Drop a now-empty transferred source. A category with no remaining subs is
 * removed wholesale (schema requires min 1).
 */
export function removeTransferredSource(
  categories: Category[],
  source: { type: "cat"; id: string } | { type: "sub"; catId: string; subId: string },
): Category[] {
  if (source.type === "cat") {
    return categories.filter((c) => c.id !== source.id);
  }

  const next = categories.map((c) => {
    if (c.id !== source.catId) return c;

    return { ...c, subs: c.subs.filter((s) => s.id !== source.subId) };
  });

  return next.filter((c) => c.subs.length > 0);
}

/** Merge a source category's budget into dest, then drop the source key. */
export function mergeCategoryBudget(
  budgets: Record<string, number>,
  sourceCatId: string,
  destCatId: string,
  destTakesBudget: boolean,
): Record<string, number> {
  const next = { ...budgets };
  const sourceAmt = next[sourceCatId] ?? 0;
  delete next[sourceCatId];

  if (destTakesBudget) {
    next[destCatId] = (next[destCatId] ?? 0) + sourceAmt;
  }

  return next;
}

/** Live archived-sub rows that hang off a still-live parent. */
export function archivedSubsOfLiveParents(categories: Category[]) {
  const rows: Array<{ cat: Category; sub: Category["subs"][number] }> = [];

  for (const cat of categories) {
    if (isArchivedCategory(cat)) continue;
    for (const sub of cat.subs) {
      if (isArchivedSub(sub)) rows.push({ cat, sub });
    }
  }

  return rows;
}
