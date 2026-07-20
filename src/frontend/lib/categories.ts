import type { Category } from "@/frontend/lib/types";

export type CategoryType = "expense" | "income" | "savings";

export type CategoryIndex = {
  categories: Category[];
  catById: Record<string, Category>;
  subById: Record<string, { id: string; name: string; catId: string; color: string }>;
  /** Non-income categories (spending + savings envelopes). */
  expenseCategories: Category[];
  /** True spending categories only (excludes savings and income). */
  spendingCategories: Category[];
  /** Savings envelope categories. */
  savingsCategories: Category[];
  /** All income categories. */
  incomeCategories: Category[];
  /** Primary income category (first income entry). */
  incomeCategory: Category;
};

/* Cool muted palette for user-created categories. */
const PALETTE = ["#4a6fa5", "#4f8a7b", "#7a6fa5", "#5b7a8a", "#a06f95", "#6f8b6f", "#64748b", "#5b5f9e"];

/**
 * Resolve canonical category type.
 * Legacy taxonomies stored builtin Savings as expense — treat id "savings" as savings.
 */
export function resolveCategoryType(cat: Pick<Category, "id" | "type">): CategoryType {
  if (cat.type === "income" || cat.id === "income") return "income";
  if (cat.type === "savings" || cat.id === "savings") return "savings";

  return "expense";
}

/** True when the category is a savings envelope. */
export function isSavingsCategory(cat?: Pick<Category, "id" | "type"> | null): boolean {
  return Boolean(cat && resolveCategoryType(cat) === "savings");
}

/** True when the category is income. */
export function isIncomeCategory(cat?: Pick<Category, "id" | "type"> | null): boolean {
  return Boolean(cat && resolveCategoryType(cat) === "income");
}

/** True when the category is true spending (not income/savings). */
export function isSpendingCategory(cat?: Pick<Category, "id" | "type"> | null): boolean {
  return Boolean(cat && resolveCategoryType(cat) === "expense");
}

/** Normalize a category so type is always explicit and canonical. */
export function normalizeCategory(cat: Category): Category {
  return { ...cat, type: resolveCategoryType(cat) };
}

/** Build a category index (maps + expense/income/savings partitions) from a taxonomy tree. */
export function buildCategoryIndex(categories: Category[]): CategoryIndex {
  const emptyIncome: Category = {
    id: "income",
    name: "Income",
    color: "#6f8b6f",
    glyph: "💵",
    type: "income",
    subs: [],
  };

  if (!categories.length) {
    return {
      categories: [],
      catById: {},
      subById: {},
      expenseCategories: [],
      spendingCategories: [],
      savingsCategories: [],
      incomeCategories: [],
      incomeCategory: emptyIncome,
    };
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const sorted = [...categories]
    .map((c) => {
      const normalized = normalizeCategory(c);

      return { ...normalized, subs: [...normalized.subs].sort(byName) };
    })
    .sort(byName);

  const catById = Object.fromEntries(sorted.map((c) => [c.id, c]));
  const subById: CategoryIndex["subById"] = {};
  sorted.forEach((c) =>
    c.subs.forEach((s) => {
      subById[s.id] = { ...s, catId: c.id, color: c.color };
    }),
  );

  const incomeCategories = sorted.filter((c) => isIncomeCategory(c));
  const savingsCategories = sorted.filter((c) => isSavingsCategory(c));
  const spendingCategories = sorted.filter((c) => isSpendingCategory(c));
  const expenseCategories = sorted.filter((c) => !isIncomeCategory(c));
  const incomeCategory = incomeCategories[0] ?? emptyIncome;

  return {
    categories: sorted,
    catById,
    subById,
    expenseCategories,
    spendingCategories,
    savingsCategories,
    incomeCategories,
    incomeCategory,
  };
}

/** Build a stable slug id from a display name. */
export function slugId(prefix: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);

  return `${prefix}_${base || "item"}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Pick the next unused palette color for a new category. */
export function nextCategoryColor(categories: Category[]) {
  const used = new Set(categories.map((c) => c.color));

  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[categories.length % PALETTE.length] ?? PALETTE[0]!;
}

/** Parent category id for a subcategory, or empty when unknown/orphaned. */
export function catOfSub(sub: string, subById: CategoryIndex["subById"]) {
  return subById[sub]?.catId ?? "";
}

/** True when the subcategory belongs to a savings envelope. */
export function isSavingsSub(
  sub: string,
  subById: CategoryIndex["subById"],
  catById?: CategoryIndex["catById"],
) {
  const catId = catOfSub(sub, subById);
  if (!catId) return false;
  if (catById?.[catId]) return isSavingsCategory(catById[catId]);

  return catId === "savings";
}
