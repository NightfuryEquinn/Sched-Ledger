import { DEFAULT_CATEGORIES } from "@/schemas/category";
import type { MonthEntry } from "./types";

const CURRENCY = { code: "MYR", symbol: "RM" };

export const CURRENCIES = [
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka" },
  { code: "BND", symbol: "B$", label: "Brunei Dollar" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc" },
  { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "HKD", symbol: "HK$", label: "Hong Kong Dollar" },
  { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "KRW", symbol: "₩", label: "South Korean Won" },
  { code: "MXN", symbol: "MX$", label: "Mexican Peso" },
  { code: "MYR", symbol: "RM", label: "Malaysian Ringgit" },
  { code: "NZD", symbol: "NZ$", label: "New Zealand Dollar" },
  { code: "PHP", symbol: "₱", label: "Philippine Peso" },
  { code: "PKR", symbol: "₨", label: "Pakistani Rupee" },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal" },
  { code: "SEK", symbol: "kr", label: "Swedish Krona" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  { code: "THB", symbol: "฿", label: "Thai Baht" },
  { code: "TRY", symbol: "₺", label: "Turkish Lira" },
  { code: "TWD", symbol: "NT$", label: "New Taiwan Dollar" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "VND", symbol: "₫", label: "Vietnamese Dong" },
  { code: "ZAR", symbol: "R", label: "South African Rand" },
] as const;

const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

/** Resolve currency metadata by ISO code, falling back to MYR. */
export function getCurrency(code?: string) {
  return CURRENCY_BY_CODE[code ?? CURRENCY.code] ?? CURRENCY;
}

/** Builtin subcategory lookup used when no live CategoryIndex is available. */
export const SUB_BY_ID: Record<string, { id: string; name: string; catId: string; color: string }> =
  {};
DEFAULT_CATEGORIES.forEach((c) =>
  c.subs.forEach((s) => {
    SUB_BY_ID[s.id] = { ...s, catId: c.id, color: c.color };
  }),
);

/** Zero-pad a number to two digits. */
export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const MIN_MONTH_KEY = "2020-01";

const _now = new Date();
const CURRENT_YEAR = _now.getFullYear();
const CURRENT_MONTH = _now.getMonth();
export const CURRENT_DAY = _now.getDate();
export const CURRENT_MONTH_KEY = `${CURRENT_YEAR}-${pad(CURRENT_MONTH + 1)}`;
export const TODAY_ISO = `${CURRENT_MONTH_KEY}-${pad(CURRENT_DAY)}`;
export const MAX_MONTH_KEY = `${CURRENT_YEAR + 10}-${pad(CURRENT_MONTH + 1)}`;

/** Build month entries from fromKey through toKey inclusive. */
function buildMonths(fromKey: string, toKey: string): MonthEntry[] {
  const [fromY, fromM] = fromKey.split("-").map(Number);
  const [toY, toM] = toKey.split("-").map(Number);
  const out: MonthEntry[] = [];
  let y = fromY;
  let m = fromM - 1;
  const end = new Date(toY, toM - 1, 1).getTime();

  while (new Date(y, m, 1).getTime() <= end) {
    out.push({ key: `${y}-${pad(m + 1)}`, year: y, m });
    m += 1;

    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  return out;
}

/** Navigable months, oldest → newest (Jan 2020 through same month 10 years ahead). */
export const MONTHS = buildMonths(MIN_MONTH_KEY, MAX_MONTH_KEY);

/** Clamp a month key into the navigable range. */
export function clampMonthKey(key?: string | null) {
  const month = key || CURRENT_MONTH_KEY;

  if (month < MIN_MONTH_KEY) return MIN_MONTH_KEY;
  if (month > MAX_MONTH_KEY) return MAX_MONTH_KEY;

  return month;
}

/** Min/max year-month bounds for the month picker. */
export function monthRangeBounds() {
  const [minY, minM] = MIN_MONTH_KEY.split("-").map(Number);
  const [maxY, maxM] = MAX_MONTH_KEY.split("-").map(Number);

  return { minY, minM, maxY, maxM };
}

/** Last N navigable months ending at anchor (for charts). */
export function monthsWindow(anchorKey: string, size = 6) {
  const idx = MONTHS.findIndex((m) => m.key === anchorKey);

  if (idx < 0) return MONTHS.slice(-size);

  return MONTHS.slice(Math.max(0, idx - size + 1), idx + 1);
}

// ── Schedule: event types, recurrence, reminders ────────────────────

export const EVENT_CATS = [
  { id: "bill", name: "Bill / Payment", color: "#4f8a7b", glyph: "🧾" },
  { id: "income", name: "Income", color: "#6f8b6f", glyph: "💵" },
  { id: "savings", name: "Savings", color: "#7a6fa5", glyph: "🐷" },
  { id: "renewal", name: "Renewal", color: "#5b7a8a", glyph: "🔄" },
  { id: "appointment", name: "Appointment", color: "#4a6fa5", glyph: "📅" },
  { id: "personal", name: "Personal", color: "#a06f95", glyph: "📌" },
  { id: "custom", name: "Custom", color: "#8a7355", glyph: "✨" },
];

const EVENT_CAT_BY_ID = Object.fromEntries(EVENT_CATS.map((c) => [c.id, c]));

/** Resolve display meta for an event type, including custom label/glyph. */
export function eventCatMeta(ev: { catId: string; customLabel?: string; customGlyph?: string }) {
  const base = EVENT_CAT_BY_ID[ev.catId] ?? EVENT_CAT_BY_ID.custom;

  if (ev.catId === "custom") {
    return {
      ...base,
      name: ev.customLabel?.trim() || base.name,
      glyph: ev.customGlyph?.trim() || base.glyph,
    };
  }

  return base;
}

export const REPEATS = [
  { id: "once", label: "One-time", adj: "Once" },
  { id: "daily", label: "Daily", adj: "Daily" },
  { id: "weekly", label: "Weekly", adj: "Weekly" },
  { id: "monthly", label: "Monthly", adj: "Monthly" },
  { id: "yearly", label: "Yearly", adj: "Yearly" },
];

const REPEAT_BY_ID = Object.fromEntries(REPEATS.map((r) => [r.id, r]));

const LEAD_TIMES = [
  { id: "at", label: "At time of event", short: "on time" },
  { id: "15m", label: "15 minutes before", short: "15 min before" },
  { id: "30m", label: "30 minutes before", short: "30 min before" },
  { id: "1h", label: "1 hour before", short: "1 hr before" },
  { id: "6h", label: "6 hours before", short: "6 hr before" },
  { id: "12h", label: "12 hours before", short: "12 hr before" },
  { id: "1d", label: "1 day before", short: "1 day before" },
  { id: "2d", label: "2 days before", short: "2 days before" },
] as const;

const LEAD_BY_ID = Object.fromEntries(LEAD_TIMES.map((l) => [l.id, l]));

const ALL_DAY_LEAD_SET = new Set(["1d", "2d"]);

/** Reminder dropdown options for the event modal. */
export function leadTimesForEvent(allDay: boolean) {
  return allDay ? LEAD_TIMES.filter((l) => ALL_DAY_LEAD_SET.has(l.id)) : LEAD_TIMES;
}

/** Whether a recurring event occurs on a given ISO date. */
export function occursOn(ev, iso) {
  if (iso < ev.date) return false;

  const a = new Date(ev.date + "T00:00:00");
  const b = new Date(iso + "T00:00:00");

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

/** Sort events on the same day: all-day first, then earliest time, then title. */
export function compareEventsByEarliest(
  a: { allDay?: boolean; time?: string | null; title?: string },
  b: { allDay?: boolean; time?: string | null; title?: string },
): number {
  const dayRank = (ev: typeof a) => (ev.allDay ? 0 : 1);
  const ra = dayRank(a);
  const rb = dayRank(b);

  if (ra !== rb) return ra - rb;

  const ta = a.time || "00:00";
  const tb = b.time || "00:00";

  if (ta < tb) return -1;
  if (ta > tb) return 1;

  return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
}

/** Events occurring on `iso`, sorted earliest-first within the day. */
export function eventsForDay(events, iso) {
  return events.filter((ev) => occursOn(ev, iso)).sort(compareEventsByEarliest);
}

/** All occurrences within a month, sorted by date then earliest time. */
export function scheduleForMonth(events, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];

  for (let d = 1; d <= days; d++) {
    const iso = `${monthKey}-${pad(d)}`;
    eventsForDay(events, iso).forEach((ev) => out.push({ iso, ev }));
  }

  return out;
}

/** Format HH:MM as a 12-hour clock string. */
export function fmtTime(t) {
  if (!t) return "";

  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;

  return `${hh}:${pad(m)} ${ap}`;
}

/** Human-readable event time label (all-day or clock time). */
export function eventTimeLabel(ev) {
  return ev.allDay ? "All day" : fmtTime(ev.time);
}

/** Human-readable repeat label for an event. */
export function repeatLabel(ev) {
  return (REPEAT_BY_ID[ev.repeat] || REPEAT_BY_ID.once).label;
}

/** Human-readable lead-time label. */
export function leadLabel(id) {
  return (LEAD_BY_ID[id] || LEAD_BY_ID.at).label;
}

/** Format a comment timestamp for display. */
export function fmtCommentTime(iso) {
  const d = new Date(iso);

  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Formatting helpers ──────────────────────────────────────────────

/** Format a number as currency with optional cents. */
export function fmtMoney(n, opts: { cents?: boolean; currency?: string } = {}) {
  const cur = getCurrency(opts.currency);
  const v = Math.abs(n);
  const s = v.toLocaleString("en-MY", {
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });

  return `${n < 0 ? "−" : ""}${cur.symbol}${s}`;
}

/** Whether a budget limit is a positive finite number. */
export function isBudgetSet(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Format a budget limit, or "Unset" when none is set. */
export function fmtBudgetLimit(n: unknown, opts: { currency?: string } = {}) {
  return isBudgetSet(n) ? fmtMoney(n, { cents: false, ...opts }) : "Unset";
}

/** Compact currency format (e.g. RM1.2k). */
export function fmtMoneyShort(n, currency?: string) {
  const cur = getCurrency(currency);

  if (Math.abs(n) >= 1000) return `${cur.symbol}${(n / 1000).toFixed(1)}k`;

  return `${cur.symbol}${Math.round(n)}`;
}

/** Format a YYYY-MM key as a month label. */
export function monthLabel(key, long) {
  const [y, mm] = key.split("-").map(Number);
  const d = new Date(y, mm - 1, 1);

  return d.toLocaleString("en-US", { month: long ? "long" : "short", year: long ? "numeric" : undefined });
}

/** Format an ISO date as day + short month. */
export function dayLabel(iso) {
  const d = new Date(iso + "T00:00:00");

  return d.toLocaleString("en-US", { day: "numeric", month: "short" });
}

/** Format an ISO date as a short weekday. */
export function weekdayLabel(iso) {
  const d = new Date(iso + "T00:00:00");

  return d.toLocaleString("en-US", { weekday: "short" });
}
