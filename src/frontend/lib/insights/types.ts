import type { Confidence } from "@/frontend/lib/stat-helpers";

export type { Confidence };

/** How urgently a card should read, mapped straight to a CSS accent. */
export type InsightTone = "positive" | "neutral" | "warning" | "critical";

/**
 * One generated finding, shared by Transaction Insights and Fuel Insights.
 * Both engines emit this shape so the two features render through one
 * `InsightFeed` component and rank against each other consistently.
 */
export type Insight = {
  /** Stable across recomputes, so React keys and cross-render dedupe both work. */
  id: string;
  /** Rule family — e.g. "forecast", "budget-risk", "anomaly", "drift", "recurring", "fuel-consumption". */
  kind: string;
  title: string;
  body: string;
  tone: InsightTone;
  /** 0..1 — how much money or behaviour this actually moves. */
  impact: number;
  confidence: Confidence;
  /** impact × confidence.value, filled in by rankInsights. */
  score: number;
  /** Optional headline figure rendered on the card. */
  metric?: { label: string; value: string };
};
