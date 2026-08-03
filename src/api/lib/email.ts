const LOGO_CONTENT_ID = "sched-ledger-logo";

/** Injected by build.ts into the Vercel API bundle; unset in local/dev. */
declare const __EMAIL_LOGO_BASE64__: string | undefined;

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

type LogoAttachment = {
  content: string;
  filename: string;
  content_type: string;
  content_id: string;
};

let logoBase64: string | undefined;

/** Whether Resend is configured via RESEND_API_KEY. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Resolve logo base64 for CID attachments.
 * Production embeds bytes via Bun.build define (no sidecar file on Vercel).
 * Local/dev reads the source PNG from disk.
 */
async function loadLogoBase64(): Promise<string> {
  const embedded = typeof __EMAIL_LOGO_BASE64__ === "string" ? __EMAIL_LOGO_BASE64__ : "";

  if (embedded) {
    return embedded;
  }

  const file = Bun.file(new URL("../../frontend/assets/logo.png", import.meta.url));
  const bytes = await file.arrayBuffer();

  return Buffer.from(bytes).toString("base64");
}

/** Load the brand logo as base64 for Resend inline (CID) attachments. */
async function getLogoAttachment(): Promise<LogoAttachment> {
  if (!logoBase64) {
    logoBase64 = await loadLogoBase64();
  }

  return {
    content: logoBase64,
    filename: "logo.png",
    content_type: "image/png",
    content_id: LOGO_CONTENT_ID,
  };
}

/** Brand mark markup shared by all transactional email templates. */
function emailLogoHtml(): string {
  return `<img src="cid:${LOGO_CONTENT_ID}" alt="Sched Ledger" width="96" height="96" style="display:block;width:96px;height:96px;margin:0 0 20px;border:0" />`;
}

/** Send a transactional email via Resend, embedding the Sched Ledger logo. */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");

    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const from = process.env.EMAIL_FROM?.trim() || "Sched Ledger <onboarding@resend.dev>";
  const logo = await getLogoAttachment();

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
      attachments: [logo],
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
    ${opts.hold ? `<tr><td style="padding:6px 0;color:#6b6560">Hold from budget</td><td style="padding:6px 0">${escapeHtml(opts.hold)}</td></tr>` : ""}
    ${opts.isConfirmation ? `<tr><td style="padding:6px 0;color:#6b6560">Notify</td><td style="padding:6px 0">${escapeHtml(opts.lead)}</td></tr>` : ""}
  </table>
  ${commentsHtml}
  <p style="margin:20px 0 0;font-size:13px;color:#8a8480">— Sched Ledger</p>
</body>
</html>`;

  const lines = opts.isConfirmation
    ? [`Reminder set for "${opts.title}" on ${opts.when}. We'll notify you ${opts.lead}.`]
    : [`Reminder: "${opts.title}" on ${opts.when} (${opts.category}).`];

  if (opts.hold) lines.push(`Hold from budget: ${opts.hold}`);
  if (comments.length) {
    lines.push("Comments:", ...comments.map((c) => `- ${c}`));
  }

  return { html, text: lines.join("\n"), subject };
}

/** Build budget warning / exceeded email subject, HTML, and plain text. */
export function budgetAlertEmailHtml(opts: {
  categoryName: string;
  level: "warning" | "exceeded";
  spentLabel: string;
  budgetLabel: string;
  percent: number;
  monthLabel: string;
  walletName?: string;
}): { html: string; text: string; subject: string } {
  const near = opts.level === "warning";
  const subject = near
    ? `Budget alert: ${opts.categoryName} is ${opts.percent}% used`
    : `Budget exceeded: ${opts.categoryName}`;

  const intro = near
    ? `Your <strong>${escapeHtml(opts.categoryName)}</strong> budget is nearing its limit for ${escapeHtml(opts.monthLabel)}.`
    : `Your <strong>${escapeHtml(opts.categoryName)}</strong> budget has been exceeded for ${escapeHtml(opts.monthLabel)}.`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#2a2520;max-width:480px;margin:0 auto;padding:24px">
  ${emailLogoHtml()}
  <h2 style="margin:0 0 12px;font-size:20px">${near ? "Nearing budget limit" : "Budget exceeded"}</h2>
  <p style="margin:0 0 16px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px">
    <tr><td style="padding:6px 0;color:#6b6560">Category</td><td style="padding:6px 0"><strong>${escapeHtml(opts.categoryName)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">Spent</td><td style="padding:6px 0">${escapeHtml(opts.spentLabel)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">Budget</td><td style="padding:6px 0">${escapeHtml(opts.budgetLabel)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b6560">Used</td><td style="padding:6px 0">${opts.percent}%</td></tr>
    ${opts.walletName ? `<tr><td style="padding:6px 0;color:#6b6560">Wallet</td><td style="padding:6px 0">${escapeHtml(opts.walletName)}</td></tr>` : ""}
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#8a8480">— Sched Ledger</p>
</body>
</html>`;

  const text = near
    ? `Budget alert: ${opts.categoryName} is ${opts.percent}% used (${opts.spentLabel} of ${opts.budgetLabel}) for ${opts.monthLabel}.`
    : `Budget exceeded: ${opts.categoryName} — ${opts.spentLabel} of ${opts.budgetLabel} for ${opts.monthLabel}.`;

  return { html, text, subject };
}

/** Escape text for safe inclusion in HTML email bodies. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
