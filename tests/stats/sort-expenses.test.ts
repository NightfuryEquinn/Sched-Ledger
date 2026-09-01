import { sortExpensesByDateDesc } from "@/frontend/lib/stats";
import type { Expense } from "@/frontend/lib/types";
import { describe, expect, test } from "bun:test";

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "date">): Expense {
  return {
    walletId: "w1",
    kind: "expense",
    sub: "food",
    amount: 10,
    note: "",
    recurring: false,
    ...partial,
  };
}

describe("sortExpensesByDateDesc", () => {
  test("orders same-day rows by createdAt (latest entry first)", () => {
    const rows = sortExpensesByDateDesc([
      expense({
        id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        date: "2026-03-10",
        createdAt: "2026-03-10T08:00:00.000Z",
      }),
      expense({
        id: "bbbbbbbbbbbbbbbbbbbbbbbb",
        date: "2026-03-10",
        createdAt: "2026-03-10T18:00:00.000Z",
      }),
      expense({
        id: "cccccccccccccccccccccccc",
        date: "2026-03-10",
        createdAt: "2026-03-10T12:00:00.000Z",
      }),
    ]);

    expect(rows.map((r) => r.id)).toEqual([
      "bbbbbbbbbbbbbbbbbbbbbbbb",
      "cccccccccccccccccccccccc",
      "aaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
  });

  test("keeps newer dates before older dates", () => {
    const rows = sortExpensesByDateDesc([
      expense({ id: "a1", date: "2026-03-09" }),
      expense({ id: "b2", date: "2026-03-11" }),
    ]);

    expect(rows.map((r) => r.date)).toEqual(["2026-03-11", "2026-03-09"]);
  });
});
