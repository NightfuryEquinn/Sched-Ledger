import type { Insight } from "./types";

export type RankOptions = {
  /** Minimum score to keep a card at all. */
  floor?: number;
  /** Maximum cards returned. */
  limit?: number;
};

const DEFAULT_FLOOR = 0.05;
const DEFAULT_LIMIT = 6;

/**
 * Rank insights by score (impact × confidence) descending, drop anything
 * under the floor, collapse duplicate `kind`s to the strongest instance, and
 * cap the result. Ties break by id so the feed is deterministic across
 * renders. A rule that legitimately wants more than one card at once (e.g.
 * the worst two over-budget categories) namespaces its `kind` per instance
 * (`"budget-risk:groceries"`) so this dedupe does not collapse them.
 */
export function rankInsights(list: Insight[], opts: RankOptions = {}): Insight[] {
  const floor = opts.floor ?? DEFAULT_FLOOR;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const byKind = new Map<string, Insight>();
  for (const insight of list) {
    if (!Number.isFinite(insight.score) || insight.score < floor) continue;
    const existing = byKind.get(insight.kind);
    if (!existing || insight.score > existing.score) byKind.set(insight.kind, insight);
  }

  return [...byKind.values()]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
