import { describe, expect, test } from "bun:test";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import { buildPiggies } from "@/frontend/lib/piggies";
import { computeSavingsInsights } from "@/frontend/lib/savingsInsights";
import type { Category, Expense } from "@/frontend/lib/types";

const CATEGORIES: Category[] = [
  {
    id: "income",
    name: "Income",
    color: "#6f8b6f",
    glyph: "💵",
    type: "income",
    subs: [{ id: "salary", name: "Salary" }],
  },
  {
    id: "cat_emergency",
    name: "Emergency Fund",
    color: "#7a6fa5",
    glyph: "🛟",
    type: "savings",
    target: 1000,
    deadline: "2026-12-01",
    subs: [{ id: "sub_rainy_day", name: "Rainy Day" }],
  },
  {
    id: "cat_goalless",
    name: "No Goal",
    color: "#a06f95",
    glyph: "🐖",
    type: "savings",
    subs: [{ id: "sub_goalless", name: "Whatever" }],
  },
];

const INDEX = buildCategoryIndex(CATEGORIES);
const ANCHOR = "2026-07";

function tx(
  date: string,
  amount: number,
  sub: string,
  kind: "expense" | "income" = "expense",
  id = `${date}-${sub}-${amount}-${kind}`,
): Expense {
  return { id, walletId: "w1", kind, date, sub, amount, note: "", recurring: false };
}

describe("computeSavingsInsights guards", () => {
  test("zero income yields a 0 savings rate, not NaN or Infinity", () => {
    const txns = [tx("2026-07-01", 200, "sub_rainy_day")];
    const piggies = buildPiggies(txns, INDEX);
    const insights = computeSavingsInsights(txns, txns, piggies, INDEX, ANCHOR);

    expect(insights.savingsRate).toBe(0);
    expect(Number.isFinite(insights.savingsRate)).toBe(true);
  });

  test("no savings history yields zero pace and a null projection, not NaN", () => {
    const piggies = buildPiggies([], INDEX);
    const insights = computeSavingsInsights([], [], piggies, INDEX, ANCHOR);

    const emergency = insights.perPiggy.find((p) => p.catId === "cat_emergency");
    expect(emergency!.monthlyPace).toBe(0);
    expect(emergency!.projectedCompletion).toBeNull();
    expect(Number.isFinite(emergency!.monthlyPace)).toBe(true);
  });

  test("onTrack and requiredMonthly are null when there is no target", () => {
    const piggies = buildPiggies([], INDEX);
    const insights = computeSavingsInsights([], [], piggies, INDEX, ANCHOR);

    const goalless = insights.perPiggy.find((p) => p.catId === "cat_goalless");
    expect(goalless!.onTrack).toBeNull();
    expect(goalless!.requiredMonthly).toBeNull();
  });

  test("onTrack is null when a target exists but no deadline is set", () => {
    const noDeadline = CATEGORIES.map((c) =>
      c.id === "cat_emergency" ? { ...c, deadline: undefined } : c,
    );
    const index = buildCategoryIndex(noDeadline);
    const txns = [tx("2026-06-01", 100, "sub_rainy_day")];
    const piggies = buildPiggies(txns, index);
    const insights = computeSavingsInsights(txns, txns, piggies, index, ANCHOR);

    const emergency = insights.perPiggy.find((p) => p.catId === "cat_emergency");
    expect(emergency!.onTrack).toBeNull();
    expect(emergency!.requiredMonthly).toBeNull();
  });
});

describe("computeSavingsInsights pace and projection", () => {
  test("a steady monthly deposit projects completion and reports on track", () => {
    const txns = [
      tx("2026-05-01", 200, "sub_rainy_day"),
      tx("2026-06-01", 200, "sub_rainy_day"),
      tx("2026-07-01", 200, "sub_rainy_day"),
    ];
    const piggies = buildPiggies(txns, INDEX);
    const insights = computeSavingsInsights(txns, txns, piggies, INDEX, ANCHOR, 6);

    const emergency = insights.perPiggy.find((p) => p.catId === "cat_emergency")!;
    expect(emergency.monthlyPace).toBeGreaterThan(0);
    expect(emergency.projectedCompletion).not.toBeNull();
    // Balance 600, target 1000, deadline 2026-12 — comfortably reachable at this pace.
    expect(emergency.onTrack).toBe(true);
  });

  test("a withdrawal pulls the projection later than deposits alone", () => {
    const deposits = [
      tx("2026-05-01", 200, "sub_rainy_day"),
      tx("2026-06-01", 200, "sub_rainy_day"),
      tx("2026-07-01", 200, "sub_rainy_day"),
    ];
    const withWithdrawal = [...deposits, tx("2026-07-15", 500, "sub_rainy_day", "income")];

    const piggiesA = buildPiggies(deposits, INDEX);
    const piggiesB = buildPiggies(withWithdrawal, INDEX);
    const a = computeSavingsInsights(deposits, deposits, piggiesA, INDEX, ANCHOR, 6).perPiggy.find(
      (p) => p.catId === "cat_emergency",
    )!;
    const b = computeSavingsInsights(withWithdrawal, withWithdrawal, piggiesB, INDEX, ANCHOR, 6).perPiggy.find(
      (p) => p.catId === "cat_emergency",
    )!;

    expect(piggiesB.find((p) => p.catId === "cat_emergency")!.balance).toBeLessThan(
      piggiesA.find((p) => p.catId === "cat_emergency")!.balance,
    );
    // Same or later projected month once the withdrawal has eaten into the balance.
    expect((b.projectedCompletion ?? "9999-99") >= (a.projectedCompletion ?? "9999-99")).toBe(true);
  });

  test("net flow and streak reflect deposits minus withdrawals across the window", () => {
    const txns = [
      tx("2026-05-01", 300, "sub_rainy_day"),
      tx("2026-06-01", 300, "sub_rainy_day"),
      tx("2026-07-01", 100, "sub_rainy_day", "income"),
    ];
    const piggies = buildPiggies(txns, INDEX);
    const insights = computeSavingsInsights(txns, txns, piggies, INDEX, ANCHOR, 3);

    expect(insights.netFlow).toBe(500); // 300 + 300 - 100
    expect(insights.currentStreak).toBe(0); // July net is negative, breaking the streak from the end
  });
});

describe("computeSavingsInsights capital allocation", () => {
  test("capital-assigned deposits are excluded from net flow, rate, and streak", () => {
    const income = tx("2026-07-01", 5000, "salary", "income");
    const piggyDeposit = tx("2026-07-01", 200, "sub_rainy_day");
    const capitalDeposit = {
      ...tx("2026-07-02", 300, "sub_rainy_day"),
      capitalPlanId: "plan_wedding",
    };
    const txns = [income, piggyDeposit, capitalDeposit];
    const piggies = buildPiggies(txns, INDEX);
    const insights = computeSavingsInsights(txns, txns, piggies, INDEX, ANCHOR, 1);

    expect(insights.netFlow).toBe(200);
    expect(insights.savingsRate).toBe(0.04); // 200 / 5000
    expect(insights.currentStreak).toBe(1);
  });

  test("capital-assigned deposits do not inflate monthly pace or recurring pledges", () => {
    const unassigned = [
      tx("2026-05-01", 100, "sub_rainy_day"),
      tx("2026-06-01", 100, "sub_rainy_day"),
      tx("2026-07-01", 100, "sub_rainy_day"),
    ];
    const capitalOnly = [
      ...unassigned,
      { ...tx("2026-07-02", 500, "sub_rainy_day"), capitalPlanId: "plan_wedding" },
    ];
    const capitalRecurring = [
      ...unassigned,
      {
        ...tx("2026-07-02", 600, "sub_rainy_day"),
        capitalPlanId: "plan_wedding",
        recurring: true,
      },
    ];

    const piggies = buildPiggies(capitalOnly, INDEX);
    const insights = computeSavingsInsights(capitalOnly, capitalOnly, piggies, INDEX, ANCHOR, 3);
    const emergency = insights.perPiggy.find((p) => p.catId === "cat_emergency")!;

    expect(emergency.monthlyPace).toBe(100);

    const recurringInsights = computeSavingsInsights(
      capitalRecurring,
      capitalRecurring,
      piggies,
      INDEX,
      ANCHOR,
      3,
    );
    const recurringEmergency = recurringInsights.perPiggy.find((p) => p.catId === "cat_emergency")!;

    expect(recurringEmergency.monthlyPace).toBe(100);
  });
});
