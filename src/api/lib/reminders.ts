import { emailConfigured, reminderEmailHtml, sendEmail } from "@/api/lib/email";
import { getCollections, getDb } from "@/db";
import type { EventDocument } from "@/db/collections";
import {
  CRON_LOOKAHEAD_MS,
  CRON_LOOKBACK_MS,
  candidateOccurrenceDates,
  eventTimeMs,
  formatEventWhen,
  leadDescription,
  occursOn,
  remindAtMs,
} from "@/lib/schedule";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { LeadId } from "@/schemas/common";
import { ObjectId } from "mongodb";

const EVENT_CAT_NAMES: Record<string, string> = {
  bill: "Bill / Payment",
  income: "Income",
  savings: "Savings",
  renewal: "Renewal",
  appointment: "Appointment",
  personal: "Personal",
  custom: "Custom",
};

function eventCategoryLabel(doc: { catId: string; customLabel?: string }): string {
  if (doc.catId === "custom" && doc.customLabel?.trim()) return doc.customLabel.trim();
  return EVENT_CAT_NAMES[doc.catId] ?? doc.catId;
}

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
  const category = eventCategoryLabel(doc);
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
  /*
   * Forward-looking window: the daily cron sends everything due before the
   * next run, so reminders always arrive BEFORE the event. The look-back
   * half is a catch-up for sends that failed on a previous run.
   */
  const windowStart = now.getTime() - CRON_LOOKBACK_MS;
  const windowEnd = now.getTime() + CRON_LOOKAHEAD_MS;

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

      /* Never send a reminder for an occurrence that has already happened. */
      if (eventTimeMs(iso, ev.time, ev.allDay, prefs.timezone) < now.getTime()) {
        result.skipped++;
        continue;
      }

      const outcome = await sendReminderOnce(ev, iso, email, prefs.timezone);
      if (outcome === "sent") result.sent++;
      else if (outcome === "skipped") result.skipped++;
      else result.errors.push(`${ev.title} (${iso}): ${outcome.error}`);
    }
  }

  return result;
}

/**
 * Sends the reminder email for one occurrence, deduped via reminderLogs.
 * Returns "skipped" when a log entry already exists for this occurrence.
 */
async function sendReminderOnce(
  ev: EventDocument,
  occurrenceIso: string,
  email: string,
  timezone: string,
): Promise<"sent" | "skipped" | { error: string }> {
  const { reminderLogs } = getCollections(getDb());
  const logKey = {
    eventId: ev._id,
    occurrenceIso,
    lead: ev.lead,
  };

  const existing = await reminderLogs.findOne(logKey);
  if (existing) return "skipped";

  const when = formatEventWhen(occurrenceIso, ev.time, ev.allDay, timezone);
  const category = eventCategoryLabel(ev);
  const lead = leadDescription(ev.lead as LeadId);
  const { html, text, subject } = reminderEmailHtml({
    title: ev.title,
    when,
    category,
    lead,
  });

  const sent = await sendEmail({ to: email, subject, html, text });
  if (!sent.ok) return { error: sent.error };

  await reminderLogs.insertOne({
    ...logKey,
    email,
    sentAt: new Date(),
  });
  return "sent";
}

/** Must match the cron-job.org schedule (daily at 16:00 UTC). */
const CRON_HOUR_UTC = 16;

/**
 * When the next daily cron run will have completed, including slack for
 * late or early triggers from the external scheduler.
 */
export function nextCronRunEndMs(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(CRON_HOUR_UTC, 59, 59, 999);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

/**
 * Called when an event is created or its notify flag turned on. If the next
 * occurrence's remind-time falls before the next cron run (which would
 * otherwise miss it or send it late), send the reminder right away.
 */
export async function sendImmediateReminderIfDue(
  doc: EventDocument,
  now = new Date(),
): Promise<void> {
  if (!doc.notify || !emailConfigured()) return;
  const email = doc.email?.trim();
  if (!email) return;

  const prefs = await userReminderPrefs(doc.userAddress);
  if (!prefs.emailEnabled) return;

  const cronCoversFrom = nextCronRunEndMs(now);

  for (const iso of candidateOccurrenceDates(doc.lead as LeadId, now)) {
    if (!occursOn(doc, iso)) continue;

    const eventAt = eventTimeMs(iso, doc.time, doc.allDay, prefs.timezone);
    if (eventAt < now.getTime()) continue; // occurrence already happened

    const remindAt = remindAtMs(doc, iso, prefs.timezone);
    if (remindAt > cronCoversFrom) continue; // next cron run will handle it

    const outcome = await sendReminderOnce(doc, iso, email, prefs.timezone);
    if (typeof outcome !== "string") {
      console.error(`[reminders] immediate send failed for "${doc.title}" (${iso}): ${outcome.error}`);
    }
  }
}

export async function clearReminderLogsForEvent(eventId: ObjectId): Promise<void> {
  const { reminderLogs } = getCollections(getDb());
  await reminderLogs.deleteMany({ eventId });
}
