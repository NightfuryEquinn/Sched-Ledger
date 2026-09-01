import { escapeHtml, wrapEmailBody } from "@/api/lib/email-layout";

/**
 * Upper-case the first letter so table values read as standalone labels
 * ("On the day of the event"), while the same phrase stays lower-case where
 * it is embedded mid-sentence.
 */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build reminder / confirmation email subject, HTML, and plain text.
 * Title falls back to a generic label when the event has no plaintext copy for
 * delivery (content is E2EE, so the server has nothing else to render).
 * `hold` and `comments` are rendered only when the client supplied them.
 */
export function reminderEmailHtml(opts: {
  title: string;
  when: string;
  category: string;
  lead: string;
  hold?: string;
  comments?: string[];
  isConfirmation?: boolean;
}): { html: string; text: string; subject: string } {
  const subject = opts.isConfirmation
    ? `Reminder set: ${opts.title}`
    : `Upcoming: ${opts.title}`;

  const intro = opts.isConfirmation
    ? `We'll email you <strong>${escapeHtml(opts.lead)}</strong> this event.`
    : "This is your reminder for an upcoming event.";

  const comments = (opts.comments ?? []).filter((c) => c.trim());

  const detailRows = [
    ...(opts.isConfirmation
      ? [{ label: "Event", value: escapeHtml(opts.title), strong: true }]
      : []),
    { label: "When", value: escapeHtml(opts.when) },
    { label: "Type", value: escapeHtml(opts.category) },
    ...(opts.hold ? [{ label: "Hold", value: escapeHtml(opts.hold) }] : []),
    ...(opts.isConfirmation
      ? [{ label: "Notify", value: escapeHtml(capitalizeFirst(opts.lead)) }]
      : []),
  ];

  const html = wrapEmailBody({
    heading: opts.isConfirmation ? "Reminder scheduled" : escapeHtml(opts.title),
    introHtml: intro,
    detailRows,
    comments,
  });

  const lines = opts.isConfirmation
    ? [`Reminder set for "${opts.title}" on ${opts.when}. We'll notify you ${opts.lead}.`]
    : [`Reminder: "${opts.title}" on ${opts.when} (${opts.category}).`];

  if (opts.hold) lines.push(`Hold: ${opts.hold}`);
  if (comments.length) {
    lines.push("Comments:", ...comments.map((c) => `- ${c}`));
  }

  return { html, text: lines.join("\n"), subject };
}
