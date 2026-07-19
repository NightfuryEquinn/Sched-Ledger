import { describe, expect, test } from "bun:test";
import {
  allocateBudgets,
  computeNet,
  isValidAllocationTotal,
  isValidTaxTotal,
  MY_TAX_PRESETS,
  sumPercents,
} from "@/frontend/lib/calculator";

describe("calculator", () => {
  test("sumPercents ignores non-finite values", () => {
    expect(sumPercents([10, NaN, 5, Infinity])).toBe(15);
  });

  test("computeNet deducts combined tax from gross", () => {
    expect(computeNet(1000, [10, 5])).toBe(850);
    expect(computeNet(1000, [])).toBe(1000);
    expect(computeNet(-50, [10])).toBe(0);
  });

  test("computeNet clamps tax sum above 100% to zero net", () => {
    expect(computeNet(1000, [60, 50])).toBe(0);
  });

  test("isValidTaxTotal rejects over 100%", () => {
    expect(isValidTaxTotal([10, 20])).toBe(true);
    expect(isValidTaxTotal([100])).toBe(true);
    expect(isValidTaxTotal([60, 50])).toBe(false);
  });

  test("isValidAllocationTotal requires ~100%", () => {
    expect(isValidAllocationTotal([50, 50])).toBe(true);
    expect(isValidAllocationTotal([33.33, 33.33, 33.34])).toBe(true);
    expect(isValidAllocationTotal([40, 40])).toBe(false);
  });

  test("allocateBudgets rounds and places remainder on last positive pct", () => {
    const result = allocateBudgets(100, [
      { id: "a", pct: 33.33 },
      { id: "b", pct: 33.33 },
      { id: "c", pct: 33.34 },
    ]);

    expect((result.a ?? 0) + (result.b ?? 0) + (result.c ?? 0)).toBe(100);
    expect(result).toEqual({ a: 33, b: 33, c: 34 });
  });

  test("allocateBudgets skips zero-pct categories for remainder", () => {
    const result = allocateBudgets(101, [
      { id: "a", pct: 50 },
      { id: "b", pct: 50 },
      { id: "c", pct: 0 },
    ]);

    expect((result.a ?? 0) + (result.b ?? 0) + (result.c ?? 0)).toBe(101);
    expect(result.c).toBe(0);
  });

  test("allocateBudgets returns empty map for empty allocations", () => {
    expect(allocateBudgets(500, [])).toEqual({});
  });

  test("MY_TAX_PRESETS stay within a valid combined tax total", () => {
    expect(MY_TAX_PRESETS.length).toBeGreaterThan(0);
    for (const preset of MY_TAX_PRESETS) {
      expect(isValidTaxTotal(preset.lines.map((l) => l.pct))).toBe(true);
      expect(preset.lines.every((l) => l.title.trim().length > 0)).toBe(true);
    }
  });
});
