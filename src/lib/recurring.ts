/** Shared recurring-expense cadence helpers (UI projections + cron materialization). */

export const RECURRING_INTERVALS = ["monthly", "quarterly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];
export type RecurringField = RecurringInterval | false;

/** Max occurrences created per series in one cron run (missed-cycle catch-up). */
export const RECURRING_CATCHUP_LIMIT = 3;

export function normalizeRecurring(value: unknown): RecurringField {
  if (value === true || value === "monthly") return "monthly";
  if (value === "quarterly" || value === "yearly") return value;
  return false;
}

export function recurringLabel(freq: RecurringField | unknown) {
  const f = normalizeRecurring(freq);
  if (f === "monthly") return "Monthly";
  if (f === "quarterly") return "Quarterly";
  if (f === "yearly") return "Yearly";
  return "";
}

export function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function formatIsoDateParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function monthIndex(y: number, m: number): number {
  return y * 12 + m;
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = monthIndex(y, m) + delta;
  const ny = Math.floor((idx - 1) / 12);
  const nm = ((idx - 1) % 12) + 1;
  return { y: ny, m: nm };
}

export function recurringOccursInMonth(
  expense: Pick<{ date: string; recurring: unknown }, "date" | "recurring">,
  monthKey: string,
): boolean {
  const freq = normalizeRecurring(expense.recurring);
  if (!freq) return false;

  const { y: anchorY, m: anchorM } = parseIsoDate(expense.date);
  const [viewY, viewM] = monthKey.split("-").map(Number);
  const a = monthIndex(anchorY, anchorM);
  const v = monthIndex(viewY, viewM);
  if (v < a) return false;

  if (freq === "monthly") return true;
  if (freq === "quarterly") return (v - a) % 3 === 0;
  return viewM === anchorM;
}

/** Due ISO date in `monthKey` (YYYY-MM), clamping day to month length. */
export function recurringDueDate(anchorIso: string, monthKey: string): string {
  const anchorD = parseIsoDate(anchorIso).d;
  const [viewY, viewM] = monthKey.split("-").map(Number);
  const day = Math.min(anchorD, daysInMonth(viewY, viewM));
  return formatIsoDateParts(viewY, viewM, day);
}

export function recurringDueDay(expense: Pick<{ date: string }, "date">, monthKey: string): number {
  return parseIsoDate(recurringDueDate(expense.date, monthKey)).d;
}

export function recurringScheduleKey(expense: {
  walletId?: string | null;
  sub: string;
  note: string;
  recurring: unknown;
}): string {
  return `${expense.walletId ?? ""}|${expense.sub}|${expense.note}|${normalizeRecurring(expense.recurring)}`;
}

export function recurringMonthlyEquivalent(amount: number, freq: RecurringField | unknown) {
  const f = normalizeRecurring(freq);
  if (f === "quarterly") return amount / 3;
  if (f === "yearly") return amount / 12;
  return amount;
}

/**
 * Next occurrence strictly after `afterIso`, using cadence from `anchorIso` (day-of-month)
 * and `freq`. Checks the month of `afterIso` first (e.g. after Feb 10 → Feb 15).
 */
export function nextRecurringDueDate(
  anchorIso: string,
  freq: RecurringInterval,
  afterIso: string,
  maxSteps = 48,
): string | null {
  let { y, m } = parseIsoDate(afterIso);

  for (let i = 0; i < maxSteps; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (recurringOccursInMonth({ date: anchorIso, recurring: freq }, key)) {
      const due = recurringDueDate(anchorIso, key);
      if (due > afterIso) return due;
    }
    ({ y, m } = addMonths(y, m, 1));
  }
  return null;
}

/** Calendar YYYY-MM-DD in an IANA timezone. */
export function zonedTodayIso(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
