import { describe, expect, test } from "bun:test";
import {
  instantiateFromTemplate,
  planBudgetProgress,
  planIsOverbudget,
  planMonthlySave,
  planMonthsUntilTarget,
  planPaidTotal,
  planProgress,
  planRemainingNeed,
  planTotal,
  planUnpaidTotal,
  planUnspentTotal,
  plansTotalMonthlySave,
} from "@/frontend/lib/capitals";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import type { CapitalPlan, Category, Expense } from "@/frontend/lib/types";

const SAVINGS_CATEGORIES: Category[] = [
  {
    id: "cat_emergency",
    name: "Emergency Fund",
    color: "#7a6fa5",
    glyph: "🛟",
    type: "savings",
    subs: [{ id: "sub_rainy_day", name: "Rainy Day" }],
  },
];

const INDEX = buildCategoryIndex(SAVINGS_CATEGORIES);

function savingsTx(
  date: string,
  amount: number,
  capitalPlanId?: string,
  kind: "expense" | "income" = "expense",
): Expense {
  return {
    id: `${date}-${amount}-${capitalPlanId ?? "piggy"}`,
    walletId: "w1",
    kind,
    date,
    sub: "sub_rainy_day",
    amount,
    note: "",
    recurring: false,
    ...(capitalPlanId ? { capitalPlanId } : {}),
  };
}

function plan(overrides: Partial<CapitalPlan> = {}): CapitalPlan {
  return {
    id: "p1",
    name: "Test Plan",
    glyph: "🎯",
    createdAt: "2026-08-19T00:00:00.000Z",
    items: [
      { id: "i1", name: "Venue", estimatedCost: 5000, paid: true, actualCost: 4800 },
      { id: "i2", name: "Catering", estimatedCost: 3000, paid: false },
      { id: "i3", name: "Rings", estimatedCost: 2000, paid: true },
    ],
    ...overrides,
  };
}

describe("planTotal", () => {
  test("sums every item's estimated cost regardless of paid status", () => {
    expect(planTotal(plan())).toBe(10000);
  });
});

describe("planPaidTotal", () => {
  test("sums actual cost for paid items, falling back to estimate when unset", () => {
    // i1: actualCost 4800, i3: no actualCost so falls back to estimatedCost 2000
    expect(planPaidTotal(plan())).toBe(6800);
  });

  test("returns 0 when nothing is paid", () => {
    const p = plan({ items: [{ id: "i1", name: "Venue", estimatedCost: 5000, paid: false }] });
    expect(planPaidTotal(p)).toBe(0);
  });
});

describe("planUnpaidTotal", () => {
  test("sums estimated cost for unpaid items only", () => {
    expect(planUnpaidTotal(plan())).toBe(3000);
  });

  test("returns 0 when everything is paid", () => {
    const p = plan({
      items: [{ id: "i1", name: "Venue", estimatedCost: 5000, paid: true }],
    });
    expect(planUnpaidTotal(p)).toBe(0);
  });
});

describe("planRemainingNeed", () => {
  test("is budget minus paid", () => {
    // paid 6800, budget 10000 → 3200 left
    expect(planRemainingNeed(plan({ initialBudget: 10000 }))).toBe(3200);
  });

  test("subtracts unspent savings assigned to the plan", () => {
    const p = plan({ id: "p1", initialBudget: 10000 });
    const txns = [savingsTx("2026-06-01", 1000, "p1")];

    expect(planRemainingNeed(p, txns, INDEX)).toBe(2200);
  });

  test("still counts remaining budget when every item is paid", () => {
    const p = plan({
      initialBudget: 10000,
      items: [
        { id: "i1", name: "Venue", estimatedCost: 5000, paid: true, actualCost: 5000 },
        { id: "i2", name: "Catering", estimatedCost: 3000, paid: true, actualCost: 3000 },
      ],
    });
    expect(planRemainingNeed(p)).toBe(2000);
  });

  test("clamps at 0 when paid meets or exceeds budget", () => {
    expect(planRemainingNeed(plan({ initialBudget: 5000 }))).toBe(0);
  });

  test("treats missing budget as 0", () => {
    expect(planRemainingNeed(plan())).toBe(0);
  });
});

describe("planIsOverbudget", () => {
  test("is true when paid exceeds budget", () => {
    expect(planIsOverbudget(plan({ initialBudget: 5000 }))).toBe(true);
  });

  test("is false when paid is within budget", () => {
    expect(planIsOverbudget(plan({ initialBudget: 10000 }))).toBe(false);
  });
});

describe("planBudgetProgress", () => {
  test("is paid divided by budget", () => {
    expect(planBudgetProgress(plan({ initialBudget: 10000 }))).toBeCloseTo(0.68);
  });

  test("is null when there is no budget", () => {
    expect(planBudgetProgress(plan())).toBeNull();
  });

  test("can exceed 1 when overbudget", () => {
    expect(planBudgetProgress(plan({ initialBudget: 5000 }))).toBeCloseTo(1.36);
  });
});

describe("planMonthsUntilTarget", () => {
  const today = new Date(2026, 7, 21); // Aug 21, 2026

  test("returns null when there is no target date", () => {
    expect(planMonthsUntilTarget(plan(), today)).toBeNull();
  });

  test("returns null when the target month is in the past", () => {
    expect(planMonthsUntilTarget(plan({ targetDate: "2026-06-15" }), today)).toBeNull();
  });

  test("is at least 1 when the target is the current month", () => {
    expect(planMonthsUntilTarget(plan({ targetDate: "2026-08-31" }), today)).toBe(1);
  });

  test("counts whole calendar months until a future target", () => {
    expect(planMonthsUntilTarget(plan({ targetDate: "2026-11-01" }), today)).toBe(3);
  });
});

describe("planMonthlySave", () => {
  const today = new Date(2026, 7, 21); // Aug 21, 2026

  test("divides (budget − paid − unspent) by months until target", () => {
    const p = plan({ id: "p1", targetDate: "2026-11-01", initialBudget: 10000 });
    const txns = [savingsTx("2026-06-01", 600, "p1")];

    expect(planMonthlySave(p, today, txns, INDEX)).toBeCloseTo((3200 - 600) / 3);
  });

  test("divides (budget − paid) by months until target", () => {
    // budget 10000 − paid 6800 = 3200; Aug → Nov = 3 months → ~1066.67/mo
    expect(planMonthlySave(plan({ targetDate: "2026-11-01", initialBudget: 10000 }), today)).toBeCloseTo(3200 / 3);
  });

  test("still saves monthly when all items are paid but budget remains", () => {
    const p = plan({
      targetDate: "2026-11-01",
      initialBudget: 10000,
      items: [
        { id: "i1", name: "Venue", estimatedCost: 5000, paid: true, actualCost: 4000 },
        { id: "i2", name: "Catering", estimatedCost: 3000, paid: true, actualCost: 2000 },
      ],
    });
    // remaining 4000 / 3 months
    expect(planMonthlySave(p, today)).toBeCloseTo(4000 / 3);
  });

  test("returns null when overbudget (UI shows Overpaid)", () => {
    expect(planMonthlySave(plan({ targetDate: "2026-11-01", initialBudget: 5000 }), today)).toBeNull();
  });

  test("returns 0 when paid exactly equals budget", () => {
    const p = plan({
      targetDate: "2026-11-01",
      initialBudget: 6800,
    });
    expect(planMonthlySave(p, today)).toBe(0);
  });

  test("returns null without a target date", () => {
    expect(planMonthlySave(plan({ initialBudget: 10000 }), today)).toBeNull();
  });

  test("returns null when the target month is past", () => {
    expect(planMonthlySave(plan({ targetDate: "2026-01-01", initialBudget: 10000 }), today)).toBeNull();
  });
});

describe("plansTotalMonthlySave", () => {
  const today = new Date(2026, 7, 21);

  test("sums monthly save across plans and skips overbudget", () => {
    const a = plan({ id: "a", targetDate: "2026-11-01", initialBudget: 10000 });
    const b = plan({ id: "b", targetDate: "2026-11-01", initialBudget: 5000 }); // overbudget
    const c = plan({
      id: "c",
      targetDate: "2026-11-01",
      initialBudget: 9000,
      items: [{ id: "i1", name: "Trip", estimatedCost: 3000, paid: true, actualCost: 3000 }],
    });

    // a: 3200/3, b: 0 (overbudget), c: 6000/3 = 2000
    expect(plansTotalMonthlySave([a, b, c], today)).toBeCloseTo(3200 / 3 + 2000);
  });
});

describe("planProgress", () => {
  test("is the fraction of items marked paid", () => {
    expect(planProgress(plan())).toBeCloseTo(2 / 3);
  });

  test("is null for a plan with no items yet", () => {
    expect(planProgress(plan({ items: [] }))).toBeNull();
  });
});

describe("planUnspentTotal", () => {
  test("sums deposits minus withdrawals for matching capitalPlanId", () => {
    const p = plan({ id: "p1" });
    const txns = [
      savingsTx("2026-06-01", 500, "p1"),
      savingsTx("2026-06-15", 300, "p1"),
      savingsTx("2026-07-01", 100, "p1", "income"),
      savingsTx("2026-07-02", 200, "p2"),
    ];

    expect(planUnspentTotal(p, txns, INDEX)).toBe(700);
  });

  test("ignores non-savings transactions even with capitalPlanId", () => {
    const p = plan({ id: "p1" });
    const txns = [
      {
        ...savingsTx("2026-06-01", 500, "p1"),
        sub: "groceries",
      },
    ];
    const spendingIndex = buildCategoryIndex([
      {
        id: "food",
        name: "Food",
        color: "#5b7a8a",
        glyph: "🍽️",
        type: "expense",
        subs: [{ id: "groceries", name: "Groceries" }],
      },
      ...SAVINGS_CATEGORIES,
    ]);

    expect(planUnspentTotal(p, txns, spendingIndex)).toBe(0);
  });
});

describe("instantiateFromTemplate", () => {
  test("prefills item names from a built-in template with zero cost", () => {
    const items = instantiateFromTemplate("marriage");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.estimatedCost === 0 && !i.paid)).toBe(true);
    expect(items.map((i) => i.name)).toContain("Venue");
  });

  test("every generated item id is unique", () => {
    const items = instantiateFromTemplate("house-loan");
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
  });

  test("returns an empty list for a custom (non-template) plan", () => {
    expect(instantiateFromTemplate("custom")).toEqual([]);
  });
});
