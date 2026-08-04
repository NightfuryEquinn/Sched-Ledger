import { describe, expect, test } from "bun:test";
import { leadTimesForEvent } from "@/frontend/lib/data";
import {
  ALL_DAY_REMINDER_TIME,
  isOccurrencePast,
  isReminderDueNow,
  leadDescription,
  REMINDER_POLL_INTERVAL_MS,
  remindAtMs,
} from "@/lib/schedule";
import { zonedLocalToUtcMs } from "@/lib/timezone";
import { isLeadAllowedForEvent } from "@/schemas/common";
import { createEventSchema } from "@/schemas/event";

const TZ = "Asia/Kuala_Lumpur";

const allDayEvent = {
  date: "2026-08-10",
  allDay: true,
  time: null,
  repeat: "once",
  lead: "at",
} as const;

describe("all-day day-of reminders", () => {
  test("all-day events accept the day-of lead", () => {
    expect(isLeadAllowedForEvent("at", true)).toBe(true);
    expect(isLeadAllowedForEvent("1d", true)).toBe(true);
    expect(isLeadAllowedForEvent("30m", true)).toBe(false);
  });

  test("createEventSchema accepts an all-day event with the day-of lead", () => {
    const parsed = createEventSchema.safeParse({
      catId: "bill",
      date: "2026-08-10",
      allDay: true,
      notify: true,
      lead: "at",
      email: "user@example.com",
      enc: 1,
      payload: "ZW5jcnlwdGVk",
    });

    expect(parsed.success).toBe(true);
  });

  test("day-of reminder fires at 09:00 in the account timezone", () => {
    const remindAt = remindAtMs(allDayEvent, allDayEvent.date, TZ);

    expect(remindAt).toBe(zonedLocalToUtcMs(allDayEvent.date, ALL_DAY_REMINDER_TIME, TZ));
  });

  test("a poll landing shortly after 09:00 still sends the day-of reminder", () => {
    const remindAt = remindAtMs(allDayEvent, allDayEvent.date, TZ);
    const justAfter = remindAt + 5 * 60 * 1000;

    expect(isReminderDueNow(remindAt, justAfter)).toBe(true);
    expect(isOccurrencePast(remindAt, justAfter)).toBe(false);
  });

  test("occurrences beyond the poll window are treated as past", () => {
    const remindAt = remindAtMs(allDayEvent, allDayEvent.date, TZ);

    expect(isOccurrencePast(remindAt, remindAt + REMINDER_POLL_INTERVAL_MS + 1)).toBe(true);
  });

  test("day-before leads still anchor to 09:00 the previous day", () => {
    const remindAt = remindAtMs({ ...allDayEvent, lead: "1d" }, allDayEvent.date, TZ);

    expect(remindAt).toBe(zonedLocalToUtcMs("2026-08-09", ALL_DAY_REMINDER_TIME, TZ));
  });

  test("email copy describes the day-of lead without a clock time", () => {
    expect(leadDescription("at", true)).toBe("on the day of the event (9:00 AM)");
    expect(leadDescription("at", false)).toBe("at the time of the event");
  });

  test("the picker offers day-of plus whole-day options for all-day events", () => {
    expect(leadTimesForEvent(true).map((l) => l.id)).toEqual(["at", "1d", "2d"]);
    expect(leadTimesForEvent(false)).toHaveLength(8);
  });
});
