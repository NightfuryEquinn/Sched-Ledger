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
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

const LEAD_LABELS: Record<LeadId, string> = {
  at: "at the time of the event",
  "10m": "10 minutes before",
  "1h": "1 hour before",
  "1d": "1 day before",
  "1w": "1 week before",
};

/** Lookback for daily Vercel Cron (Hobby: once/day, ±59 min). */
export const CRON_WINDOW_MS = 25 * 60 * 60 * 1000;

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

/** ISO dates to scan for due reminders (today −1 through today + lead horizon). */
export function candidateOccurrenceDates(lead: LeadId, now = new Date()): string[] {
  const horizon = Math.ceil(leadOffsetMs(lead) / (24 * 60 * 60 * 1000)) + 2;
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const out: string[] = [];
  for (let i = 0; i < horizon + 2; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(formatIsoDate(d));
  }
  return out;
}

export function eventTimeMs(iso: string, time: string | null, allDay: boolean): number {
  const offset = process.env.APP_TZ_OFFSET ?? "+08:00";
  const hhmm = allDay ? "09:00" : (time ?? "09:00");
  return new Date(`${iso}T${hhmm}:00${offset}`).getTime();
}

export function remindAtMs(ev: ScheduleEvent, occurrenceIso: string): number {
  return eventTimeMs(occurrenceIso, ev.time, ev.allDay) - leadOffsetMs(ev.lead);
}

export function formatEventWhen(iso: string, time: string | null, allDay: boolean): string {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (allDay) return `${day} (all day)`;
  if (!time) return day;
  const [h, m] = time.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;
  return `${day} at ${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
