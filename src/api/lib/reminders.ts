import { emailConfigured, reminderEmailHtml, sendEmail } from "@/api/lib/email";
import { formatMoneyLabel } from "@/api/lib/money";
import { getCollections, getDb } from "@/db";
import type { EventDocument } from "@/db/collections";
import {
  formatOccurrenceWhen,
  isOccurrencePast,
  isReminderDueNow,
  leadDescription,
  occurrenceEndMs,
  reminderTargets,
  spanDays,
  type ReminderTarget,
} from "@/lib/schedule";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { spanDaysBetween, type LeadId } from "@/schemas/common";
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
const SEND_CONCURRENCY = 5;

/** Human-readable label for an event's schedule category (plaintext catId only). */
function eventCategoryLabel(doc: { catId: string }): string {
  return EVENT_CAT_NAMES[doc.catId] ?? doc.catId;
}

/** Fallback title for events saved without a plaintext copy for delivery. */
const GENERIC_EVENT_TITLE = "Upcoming event";

/** 1-based position of a target's day within its occurrence. */
function dayNumberInSpan(target: ReminderTarget): number {
  return spanDaysBetween(target.occurrenceIso, target.dayIso);
}

/**
 * Content rendered in reminder emails. Event secrets are E2EE, so this comes
 * from the plaintext `notifyDetails` the client stores while reminders are on;
 * without it the email falls back to the generic, content-free form.
 */
function reminderContent(doc: EventDocument): {
  title: string;
  hold?: string;
  comments?: string[];
} {
  const details = doc.notifyDetails;
  if (!details) return { title: GENERIC_EVENT_TITLE };

  const hold = details.hold
    ? [
        formatMoneyLabel(details.hold.amount, details.hold.currency),
        details.hold.categoryName ? `from ${details.hold.categoryName}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return {
    title: details.title.trim() || GENERIC_EVENT_TITLE,
    ...(hold ? { hold } : {}),
    ...(details.comments?.length ? { comments: details.comments } : {}),
  };
}

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
  const user = await users.findOne(
    { _id: new ObjectId(accountId) },
    { projection: { emailRemindersEnabled: 1, timezone: 1 } },
  );

  return {
    remindersEnabled: user?.emailRemindersEnabled !== false,
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
  };
}

/** Run async tasks with a fixed concurrency cap. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]!);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);

  return results;
}

/** Send the "reminder enabled" confirmation email when an event turns notify on. */
export async function sendEventConfirmation(doc: EventDocument): Promise<void> {
  if (!doc.notify || !doc.email?.trim()) return;
  if (!emailConfigured()) return;

  const prefs = await userReminderPrefs(doc.accountId);
  if (!prefs.remindersEnabled) return;

  const when = formatOccurrenceWhen(doc, doc.date, prefs.timezone);
  const category = eventCategoryLabel(doc);
  const span = spanDays(doc);
  /* Multi-day events also get a daily nudge, so say so up front. */
  const lead =
    span > 1
      ? `${leadDescription(doc.lead as LeadId, doc.allDay)}, then each morning it is still running`
      : leadDescription(doc.lead as LeadId, doc.allDay);
  const { html, text, subject } = reminderEmailHtml({
    ...reminderContent(doc),
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

  const { events, reminderLogs } = getCollections(getDb());
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

  type PendingSend = {
    ev: EventDocument;
    target: ReminderTarget;
    email: string;
    timezone: string;
  };
  const pending: PendingSend[] = [];

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

    for (const target of reminderTargets(ev, now, prefs.timezone)) {
      if (!isReminderDueNow(target.remindAtMs, nowMs)) continue;

      /* Never remind about an occurrence that has already finished. */
      if (isOccurrencePast(occurrenceEndMs(ev, target.occurrenceIso, prefs.timezone), nowMs)) {
        result.skipped++;
        continue;
      }

      pending.push({ ev, target, email, timezone: prefs.timezone });
    }
  }

  if (pending.length) {
    /* Prefetch existing reminder logs for this batch to skip duplicates. */
    const logFilter = {
      $or: pending.map((p) => ({
        eventId: p.ev._id,
        occurrenceIso: p.target.dayIso,
        lead: p.target.logLead,
      })),
    };
    const existingLogs = await reminderLogs.find(logFilter).toArray();
    const existingKeys = new Set(
      existingLogs.map((log) => `${log.eventId.toHexString()}|${log.occurrenceIso}|${log.lead}`),
    );

    const toSend = pending.filter((p) => {
      const key = `${p.ev._id.toHexString()}|${p.target.dayIso}|${p.target.logLead}`;
      if (existingKeys.has(key)) {
        result.skipped++;

        return false;
      }

      return true;
    });

    const outcomes = await mapPool(toSend, SEND_CONCURRENCY, (item) =>
      sendReminderOnce(item.ev, item.target, item.email, item.timezone, true),
    );

    for (const outcome of outcomes) {
      if (outcome === "sent") result.sent++;
      else if (outcome === "skipped") result.skipped++;
      else result.errors.push(outcome.error);
    }
  }

  return result;
}

/**
 * Sends a reminder email for one target, deduped via reminderLogs.
 * Returns "skipped" when a log entry already exists for it.
 */
async function sendReminderOnce(
  ev: EventDocument,
  target: ReminderTarget,
  email: string,
  timezone: string,
  alreadyChecked = false,
): Promise<"sent" | "skipped" | { error: string }> {
  const { reminderLogs } = getCollections(getDb());
  const logKey = {
    eventId: ev._id,
    occurrenceIso: target.dayIso,
    lead: target.logLead,
  };

  if (!alreadyChecked) {
    const existing = await reminderLogs.findOne(logKey);
    if (existing) return "skipped";
  }

  const span = spanDays(ev);
  const when = formatOccurrenceWhen(ev, target.occurrenceIso, timezone);
  const category = eventCategoryLabel(ev);
  /* A "still running" send is about today, not about a lead time. */
  const lead =
    target.kind === "ongoing"
      ? `while this event is running (day ${dayNumberInSpan(target)} of ${span})`
      : leadDescription(ev.lead as LeadId, ev.allDay);

  const { html, text, subject } = reminderEmailHtml({
    ...reminderContent(ev),
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

  for (const target of reminderTargets(doc, now, prefs.timezone)) {
    /* Occurrence already finished. */
    if (isOccurrencePast(occurrenceEndMs(doc, target.occurrenceIso, prefs.timezone), nowMs)) continue;
    if (!isReminderDueNow(target.remindAtMs, nowMs)) continue;

    const outcome = await sendReminderOnce(doc, target, email, prefs.timezone);
    if (typeof outcome !== "string") {
      console.error(
        `[reminders] immediate send failed for event ${doc._id} (${target.dayIso}): ${outcome.error}`,
      );
    }
  }
}

/** Delete reminder send logs for an event (e.g. after delete or major edit). */
export async function clearReminderLogsForEvent(eventId: ObjectId): Promise<void> {
  const { reminderLogs } = getCollections(getDb());
  await reminderLogs.deleteMany({ eventId });
}
