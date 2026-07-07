type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const from = process.env.EMAIL_FROM?.trim() || "Ledger Sched <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

  if (!res.ok) {
    const error = payload.message ?? `Resend HTTP ${res.status}`;
    console.error("[email] send failed:", error);
    return { ok: false, error };
  }

  return { ok: true, id: payload.id ?? "unknown" };
}

export function reminderEmailHtml(opts: {
  title: string;
  when: string;
  category: string;
  lead: string;
  isConfirmation?: boolean;
}): { html: string; text: string; subject: string } {
  const subject = opts.isConfirmation
    ? `Reminder set: ${opts.title}`
    : `Upcoming: ${opts.title}`;

  const intro = opts.isConfirmation
    ? `We'll email you <strong>${opts.lead}</strong> this event.`
    : `This is your reminder for an upcoming event.`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#2a2520;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px;font-size:20px">${opts.isConfirmation ? "Reminder scheduled" : opts.title}</h2>
  <p style="margin:0 0 16px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px">
    <tr><td style="padding:6px 0;color:#6b6560">Event</td><td style="padding:6px 0"><strong>${escapeHtml(opts.title)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">When</td><td style="padding:6px 0">${escapeHtml(opts.when)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">Type</td><td style="padding:6px 0">${escapeHtml(opts.category)}</td></tr>
    ${opts.isConfirmation ? `<tr><td style="padding:6px 0;color:#6b6560">Notify</td><td style="padding:6px 0">${escapeHtml(opts.lead)}</td></tr>` : ""}
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#8a8480">— Ledger Sched</p>
</body>
</html>`;

  const text = opts.isConfirmation
    ? `Reminder set for "${opts.title}" on ${opts.when}. We'll notify you ${opts.lead}.`
    : `Reminder: "${opts.title}" on ${opts.when} (${opts.category}).`;

  return { html, text, subject };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
