import { roundMoney } from "@/frontend/lib/data";
import { pushInsight } from "@/frontend/lib/insights/build";
import { rankInsights } from "@/frontend/lib/insights/rank";
import type { Confidence, Insight } from "@/frontend/lib/insights/types";
import {
  clamp01,
  confidenceLevel,
  DEFAULT_FORMATTERS,
  percentileOf,
  sorted,
  stats1D,
  type Formatters,
} from "@/frontend/lib/stat-helpers";
import type { FuelFill, VehicleType } from "@/frontend/lib/types";

/** Whether a vehicle type runs on fuel (litres) or power (kWh). */
type EnergyMode = "fuel" | "power";

/**
 * Vocabulary record keyed by vehicle type — every string the Vehicles view and
 * Fuel Insights render comes from here, so an EV never says "litres" and a
 * car never says "charge".
 */
type VehicleTypeMeta = {
  id: VehicleType;
  label: string;
  mode: EnergyMode;
  glyph: string;
  unit: string;
  unitLong: string;
  fillNoun: string;
  fillVerb: string;
  efficiencyLabel: string;
  unitPriceLabel: string;
  stationNoun: string;
};

export const VEHICLE_TYPES: Record<VehicleType, VehicleTypeMeta> = {
  car: {
    id: "car",
    label: "Car",
    mode: "fuel",
    glyph: "🚗",
    unit: "L",
    unitLong: "litre",
    fillNoun: "fill-up",
    fillVerb: "Fill up",
    efficiencyLabel: "L/100km",
    unitPriceLabel: "per litre",
    stationNoun: "station",
  },
  ev: {
    id: "ev",
    label: "EV",
    mode: "power",
    glyph: "🔋",
    unit: "kWh",
    unitLong: "kWh",
    fillNoun: "charge",
    fillVerb: "Charge",
    efficiencyLabel: "kWh/100km",
    unitPriceLabel: "per kWh",
    stationNoun: "charger",
  },
  bike: {
    id: "bike",
    label: "Bike",
    mode: "fuel",
    glyph: "🏍️",
    unit: "L",
    unitLong: "litre",
    fillNoun: "fill-up",
    fillVerb: "Fill up",
    efficiencyLabel: "L/100km",
    unitPriceLabel: "per litre",
    stationNoun: "station",
  },
  van: {
    id: "van",
    label: "Van",
    mode: "fuel",
    glyph: "🚐",
    unit: "L",
    unitLong: "litre",
    fillNoun: "fill-up",
    fillVerb: "Fill up",
    efficiencyLabel: "L/100km",
    unitPriceLabel: "per litre",
    stationNoun: "station",
  },
};

/** Minimum fills before cost metrics unlock. */
export const FUEL_MIN_FILLS = 3;
/** Minimum full-to-full distance segments before consumption metrics unlock. */
const FUEL_MIN_SEGMENTS = 2;

/** One full-to-full (or full-to-partial-to-full) distance segment. */
type FuelSegment = {
  startFillId: string;
  endFillId: string;
  startDate: string;
  endDate: string;
  distanceKm: number;
  /** Quantity burned across the segment — every fill strictly after the start through the end, inclusive. */
  quantity: number;
  cost: number;
};

type FuelMetrics = {
  fillCount: number;
  totalSpend: number;
  totalQuantity: number;
  spanDays: number;

  unitPriceMean: number;
  unitPriceMedian: number;
  unitPriceMin: number;
  unitPriceMax: number;
  latestUnitPrice: number;
  /** Median unit price across this vehicle's own history — the "personal baseline". */
  unitPriceBaseline: number;
  priceVsBaselinePct: number;

  segments: FuelSegment[];
  totalDistanceKm: number;
  /** L/100km or kWh/100km — null until FUEL_MIN_SEGMENTS is met. */
  consumptionPer100: number | null;
  costPerKm: number | null;

  medianDaysBetweenFills: number;
  /** Days since the most recent fill (0 when only one fill). */
  lastGapDays: number;
  medianDistanceBetweenFills: number | null;
  monthlyRunningCost: number;
  projectedAnnualCost: number;

  bestFill: FuelFill | null;
  worstFill: FuelFill | null;
  /** What you avoided paying by not paying the worst price on every fill. */
  savedVsWorst: number;

  missingOdometerCount: number;
};

type FuelAssessment =
  | { status: "insufficient"; fillsHave: number; fillsNeeded: number }
  | { status: "ready"; metrics: FuelMetrics; confidence: Confidence };

/** Local day index for an ISO date, via UTC so DST never shifts a gap. */
function isoToUtcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);

  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

/** Median of a numeric list (via the shared percentile helper), or 0 when empty. */
function median(values: number[]): number {
  return percentileOf(sorted(values), 0.5);
}

/**
 * Walk fills in date order building full-to-full distance segments. A segment
 * opens at a non-partial fill with an odometer reading and closes at the next
 * one; every fill in between (partial or not) has its quantity and cost folded
 * into that segment, since it was burned over the same distance. A closing
 * candidate whose odometer did not advance (rollback or typo) is dropped
 * rather than clamped, and becomes the new anchor so one bad row does not
 * block segments built from the clean data around it.
 */
function buildSegments(sortedFills: FuelFill[]): FuelSegment[] {
  const segments: FuelSegment[] = [];
  let anchorIdx = -1;

  for (let i = 0; i < sortedFills.length; i++) {
    const fill = sortedFills[i]!;
    const isAnchorCandidate = !fill.partial && fill.odometer != null;

    if (anchorIdx === -1) {
      if (isAnchorCandidate) anchorIdx = i;
      continue;
    }

    if (!isAnchorCandidate) continue;

    const anchor = sortedFills[anchorIdx]!;
    const distanceKm = fill.odometer! - anchor.odometer!;

    if (distanceKm > 0) {
      let quantity = 0;
      let cost = 0;
      for (let j = anchorIdx + 1; j <= i; j++) {
        quantity += sortedFills[j]!.quantity;
        cost += sortedFills[j]!.price;
      }
      segments.push({
        startFillId: anchor.id,
        endFillId: fill.id,
        startDate: anchor.date,
        endDate: fill.date,
        distanceKm,
        quantity,
        cost,
      });
    }

    anchorIdx = i;
  }

  return segments;
}

/**
 * Compute the full metric set for one vehicle's fill history. Pure and
 * synchronous — one pass to sort, one to walk segments, then closed-form
 * aggregates off the prebuilt arrays.
 */
export function computeFuelMetrics(fills: FuelFill[]): FuelMetrics {
  const sortedFills = [...fills].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id),
  );
  const fillCount = sortedFills.length;
  const totalSpend = roundMoney(sortedFills.reduce((s, f) => s + f.price, 0));
  const totalQuantity = sortedFills.reduce((s, f) => s + f.quantity, 0);

  const first = sortedFills[0];
  const last = sortedFills[fillCount - 1];
  const spanDays =
    first && last ? Math.max(1, isoToUtcDay(last.date) - isoToUtcDay(first.date)) : 0;

  const unitPrices = sortedFills.filter((f) => f.quantity > 0).map((f) => f.price / f.quantity);
  const sortedUnitPrices = sorted(unitPrices);
  const { mean: unitPriceMean } = stats1D(unitPrices);
  const unitPriceMedian = median(unitPrices);
  const unitPriceMin = sortedUnitPrices[0] ?? 0;
  const unitPriceMax = sortedUnitPrices[sortedUnitPrices.length - 1] ?? 0;
  const latestUnitPrice = last && last.quantity > 0 ? last.price / last.quantity : 0;
  const unitPriceBaseline = unitPriceMedian;
  const priceVsBaselinePct =
    unitPriceBaseline > 0 ? (latestUnitPrice - unitPriceBaseline) / unitPriceBaseline : 0;

  const segments = buildSegments(sortedFills);
  const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
  const segQuantity = segments.reduce((s, seg) => s + seg.quantity, 0);
  const segCost = segments.reduce((s, seg) => s + seg.cost, 0);
  const hasEnoughSegments = segments.length >= FUEL_MIN_SEGMENTS && totalDistanceKm > 0;
  const consumptionPer100 = hasEnoughSegments ? (segQuantity / totalDistanceKm) * 100 : null;
  const costPerKm = hasEnoughSegments ? segCost / totalDistanceKm : null;

  const dayGaps: number[] = [];
  for (let i = 1; i < sortedFills.length; i++) {
    dayGaps.push(isoToUtcDay(sortedFills[i]!.date) - isoToUtcDay(sortedFills[i - 1]!.date));
  }
  const medianDaysBetweenFills = median(dayGaps);
  const medianDistanceBetweenFills = segments.length
    ? median(segments.map((s) => s.distanceKm))
    : null;

  const monthlyRunningCost =
    spanDays > 0
      ? roundMoney(((fillCount > 1 ? totalSpend - first!.price : totalSpend) / spanDays) * 30.44)
      : totalSpend;
  const projectedAnnualCost = roundMoney(monthlyRunningCost * 12);

  let bestFill: FuelFill | null = null;
  let worstFill: FuelFill | null = null;
  let bestPrice = Infinity;
  let worstPrice = -Infinity;
  for (const f of sortedFills) {
    if (f.quantity <= 0) continue;
    const price = f.price / f.quantity;
    if (price < bestPrice) {
      bestPrice = price;
      bestFill = f;
    }
    if (price > worstPrice) {
      worstPrice = price;
      worstFill = f;
    }
  }
  const savedVsWorst =
    worstFill && totalQuantity > 0 ? roundMoney(totalQuantity * worstPrice - totalSpend) : 0;

  const missingOdometerCount = sortedFills.filter((f) => f.odometer == null).length;

  return {
    fillCount,
    totalSpend,
    totalQuantity,
    spanDays,
    unitPriceMean,
    unitPriceMedian,
    unitPriceMin,
    unitPriceMax,
    latestUnitPrice,
    unitPriceBaseline,
    priceVsBaselinePct,
    segments,
    totalDistanceKm,
    consumptionPer100,
    costPerKm,
    medianDaysBetweenFills,
    lastGapDays: dayGaps[dayGaps.length - 1] ?? 0,
    medianDistanceBetweenFills,
    monthlyRunningCost,
    projectedAnnualCost,
    bestFill,
    worstFill,
    savedVsWorst,
    missingOdometerCount,
  };
}

/** Confidence weighted on segment count, history span, and consumption dispersion. */
function fuelConfidence(metrics: FuelMetrics): Confidence {
  const perSegmentConsumption = metrics.segments
    .filter((s) => s.distanceKm > 0)
    .map((s) => (s.quantity / s.distanceKm) * 100);
  const { cv } = stats1D(perSegmentConsumption);
  const reasons = [
    `${metrics.segments.length} full-to-full segments`,
    `${metrics.spanDays} days of history`,
  ];

  const value = clamp01(
    0.35 * clamp01(metrics.segments.length / 6) +
      0.35 * clamp01(metrics.spanDays / 180) +
      0.3 * (1 - clamp01(cv / 1.2)),
  );

  return { level: confidenceLevel(value), value, margin: 0, reasons };
}

/** Gate + metrics for one vehicle's fill history. */
export function assessVehicleFuel(fills: FuelFill[]): FuelAssessment {
  if (fills.length < FUEL_MIN_FILLS) {
    return { status: "insufficient", fillsHave: fills.length, fillsNeeded: FUEL_MIN_FILLS };
  }

  const metrics = computeFuelMetrics(fills);

  return { status: "ready", metrics, confidence: fuelConfidence(metrics) };
}

/**
 * Fuel-specific findings feeding the same ranked-card model as Transaction
 * Insights. Every string routes through `meta` so an EV reads as power/charge
 * vocabulary throughout.
 */
export function computeFuelInsights(
  metrics: FuelMetrics,
  meta: VehicleTypeMeta,
  confidence: Confidence,
  formatters: Formatters = DEFAULT_FORMATTERS,
): Insight[] {
  const out: Insight[] = [];
  const money = formatters.money;

  if (metrics.segments.length >= FUEL_MIN_SEGMENTS + 1) {
    const last = metrics.segments[metrics.segments.length - 1]!;
    const priorSegments = metrics.segments.slice(0, -1);
    const priorQuantity = priorSegments.reduce((s, seg) => s + seg.quantity, 0);
    const priorDistance = priorSegments.reduce((s, seg) => s + seg.distanceKm, 0);
    if (priorDistance > 0 && last.distanceKm > 0) {
      const baselinePer100 = (priorQuantity / priorDistance) * 100;
      const lastPer100 = (last.quantity / last.distanceKm) * 100;
      const deltaPct = baselinePer100 > 0 ? (lastPer100 - baselinePer100) / baselinePer100 : 0;
      if (Math.abs(deltaPct) >= 0.1) {
        const worse = deltaPct > 0;
        pushInsight(out, {
          id: "fuel-consumption-trend",
          kind: "fuel-consumption-trend",
          title: worse
            ? `${meta.efficiencyLabel} crept up on your last ${meta.fillNoun}`
            : `${meta.efficiencyLabel} improved on your last ${meta.fillNoun}`,
          body: `Your last stretch used ${lastPer100.toFixed(1)} ${meta.efficiencyLabel}, vs a ${baselinePer100.toFixed(1)} average before it (${worse ? "+" : ""}${Math.round(deltaPct * 100)}%).`,
          tone: worse ? "warning" : "positive",
          impact: clamp01(Math.abs(deltaPct)),
          confidence,
          metric: {
            label: meta.efficiencyLabel,
            value: `${lastPer100.toFixed(1)} ${meta.efficiencyLabel}`,
          },
        });
      }
    }
  }

  if (metrics.unitPriceBaseline > 0 && Math.abs(metrics.priceVsBaselinePct) >= 0.08) {
    const above = metrics.priceVsBaselinePct > 0;
    pushInsight(out, {
      id: "fuel-price-timing",
      kind: "fuel-price-timing",
      title: above
        ? `Paid above your usual price ${meta.unitPriceLabel}`
        : `Great price on your last ${meta.fillNoun}`,
      body: `${money(metrics.latestUnitPrice)} ${meta.unitPriceLabel} vs your usual ${money(metrics.unitPriceBaseline)} (${above ? "+" : ""}${Math.round(metrics.priceVsBaselinePct * 100)}%).`,
      tone: above ? "warning" : "positive",
      impact: clamp01(Math.abs(metrics.priceVsBaselinePct)),
      confidence,
      metric: { label: `Price ${meta.unitPriceLabel}`, value: money(metrics.latestUnitPrice) },
    });
  }

  pushInsight(out, {
    id: "fuel-running-cost",
    kind: "fuel-running-cost",
    title: "Running cost projection",
    body: `You're spending about ${money(metrics.monthlyRunningCost)} a month on this vehicle — projected to ${money(metrics.projectedAnnualCost)} over a year.`,
    tone: "neutral",
    impact: 0.2,
    confidence,
    metric: { label: "Projected annual cost", value: money(metrics.projectedAnnualCost) },
  });

  if (metrics.medianDaysBetweenFills > 0 && metrics.lastGapDays > 0) {
    const lastGapDays = metrics.lastGapDays;
    const ratio = lastGapDays / metrics.medianDaysBetweenFills;
    if (ratio >= 1.6) {
      pushInsight(out, {
        id: "fuel-cadence",
        kind: "fuel-cadence",
        title: `Longer than usual between ${meta.fillNoun}s`,
        body: `${lastGapDays} days since your last one, vs a usual ${Math.round(metrics.medianDaysBetweenFills)} — could mean less driving, or a missed log.`,
        tone: "neutral",
        impact: clamp01((ratio - 1) * 0.4),
        confidence,
        metric: { label: "Days since last", value: `${lastGapDays}d` },
      });
    } else if (ratio <= 0.5) {
      pushInsight(out, {
        id: "fuel-cadence",
        kind: "fuel-cadence",
        title: `Sooner than usual back at the ${meta.stationNoun}`,
        body: `${lastGapDays} days since your last ${meta.fillNoun}, vs a usual ${Math.round(metrics.medianDaysBetweenFills)}.`,
        tone: "neutral",
        impact: clamp01((1 - ratio) * 0.4),
        confidence,
        metric: { label: "Days since last", value: `${lastGapDays}d` },
      });
    }
  }

  const missingShare = metrics.fillCount > 0 ? metrics.missingOdometerCount / metrics.fillCount : 0;
  if (missingShare > 0.3) {
    pushInsight(out, {
      id: "fuel-odometer-coverage",
      kind: "fuel-odometer-coverage",
      title: "Log your odometer to unlock efficiency",
      body: `${metrics.missingOdometerCount} of ${metrics.fillCount} ${meta.fillNoun}s are missing an odometer reading — add it next time to see ${meta.efficiencyLabel}.`,
      tone: "neutral",
      impact: 0.15,
      confidence: {
        level: confidenceLevel(1),
        value: 1,
        margin: 0,
        reasons: ["direct count, no estimation"],
      },
      metric: {
        label: "Missing odometer",
        value: `${metrics.missingOdometerCount}/${metrics.fillCount}`,
      },
    });
  }

  return rankInsights(out);
}
