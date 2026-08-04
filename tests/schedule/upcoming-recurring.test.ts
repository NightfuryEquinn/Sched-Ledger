import { describe, expect, test } from "bun:test";
import { collapseRecurringToNext, scheduleForMonth } from "@/frontend/lib/data";

type TestEvent = {
  id: string;
  date: string;
  repeat: string;
  allDay?: boolean;
  time?: string | null;
  title?: string;
  until?: string | null;
  exceptDates?: string[];
};

/** Minimal event for agenda collapsing tests. */
function ev(partial: Partial<TestEvent> & Pick<TestEvent, "id" | "date" | "repeat">): TestEvent {
  return {
    allDay: false,
    time: "09:00",
    title: partial.id,
    ...partial,
  };
}

/** Occurrences from today onward, the way the Schedule agenda builds them. */
function agenda(events: TestEvent[], monthKey: string, todayIso: string) {
  return scheduleForMonth(events, monthKey).filter((o) => o.iso >= todayIso);
}

const MONTH = "2026-08";

describe("collapseRecurringToNext", () => {
  test("daily event keeps today while its time is still ahead", () => {
    const daily = ev({ id: "d1", date: "2026-08-01", repeat: "daily", time: "18:00" });
    const now = new Date(2026, 7, 4, 9, 0);

    const out = collapseRecurringToNext(agenda([daily], MONTH, "2026-08-04"), now);

    expect(out.map((o) => o.iso)).toEqual(["2026-08-04"]);
  });

  test("daily event rolls to tomorrow once today's time has passed", () => {
    const daily = ev({ id: "d1", date: "2026-08-01", repeat: "daily", time: "09:00" });
    const now = new Date(2026, 7, 4, 15, 30);

    const out = collapseRecurringToNext(agenda([daily], MONTH, "2026-08-04"), now);

    expect(out.map((o) => o.iso)).toEqual(["2026-08-05"]);
  });

  test("an occurrence starting this minute still counts as upcoming", () => {
    const daily = ev({ id: "d1", date: "2026-08-01", repeat: "daily", time: "15:30" });
    const now = new Date(2026, 7, 4, 15, 30);

    const out = collapseRecurringToNext(agenda([daily], MONTH, "2026-08-04"), now);

    expect(out.map((o) => o.iso)).toEqual(["2026-08-04"]);
  });

  test("all-day recurring event stays on today for the whole day", () => {
    const daily = ev({ id: "d1", date: "2026-08-01", repeat: "daily", allDay: true, time: null });
    const now = new Date(2026, 7, 4, 23, 45);

    const out = collapseRecurringToNext(agenda([daily], MONTH, "2026-08-04"), now);

    expect(out.map((o) => o.iso)).toEqual(["2026-08-04"]);
  });

  test("weekly and monthly series each keep only their next occurrence", () => {
    const weekly = ev({ id: "w1", date: "2026-08-03", repeat: "weekly" });
    const monthly = ev({ id: "m1", date: "2026-08-20", repeat: "monthly" });
    const now = new Date(2026, 7, 4, 12, 0);

    const out = collapseRecurringToNext(agenda([weekly, monthly], MONTH, "2026-08-04"), now);

    expect(out.map((o) => [o.ev.id, o.iso])).toEqual([
      ["w1", "2026-08-10"],
      ["m1", "2026-08-20"],
    ]);
  });

  test("recurring series with nothing left this month drops out", () => {
    const monthly = ev({ id: "m1", date: "2026-08-04", repeat: "monthly", time: "08:00" });
    const now = new Date(2026, 7, 4, 12, 0);

    const out = collapseRecurringToNext(agenda([monthly], MONTH, "2026-08-04"), now);

    expect(out).toEqual([]);
  });

  test("one-time events pass through untouched", () => {
    const once = ev({ id: "o1", date: "2026-08-04", repeat: "once", time: "07:00" });
    const later = ev({ id: "o2", date: "2026-08-09", repeat: "once" });
    const now = new Date(2026, 7, 4, 12, 0);

    const out = collapseRecurringToNext(agenda([once, later], MONTH, "2026-08-04"), now);

    expect(out.map((o) => [o.ev.id, o.iso])).toEqual([
      ["o1", "2026-08-04"],
      ["o2", "2026-08-09"],
    ]);
  });

  test("collapsing preserves earliest-first ordering across series", () => {
    const daily = ev({ id: "d1", date: "2026-08-01", repeat: "daily", time: "07:00" });
    const once = ev({ id: "o1", date: "2026-08-04", repeat: "once", time: "20:00" });
    const weekly = ev({ id: "w1", date: "2026-08-06", repeat: "weekly", time: "10:00" });
    const now = new Date(2026, 7, 4, 12, 0);

    const out = collapseRecurringToNext(agenda([daily, once, weekly], MONTH, "2026-08-04"), now);

    expect(out.map((o) => [o.ev.id, o.iso])).toEqual([
      ["o1", "2026-08-04"],
      ["d1", "2026-08-05"],
      ["w1", "2026-08-06"],
    ]);
  });

  test("skipped occurrence dates are not treated as the next one", () => {
    const daily = ev({
      id: "d1",
      date: "2026-08-01",
      repeat: "daily",
      time: "09:00",
      exceptDates: ["2026-08-05"],
    });
    const now = new Date(2026, 7, 4, 15, 0);

    const out = collapseRecurringToNext(agenda([daily], MONTH, "2026-08-04"), now);

    expect(out.map((o) => o.iso)).toEqual(["2026-08-06"]);
  });
});
