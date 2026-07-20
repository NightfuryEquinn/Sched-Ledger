import { describe, expect, test } from "bun:test";
import { buildCategoryIndex, isSavingsCategory, resolveCategoryType } from "@/frontend/lib/categories";
import { monthStats } from "@/frontend/lib/stats";
import type { Category, Expense } from "@/frontend/lib/types";

const categories: Category[] = [
  {
    id: "food",
    name: "Food",
    color: "#4a6fa5",
    glyph: "🍽️",
    type: "expense",
    subs: [{ id: "groceries", name: "Groceries" }],
  },
  {
    id: "savings",
    name: "Savings",
    color: "#7a6fa5",
    glyph: "🐷",
    type: "expense", // legacy stored type — should normalize to savings
    builtin: true,
    subs: [{ id: "saving", name: "Saving" }],
  },
  {
    id: "cat_emergency_fund",
    name: "Emergency Fund",
    color: "#5b7a8a",
    glyph: "🏦",
    type: "savings",
    subs: [{ id: "sub_emergency", name: "Emergency" }],
  },
  {
    id: "cat_side_hustle",
    name: "Side Hustle",
    color: "#6f8b6f",
    glyph: "💼",
    type: "income",
    subs: [{ id: "sub_freelance", name: "Freelance" }],
  },
  {
    id: "income",
    name: "Income",
    color: "#6f8b6f",
    glyph: "💵",
    type: "income",
    subs: [{ id: "salary", name: "Salary" }],
  },
];

const index = buildCategoryIndex(categories);
const wallet = { fundingMode: "monthly" as const, income: 3000, startingBalance: 0 };

/** Build a minimal expense for month-stats tests. */
function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "e1",
    date: "2026-07-15",
    amount: 100,
    sub: "groceries",
    note: "",
    kind: "expense",
    walletId: "w1",
    ...overrides,
  };
}

describe("category type normalization", () => {
  test("legacy savings id normalizes to savings type", () => {
    expect(resolveCategoryType({ id: "savings", type: "expense" })).toBe("savings");
    expect(isSavingsCategory(index.catById.savings)).toBe(true);
    expect(index.savingsCategories.map((c) => c.id).sort()).toEqual([
      "cat_emergency_fund",
      "savings",
    ]);
    expect(index.spendingCategories.map((c) => c.id)).toEqual(["food"]);
    expect(index.incomeCategories.map((c) => c.id).sort()).toEqual([
      "cat_side_hustle",
      "income",
    ]);
  });
});

describe("monthStats category totals", () => {
  test("includes builtin and custom savings in saved/byCat without counting as spent", () => {
    const expenses = [
      expense({ id: "food1", amount: 80, sub: "groceries" }),
      expense({ id: "save1", amount: 250, sub: "saving" }),
      expense({ id: "save2", amount: 100, sub: "sub_emergency" }),
      expense({
        id: "inc1",
        amount: 500,
        sub: "sub_freelance",
        kind: "income",
      }),
    ];

    const st = monthStats(
      expenses,
      { food: 500, savings: 300, cat_emergency_fund: 200 },
      wallet,
      "2026-07",
      index,
    );

    expect(st.spent).toBe(80);
    expect(st.saved).toBe(350);
    expect(st.earned).toBe(500);
    expect(st.byCat).toEqual({
      food: 80,
      savings: 250,
      cat_emergency_fund: 100,
    });
    expect(st.totalBudget).toBe(1000);
    expect(st.spendingBudget).toBe(500);
  });

  test("does not dump orphaned subcategories into food", () => {
    const expenses = [expense({ id: "orphan", amount: 40, sub: "missing_sub" })];
    const st = monthStats(expenses, { food: 500 }, wallet, "2026-07", index);

    expect(st.spent).toBe(40);
    expect(st.byCat).toEqual({});
  });
});
