import type { Expense, LedgerEvent, MonthEntry } from "./types";

// Exposes to window: CATEGORIES, CAT_BY_ID, SUB_BY_ID, MONTHS, buildSeedData,
//   fmtMoney, fmtMoneyShort, monthLabel, todayISO, CURRENCY

export const CURRENCY = { code: "MYR", symbol: "RM" };

export const CURRENCIES = [
  { code: "MYR", symbol: "RM", label: "Malaysian Ringgit" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "THB", symbol: "฿", label: "Thai Baht" },
  { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah" },
  { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
] as const;

export const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code?: string) {
  return CURRENCY_BY_CODE[code ?? CURRENCY.code] ?? CURRENCY;
}

// ── Category taxonomy ───────────────────────────────────────────────
// Each category: id, name, color (cool muted chart palette), icon glyph, subs[]
export const CATEGORIES = [
  {
    id: "food", name: "Food & Dining", color: "#5b7a8a", glyph: "◓",
    subs: [
      { id: "groceries", name: "Groceries" },
      { id: "meal", name: "Meal" },
      { id: "snacks", name: "Snacks" },
    ],
  },
  {
    id: "transport", name: "Transport", color: "#6f8b6f", glyph: "◇",
    subs: [
      { id: "petrol", name: "Petrol" },
      { id: "transportation", name: "Transportation" },
    ],
  },
  {
    id: "utilities", name: "Bills & Utilities", color: "#4f8a7b", glyph: "◈",
    subs: [
      { id: "electricity", name: "Electricity" },
      { id: "water", name: "Water" },
      { id: "internet", name: "Internet" },
    ],
  },
  {
    id: "sport", name: "Health & Sport", color: "#4a6fa5", glyph: "△",
    subs: [
      { id: "gym", name: "Sport" },
    ],
  },
  {
    id: "fun", name: "Entertainment", color: "#a06f95", glyph: "◐",
    subs: [
      { id: "streaming", name: "Streaming" },
      { id: "outings", name: "Outings" },
      { id: "games", name: "Games" },
    ],
  },
  {
    id: "savings", name: "Savings", color: "#7a6fa5", glyph: "◆",
    subs: [
      { id: "saving", name: "Saving" },
    ],
  },
  {
    id: "income", name: "Income", color: "#6f8b6f", glyph: "◇",
    subs: [
      { id: "salary", name: "Salary" },
      { id: "wages", name: "Wages" },
      { id: "bonus", name: "Bonus" },
      { id: "funds", name: "Funds" },
      { id: "other_income", name: "Other" },
    ],
  },
];

export const INCOME_CATEGORY = CATEGORIES.find((c) => c.id === "income")!;
export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "income");
export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const SUB_BY_ID: Record<string, { id: string; name: string; catId: string; color: string }> =
  {};
CATEGORIES.forEach((c) =>
  c.subs.forEach((s) => {
    SUB_BY_ID[s.id] = { ...s, catId: c.id, color: c.color };
  }),
);

// Monthly budgets per category (MYR)
export const DEFAULT_BUDGETS = {
  food: 1200,
  transport: 500,
  utilities: 450,
  sport: 180,
  fun: 350,
  savings: 1000,
  income: 0,
};
export const DEFAULT_INCOME = 5600;

// ── Seeded RNG (mulberry32) so sample data is deterministic ─────────
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const between = (r, lo, hi) => lo + r() * (hi - lo);
export function pad(n: number) { return String(n).padStart(2, "0"); }

export const MIN_MONTH_KEY = "2020-01";

const _now = new Date();
export const CURRENT_YEAR = _now.getFullYear();
export const CURRENT_MONTH = _now.getMonth();
export const CURRENT_DAY = _now.getDate();
export const CURRENT_MONTH_KEY = `${CURRENT_YEAR}-${pad(CURRENT_MONTH + 1)}`;
export const TODAY_ISO = `${CURRENT_MONTH_KEY}-${pad(CURRENT_DAY)}`;
export const MAX_MONTH_KEY = `${CURRENT_YEAR + 10}-${pad(CURRENT_MONTH + 1)}`;

export function buildMonths(fromKey: string, toKey: string): MonthEntry[] {
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

export function clampMonthKey(key?: string | null) {
  const month = key || CURRENT_MONTH_KEY;
  if (month < MIN_MONTH_KEY) return MIN_MONTH_KEY;
  if (month > MAX_MONTH_KEY) return MAX_MONTH_KEY;
  return month;
}

export function monthRangeBounds() {
  const [minY, minM] = MIN_MONTH_KEY.split("-").map(Number);
  const [maxY, maxM] = MAX_MONTH_KEY.split("-").map(Number);
  return { minY, minM, maxY, maxM };
}

export function yearsInRange() {
  const { minY, maxY } = monthRangeBounds();
  const years: number[] = [];
  for (let y = minY; y <= maxY; y++) years.push(y);
  return years;
}

export function monthsInYear(year: number) {
  const { minY, minM, maxY, maxM } = monthRangeBounds();
  const start = year === minY ? minM : 1;
  const end = year === maxY ? maxM : 12;
  const months: number[] = [];
  for (let m = start; m <= end; m++) months.push(m);
  return months;
}

/** Last N navigable months ending at anchor (for charts). */
export function monthsWindow(anchorKey: string, size = 6) {
  const idx = MONTHS.findIndex((m) => m.key === anchorKey);
  if (idx < 0) return MONTHS.slice(-size);
  return MONTHS.slice(Math.max(0, idx - size + 1), idx + 1);
}

// Note pools per subcategory for believable entries
export const NOTES = {
  groceries: ["Jaya Grocer", "Tesco run", "Village Grocer", "Wet market", "NSK weekly"],
  meal: ["Lunch — nasi kandar", "Dinner out", "Mamak", "Cafe brunch", "Office lunch"],
  snacks: ["Kopi & kaya toast", "Bubble tea", "Bakery", "Convenience store"],
  petrol: ["Petronas fill-up", "Shell RON95", "BHP top-up"],
  transportation: ["Grab ride", "Touch 'n Go reload", "MRT", "Parking"],
  electricity: ["TNB bill"],
  water: ["Air Selangor"],
  internet: ["Unifi fibre", "Mobile data"],
  gym: ["Gym membership", "Badminton court", "Football session", "Yoga class"],
  streaming: ["Netflix", "Spotify", "Disney+ Hotstar"],
  outings: ["Cinema — GSC", "Concert ticket", "Bowling", "Karaoke"],
  games: ["Steam sale", "Mobile game top-up"],
  saving: ["ASB transfer", "Emergency fund", "Fixed deposit"],
};

// recurring templates (fixed each month)
export const RECURRING = [
  { sub: "internet", note: "Unifi fibre", day: 3, amount: 139, freq: "Monthly" },
  { sub: "streaming", note: "Netflix", day: 5, amount: 55, freq: "Monthly" },
  { sub: "streaming", note: "Spotify", day: 5, amount: 18, freq: "Monthly" },
  { sub: "gym", note: "Gym membership", day: 1, amount: 120, freq: "Monthly" },
  { sub: "electricity", note: "TNB bill", day: 12, amount: 0, freq: "Monthly" }, // amount varies
  { sub: "water", note: "Air Selangor", day: 14, amount: 0, freq: "Monthly" },
  { sub: "saving", note: "ASB auto-transfer", day: 2, amount: 1000, freq: "Monthly" },
];

let _idc = 1;
export const nid = () => "e" + _idc++;

// Build a realistic spread of expenses for one month
export function seedMonth(monthObj, r, partialDay) {
  const { year, m, key } = monthObj;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const lastDay = partialDay || daysInMonth;
  const out = [];
  const iso = (d) => `${year}-${pad(m + 1)}-${pad(d)}`;

  // Recurring fixed items
  RECURRING.forEach((rc) => {
    if (rc.day > lastDay) return;
    let amt = rc.amount;
    if (rc.sub === "electricity") amt = Math.round(between(r, 165, 245));
    if (rc.sub === "water") amt = Math.round(between(r, 28, 52));
    out.push({
      id: nid(), date: iso(rc.day), sub: rc.sub, amount: amt,
      note: rc.note, recurring: "monthly",
    });
  });

  // Variable daily-ish spending
  const variableSubs = [
    ["groceries", 0.5, 60, 220],
    ["meal", 0.8, 12, 45],
    ["snacks", 0.6, 4, 18],
    ["petrol", 0.18, 80, 140],
    ["transportation", 0.45, 6, 28],
    ["outings", 0.12, 25, 120],
    ["games", 0.05, 20, 90],
  ];
  for (let d = 1; d <= lastDay; d++) {
    variableSubs.forEach(([sub, prob, lo, hi]) => {
      if (r() < prob) {
        out.push({
          id: nid(), date: iso(d), sub,
          amount: Math.round(between(r, lo, hi) * 100) / 100,
          note: pick(r, NOTES[sub] || ["—"]), recurring: false,
        });
      }
    });
  }
  return out;
}

export function buildSeedData() {
  _idc = 1;
  const seedMonths = monthsWindow(CURRENT_MONTH_KEY, 6);
  let all = [];
  seedMonths.forEach((mo, i) => {
    const r = rng(1000 + i * 97);
    const partial = mo.key === CURRENT_MONTH_KEY ? CURRENT_DAY : null;
    all = all.concat(seedMonth(mo, r, partial));
  });
  // newest first
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    expenses: all,
    budgets: { ...DEFAULT_BUDGETS },
    income: DEFAULT_INCOME,
    events: buildSeedSchedule(),
    currentMonth: CURRENT_MONTH_KEY,
  };
}

// ── Schedule: event types, recurrence, reminders ────────────────────
// Event categories cover a mix of financial and general life events,
// reusing the cool muted palette.
export const EVENT_CATS = [
  { id: "bill",        name: "Bill / Payment", color: "#4f8a7b", glyph: "◈" },
  { id: "income",      name: "Income",         color: "#6f8b6f", glyph: "◇" },
  { id: "savings",     name: "Savings",        color: "#7a6fa5", glyph: "◆" },
  { id: "renewal",     name: "Renewal",        color: "#5b7a8a", glyph: "◓" },
  { id: "appointment", name: "Appointment",    color: "#4a6fa5", glyph: "△" },
  { id: "personal",    name: "Personal",       color: "#a06f95", glyph: "●" },
];
export const EVENT_CAT_BY_ID = Object.fromEntries(EVENT_CATS.map((c) => [c.id, c]));

export const REPEATS = [
  { id: "once",    label: "One-time", adj: "Once" },
  { id: "daily",   label: "Daily",    adj: "Daily" },
  { id: "weekly",  label: "Weekly",   adj: "Weekly" },
  { id: "monthly", label: "Monthly",  adj: "Monthly" },
  { id: "yearly",  label: "Yearly",   adj: "Yearly" },
];
export const REPEAT_BY_ID = Object.fromEntries(REPEATS.map((r) => [r.id, r]));

export const LEAD_TIMES = [
  { id: "at",  label: "At time of event", short: "on time" },
  { id: "10m", label: "10 minutes before", short: "10 min before" },
  { id: "1h",  label: "1 hour before",     short: "1 hr before" },
  { id: "1d",  label: "1 day before",      short: "1 day before" },
  { id: "1w",  label: "1 week before",     short: "1 wk before" },
];
export const LEAD_BY_ID = Object.fromEntries(LEAD_TIMES.map((l) => [l.id, l]));

// Seed schedule — a believable mix of money + life events around "today".
export const SEED_EVENTS = [
  { title: "Rent due", catId: "bill", date: "2026-06-01", allDay: true, time: null, repeat: "monthly", notify: true, lead: "1d",
    comments: [{ text: "Landlord prefers a bank transfer before noon.", at: "2026-05-28T09:12:00" }] },
  { title: "ASB auto-transfer", catId: "savings", date: "2026-06-02", allDay: true, time: null, repeat: "monthly", notify: false, lead: "1d", comments: [] },
  { title: "Badminton session", catId: "personal", date: "2026-06-09", allDay: false, time: "19:30", repeat: "weekly", notify: true, lead: "1h",
    comments: [{ text: "Court 3 booked. Bring spare shuttlecocks.", at: "2026-06-06T12:04:00" }] },
  { title: "TNB electricity bill", catId: "bill", date: "2026-06-12", allDay: true, time: null, repeat: "monthly", notify: true, lead: "1d",
    comments: [{ text: "Usually ~RM200. Check the AC usage this month.", at: "2026-06-02T20:41:00" }] },
  { title: "Dentist appointment", catId: "appointment", date: "2026-06-16", allDay: false, time: "10:00", repeat: "once", notify: true, lead: "1d", comments: [] },
  { title: "Credit card payment", catId: "bill", date: "2026-06-18", allDay: true, time: null, repeat: "monthly", notify: true, lead: "1w", comments: [] },
  { title: "Car insurance renewal", catId: "renewal", date: "2026-06-22", allDay: true, time: null, repeat: "yearly", notify: true, lead: "1w",
    comments: [{ text: "Compare quotes with Etiqa & Allianz before renewing.", at: "2026-06-01T15:22:00" }] },
  { title: "Salary deposit", catId: "income", date: "2026-06-25", allDay: true, time: null, repeat: "monthly", notify: true, lead: "at", comments: [] },
];

let _eidc = 1;
export function buildSeedSchedule() {
  _eidc = 1;
  return SEED_EVENTS.map((e) => ({ id: "ev" + _eidc++, email: "", ...e, comments: e.comments.map((c, i) => ({ id: "c" + _eidc + "_" + i, ...c })) }));
}

// Does a recurring event occur on a given ISO date?
export function occursOn(ev, iso) {
  if (iso < ev.date) return false;
  const a = new Date(ev.date + "T00:00:00");
  const b = new Date(iso + "T00:00:00");
  switch (ev.repeat) {
    case "once":    return iso === ev.date;
    case "daily":   return true;
    case "weekly":  return a.getDay() === b.getDay();
    case "monthly": return a.getDate() === b.getDate();
    case "yearly":  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    default:        return iso === ev.date;
  }
}

// All occurrences within a month, sorted by date then time. → [{iso, ev}]
export function scheduleForMonth(events, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const iso = `${monthKey}-${pad(d)}`;
    events.forEach((ev) => { if (occursOn(ev, iso)) out.push({ iso, ev }); });
  }
  out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : ((a.ev.time || "00:00") < (b.ev.time || "00:00") ? -1 : 1)));
  return out;
}

export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${pad(m)} ${ap}`;
}
export function eventTimeLabel(ev) { return ev.allDay ? "All day" : fmtTime(ev.time); }
export function repeatLabel(ev) { return (REPEAT_BY_ID[ev.repeat] || REPEAT_BY_ID.once).label; }
export function leadLabel(id) { return (LEAD_BY_ID[id] || LEAD_BY_ID.at).label; }
export function fmtCommentTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fullDayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

// ── Formatting helpers ──────────────────────────────────────────────
export function fmtMoney(n, opts: { cents?: boolean; currency?: string } = {}) {
  const cur = getCurrency(opts.currency);
  const v = Math.abs(n);
  const s = v.toLocaleString("en-MY", {
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });
  return `${n < 0 ? "−" : ""}${cur.symbol}${s}`;
}
export function fmtMoneyShort(n, currency?: string) {
  const cur = getCurrency(currency);
  if (Math.abs(n) >= 1000) return `${cur.symbol}${(n / 1000).toFixed(1)}k`;
  return `${cur.symbol}${Math.round(n)}`;
}
export function monthLabel(key, long) {
  const [y, mm] = key.split("-").map(Number);
  const d = new Date(y, mm - 1, 1);
  return d.toLocaleString("en-US", { month: long ? "long" : "short", year: long ? "numeric" : undefined });
}
export function dayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleString("en-US", { day: "numeric", month: "short" });
}
export function weekdayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleString("en-US", { weekday: "short" });
}

