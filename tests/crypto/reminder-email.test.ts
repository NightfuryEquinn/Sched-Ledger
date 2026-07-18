import { describe, expect, test } from "bun:test";
import { reminderEmailHtml } from "@/api/lib/email";

describe("reminderEmailHtml", () => {
  test("uses the provided generic title and does not invent event content", () => {
    const { subject, html, text } = reminderEmailHtml({
      title: "Upcoming event",
      when: "Mon, Jul 20 · 2:30 PM",
      category: "Appointment",
      lead: "1 day before",
    });

    expect(subject).toBe("Upcoming: Upcoming event");
    expect(html).toContain("Upcoming event");
    expect(html).toContain("Appointment");
    expect(html).not.toContain("Dentist");
    expect(text).toContain("Upcoming event");
    expect(text).not.toContain("Dentist");
  });

  test("confirmation copy uses the same generic title", () => {
    const { subject, text } = reminderEmailHtml({
      title: "Upcoming event",
      when: "Tue, Jul 21",
      category: "Bill / Payment",
      lead: "1 day before",
      isConfirmation: true,
    });

    expect(subject).toBe("Reminder set: Upcoming event");
    expect(text).toContain("Upcoming event");
  });
});
