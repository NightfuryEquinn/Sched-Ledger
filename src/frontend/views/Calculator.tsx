import {
  CatGlyph,
  EmptyState,
  Icon,
  SummaryCard,
} from "@/frontend/components/ui";
import {
  allocateBudgets,
  computeNet,
  isValidAllocationTotal,
  isValidTaxTotal,
  MY_TAX_PRESETS,
  sumPercents,
  type TaxPreset,
} from "@/frontend/lib/calculator";
import { fmtMoney, getCurrency } from "@/frontend/lib/data";
import {
  preventNegativeKeys,
  preventWheelChange,
  stripNegativeInput,
} from "@/frontend/lib/number-input";
import type { Budgets, CategoryIndex, FinancialWallet } from "@/frontend/lib/types";
import { useEffect, useId, useMemo, useState } from "react";

/*
 * Calculator — budgeting helper
 * ─────────────────────────────
 * Client-side only: deduct custom tax lines from income, allocate the
 * net across expense categories by percentage, then optionally apply
 * the result to wallet budgets via a confirmation modal.
 */

type TaxLine = {
  id: string;
  title: string;
  pct: string;
};

type CalculatorProps = {
  wallet: FinancialWallet | null | undefined;
  budgets: Budgets;
  setBudgets: (next: Budgets) => void;
  currency: string;
  categoryIndex: CategoryIndex;
};

/** Parse a non-negative number from a draft string; empty → 0. */
function parseNonNeg(raw: string): number {
  const n = parseFloat(raw);

  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Create a unique local id for ephemeral tax rows. */
function newTaxId(): string {
  return `tax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Build an empty tax line with a default title. */
function emptyTaxLine(index: number): TaxLine {
  return { id: newTaxId(), title: index === 0 ? "Tax" : `Tax ${index + 1}`, pct: "" };
}

export function Calculator({
  wallet,
  budgets,
  setBudgets,
  currency,
  categoryIndex,
}: CalculatorProps) {
  const expenseCategories = categoryIndex.expenseCategories;
  const [grossDraft, setGrossDraft] = useState("");
  const [taxLines, setTaxLines] = useState<TaxLine[]>(() => [emptyTaxLine(0)]);
  const [pctByCat, setPctByCat] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const titleId = useId();

  /** Prefill income from the active wallet when the wallet changes. */
  useEffect(() => {
    const income = wallet?.income ?? 0;
    setGrossDraft(income > 0 ? String(income) : "");
    setApplied(false);
  }, [wallet?.id, wallet?.income]);

  /** Keep allocation draft keys aligned with expense categories. */
  useEffect(() => {
    setPctByCat((prev) => {
      const next: Record<string, string> = {};

      for (const c of expenseCategories) {
        next[c.id] = prev[c.id] ?? "";
      }

      return next;
    });
  }, [expenseCategories]);

  const gross = parseNonNeg(grossDraft);
  const taxPercents = taxLines.map((t) => parseNonNeg(t.pct));
  const taxSum = sumPercents(taxPercents);
  const taxOk = isValidTaxTotal(taxPercents);
  const net = taxOk ? computeNet(gross, taxPercents) : 0;
  const taxAmount = taxOk ? Math.max(0, gross - net) : 0;

  const allocations = useMemo(
    () =>
      expenseCategories.map((c) => ({
        id: c.id,
        pct: parseNonNeg(pctByCat[c.id] ?? ""),
      })),
    [expenseCategories, pctByCat],
  );

  const allocSum = sumPercents(allocations.map((a) => a.pct));
  const allocOk = expenseCategories.length > 0 && isValidAllocationTotal(allocations.map((a) => a.pct));
  const canApply = gross > 0 && taxOk && allocOk;

  const computed = useMemo(
    () => (canApply ? allocateBudgets(net, allocations) : {}),
    [canApply, net, allocations],
  );

  /** Update a tax line field by id. */
  const patchTax = (id: string, patch: Partial<TaxLine>) => {
    setTaxLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  /** Append a new empty tax line. */
  const addTax = () => {
    setTaxLines((rows) => [...rows, emptyTaxLine(rows.length)]);
  };

  /** Remove a tax line (keep at least one). */
  const removeTax = (id: string) => {
    setTaxLines((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  };

  /** Apply a Malaysia / generic tax preset pack into the tax lines. */
  const applyTaxPreset = (preset: TaxPreset) => {
    markDirty();
    setTaxLines(
      preset.lines.map((line) => ({
        id: newTaxId(),
        title: line.title,
        pct: String(line.pct),
      })),
    );
  };

  /** Persist computed budgets after modal confirm. */
  const applyBudgets = () => {
    if (!canApply) return;

    setBudgets({ ...budgets, ...computed });
    setConfirmOpen(false);
    setApplied(true);
  };

  /** Clear the success state when the user edits the calculator. */
  const markDirty = () => {
    if (applied) setApplied(false);
  };

  const remainingAlloc = 100 - allocSum;
  const cur = getCurrency(currency);

  return (
    <div className="view">
      <div className="summary-grid sg-3" data-tour="tour-calculator-summary">
        <SummaryCard
          label="Gross Income"
          value={fmtMoney(gross, { cents: false, currency })}
          sub="calculator draft"
        />
        <SummaryCard
          label="Tax Total"
          tone="spent"
          value={fmtMoney(taxAmount, { cents: false, currency })}
          sub={taxOk ? `${formatPct(taxSum)} of gross` : "tax exceeds 100%"}
        />
        <SummaryCard
          label="Net After Tax"
          tone={taxOk ? "ok" : "danger"}
          value={fmtMoney(net, { cents: false, currency })}
          sub="available to allocate"
        />
      </div>

      <section className="panel" data-tour="tour-calculator-income">
        <div className="panel-head">
          <h2>Income</h2>
          <p className="panel-sub">Prefills from wallet income — edits stay on this screen</p>
        </div>
        <label className="fld-label">Gross amount</label>
        <div className="amount-field">
          <span className="amount-cur">{cur.symbol}</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            placeholder="0"
            value={grossDraft}
            onChange={(e) => {
              markDirty();
              setGrossDraft(stripNegativeInput(e.target.value));
            }}
            onKeyDown={preventNegativeKeys}
            onWheel={preventWheelChange}
          />
        </div>
      </section>

      <section className="panel" data-tour="tour-calculator-tax">
        <div className="panel-head">
          <h2>Tax Collection</h2>
          <p className="panel-sub">Custom titles and percentages — not saved. MY presets are estimates only.</p>
        </div>
        <div className="calculator-presets">
          {MY_TAX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="mini-btn"
              title={preset.description}
              onClick={() => applyTaxPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="calculator-tax-list">
          {taxLines.map((line) => (
            <div key={line.id} className="calculator-tax-row">
              <div className="calculator-tax-title">
                <label className="fld-label">Title</label>
                <input
                  className="text-in"
                  type="text"
                  value={line.title}
                  placeholder="Tax name"
                  onChange={(e) => {
                    markDirty();
                    patchTax(line.id, { title: e.target.value });
                  }}
                />
              </div>
              <div className="calculator-tax-pct">
                <label className="fld-label">Percent</label>
                <div className="calculator-pct-field">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={line.pct}
                    onChange={(e) => {
                      markDirty();
                      patchTax(line.id, { pct: stripNegativeInput(e.target.value) });
                    }}
                    onKeyDown={preventNegativeKeys}
                    onWheel={preventWheelChange}
                  />
                  <span className="calculator-pct-suffix">%</span>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn calculator-tax-remove"
                aria-label="Remove Tax Line"
                disabled={taxLines.length <= 1}
                onClick={() => {
                  markDirty();
                  removeTax(line.id);
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
        {!taxOk ? (
          <p className="calculator-warn" role="status">
            Tax percentages cannot exceed 100%.
          </p>
        ) : null}
        <div className="calculator-row-actions">
          <button
            type="button"
            className="ghost-btn sm"
            onClick={() => {
              markDirty();
              addTax();
            }}
          >
            Add Tax Line
          </button>
          <span className="calculator-meta">Total tax {formatPct(taxSum)}</span>
        </div>
      </section>

      <section className="panel" data-tour="tour-calculator-allocate">
        <div className="panel-head">
          <h2>Allocate by Category</h2>
          <p className="panel-sub">Percentages must total 100%</p>
        </div>

        {!expenseCategories.length ? (
          <EmptyState title="No Expense Categories" sub="Add categories first, then return here to allocate." />
        ) : (
          <>
            <div className="calculator-alloc-list">
              {expenseCategories.map((c) => {
                const pct = parseNonNeg(pctByCat[c.id] ?? "");
                const amount = canApply ? (computed[c.id] ?? 0) : Math.round((net * pct) / 100);

                return (
                  <div key={c.id} className="calculator-alloc-row">
                    <div className="calculator-alloc-name">
                      <CatGlyph glyph={c.glyph} id={c.id} />
                      <span>{c.name}</span>
                    </div>
                    <div className="calculator-pct-field">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={pctByCat[c.id] ?? ""}
                        onChange={(e) => {
                          markDirty();
                          setPctByCat((prev) => ({
                            ...prev,
                            [c.id]: stripNegativeInput(e.target.value),
                          }));
                        }}
                        onKeyDown={preventNegativeKeys}
                        onWheel={preventWheelChange}
                        aria-label={`${c.name} percent`}
                      />
                      <span className="calculator-pct-suffix">%</span>
                    </div>
                    <div className="calculator-alloc-amt num">
                      {fmtMoney(amount, { cents: false, currency })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="calculator-row-actions">
              <span
                className={
                  "calculator-meta" + (allocOk ? " calculator-meta--ok" : " calculator-meta--warn")
                }
                role="status"
              >
                Allocated {formatPct(allocSum)}
                {allocOk
                  ? " — ready"
                  : ` — ${formatPct(Math.abs(remainingAlloc))} ${remainingAlloc > 0 ? "left" : "over"}`}
              </span>
            </div>
          </>
        )}
      </section>

      <div className="calculator-apply" data-tour="tour-calculator-apply">
        <button
          type="button"
          className={"primary-btn" + (applied ? " calculator-apply-success" : "")}
          disabled={!canApply || applied}
          onClick={() => setConfirmOpen(true)}
        >
          {applied ? "Apply Successful" : "Apply to Budgets"}
        </button>
        <p className="calculator-apply-hint">
          Replaces every expense category budget on the active wallet.
        </p>
      </div>

      {confirmOpen ? (
        <div
          className="modal-scrim center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="modal-head">
              <h3 id={titleId}>Apply Calculator Budgets?</h3>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setConfirmOpen(false)}
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body modal-scroll">
              <p className="calculator-confirm-lead">
                This updates all expense category budgets on{" "}
                <strong>{wallet?.name ?? "this wallet"}</strong> to the amounts below.
              </p>
              <ul className="calculator-confirm-list">
                {expenseCategories.map((c) => (
                  <li key={c.id}>
                    <span className="calculator-confirm-name">
                      <CatGlyph glyph={c.glyph} id={c.id} /> {c.name}
                    </span>
                    <span className="num">
                      {fmtMoney(computed[c.id] ?? 0, { cents: false, currency })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-foot">
              <span />
              <div className="mf-right">
                <button type="button" className="ghost-btn" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="primary-btn" onClick={applyBudgets}>
                  Confirm Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Format a percentage for status text (trim trailing zeros). */
function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";

  const rounded = Math.round(n * 100) / 100;

  return `${rounded}%`;
}
