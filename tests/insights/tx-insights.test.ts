import { describe, expect, test } from "bun:test";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import { CURRENT_MONTH_KEY, monthsWindow, pad, TODAY_ISO } from "@/frontend/lib/data";
import { computeTxInsights } from "@/frontend/lib/insights/txInsights";
import type { Category, Expense } from "@/frontend/lib/types";

const CATEGORIES: Category[] = [
  { id: "income", name: "Income", color: "#6f8b6f", glyph: "💵", type: "income", subs: [{ id: "sub_salary", name: "Salary" }] },
  { id: "groceries", name: "Groceries", color: "#4a6fa5", glyph: "🛒", type: "expense", subs: [{ id: "sub_groceries", name: "Groceries" }] },
  { id: "transport", name: "Transport", color: "#a06f95", glyph: "🚌", type: "expense", subs: [{ id: "sub_transport", name: "Transport" }] },
];

const INDEX = buildCategoryIndex(CATEGORIES);
const identityMoney = { money: (n: number) => String(n) };

let seq = 0;

/** Build an Expense fixture with sane defaults, overridable per test. */
function tx(overrides: Partial<Expense> & Pick<Expense, "date" | "sub" | "amount">): Expense {
  seq += 1;
  return {
    id: `tx_${seq}`,
    walletId: "wallet_1",
    kind: "expense",
    note: "",
    recurring: false,
    ...overrides,
  };
}

describe("computeTxInsights forecast — current month only", () => {
  test("the month-end forecast is suppressed for a past month", () => {
    const expenses = [tx({ date: "2023-06-05", sub: "sub_groceries", amount: 50 })];
    const insights = computeTxInsights(expenses, {}, "2023-06", INDEX, 0, identityMoney);

    expect(insights.some((i) => i.kind === "forecast:month-end")).toBe(false);
  });

  test("projects month-end spend from elapsed-day pace with no budget set", () => {
    const elapsedDay = Number(TODAY_ISO.slice(8, 10));
    const daysInMonth = new Date(Number(CURRENT_MONTH_KEY.slice(0, 4)), Number(CURRENT_MONTH_KEY.slice(5, 7)), 0).getDate();
    const dailyAmount = 10;
    const expenses = Array.from({ length: elapsedDay }, (_, i) =>
      tx({ date: `${CURRENT_MONTH_KEY}-${pad(i + 1)}`, sub: "sub_groceries", amount: dailyAmount }),
    );

    const insights = computeTxInsights(expenses, {}, CURRENT_MONTH_KEY, INDEX, 0, identityMoney);
    const forecast = insights.find((i) => i.kind === "forecast:month-end");

    expect(forecast).toBeDefined();
    expect(forecast!.tone).toBe("neutral");
    expect(forecast!.metric!.value).toBe(String(dailyAmount * daysInMonth));
    expect(Number.isFinite(forecast!.score)).toBe(true);
  });

  test("flags an over-budget projection as warning or critical, not neutral", () => {
    const elapsedDay = Number(TODAY_ISO.slice(8, 10));
    const expenses = Array.from({ length: elapsedDay }, (_, i) =>
      tx({ date: `${CURRENT_MONTH_KEY}-${pad(i + 1)}`, sub: "sub_groceries", amount: 100 }),
    );

    const insights = computeTxInsights(expenses, { groceries: 50 }, CURRENT_MONTH_KEY, INDEX, 50, identityMoney);
    const forecast = insights.find((i) => i.kind === "forecast:month-end");

    expect(forecast).toBeDefined();
    expect(["warning", "critical"]).toContain(forecast!.tone);
  });

  test("flags the specific over-budget category, not just the total", () => {
    const elapsedDay = Number(TODAY_ISO.slice(8, 10));
    const expenses = Array.from({ length: elapsedDay }, (_, i) =>
      tx({ date: `${CURRENT_MONTH_KEY}-${pad(i + 1)}`, sub: "sub_groceries", amount: 100 }),
    );

    const insights = computeTxInsights(expenses, { groceries: 50 }, CURRENT_MONTH_KEY, INDEX, 50, identityMoney);

    expect(insights.some((i) => i.kind === "budget-risk:groceries")).toBe(true);
  });

  test("a past month never emits budget-risk cards either", () => {
    const expenses = [tx({ date: "2023-06-05", sub: "sub_groceries", amount: 1000 })];
    const insights = computeTxInsights(expenses, { groceries: 10 }, "2023-06", INDEX, 10, identityMoney);

    expect(insights.some((i) => i.kind.startsWith("budget-risk:"))).toBe(false);
  });
});

describe("computeTxInsights anomaly detection", () => {
  test("flags a robust (median/MAD) outlier transaction", () => {
    const month = "2023-06";
    const months = monthsWindow(month, 6).map((m) => m.key);
    const baseline: Expense[] = [];
    const typical = [18, 20, 22];
    months.forEach((mo, mi) => {
      typical.forEach((amt, ai) => {
        baseline.push(tx({ date: `${mo}-${pad(ai + 1)}`, sub: "sub_transport", amount: amt, id: `base_${mi}_${ai}` }));
      });
    });
    const outlier = tx({ date: `${month}-15`, sub: "sub_transport", amount: 500 });

    const insights = computeTxInsights([...baseline, outlier], {}, month, INDEX, 0, identityMoney);
    const anomaly = insights.find((i) => i.kind.startsWith("anomaly:tx:"));

    expect(anomaly).toBeDefined();
    expect(anomaly!.tone).toBe("warning");
    expect(Number.isFinite(anomaly!.score)).toBe(true);
  });

  test("no outlier card when every amount is identical (MAD is zero)", () => {
    const month = "2023-06";
    const months = monthsWindow(month, 6).map((m) => m.key);
    const expenses: Expense[] = [];
    months.forEach((mo, mi) => {
      for (let d = 0; d < 3; d++) {
        expenses.push(tx({ date: `${mo}-${pad(d + 1)}`, sub: "sub_transport", amount: 20, id: `flat_${mi}_${d}` }));
      }
    });

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    expect(insights.some((i) => i.kind.startsWith("anomaly:tx:"))).toBe(false);
  });
});

describe("computeTxInsights category drift", () => {
  test("a material, sustained rise in a category vs its baseline is flagged as a rising drift", () => {
    const month = "2023-06";
    const baselineMonths = monthsWindow(month, 6).map((m) => m.key).slice(0, -1);
    const expenses: Expense[] = baselineMonths.map((mo, i) =>
      tx({ date: `${mo}-10`, sub: "sub_groceries", amount: 100, id: `baseline_${i}` }),
    );
    expenses.push(tx({ date: `${month}-10`, sub: "sub_groceries", amount: 400 }));

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    const drift = insights.find((i) => i.kind === "drift:groceries");

    expect(drift).toBeDefined();
    expect(drift!.tone).toBe("warning");
  });

  test("a small, immaterial change is not flagged as drift", () => {
    const month = "2023-06";
    const baselineMonths = monthsWindow(month, 6).map((m) => m.key).slice(0, -1);
    const expenses: Expense[] = baselineMonths.map((mo, i) =>
      tx({ date: `${mo}-10`, sub: "sub_groceries", amount: 100, id: `baseline_${i}` }),
    );
    // A 300% jump on a near-zero baseline should not read as material drift.
    expenses.push(tx({ date: `${month}-10`, sub: "sub_transport", amount: 4 }));

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    expect(insights.some((i) => i.kind === "drift:transport")).toBe(false);
  });
});

describe("computeTxInsights recurring changes", () => {
  test("detects a new recurring series starting this month", () => {
    const month = "2023-06";
    const expenses = [tx({ date: `${month}-05`, sub: "sub_transport", amount: 50, note: "New Streaming Plan", recurring: "monthly" })];

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    expect(insights.some((i) => i.kind.startsWith("recurring:new:"))).toBe(true);
  });

  test("detects a recurring series that went quiet on schedule", () => {
    const month = "2023-06";
    const priorMonth = monthsWindow(month, 2)[0]!.key;
    const expenses = [tx({ date: `${priorMonth}-05`, sub: "sub_transport", amount: 30, note: "Gym Membership", recurring: "monthly" })];

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    expect(insights.some((i) => i.kind.startsWith("recurring:stopped:"))).toBe(true);
  });

  test("flags subscription price creep across a rising recurring series", () => {
    const month = "2023-06";
    const months = monthsWindow(month, 3).map((m) => m.key);
    const expenses = months.map((mo, i) =>
      tx({ date: `${mo}-05`, sub: "sub_transport", amount: 20 + i * 3, note: "Cloud Storage", recurring: "monthly", id: `creep_${i}` }),
    );

    const insights = computeTxInsights(expenses, {}, month, INDEX, 0, identityMoney);
    expect(insights.some((i) => i.kind.startsWith("recurring:price-creep:"))).toBe(true);
  });
});

describe("computeTxInsights guards", () => {
  test("empty expenses never crash and yield an empty feed", () => {
    const insights = computeTxInsights([], {}, "2023-06", INDEX, 0, identityMoney);
    expect(insights).toEqual([]);
  });

  test("every emitted insight has finite score, impact, and confidence", () => {
    const month = "2023-06";
    const expenses = [
      tx({ date: `${month}-05`, sub: "sub_groceries", amount: 40 }),
      tx({ date: `${month}-10`, sub: "sub_transport", amount: 60, note: "Toll Pass", recurring: "monthly" }),
    ];
    const insights = computeTxInsights(expenses, { groceries: 100 }, month, INDEX, 100, identityMoney);

    for (const insight of insights) {
      expect(Number.isFinite(insight.score)).toBe(true);
      expect(Number.isFinite(insight.impact)).toBe(true);
      expect(Number.isFinite(insight.confidence.value)).toBe(true);
    }
  });
});
