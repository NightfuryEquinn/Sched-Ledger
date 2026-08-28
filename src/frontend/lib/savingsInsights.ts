import { CURRENT_MONTH_KEY, monthLabel, monthsWindow, roundMoney } from "./data";
import { mean } from "./stat-helpers";
import type { CategoryIndex } from "./categories";
import type { Piggy } from "./piggies";
import {
  classifyTx,
  isRecurring,
  recurringMonthlyEquivalent,
  recurringScheduleKey,
} from "./stats";
import type { Expense } from "./types";

type SavingsHeadline = {
  id: string;
  text: string;
  tone: "positive" | "warning";
};

type PiggyPace = {
  catId: string;
  /** Trailing monthly deposit rate, folding in active recurring pledges. */
  monthlyPace: number;
  /** ISO month (YYYY-MM) the target is projected to be hit, or null. */
  projectedCompletion: string | null;
  /** null when there is no target or no deadline to judge pace against. */
  onTrack: boolean | null;
  /** Monthly amount needed to hit the target by its deadline, or null. */
  requiredMonthly: number | null;
};

type SavingsInsights = {
  /** Net savings (deposits − withdrawals) as a share of income over the window. */
  savingsRate: number;
  meanMonthly: number;
  /** Consecutive months (ending at the window's last month) with positive net saving. */
  currentStreak: number;
  bestMonth: { key: string; label: string; amount: number } | null;
  netFlow: number;
  perPiggy: PiggyPace[];
  headlines: SavingsHeadline[];
};

/** Shift a YYYY-MM key by a signed month delta. */
function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whole months from one YYYY-MM key to another (may be negative). */
function monthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);

  return (ty! - fy!) * 12 + (tm! - fm!);
}

/**
 * Net monthly deposits (savings − withdrawals) for one category across a
 * window of months, keyed by month. Also used by the Piggies view to draw
 * each card's contribution sparkline. Capital-assigned transactions are
 * excluded — they count as Capitals Unspent, not Piggies.
 */
export function monthlyNetForCat(
  txns: Expense[],
  catId: string,
  index: CategoryIndex,
  months: { key: string }[],
): Map<string, number> {
  const byMonth = new Map(months.map((m) => [m.key, 0]));

  for (const e of txns) {
    if (e.capitalPlanId) continue;
    if (index.subById[e.sub]?.catId !== catId) continue;
    const monthKey = e.date.slice(0, 7);
    if (!byMonth.has(monthKey)) continue;

    const cls = classifyTx(e, index);
    if (cls === "savings") byMonth.set(monthKey, byMonth.get(monthKey)! + e.amount);
    else if (cls === "withdrawal") byMonth.set(monthKey, byMonth.get(monthKey)! - e.amount);
  }

  return byMonth;
}

/**
 * Monthly equivalent of every still-active recurring deposit pledged to a
 * category, deduped by series so a 12-month-old standing order counts once,
 * not once per historical instance.
 */
function recurringPledgeForCat(txns: Expense[], catId: string, index: CategoryIndex): number {
  const seen = new Set<string>();
  let total = 0;

  for (const e of txns) {
    if (e.capitalPlanId) continue;
    if (classifyTx(e, index) !== "savings") continue;
    if (!isRecurring(e)) continue;
    if (index.subById[e.sub]?.catId !== catId) continue;

    const key = recurringScheduleKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    total += recurringMonthlyEquivalent(e.amount, e.recurring);
  }

  return total;
}

/**
 * Pace, projection and on-track status for one piggy.
 *
 * `monthlyPace` resolves as the larger of (a) the trailing historical mean
 * over the window and (b) any active recurring pledge's monthly equivalent —
 * a standing order that only just started has thin history but a real,
 * known future rate, so relying on history alone would under-project it.
 */
function paceFor(
  piggy: Piggy,
  txns: Expense[],
  index: CategoryIndex,
  monthKey: string,
  windowMonths: { key: string }[],
): PiggyPace {
  const netByMonth = monthlyNetForCat(txns, piggy.catId, index, windowMonths);
  const historicalMean = mean([...netByMonth.values()]);
  const pledged = recurringPledgeForCat(txns, piggy.catId, index);
  const monthlyPace = roundMoney(Math.max(historicalMean, pledged));

  let projectedCompletion: string | null = null;
  if (piggy.target !== undefined && piggy.target > 0) {
    if (piggy.balance >= piggy.target) projectedCompletion = monthKey;
    else if (monthlyPace > 0) {
      const monthsNeeded = Math.ceil((piggy.target - piggy.balance) / monthlyPace);
      projectedCompletion = shiftMonthKey(monthKey, monthsNeeded);
    }
  }

  let onTrack: boolean | null = null;
  if (piggy.target !== undefined && piggy.target > 0 && piggy.deadline) {
    const deadlineMonth = piggy.deadline.slice(0, 7);
    onTrack = piggy.balance >= piggy.target || (projectedCompletion !== null && projectedCompletion <= deadlineMonth);
  }

  let requiredMonthly: number | null = null;
  if (piggy.target !== undefined && piggy.target > 0 && piggy.deadline) {
    const remaining = piggy.target - piggy.balance;
    if (remaining <= 0) requiredMonthly = 0;
    else {
      const monthsLeft = monthsBetween(monthKey, piggy.deadline.slice(0, 7));
      requiredMonthly = monthsLeft > 0 ? roundMoney(remaining / monthsLeft) : null;
    }
  }

  return { catId: piggy.catId, monthlyPace, projectedCompletion, onTrack, requiredMonthly };
}

function buildHeadlines(
  piggies: Piggy[],
  perPiggy: PiggyPace[],
  currentStreak: number,
  bestMonth: SavingsInsights["bestMonth"],
): SavingsHeadline[] {
  const headlines: SavingsHeadline[] = [];
  const paceById = new Map(perPiggy.map((p) => [p.catId, p]));

  if (currentStreak >= 2) {
    headlines.push({
      id: "streak",
      text: `${currentStreak} months in a row of net saving.`,
      tone: "positive",
    });
  }

  if (bestMonth && bestMonth.amount > 0) {
    headlines.push({
      id: "best-month",
      text: `Best month was ${bestMonth.label}, saving ${bestMonth.amount.toFixed(2)}.`,
      tone: "positive",
    });
  }

  const behind = piggies
    .filter((p) => paceById.get(p.catId)?.onTrack === false)
    .sort((a, b) => (b.target ?? 0) - (a.target ?? 0))[0];
  if (behind) {
    headlines.push({
      id: `behind-${behind.catId}`,
      text: `${behind.name} is behind pace for its ${behind.deadline?.slice(0, 7) ?? ""} deadline.`,
      tone: "warning",
    });
  }

  const onTrackAhead = piggies.find((p) => {
    const pace = paceById.get(p.catId);
    return pace?.onTrack === true && p.target !== undefined && p.balance < p.target;
  });
  if (onTrackAhead) {
    const pace = paceById.get(onTrackAhead.catId)!;
    headlines.push({
      id: `on-track-${onTrackAhead.catId}`,
      text: `${onTrackAhead.name} is on track${pace.projectedCompletion ? `, projected ${monthLabel(pace.projectedCompletion, false)}` : ""}.`,
      tone: "positive",
    });
  }

  return headlines;
}

/**
 * Compute savings-behaviour insights for a window ending at `monthKey`.
 *
 * `savingsTxns` must already be filtered to savings deposits/withdrawals
 * (e.g. `useLedger().savingsTxns`); `allExpenses` is the full transaction set,
 * needed only to size `savingsRate` against income. Transactions assigned to
 * a Capitals plan (`capitalPlanId`) are excluded — they show as Unspent on
 * that plan instead of contributing to Piggies analytics.
 */
export function computeSavingsInsights(
  savingsTxns: Expense[],
  allExpenses: Expense[],
  piggies: Piggy[],
  index: CategoryIndex,
  monthKey: string = CURRENT_MONTH_KEY,
  windowSize = 12,
): SavingsInsights {
  const windowMonths = monthsWindow(monthKey, windowSize);
  const windowKeys = new Set(windowMonths.map((m) => m.key));

  const netByMonth = new Map(windowMonths.map((m) => [m.key, 0]));
  for (const e of savingsTxns) {
    if (e.capitalPlanId) continue;
    const mo = e.date.slice(0, 7);
    if (!windowKeys.has(mo)) continue;
    const cls = classifyTx(e, index);
    if (cls === "savings") netByMonth.set(mo, netByMonth.get(mo)! + e.amount);
    else if (cls === "withdrawal") netByMonth.set(mo, netByMonth.get(mo)! - e.amount);
  }

  const monthlyValues = windowMonths.map((m) => roundMoney(netByMonth.get(m.key) ?? 0));
  const meanMonthly = roundMoney(mean(monthlyValues));
  const netFlow = roundMoney(monthlyValues.reduce((s, v) => s + v, 0));

  let currentStreak = 0;
  for (let i = monthlyValues.length - 1; i >= 0; i--) {
    if (monthlyValues[i]! > 0) currentStreak++;
    else break;
  }

  let bestMonth: SavingsInsights["bestMonth"] = null;
  windowMonths.forEach((m, i) => {
    const amount = monthlyValues[i]!;
    if (!bestMonth || amount > bestMonth.amount) {
      bestMonth = { key: m.key, label: monthLabel(m.key, false), amount };
    }
  });

  let totalIncome = 0;
  for (const e of allExpenses) {
    const mo = e.date.slice(0, 7);
    if (!windowKeys.has(mo)) continue;
    if (classifyTx(e, index) === "income") totalIncome += e.amount;
  }
  // No income in the window means a savings rate has no denominator — 0% is
  // the honest answer, not NaN.
  const savingsRate = totalIncome > 0 ? roundMoney(netFlow / totalIncome) : 0;

  const perPiggy = piggies.map((p) => paceFor(p, savingsTxns, index, monthKey, windowMonths));
  const headlines = buildHeadlines(piggies, perPiggy, currentStreak, bestMonth);

  return { savingsRate, meanMonthly, currentStreak, bestMonth, netFlow, perPiggy, headlines };
}
