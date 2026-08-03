import { describe, expect, test } from "bun:test";
import { REPEATS, repeatLabel } from "@/frontend/lib/data";
import { dayBeforeIso, resolveEventDeleteAction } from "@/lib/delete-scope";
import { occursOn, type ScheduleEvent } from "@/lib/schedule";
import { createEventSchema } from "@/schemas/event";

/** Build a minimal repeating schedule event for occursOn tests. */
function ev(partial: Partial<ScheduleEvent> & Pick<ScheduleEvent, "date" | "repeat">): ScheduleEvent {
  return {
    allDay: true,
    time: null,
    lead: "1d",
    ...partial,
  };
}

describe("dayBeforeIso", () => {
  test("steps back across month boundaries", () => {
    expect(dayBeforeIso("2026-07-01")).toBe("2026-06-30");
    expect(dayBeforeIso("2026-03-01")).toBe("2026-02-28");
  });
});

describe("resolveEventDeleteAction", () => {
  test("this only adds an exception date", () => {
    expect(resolveEventDeleteAction("this", "2026-01-01", "2026-07-01")).toEqual({
      type: "except",
      date: "2026-07-01",
    });
  });

  test("all deletes the series", () => {
    expect(resolveEventDeleteAction("all", "2026-01-01", "2026-07-01")).toEqual({
      type: "delete",
    });
  });

  test("futures from the series start becomes a full delete", () => {
    expect(resolveEventDeleteAction("future", "2026-01-15", "2026-01-15")).toEqual({
      type: "delete",
    });
  });

  test("futures mid-series sets until to the day before", () => {
    expect(resolveEventDeleteAction("future", "2026-01-15", "2026-07-15")).toEqual({
      type: "until",
      until: "2026-07-14",
    });
  });
});

describe("biweekly repeat option", () => {
  test("createEventSchema accepts the biweekly repeat", () => {
    const parsed = createEventSchema.safeParse({
      catId: "bill",
      date: "2026-08-08",
      repeat: "biweekly",
      enc: 1,
      payload: "ZW5jcnlwdGVk",
    });

    expect(parsed.success).toBe(true);
  });

  test("the picker offers biweekly right after weekly", () => {
    expect(REPEATS.map((r) => r.id)).toEqual([
      "once",
      "daily",
      "weekly",
      "biweekly",
      "monthly",
      "yearly",
    ]);
    expect(repeatLabel({ repeat: "biweekly" })).toBe("Biweekly");
  });
});

describe("occursOn exceptDates and until", () => {
  test("skips excepted occurrence dates", () => {
    const event = ev({
      date: "2026-01-01",
      repeat: "monthly",
      exceptDates: ["2026-03-01"],
    });
    expect(occursOn(event, "2026-02-01")).toBe(true);
    expect(occursOn(event, "2026-03-01")).toBe(false);
    expect(occursOn(event, "2026-04-01")).toBe(true);
  });

  test("biweekly repeats every other week from the start date", () => {
    const event = ev({ date: "2026-08-08", repeat: "biweekly" });

    expect(occursOn(event, "2026-08-08")).toBe(true);
    expect(occursOn(event, "2026-08-15")).toBe(false);
    expect(occursOn(event, "2026-08-22")).toBe(true);
    expect(occursOn(event, "2026-09-05")).toBe(true);
    expect(occursOn(event, "2026-09-06")).toBe(false);
    expect(occursOn(event, "2026-08-01")).toBe(false);
  });

  test("biweekly stride survives a daylight-saving transition", () => {
    /* US DST ends 2026-11-01, so a naive local-time day diff would drift. */
    const event = ev({ date: "2026-10-24", repeat: "biweekly" });

    expect(occursOn(event, "2026-11-07")).toBe(true);
    expect(occursOn(event, "2026-11-21")).toBe(true);
    expect(occursOn(event, "2026-11-14")).toBe(false);
  });

  test("biweekly honours exceptDates and until", () => {
    const event = ev({
      date: "2026-08-08",
      repeat: "biweekly",
      exceptDates: ["2026-08-22"],
      until: "2026-09-05",
    });

    expect(occursOn(event, "2026-08-22")).toBe(false);
    expect(occursOn(event, "2026-09-05")).toBe(true);
    expect(occursOn(event, "2026-09-19")).toBe(false);
  });

  test("stops after until inclusive bound", () => {
    const event = ev({
      date: "2026-01-01",
      repeat: "monthly",
      until: "2026-03-01",
    });
    expect(occursOn(event, "2026-03-01")).toBe(true);
    expect(occursOn(event, "2026-04-01")).toBe(false);
  });
});
