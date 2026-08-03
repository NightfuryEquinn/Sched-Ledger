import { describe, expect, test } from "bun:test";
import { keepReminderDetails, reminderDetailsUpdate } from "@/api/lib/reminder-details";
import type { ReminderDetails } from "@/schemas/event";

const details: ReminderDetails = {
  title: "Dentist",
  hold: { amount: 120, currency: "MYR", categoryName: "Health" },
  comments: ["Bring card"],
};

describe("keepReminderDetails", () => {
  test("stores the plaintext copy when a reminder email is configured", () => {
    expect(keepReminderDetails({ details, notify: true, email: "you@mail.com" })).toBe(true);
  });

  test("drops the copy when notify is off or no address is set", () => {
    expect(keepReminderDetails({ details, notify: false, email: "you@mail.com" })).toBe(false);
    expect(keepReminderDetails({ details, notify: true, email: "" })).toBe(false);
    expect(keepReminderDetails({ details, notify: true, email: "   " })).toBe(false);
  });

  test("nothing to store without details", () => {
    expect(keepReminderDetails({ notify: true, email: "you@mail.com" })).toBe(false);
    expect(keepReminderDetails({ details: null, notify: true, email: "you@mail.com" })).toBe(false);
  });
});

describe("reminderDetailsUpdate", () => {
  test("sets a fresh copy while reminders stay on", () => {
    const update = reminderDetailsUpdate({ details, notify: true, email: "you@mail.com" });

    expect(update.set).toEqual(details);
    expect(update.unset).toBeUndefined();
  });

  test("explicit null clears the stored copy", () => {
    const update = reminderDetailsUpdate({ details: null, notify: true, email: "you@mail.com" });

    expect(update.set).toBeUndefined();
    expect(update.unset).toBe(true);
  });

  test("turning notify off clears a copy the request never mentioned", () => {
    const update = reminderDetailsUpdate({ notify: false, email: "you@mail.com" });

    expect(update.unset).toBe(true);
  });

  test("clearing the address clears the copy", () => {
    const update = reminderDetailsUpdate({ details, notify: true, email: "" });

    expect(update.set).toBeUndefined();
    expect(update.unset).toBe(true);
  });

  test("an unrelated patch leaves the stored copy untouched", () => {
    const update = reminderDetailsUpdate({ notify: true, email: "you@mail.com" });

    expect(update.set).toBeUndefined();
    expect(update.unset).toBeUndefined();
  });

  test("set and unset never target the same path", () => {
    for (const notify of [true, false]) {
      for (const value of [details, null, undefined]) {
        const update = reminderDetailsUpdate({ details: value, notify, email: "you@mail.com" });
        expect(Boolean(update.set) && Boolean(update.unset)).toBe(false);
      }
    }
  });
});
