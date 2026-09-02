import { describe, expect, test } from "bun:test";
import {
  applyTransferFields,
  crossTypeWarning,
  expensesMatchingSubs,
  kindForDestType,
  retryAfterFromError,
  runPacedTransfer,
} from "@/frontend/lib/category-transfer";
import type { Expense } from "@/frontend/lib/types";

function tx(id: string, sub: string, kind: "expense" | "income" = "expense"): Expense {
  return {
    id,
    walletId: "w1",
    kind,
    date: "2026-07-01",
    sub,
    amount: 10,
    note: "",
    recurring: false,
  };
}

describe("applyTransferFields", () => {
  test("sets kind income when dest is income", () => {
    const next = applyTransferFields(tx("1", "groceries"), "salary", "income");

    expect(next.sub).toBe("salary");
    expect(next.kind).toBe("income");
  });

  test("sets kind expense when dest is savings and clears capitalPlanId off a non-savings dest", () => {
    const withPlan = { ...tx("1", "saving"), capitalPlanId: "plan_1" };
    const toFood = applyTransferFields(withPlan, "groceries", "expense");
    const toPiggy = applyTransferFields(withPlan, "saving_2", "savings");

    expect(toFood.kind).toBe("expense");
    expect(toFood.capitalPlanId).toBeUndefined();
    expect(toPiggy.kind).toBe("expense");
    expect(toPiggy.capitalPlanId).toBe("plan_1");
  });

  test("kindForDestType maps savings to expense", () => {
    expect(kindForDestType("savings")).toBe("expense");
    expect(kindForDestType("expense")).toBe("expense");
    expect(kindForDestType("income")).toBe("income");
  });
});

describe("crossTypeWarning", () => {
  test("is silent for same-type moves", () => {
    expect(
      crossTypeWarning(3, "Food / Groceries", "Transport / Petrol", "expense", "expense"),
    ).toBeNull();
  });

  test("names the recategorization when types differ", () => {
    expect(crossTypeWarning(24, "Food / Groceries", "Income / Salary", "expense", "income")).toBe(
      "24 Food / Groceries transactions will become Income / Salary.",
    );
  });
});

describe("runPacedTransfer", () => {
  test("caps concurrency at 2", async () => {
    let inFlight = 0;
    let max = 0;
    const items = [1, 2, 3, 4, 5];

    const result = await runPacedTransfer(
      items,
      async () => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
      { sleep: async () => undefined, isHidden: () => false, progressIntervalMs: 0 },
    );

    expect(result.remaining).toEqual([]);
    expect(max).toBeLessThanOrEqual(2);
    expect(result.completed).toHaveLength(5);
  });

  test("coalesces progress callbacks", async () => {
    let ticks = 0;
    let clock = 0;
    const items = [1, 2, 3, 4];

    await runPacedTransfer(items, async () => undefined, {
      sleep: async () => undefined,
      isHidden: () => false,
      now: () => clock,
      progressIntervalMs: 100,
      onProgress: () => {
        ticks += 1;
        clock += 10;
      },
    });

    /* Start + (throttled middles skipped) + forced completion. */
    expect(ticks).toBeGreaterThanOrEqual(2);
    expect(ticks).toBeLessThan(items.length + 2);
  });

  test("429 retries the same item and does not treat the run as complete until it succeeds", async () => {
    const attempts = new Map<string, number>();
    const items = ["a", "b"];

    const result = await runPacedTransfer(
      items,
      async (id) => {
        const n = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, n);
        if (id === "a" && n === 1) {
          const err = Object.assign(new Error("rate"), { status: 429 });
          throw err;
        }
      },
      { sleep: async () => undefined, isHidden: () => false, progressIntervalMs: 0 },
    );

    expect(result.remaining).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(attempts.get("a")).toBe(2);
    expect([...result.completed].sort()).toEqual(["a", "b"]);
  });

  test("a non-429 error stops the run with remaining items", async () => {
    const items = ["a", "b", "c"];
    const result = await runPacedTransfer(
      items,
      async (id) => {
        if (id === "b") throw new Error("nope");
      },
      {
        sleep: async () => undefined,
        isHidden: () => false,
        progressIntervalMs: 0,
        concurrency: 1,
      },
    );

    expect(result.completed).toEqual(["a"]);
    expect(result.remaining[0]).toBe("b");
    expect(result.error).toBeInstanceOf(Error);
  });

  test("pauses while hidden then resumes", async () => {
    let hidden = true;
    let polls = 0;

    const result = await runPacedTransfer(["x"], async () => undefined, {
      isHidden: () => hidden,
      sleep: async () => {
        polls += 1;
        hidden = false;
      },
      hiddenPollMs: 1,
      progressIntervalMs: 0,
    });

    expect(polls).toBeGreaterThan(0);
    expect(result.completed).toEqual(["x"]);
  });
});

describe("retryAfterFromError", () => {
  test("returns the default wait for a 429 without a header", () => {
    expect(retryAfterFromError({ status: 429 })).toBe(1000);
  });

  test("returns null for other errors", () => {
    expect(retryAfterFromError({ status: 500 })).toBeNull();
    expect(retryAfterFromError(new Error("x"))).toBeNull();
  });
});

describe("expensesMatchingSubs", () => {
  test("selects only the source sub ids", () => {
    const rows = [tx("1", "groceries"), tx("2", "salary", "income"), tx("3", "meal")];
    const matched = expensesMatchingSubs(rows, new Set(["groceries", "meal"]));

    expect(matched.map((e) => e.id)).toEqual(["1", "3"]);
  });
});
