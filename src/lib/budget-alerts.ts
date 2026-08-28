/** Default fraction of a category budget that triggers a "nearing limit" warning. */
export const DEFAULT_BUDGET_ALERT_THRESHOLD = 0.8;

export type BudgetAlertLevel = "warning" | "exceeded";

type BudgetAlertCategory = {
  id: string;
  name: string;
  type?: "expense" | "income" | "savings";
};

export type BudgetAlert = {
  categoryId: string;
  categoryName: string;
  spent: number;
  budget: number;
  ratio: number;
  level: BudgetAlertLevel;
  month: string;
};

function isPositiveBudget(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Compare monthly category spend against budgets.
 * Income categories and unset (0) budgets are skipped.
 * Returns alerts sorted exceeded-first, then by ratio descending.
 */
export function evaluateBudgetAlerts(opts: {
  byCat: Record<string, number>;
  byCatHeld?: Record<string, number>;
  budgets: Record<string, number>;
  categories: BudgetAlertCategory[];
  month: string;
  warningThreshold?: number;
}): BudgetAlert[] {
  const threshold = opts.warningThreshold ?? DEFAULT_BUDGET_ALERT_THRESHOLD;
  const alerts: BudgetAlert[] = [];

  for (const cat of opts.categories) {
    if (cat.type === "income" || cat.id === "income") continue;
    if (cat.type === "savings" || cat.id === "savings") continue;
    const budget = opts.budgets[cat.id];
    if (!isPositiveBudget(budget)) continue;

    const spent = (opts.byCat[cat.id] ?? 0) + (opts.byCatHeld?.[cat.id] ?? 0);
    if (spent <= 0) continue;

    const ratio = spent / budget;
    let level: BudgetAlertLevel | null = null;
    if (ratio >= 1) level = "exceeded";
    else if (ratio >= threshold) level = "warning";
    if (!level) continue;

    alerts.push({
      categoryId: cat.id,
      categoryName: cat.name,
      spent,
      budget,
      ratio,
      level,
      month: opts.month,
    });
  }

  return alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === "exceeded" ? -1 : 1;
    return b.ratio - a.ratio;
  });
}

export function budgetAlertDedupeKey(parts: {
  walletId: string;
  categoryId: string;
  month: string;
  level: BudgetAlertLevel;
}): string {
  return `${parts.walletId}|${parts.categoryId}|${parts.month}|${parts.level}`;
}
