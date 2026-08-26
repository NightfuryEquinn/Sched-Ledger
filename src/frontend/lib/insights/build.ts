import { clamp01 } from "@/frontend/lib/stat-helpers";
import type { Insight } from "./types";

/**
 * Build one insight and append it to `out`, computing its rank score
 * (impact × confidence) and guarding both inputs against non-finite values so
 * a divide-by-zero upstream can never produce a NaN card.
 */
export function pushInsight(
  out: Insight[],
  partial: Omit<Insight, "score" | "impact"> & { impact: number },
): void {
  const impact = Number.isFinite(partial.impact) ? clamp01(partial.impact) : 0;
  const confidenceValue = Number.isFinite(partial.confidence.value)
    ? clamp01(partial.confidence.value)
    : 0;

  out.push({
    ...partial,
    impact,
    score: impact * confidenceValue,
  });
}
