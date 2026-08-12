import { describe, expect, test } from "bun:test";
import { cv, mean, stats1D, stdev } from "@/frontend/lib/stat-helpers";

describe("stats1D", () => {
  test("agrees with mean/stdev/cv on a shared fixture", () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const result = stats1D(values);

    expect(result.mean).toBeCloseTo(mean(values), 10);
    expect(result.stdev).toBeCloseTo(stdev(values), 10);
    expect(result.cv).toBeCloseTo(cv(values), 10);
  });

  test("handles empty and single-element lists like the split helpers", () => {
    expect(stats1D([])).toEqual({ mean: 0, stdev: 0, cv: 0 });

    const one = stats1D([5]);
    expect(one.mean).toBe(mean([5]));
    expect(one.stdev).toBe(stdev([5]));
    expect(one.cv).toBe(cv([5]));
  });

  test("clamps a zero-variance set instead of going slightly negative", () => {
    const result = stats1D([3, 3, 3, 3]);
    expect(result.stdev).toBe(0);
    expect(result.cv).toBe(0);
  });
});
