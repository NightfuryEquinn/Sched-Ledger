import type { Category } from "@/frontend/lib/types";

export type CategoryIndex = {
  categories: Category[];
  catById: Record<string, Category>;
  subById: Record<string, { id: string; name: string; catId: string; color: string }>;
  expenseCategories: Category[];
  incomeCategory: Category;
};

/* Cool muted palette for user-created categories. */
const PALETTE = ["#4a6fa5", "#4f8a7b", "#7a6fa5", "#5b7a8a", "#a06f95", "#6f8b6f", "#64748b", "#5b5f9e"];

export function buildCategoryIndex(categories: Category[]): CategoryIndex {
  if (!categories.length) {
    return {
      categories: [],
      catById: {},
      subById: {},
      expenseCategories: [],
      incomeCategory: {
        id: "income",
        name: "Income",
        color: "#6f8b6f",
        glyph: "💵",
        type: "income",
        subs: [],
      },
    };
  }

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const subById: CategoryIndex["subById"] = {};
  categories.forEach((c) =>
    c.subs.forEach((s) => {
      subById[s.id] = { ...s, catId: c.id, color: c.color };
    }),
  );
  const incomeCategory =
    categories.find((c) => c.type === "income") ??
    categories.find((c) => c.id === "income") ??
    categories[0];
  const expenseCategories = categories.filter((c) => c.type !== "income");
  return { categories, catById, subById, expenseCategories, incomeCategory };
}

export function slugId(prefix: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return `${prefix}_${base || "item"}_${Math.random().toString(36).slice(2, 6)}`;
}

export function nextCategoryColor(categories: Category[]) {
  const used = new Set(categories.map((c) => c.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[categories.length % PALETTE.length];
}

export function catOfSub(sub: string, subById: CategoryIndex["subById"]) {
  return subById[sub]?.catId ?? "food";
}

export function isSavingsSub(sub: string, subById: CategoryIndex["subById"]) {
  return catOfSub(sub, subById) === "savings";
}
