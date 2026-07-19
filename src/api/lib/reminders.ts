import { emailConfigured, reminderEmailHtml, sendEmail } from "@/api/lib/email";
import { getCollections, getDb } from "@/db";
import type { EventDocument } from "@/db/collections";
import {
  candidateOccurrenceDates,
  eventTimeMs,
  formatEventWhen,
  isReminderDueNow,
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

/** Bound work per cron-job.org poll (aligned with ~30s request timeout). */
const REMINDER_BATCH_LIMIT = 80;
const CRON_TIME_BUDGET_MS = 22_000;

/** Human-readable label for an event's schedule category (plaintext catId only). */
function eventCategoryLabel(doc: { catId: string }): string {
  return EVENT_CAT_NAMES[doc.catId] ?? doc.catId;
}

/** Generic event title used in emails — real titles are E2EE and unavailable server-side. */
const GENERIC_EVENT_TITLE = "Upcoming event";


export type ReminderProcessResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
  truncated?: boolean;
};

/**
 * Global reminder opt-out: users can disable all reminder emails from
 * the Data & privacy modal. Absent field means enabled (default opt-in per event).
 */
type UserReminderPrefs = {
  remindersEnabled: boolean;
  timezone: string;
};

/** Load reminder kill-switch and timezone for an account. */
async function userReminderPrefs(accountId: string): Promise<UserReminderPrefs> {
  const { users } = getCollections(getDb());
  const user = await users.findOne({ _id: new ObjectId(accountId) });

  return {
    remindersEnabled: user?.emailRemindersEnabled !== false,
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
  };
}

/** Send the "reminder enabled" confirmation email when an event turns notify on. */
export async function sendEventConfirmation(doc: EventDocument): Promise<void> {
  if (!doc.notify || !doc.email?.trim()) return;
  if (!emailConfigured()) return;

  const prefs = await userReminderPrefs(doc.accountId);
  if (!prefs.remindersEnabled) return;

  const when = formatEventWhen(doc.date, doc.time, doc.allDay, prefs.timezone);
  const category = eventCategoryLabel(doc);
  const lead = leadDescription(doc.lead as LeadId);
  const { html, text, subject } = reminderEmailHtml({
    title: GENERIC_EVENT_TITLE,
    when,
    category,
    lead,
    isConfirmation: true,
  });

  await sendEmail({ to: doc.email.trim(), subject, html, text });
}

/** Cron entry: scan notify events and deliver due reminder emails (batched). */
export async function processDueReminders(now = new Date()): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = { scanned: 0, sent: 0, skipped: 0, errors: [] };

  if (!emailConfigured()) {
    result.errors.push("RESEND_API_KEY not configured");
    return result;
  }

  const { events } = getCollections(getDb());
  const nowMs = now.getTime();
  const started = Date.now();

  const notifyEvents = await events
    .find({ notify: true })
    .sort({ _id: 1 })
    .limit(REMINDER_BATCH_LIMIT)
    .toArray();
  result.scanned = notifyEvents.length;
  if (notifyEvents.length >= REMINDER_BATCH_LIMIT) {
    result.truncated = true;
  }

  /* Cache per-user reminder prefs across events in this run. */
  const prefsCache = new Map<string, UserReminderPrefs>();

  for (const ev of notifyEvents) {
    if (Date.now() - started > CRON_TIME_BUDGET_MS) {
      result.truncated = true;
      break;
    }

    let prefs = prefsCache.get(ev.accountId);
    if (!prefs) {
      prefs = await userReminderPrefs(ev.accountId);
      prefsCache.set(ev.accountId, prefs);
    }
    if (!prefs.remindersEnabled) {
      result.skipped++;
      continue;
    }

    const email = ev.email?.trim() || "";
    if (!email) {
      result.skipped++;
      continue;
    }

    const dates = candidateOccurrenceDates(ev.lead as LeadId, now);

    for (const iso of dates) {
      if (!occursOn(ev, iso)) continue;

      const remindAt = remindAtMs(ev, iso, prefs.timezone);
      if (!isReminderDueNow(remindAt, nowMs)) continue;

      /* Never send a reminder for an occurrence that has already happened. */
      if (eventTimeMs(iso, ev.time, ev.allDay, prefs.timezone) < nowMs) {
        result.skipped++;
        continue;
      }

      const outcome = await sendReminderOnce(ev, iso, email, prefs.timezone);
      if (outcome === "sent") result.sent++;
      else if (outcome === "skipped") result.skipped++;
      else result.errors.push(`event ${ev._id} (${iso}): ${outcome.error}`);
    }
  }

  return result;
}

/**
 * Sends a reminder email for one occurrence, deduped via reminderLogs.
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
    title: GENERIC_EVENT_TITLE,
    when,
    category,
    lead,
  });
  const sent = await sendEmail({ to: email, subject, html, text });

  if (!sent.ok) {
    return { error: sent.error || "email delivery failed" };
  }

  try {
    await reminderLogs.insertOne({
      _id: new ObjectId(),
      ...logKey,
      email,
      channels: ["email"],
      sentAt: new Date(),
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 11000) return "skipped";
    return { error: "failed to log reminder send" };
  }

  return "sent";
}

/**
 * Called when an event is created or updated. If the remind-at time is inside
 * the current poll window, send immediately instead of waiting for cron-job.org.
 */
export async function sendImmediateReminderIfDue(
  doc: EventDocument,
  now = new Date(),
): Promise<void> {
  if (!doc.notify) return;
  if (!emailConfigured()) return;

  const prefs = await userReminderPrefs(doc.accountId);
  if (!prefs.remindersEnabled) return;

  const email = doc.email?.trim() || "";
  if (!email) return;

  const nowMs = now.getTime();

  for (const iso of candidateOccurrenceDates(doc.lead as LeadId, now)) {
    if (!occursOn(doc, iso)) continue;

    const eventAt = eventTimeMs(iso, doc.time, doc.allDay, prefs.timezone);
    if (eventAt < nowMs) continue; // occurrence already happened

    const remindAt = remindAtMs(doc, iso, prefs.timezone);
    if (!isReminderDueNow(remindAt, nowMs)) continue;

    const outcome = await sendReminderOnce(doc, iso, email, prefs.timezone);
    if (typeof outcome !== "string") {
      console.error(`[reminders] immediate send failed for event ${doc._id} (${iso}): ${outcome.error}`);
    }
  }
}

/** Delete reminder send logs for an event (e.g. after delete or major edit). */
export async function clearReminderLogsForEvent(eventId: ObjectId): Promise<void> {
  const { reminderLogs } = getCollections(getDb());
  await reminderLogs.deleteMany({ eventId });
}
