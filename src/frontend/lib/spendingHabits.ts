import type { CategoryIndex } from "./categories";
import { isOutgoing, isSavings } from "./stats";
import type { Expense } from "./types";

export type HabitPeriod = "month" | "year";

export type HabitStyleId =
  | "clockwork"
  | "burst"
  | "dripper"
  | "peakValley"
  | "accumulator"
  | "nomad";

export type HabitStyleMeta = {
  id: HabitStyleId;
  title: string;
  temperament: string;
  pattern: string;
  behavior: string;
};

export const HABIT_STYLES: Record<HabitStyleId, HabitStyleMeta> = {
  clockwork: {
    id: "clockwork",
    title: "The Clockwork Spender",
    temperament: "Reserved / Predictable",
    pattern:
      "Fixed amounts occurring at identical intervals — the same charge on the same cadence.",
    behavior:
      "Highly disciplined, automated, or budget-locked. Usually fixed bills, subscriptions, or tightly controlled recurring allowances.",
  },
  burst: {
    id: "burst",
    title: "The Burst Spender",
    temperament: "Impulsive / Reactive",
    pattern:
      "Long quiet stretches interrupted by a cluster of high-frequency, varying-amount transactions over 24–48 hours.",
    behavior:
      "Spontaneous shopping sprees or retail therapy. The data shows a sudden dam-breaking effect after restriction.",
  },
  dripper: {
    id: "dripper",
    title: "The Steady Dripper",
    temperament: "Habitual / Mindless",
    pattern:
      "Low amounts at high frequency — small charges appearing almost daily throughout the period.",
    behavior:
      "Routine-driven micro-spending: coffees, convenience runs, or daily commutes that quietly bleed a budget.",
  },
  peakValley: {
    id: "peakValley",
    title: "The Peak-and-Valley Spender",
    temperament: "Cyclical / Thoughtful",
    pattern:
      "Large spikes right after a recurring calendar day (payday), then a steady taper toward the next cycle.",
    behavior:
      "Front-loading. Major purchases happen when liquidity is highest, then spending tightens later in the cycle.",
  },
  accumulator: {
    id: "accumulator",
    title: "The Calculated Accumulator",
    temperament: "Strategic / Deliberate",
    pattern:
      "Transactions pile onto a single day of the week or month, in large consolidated amounts rather than many small ones.",
    behavior:
      "Batched shopping. Wait, plan, then execute once — fewer trips, fewer impulse triggers.",
  },
  nomad: {
    id: "nomad",
    title: "The Erratic Nomad",
    temperament: "Chaotic / Unstructured",
    pattern:
      "Irregular intervals and unpredictable amounts with no clear link to calendar cycles.",
    behavior:
      "Spending follows whims or chaotic scheduling more than a structured budget or routine.",
  },
};

/** Minimum distinct calendar days with outgoing spend before a style is revealed. */
export const HABIT_MIN_ACTIVE_DAYS = 5;

export type HabitAssessment =
  | {
      status: "insufficient";
      daysHave: number;
      daysNeeded: number;
      periodLabel: string;
    }
  | {
      status: "ready";
      style: HabitStyleMeta;
      scores: Record<HabitStyleId, number>;
      periodLabel: string;
      txCount: number;
      activeDays: number;
    };

type TxPoint = {
  date: string;
  amount: number;
  dayOfWeek: number;
  dayOfMonth: number;
  time: number;
};

/** Parse YYYY-MM-DD into local calendar parts used by habit scoring. */
function parseDateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dayOfWeek: date.getDay(),
    dayOfMonth: d,
    time: date.getTime(),
  };
}

/** Mean of a numeric list, or 0 when empty. */
function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Population standard deviation. */
function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Coefficient of variation, capped for empty / zero-mean lists. */
function cv(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  if (m === 0) return 0;
  return stdev(values) / Math.abs(m);
}

/** Clamp a score into [0, 1]. */
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Sort ascending without mutating the source. */
function sorted(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

/** Percentile of a numeric list (linear interpolation). */
function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = sorted(values);
  if (s.length === 1) return s[0];
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  const t = idx - lo;
  return s[lo] * (1 - t) + s[hi] * t;
}

/** Share of items that equal the mode (within 1% relative tolerance for amounts). */
function modeShare(amounts: number[]) {
  if (!amounts.length) return 0;
  const buckets = new Map<number, number>();
  for (const a of amounts) {
    const key = Math.round(a * 100) / 100;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let best = 0;
  for (const count of buckets.values()) best = Math.max(best, count);
  return best / amounts.length;
}

/** Max histogram bin share for integer keys. */
function concentration(keys: number[]) {
  if (!keys.length) return 0;
  const hist = new Map<number, number>();
  for (const k of keys) hist.set(k, (hist.get(k) || 0) + 1);
  let best = 0;
  for (const count of hist.values()) best = Math.max(best, count);
  return best / keys.length;
}

/**
 * Group transactions into clusters where consecutive points are within
 * `windowMs` of each other (default 48 hours).
 */
function buildClusters(points: TxPoint[], windowMs = 48 * 60 * 60 * 1000) {
  if (!points.length) return [] as TxPoint[][];
  const clusters: TxPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (cur.time - prev.time <= windowMs) {
      clusters[clusters.length - 1].push(cur);
    } else {
      clusters.push([cur]);
    }
  }
  return clusters;
}

/** Day gaps between consecutive unique calendar dates. */
function dayGaps(dates: string[]) {
  const unique = [...new Set(dates)].sort();
  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const a = parseDateParts(unique[i - 1]).time;
    const b = parseDateParts(unique[i]).time;
    gaps.push(Math.round((b - a) / 86_400_000));
  }
  return gaps;
}

/**
 * Score how strongly spend rises after a fixed day-of-month and then tapers
 * through the rest of the cycle (payday front-loading).
 */
function peakValleyScore(points: TxPoint[]) {
  if (points.length < HABIT_MIN_ACTIVE_DAYS) return 0;

  const byMonth = new Map<string, TxPoint[]>();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    const list = byMonth.get(key) || [];
    list.push(p);
    byMonth.set(key, list);
  }

  const monthScores: number[] = [];
  for (const list of byMonth.values()) {
    if (list.length < 3) continue;

    const byDom = new Map<number, number>();
    for (const p of list) {
      byDom.set(p.dayOfMonth, (byDom.get(p.dayOfMonth) || 0) + p.amount);
    }

    const days = [...byDom.keys()].sort((a, b) => a - b);
    if (days.length < 3) continue;

    let bestPeak = days[0];
    let bestAmt = -1;
    for (const d of days) {
      const amt = byDom.get(d) || 0;
      if (amt > bestAmt) {
        bestAmt = amt;
        bestPeak = d;
      }
    }

    const after = days.filter((d) => d >= bestPeak);
    if (after.length < 2) continue;

    const series = after.map((d) => byDom.get(d) || 0);
    let declines = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i] <= series[i - 1] * 1.05) declines += 1;
    }
    const taper = declines / (series.length - 1);
    const peakShare = bestAmt / Math.max(1, series.reduce((s, v) => s + v, 0));
    monthScores.push(clamp01(taper * 0.65 + peakShare * 0.35));
  }

  if (!monthScores.length) return 0;
  return mean(monthScores);
}

/** Collect outgoing non-savings transactions for the selected habit period. */
export function habitPeriodExpenses(
  expenses: Expense[],
  period: HabitPeriod,
  monthKey: string,
  index?: CategoryIndex,
) {
  const prefix = period === "month" ? monthKey : monthKey.slice(0, 4);
  return expenses
    .filter((e) => isOutgoing(e) && !isSavings(e, index) && e.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
}

/** Human label for the period under assessment. */
export function habitPeriodLabel(period: HabitPeriod, monthKey: string) {
  if (period === "year") return monthKey.slice(0, 4);
  const [y, m] = monthKey.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString("en", { month: "long" });
  return `${name} ${y}`;
}

/** Score each habit style from a period's transaction list. */
export function scoreHabitStyles(expenses: Expense[]): Record<HabitStyleId, number> {
  const points: TxPoint[] = expenses.map((e) => {
    const parts = parseDateParts(e.date);
    return {
      date: e.date,
      amount: e.amount,
      dayOfWeek: parts.dayOfWeek,
      dayOfMonth: parts.dayOfMonth,
      time: parts.time,
    };
  });

  const amounts = points.map((p) => p.amount);
  const gaps = dayGaps(points.map((p) => p.date));
  const activeDays = new Set(points.map((p) => p.date)).size;
  const amountCv = cv(amounts);
  const gapCv = cv(gaps);
  const gapMean = mean(gaps);
  const mode = modeShare(amounts);
  const dowShare = concentration(points.map((p) => p.dayOfWeek));
  const domShare = concentration(points.map((p) => p.dayOfMonth));
  const medianAmt = percentile(amounts, 0.5);
  const p90 = percentile(amounts, 0.9);
  const clusters = buildClusters(points);
  const denseClusters = clusters.filter((c) => c.length >= 4);
  const quietGaps = gaps.filter((g) => g >= 5).length;
  const longQuietShare = gaps.length ? quietGaps / gaps.length : 0;
  const bursty =
    denseClusters.length > 0 &&
    longQuietShare >= 0.3 &&
    activeDays >= HABIT_MIN_ACTIVE_DAYS;

  const clockwork = clamp01(
    mode * 0.55 +
      (1 - Math.min(gapCv, 1.5) / 1.5) * 0.35 +
      (gapMean >= 5 && gapMean <= 35 ? 0.1 : 0),
  );

  let burst = 0;
  if (bursty) {
    const clusterSizes = denseClusters.map((c) => c.length);
    const inCluster = denseClusters.reduce((s, c) => s + c.length, 0);
    const clusterShare = inCluster / points.length;
    const clusterAmountCv = mean(denseClusters.map((c) => cv(c.map((p) => p.amount))));
    burst = clamp01(
      clusterShare * 0.4 +
        Math.min(1, mean(clusterSizes) / 6) * 0.25 +
        clusterAmountCv * 0.25 +
        longQuietShare * 0.1,
    );
  }

  const dailyRate = activeDays > 0 ? points.length / activeDays : 0;
  const smallShare = p90 > 0 ? medianAmt / p90 : 0;
  const dripper = clamp01(
    Math.min(1, activeDays / 18) * 0.35 +
      Math.min(1, points.length / 22) * 0.25 +
      (1 - Math.min(amountCv, 1.2) / 1.2) * 0.2 +
      (smallShare > 0.15 && smallShare < 0.55 ? 0.2 : smallShare * 0.1) +
      (dailyRate >= 1.1 ? 0.05 : 0),
  );

  const peakValley = peakValleyScore(points);

  const dayFocus = Math.max(dowShare, domShare);
  const largeBatch =
    medianAmt > 0 && p90 > 0 ? clamp01((medianAmt / Math.max(medianAmt, mean(amounts))) * (p90 / Math.max(p90, mean(amounts)))) : 0;
  const lowFrequency = clamp01(1 - Math.min(1, points.length / Math.max(activeDays * 2, 10)));
  const accumulator = clamp01(dayFocus * 0.55 + largeBatch * 0.2 + lowFrequency * 0.15 + (dayFocus > 0.45 ? 0.1 : 0));

  const nomad = clamp01(
    Math.min(1, amountCv / 1.4) * 0.4 +
      Math.min(1, gapCv / 1.6) * 0.4 +
      (1 - dayFocus) * 0.15 +
      (1 - mode) * 0.05,
  );

  return {
    clockwork,
    burst,
    dripper,
    peakValley,
    accumulator,
    nomad,
  };
}

/** Pick the winning habit style from a score map. */
export function pickHabitStyle(scores: Record<HabitStyleId, number>): HabitStyleId {
  const entries = Object.entries(scores) as [HabitStyleId, number][];
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [topId, topScore] = entries[0];
  const second = entries[1]?.[1] ?? 0;

  // Prefer a clear patterned style over nomad when the lead is weak.
  if (topId === "nomad" && second >= topScore - 0.04) {
    const patterned = entries.find(([id]) => id !== "nomad");
    if (patterned && patterned[1] >= 0.28) return patterned[0];
  }

  if (topScore < 0.22) return "nomad";
  return topId;
}

/**
 * Assess spending habit style for a month or year window.
 * Requires at least {@link HABIT_MIN_ACTIVE_DAYS} distinct transaction days.
 */
export function assessSpendingHabit(
  expenses: Expense[],
  period: HabitPeriod,
  monthKey: string,
  index?: CategoryIndex,
): HabitAssessment {
  const periodLabel = habitPeriodLabel(period, monthKey);
  const list = habitPeriodExpenses(expenses, period, monthKey, index);
  const activeDays = new Set(list.map((e) => e.date)).size;

  if (activeDays < HABIT_MIN_ACTIVE_DAYS) {
    return {
      status: "insufficient",
      daysHave: activeDays,
      daysNeeded: HABIT_MIN_ACTIVE_DAYS,
      periodLabel,
    };
  }

  const scores = scoreHabitStyles(list);
  const id = pickHabitStyle(scores);

  return {
    status: "ready",
    style: HABIT_STYLES[id],
    scores,
    periodLabel,
    txCount: list.length,
    activeDays,
  };
}
