import { describe, expect, test } from "bun:test";
import { buildExpenseUpdate } from "@/api/lib/expense-update";
import type { UpdateExpenseInput } from "@/schemas/expense";
import { ObjectId } from "mongodb";

const WALLET_ID = "64b64c4f2f1c2e0012345678";
const EVENT_ID = "64b64c4f2f1c2e0087654321";

/** Build a PATCH body shaped like the encrypted client payload. */
function body(partial: Partial<UpdateExpenseInput>): UpdateExpenseInput {
  return { enc: 1, payload: "enc-blob", ...partial } as UpdateExpenseInput;
}

/** Paths written by both operators are what Mongo rejects with code 40. */
function conflictingPaths(update: ReturnType<typeof buildExpenseUpdate>): string[] {
  const unset = update.$unset ?? {};
  return Object.keys(update.$set).filter((key) => key in unset);
}

describe("buildExpenseUpdate", () => {
  test("clearing seriesKey unsets it without a conflicting $set", () => {
    const update = buildExpenseUpdate(body({ recurring: false, seriesKey: null }));

    expect(conflictingPaths(update)).toEqual([]);
    expect("seriesKey" in update.$set).toBe(false);
    expect(update.$unset?.seriesKey).toBe("");
    expect(update.$set.recurring).toBe(false);
  });

  test("never leaves an undefined value in $set", () => {
    const update = buildExpenseUpdate(body({ recurring: false, seriesKey: null, eventId: null }));

    for (const [key, value] of Object.entries(update.$set)) {
      expect([key, value]).not.toEqual([key, undefined]);
    }
  });

  test("a new seriesKey is set and not unset", () => {
    const update = buildExpenseUpdate(
      body({ recurring: "monthly", seriesKey: "a".repeat(64), walletId: WALLET_ID }),
    );

    expect(conflictingPaths(update)).toEqual([]);
    expect(update.$set.seriesKey).toBe("a".repeat(64));
    expect(update.$unset?.seriesKey).toBeUndefined();
    expect(update.$set.walletId).toBeInstanceOf(ObjectId);
  });

  test("omitting seriesKey leaves the stored key untouched", () => {
    const update = buildExpenseUpdate(body({ date: "2026-07-01" }));

    expect("seriesKey" in update.$set).toBe(false);
    expect(update.$unset?.seriesKey).toBeUndefined();
  });

  test("clearing eventId unsets it without a conflicting $set", () => {
    const update = buildExpenseUpdate(body({ eventId: null }));

    expect(conflictingPaths(update)).toEqual([]);
    expect("eventId" in update.$set).toBe(false);
    expect(update.$unset?.eventId).toBe("");
  });

  test("an encrypted payload retires the legacy plaintext columns", () => {
    const update = buildExpenseUpdate(body({ eventId: EVENT_ID }));

    expect(update.$unset).toEqual({ sub: "", amount: "", note: "" });
    expect(update.$set.payload).toBe("enc-blob");
    expect(update.$set.eventId).toBeInstanceOf(ObjectId);
  });

  test("a metadata-only patch carries no $unset", () => {
    const update = buildExpenseUpdate({ date: "2026-07-01" } as UpdateExpenseInput);

    expect(update.$unset).toBeUndefined();
    expect(update.$set.date).toBe("2026-07-01");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });
});
