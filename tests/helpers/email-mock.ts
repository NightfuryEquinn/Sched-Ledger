import { budgetAlertEmailHtml } from "@/api/lib/email";
import { reminderEmailHtml } from "@/api/lib/reminder-email-html";
import { mock } from "bun:test";

type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

type EmailMockOverrides = {
  emailConfigured?: () => boolean;
  sendEmail?: (input: { to: string; subject: string; html: string; text?: string }) => Promise<SendEmailResult>;
};

/** Mock outbound email while keeping real HTML template implementations. */
export function installEmailMock(overrides: EmailMockOverrides = {}) {
  mock.module("@/api/lib/email", () => ({
    emailConfigured: overrides.emailConfigured ?? (() => false),
    sendEmail: overrides.sendEmail ?? (async () => ({ ok: true, id: "test" })),
    reminderEmailHtml,
    budgetAlertEmailHtml,
  }));
}
