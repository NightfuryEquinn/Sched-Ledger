import { describe, expect, test } from "bun:test";
import {
  ALL_DAY_REMINDER_TIME,
  reminderTargets,
  remindAtMs,
  type ScheduleEvent,
} from "@/lib/schedule";
import { zonedLocalToUtcMs } from "@/lib/timezone";

const TZ = "Asia/Kuala_Lumpur";

const timedEvent: ScheduleEvent = {
  date: "2026-08-10",
  allDay: false,
  time: "15:00",
  repeat: "once",
  lead: "1d",
};

const allDayEvent: ScheduleEvent = {
  date: "2026-08-10",
  allDay: true,
  time: null,
  repeat: "once",
  lead: "1d",
};

/** Sample close to the occurrence so `candidateOccurrenceDates` includes it. */
const NOW = new Date(zonedLocalToUtcMs("2026-08-09", "00:00", TZ));

describe("always-on at-event reminder", () => {
  test("a timed event with a lead adds a second target at the event's own start", () => {
    const targets = reminderTargets(timedEvent, NOW, TZ)
      .filter((t) => t.occurrenceIso === timedEvent.date)
      .filter((t) => t.kind === "lead");

    expect(targets).toHaveLength(2);

    const leadTarget = targets.find((t) => t.logLead === "1d")!;
    const atTarget = targets.find((t) => t.logLead === "at")!;

    expect(leadTarget).toBeDefined();
    expect(atTarget).toBeDefined();
    expect(atTarget.remindAtMs).toBe(
      remindAtMs({ ...timedEvent, lead: "at" }, timedEvent.date, TZ),
    );
    expect(leadTarget.remindAtMs).toBeLessThan(atTarget.remindAtMs);
  });

  test("choosing lead 'at' produces exactly one deduped target", () => {
    const targets = reminderTargets({ ...timedEvent, lead: "at" }, NOW, TZ).filter(
      (t) => t.occurrenceIso === timedEvent.date,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]!.logLead).toBe("at");
  });

  test("an all-day event's at-event target lands at 09:00 local on the event day", () => {
    const targets = reminderTargets(allDayEvent, NOW, TZ)
      .filter((t) => t.occurrenceIso === allDayEvent.date)
      .filter((t) => t.kind === "lead");

    const atTarget = targets.find((t) => t.logLead === "at")!;
    expect(atTarget).toBeDefined();
    expect(atTarget.remindAtMs).toBe(
      zonedLocalToUtcMs(allDayEvent.date, ALL_DAY_REMINDER_TIME, TZ),
    );
  });

  test("a multi-day all-day event never emits two targets at the same instant", () => {
    const multiDay: ScheduleEvent = { ...allDayEvent, endDate: "2026-08-12" };
    const targets = reminderTargets(multiDay, NOW, TZ).filter(
      (t) => t.occurrenceIso === multiDay.date,
    );

    const seen = new Set<number>();
    for (const t of targets) {
      expect(seen.has(t.remindAtMs)).toBe(false);
      seen.add(t.remindAtMs);
    }
  });
});
