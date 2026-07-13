import { buildCategoryIndex, nextCategoryColor, slugId } from "@/frontend/lib/categories";
import type { Category } from "@/frontend/lib/types";
import { DEFAULT_GLYPH } from "@/lib/glyphs";

const TAXONOMY_ID = /^[a-z0-9_]+$/;

function isValidTaxonomyId(id: string): boolean {
  return TAXONOMY_ID.test(id);
}

function categoryKind(cat: Category): "expense" | "income" {
  return cat.type === "income" || cat.id === "income" ? "income" : "expense";
}

function incomeCategory(categories: Category[]): Category {
  return (
    categories.find((c) => c.type === "income") ??
    categories.find((c) => c.id === "income") ??
    categories[0]
  );
}

function expenseCategories(categories: Category[]): Category[] {
  return categories.filter((c) => categoryKind(c) !== "income");
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
    subName: string;
    subId: string;
  },
): ResolveImportSubResult {
  const subName = opts.subName.trim();
  if (!subName) return { error: "Subcategory is required." };

  const catName = opts.catName.trim();
  const catId = opts.catId.trim();
  const subId = opts.subId.trim();

  if (catId && !isValidTaxonomyId(catId)) {
    return { error: `Invalid category ID "${catId}".` };
  }
  if (subId && !isValidTaxonomyId(subId)) {
    return { error: `Invalid subcategory ID "${subId}".` };
  }

  let next = categories;
  let newCategory = false;
  let newSubcategory = false;

  if (subId && subIdTaken(next, subId)) {
    const existing = buildCategoryIndex(next).subById[subId]!;
    const cat = findCategoryById(next, existing.catId);
    if (!cat) return { error: `Subcategory ID "${subId}" is invalid.` };
    const kindOk = opts.kind === "income" ? categoryKind(cat) === "income" : categoryKind(cat) !== "income";
    if (kindOk) {
      return { categories: next, subId, newCategory: false, newSubcategory: false };
    }
    return { error: `Subcategory ID "${subId}" belongs to a different category type.` };
  }

  if (opts.kind === "income") {
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
        type: "expense",
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
        type: "expense",
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
      type: "expense",
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
