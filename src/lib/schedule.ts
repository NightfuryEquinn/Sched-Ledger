import { DEFAULT_TIMEZONE, zonedLocalToUtcMs } from "@/lib/timezone";
import type { LeadId } from "@/schemas/common";

export type ScheduleEvent = {
  date: string;
  allDay: boolean;
  time: string | null;
  repeat: string;
  lead: LeadId;
};

const LEAD_MS: Record<LeadId, number> = {
  at: 0,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "2d": 2 * 24 * 60 * 60 * 1000,
};

const LEAD_LABELS: Record<LeadId, string> = {
  at: "at the time of the event",
  "15m": "15 minutes before",
  "30m": "30 minutes before",
  "1h": "1 hour before",
  "6h": "6 hours before",
  "12h": "12 hours before",
  "1d": "1 day before",
  "2d": "2 days before",
};

/**
 * External cron poll cadence (cron-job.org should run at this interval).
 * Each run scans the database for reminders whose target time falls in the due window.
 */
export const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Fire up to this many ms before the configured remind-at time. */
export const REMINDER_EARLY_BUFFER_MS = 5 * 60 * 1000;

/**
 * True when `now` is inside the send window for a reminder:
 * remindAt − earlyBuffer ≤ now ≤ remindAt + pollInterval.
 */
export function isReminderDueNow(
  remindAtMs: number,
  nowMs: number = Date.now(),
  pollIntervalMs = REMINDER_POLL_INTERVAL_MS,
  earlyBufferMs = REMINDER_EARLY_BUFFER_MS,
): boolean {
  return nowMs >= remindAtMs - earlyBufferMs && nowMs <= remindAtMs + pollIntervalMs;
}

export function leadOffsetMs(lead: LeadId): number {
  return LEAD_MS[lead] ?? 0;
}

export function leadDescription(lead: LeadId): string {
  return LEAD_LABELS[lead] ?? LEAD_LABELS.at;
}

export function occursOn(ev: ScheduleEvent, iso: string): boolean {
  if (iso < ev.date) return false;
  const a = new Date(`${ev.date}T00:00:00`);
  const b = new Date(`${iso}T00:00:00`);
  switch (ev.repeat) {
    case "once":
      return iso === ev.date;
    case "daily":
      return true;
    case "weekly":
      return a.getDay() === b.getDay();
    case "monthly":
      return a.getDate() === b.getDate();
    case "yearly":
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    default:
      return iso === ev.date;
  }
}

/** ISO dates to scan for due reminders (today −2 through today + lead horizon, padded for timezone offsets). */
export function candidateOccurrenceDates(lead: LeadId, now = new Date()): string[] {
  const horizon = Math.ceil(leadOffsetMs(lead) / (24 * 60 * 60 * 1000)) + 3;
  const start = new Date(now);
  start.setDate(start.getDate() - 2);
  const out: string[] = [];
  for (let i = 0; i < horizon + 3; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(formatIsoDate(d));
  }
  return out;
}

export function eventTimeMs(
  iso: string,
  time: string | null,
  allDay: boolean,
  timeZone = DEFAULT_TIMEZONE,
): number {
  const hhmm = allDay ? "09:00" : (time ?? "09:00");
  return zonedLocalToUtcMs(iso, hhmm, timeZone);
}

export function remindAtMs(ev: ScheduleEvent, occurrenceIso: string, timeZone = DEFAULT_TIMEZONE): number {
  return eventTimeMs(occurrenceIso, ev.time, ev.allDay, timeZone) - leadOffsetMs(ev.lead);
}

export function formatEventWhen(
  iso: string,
  time: string | null,
  allDay: boolean,
  timeZone = DEFAULT_TIMEZONE,
): string {
  const noonMs = zonedLocalToUtcMs(iso, "12:00", timeZone);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(noonMs));
  if (allDay) return `${day} (all day)`;
  if (!time) return day;
  const [h, m] = time.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;
  const tzLabel = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(new Date(noonMs))
    .find((p) => p.type === "timeZoneName")?.value;
  const suffix = tzLabel ? ` ${tzLabel}` : "";
  return `${day} at ${hh}:${String(m).padStart(2, "0")} ${ap}${suffix}`;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
