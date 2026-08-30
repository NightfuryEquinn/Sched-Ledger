import { describe, expect, test } from "bun:test";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import { releaseOrphanedPlanRefs } from "@/frontend/lib/capitals";
import { buildPiggies } from "@/frontend/lib/piggies";
import type { Category, Expense } from "@/frontend/lib/types";

const CATEGORIES: Category[] = [
  {
    id: "food",
    name: "Food",
    color: "#5b7a8a",
    glyph: "🍽️",
    type: "expense",
    subs: [{ id: "groceries", name: "Groceries" }],
  },
  {
    id: "cat_emergency",
    name: "Emergency Fund",
    color: "#7a6fa5",
    glyph: "🛟",
    type: "savings",
    target: 1000,
    subs: [{ id: "sub_rainy_day", name: "Rainy Day" }],
  },
  {
    id: "cat_travel",
    name: "Travel",
    color: "#4f8a7b",
    glyph: "✈️",
    type: "savings",
    // No category-level target — should default to the sum of piglet targets.
    subs: [
      { id: "sub_flights", name: "Flights", target: 400 },
      { id: "sub_hotel", name: "Hotel", target: 600 },
    ],
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

function tx(
  date: string,
  amount: number,
  sub: string,
  kind: "expense" | "income" = "expense",
  id = `${date}-${sub}-${amount}-${kind}`,
): Expense {
  return { id, walletId: "w1", kind, date, sub, amount, note: "", recurring: false };
}

describe("buildPiggies balance", () => {
  test("deposits accumulate and withdrawals subtract", () => {
    const txns = [
      tx("2026-06-01", 500, "sub_rainy_day"),
      tx("2026-06-15", 300, "sub_rainy_day"),
      tx("2026-07-01", 200, "sub_rainy_day", "income"), // withdrawal
    ];
    const [piggy] = buildPiggies(txns, INDEX).filter((p) => p.catId === "cat_emergency");

    expect(piggy!.deposited).toBe(800);
    expect(piggy!.withdrawn).toBe(200);
    expect(piggy!.balance).toBe(600);
  });

  test("category target defaults to the sum of piglet targets when unset", () => {
    const [piggy] = buildPiggies([], INDEX).filter((p) => p.catId === "cat_travel");

    expect(piggy!.target).toBe(1000);
  });

  test("an explicit category target is not overridden by piglet targets", () => {
    const [piggy] = buildPiggies([], INDEX).filter((p) => p.catId === "cat_emergency");

    expect(piggy!.target).toBe(1000);
  });

  test("progress is null (not 0) when there is no target anywhere", () => {
    const [piggy] = buildPiggies([], INDEX).filter((p) => p.catId === "cat_goalless");

    expect(piggy!.progress).toBeNull();
    expect(piggy!.target).toBeUndefined();
  });

  test("progress is a real ratio once a deposit exists against a target", () => {
    const txns = [tx("2026-06-01", 250, "sub_rainy_day")];
    const [piggy] = buildPiggies(txns, INDEX).filter((p) => p.catId === "cat_emergency");

    expect(piggy!.progress).toBeCloseTo(0.25, 6);
  });

  test("an archived savings category with a nonzero balance is still returned", () => {
    const archivedCategories = CATEGORIES.map((c) =>
      c.id === "cat_emergency" ? { ...c, archived: true } : c,
    );
    const archivedIndex = buildCategoryIndex(archivedCategories);
    const txns = [tx("2026-06-01", 500, "sub_rainy_day")];

    const piggies = buildPiggies(txns, archivedIndex);
    const piggy = piggies.find((p) => p.catId === "cat_emergency");

    expect(piggy).toBeDefined();
    expect(piggy!.archived).toBe(true);
    expect(piggy!.balance).toBe(500);
  });

  test("an archived savings category with a zero balance is dropped", () => {
    const archivedCategories = CATEGORIES.map((c) =>
      c.id === "cat_emergency" ? { ...c, archived: true } : c,
    );
    const archivedIndex = buildCategoryIndex(archivedCategories);

    const piggies = buildPiggies([], archivedIndex);
    expect(piggies.find((p) => p.catId === "cat_emergency")).toBeUndefined();
  });

  test("piglet balances split independently within a shared piggy", () => {
    const txns = [
      tx("2026-06-01", 400, "sub_flights"),
      tx("2026-06-01", 600, "sub_hotel"),
      tx("2026-07-01", 100, "sub_flights", "income"),
    ];
    const [piggy] = buildPiggies(txns, INDEX).filter((p) => p.catId === "cat_travel");
    const flights = piggy!.piglets.find((p) => p.subId === "sub_flights");
    const hotel = piggy!.piglets.find((p) => p.subId === "sub_hotel");

    expect(flights!.balance).toBe(300);
    expect(hotel!.balance).toBe(600);
    expect(piggy!.balance).toBe(900);
  });

  test("transactions outside a filtered wallet are excluded when walletId is passed", () => {
    const txns = [
      { ...tx("2026-06-01", 500, "sub_rainy_day"), walletId: "w1" },
      { ...tx("2026-06-02", 300, "sub_rainy_day"), walletId: "w2" },
    ];
    const [piggy] = buildPiggies(txns, INDEX, "w1").filter((p) => p.catId === "cat_emergency");

    expect(piggy!.balance).toBe(500);
  });

  test("capital-assigned savings deposits are excluded from piggy balance", () => {
    const txns = [
      tx("2026-06-01", 500, "sub_rainy_day"),
      { ...tx("2026-06-02", 300, "sub_rainy_day"), capitalPlanId: "plan_wedding" },
    ];
    const [piggy] = buildPiggies(txns, INDEX).filter((p) => p.catId === "cat_emergency");

    expect(piggy!.balance).toBe(500);
    expect(piggy!.deposited).toBe(500);
  });

  test("a released deposit counts toward its piggy again", () => {
    // The exclusion is a truthiness check, so a plan id left behind by a
    // deleted plan hides the money here and claims it for no plan either.
    const orphaned = [
      tx("2026-06-01", 500, "sub_rainy_day"),
      { ...tx("2026-06-02", 300, "sub_rainy_day"), capitalPlanId: "plan_gone" },
    ];
    const released = releaseOrphanedPlanRefs(orphaned, []);
    const [piggy] = buildPiggies(released, INDEX).filter((p) => p.catId === "cat_emergency");

    expect(piggy!.balance).toBe(800);
    expect(piggy!.deposited).toBe(800);
  });
});
