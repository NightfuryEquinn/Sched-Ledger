import { describe, expect, test } from "bun:test";
import {
  archivedSubsOfLiveParents,
  isLastLiveOfType,
  mergeCategoryBudget,
  removeTransferredSource,
  restoreCategory,
  restoreSub,
  retireCategory,
  retireSub,
} from "@/frontend/lib/category-retire";
import type { Category } from "@/frontend/lib/types";

const TAXONOMY: Category[] = [
  {
    id: "food",
    name: "Food",
    color: "#5b7a8a",
    glyph: "🍽️",
    type: "expense",
    builtin: true,
    subs: [
      { id: "groceries", name: "Groceries" },
      { id: "meal", name: "Meal" },
    ],
  },
  {
    id: "transport",
    name: "Transport",
    color: "#6f8b6f",
    glyph: "🚗",
    type: "expense",
    builtin: true,
    subs: [{ id: "petrol", name: "Petrol" }],
  },
  {
    id: "savings",
    name: "Savings",
    color: "#7a6fa5",
    glyph: "🐷",
    type: "savings",
    builtin: true,
    subs: [{ id: "saving", name: "Saving" }],
  },
  {
    id: "income",
    name: "Income",
    color: "#6f8b6f",
    glyph: "💵",
    type: "income",
    builtin: true,
    subs: [
      { id: "salary", name: "Salary" },
      { id: "bonus", name: "Bonus" },
    ],
  },
];

describe("retireCategory", () => {
  test("hard-deletes an unused built-in when another expense category remains", () => {
    const result = retireCategory(TAXONOMY, "food", new Set());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories.map((c) => c.id)).not.toContain("food");
  });

  test("archives a built-in that has transaction history", () => {
    const result = retireCategory(TAXONOMY, "food", new Set(["groceries"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const food = result.categories.find((c) => c.id === "food");
    expect(food?.archived).toBe(true);
  });

  test("refuses to retire the last live expense category", () => {
    const only = TAXONOMY.filter((c) => c.id !== "food");
    const result = retireCategory(only, "transport", new Set());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("expense");
  });

  test("refuses while history is still loading", () => {
    const result = retireCategory(TAXONOMY, "food", null);

    expect(result.ok).toBe(false);
  });

  test("allows archiving the last savings category", () => {
    const result = retireCategory(TAXONOMY, "savings", new Set(["saving"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories.find((c) => c.id === "savings")?.archived).toBe(true);
  });
});

describe("retireSub", () => {
  test("hard-deletes an unused sub when siblings remain", () => {
    const result = retireSub(TAXONOMY, "food", "meal", new Set());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const food = result.categories.find((c) => c.id === "food");
    expect(food?.subs.map((s) => s.id)).toEqual(["groceries"]);
  });

  test("archives an in-use sub without retiring the parent", () => {
    const result = retireSub(TAXONOMY, "food", "groceries", new Set(["groceries"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const food = result.categories.find((c) => c.id === "food")!;
    expect(food.archived).toBeFalsy();
    expect(food.subs.find((s) => s.id === "groceries")?.archived).toBe(true);
    expect(food.subs.find((s) => s.id === "meal")?.archived).toBeFalsy();
  });

  test("retiring the last live sub archives the parent when it has history", () => {
    const result = retireSub(TAXONOMY, "transport", "petrol", new Set(["petrol"]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories.find((c) => c.id === "transport")?.archived).toBe(true);
  });

  test("retiring the last unused sub deletes the parent", () => {
    const result = retireSub(TAXONOMY, "transport", "petrol", new Set());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories.map((c) => c.id)).not.toContain("transport");
  });
});

describe("restore and transfer cleanup", () => {
  test("restoreCategory unarchives the parent and every sub", () => {
    const archived = TAXONOMY.map((c) =>
      c.id === "food"
        ? {
            ...c,
            archived: true,
            subs: c.subs.map((s) => ({ ...s, archived: true })),
          }
        : c,
    );
    const next = restoreCategory(archived, "food");
    const food = next.find((c) => c.id === "food")!;

    expect(food.archived).toBe(false);
    expect(food.subs.every((s) => !s.archived)).toBe(true);
  });

  test("restoreSub unarchives a sub on a live parent", () => {
    const withArchivedSub = TAXONOMY.map((c) =>
      c.id === "food"
        ? { ...c, subs: c.subs.map((s) => (s.id === "groceries" ? { ...s, archived: true } : s)) }
        : c,
    );
    const next = restoreSub(withArchivedSub, "food", "groceries");
    const food = next.find((c) => c.id === "food")!;

    expect(food.subs.find((s) => s.id === "groceries")?.archived).toBe(false);
  });

  test("removeTransferredSource drops an emptied category", () => {
    const next = removeTransferredSource(TAXONOMY, { type: "cat", id: "food" });

    expect(next.map((c) => c.id)).not.toContain("food");
  });

  test("removeTransferredSource drops a sub and the parent when no subs remain", () => {
    const next = removeTransferredSource(TAXONOMY, {
      type: "sub",
      catId: "transport",
      subId: "petrol",
    });

    expect(next.map((c) => c.id)).not.toContain("transport");
  });

  test("archivedSubsOfLiveParents lists only subs of live parents", () => {
    const mixed = TAXONOMY.map((c) => {
      if (c.id === "food") {
        return { ...c, subs: c.subs.map((s) => (s.id === "meal" ? { ...s, archived: true } : s)) };
      }
      if (c.id === "transport") return { ...c, archived: true };

      return c;
    });
    const rows = archivedSubsOfLiveParents(mixed);

    expect(rows.map((r) => r.sub.id)).toEqual(["meal"]);
  });

  test("isLastLiveOfType ignores archived siblings", () => {
    const archivedTransport = TAXONOMY.map((c) =>
      c.id === "transport" ? { ...c, archived: true } : c,
    );

    expect(isLastLiveOfType(archivedTransport, archivedTransport[0]!)).toBe(true);
  });

  test("mergeCategoryBudget adds source into dest then drops the source key", () => {
    const next = mergeCategoryBudget({ food: 40, transport: 10 }, "food", "transport", true);

    expect(next).toEqual({ transport: 50 });
  });

  test("mergeCategoryBudget drops the source key when dest does not take a budget", () => {
    const next = mergeCategoryBudget({ food: 40, income: 0 }, "food", "income", false);

    expect(next).toEqual({ income: 0 });
  });
});
