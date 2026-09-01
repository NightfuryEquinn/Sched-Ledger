import {
  CURRENT_MONTH_KEY,
  TODAY_ISO,
  dayLabel,
  isoFromDate,
  monthsWindow,
  weekdayLabel,
} from "./data";
import type { CategoryIndex } from "./categories";
import {
  DEFAULT_FORMATTERS,
  clamp01,
  confidenceLevel,
  cv,
  mean,
  pct,
  percentileOf,
  sorted,
  stats1D,
  topBin,
  type Confidence,
  type ConfidenceLevel,
  type Formatters,
} from "./stat-helpers";
import { catMetaOf, isOutgoing, isRecurring, isSavings } from "./stats";
import type { Expense } from "./types";

export type HabitPeriod = "month" | "year" | "rolling90";

export type HabitStyleId =
  "clockwork" | "burst" | "dripper" | "peakValley" | "accumulator" | "nomad";

type HabitStyleMeta = {
  id: HabitStyleId;
  title: string;
  /** Short trait label used in the blend line ("with a Burst streak"). */
  trait: string;
  temperament: string;
  pattern: string;
  behavior: string;
};

export const HABIT_STYLES: Record<HabitStyleId, HabitStyleMeta> = {
  clockwork: {
    id: "clockwork",
    title: "The Clockwork Spender",
    trait: "Clockwork",
    temperament: "Reserved / Predictable",
    pattern:
      "Fixed amounts occurring at identical intervals — the same charge on the same cadence.",
    behavior:
      "Highly disciplined, automated, or budget-locked. Usually fixed bills, subscriptions, or tightly controlled recurring allowances.",
  },
  burst: {
    id: "burst",
    title: "The Burst Spender",
    trait: "Burst",
    temperament: "Impulsive / Reactive",
    pattern:
      "Long quiet stretches interrupted by a cluster of high-frequency, varying-amount transactions over 24–48 hours.",
    behavior:
      "Spontaneous shopping sprees or retail therapy. The data shows a sudden dam-breaking effect after restriction.",
  },
  dripper: {
    id: "dripper",
    title: "The Steady Dripper",
    trait: "Drip",
    temperament: "Habitual / Mindless",
    pattern:
      "Low amounts at high frequency — small charges appearing almost daily throughout the period.",
    behavior:
      "Routine-driven micro-spending: coffees, convenience runs, or daily commutes that quietly bleed a budget.",
  },
  peakValley: {
    id: "peakValley",
    title: "The Peak-and-Valley Spender",
    trait: "Peak-and-Valley",
    temperament: "Cyclical / Thoughtful",
    pattern:
      "Large spikes right after a recurring calendar day (payday), then a steady taper toward the next cycle.",
    behavior:
      "Front-loading. Major purchases happen when liquidity is highest, then spending tightens later in the cycle.",
  },
  accumulator: {
    id: "accumulator",
    title: "The Calculated Accumulator",
    trait: "Batch",
    temperament: "Strategic / Deliberate",
    pattern:
      "Transactions pile onto a single day of the week or month, in large consolidated amounts rather than many small ones.",
    behavior:
      "Batched shopping. Wait, plan, then execute once — fewer trips, fewer impulse triggers.",
  },
  nomad: {
    id: "nomad",
    title: "The Erratic Nomad",
    trait: "Erratic",
    temperament: "Chaotic / Unstructured",
    pattern: "Irregular intervals and unpredictable amounts with no clear link to calendar cycles.",
    behavior:
      "Spending follows whims or chaotic scheduling more than a structured budget or routine.",
  },
};

/** Minimum distinct calendar days with outgoing spend before a style is revealed. */
export const HABIT_MIN_ACTIVE_DAYS = 5;

type HabitCatStat = {
  id: string;
  name: string;
  color: string;
  glyph: string;
  amount: number;
  txCount: number;
  /** Share of this period's total spend, 0..1. */
  share: number;
};

type HabitMetrics = {
  txCount: number;
  activeDays: number;
  spanDays: number;
  total: number;

  // amounts
  meanAmt: number;
  medianAmt: number;
  p90: number;
  minAmt: number;
  maxAmt: number;
  amountCv: number;
  modeAmount: number;
  modeCount: number;
  modeShare: number;

  // rhythm
  medianGap: number;
  meanGap: number;
  gapCv: number;
  longestQuiet: number;
  quietShare: number;

  // calendar concentration
  topDow: number;
  topDowShare: number;
  topDowCount: number;
  topDowSampleDate: string;
  topDom: number;
  topDomShare: number;
  topDomAmount: number;

  // clustering
  clusterCount: number;
  denseClusterCount: number;
  biggestCluster: {
    size: number;
    amount: number;
    spanDays: number;
    startDate: string;
    share: number;
  } | null;

  // schedule
  recurringCount: number;
  recurringAmount: number;
  recurringShare: number;

  // attribution (empty when computed with { attribution: false })
  categories: HabitCatStat[];
  driverByAmount: HabitCatStat | null;
  driverByCount: HabitCatStat | null;
  driverInPeak: HabitCatStat | null;
  driverInCluster: HabitCatStat | null;
  driverRecurring: HabitCatStat | null;
};

/** Confidence shape is shared with the income engine — see `stat-helpers`. */
type HabitConfidenceLevel = ConfidenceLevel;
type HabitConfidence = Confidence;

type HabitAssessment =
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
      metrics: HabitMetrics;
      confidence: HabitConfidence;
      blend: { secondary: HabitStyleMeta | null; weight: number; label: string };
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
  sub: string;
  recurring: boolean;
  /** Index into the cluster array built for this point set; set after clustering. */
  cluster: number;
};

/** Parse YYYY-MM-DD into local calendar parts used by habit scoring. */
function parseDateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return {
    dayOfWeek: date.getDay(),
    dayOfMonth: d!,
    time: date.getTime(),
  };
}

/**
 * Group transactions into clusters where consecutive points are within
 * `windowMs` of each other (default 48 hours). Also stamps `point.cluster`
 * with the index of the cluster it belongs to.
 */
function buildClusters(points: TxPoint[], windowMs = 48 * 60 * 60 * 1000) {
  if (!points.length) return [] as TxPoint[][];
  const clusters: TxPoint[][] = [[points[0]!]];
  points[0]!.cluster = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    if (cur.time - prev.time <= windowMs) {
      clusters[clusters.length - 1]!.push(cur);
    } else {
      clusters.push([cur]);
    }
    cur.cluster = clusters.length - 1;
  }
  return clusters;
}

/** Day gaps between consecutive unique calendar dates, given dates already ascending. */
function gapsFromOrderedDates(dates: string[], times: number[]) {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(Math.round((times[i]! - times[i - 1]!) / 86_400_000));
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

    let bestPeak = days[0]!;
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
      if (series[i]! <= series[i - 1]! * 1.05) declines += 1;
    }
    const taper = declines / (series.length - 1);
    const peakShare =
      bestAmt /
      Math.max(
        1,
        series.reduce((s, v) => s + v, 0),
      );
    monthScores.push(clamp01(taper * 0.65 + peakShare * 0.35));
  }

  if (!monthScores.length) return 0;
  return mean(monthScores);
}

/** Sorted-ascending TxPoint list, with dayOfWeek/dayOfMonth/time cached per distinct date. */
function buildPoints(expenses: Expense[]): TxPoint[] {
  const dateCache = new Map<string, { dayOfWeek: number; dayOfMonth: number; time: number }>();
  const points: TxPoint[] = expenses.map((e) => {
    let parts = dateCache.get(e.date);
    if (!parts) {
      parts = parseDateParts(e.date);
      dateCache.set(e.date, parts);
    }
    return {
      date: e.date,
      amount: e.amount,
      dayOfWeek: parts.dayOfWeek,
      dayOfMonth: parts.dayOfMonth,
      time: parts.time,
      sub: e.sub,
      recurring: isRecurring(e),
      cluster: -1,
    };
  });
  points.sort((a, b) => a.time - b.time || a.date.localeCompare(b.date));
  return points;
}

/** Category-attribution helper: fold one point's amount into its category bucket. */
function addCatBucket(
  buckets: Map<string, { amount: number; txCount: number }>,
  p: TxPoint,
  index?: CategoryIndex,
  metaCache?: Map<string, ReturnType<typeof catMetaOf>>,
) {
  let meta = metaCache?.get(p.sub);
  if (!meta) {
    meta = catMetaOf(p.sub, index);
    metaCache?.set(p.sub, meta);
  }
  const prev = buckets.get(meta.id);
  if (prev) {
    prev.amount += p.amount;
    prev.txCount += 1;
  } else {
    buckets.set(meta.id, { amount: p.amount, txCount: 1 });
  }
}

/** Turn a {amount, txCount} bucket map into sorted HabitCatStat[]. */
function sealCatStats(
  buckets: Map<string, { amount: number; txCount: number }>,
  total: number,
  index?: CategoryIndex,
): HabitCatStat[] {
  const out: HabitCatStat[] = [];
  for (const [id, v] of buckets) {
    const meta = index?.catById[id];
    out.push({
      id,
      name: meta?.name ?? id,
      color: meta?.color ?? "#8b93a1",
      glyph: meta?.glyph ?? "",
      amount: v.amount,
      txCount: v.txCount,
      share: total ? v.amount / total : 0,
    });
  }
  out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return out;
}

/** Top bucket, resolved to a HabitCatStat, or null when the bucket map is empty. */
function topCatStat(
  buckets: Map<string, { amount: number; txCount: number }>,
  by: "amount" | "txCount",
  total: number,
  index?: CategoryIndex,
): HabitCatStat | null {
  let bestId: string | null = null;
  let bestVal = -1;
  for (const [id, v] of buckets) {
    const val = v[by];
    if (val > bestVal) {
      bestVal = val;
      bestId = id;
    }
  }
  if (bestId === null) return null;
  const v = buckets.get(bestId)!;
  const meta = index?.catById[bestId];
  return {
    id: bestId,
    name: meta?.name ?? bestId,
    color: meta?.color ?? "#8b93a1",
    glyph: meta?.glyph ?? "",
    amount: v.amount,
    txCount: v.txCount,
    share: total ? v.amount / total : 0,
  };
}

const EMPTY_METRICS_ATTRIBUTION = {
  categories: [] as HabitCatStat[],
  driverByAmount: null,
  driverByCount: null,
  driverInPeak: null,
  driverInCluster: null,
  driverRecurring: null,
};

/**
 * Compute the full signal set behind a habit verdict, plus the six archetype
 * scores derived from it. `opts.attribution` (default true) controls whether
 * per-category driver attribution runs — the 6-month trajectory only needs
 * `scores`, so it skips this pass entirely.
 */
export function computeHabitMetrics(
  expenses: Expense[],
  index?: CategoryIndex,
  opts?: { attribution?: boolean },
): { metrics: HabitMetrics; scores: Record<HabitStyleId, number> } {
  const attribution = opts?.attribution !== false;
  const points = buildPoints(expenses);
  const txCount = points.length;

  // Pass 1: amounts, calendar histograms, unique dates, recurring, categories.
  const amounts: number[] = new Array(txCount);
  let sum = 0;
  let sumSq = 0;
  let minAmt = Infinity;
  let maxAmt = -Infinity;
  const dowCount = new Map<number, number>();
  const domCount = new Map<number, number>();
  const domAmount = new Map<number, number>();
  const dowFirstDate = new Map<number, string>();
  const amountBuckets = new Map<number, number>();
  const uniqueDates: string[] = [];
  const uniqueTimes: number[] = [];
  let recurringCount = 0;
  let recurringAmount = 0;
  const catBuckets = new Map<string, { amount: number; txCount: number }>();
  const metaCache = new Map<string, ReturnType<typeof catMetaOf>>();
  let total = 0;

  let lastDate = "";
  for (let i = 0; i < txCount; i++) {
    const p = points[i]!;
    amounts[i] = p.amount;
    sum += p.amount;
    sumSq += p.amount * p.amount;
    if (p.amount < minAmt) minAmt = p.amount;
    if (p.amount > maxAmt) maxAmt = p.amount;
    total += p.amount;

    dowCount.set(p.dayOfWeek, (dowCount.get(p.dayOfWeek) || 0) + 1);
    if (!dowFirstDate.has(p.dayOfWeek)) dowFirstDate.set(p.dayOfWeek, p.date);
    domCount.set(p.dayOfMonth, (domCount.get(p.dayOfMonth) || 0) + 1);
    domAmount.set(p.dayOfMonth, (domAmount.get(p.dayOfMonth) || 0) + p.amount);

    const roundedAmt = Math.round(p.amount * 100) / 100;
    amountBuckets.set(roundedAmt, (amountBuckets.get(roundedAmt) || 0) + 1);

    if (p.date !== lastDate) {
      uniqueDates.push(p.date);
      uniqueTimes.push(p.time);
      lastDate = p.date;
    }

    if (p.recurring) {
      recurringCount += 1;
      recurringAmount += p.amount;
    }

    addCatBucket(catBuckets, p, index, metaCache);
  }

  const activeDays = uniqueDates.length;
  const meanAmt = txCount ? sum / txCount : 0;
  const variance = txCount ? Math.max(0, sumSq / txCount - meanAmt * meanAmt) : 0;
  const amountStdev = Math.sqrt(variance);
  const amountCv = txCount >= 2 && meanAmt !== 0 ? amountStdev / Math.abs(meanAmt) : 0;

  const sortedAmounts = sorted(amounts);
  const medianAmt = percentileOf(sortedAmounts, 0.5);
  const p90 = percentileOf(sortedAmounts, 0.9);

  const gaps = gapsFromOrderedDates(uniqueDates, uniqueTimes);
  const sortedGaps = sorted(gaps);
  const medianGap = percentileOf(sortedGaps, 0.5);
  const { mean: meanGap, cv: gapCv } = stats1D(gaps);
  const longestQuiet = gaps.length ? Math.max(...gaps) : 0;
  const quietGaps = gaps.filter((g) => g >= 5).length;
  const quietShare = gaps.length ? quietGaps / gaps.length : 0;

  const mode = topBin(amountBuckets, txCount);
  const dowShareBin = topBin(dowCount, txCount);
  const domShareBin = topBin(domCount, txCount);
  const topDow = dowShareBin.value;
  const topDom = domShareBin.value;
  const topDomAmount = domAmount.get(topDom) || 0;

  const clusters = buildClusters(points);
  const denseClusters = clusters.filter((c) => c.length >= 4);
  let biggestCluster: HabitMetrics["biggestCluster"] = null;
  let biggestClusterIdx = -1;
  {
    let bestSize = 0;
    for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci]!;
      if (c.length > bestSize) {
        bestSize = c.length;
        biggestClusterIdx = ci;
      }
    }
    if (biggestClusterIdx >= 0) {
      const c = clusters[biggestClusterIdx]!;
      const amt = c.reduce((s, p) => s + p.amount, 0);
      biggestCluster = {
        size: c.length,
        amount: amt,
        spanDays: Math.max(1, Math.round((c[c.length - 1]!.time - c[0]!.time) / 86_400_000) + 1),
        startDate: c[0]!.date,
        share: total ? amt / total : 0,
      };
    }
  }

  const dayFocus = Math.max(dowShareBin.share, domShareBin.share);
  const bursty =
    denseClusters.length > 0 && quietShare >= 0.3 && activeDays >= HABIT_MIN_ACTIVE_DAYS;

  // ── archetype scores (formulas unchanged from the original implementation) ──
  const clockwork = clamp01(
    mode.share * 0.55 +
      (1 - Math.min(gapCv, 1.5) / 1.5) * 0.35 +
      (meanGap >= 5 && meanGap <= 35 ? 0.1 : 0),
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
        quietShare * 0.1,
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

  const largeBatch =
    medianAmt > 0 && p90 > 0
      ? clamp01((medianAmt / Math.max(medianAmt, meanAmt)) * (p90 / Math.max(p90, meanAmt)))
      : 0;
  const lowFrequency = clamp01(1 - Math.min(1, points.length / Math.max(activeDays * 2, 10)));
  const accumulator = clamp01(
    dayFocus * 0.55 + largeBatch * 0.2 + lowFrequency * 0.15 + (dayFocus > 0.45 ? 0.1 : 0),
  );

  const nomad = clamp01(
    Math.min(1, amountCv / 1.4) * 0.4 +
      Math.min(1, gapCv / 1.6) * 0.4 +
      (1 - dayFocus) * 0.15 +
      (1 - mode.share) * 0.05,
  );

  const scores: Record<HabitStyleId, number> = {
    clockwork,
    burst,
    dripper,
    peakValley,
    accumulator,
    nomad,
  };

  // ── attribution (pass 2, opt-out) ──
  let attributionFields: Pick<
    HabitMetrics,
    | "categories"
    | "driverByAmount"
    | "driverByCount"
    | "driverInPeak"
    | "driverInCluster"
    | "driverRecurring"
  >;

  if (attribution) {
    const peakBuckets = new Map<string, { amount: number; txCount: number }>();
    const clusterBuckets = new Map<string, { amount: number; txCount: number }>();
    const recurringBuckets = new Map<string, { amount: number; txCount: number }>();

    for (const p of points) {
      if (p.dayOfWeek === topDow || p.dayOfMonth === topDom)
        addCatBucket(peakBuckets, p, index, metaCache);
      if (p.cluster === biggestClusterIdx) addCatBucket(clusterBuckets, p, index, metaCache);
      if (p.recurring) addCatBucket(recurringBuckets, p, index, metaCache);
    }

    attributionFields = {
      categories: sealCatStats(catBuckets, total, index),
      driverByAmount: topCatStat(catBuckets, "amount", total, index),
      driverByCount: topCatStat(catBuckets, "txCount", total, index),
      driverInPeak: topCatStat(peakBuckets, "amount", total, index),
      driverInCluster: topCatStat(clusterBuckets, "amount", total, index),
      driverRecurring: topCatStat(recurringBuckets, "amount", total, index),
    };
  } else {
    attributionFields = EMPTY_METRICS_ATTRIBUTION;
  }

  const metrics: HabitMetrics = {
    txCount,
    activeDays,
    spanDays: uniqueTimes.length
      ? Math.round((uniqueTimes[uniqueTimes.length - 1]! - uniqueTimes[0]!) / 86_400_000) + 1
      : 0,
    total,

    meanAmt,
    medianAmt,
    p90,
    minAmt: txCount ? minAmt : 0,
    maxAmt: txCount ? maxAmt : 0,
    amountCv,
    modeAmount: mode.value,
    modeCount: mode.count,
    modeShare: mode.share,

    medianGap,
    meanGap,
    gapCv,
    longestQuiet,
    quietShare,

    topDow,
    topDowShare: dowShareBin.share,
    topDowCount: dowShareBin.count,
    topDowSampleDate: dowFirstDate.get(topDow) ?? "",
    topDom,
    topDomShare: domShareBin.share,
    topDomAmount,

    clusterCount: clusters.length,
    denseClusterCount: denseClusters.length,
    biggestCluster,

    recurringCount,
    recurringAmount,
    recurringShare: total ? recurringAmount / total : 0,

    ...attributionFields,
  };

  return { metrics, scores };
}

/** Score each habit style from a period's transaction list. */
export function scoreHabitStyles(expenses: Expense[]): Record<HabitStyleId, number> {
  return computeHabitMetrics(expenses, undefined, { attribution: false }).scores;
}

/** Style ids ranked by score, highest first, ties broken alphabetically by id. */
export function rankStyles(scores: Record<HabitStyleId, number>): [HabitStyleId, number][] {
  const entries = Object.entries(scores) as [HabitStyleId, number][];
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries;
}

/** Pick the winning habit style from a ranked score list. */
export function pickHabitStyle(scores: Record<HabitStyleId, number>): HabitStyleId {
  return pickFromRanked(rankStyles(scores));
}

function pickFromRanked(ranked: [HabitStyleId, number][]): HabitStyleId {
  const [topId, topScore] = ranked[0]!;
  const second = ranked[1]?.[1] ?? 0;

  // Prefer a clear patterned style over nomad when the lead is weak.
  if (topId === "nomad" && second >= topScore - 0.04) {
    const patterned = ranked.find(([id]) => id !== "nomad");
    if (patterned && patterned[1] >= 0.28) return patterned[0];
  }

  if (topScore < 0.22) return "nomad";
  return topId;
}

/** Confidence in the winning style, from the score separation and sample size. */
function habitConfidence(ranked: [HabitStyleId, number][], metrics: HabitMetrics): HabitConfidence {
  const topScore = ranked[0]![1];
  const runnerUp = ranked[1];
  const margin = topScore - (runnerUp?.[1] ?? 0);

  const value = clamp01(
    0.4 * clamp01((metrics.activeDays - HABIT_MIN_ACTIVE_DAYS) / 13) +
      0.25 * clamp01(metrics.txCount / 25) +
      0.25 * clamp01(margin / 0.15) +
      0.1 * clamp01((topScore - 0.22) / 0.38),
  );
  const level: HabitConfidenceLevel = confidenceLevel(value);

  const reasons: string[] = [
    `${metrics.activeDays} active day${metrics.activeDays === 1 ? "" : "s"}`,
  ];
  if (runnerUp) {
    const runnerUpTitle = HABIT_STYLES[runnerUp[0]].title;
    reasons.push(
      margin >= 0.1 ? `clear lead over ${runnerUpTitle}` : `close call with ${runnerUpTitle}`,
    );
  }

  return { level, value, margin, reasons };
}

/** Secondary trait blended in when the runner-up style is close behind the winner. */
export function habitBlend(ranked: [HabitStyleId, number][]): {
  secondary: HabitStyleMeta | null;
  weight: number;
  label: string;
} {
  const [topId, topScore] = ranked[0]!;
  const primaryStyle = HABIT_STYLES[topId];
  const runnerUp = ranked[1];

  if (!runnerUp || topScore <= 0) {
    return { secondary: null, weight: 0, label: primaryStyle.title };
  }

  const [secondId, secondScore] = runnerUp;
  const qualifies = secondScore >= 0.45 * topScore && secondScore >= 0.2;
  if (!qualifies) return { secondary: null, weight: 0, label: primaryStyle.title };

  const secondary = HABIT_STYLES[secondId];
  return {
    secondary,
    weight: secondScore,
    label: `${primaryStyle.title}, with a ${secondary.trait} streak`,
  };
}

type HabitFormatters = Formatters;

type HabitNarrative = { pattern: string; behavior: string };

/** Personalized "Data Pattern" / "Behavior" copy, built from the period's real numbers. */
export function buildHabitNarrative(
  id: HabitStyleId,
  m: HabitMetrics,
  fmt: HabitFormatters = DEFAULT_FORMATTERS,
): HabitNarrative {
  const fallback = HABIT_STYLES[id];
  const money = fmt.money;
  const patternParts: string[] = [];
  const behaviorParts: string[] = [];

  switch (id) {
    case "clockwork": {
      if (m.modeCount >= 2) {
        patternParts.push(
          `${m.modeCount} of ${m.txCount} charges landed at ${money(m.modeAmount)}, roughly every ${m.medianGap} days.`,
        );
      }
      if (m.recurringShare > 0) {
        patternParts.push(`${pct(m.recurringShare)} of spend is on a marked recurring schedule.`);
      }
      if (m.driverRecurring) {
        behaviorParts.push(
          `${m.driverRecurring.name} carries most of the recurring load, at ${money(m.recurringAmount)} total.`,
        );
      }
      break;
    }
    case "burst": {
      if (m.biggestCluster) {
        patternParts.push(
          `${m.biggestCluster.size} transactions landed within ${m.biggestCluster.spanDays} day${m.biggestCluster.spanDays === 1 ? "" : "s"} starting ${dayLabel(m.biggestCluster.startDate)}, totaling ${money(m.biggestCluster.amount)} (${pct(m.biggestCluster.share)} of spend).`,
        );
      }
      if (m.longestQuiet > 0) {
        patternParts.push(`The longest quiet stretch was ${m.longestQuiet} days.`);
      }
      if (m.driverInCluster) {
        behaviorParts.push(`${m.driverInCluster.name} drove that spree.`);
      }
      if (m.amountCv > 0) {
        behaviorParts.push(
          `Amounts swing widely inside a burst (${m.amountCv.toFixed(2)}x variability).`,
        );
      }
      break;
    }
    case "dripper": {
      if (m.activeDays > 0) {
        patternParts.push(
          `${m.txCount} charges across ${m.activeDays} active days, median ${money(m.medianAmt)} each.`,
        );
      }
      if (m.p90 > 0) {
        patternParts.push(`Nine in ten charges stay under ${money(m.p90)}.`);
      }
      if (m.driverByCount) {
        behaviorParts.push(
          `${m.driverByCount.name} shows up most often — ${m.driverByCount.txCount} times this period.`,
        );
      }
      break;
    }
    case "peakValley": {
      if (m.topDomAmount > 0) {
        patternParts.push(
          `Spend peaks around day ${m.topDom} of the month, with ${money(m.topDomAmount)} landing that day alone.`,
        );
      }
      if (m.total > 0 && m.topDomAmount > 0) {
        patternParts.push(
          `That's ${pct(m.topDomAmount / m.total)} of the period's total in one day.`,
        );
      }
      if (m.driverInPeak) {
        behaviorParts.push(`${m.driverInPeak.name} leads the front-loaded spend.`);
      }
      break;
    }
    case "accumulator": {
      if (m.topDowShare > 0) {
        patternParts.push(
          `${pct(m.topDowShare)} of transactions (${m.topDowCount}) land on ${weekdayLabel(m.topDowSampleDate)}s.`,
        );
      }
      if (m.p90 > 0) {
        patternParts.push(`Trips run large — up to ${money(m.p90)} per visit.`);
      }
      if (m.driverInPeak) {
        behaviorParts.push(`${m.driverInPeak.name} is the main batch category.`);
      }
      break;
    }
    case "nomad": {
      if (m.txCount > 0) {
        patternParts.push(
          `Charges range from ${money(m.minAmt)} to ${money(m.maxAmt)}, with no fixed rhythm.`,
        );
      }
      if (m.amountCv > 0 || m.gapCv > 0) {
        patternParts.push(
          `Amount and timing both vary widely (${m.amountCv.toFixed(2)}x / ${m.gapCv.toFixed(2)}x).`,
        );
      }
      if (m.driverByAmount) {
        behaviorParts.push(
          `${m.driverByAmount.name} is the biggest single slice, at ${pct(m.driverByAmount.share)} of spend.`,
        );
      }
      break;
    }
  }

  return {
    pattern: patternParts.filter(Boolean).join(" ") || fallback.pattern,
    behavior: behaviorParts.filter(Boolean).join(" ") || fallback.behavior,
  };
}

/** A concrete, numbers-based suggestion tied to the winning style. */
export function buildHabitNudge(
  id: HabitStyleId,
  m: HabitMetrics,
  fmt: HabitFormatters = DEFAULT_FORMATTERS,
): string {
  const money = fmt.money;

  switch (id) {
    case "clockwork":
      if (m.driverRecurring) {
        return `Review ${m.driverRecurring.name} for anything you no longer use — it's ${money(m.recurringAmount)} on autopilot this period.`;
      }
      return "Your spend is steady and predictable — a good base for a tighter monthly budget.";
    case "burst":
      if (m.biggestCluster) {
        return `Add a 24-hour pause before spending in ${m.driverInCluster?.name ?? "your top category"} — the last spree cost ${money(m.biggestCluster.amount)} in ${m.biggestCluster.spanDays} day${m.biggestCluster.spanDays === 1 ? "" : "s"}.`;
      }
      return "Spending clusters into short bursts — a short cooling-off window before big purchases could help.";
    case "dripper":
      if (m.driverByCount && m.driverByCount.txCount > 0) {
        const weekly = (m.driverByCount.amount / Math.max(1, m.driverByCount.txCount)) * 2;
        return `Trimming ${m.driverByCount.name} by two visits a week saves about ${money(weekly)} a week.`;
      }
      return "Small daily charges add up quietly — a weekly cap on incidentals could help.";
    case "peakValley":
      if (m.topDomAmount > 0) {
        return `Spreading the day-${m.topDom} spend of ${money(m.topDomAmount)} across the month would smooth your cash flow.`;
      }
      return "Spend clusters right after payday — consider scheduling a few purchases later in the cycle.";
    case "accumulator":
      if (m.topDowShare > 0) {
        return `Your ${weekdayLabel(m.topDowSampleDate)} trips average ${money(m.p90)} at the high end — a per-trip cap could keep batches in check.`;
      }
      return "Batching purchases into one trip is efficient — set a per-trip ceiling to keep it that way.";
    case "nomad":
      if (m.driverByAmount) {
        return `${m.driverByAmount.name} is your least predictable category (${pct(m.driverByAmount.share)} of spend) — a fixed weekly amount for it could add structure.`;
      }
      return "Spending has no clear rhythm yet — a simple weekly check-in could surface a pattern.";
  }
}

/** Collect outgoing non-savings transactions for the selected habit period. */
export function habitPeriodExpenses(
  expenses: Expense[],
  period: HabitPeriod,
  monthKey: string,
  index?: CategoryIndex,
) {
  if (period === "rolling90") {
    const { start, end } = rolling90Bounds(monthKey);
    return expenses
      .filter((e) => isOutgoing(e) && !isSavings(e, index) && e.date >= start && e.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  }

  const prefix = period === "month" ? monthKey : monthKey.slice(0, 4);
  return expenses
    .filter((e) => isOutgoing(e) && !isSavings(e, index) && e.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
}

/** Inclusive [start, end] ISO bounds for the rolling-90-day window anchored on `monthKey`. */
function rolling90Bounds(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const end = monthKey === CURRENT_MONTH_KEY ? TODAY_ISO : isoFromDate(new Date(y!, m!, 0));
  const [ey, em, ed] = end.split("-").map(Number);
  const start = isoFromDate(new Date(ey!, em! - 1, ed! - 89));
  return { start, end };
}

/** Human label for the period under assessment. */
function habitPeriodLabel(period: HabitPeriod, monthKey: string) {
  if (period === "rolling90") {
    const { end } = rolling90Bounds(monthKey);
    return `the 90 days to ${dayLabel(end)}`;
  }
  if (period === "year") return monthKey.slice(0, 4);
  const [y, m] = monthKey.split("-").map(Number);
  const name = new Date(y!, m! - 1, 1).toLocaleString("en", { month: "long" });
  return `${name} ${y}`;
}

/** Count of distinct calendar dates in an already date-sorted expense list. */
function countActiveDays(list: Expense[]) {
  let count = 0;
  let last = "";
  for (const e of list) {
    if (e.date !== last) {
      count += 1;
      last = e.date;
    }
  }
  return count;
}

/**
 * Assess spending habit style for a month, year, or rolling-90-day window.
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
  const activeDays = countActiveDays(list);

  if (activeDays < HABIT_MIN_ACTIVE_DAYS) {
    return {
      status: "insufficient",
      daysHave: activeDays,
      daysNeeded: HABIT_MIN_ACTIVE_DAYS,
      periodLabel,
    };
  }

  const { metrics, scores } = computeHabitMetrics(list, index);
  const ranked = rankStyles(scores);
  const id = pickFromRanked(ranked);
  const confidence = habitConfidence(ranked, metrics);
  const blend = habitBlend(ranked);

  return {
    status: "ready",
    style: HABIT_STYLES[id],
    scores,
    metrics,
    confidence,
    blend,
    periodLabel,
    txCount: list.length,
    activeDays,
  };
}

type HabitTrajectoryPoint = {
  monthKey: string;
  label: string;
  status: "insufficient" | "ready";
  styleId: HabitStyleId | null;
  trait: string;
  topScore: number;
  activeDays: number;
  txCount: number;
  spend: number;
};

/**
 * Trailing `size` months of habit verdicts, anchored on `monthKey`. Always a
 * monthly window regardless of the panel's selected period, and always the
 * trailing 6 months — a single pass over `expenses`, with per-month scoring
 * run in lean (no-attribution) mode since the trajectory needs no drivers.
 */
export function habitTrajectory(
  expenses: Expense[],
  monthKey: string,
  index?: CategoryIndex,
  size = 6,
): HabitTrajectoryPoint[] {
  const months = monthsWindow(monthKey, size);
  const order = new Map(months.map((mo, i) => [mo.key, i]));
  const buckets: Expense[][] = months.map(() => []);

  for (const e of expenses) {
    if (!isOutgoing(e) || isSavings(e, index)) continue;
    const idx = order.get(e.date.slice(0, 7));
    if (idx === undefined) continue;
    buckets[idx]!.push(e);
  }

  return months.map((mo, i) => {
    const list = buckets[i]!;
    const activeDays = countActiveDays(list);
    const spend = list.reduce((s, e) => s + e.amount, 0);

    if (activeDays < HABIT_MIN_ACTIVE_DAYS) {
      return {
        monthKey: mo.key,
        label: mo.key.slice(5),
        status: "insufficient",
        styleId: null,
        trait: "",
        topScore: 0,
        activeDays,
        txCount: list.length,
        spend,
      };
    }

    const { scores } = computeHabitMetrics(list, index, { attribution: false });
    const ranked = rankStyles(scores);
    const styleId = pickFromRanked(ranked);

    return {
      monthKey: mo.key,
      label: mo.key.slice(5),
      status: "ready",
      styleId,
      trait: HABIT_STYLES[styleId].trait,
      topScore: ranked[0]![1],
      activeDays,
      txCount: list.length,
      spend,
    };
  });
}

/** One-line summary of how the style has moved across a trajectory. */
export function describeHabitShift(points: HabitTrajectoryPoint[]): string {
  const ready = points.filter((p) => p.status === "ready");
  if (ready.length < 2) return "Not enough history to compare yet.";

  let runLength = 1;
  for (let i = ready.length - 1; i > 0; i--) {
    if (ready[i]!.styleId === ready[i - 1]!.styleId) runLength += 1;
    else break;
  }

  const current = ready[ready.length - 1]!;
  const currentTitle = HABIT_STYLES[current.styleId!].title;

  if (runLength >= 2) {
    return `${currentTitle} for ${runLength} months running.`;
  }

  const prev = ready[ready.length - 2]!;
  const prevTitle = HABIT_STYLES[prev.styleId!].title;
  const prevLabel = new Date(2000, Number(prev.monthKey.slice(5, 7)) - 1, 1).toLocaleString("en", {
    month: "long",
  });
  return `Was ${prevTitle} in ${prevLabel} — now ${currentTitle}.`;
}
