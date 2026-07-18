/**
 * Budget calculator helpers — tax deduction and category allocation.
 * Client-side only; no persistence.
 */

export type AllocationRow = {
  id: string;
  pct: number;
};

const PCT_TOLERANCE = 0.01;

/** Sum finite percentage values (non-finite treated as 0). */
export function sumPercents(percents: number[]): number {
  return percents.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0);
}

/** Whether tax percentages total at most 100%. */
export function isValidTaxTotal(taxPercents: number[]): boolean {
  return sumPercents(taxPercents) <= 100 + PCT_TOLERANCE;
}

/** Whether allocation percentages total approximately 100%. */
export function isValidAllocationTotal(percents: number[]): boolean {
  return Math.abs(sumPercents(percents) - 100) <= PCT_TOLERANCE;
}

/**
 * Net income after a single combined tax deduction:
 * `gross * (1 - Σtax%/100)`. Returns 0 when gross is negative.
 */
export function computeNet(gross: number, taxPercents: number[]): number {
  if (!Number.isFinite(gross) || gross < 0) {
    return 0;
  }

  const taxSum = sumPercents(taxPercents);
  const clamped = Math.min(Math.max(taxSum, 0), 100);

  return gross * (1 - clamped / 100);
}

/**
 * Allocate net across categories by percentage.
 * Amounts are whole units; any rounding remainder goes to the last
 * category with a positive percentage so the map totals `Math.round(net)`.
 */
export function allocateBudgets(
  net: number,
  allocations: AllocationRow[],
): Record<string, number> {
  const target = Math.max(0, Math.round(Number.isFinite(net) ? net : 0));
  const result: Record<string, number> = {};

  if (!allocations.length) {
    return result;
  }

  let allocated = 0;

  for (const row of allocations) {
    const pct = Number.isFinite(row.pct) ? Math.max(0, row.pct) : 0;
    const amount = Math.round((target * pct) / 100);
    result[row.id] = amount;
    allocated += amount;
  }

  const remainder = target - allocated;

  if (remainder !== 0) {
    for (let i = allocations.length - 1; i >= 0; i--) {
      const row = allocations[i];

      if (!row) continue;

      const pct = Number.isFinite(row.pct) ? row.pct : 0;

      if (pct > 0) {
        result[row.id] = (result[row.id] ?? 0) + remainder;
        break;
      }
    }
  }

  return result;
}
