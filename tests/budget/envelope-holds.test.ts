import { describe, expect, test } from "bun:test";
import {
  holdsByCategory,
  isActiveHoldOccurrence,
  isHoldReleased,
  releaseHoldForOccurrence,
  totalActiveHolds,
} from "@/frontend/lib/envelope-holds";
import type { LedgerEvent } from "@/frontend/lib/types";

/** Minimal bill event with an encrypted-style hold configuration. */
function billEvent(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: "ev1",
    title: "Costco run",
    catId: "bill",
    date: "2026-07-15",
    allDay: true,
    time: null,
    repeat: "once",
    notify: false,
    lead: "1d",
    email: "",
    comments: [],
    budgetHoldEnabled: true,
    budgetHoldAmount: 150,
    budgetHoldCategoryId: "food",
    ...overrides,
  };
}

describe("envelope holds", () => {
  test("counts active holds by category for the month", () => {
    const events = [
      billEvent(),
      billEvent({
        id: "ev2",
        date: "2026-07-20",
        budgetHoldAmount: 80,
        budgetHoldCategoryId: "food",
      }),
      billEvent({
        id: "ev3",
        date: "2026-07-10",
        budgetHoldCategoryId: "transport",
        budgetHoldAmount: 40,
      }),
    ];

    expect(holdsByCategory(events, "2026-07")).toEqual({
      food: 230,
      transport: 40,
    });
    expect(totalActiveHolds(events, "2026-07")).toBe(270);
  });

  test("released occurrence is excluded from holds", () => {
    const events = [
      billEvent({
        budgetHoldReleasedDates: ["2026-07-15"],
      }),
    ];

    expect(isActiveHoldOccurrence(events[0], "2026-07-15")).toBe(false);
    expect(totalActiveHolds(events, "2026-07")).toBe(0);
  });

  test("linked one-time payment implicitly releases the anchor hold", () => {
    const ev = billEvent({ expenseId: "exp1" });

    expect(isHoldReleased(ev, "2026-07-15")).toBe(true);
  });

  test("releaseHoldForOccurrence appends the occurrence date", () => {
    const ev = billEvent();
    const next = releaseHoldForOccurrence(ev, "2026-07-15");

    expect(next.budgetHoldReleasedDates).toEqual(["2026-07-15"]);
    expect(isActiveHoldOccurrence(next, "2026-07-15")).toBe(false);
  });
});
