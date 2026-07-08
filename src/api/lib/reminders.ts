import { ObjectId } from "mongodb";
import { emailConfigured, reminderEmailHtml, sendEmail } from "@/api/lib/email";
import { getCollections, getDb } from "@/db";
import type { EventDocument } from "@/db/collections";
import {
  CRON_WINDOW_MS,
  candidateOccurrenceDates,
  formatEventWhen,
  leadDescription,
  occursOn,
  remindAtMs,
} from "@/lib/schedule";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { LeadId } from "@/schemas/common";

const EVENT_CAT_NAMES: Record<string, string> = {
  bill: "Bill / Payment",
  income: "Income",
  savings: "Savings",
  renewal: "Renewal",
  appointment: "Appointment",
  personal: "Personal",
};

export type ReminderProcessResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/**
 * Global email opt-out: users can disable all reminder emails from the
 * Data & privacy modal. Absent field means enabled (default opt-in per event).
 */
type UserReminderPrefs = {
  emailEnabled: boolean;
  timezone: string;
};

async function userReminderPrefs(userAddress: string): Promise<UserReminderPrefs> {
  const { users } = getCollections(getDb());
  const user = await users.findOne({ address: userAddress });
  return {
    emailEnabled: user?.emailRemindersEnabled !== false,
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
  };
}

export async function sendEventConfirmation(doc: EventDocument): Promise<void> {
  if (!doc.notify || !doc.email?.trim()) return;
  if (!emailConfigured()) return;

  const prefs = await userReminderPrefs(doc.userAddress);
  if (!prefs.emailEnabled) return;

  const when = formatEventWhen(doc.date, doc.time, doc.allDay, prefs.timezone);
  const category = EVENT_CAT_NAMES[doc.catId] ?? doc.catId;
  const lead = leadDescription(doc.lead as LeadId);
  const { html, text, subject } = reminderEmailHtml({
    title: doc.title,
    when,
    category,
    lead,
    isConfirmation: true,
  });

  await sendEmail({ to: doc.email.trim(), subject, html, text });
}

export async function processDueReminders(now = new Date()): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = { scanned: 0, sent: 0, skipped: 0, errors: [] };

  if (!emailConfigured()) {
    result.errors.push("RESEND_API_KEY not configured");
    return result;
  }

  const { events, reminderLogs } = getCollections(getDb());
  const windowStart = now.getTime() - CRON_WINDOW_MS;
  const windowEnd = now.getTime();

  const notifyEvents = await events
    .find({ notify: true, email: { $exists: true, $ne: "" } })
    .toArray();

  result.scanned = notifyEvents.length;

  /* Cache per-user reminder prefs across events in this run. */
  const prefsCache = new Map<string, UserReminderPrefs>();

  for (const ev of notifyEvents) {
    const email = ev.email?.trim();
    if (!email) {
      result.skipped++;
      continue;
    }

    let prefs = prefsCache.get(ev.userAddress);
    if (!prefs) {
      prefs = await userReminderPrefs(ev.userAddress);
      prefsCache.set(ev.userAddress, prefs);
    }
    if (!prefs.emailEnabled) {
      result.skipped++;
      continue;
    }

    const dates = candidateOccurrenceDates(ev.lead as LeadId, now);

    for (const iso of dates) {
      if (!occursOn(ev, iso)) continue;

      const remindAt = remindAtMs(ev, iso, prefs.timezone);
      if (remindAt < windowStart || remindAt > windowEnd) continue;

      const logKey = {
        eventId: ev._id,
        occurrenceIso: iso,
        lead: ev.lead,
      };

      const existing = await reminderLogs.findOne(logKey);
      if (existing) {
        result.skipped++;
        continue;
      }

      const when = formatEventWhen(iso, ev.time, ev.allDay, prefs.timezone);
      const category = EVENT_CAT_NAMES[ev.catId] ?? ev.catId;
      const lead = leadDescription(ev.lead as LeadId);
      const { html, text, subject } = reminderEmailHtml({
        title: ev.title,
        when,
        category,
        lead,
      });

      const sent = await sendEmail({ to: email, subject, html, text });
      if (!sent.ok) {
        result.errors.push(`${ev.title} (${iso}): ${sent.error}`);
        continue;
      }

      await reminderLogs.insertOne({
        ...logKey,
        email,
        sentAt: new Date(),
      });
      result.sent++;
    }
  }

  return result;
}

export async function clearReminderLogsForEvent(eventId: ObjectId): Promise<void> {
  const { reminderLogs } = getCollections(getDb());
  await reminderLogs.deleteMany({ eventId });
}
