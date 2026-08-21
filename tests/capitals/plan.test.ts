import { describe, expect, test } from "bun:test";
import {
  instantiateFromTemplate,
  planMonthlySave,
  planMonthsUntilTarget,
  planPaidTotal,
  planProgress,
  planRemainingNeed,
  planTotal,
  planUnpaidTotal,
} from "@/frontend/lib/capitals";
import type { CapitalPlan } from "@/frontend/lib/types";

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
  test("subtracts initial budget from unpaid total", () => {
    expect(planRemainingNeed(plan({ initialBudget: 1000 }))).toBe(2000);
  });

  test("clamps at 0 when budget covers unpaid", () => {
    expect(planRemainingNeed(plan({ initialBudget: 5000 }))).toBe(0);
  });

  test("treats missing initial budget as 0", () => {
    expect(planRemainingNeed(plan())).toBe(3000);
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

  test("divides remaining need by months until target", () => {
    // unpaid 3000 − budget 0 = 3000; Aug → Nov = 3 months → 1000/mo
    expect(planMonthlySave(plan({ targetDate: "2026-11-01" }), today)).toBe(1000);
  });

  test("excludes paid items and applies initial budget", () => {
    // unpaid 3000 − budget 1200 = 1800; 3 months → 600/mo
    expect(planMonthlySave(plan({ targetDate: "2026-11-01", initialBudget: 1200 }), today)).toBe(600);
  });

  test("returns 0 when budget covers unpaid", () => {
    expect(planMonthlySave(plan({ targetDate: "2026-11-01", initialBudget: 5000 }), today)).toBe(0);
  });

  test("returns null without a target date", () => {
    expect(planMonthlySave(plan(), today)).toBeNull();
  });

  test("returns null when the target month is past", () => {
    expect(planMonthlySave(plan({ targetDate: "2026-01-01" }), today)).toBeNull();
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
