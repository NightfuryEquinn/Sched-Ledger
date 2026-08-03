import { describe, expect, test } from "bun:test";
import { reminderEmailHtml } from "@/api/lib/email";

describe("reminderEmailHtml", () => {
  test("falls back to the generic title when no plaintext copy was stored", () => {
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
    expect(html).not.toContain(">Hold<");
    expect(html).not.toContain("Comments");
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

  test("the notify row capitalizes the lead while the intro keeps it mid-sentence", () => {
    const { html } = reminderEmailHtml({
      title: "Fix Airconditioner",
      when: "Saturday, August 8, 2026 (All day)",
      category: "Appointment",
      lead: "on the day of the event (9:00 AM)",
      isConfirmation: true,
    });

    expect(html).toContain(">On the day of the event (9:00 AM)</td>");
    expect(html).toContain("We'll email you <strong>on the day of the event (9:00 AM)</strong>");
    expect(html).toContain("(All day)");
  });

  test("renders the event name, budget hold and comments when supplied", () => {
    const { subject, html, text } = reminderEmailHtml({
      title: "Dentist",
      when: "Mon, Jul 20 · 2:30 PM",
      category: "Appointment",
      lead: "1 day before",
      hold: "RM 120 from Health",
      comments: ["Bring card", "Ask about the crown"],
    });

    expect(subject).toBe("Upcoming: Dentist");
    expect(html).toContain("Dentist");
    expect(html).toContain(">Hold<");
    expect(html).not.toContain("Hold from budget");
    expect(html).toContain("RM 120 from Health");
    expect(html).toContain("Bring card");
    expect(html).toContain("Ask about the crown");
    expect(text).toContain('"Dentist"');
    expect(text).toContain("Hold: RM 120 from Health");
    expect(text).toContain("- Bring card");
  });

  test("escapes event content so markup cannot break the body", () => {
    const { html } = reminderEmailHtml({
      title: "<script>alert(1)</script>",
      when: "Tue, Jul 21",
      category: "Personal",
      lead: "1 day before",
      comments: ["<b>bold</b>"],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("blank comments do not render an empty section", () => {
    const { html, text } = reminderEmailHtml({
      title: "Rent",
      when: "Sat, Aug 1",
      category: "Bill / Payment",
      lead: "1 day before",
      comments: ["   "],
    });

    expect(html).not.toContain("Comments");
    expect(text).not.toContain("Comments");
  });
});
