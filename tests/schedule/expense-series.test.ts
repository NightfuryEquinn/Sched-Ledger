import { describe, expect, test } from "bun:test";
import { expenseSeriesFilter, shouldRetireOldExpenseSeries } from "@/api/lib/expense-delete-scope";
import type { ExpenseDocument } from "@/db/collections";
import { ObjectId } from "mongodb";

/** Build a minimal expense document for series-filter tests. */
function doc(
  partial: Partial<ExpenseDocument> & Pick<ExpenseDocument, "date" | "recurring">,
): ExpenseDocument {
  return {
    _id: new ObjectId(),
    accountId: "64b64c4f2f1c2e0012345678",
    walletId: new ObjectId("64b64c4f2f1c2e0012345678"),
    kind: "expense",
    enc: 1,
    payload: "enc",
    seriesKey: "series-abc",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as ExpenseDocument;
}

describe("expenseSeriesFilter", () => {
  test("uses seriesKey for encrypted recurring expenses", () => {
    const expense = doc({ date: "2026-07-01", recurring: "monthly" });
    expect(expenseSeriesFilter(expense, "64b64c4f2f1c2e0012345678")).toMatchObject({
      accountId: "64b64c4f2f1c2e0012345678",
      walletId: expense.walletId,
      seriesKey: "series-abc",
    });
  });

  test("falls back to legacy sub/note/recurring when unencrypted", () => {
    const expense = doc({
      date: "2026-07-01",
      recurring: "monthly",
      enc: undefined,
      payload: undefined,
      seriesKey: undefined,
      sub: "food-groceries",
      note: "Rent",
      amount: 100,
    });
    expect(expenseSeriesFilter(expense, "64b64c4f2f1c2e0012345678")).toMatchObject({
      accountId: "64b64c4f2f1c2e0012345678",
      walletId: expense.walletId,
      sub: "food-groceries",
      note: "Rent",
      recurring: { $in: [true, "monthly"] },
    });
  });
});

describe("shouldRetireOldExpenseSeries", () => {
  test("retires when frequency changes monthly to quarterly", () => {
    expect(
      shouldRetireOldExpenseSeries(
        { recurring: "monthly", seriesKey: "old" },
        { recurring: "quarterly", seriesKey: "new" },
      ),
    ).toBe(true);
  });

  test("retires when recurrence is turned off", () => {
    expect(
      shouldRetireOldExpenseSeries(
        { recurring: "monthly", seriesKey: "old" },
        { recurring: false, seriesKey: null },
      ),
    ).toBe(true);
  });

  test("does not retire when cadence and seriesKey stay the same", () => {
    expect(
      shouldRetireOldExpenseSeries(
        { recurring: "monthly", seriesKey: "same" },
        { recurring: "monthly", seriesKey: "same" },
      ),
    ).toBe(false);
  });

  test("does not retire non-recurring expenses", () => {
    expect(
      shouldRetireOldExpenseSeries(
        { recurring: false, seriesKey: undefined },
        { recurring: "monthly", seriesKey: "new" },
      ),
    ).toBe(false);
  });
});
