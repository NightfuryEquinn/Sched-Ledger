import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BUDGET_ALERT_THRESHOLD,
  budgetAlertDedupeKey,
  evaluateBudgetAlerts,
} from "@/lib/budget-alerts";

const cats = [
  { id: "food", name: "Food", type: "expense" as const },
  { id: "transport", name: "Transport", type: "expense" as const },
  { id: "income", name: "Income", type: "income" as const },
];

describe("evaluateBudgetAlerts", () => {
  test("returns no alerts below the warning threshold", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { food: 500 },
      budgets: { food: 1000 },
      categories: cats,
      month: "2026-07",
    });
    expect(alerts).toEqual([]);
  });

  test("warns when spend reaches the default 80% threshold", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { food: 800 },
      budgets: { food: 1000 },
      categories: cats,
      month: "2026-07",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      categoryId: "food",
      level: "warning",
      ratio: 0.8,
      month: "2026-07",
    });
    expect(DEFAULT_BUDGET_ALERT_THRESHOLD).toBe(0.8);
  });

  test("marks exceeded when spend meets or passes the budget", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { food: 1000, transport: 250 },
      budgets: { food: 1000, transport: 200 },
      categories: cats,
      month: "2026-07",
    });
    expect(alerts.map((a) => a.categoryId)).toEqual(["transport", "food"]);
    expect(alerts.every((a) => a.level === "exceeded")).toBe(true);
  });

  test("skips income categories and unset budgets", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { income: 5000, food: 900, transport: 50 },
      budgets: { income: 1, food: 1000, transport: 0 },
      categories: cats,
      month: "2026-07",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.categoryId).toBe("food");
    expect(alerts[0]!.level).toBe("warning");
  });

  test("respects a custom warning threshold", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { food: 600 },
      budgets: { food: 1000 },
      categories: cats,
      month: "2026-07",
      warningThreshold: 0.5,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe("warning");
  });

  test("includes envelope holds in effective spend", () => {
    const alerts = evaluateBudgetAlerts({
      byCat: { food: 500 },
      byCatHeld: { food: 350 },
      budgets: { food: 1000 },
      categories: cats,
      month: "2026-07",
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      categoryId: "food",
      spent: 850,
      level: "warning",
    });
  });

  test("budgetAlertDedupeKey is stable", () => {
    expect(
      budgetAlertDedupeKey({
        walletId: "w1",
        categoryId: "food",
        month: "2026-07",
        level: "warning",
      }),
    ).toBe("w1|food|2026-07|warning");
  });
});
