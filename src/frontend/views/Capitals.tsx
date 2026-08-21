import { Donut } from "@/frontend/charts";
import { DatePicker } from "@/frontend/components/DateTimePicker";
import { EmptyState, Icon, SummaryCard } from "@/frontend/components/ui";
import {
  newCapitalItem,
  planBudget,
  planBudgetProgress,
  planIsOverbudget,
  planMonthlySave,
  planPaidTotal,
  planProgress,
  plansTotalMonthlySave,
} from "@/frontend/lib/capitals";
import { CAPITAL_TEMPLATES, type CapitalTemplate } from "@/frontend/lib/capitalTemplates";
import { dayLabel, fmtMoney } from "@/frontend/lib/data";
import type { CapitalItem, CapitalPlan, CapitalTemplateId } from "@/frontend/lib/types";
import { TODO_ICON_OPTIONS } from "@/lib/glyphs";
import { useEffect, useMemo, useState } from "react";

/*
 * Capitals — future financial planner
 * ────────────────────────────────────
 * Standalone checklists for big life expenses (marriage, trips, loans, or
 * fully custom plans). Each plan carries a total budget and optional target
 * date; monthly save is (budget − paid) ÷ months left. Overbudget plans show
 * Overpaid. Line items can optionally be "logged" into the real ledger when
 * paid, but plans exist independently of it.
 */

type CapitalsProps = {
  capitalPlans: CapitalPlan[];
  currency: string;
  onSavePlan: (data: Partial<CapitalPlan> & { id?: string }) => Promise<CapitalPlan>;
  onDeletePlan: (id: string) => Promise<unknown>;
  onLogItem: (plan: CapitalPlan, item: CapitalItem) => void;
};

type EditorMode = { type: "add-plan" } | { type: "edit-plan"; planId: string } | null;

const ICONS = TODO_ICON_OPTIONS;

export function Capitals({ capitalPlans, currency, onSavePlan, onDeletePlan, onLogItem }: CapitalsProps) {
  const [plans, setPlans] = useState(capitalPlans);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [templateId, setTemplateId] = useState<CapitalTemplateId>("custom");
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState("🎯");
  const [targetDate, setTargetDate] = useState("");
  const [initialBudget, setInitialBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [itemDraftFor, setItemDraftFor] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemCost, setItemCost] = useState("");
  const [editingCost, setEditingCost] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState("");

  useEffect(() => {
    setPlans(capitalPlans);
  }, [capitalPlans]);

  const money = (n: number) => fmtMoney(n, { currency });
  const totalPlanned = useMemo(() => plans.reduce((s, p) => s + planBudget(p), 0), [plans]);
  const totalPaid = useMemo(() => plans.reduce((s, p) => s + planPaidTotal(p), 0), [plans]);
  const upcoming = useMemo(
    () => plans.filter((p) => p.targetDate && planProgress(p) !== 1).length,
    [plans],
  );
  const totalMonthlySave = useMemo(() => plansTotalMonthlySave(plans), [plans]);

  const persistPlan = async (data: Partial<CapitalPlan> & { id?: string }) => {
    setBusy(true);
    setError("");
    try {
      const saved = await onSavePlan(data);
      setPlans((prev) => (data.id ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]));
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save plan");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const openAddPlan = () => {
    setEditor({ type: "add-plan" });
    setTemplateId("custom");
    setName("");
    setGlyph("🎯");
    setTargetDate("");
    setInitialBudget("");
    setError("");
  };

  const openEditPlan = (plan: CapitalPlan) => {
    setEditor({ type: "edit-plan", planId: plan.id });
    setName(plan.name);
    setGlyph(plan.glyph);
    setTargetDate(plan.targetDate ?? "");
    setInitialBudget(plan.initialBudget != null && plan.initialBudget > 0 ? String(plan.initialBudget) : "");
    setError("");
  };

  const pickTemplate = (t: CapitalTemplate | null) => {
    if (!t) {
      setTemplateId("custom");
      setGlyph("🎯");
      if (!name) setName("");
      return;
    }
    setTemplateId(t.id);
    setGlyph(t.glyph);
    if (!name) setName(t.name);
  };

  const submitEditor = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!editor) return;

    if (editor.type === "add-plan") {
      const items: CapitalItem[] = [];
      if (templateId !== "custom") {
        const template = CAPITAL_TEMPLATES.find((t) => t.id === templateId);
        for (const itemName of template?.items ?? []) items.push(newCapitalItem(itemName, items));
      }
      const budget = Number(initialBudget) || 0;
      const saved = await persistPlan({
        name: name.trim(),
        glyph,
        templateId,
        targetDate: targetDate || undefined,
        initialBudget: budget > 0 ? budget : undefined,
        createdAt: new Date().toISOString(),
        items,
      });
      if (saved) setEditor(null);
      return;
    }

    const budget = Number(initialBudget) || 0;
    const saved = await persistPlan({
      id: editor.planId,
      name: name.trim(),
      glyph,
      targetDate: targetDate || undefined,
      initialBudget: budget > 0 ? budget : 0,
    });
    if (saved) setEditor(null);
  };

  const removePlan = async (planId: string) => {
    setBusy(true);
    setError("");
    try {
      await onDeletePlan(planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete plan");
    } finally {
      setBusy(false);
    }
  };

  const openAddItem = (planId: string) => {
    setItemDraftFor(planId);
    setItemName("");
    setItemCost("");
  };

  const submitAddItem = async (plan: CapitalPlan) => {
    if (!itemName.trim()) return;
    const item = newCapitalItem(itemName.trim(), plan.items);
    item.estimatedCost = Number(itemCost) || 0;
    setItemDraftFor(null);
    await persistPlan({ id: plan.id, items: [...plan.items, item] });
  };

  const removeItem = async (plan: CapitalPlan, itemId: string) => {
    await persistPlan({ id: plan.id, items: plan.items.filter((i) => i.id !== itemId) });
  };

  const togglePaid = async (plan: CapitalPlan, item: CapitalItem) => {
    const items = plan.items.map((i) => (i.id === item.id ? { ...i, paid: !i.paid } : i));
    await persistPlan({ id: plan.id, items });
  };

  const startEditCost = (item: CapitalItem) => {
    setEditingCost(item.id);
    setCostDraft(String(item.estimatedCost || ""));
  };

  const commitCost = async (plan: CapitalPlan, item: CapitalItem) => {
    const value = Number(costDraft) || 0;
    setEditingCost(null);
    if (value === item.estimatedCost) return;
    const items = plan.items.map((i) => (i.id === item.id ? { ...i, estimatedCost: value } : i));
    await persistPlan({ id: plan.id, items });
  };

  const editorTitle = editor?.type === "add-plan" ? "New Plan" : editor ? "Edit Plan" : "";

  if (!plans.length && !editor) {
    return (
      <div className="view">
        <EmptyState title="No Plans Yet" sub="Start a plan for a big future expense — set a budget and target date to see how much to save each month." />
        <div className="todo-empty-action">
          <button className="primary-btn" type="button" onClick={openAddPlan}>
            <Icon name="plus" size={15} /> New Plan
          </button>
        </div>
        {renderEditor()}
      </div>
    );
  }

  function renderEditor() {
    if (!editor) return null;
    return (
      <div
        className="modal-scrim center"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setEditor(null);
        }}
      >
        <div className="modal sm" role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>{editorTitle}</h3>
            <button className="icon-btn" type="button" onClick={() => setEditor(null)} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="modal-body modal-scroll">
            <div className="dm-sec">
              {editor.type === "add-plan" ? (
                <>
                  <label className="fld-label">Template</label>
                  <div className="capital-template-row">
                    <button
                      type="button"
                      className={"fchip" + (templateId === "custom" ? " active" : "")}
                      onClick={() => pickTemplate(null)}
                    >
                      Custom
                    </button>
                    {CAPITAL_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={"fchip" + (templateId === t.id ? " active" : "")}
                        onClick={() => pickTemplate(t)}
                      >
                        {t.glyph} {t.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              <label className="fld-label" htmlFor="capital-plan-name">
                Plan name
              </label>
              <input
                id="capital-plan-name"
                className="text-in wallet-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="e.g. Our Wedding, Bali Trip"
              />

              <label className="fld-label">
                Target date (optional)
              </label>
              <DatePicker value={targetDate} onChange={setTargetDate} className="wallet-field" />

              <label className="fld-label" htmlFor="capital-plan-budget">
                Total budget (optional)
              </label>
              <input
                id="capital-plan-budget"
                className="text-in wallet-field"
                type="text"
                inputMode="decimal"
                value={initialBudget}
                onChange={(e) => setInitialBudget(e.target.value)}
                placeholder="0"
              />

              <label className="fld-label">Icon</label>
              <div className="cat-glyph-row">
                {ICONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={"cat-glyph-btn" + (glyph === g ? " active" : "")}
                    onClick={() => setGlyph(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {error ? <p className="auth-error">{error}</p> : null}

              <div className="wallet-form-actions">
                <button className="ghost-btn full" type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button
                  className="primary-btn full"
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={() => void submitEditor()}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="summary-grid sg-4" data-tour="tour-capitals-summary">
        <SummaryCard label="Total Planned" value={money(totalPlanned)} sub={`${plans.length} ${plans.length === 1 ? "plan" : "plans"}`} />
        <SummaryCard label="Total Paid" tone="saved" value={money(totalPaid)} sub={totalPlanned ? `${Math.round((totalPaid / totalPlanned) * 100)}% of planned` : ""} />
        <SummaryCard label="Monthly Saving" tone="ok" value={money(totalMonthlySave)} sub="across all plans" />
        <SummaryCard label="Upcoming" value={String(upcoming)} sub="plans with a target date" />
      </div>

      <div className="todo-toolbar" data-tour="tour-capitals-toolbar">
        <button className="primary-btn" type="button" onClick={openAddPlan}>
          <Icon name="plus" size={15} /> New Plan
        </button>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      <div className="capital-grid" data-tour="tour-capitals-grid">
        {plans.map((plan) => {
          const budget = planBudget(plan);
          const paid = planPaidTotal(plan);
          const progress = planBudgetProgress(plan);
          const overbudget = planIsOverbudget(plan);
          const monthlySave = planMonthlySave(plan);
          const donutData = budget > 0
            ? [
                { id: "paid", value: Math.min(paid, budget), color: overbudget ? "var(--danger)" : "var(--saved)" },
                { id: "remain", value: Math.max(budget - paid, 0), color: "var(--hair)" },
              ]
            : [{ id: "empty", value: 1, color: "var(--hair)" }];

          return (
            <div key={plan.id} className="capital-card">
              <div className="capital-card-head">
                <span className="capital-card-glyph">{plan.glyph}</span>
                <div className="capital-card-title">
                  <h3>{plan.name}</h3>
                  {plan.targetDate ? <span className="capital-tag">Due {dayLabel(plan.targetDate)}</span> : null}
                </div>
                <div className="capital-card-actions">
                  <button type="button" onClick={() => openEditPlan(plan)} aria-label="Edit Plan">
                    <Icon name="edit" size={15} />
                  </button>
                  <button type="button" className="danger" disabled={busy} onClick={() => void removePlan(plan.id)} aria-label="Delete Plan">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>

              <div className="capital-card-body">
                <div className="capital-ring">
                  <Donut data={donutData} size={80} thickness={10} onHover={() => {}} activeId={null} />
                  <div className="capital-ring-label">
                    {progress !== null ? `${Math.round(progress * 100)}%` : "—"}
                  </div>
                </div>
                <div className="capital-card-stats">
                  <div className="capital-total">{money(budget)}</div>
                  <div className="capital-paid">{money(paid)} paid</div>
                  {overbudget ? (
                    <div className="capital-monthly capital-overpaid">Overpaid</div>
                  ) : monthlySave !== null ? (
                    <div className="capital-monthly">Save {money(monthlySave)}/mo</div>
                  ) : null}
                </div>
              </div>

              <div className="capital-item-list">
                {plan.items.length ? (
                  [...plan.items]
                    .sort((a, b) => Number(a.paid) - Number(b.paid))
                    .map((item) => (
                      <div key={item.id} className={"capital-item-row" + (item.paid ? " capital-item-paid" : "")}>
                        <button
                          type="button"
                          className={"todo-check" + (item.paid ? " checked" : "")}
                          onClick={() => void togglePaid(plan, item)}
                          aria-label={item.paid ? "Mark unpaid" : "Mark paid"}
                        >
                          {item.paid ? <Icon name="check" size={12} /> : null}
                        </button>
                        <span className="capital-item-name">{item.name}</span>
                        {editingCost === item.id ? (
                          <input
                            autoFocus
                            className="capital-item-cost-in"
                            type="text"
                            inputMode="decimal"
                            value={costDraft}
                            onChange={(e) => setCostDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitCost(plan, item);
                              if (e.key === "Escape") setEditingCost(null);
                            }}
                            onBlur={() => void commitCost(plan, item)}
                          />
                        ) : (
                          <button type="button" className="capital-item-cost" onClick={() => startEditCost(item)}>
                            {money(item.paid ? item.actualCost ?? item.estimatedCost : item.estimatedCost)}
                          </button>
                        )}
                        {!item.paid ? (
                          <button type="button" className="ghost-btn sm" onClick={() => onLogItem(plan, item)}>
                            Log
                          </button>
                        ) : null}
                        <button type="button" className="capital-item-remove" onClick={() => void removeItem(plan, item.id)} aria-label="Remove item">
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))
                ) : (
                  <p className="panel-sub">No items yet.</p>
                )}
              </div>

              {itemDraftFor === plan.id ? (
                <div className="todo-add-row">
                  <input
                    className="text-in"
                    autoFocus
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Item name…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitAddItem(plan);
                      if (e.key === "Escape") setItemDraftFor(null);
                    }}
                  />
                  <input
                    className="text-in capital-item-cost-in"
                    type="text"
                    inputMode="decimal"
                    value={itemCost}
                    onChange={(e) => setItemCost(e.target.value)}
                    placeholder="0"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitAddItem(plan);
                    }}
                  />
                  <button className="primary-btn" type="button" disabled={!itemName.trim()} onClick={() => void submitAddItem(plan)}>
                    Add
                  </button>
                </div>
              ) : (
                <button type="button" className="ghost-btn full capital-add-item-btn" onClick={() => openAddItem(plan.id)}>
                  <Icon name="plus" size={14} /> Add Item
                </button>
              )}
            </div>
          );
        })}
      </div>

      {renderEditor()}
    </div>
  );
}
