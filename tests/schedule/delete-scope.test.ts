import { describe, expect, test } from "bun:test";
import { dayBeforeIso, resolveEventDeleteAction } from "@/lib/delete-scope";
import { occursOn, type ScheduleEvent } from "@/lib/schedule";

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
