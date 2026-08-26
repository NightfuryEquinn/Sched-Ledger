import { describe, expect, test } from "bun:test";
import { pushInsight } from "@/frontend/lib/insights/build";
import { rankInsights } from "@/frontend/lib/insights/rank";
import type { Insight } from "@/frontend/lib/insights/types";

/** A confident, moderate-impact confidence stub for building fixtures quickly. */
function conf(value = 0.8) {
  return { level: value >= 0.66 ? ("high" as const) : ("medium" as const), value, margin: 0, reasons: [] };
}

describe("pushInsight", () => {
  test("computes score as impact times confidence", () => {
    const out: Insight[] = [];
    pushInsight(out, {
      id: "a",
      kind: "a",
      title: "A",
      body: "",
      tone: "neutral",
      impact: 0.5,
      confidence: conf(0.5),
    });
    expect(out[0]!.score).toBeCloseTo(0.25, 5);
  });

  test("clamps a non-finite impact to zero instead of producing NaN", () => {
    const out: Insight[] = [];
    pushInsight(out, {
      id: "a",
      kind: "a",
      title: "A",
      body: "",
      tone: "neutral",
      impact: NaN,
      confidence: conf(0.9),
    });
    expect(out[0]!.impact).toBe(0);
    expect(out[0]!.score).toBe(0);
  });

  test("clamps a non-finite confidence value to zero", () => {
    const out: Insight[] = [];
    pushInsight(out, {
      id: "a",
      kind: "a",
      title: "A",
      body: "",
      tone: "neutral",
      impact: 0.9,
      confidence: { level: "low", value: Infinity, margin: 0, reasons: [] },
    });
    expect(out[0]!.score).toBe(0);
  });

  test("clamps impact above 1 down to 1", () => {
    const out: Insight[] = [];
    pushInsight(out, {
      id: "a",
      kind: "a",
      title: "A",
      body: "",
      tone: "neutral",
      impact: 5,
      confidence: conf(1),
    });
    expect(out[0]!.impact).toBe(1);
  });
});

describe("rankInsights", () => {
  test("sorts by score descending", () => {
    const out: Insight[] = [];
    pushInsight(out, { id: "low", kind: "low", title: "", body: "", tone: "neutral", impact: 0.2, confidence: conf(0.9) });
    pushInsight(out, { id: "high", kind: "high", title: "", body: "", tone: "neutral", impact: 0.9, confidence: conf(0.9) });

    const ranked = rankInsights(out);
    expect(ranked.map((i) => i.id)).toEqual(["high", "low"]);
  });

  test("drops anything under the floor", () => {
    const out: Insight[] = [];
    pushInsight(out, { id: "tiny", kind: "tiny", title: "", body: "", tone: "neutral", impact: 0.01, confidence: conf(0.5) });
    pushInsight(out, { id: "solid", kind: "solid", title: "", body: "", tone: "neutral", impact: 0.8, confidence: conf(0.8) });

    const ranked = rankInsights(out);
    expect(ranked.map((i) => i.id)).toEqual(["solid"]);
  });

  test("collapses duplicate kinds to the strongest instance", () => {
    const out: Insight[] = [];
    pushInsight(out, { id: "weak", kind: "budget-risk", title: "", body: "", tone: "neutral", impact: 0.3, confidence: conf(0.8) });
    pushInsight(out, { id: "strong", kind: "budget-risk", title: "", body: "", tone: "neutral", impact: 0.9, confidence: conf(0.8) });

    const ranked = rankInsights(out);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("strong");
  });

  test("namespaced kinds are not collapsed against each other", () => {
    const out: Insight[] = [];
    pushInsight(out, { id: "a", kind: "budget-risk:groceries", title: "", body: "", tone: "neutral", impact: 0.6, confidence: conf(0.8) });
    pushInsight(out, { id: "b", kind: "budget-risk:transport", title: "", body: "", tone: "neutral", impact: 0.6, confidence: conf(0.8) });

    const ranked = rankInsights(out);
    expect(ranked).toHaveLength(2);
  });

  test("caps the result to the requested limit", () => {
    const out: Insight[] = [];
    for (let i = 0; i < 10; i++) {
      pushInsight(out, { id: `i${i}`, kind: `k${i}`, title: "", body: "", tone: "neutral", impact: 0.9, confidence: conf(0.9) });
    }

    const ranked = rankInsights(out, { limit: 3 });
    expect(ranked).toHaveLength(3);
  });

  test("ties break by id for deterministic output", () => {
    const out: Insight[] = [];
    pushInsight(out, { id: "b", kind: "b", title: "", body: "", tone: "neutral", impact: 0.9, confidence: conf(0.9) });
    pushInsight(out, { id: "a", kind: "a", title: "", body: "", tone: "neutral", impact: 0.9, confidence: conf(0.9) });

    const ranked = rankInsights(out);
    expect(ranked.map((i) => i.id)).toEqual(["a", "b"]);
  });

  test("empty input yields an empty feed, not a crash", () => {
    expect(rankInsights([])).toEqual([]);
  });
});
