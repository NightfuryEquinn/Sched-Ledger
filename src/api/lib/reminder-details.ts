import type { ReminderDetails } from "@/schemas/event";

/**
 * `notifyDetails` is the only plaintext copy of E2EE event content on the
 * server, kept solely so reminder emails can render the event name, budget hold
 * and comments. It must exist exactly while an email reminder is configured.
 */
export function keepReminderDetails(opts: {
  details?: ReminderDetails | null;
  notify?: boolean;
  email?: string;
}): boolean {
  return Boolean(opts.details && opts.notify && opts.email?.trim());
}

/**
 * PATCH resolution for the stored copy: `set` writes a fresh copy, `unset`
 * clears a stale one, and neither leaves an untouched copy in place.
 */
export function reminderDetailsUpdate(opts: {
  /** Body value — `undefined` when the request did not mention it. */
  details?: ReminderDetails | null;
  /** Notify / email after merging the patch onto the stored event. */
  notify?: boolean;
  email?: string;
}): { set?: ReminderDetails; unset?: boolean } {
  if (keepReminderDetails(opts)) return { set: opts.details! };
  /* Clear on an explicit value (including null) or once reminders are off. */
  if (opts.details !== undefined || !opts.notify || !opts.email?.trim()) {
    return { unset: true };
  }

  return {};
}
