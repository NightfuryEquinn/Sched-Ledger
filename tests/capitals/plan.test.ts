import { describe, expect, test } from "bun:test";
import { instantiateFromTemplate, planPaidTotal, planProgress, planTotal } from "@/frontend/lib/capitals";
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
