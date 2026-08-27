import { CURRENT_MONTH_KEY, dayLabel, monthLabel, monthsWindow, roundMoney, TODAY_ISO } from "@/frontend/lib/data";
import type { CategoryIndex } from "@/frontend/lib/categories";
import { isSpendingCategory } from "@/frontend/lib/categories";
import { pushInsight } from "@/frontend/lib/insights/build";
import { rankInsights } from "@/frontend/lib/insights/rank";
import type { Confidence, Insight } from "@/frontend/lib/insights/types";
import { catOf, classifyTx, isRecurring } from "@/frontend/lib/stats";
import {
  clamp01,
  confidenceLevel,
  DEFAULT_FORMATTERS,
  percentileOf,
  sorted,
  stats1D,
  type Formatters,
} from "@/frontend/lib/stat-helpers";
import { recurringMonthlyEquivalent, recurringScheduleKey, type RecurringField } from "@/lib/recurring";
import type { Budgets, Expense } from "@/frontend/lib/types";

const REVIEW_WINDOW_SIZE = 6;
const OUTLIER_Z_THRESHOLD = 3.5;
const OUTLIER_MAX_CARDS = 2;
const DRIFT_Z_THRESHOLD = 1.2;
const DRIFT_MAX_CARDS = 2;
const OVERRUN_MAX_CARDS = 2;
const PRICE_CREEP_MIN_OCCURRENCES = 3;
const PRICE_CREEP_MIN_RISE = 0.05;

const STRIDE_MONTHS: Record<Exclude<RecurringField, false>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Shift a YYYY-MM key by a signed month delta. */
function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whole months between two YYYY-MM keys (may be negative). */
function monthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);

  return (ty! - fy!) * 12 + (tm! - fm!);
}

/** Days in a YYYY-MM month. */
function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);

  return new Date(y!, m!, 0).getDate();
}

type MonthBucket = { spent: number; byCat: Map<string, number> };

type Prepass = {
  /** Aggregated spend for each month inside the review window, keyed by month. */
  monthly: Map<string, MonthBucket>;
  /** Outgoing spend amounts across the review window — the MAD/outlier baseline. */
  windowAmounts: number[];
  /** Individual spend transactions in `month`, for per-transaction outlier flags. */
  currentMonthTx: Expense[];
  /** Daily spend totals for `month`, index 0 = day 1. Only filled through today for the current month. */
  dailyAmounts: number[];
  /** Every recurring expense series across the whole `expenses` window, keyed by series key. */
  seriesTx: Map<string, Expense[]>;
};

/**
 * One pass over `expenses` building every structure the rules below read from —
 * no rule re-sorts or re-filters the raw list itself.
 */
function buildPrepass(
  expenses: Expense[],
  index: CategoryIndex,
  month: string,
  reviewMonths: Set<string>,
  elapsedDay: number,
): Prepass {
  const monthly = new Map<string, MonthBucket>();
  const windowAmounts: number[] = [];
  const currentMonthTx: Expense[] = [];
  const dailyAmounts = new Array<number>(elapsedDay).fill(0);
  const seriesTx = new Map<string, Expense[]>();

  for (const e of expenses) {
    if (classifyTx(e, index) !== "spend") continue;

    if (e.kind === "expense" && isRecurring(e)) {
      const key = recurringScheduleKey(e);
      const list = seriesTx.get(key);
      if (list) list.push(e);
      else seriesTx.set(key, [e]);
    }

    const mKey = e.date.slice(0, 7);
    if (!reviewMonths.has(mKey)) continue;

    let bucket = monthly.get(mKey);
    if (!bucket) {
      bucket = { spent: 0, byCat: new Map() };
      monthly.set(mKey, bucket);
    }
    bucket.spent += e.amount;
    const catId = catOf(e.sub, index);
    if (catId) bucket.byCat.set(catId, (bucket.byCat.get(catId) ?? 0) + e.amount);

    windowAmounts.push(e.amount);

    if (mKey === month) {
      currentMonthTx.push(e);
      const day = Number(e.date.slice(8, 10));
      if (day >= 1 && day <= elapsedDay) dailyAmounts[day - 1]! += e.amount;
    }
  }

  return { monthly, windowAmounts, currentMonthTx, dailyAmounts, seriesTx };
}

/** Confidence that scales with how much of the month has elapsed. */
function elapsedConfidence(elapsedDay: number, totalDays: number): Confidence {
  const elapsedFrac = clamp01(elapsedDay / totalDays);
  const value = clamp01(0.25 + 0.65 * elapsedFrac);

  return {
    level: confidenceLevel(value),
    value,
    margin: 0,
    reasons: [`${elapsedDay} of ${totalDays} days elapsed this month`],
  };
}

/** Month-end spend projection plus the worst over-budget categories, current month only. */
function forecastInsights(
  prepass: Prepass,
  budgets: Budgets,
  index: CategoryIndex,
  month: string,
  spendingBudget: number,
  formatters: Formatters,
): Insight[] {
  const out: Insight[] = [];
  if (month !== CURRENT_MONTH_KEY) return out;

  const elapsedDay = Number(TODAY_ISO.slice(8, 10));
  const totalDays = daysInMonth(month);
  const bucket = prepass.monthly.get(month);
  const spentToDate = bucket?.spent ?? 0;
  const pace = elapsedDay > 0 ? spentToDate / elapsedDay : 0;

  let committedRemaining = 0;
  for (const [, list] of prepass.seriesTx) {
    const occurredThisMonth = list.some((e) => e.date.slice(0, 7) === month);
    if (occurredThisMonth) continue;
    const latest = list.reduce((a, b) => (b.date > a.date ? b : a));
    committedRemaining += recurringMonthlyEquivalent(latest.amount, latest.recurring);
  }

  const projected = roundMoney(pace * totalDays + committedRemaining);
  const { stdev: dailyStdev } = stats1D(prepass.dailyAmounts);
  const band = roundMoney(dailyStdev * Math.sqrt(Math.max(0, totalDays - elapsedDay)));
  const confidence = elapsedConfidence(elapsedDay, totalDays);
  const money = formatters.money;

  if (spendingBudget > 0) {
    const ratio = projected / spendingBudget;
    const overBudget = ratio >= 1.02;
    pushInsight(out, {
      id: "forecast:month-end",
      kind: "forecast:month-end",
      title: overBudget ? "On pace to exceed budget" : "On pace to stay under budget",
      body: `At the current pace you're projected to spend ${money(projected)} this month (±${money(band)}), against a budget of ${money(spendingBudget)}.`,
      tone: overBudget ? (ratio >= 1.15 ? "critical" : "warning") : "positive",
      impact: overBudget
        ? clamp01((projected - spendingBudget) / spendingBudget)
        : clamp01(((spendingBudget - projected) / spendingBudget) * 0.5),
      confidence,
      metric: { label: "Projected month-end spend", value: money(projected) },
    });
  } else {
    pushInsight(out, {
      id: "forecast:month-end",
      kind: "forecast:month-end",
      title: "Month-end spend projection",
      body: `At the current pace you're projected to spend ${money(projected)} by month end (±${money(band)}).`,
      tone: "neutral",
      impact: 0.15,
      confidence,
      metric: { label: "Projected month-end spend", value: money(projected) },
    });
  }

  const overrunCandidates: Array<{ catId: string; projectedCat: number; limit: number; ratio: number }> = [];
  for (const [catId, limit] of Object.entries(budgets)) {
    const cat = index.catById[catId];
    if (!cat || !isSpendingCategory(cat) || !(limit > 0)) continue;
    const spentSoFar = bucket?.byCat.get(catId) ?? 0;
    const projectedCat = elapsedDay > 0 ? (spentSoFar / elapsedDay) * totalDays : 0;
    const ratio = projectedCat / limit;
    if (ratio >= 1.05) overrunCandidates.push({ catId, projectedCat, limit, ratio });
  }
  overrunCandidates.sort((a, b) => b.ratio - a.ratio);

  for (const c of overrunCandidates.slice(0, OVERRUN_MAX_CARDS)) {
    const name = index.catById[c.catId]?.name ?? "This category";
    const pctOver = Math.round((c.ratio - 1) * 100);
    pushInsight(out, {
      id: `budget-risk:${c.catId}`,
      kind: `budget-risk:${c.catId}`,
      title: `${name} is on pace to exceed budget`,
      body: `Projected to reach ${money(roundMoney(c.projectedCat))} this month against a ${money(c.limit)} budget — about ${pctOver}% over.`,
      tone: pctOver >= 25 ? "critical" : "warning",
      impact: clamp01((c.projectedCat - c.limit) / c.limit),
      confidence: { ...confidence, value: clamp01(confidence.value * 0.9) },
      metric: { label: name, value: money(roundMoney(c.projectedCat)) },
    });
  }

  return out;
}

/** Robust (median/MAD) outlier detection on this month's individual spend transactions. */
function outlierInsights(prepass: Prepass, index: CategoryIndex, formatters: Formatters): Insight[] {
  const out: Insight[] = [];
  if (prepass.windowAmounts.length < 8 || prepass.currentMonthTx.length === 0) return out;

  const sortedAmounts = sorted(prepass.windowAmounts);
  const median = percentileOf(sortedAmounts, 0.5);
  const deviations = sorted(prepass.windowAmounts.map((v) => Math.abs(v - median)));
  const mad = percentileOf(deviations, 0.5);
  if (mad <= 0 || median <= 0) return out;

  const money = formatters.money;
  const flagged = prepass.currentMonthTx
    .map((e) => ({ e, z: (0.6745 * (e.amount - median)) / mad }))
    .filter((f) => f.z >= OUTLIER_Z_THRESHOLD)
    .sort((a, b) => b.e.amount - a.e.amount)
    .slice(0, OUTLIER_MAX_CARDS);

  const totalMonthSpend = prepass.monthly.get(prepass.currentMonthTx[0]!.date.slice(0, 7))?.spent ?? 0;
  const sampleValue = clamp01(prepass.windowAmounts.length / 40);

  for (const { e, z } of flagged) {
    const catId = catOf(e.sub, index);
    const name = index.catById[catId]?.name ?? "spend";
    const multiple = median > 0 ? (e.amount / median).toFixed(1) : "—";
    pushInsight(out, {
      id: `anomaly:tx:${e.id}`,
      kind: `anomaly:tx:${e.id}`,
      title: `Unusually large ${name} charge`,
      body: `${money(e.amount)} on ${dayLabel(e.date)} is about ${multiple}× your typical charge.`,
      tone: "warning",
      impact: clamp01(0.4 * Math.min(1, z / 6) + 0.6 * clamp01(e.amount / Math.max(1, totalMonthSpend))),
      confidence: {
        level: confidenceLevel(sampleValue),
        value: sampleValue,
        margin: 0,
        reasons: [`modified z-score ${z.toFixed(1)}`],
      },
      metric: { label: name, value: money(e.amount) },
    });
  }

  return out;
}

/** Category month-over-month drift vs a trailing baseline, filtered to material moves. */
function driftInsights(
  prepass: Prepass,
  baselineMonths: string[],
  index: CategoryIndex,
  month: string,
  formatters: Formatters,
): Insight[] {
  const out: Insight[] = [];
  const current = prepass.monthly.get(month);
  if (!current) return out;

  const money = formatters.money;
  const catIds = new Set<string>();
  for (const id of current.byCat.keys()) catIds.add(id);
  for (const key of baselineMonths) {
    for (const id of prepass.monthly.get(key)?.byCat.keys() ?? []) catIds.add(id);
  }

  const movers: Array<{ catId: string; currentAmt: number; baselineMean: number; delta: number; z: number; nonZeroMonths: number }> = [];

  for (const catId of catIds) {
    const cat = index.catById[catId];
    if (!cat || !isSpendingCategory(cat)) continue;

    const baselineAmounts = baselineMonths.map((key) => prepass.monthly.get(key)?.byCat.get(catId) ?? 0);
    const { mean: baselineMean, stdev: baselineStdev } = stats1D(baselineAmounts);
    const currentAmt = current.byCat.get(catId) ?? 0;
    const delta = currentAmt - baselineMean;
    const z = baselineStdev > 0 ? delta / baselineStdev : delta !== 0 ? Math.sign(delta) * 4 : 0;
    const materialFloor = baselineMean * 0.2;
    if (materialFloor <= 0 || Math.abs(delta) < materialFloor) continue;
    if (Math.abs(z) < DRIFT_Z_THRESHOLD) continue;

    movers.push({
      catId,
      currentAmt,
      baselineMean,
      delta,
      z,
      nonZeroMonths: baselineAmounts.filter((v) => v > 0).length,
    });
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  for (const m of movers.slice(0, DRIFT_MAX_CARDS)) {
    const name = index.catById[m.catId]?.name ?? "This category";
    const rising = m.delta > 0;
    const pctChange = m.baselineMean > 0 ? Math.round((m.delta / m.baselineMean) * 100) : 100;
    pushInsight(out, {
      id: `drift:${m.catId}`,
      kind: `drift:${m.catId}`,
      title: rising ? `${name} spend jumped this month` : `${name} spend dropped this month`,
      body: `${money(roundMoney(m.currentAmt))} this month vs a ${money(roundMoney(m.baselineMean))} average over the past ${baselineMonths.length} months (${rising ? "+" : ""}${pctChange}%).`,
      tone: rising ? "warning" : "positive",
      impact: clamp01(Math.abs(m.delta) / Math.max(1, m.baselineMean || Math.abs(m.delta))),
      confidence: {
        level: confidenceLevel(clamp01(m.nonZeroMonths / baselineMonths.length)),
        value: clamp01(m.nonZeroMonths / baselineMonths.length),
        margin: 0,
        reasons: [`z-score ${m.z.toFixed(1)} vs trailing baseline`],
      },
      metric: { label: name, value: money(roundMoney(m.currentAmt)) },
    });
  }

  return out;
}

/** New recurring series that started this month, and ones that went quiet on schedule. */
function recurringChangeInsights(
  seriesTx: Map<string, Expense[]>,
  index: CategoryIndex,
  month: string,
  formatters: Formatters,
): Insight[] {
  const out: Insight[] = [];
  const money = formatters.money;

  for (const [key, list] of seriesTx) {
    const sortedList = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sortedList[0]!;
    const last = sortedList[sortedList.length - 1]!;
    const freq = last.recurring;
    if (freq === false) continue;
    const catId = catOf(last.sub, index);
    const name = index.catById[catId]?.name ?? last.note ?? "A recurring charge";
    const monthlyEquivalent = recurringMonthlyEquivalent(last.amount, freq);

    if (first.date.slice(0, 7) === month) {
      pushInsight(out, {
        id: `recurring:new:${key}`,
        kind: `recurring:new:${key}`,
        title: "New recurring charge detected",
        body: `${name} started this month at ${money(last.amount)}, repeating ${freq}.`,
        tone: "neutral",
        impact: clamp01(monthlyEquivalent / Math.max(1, monthlyEquivalent * 4)),
        confidence: { level: confidenceLevel(0.5), value: 0.5, margin: 0, reasons: ["first occurrence observed this month"] },
        metric: { label: name, value: money(last.amount) },
      });
      continue;
    }

    const lastMonth = last.date.slice(0, 7);
    const strideMonths = STRIDE_MONTHS[freq];
    const nextExpectedMonth = shiftMonthKey(lastMonth, strideMonths);
    if (nextExpectedMonth === month && monthsBetween(lastMonth, month) >= strideMonths) {
      pushInsight(out, {
        id: `recurring:stopped:${key}`,
        kind: `recurring:stopped:${key}`,
        title: "A recurring charge went quiet",
        body: `${name} usually charges ${money(last.amount)} ${freq}, but hasn't posted since ${monthLabel(lastMonth, true)}.`,
        tone: "neutral",
        impact: clamp01(monthlyEquivalent / Math.max(1, monthlyEquivalent * 3)),
        confidence: { level: confidenceLevel(0.55), value: 0.55, margin: 0, reasons: [`expected again by ${monthLabel(nextExpectedMonth, false)}`] },
        metric: { label: name, value: money(last.amount) },
      });
    }
  }

  return out;
}

/** Subscription / recurring price creep — a steady rise across a series' history. */
function priceCreepInsights(
  seriesTx: Map<string, Expense[]>,
  index: CategoryIndex,
  month: string,
  formatters: Formatters,
): Insight[] {
  const out: Insight[] = [];
  const money = formatters.money;

  for (const [key, list] of seriesTx) {
    if (list.length < PRICE_CREEP_MIN_OCCURRENCES) continue;
    const sortedList = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = sortedList[sortedList.length - 1]!;
    if (last.date.slice(0, 7) !== month) continue;

    const first = sortedList[0]!;
    if (!(last.amount > first.amount) || first.amount <= 0) continue;

    let decreases = 0;
    for (let i = 1; i < sortedList.length; i++) {
      if (sortedList[i]!.amount < sortedList[i - 1]!.amount) decreases++;
    }
    if (decreases > 1) continue;

    const riseRatio = (last.amount - first.amount) / first.amount;
    if (riseRatio < PRICE_CREEP_MIN_RISE) continue;

    const catId = catOf(last.sub, index);
    const name = index.catById[catId]?.name ?? last.note ?? "This charge";
    pushInsight(out, {
      id: `recurring:price-creep:${key}`,
      kind: `recurring:price-creep:${key}`,
      title: `${name} has crept up ${Math.round(riseRatio * 100)}%`,
      body: `From ${money(first.amount)} to ${money(last.amount)} across ${sortedList.length} charges.`,
      tone: "warning",
      impact: clamp01(riseRatio),
      confidence: { level: confidenceLevel(clamp01(sortedList.length / 8)), value: clamp01(sortedList.length / 8), margin: 0, reasons: [`${sortedList.length} occurrences on record`] },
      metric: { label: name, value: money(last.amount) },
    });
  }

  return out;
}

/**
 * The full ranked "What stands out" feed for Transaction Insights: a month-end
 * forecast with budget risk, plus anomaly/drift/recurring findings for `month`.
 * Single `useMemo`-friendly entry point — callers pass the same 36-month
 * `expenses` window the rest of Insights already uses.
 */
export function computeTxInsights(
  expenses: Expense[],
  budgets: Budgets,
  month: string,
  index: CategoryIndex,
  spendingBudget: number,
  formatters: Formatters = DEFAULT_FORMATTERS,
): Insight[] {
  const reviewMonths = monthsWindow(month, REVIEW_WINDOW_SIZE).map((m) => m.key);
  const reviewMonthSet = new Set(reviewMonths);
  const baselineMonths = reviewMonths.slice(0, -1);
  const elapsedDay =
    month === CURRENT_MONTH_KEY ? Number(TODAY_ISO.slice(8, 10)) : daysInMonth(month);

  const prepass = buildPrepass(expenses, index, month, reviewMonthSet, elapsedDay);

  const all: Insight[] = [
    ...forecastInsights(prepass, budgets, index, month, spendingBudget, formatters),
    ...outlierInsights(prepass, index, formatters),
    ...driftInsights(prepass, baselineMonths, index, month, formatters),
    ...recurringChangeInsights(prepass.seriesTx, index, month, formatters),
    ...priceCreepInsights(prepass.seriesTx, index, month, formatters),
  ];

  return rankInsights(all);
}
