const LOGO_CONTENT_ID = "sched-ledger-logo";

/** Brand mark markup shared by reminder email templates. */
function emailLogoHtml(): string {
  return `<img src="cid:${LOGO_CONTENT_ID}" alt="Sched Ledger" width="96" height="96" style="display:block;width:96px;height:96px;margin:0 0 20px;border:0" />`;
}

/**
 * Upper-case the first letter so table values read as standalone labels
 * ("On the day of the event"), while the same phrase stays lower-case where
 * it is embedded mid-sentence.
 */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Escape text for safe inclusion in HTML email bodies. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    ? `We'll email you <strong>${opts.lead}</strong> this event.`
    : `This is your reminder for an upcoming event.`;

  const comments = (opts.comments ?? []).filter((c) => c.trim());
  const commentsHtml = comments.length
    ? `<h3 style="margin:20px 0 8px;font-size:15px;color:#6b6560">Comments</h3>
  <ul style="margin:0;padding:0 0 0 18px;font-size:15px">
    ${comments.map((c) => `<li style="margin:0 0 6px">${escapeHtml(c)}</li>`).join("\n    ")}
  </ul>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#2a2520;max-width:480px;margin:0 auto;padding:24px">
  ${emailLogoHtml()}
  <h2 style="margin:0 0 12px;font-size:20px">${opts.isConfirmation ? "Reminder scheduled" : escapeHtml(opts.title)}</h2>
  <p style="margin:0 0 16px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px">
    <tr><td style="padding:6px 0;color:#6b6560">Event</td><td style="padding:6px 0"><strong>${escapeHtml(opts.title)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">When</td><td style="padding:6px 0">${escapeHtml(opts.when)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">Type</td><td style="padding:6px 0">${escapeHtml(opts.category)}</td></tr>
    ${opts.hold ? `<tr><td style="padding:6px 0;color:#6b6560">Hold</td><td style="padding:6px 0">${escapeHtml(opts.hold)}</td></tr>` : ""}
    ${opts.isConfirmation ? `<tr><td style="padding:6px 0;color:#6b6560">Notify</td><td style="padding:6px 0">${escapeHtml(capitalizeFirst(opts.lead))}</td></tr>` : ""}
  </table>
  ${commentsHtml}
  <p style="margin:20px 0 0;font-size:13px;color:#8a8480">— Sched Ledger</p>
</body>
</html>`;

  const lines = opts.isConfirmation
    ? [`Reminder set for "${opts.title}" on ${opts.when}. We'll notify you ${opts.lead}.`]
    : [`Reminder: "${opts.title}" on ${opts.when} (${opts.category}).`];

  if (opts.hold) lines.push(`Hold: ${opts.hold}`);
  if (comments.length) {
    lines.push("Comments:", ...comments.map((c) => `- ${c}`));
  }

  return { html, text: lines.join("\n"), subject };
}
