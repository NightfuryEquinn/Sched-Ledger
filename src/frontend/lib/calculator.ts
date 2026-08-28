/**
 * Budget calculator helpers — tax deduction and category allocation.
 * Client-side only; no persistence.
 */

type AllocationRow = {
  id: string;
  pct: number;
};

export type TaxPresetLine = {
  title: string;
  pct: number;
};

export type TaxPreset = {
  id: string;
  label: string;
  description: string;
  lines: TaxPresetLine[];
};

/**
 * Malaysia-oriented payroll / tax preset packs (approximate employee-side %).
 * Estimates only — not official LHDN/EPF advice; all math stays in-browser.
 */
export const MY_TAX_PRESETS: TaxPreset[] = [
  {
    id: "my-epf-employee",
    label: "MY · EPF employee (11%)",
    description: "Employee EPF contribution at 11%.",
    lines: [{ title: "EPF (employee)", pct: 11 }],
  },
  {
    id: "my-epf-socso-eis",
    label: "MY · EPF + SOCSO + EIS",
    description: "Common employee statutory deductions (approx.).",
    lines: [
      { title: "EPF (employee)", pct: 11 },
      { title: "SOCSO (employee)", pct: 0.5 },
      { title: "EIS (employee)", pct: 0.2 },
    ],
  },
  {
    id: "my-pcb-ballpark",
    label: "MY · PCB ballpark (10%)",
    description: "Rough PCB withholding placeholder — adjust to your payslip.",
    lines: [{ title: "PCB (estimate)", pct: 10 }],
  },
  {
    id: "my-sst",
    label: "MY · SST (6%)",
    description: "Service tax style line for taxable spend planning.",
    lines: [{ title: "SST", pct: 6 }],
  },
];

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
 * Amounts carry 2 decimal places; the split is computed in whole cents so
 * any rounding remainder goes to the last category with a positive
 * percentage and the map totals net rounded to the nearest cent.
 */
export function allocateBudgets(
  net: number,
  allocations: AllocationRow[],
): Record<string, number> {
  const targetCents = Math.max(0, Math.round((Number.isFinite(net) ? net : 0) * 100));
  const centsById: Record<string, number> = {};

  if (!allocations.length) {
    return {};
  }

  let allocated = 0;

  for (const row of allocations) {
    const pct = Number.isFinite(row.pct) ? Math.max(0, row.pct) : 0;
    const cents = Math.round((targetCents * pct) / 100);
    centsById[row.id] = cents;
    allocated += cents;
  }

  const remainder = targetCents - allocated;

  if (remainder !== 0) {
    for (let i = allocations.length - 1; i >= 0; i--) {
      const row = allocations[i];

      if (!row) continue;

      const pct = Number.isFinite(row.pct) ? row.pct : 0;

      if (pct > 0) {
        centsById[row.id] = (centsById[row.id] ?? 0) + remainder;
        break;
      }
    }
  }

  const result: Record<string, number> = {};

  for (const [id, cents] of Object.entries(centsById)) {
    result[id] = cents / 100;
  }

  return result;
}
