import { describe, expect, test } from "bun:test";
import {
  HABIT_MIN_ACTIVE_DAYS,
  assessSpendingHabit,
  pickHabitStyle,
  scoreHabitStyles,
} from "@/frontend/lib/spendingHabits";
import type { Expense } from "@/frontend/lib/types";

/** Build a minimal outgoing expense for habit tests. */
function tx(date: string, amount: number, id = date + amount): Expense {
  return {
    id,
    walletId: "w1",
    kind: "expense",
    date,
    sub: "food-groceries",
    amount,
    note: "",
    recurring: false,
  };
}

describe("assessSpendingHabit", () => {
  test("stays locked until five distinct transaction days", () => {
    const expenses = [
      tx("2026-07-01", 10),
      tx("2026-07-02", 12),
      tx("2026-07-03", 8),
      tx("2026-07-04", 9),
    ];
    const result = assessSpendingHabit(expenses, "month", "2026-07");
    expect(result.status).toBe("insufficient");
    if (result.status === "insufficient") {
      expect(result.daysHave).toBe(4);
      expect(result.daysNeeded).toBe(HABIT_MIN_ACTIVE_DAYS);
    }
  });

  test("unlocks on the fifth active day for the selected month", () => {
    const expenses = [
      tx("2026-07-01", 10),
      tx("2026-07-02", 12),
      tx("2026-07-03", 8),
      tx("2026-07-04", 9),
      tx("2026-07-05", 11),
    ];
    const result = assessSpendingHabit(expenses, "month", "2026-07");
    expect(result.status).toBe("ready");
  });

  test("month and year assessments use different windows", () => {
    const expenses = [
      tx("2026-01-01", 40),
      tx("2026-01-08", 40),
      tx("2026-01-15", 40),
      tx("2026-01-22", 40),
      tx("2026-01-29", 40),
      tx("2026-07-01", 5),
      tx("2026-07-02", 6),
      tx("2026-07-03", 4),
      tx("2026-07-04", 5),
      tx("2026-07-05", 7),
      tx("2026-07-06", 5),
      tx("2026-07-07", 6),
      tx("2026-07-08", 5),
      tx("2026-07-09", 4),
      tx("2026-07-10", 5),
      tx("2026-07-11", 6),
      tx("2026-07-12", 5),
      tx("2026-07-13", 4),
      tx("2026-07-14", 5),
      tx("2026-07-15", 6),
      tx("2026-07-16", 5),
      tx("2026-07-17", 4),
      tx("2026-07-18", 5),
      tx("2026-07-19", 6),
      tx("2026-07-20", 5),
    ];

    const month = assessSpendingHabit(expenses, "month", "2026-07");
    const year = assessSpendingHabit(expenses, "year", "2026-07");
    expect(month.status).toBe("ready");
    expect(year.status).toBe("ready");
    if (month.status === "ready" && year.status === "ready") {
      expect(month.style.id).toBe("dripper");
      expect(year.txCount).toBeGreaterThan(month.txCount);
    }
  });
});

describe("scoreHabitStyles", () => {
  test("detects clockwork fixed-interval equal amounts", () => {
    const expenses = [
      tx("2026-07-01", 49.99),
      tx("2026-07-08", 49.99),
      tx("2026-07-15", 49.99),
      tx("2026-07-22", 49.99),
      tx("2026-07-29", 49.99),
    ];
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("clockwork");
  });

  test("detects burst clusters after quiet stretches", () => {
    const expenses = [
      tx("2026-07-01", 8),
      tx("2026-07-02", 5),
      tx("2026-07-08", 12),
      tx("2026-07-18", 90, "b1"),
      tx("2026-07-18", 45, "b2"),
      tx("2026-07-18", 120, "b3"),
      tx("2026-07-19", 75, "b4"),
      tx("2026-07-19", 33, "b5"),
      tx("2026-07-19", 210, "b6"),
    ];
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("burst");
  });

  test("detects steady dripper micro-spending", () => {
    const expenses: Expense[] = [];
    for (let d = 1; d <= 22; d++) {
      const day = String(d).padStart(2, "0");
      expenses.push(tx(`2026-07-${day}`, 4 + (d % 5), `d${d}`));
    }
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("dripper");
  });

  test("detects peak-and-valley payday taper", () => {
    const expenses = [
      tx("2026-07-01", 320),
      tx("2026-07-02", 180),
      tx("2026-07-03", 95),
      tx("2026-07-08", 40),
      tx("2026-07-15", 18),
      tx("2026-07-22", 8),
      tx("2026-07-28", 4),
    ];
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("peakValley");
  });

  test("detects calculated accumulator on one weekday", () => {
    // All Saturdays in July 2026: 4, 11, 18, 25
    const expenses = [
      tx("2026-07-04", 180),
      tx("2026-07-11", 210),
      tx("2026-07-18", 195),
      tx("2026-07-25", 240),
      tx("2026-07-25", 85, "extra"),
    ];
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("accumulator");
  });

  test("detects erratic nomad irregular pattern", () => {
    const expenses = [
      tx("2026-07-01", 2),
      tx("2026-07-03", 480),
      tx("2026-07-06", 17),
      tx("2026-07-10", 3),
      tx("2026-07-11", 220),
      tx("2026-07-16", 9),
      tx("2026-07-20", 55),
      tx("2026-07-24", 4),
      tx("2026-07-29", 310),
    ];
    const scores = scoreHabitStyles(expenses);
    expect(pickHabitStyle(scores)).toBe("nomad");
  });
});
