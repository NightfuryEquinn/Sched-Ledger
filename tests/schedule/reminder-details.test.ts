import { describe, expect, test } from "bun:test";
import { keepReminderDetails, reminderDetailsUpdate } from "@/api/lib/reminder-details";

const details = { title: "Rent", comments: [] };

describe("keepReminderDetails", () => {
  test("keeps the copy when notify is on and details exist", () => {
    expect(keepReminderDetails({ details, notify: true })).toBe(true);
  });

  test("drops the copy when notify is off", () => {
    expect(keepReminderDetails({ details, notify: false })).toBe(false);
  });

  test("drops the copy when details are missing", () => {
    expect(keepReminderDetails({ notify: true })).toBe(false);
    expect(keepReminderDetails({ details: null, notify: true })).toBe(false);
  });
});

describe("reminderDetailsUpdate", () => {
  test("sets the copy when reminders stay on", () => {
    const update = reminderDetailsUpdate({ details, notify: true });
    expect(update).toEqual({ set: details });
  });

  test("clears the copy when details are explicitly cleared", () => {
    const update = reminderDetailsUpdate({ details: null, notify: true });
    expect(update).toEqual({ unset: true });
  });

  test("clears the copy when notify is turned off", () => {
    const update = reminderDetailsUpdate({ notify: false });
    expect(update).toEqual({ unset: true });
  });

  test("leaves the copy untouched when the request omits details", () => {
    const update = reminderDetailsUpdate({ notify: true });
    expect(update).toEqual({});
  });
});
