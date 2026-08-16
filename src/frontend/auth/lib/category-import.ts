import {
  buildCategoryIndex,
  isArchivedCategory,
  isIncomeCategory,
  isSavingsCategory,
  nextCategoryColor,
  slugId,
  type CategoryType,
} from "@/frontend/lib/categories";
import type { Category } from "@/frontend/lib/types";
import { DEFAULT_GLYPH } from "@/lib/glyphs";

const TAXONOMY_ID = /^[a-z0-9_]+$/;

/** True when an id matches taxonomy slug rules. */
function isValidTaxonomyId(id: string): boolean {
  return TAXONOMY_ID.test(id);
}

/** Expense/savings vs income kind for import matching. */
function categoryKind(cat: Category): "expense" | "income" {
  return isIncomeCategory(cat) ? "income" : "expense";
}

/**
 * Normalize a CSV CategoryType cell. Unknown or missing values fall back to
 * "expense", which is exactly how imports behaved before the column existed.
 */
function parseCategoryType(raw: string): CategoryType {
  const value = raw.trim().toLowerCase();
  if (value === "income") return "income";
  if (value === "savings") return "savings";

  return "expense";
}

/**
 * A row's declared category type must agree with its transaction kind.
 * Income only ever pairs with income kind. Expense only ever pairs with
 * expense kind. Savings pairs with BOTH: an expense-kind row is a deposit,
 * an income-kind row is a withdrawal back out of the envelope.
 */
function typeMatchesKind(type: CategoryType, kind: "expense" | "income"): boolean {
  if (type === "savings") return true;

  return kind === "income" ? type === "income" : type !== "income";
}

/** Live categories only — imports must never attach rows to a retired category. */
function selectable(categories: Category[]): Category[] {
  return categories.filter((c) => !isArchivedCategory(c));
}

/** Primary income category used when importing income rows. */
function incomeCategory(categories: Category[]): Category {
  const live = selectable(categories);

  return (
    live.find((c) => isIncomeCategory(c)) ??
    live.find((c) => c.id === "income") ??
    live[0] ??
    categories[0]
  );
}

/** Non-income categories (spending + savings) for expense imports. */
function expenseCategories(categories: Category[]): Category[] {
  return selectable(categories).filter((c) => categoryKind(c) !== "income");
}

function findCategoryById(categories: Category[], id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

function findExpenseCategoryByName(categories: Category[], name: string): Category | undefined {
  const lower = name.trim().toLowerCase();
  if (!lower) return undefined;
  return expenseCategories(categories).find((c) => c.name.toLowerCase() === lower);
}

function findSubInCategory(cat: Category, subName: string, subId: string) {
  if (subId) {
    const byId = cat.subs.find((s) => s.id === subId);
    if (byId) return byId;
  }
  const lower = subName.trim().toLowerCase();
  if (!lower) return undefined;
  return cat.subs.find((s) => s.name.toLowerCase() === lower);
}

function findExpenseSubByName(categories: Category[], subName: string): { cat: Category; subId: string } | null {
  const lower = subName.trim().toLowerCase();
  if (!lower) return null;
  for (const cat of expenseCategories(categories)) {
    const sub = cat.subs.find((s) => s.name.toLowerCase() === lower);
    if (sub) return { cat, subId: sub.id };
  }
  return null;
}

function subIdTaken(categories: Category[], id: string): boolean {
  return Boolean(buildCategoryIndex(categories).subById[id]);
}

export type ResolveImportSubResult =
  | { categories: Category[]; subId: string; newCategory: boolean; newSubcategory: boolean }
  | { error: string };

export function resolveImportSub(
  categories: Category[],
  opts: {
    kind: "expense" | "income";
    catName: string;
    catId: string;
    /** Optional CategoryType column; absent means "expense", the legacy default. */
    catType?: string;
    subName: string;
    subId: string;
  },
): ResolveImportSubResult {
  const subName = opts.subName.trim();
  if (!subName) return { error: "Subcategory is required." };

  const catName = opts.catName.trim();
  const catId = opts.catId.trim();
  const subId = opts.subId.trim();
  const declaredType = parseCategoryType(opts.catType ?? "");

  if (opts.catType?.trim() && !typeMatchesKind(declaredType, opts.kind)) {
    return {
      error: `Category type "${declaredType}" does not match a ${opts.kind} transaction.`,
    };
  }

  /** Type for a category this import creates, honouring the CSV's declaration. */
  const newCategoryType: CategoryType =
    opts.kind === "income" ? (declaredType === "savings" ? "savings" : "income") : declaredType;
  /** An income-kind row declared savings is a withdrawal, not plain income. */
  const isWithdrawal = opts.kind === "income" && declaredType === "savings";

  if (catId && !isValidTaxonomyId(catId)) {
    return { error: `Invalid category ID "${catId}".` };
  }
  if (subId && !isValidTaxonomyId(subId)) {
    return { error: `Invalid subcategory ID "${subId}".` };
  }

  let next = categories;
  let newCategory = false;

  if (subId && subIdTaken(next, subId)) {
    const existing = buildCategoryIndex(next).subById[subId]!;
    const cat = findCategoryById(next, existing.catId);
    if (!cat) return { error: `Subcategory ID "${subId}" is invalid.` };
    const kindOk =
      isSavingsCategory(cat) ||
      (opts.kind === "income" ? categoryKind(cat) === "income" : categoryKind(cat) !== "income");
    if (kindOk) {
      return { categories: next, subId, newCategory: false, newSubcategory: false };
    }
    return { error: `Subcategory ID "${subId}" belongs to a different category type.` };
  }

  if (opts.kind === "income" && !isWithdrawal) {
    const inc = incomeCategory(next);
    const existing = findSubInCategory(inc, subName, subId);
    if (existing) {
      return { categories: next, subId: existing.id, newCategory: false, newSubcategory: false };
    }

    const id = subId && !subIdTaken(next, subId) ? subId : slugId("sub", subName);
    if (subIdTaken(next, id)) {
      return { error: `Subcategory ID "${id}" already exists.` };
    }

    next = next.map((c) =>
      c.id === inc.id ? { ...c, subs: [...c.subs, { id, name: subName }] } : c,
    );
    return { categories: next, subId: id, newCategory: false, newSubcategory: true };
  }

  if (subId && !subIdTaken(next, subId)) {
    /* subId provided but not found yet — resolved when creating or matching parent category. */
  } else if (!subId) {
    const global = findExpenseSubByName(next, subName);
    if (global) {
      return { categories: next, subId: global.subId, newCategory: false, newSubcategory: false };
    }
  }

  let targetCat: Category | undefined;

  if (catId) {
    // Explicit id matches archived categories too: re-importing your own export
    // should land history back in the category it came from. Name matching
    // (below) stays restricted to live categories.
    targetCat = findCategoryById(next, catId);
    if (targetCat && categoryKind(targetCat) === "income") {
      return { error: `Category ID "${catId}" is an income category.` };
    }
    if (!targetCat) {
      const name = catName || subName;
      targetCat = {
        id: catId,
        name,
        color: nextCategoryColor(next),
        glyph: DEFAULT_GLYPH,
        type: newCategoryType,
        builtin: false,
        subs: [],
      };
      next = [...next, targetCat];
      newCategory = true;
    }
  } else if (catName) {
    targetCat = findExpenseCategoryByName(next, catName);
    if (!targetCat) {
      targetCat = {
        id: slugId("cat", catName),
        name: catName,
        color: nextCategoryColor(next),
        glyph: DEFAULT_GLYPH,
        type: newCategoryType,
        builtin: false,
        subs: [],
      };
      next = [...next, targetCat];
      newCategory = true;
    }
  } else {
    const name = subName;
    targetCat = {
      id: slugId("cat", name),
      name,
      color: nextCategoryColor(next),
      glyph: DEFAULT_GLYPH,
      type: newCategoryType,
      builtin: false,
      subs: [],
    };
    next = [...next, targetCat];
    newCategory = true;
  }

  const resolvedCat = findCategoryById(next, targetCat.id)!;
  const existingSub = findSubInCategory(resolvedCat, subName, subId);
  if (existingSub) {
    return { categories: next, subId: existingSub.id, newCategory, newSubcategory: false };
  }

  const newSub = {
    id: subId && !subIdTaken(next, subId) ? subId : slugId("sub", subName),
    name: subName,
  };
  if (subIdTaken(next, newSub.id)) {
    return { error: `Subcategory ID "${newSub.id}" already exists.` };
  }

  next = next.map((c) =>
    c.id === resolvedCat.id ? { ...c, subs: [...c.subs, newSub] } : c,
  );
  return { categories: next, subId: newSub.id, newCategory, newSubcategory: true };
}
