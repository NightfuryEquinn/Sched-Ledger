import type { ReminderDetails } from "@/schemas/event";

/**
 * `notifyDetails` is the only plaintext copy of E2EE event content on the
 * server, kept solely so reminder emails can render the event name, budget hold
 * and comments. It must exist exactly while a reminder is configured.
 */
export function keepReminderDetails(opts: {
  details?: ReminderDetails | null;
  notify?: boolean;
}): boolean {
  return Boolean(opts.details && opts.notify);
}

/**
 * PATCH resolution for the stored copy: `set` writes a fresh copy, `unset`
 * clears a stale one, and neither leaves an untouched copy in place.
 */
export function reminderDetailsUpdate(opts: {
  /** Body value — `undefined` when the request did not mention it. */
  details?: ReminderDetails | null;
  /** Notify after merging the patch onto the stored event. */
  notify?: boolean;
}): { set?: ReminderDetails; unset?: boolean } {
  if (keepReminderDetails(opts)) return { set: opts.details! };
  /* Clear on an explicit value (including null) or once reminders are off. */
  if (opts.details !== undefined || !opts.notify) {
    return { unset: true };
  }

  return {};
}
