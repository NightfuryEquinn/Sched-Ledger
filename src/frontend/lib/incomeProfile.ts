import type { CategoryIndex } from "./categories";
import { monthLabel, monthsWindow, roundMoney } from "./data";
import {
  DEFAULT_FORMATTERS,
  clamp01,
  confidenceLevel,
  pct,
  percentileOf,
  sorted,
  stats1D,
  topBin,
  type Confidence,
  type Formatters,
} from "./stat-helpers";
import { catMetaOf, classifyTx, isRecurring } from "./stats";
import type { Expense } from "./types";

/*
 * Income Profile
 * ──────────────
 * The spending-habit engine's counterpart for money coming in.
 *
 * Income is structurally unlike spend and does not fit that engine:
 * a salaried user logs one or two rows a month, so there is no per-month
 * pattern to read. The window is therefore months, not days; the gate counts
 * payments and months rather than active days; sources are keyed by
 * SUBcategory (the default taxonomy is one Income category with five subs);
 * and the interesting axes are concentration, predictability, floor and
 * growth rather than rhythm and impulse.
 */

export type IncomeWindow = "6mo" | "12mo";

export type IncomeStyleId =
  | "salaried"
  | "variable"
  | "projectBased"
  | "portfolio"
  | "windfall"
  | "emerging";

export type IncomeStyleMeta = {
  id: IncomeStyleId;
  title: string;
  trait: string;
  temperament: string;
  pattern: string;
  behavior: string;
};

export const INCOME_STYLES: Record<IncomeStyleId, IncomeStyleMeta> = {
  salaried: {
    id: "salaried",
    title: "The Salaried Anchor",
    trait: "Anchored",
    temperament: "Predictable / Anchored",
    pattern:
      "One dominant source paying a steady amount on a tight schedule, month after month.",
    behavior:
      "Income you can budget against to the day. The risk is concentration, not timing.",
  },
  variable: {
    id: "variable",
    title: "The Variable Earner",
    trait: "Variable",
    temperament: "Steady cadence / Shifting size",
    pattern:
      "Payments arrive on a regular rhythm, but the amounts swing from one to the next.",
    behavior:
      "Commission, hourly or tips. Timing is dependable; the size of each cheque is not.",
  },
  projectBased: {
    id: "projectBased",
    title: "The Project Earner",
    trait: "Project",
    temperament: "Lumpy / Deal-driven",
    pattern:
      "Irregular gaps and irregular amounts, with stretches where nothing lands at all.",
    behavior:
      "Freelance or contract work. Income follows delivery and invoicing, not the calendar.",
  },
  portfolio: {
    id: "portfolio",
    title: "The Portfolio Earner",
    trait: "Portfolio",
    temperament: "Diversified / Layered",
    pattern:
      "Several meaningful sources contributing in parallel, with no single one carrying the month.",
    behavior:
      "Losing any one stream is survivable. The trade-off is more moving parts to track.",
  },
  windfall: {
    id: "windfall",
    title: "The Windfall Earner",
    trait: "Windfall",
    temperament: "Spike-driven / Uneven",
    pattern:
      "A single outsized payment dominates the window, dwarfing everything around it.",
    behavior:
      "A bonus, settlement or one-off sale. The headline total says more about that one event than about a repeatable pattern.",
  },
  emerging: {
    id: "emerging",
    title: "The Emerging Stream",
    trait: "Emerging",
    temperament: "Early / Forming",
    pattern:
      "Income is present but still sparse — too few payments across too few months to show a settled shape.",
    behavior:
      "A new job, a side project finding its feet, or a ledger that is still filling up.",
  },
};

/** Payments needed before a profile is offered. */
export const INCOME_MIN_EVENTS = 3;
/** Distinct months with income needed before a profile is offered. */
export const INCOME_MIN_MONTHS = 2;

export type IncomeSourceStat = {
  /** Subcategory id — the meaningful grain for income. */
  id: string;
  name: string;
  color: string;
  glyph: string;
  parentName: string;
  amount: number;
  txCount: number;
  share: number;
  monthsPresent: number;
};

export type IncomeMonthPoint = {
  monthKey: string;
  label: string;
  earned: number;
  spent: number;
  net: number;
  /** Income covered spend this month. */
  covered: boolean;
};

export type IncomeMetrics = {
  txCount: number;
  total: number;
  monthsInWindow: number;
  monthsWithIncome: number;
  monthsZero: number;

  meanAmt: number;
  medianAmt: number;
  minAmt: number;
  maxAmt: number;
  amountCv: number;
  largestPayment: { amount: number; date: string; sourceId: string; share: number } | null;

  medianGap: number;
  gapCv: number;
  longestGap: number;
  topDom: number;
  topDomShare: number;

  recurringCount: number;
  recurringAmount: number;
  recurringShare: number;

  sources: IncomeSourceStat[];
  sourceCount: number;
  topSourceShare: number;
  /** Herfindahl concentration: 1 = a single source, ~0 = evenly split. */
  hhi: number;

  monthly: IncomeMonthPoint[];
  monthlyMean: number;
  monthlyMedian: number;
  monthlyMin: number;
  monthlyCv: number;
  /** Second half of the window vs the first, as a signed fraction. */
  growthPct: number;

  meanMonthlySpend: number;
  monthsCovered: number;
  meanSavingsRate: number;
  floorCoversSpend: boolean;
};

export type IncomeConfidence = Confidence;

export type IncomeAssessment =
  | {
      status: "insufficient";
      txHave: number;
      txNeeded: number;
      monthsHave: number;
      monthsNeeded: number;
      windowLabel: string;
    }
  | {
      status: "ready";
      style: IncomeStyleMeta;
      scores: Record<IncomeStyleId, number>;
      metrics: IncomeMetrics;
      confidence: IncomeConfidence;
      blend: { secondary: IncomeStyleMeta | null; weight: number; label: string };
      windowLabel: string;
    };

/** How many months a window spans. */
function windowSize(window: IncomeWindow) {
  return window === "6mo" ? 6 : 12;
}

/** Human label for the window under assessment. */
export function incomeWindowLabel(window: IncomeWindow, monthKey: string) {
  const months = monthsWindow(monthKey, windowSize(window));
  const first = months[0]?.key ?? monthKey;
  const last = months[months.length - 1]?.key ?? monthKey;

  return `${monthLabel(first, false)} – ${monthLabel(last, false)}`;
}

/** Day-of-month from an ISO date, without constructing a Date. */
function domOf(iso: string) {
  return Number(iso.slice(8, 10));
}

/** Whole days between two ISO dates. */
function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const start = Date.UTC(ay!, am! - 1, ad!);
  const end = Date.UTC(by!, bm! - 1, bd!);

  return Math.round((end - start) / 86_400_000);
}

type IncomePoint = {
  date: string;
  amount: number;
  sub: string;
  recurring: boolean;
};

const EMPTY_METRICS: IncomeMetrics = {
  txCount: 0,
  total: 0,
  monthsInWindow: 0,
  monthsWithIncome: 0,
  monthsZero: 0,
  meanAmt: 0,
  medianAmt: 0,
  minAmt: 0,
  maxAmt: 0,
  amountCv: 0,
  largestPayment: null,
  medianGap: 0,
  gapCv: 0,
  longestGap: 0,
  topDom: 0,
  topDomShare: 0,
  recurringCount: 0,
  recurringAmount: 0,
  recurringShare: 0,
  sources: [],
  sourceCount: 0,
  topSourceShare: 0,
  hhi: 0,
  monthly: [],
  monthlyMean: 0,
  monthlyMedian: 0,
  monthlyMin: 0,
  monthlyCv: 0,
  growthPct: 0,
  meanMonthlySpend: 0,
  monthsCovered: 0,
  meanSavingsRate: 0,
  floorCoversSpend: false,
};

const EMPTY_SCORES: Record<IncomeStyleId, number> = {
  salaried: 0,
  variable: 0,
  projectBased: 0,
  portfolio: 0,
  windfall: 0,
  emerging: 0,
};

/**
 * Every income statistic for a window, plus the raw archetype scores.
 *
 * One pass over `expenses`: income rows feed the payment, cadence and source
 * accumulators while spend rows feed only the per-month totals used for
 * coverage. Savings are ignored entirely — moving money into an envelope is
 * neither income nor a cost of living.
 */
export function computeIncomeMetrics(
  expenses: Expense[],
  monthKey: string,
  window: IncomeWindow,
  index?: CategoryIndex,
): { metrics: IncomeMetrics; scores: Record<IncomeStyleId, number> } {
  const months = monthsWindow(monthKey, windowSize(window));
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  const earnedByMonth = new Array<number>(months.length).fill(0);
  const spentByMonth = new Array<number>(months.length).fill(0);

  const points: IncomePoint[] = [];
  const sourceAgg = new Map<string, { amount: number; txCount: number; months: Set<number> }>();

  for (const e of expenses) {
    const slot = monthIdx.get(e.date.slice(0, 7));
    if (slot === undefined) continue;

    const cls = classifyTx(e, index);
    if (cls === "savings") continue;

    if (cls === "spend") {
      spentByMonth[slot] = (spentByMonth[slot] ?? 0) + e.amount;
      continue;
    }

    earnedByMonth[slot] = (earnedByMonth[slot] ?? 0) + e.amount;
    points.push({ date: e.date, amount: e.amount, sub: e.sub, recurring: isRecurring(e) });

    const agg = sourceAgg.get(e.sub);
    if (agg) {
      agg.amount += e.amount;
      agg.txCount += 1;
      agg.months.add(slot);
    } else {
      sourceAgg.set(e.sub, { amount: e.amount, txCount: 1, months: new Set([slot]) });
    }
  }

  if (!points.length) {
    return {
      metrics: { ...EMPTY_METRICS, monthsInWindow: months.length, monthsZero: months.length },
      scores: { ...EMPTY_SCORES },
    };
  }

  points.sort((a, b) => a.date.localeCompare(b.date));

  const amounts = points.map((p) => p.amount);
  const total = amounts.reduce((s, v) => s + v, 0);
  const amountStats = stats1D(amounts);
  const sortedAmounts = sorted(amounts);

  // Cadence: gaps between distinct payment days, walked in order so no Set or
  // second sort is needed.
  const gaps: number[] = [];
  let prevDate = "";
  const domHist = new Map<number, number>();
  let recurringCount = 0;
  let recurringAmount = 0;

  for (const p of points) {
    if (prevDate && p.date !== prevDate) gaps.push(daysBetween(prevDate, p.date));
    prevDate = p.date;

    const dom = domOf(p.date);
    domHist.set(dom, (domHist.get(dom) ?? 0) + 1);

    if (p.recurring) {
      recurringCount += 1;
      recurringAmount += p.amount;
    }
  }

  const gapStats = stats1D(gaps);
  const sortedGaps = sorted(gaps);
  const topDomBin = topBin(domHist, points.length);

  let largest = points[0]!;
  for (const p of points) if (p.amount > largest.amount) largest = p;

  const sources: IncomeSourceStat[] = [...sourceAgg.entries()]
    .map(([sub, agg]) => {
      const meta = catMetaOf(sub, index);
      const subMeta = index?.subById[sub];

      return {
        id: sub,
        name: subMeta?.name ?? meta.name,
        color: meta.color,
        glyph: meta.glyph,
        parentName: meta.name,
        amount: roundMoney(agg.amount),
        txCount: agg.txCount,
        share: total ? agg.amount / total : 0,
        monthsPresent: agg.months.size,
      };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const hhi = sources.reduce((s, src) => s + src.share ** 2, 0);
  // Only sources carrying real weight count toward diversification, so a
  // rounding-error trickle cannot pass for a second income stream.
  const sourceCount = sources.filter((s) => s.share >= 0.05).length;

  const monthly: IncomeMonthPoint[] = months.map((m, i) => {
    const earned = roundMoney(earnedByMonth[i] ?? 0);
    const spent = roundMoney(spentByMonth[i] ?? 0);

    return {
      monthKey: m.key,
      label: monthLabel(m.key, false).split(" ")[0] ?? m.key,
      earned,
      spent,
      net: roundMoney(earned - spent),
      covered: earned >= spent,
    };
  });

  const monthlyEarned = monthly.map((m) => m.earned);
  const monthlyStats = stats1D(monthlyEarned);
  const monthsWithIncome = monthlyEarned.filter((v) => v > 0).length;
  const totalSpend = monthly.reduce((s, m) => s + m.spent, 0);

  // Halves rather than a regression slope: over six points a slope is noise
  // dressed as precision, and this is the comparison a reader can verify.
  const half = Math.floor(monthly.length / 2);
  const firstHalf = monthlyEarned.slice(0, half).reduce((s, v) => s + v, 0);
  const secondHalf = monthlyEarned.slice(monthly.length - half).reduce((s, v) => s + v, 0);
  const growthPct = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : secondHalf > 0 ? 1 : 0;

  const meanMonthlySpend = monthly.length ? totalSpend / monthly.length : 0;
  const monthlyMin = monthlyEarned.length ? Math.min(...monthlyEarned) : 0;

  const metrics: IncomeMetrics = {
    txCount: points.length,
    total: roundMoney(total),
    monthsInWindow: months.length,
    monthsWithIncome,
    monthsZero: months.length - monthsWithIncome,

    meanAmt: roundMoney(amountStats.mean),
    medianAmt: roundMoney(percentileOf(sortedAmounts, 0.5)),
    minAmt: roundMoney(sortedAmounts[0] ?? 0),
    maxAmt: roundMoney(sortedAmounts[sortedAmounts.length - 1] ?? 0),
    amountCv: amountStats.cv,
    largestPayment: {
      amount: roundMoney(largest.amount),
      date: largest.date,
      sourceId: largest.sub,
      share: total ? largest.amount / total : 0,
    },

    medianGap: Math.round(percentileOf(sortedGaps, 0.5)),
    gapCv: gapStats.cv,
    longestGap: sortedGaps.length ? (sortedGaps[sortedGaps.length - 1] ?? 0) : 0,
    topDom: topDomBin.value,
    topDomShare: topDomBin.share,

    recurringCount,
    recurringAmount: roundMoney(recurringAmount),
    recurringShare: total ? recurringAmount / total : 0,

    sources,
    sourceCount,
    topSourceShare: sources[0]?.share ?? 0,
    hhi,

    monthly,
    monthlyMean: roundMoney(monthlyStats.mean),
    monthlyMedian: roundMoney(percentileOf(sorted(monthlyEarned), 0.5)),
    monthlyMin: roundMoney(monthlyMin),
    monthlyCv: monthlyStats.cv,
    growthPct,

    meanMonthlySpend: roundMoney(meanMonthlySpend),
    monthsCovered: monthly.filter((m) => m.covered).length,
    meanSavingsRate: total ? (total - totalSpend) / total : 0,
    floorCoversSpend: monthlyMin >= meanMonthlySpend && meanMonthlySpend > 0,
  };

  return { metrics, scores: scoreIncomeStyles(metrics) };
}

/** Score each income archetype from a window's metrics. */
export function scoreIncomeStyles(m: IncomeMetrics): Record<IncomeStyleId, number> {
  if (!m.txCount) return { ...EMPTY_SCORES };

  const monthPresence = m.monthsInWindow ? m.monthsWithIncome / m.monthsInWindow : 0;
  const zeroShare = m.monthsInWindow ? m.monthsZero / m.monthsInWindow : 0;
  const largestShare = m.largestPayment?.share ?? 0;

  // A salaried cheque is steady to within a few percent, so the steadiness term
  // is scored against a tight band: a 50% swing earns nothing from it, which is
  // what separates this from `variable` when both land on a monthly rhythm.
  const salaried = clamp01(
    m.topSourceShare * 0.3 +
      (1 - clamp01(m.amountCv / 0.5)) * 0.25 +
      m.topDomShare * 0.2 +
      monthPresence * 0.25,
  );

  // Variable is defined by a dependable *rhythm* carrying undependable amounts,
  // so missed months disqualify it — below 60% presence the cadence term is
  // zero and the archetype cannot win on amount swing alone.
  const variable = clamp01(
    clamp01((monthPresence - 0.6) / 0.4) * 0.35 +
      (1 - Math.min(m.gapCv, 1.2) / 1.2) * 0.25 +
      clamp01(m.amountCv / 0.35) * 0.3 +
      m.topSourceShare * 0.1,
  );

  // Dry months are the defining signal here, not a footnote: a quarter of the
  // window with no income at all saturates the term.
  const projectBased = clamp01(
    Math.min(1, m.gapCv / 1.2) * 0.3 +
      Math.min(1, m.amountCv / 0.8) * 0.25 +
      clamp01(zeroShare / 0.25) * 0.35 +
      m.hhi * 0.1,
  );

  const portfolio = clamp01(
    Math.min(1, (m.sourceCount - 1) / 3) * 0.45 +
      (1 - m.hhi) * 0.35 +
      monthPresence * 0.2,
  );

  const windfall = clamp01(
    Math.max(0, (largestShare - 0.4) / 0.5) * 0.65 + Math.min(1, m.amountCv / 1.2) * 0.35,
  );

  const emerging = clamp01(
    (1 - monthPresence) * 0.4 +
      (1 - Math.min(1, m.txCount / 8)) * 0.4 +
      (1 - m.topSourceShare) * 0.2,
  );

  return { salaried, variable, projectBased, portfolio, windfall, emerging };
}

/** Score entries sorted strongest first, with a stable tie-break. */
export function rankIncomeStyles(
  scores: Record<IncomeStyleId, number>,
): [IncomeStyleId, number][] {
  const entries = Object.entries(scores) as [IncomeStyleId, number][];

  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Winning archetype, falling back to `emerging` when nothing scores clearly. */
export function pickIncomeStyle(scores: Record<IncomeStyleId, number>): IncomeStyleId {
  return pickFromRanked(rankIncomeStyles(scores));
}

function pickFromRanked(ranked: [IncomeStyleId, number][]): IncomeStyleId {
  const [topId, topScore] = ranked[0] ?? ["emerging", 0];
  if (topScore < 0.22) return "emerging";

  return topId;
}

/**
 * How much the verdict can be trusted: sample size (months and payments)
 * blended with how far the leader sits ahead of the runner-up.
 */
export function incomeConfidence(
  ranked: [IncomeStyleId, number][],
  m: IncomeMetrics,
): IncomeConfidence {
  const topScore = ranked[0]?.[1] ?? 0;
  const runnerUp = ranked[1]?.[1] ?? 0;
  const margin = topScore - runnerUp;

  // Sample size dominates on purpose. A wide margin between two archetypes
  // scored off two months of data is a confident reading of almost nothing, so
  // margin alone must not be able to lift a thin window out of "low".
  const value = clamp01(
    clamp01((m.monthsWithIncome - INCOME_MIN_MONTHS) / 6) * 0.45 +
      clamp01(m.txCount / 12) * 0.25 +
      clamp01(margin / 0.15) * 0.2 +
      clamp01((topScore - 0.22) / 0.38) * 0.1,
  );

  const runnerUpTitle = ranked[1] ? INCOME_STYLES[ranked[1][0]].title : "";
  const reasons = [
    `${m.monthsWithIncome} of ${m.monthsInWindow} months with income`,
    `${m.txCount} payments`,
    runnerUpTitle
      ? margin >= 0.1
        ? `clear lead over ${runnerUpTitle}`
        : `close call with ${runnerUpTitle}`
      : "",
  ].filter(Boolean);

  return { level: confidenceLevel(value), value, margin, reasons };
}

/** Secondary archetype when the runner-up scores close enough to matter. */
export function incomeBlend(ranked: [IncomeStyleId, number][]): {
  secondary: IncomeStyleMeta | null;
  weight: number;
  label: string;
} {
  const top = ranked[0];
  const second = ranked[1];
  const primaryTitle = top ? INCOME_STYLES[top[0]].title : INCOME_STYLES.emerging.title;

  if (!top || !second) return { secondary: null, weight: 0, label: primaryTitle };

  const qualifies = second[1] >= 0.45 * top[1] && second[1] >= 0.2;
  if (!qualifies) return { secondary: null, weight: 0, label: primaryTitle };

  const secondary = INCOME_STYLES[second[0]];
  const weight = top[1] + second[1] > 0 ? second[1] / (top[1] + second[1]) : 0;

  return { secondary, weight, label: `${primaryTitle}, with a ${secondary.trait} streak` };
}

export type IncomeNarrative = { pattern: string; behavior: string };

/** Join the sentences that had the signal to be written. */
function join(parts: (string | false | null | undefined)[], fallback: string) {
  const text = parts.filter(Boolean).join(" ").trim();

  return text || fallback;
}

/** `n` with a plural suffix — keeps sentence builders readable. */
function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Personalized "Data Pattern" / "Behavior" copy built from the window's real
 * numbers. Every sentence is guarded by the signal it needs, and each block
 * falls back to the archetype's static prose, so a thin window renders real
 * sentences rather than fragments.
 */
export function buildIncomeNarrative(
  id: IncomeStyleId,
  m: IncomeMetrics,
  fmt: Formatters = DEFAULT_FORMATTERS,
): IncomeNarrative {
  const meta = INCOME_STYLES[id];
  const money = fmt.money;
  const top = m.sources[0];

  if (id === "salaried") {
    return {
      pattern: join(
        [
          top && `${top.name} pays ${money(top.amount)} across ${plural(top.txCount, "payment")}.`,
          m.topDomShare >= 0.4 &&
            m.topDom > 0 &&
            `Most of it lands around day ${m.topDom} of the month.`,
          m.medianGap > 0 && `Typical gap between payments is ${plural(m.medianGap, "day")}.`,
        ],
        meta.pattern,
      ),
      behavior: join(
        [
          m.topSourceShare >= 0.6 &&
            `${pct(m.topSourceShare)} of your income comes from one source.`,
          m.recurringShare >= 0.5 &&
            `${pct(m.recurringShare)} of it is already marked recurring.`,
          m.monthlyMin > 0 && `Your lowest month still brought in ${money(m.monthlyMin)}.`,
        ],
        meta.behavior,
      ),
    };
  }

  if (id === "variable") {
    return {
      pattern: join(
        [
          `Payments land roughly every ${plural(m.medianGap || 30, "day")}, but range from ${money(m.minAmt)} to ${money(m.maxAmt)}.`,
          m.monthsWithIncome > 0 &&
            `Income arrived in ${m.monthsWithIncome} of ${m.monthsInWindow} months.`,
        ],
        meta.pattern,
      ),
      behavior: join(
        [
          top && `${top.name} drives it, at ${pct(top.share)} of the total.`,
          m.monthlyMin > 0 &&
            `Plan against your floor of ${money(m.monthlyMin)} rather than the ${money(m.monthlyMean)} average.`,
        ],
        meta.behavior,
      ),
    };
  }

  if (id === "projectBased") {
    return {
      pattern: join(
        [
          m.longestGap > 0 &&
            `Your longest quiet stretch ran ${plural(m.longestGap, "day")}.`,
          m.monthsZero > 0 &&
            `${m.monthsZero} of ${m.monthsInWindow} months brought in nothing at all.`,
          `Payments ranged from ${money(m.minAmt)} to ${money(m.maxAmt)}.`,
        ],
        meta.pattern,
      ),
      behavior: join(
        [
          top && `${top.name} accounts for ${pct(top.share)} of what came in.`,
          m.monthlyMean > 0 &&
            `Averaged over the window that is ${money(m.monthlyMean)} a month.`,
        ],
        meta.behavior,
      ),
    };
  }

  if (id === "portfolio") {
    const named = m.sources.slice(0, 3).map((s) => s.name).join(", ");

    return {
      pattern: join(
        [
          m.sourceCount > 1 &&
            `${plural(m.sourceCount, "source")} contributed meaningfully${named ? `: ${named}.` : "."}`,
          top && `The largest is ${top.name} at ${pct(top.share)}.`,
        ],
        meta.pattern,
      ),
      behavior: join(
        [
          m.topSourceShare < 0.5 &&
            `No single stream carries the window — losing the biggest would cost ${pct(m.topSourceShare)}.`,
          m.monthsWithIncome === m.monthsInWindow &&
            `Something arrived in all ${m.monthsInWindow} months.`,
        ],
        meta.behavior,
      ),
    };
  }

  if (id === "windfall") {
    const big = m.largestPayment;

    return {
      pattern: join(
        [
          big &&
            `A single ${money(big.amount)} payment accounts for ${pct(big.share)} of the window's income.`,
          m.medianAmt > 0 && `Your typical payment is ${money(m.medianAmt)}.`,
        ],
        meta.pattern,
      ),
      behavior: join(
        [
          `Strip that one payment out and the picture changes completely.`,
          m.monthlyMedian > 0 &&
            `A more representative month is ${money(m.monthlyMedian)}.`,
        ],
        meta.behavior,
      ),
    };
  }

  return {
    pattern: join(
      [
        `${plural(m.txCount, "payment")} across ${m.monthsWithIncome} of ${m.monthsInWindow} months.`,
        m.medianAmt > 0 && `Typical payment is ${money(m.medianAmt)}.`,
      ],
      meta.pattern,
    ),
    behavior: join(
      [top && `So far ${top.name} is the main source.`, `A few more months will sharpen this.`],
      meta.behavior,
    ),
  };
}

/** One concrete, number-backed suggestion for the archetype. */
export function buildIncomeNudge(
  id: IncomeStyleId,
  m: IncomeMetrics,
  fmt: Formatters = DEFAULT_FORMATTERS,
): string {
  const money = fmt.money;
  const top = m.sources[0];

  if (id === "salaried") {
    if (m.meanMonthlySpend > 0 && m.monthlyMin > 0) {
      return m.floorCoversSpend
        ? `Your floor of ${money(m.monthlyMin)} covers your ${money(m.meanMonthlySpend)} average spend — the gap is worth automating into savings.`
        : `Your floor of ${money(m.monthlyMin)} sits under your ${money(m.meanMonthlySpend)} average spend. Trimming to the floor closes the gap.`;
    }

    return `One source covers ${pct(m.topSourceShare)} of your income — a second stream is the main way to reduce that exposure.`;
  }

  if (id === "variable") {
    return m.monthlyMin > 0
      ? `Budget on your ${money(m.monthlyMin)} floor and treat anything above it as surplus — that is up to ${money(Math.max(0, m.monthlyMean - m.monthlyMin))} a month to direct.`
      : `Budget on your lowest month rather than the average, and treat the difference as surplus.`;
  }

  if (id === "projectBased") {
    return m.monthsZero > 0
      ? `${m.monthsZero} of ${m.monthsInWindow} months had no income — a buffer of ${money(m.monthlyMean)} covers one dry month.`
      : `Gaps run up to ${plural(m.longestGap, "day")} — holding ${money(m.monthlyMean)} back covers the next one.`;
  }

  if (id === "portfolio") {
    return top
      ? `${top.name} is ${pct(top.share)} of your income; the rest together cover ${money(m.total - top.amount)}. Worth checking that split still matches the effort each takes.`
      : `Your sources are evenly spread — worth checking that split still matches the effort each takes.`;
  }

  if (id === "windfall") {
    const big = m.largestPayment;

    return big
      ? `Excluding that ${money(big.amount)} payment, your typical month is ${money(m.monthlyMedian)} — plan from that number, not the total.`
      : `Plan from your median month rather than the window total.`;
  }

  const toSettle = Math.max(1, INCOME_MIN_MONTHS + 4 - m.monthsWithIncome);

  return `${plural(toSettle, "more month")} of logged income will firm this up — right now it rests on ${plural(m.txCount, "payment")}.`;
}

/** Plain-language direction of travel across the window. */
export function describeIncomeTrend(m: IncomeMetrics): string {
  if (m.monthsWithIncome < 2) return "Not enough months to compare yet.";

  const change = Math.round(Math.abs(m.growthPct) * 100);
  if (change < 5) return "Steady — within 5% across the window.";

  return m.growthPct > 0
    ? `Up ${change}% vs the first half of the window.`
    : `Down ${change}% vs the first half of the window.`;
}

/** Distinct months carrying income, from a pre-filtered list. */
function monthsWithIncomeIn(expenses: Expense[], monthKey: string, window: IncomeWindow, index?: CategoryIndex) {
  const months = new Set(monthsWindow(monthKey, windowSize(window)).map((m) => m.key));
  const seen = new Set<string>();
  let txCount = 0;

  for (const e of expenses) {
    const key = e.date.slice(0, 7);
    if (!months.has(key)) continue;
    if (classifyTx(e, index) !== "income") continue;
    seen.add(key);
    txCount += 1;
  }

  return { months: seen.size, txCount };
}

/**
 * Assess the income profile for a rolling window.
 *
 * The gate runs before any metrics work: a ledger with one or two income rows
 * is the common case early on, and it should cost a single scan rather than a
 * full computation.
 */
export function assessIncomeProfile(
  expenses: Expense[],
  monthKey: string,
  window: IncomeWindow,
  index?: CategoryIndex,
): IncomeAssessment {
  const windowLabel = incomeWindowLabel(window, monthKey);
  const { months, txCount } = monthsWithIncomeIn(expenses, monthKey, window, index);

  if (txCount < INCOME_MIN_EVENTS || months < INCOME_MIN_MONTHS) {
    return {
      status: "insufficient",
      txHave: txCount,
      txNeeded: INCOME_MIN_EVENTS,
      monthsHave: months,
      monthsNeeded: INCOME_MIN_MONTHS,
      windowLabel,
    };
  }

  const { metrics, scores } = computeIncomeMetrics(expenses, monthKey, window, index);
  const ranked = rankIncomeStyles(scores);
  const id = pickFromRanked(ranked);

  return {
    status: "ready",
    style: INCOME_STYLES[id],
    scores,
    metrics,
    confidence: incomeConfidence(ranked, metrics),
    blend: incomeBlend(ranked),
    windowLabel,
  };
}

/** True when the wallet declares a monthly income on top of logged transactions. */
export function declaresMonthlyIncome(wallet?: {
  fundingMode?: string;
  income?: number;
} | null) {
  return Boolean(wallet && wallet.fundingMode === "monthly" && (wallet.income ?? 0) > 0);
}
