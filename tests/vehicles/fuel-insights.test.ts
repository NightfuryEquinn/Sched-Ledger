import { describe, expect, test } from "bun:test";
import {
  assessVehicleFuel,
  computeFuelInsights,
  computeFuelMetrics,
  FUEL_MIN_FILLS,
  VEHICLE_TYPES,
} from "@/frontend/lib/fuelInsights";
import type { FuelFill } from "@/frontend/lib/types";

let seq = 0;

/** Build a FuelFill fixture with sane defaults, overridable per test. */
function fill(overrides: Partial<FuelFill> & Pick<FuelFill, "date">): FuelFill {
  seq += 1;
  return {
    id: `fill_${seq}`,
    vehicleId: "veh_1",
    price: 100,
    quantity: 40,
    station: "Test Station",
    partial: false,
    ...overrides,
  };
}

describe("VEHICLE_TYPES vocabulary", () => {
  test("car reads as fuel vocabulary", () => {
    expect(VEHICLE_TYPES.car.mode).toBe("fuel");
    expect(VEHICLE_TYPES.car.unit).toBe("L");
    expect(VEHICLE_TYPES.car.fillNoun).toBe("fill-up");
    expect(VEHICLE_TYPES.car.efficiencyLabel).toBe("L/100km");
    expect(VEHICLE_TYPES.car.unitPriceLabel).toBe("per litre");
  });

  test("ev reads as power vocabulary", () => {
    expect(VEHICLE_TYPES.ev.mode).toBe("power");
    expect(VEHICLE_TYPES.ev.unit).toBe("kWh");
    expect(VEHICLE_TYPES.ev.fillNoun).toBe("charge");
    expect(VEHICLE_TYPES.ev.efficiencyLabel).toBe("kWh/100km");
    expect(VEHICLE_TYPES.ev.unitPriceLabel).toBe("per kWh");
    expect(VEHICLE_TYPES.ev.stationNoun).toBe("charger");
  });

  test("bike and van also read as fuel vocabulary", () => {
    expect(VEHICLE_TYPES.bike.mode).toBe("fuel");
    expect(VEHICLE_TYPES.van.mode).toBe("fuel");
  });
});

describe("assessVehicleFuel gate", () => {
  test("fewer than FUEL_MIN_FILLS fills stays insufficient", () => {
    const fills = [fill({ date: "2026-01-01" }), fill({ date: "2026-01-15" })];
    const assessment = assessVehicleFuel(fills);
    expect(assessment.status).toBe("insufficient");
    if (assessment.status === "insufficient") {
      expect(assessment.fillsHave).toBe(2);
      expect(assessment.fillsNeeded).toBe(FUEL_MIN_FILLS);
    }
  });

  test("zero fills is insufficient, not a crash", () => {
    const assessment = assessVehicleFuel([]);
    expect(assessment.status).toBe("insufficient");
    if (assessment.status === "insufficient") expect(assessment.fillsHave).toBe(0);
  });

  test("FUEL_MIN_FILLS fills unlocks ready status", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000 }),
      fill({ date: "2026-01-15", odometer: 1400 }),
      fill({ date: "2026-01-30", odometer: 1800 }),
    ];
    const assessment = assessVehicleFuel(fills);
    expect(assessment.status).toBe("ready");
  });
});

describe("computeFuelMetrics segments", () => {
  test("consecutive full fills build one segment per gap", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, quantity: 40, price: 200 }),
      fill({ date: "2026-01-15", odometer: 1400, quantity: 32, price: 160 }),
      fill({ date: "2026-01-30", odometer: 1800, quantity: 36, price: 180 }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.segments).toHaveLength(2);
    expect(metrics.segments[0]!.distanceKm).toBe(400);
    expect(metrics.segments[0]!.quantity).toBe(32);
    expect(metrics.totalDistanceKm).toBe(800);
    // (32 + 36) / 800 * 100
    expect(metrics.consumptionPer100).not.toBeNull();
    expect(metrics.consumptionPer100!).toBeCloseTo((68 / 800) * 100, 5);
    expect(metrics.costPerKm).not.toBeNull();
  });

  test("a partial fill between two full fills folds into the same segment", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, quantity: 40, partial: false }),
      fill({ date: "2026-01-10", odometer: undefined, quantity: 10, partial: true }),
      fill({ date: "2026-01-20", odometer: 1500, quantity: 30, partial: false }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.segments).toHaveLength(1);
    const seg = metrics.segments[0]!;
    expect(seg.distanceKm).toBe(500);
    // Both the partial (10) and the closing full fill (30) were burned across this segment.
    expect(seg.quantity).toBe(40);
  });

  test("an odometer rollback is dropped, not clamped, and does not block later segments", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, quantity: 40 }),
      fill({ date: "2026-01-10", odometer: 900, quantity: 20 }), // rollback / typo
      fill({ date: "2026-01-20", odometer: 1100, quantity: 25 }),
    ];
    const metrics = computeFuelMetrics(fills);

    // Only the clean B -> C segment survives; A -> B (negative distance) is dropped.
    expect(metrics.segments).toHaveLength(1);
    expect(metrics.segments[0]!.distanceKm).toBe(200);
    expect(metrics.segments[0]!.quantity).toBe(25);
  });

  test("all-partial fills with no full anchor never opens a segment", () => {
    const fills = [
      fill({ date: "2026-01-01", partial: true, odometer: 1000 }),
      fill({ date: "2026-01-10", partial: true, odometer: 1200 }),
      fill({ date: "2026-01-20", partial: true, odometer: 1400 }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.segments).toHaveLength(0);
    expect(metrics.consumptionPer100).toBeNull();
    expect(metrics.costPerKm).toBeNull();
  });

  test("missing odometer readings are counted without crashing", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: undefined }),
      fill({ date: "2026-01-10", odometer: undefined }),
      fill({ date: "2026-01-20", odometer: 1200 }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.missingOdometerCount).toBe(2);
    expect(metrics.segments).toHaveLength(0);
    expect(Number.isFinite(metrics.monthlyRunningCost)).toBe(true);
    expect(Number.isFinite(metrics.projectedAnnualCost)).toBe(true);
  });

  test("a single fill never produces NaN or Infinity anywhere in the metrics", () => {
    const metrics = computeFuelMetrics([fill({ date: "2026-01-01", odometer: 1000 })]);

    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === "number") {
        expect(Number.isNaN(value), `${key} was NaN`).toBe(false);
        expect(Number.isFinite(value), `${key} was Infinite`).toBe(true);
      }
    }
    expect(metrics.consumptionPer100).toBeNull();
    expect(metrics.spanDays).toBe(1);
  });

  test("same-day, same-odometer fills produce a zero-distance guard, not a crash", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000 }),
      fill({ date: "2026-01-01", odometer: 1000 }),
      fill({ date: "2026-01-01", odometer: 1000 }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.segments).toHaveLength(0);
    expect(metrics.consumptionPer100).toBeNull();
    expect(metrics.costPerKm).toBeNull();
  });

  test("best and worst fill track the lowest and highest unit price", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, price: 100, quantity: 50 }), // 2.0/unit
      fill({ date: "2026-01-10", odometer: 1300, price: 90, quantity: 30 }), // 3.0/unit
      fill({ date: "2026-01-20", odometer: 1600, price: 40, quantity: 40 }), // 1.0/unit
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.bestFill!.id).toBe(fills[2]!.id);
    expect(metrics.worstFill!.id).toBe(fills[1]!.id);
    expect(metrics.savedVsWorst).toBeGreaterThan(0);
  });
});

describe("computeFuelInsights money formatter seam", () => {
  test("honors an injected money formatter instead of the raw number", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, quantity: 40, price: 200 }),
      fill({ date: "2026-01-15", odometer: 1200, quantity: 20, price: 100 }),
      fill({ date: "2026-01-30", odometer: 1400, quantity: 20, price: 100 }),
    ];
    const metrics = computeFuelMetrics(fills);
    const assessment = assessVehicleFuel(fills);
    if (assessment.status !== "ready") throw new Error("expected ready");

    const insights = computeFuelInsights(metrics, VEHICLE_TYPES.car, assessment.confidence, {
      money: (n) => `¤${n.toFixed(2)}`,
    });

    const runningCost = insights.find((i) => i.kind === "fuel-running-cost");
    expect(runningCost).toBeDefined();
    expect(runningCost!.body).toContain("¤");
    expect(runningCost!.metric!.value).toContain("¤");
  });

  test("EV vocabulary flows through generated insight copy", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 1000, quantity: 20, price: 40 }),
      fill({ date: "2026-01-10", odometer: 1200, quantity: 18, price: 36 }),
      fill({ date: "2026-01-20", odometer: 1400, quantity: 40, price: 80 }),
    ];
    const metrics = computeFuelMetrics(fills);
    const assessment = assessVehicleFuel(fills);
    if (assessment.status !== "ready") throw new Error("expected ready");

    const insights = computeFuelInsights(metrics, VEHICLE_TYPES.ev, assessment.confidence);
    const runningCost = insights.find((i) => i.kind === "fuel-running-cost");
    expect(runningCost).toBeDefined();
    // No rule should ever emit a NaN-tainted score for a well-formed fixture.
    for (const insight of insights) {
      expect(Number.isFinite(insight.score)).toBe(true);
      expect(Number.isFinite(insight.impact)).toBe(true);
    }
  });

  test("running cost excludes the first fill from the spend span", () => {
    const fills = [
      fill({ date: "2026-01-01", price: 100, quantity: 40, odometer: 1000 }),
      fill({ date: "2026-02-01", price: 100, quantity: 40, odometer: 2000 }),
      fill({ date: "2026-03-01", price: 100, quantity: 40, odometer: 3000 }),
    ];
    const metrics = computeFuelMetrics(fills);

    expect(metrics.monthlyRunningCost).toBeLessThan(105);
    expect(metrics.monthlyRunningCost).toBeGreaterThan(95);
  });

  test("cadence insight compares days since last fill to median gap", () => {
    const fills = [
      fill({ date: "2026-01-01", price: 100, quantity: 40, odometer: 1000 }),
      fill({ date: "2026-01-31", price: 100, quantity: 40, odometer: 2000 }),
      fill({ date: "2026-03-02", price: 100, quantity: 20, odometer: 2500 }),
    ];
    const metrics = computeFuelMetrics(fills);
    const assessment = assessVehicleFuel(fills);
    if (assessment.status !== "ready") throw new Error("expected ready");

    const insights = computeFuelInsights(metrics, VEHICLE_TYPES.car, assessment.confidence);
    expect(
      insights.some((i) => i.kind === "fuel-cadence" && i.title.includes("Longer than usual")),
    ).toBe(false);
  });

  test("odometer coverage nudge appears when most fills are missing a reading", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: undefined }),
      fill({ date: "2026-01-10", odometer: undefined }),
      fill({ date: "2026-01-20", odometer: 1200 }),
    ];
    const metrics = computeFuelMetrics(fills);
    const assessment = assessVehicleFuel(fills);
    if (assessment.status !== "ready") throw new Error("expected ready");

    const insights = computeFuelInsights(metrics, VEHICLE_TYPES.car, assessment.confidence);
    expect(insights.some((i) => i.kind === "fuel-odometer-coverage")).toBe(true);
  });
});
