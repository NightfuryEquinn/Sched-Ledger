import { Brand } from "@/frontend/components/Brand";
import { DatePicker } from "@/frontend/components/DateTimePicker";
import {
  CURRENT_MONTH_KEY,
  MAX_MONTH_KEY,
  MIN_MONTH_KEY,
  TODAY_ISO,
  clampMonthKey,
  fmtBudgetLimit,
  fmtMoney,
  getCurrency,
  isBudgetSet,
  monthLabel,
  monthRangeBounds,
  pad,
  weekdayLabel
} from "@/frontend/lib/data";
import { preventNegativeKeys, preventWheelChange, stripNegativeInput } from "@/frontend/lib/number-input";
import { isRecurring, normalizeRecurring, recurringLabel } from "@/frontend/lib/stats";
import type { FinancialWallet, RecurringInterval } from "@/frontend/lib/types";
import { displayGlyph } from "@/lib/glyphs";
import type { DeleteScope } from "@/lib/delete-scope";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Shared UI primitives
 * ────────────────────
 *   Icon, CatGlyph, glyphTint  — visual atoms
 *   Sidebar, MonthSwitcher   — navigation
 *   SummaryCard, BudgetBar, TransactionRow — data display
 *   Segmented, EmptyState    — controls & placeholders
 *   AddExpenseModal          — add / edit transaction
 *   DeleteScopeDialog        — recurring delete scope chooser
 */

export type DeleteExpenseOpts = { scope?: DeleteScope; fromDate?: string };

const DELETE_SCOPE_OPTIONS: { v: DeleteScope; label: string; note: string }[] = [
  { v: "this", label: "This Only", note: "Remove just this occurrence." },
  { v: "future", label: "All Futures Only", note: "Remove this and every later occurrence." },
  { v: "all", label: "Both Past and Future", note: "Remove the entire series." },
];

/** Confirm which recurring occurrences to delete. */
function DeleteScopeDialog({
  title = "Delete recurring",
  onConfirm,
  onCancel,
}: {
  title?: string;
  onConfirm: (scope: DeleteScope) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<DeleteScope>("this");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onCancel]);

  /** Confirm the selected delete scope. */
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(scope);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="modal-scrim center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="delete-scope-title">
        <div className="modal-head">
          <h3 id="delete-scope-title">{title}</h3>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="Close" disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p className="dm-lead">Choose how much of this series to remove. This cannot be undone.</p>
          <div className="delete-scope-list" role="radiogroup" aria-label="Delete scope">
            {DELETE_SCOPE_OPTIONS.map((o) => (
              <label key={o.v} className={"delete-scope-option" + (scope === o.v ? " active" : "")}>
                <input
                  type="radio"
                  name="delete-scope"
                  value={o.v}
                  checked={scope === o.v}
                  onChange={() => setScope(o.v)}
                />
                <span className="delete-scope-copy">
                  <span className="delete-scope-label">{o.label}</span>
                  <span className="delete-scope-note">{o.note}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="ghost-btn danger" type="button" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Inline style for a category glyph badge: colored icon on a translucent
 * tint of the same color. Category colors are user data, so this is the
 * one sanctioned use of inline styles in the app.
 */
function glyphTint(color: string) {
  return { color, background: color + "1f" };
}

// ── Icon: minimal line icons (simple geometry only) ─────────────────
function Icon({ name, size = 20 }) {
  const s = { width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.2" /><circle cx="3.5" cy="12" r="1.2" /><circle cx="3.5" cy="18" r="1.2" /></>,
    budget: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    insights: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    recurring: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="M6 6l12 12M18 6L6 18" /></>,
    chevL: <path d="M15 6l-6 6 6 6" />,
    chevR: <path d="M9 6l6 6-6 6" />,
    edit: <><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" /></>,
    trash: <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    repeat: <><path d="M17 2l3 3-3 3" /><path d="M20 5H8a4 4 0 0 0-4 4v1" /><path d="M7 22l-3-3 3-3" /><path d="M4 19h12a4 4 0 0 0 4-4v-1" /></>,
    shield: <><path d="M12 3l7 3v5.5c0 4.4-3 7.6-7 8.5-4-.9-7-4.1-7-8.5V6l7-3z" /><path d="M9 12l2 2 4-4.5" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16.5 5.5l2 2M14 8l2 2" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
    check: <path d="M5 13l4 4 10-11" />,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M21 10.5h-4a2 2 0 0 0 0 4h4" /></>,
    logout: <><path d="M15 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" /><path d="M10 12h9" /><path d="M16 9l3 3-3 3" /></>,
    chevD: <path d="M6 9l6 6 6-6" />,
    chevU: <path d="M6 15l6-6 6 6" />,
    download: <><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" /></>,
    database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10.5 19a1.6 1.6 0 0 0 3 0" /></>,
    comment: <><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5z" /></>,
    send: <><path d="M4 12l16-7-7 16-2.5-6.5L4 12z" /></>,
    checklist: <><path d="M9 6h11M9 12h11M9 18h6" /><path d="M5 6l1.5 1.5L8 5M5 12l1.5 1.5L8 11M5 18l1.5 1.5L8 17" /></>,
    tags: <><path d="M5 7.5a2.5 2.5 0 0 1 5 0v1.8l6.2 6.2a2 2 0 0 1 0 2.8l-1.5 1.5a2 2 0 0 1-2.8 0L6.3 13.1V7.5z" /><circle cx="7.5" cy="7.5" r="1.1" /></>,
    moon: <><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name]}</svg>;
}

// ── CatGlyph: category / type emoji marker ──────────────────────────
function CatGlyph({ glyph, id }) {
  return (
    <span className="cat-glyph-inline" aria-hidden>
      {displayGlyph(glyph, id)}
    </span>
  );
}

/** One entry per view: [id, label, icon]. Shared by Sidebar and bottom nav. */
export const NAV_ITEMS = [
  ["overview", "Overview", "overview"],
  ["todos", "TO-DO List", "checklist"],
  ["schedule", "Schedule", "calendar"],
  ["transactions", "Transactions", "list"],
  ["budgets", "Budgets", "budget"],
  ["categories", "Categories", "tags"],
  ["recurring", "Recurring", "recurring"],
  ["insights", "Insights", "insights"],
  ["transparency", "Transparency", "database"],
] as const;

// ── Sidebar (desktop navigation) ────────────────────────────────────
function Sidebar({ view, setView }) {
  const items = NAV_ITEMS;
  return (
    <aside className="sidebar">
      <Brand variant="sidebar" />
      <nav className="nav">
        {items.map(([id, label, icon]) => (
          <button key={id} data-tour={`tour-nav-${id}`} className={"nav-item" + (view === id ? " active" : "")} onClick={() => setView(id)}>
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── MonthSwitcher: prev / label picker / next ─────────────────────
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthSwitcher({ months, current, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<Record<string, string | number>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pickY, setPickY] = useState(() => Number(current.split("-")[0]));
  const { minY, maxY } = monthRangeBounds();

  useEffect(() => {
    const [y] = current.split("-").map(Number);
    setPickY(y);
  }, [current]);

  const idx = months.findIndex((m) => m.key === current);
  const go = (d: number) => { const n = idx + d; if (n >= 0 && n < months.length) onChange(months[n].key); };

  const placeMenu = () => {
    const el = labelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = 280;
    let left = r.left + r.width / 2 - menuW / 2;
    if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
    if (left < 12) left = 12;
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 8,
      left,
      width: menuW,
      zIndex: 60,
    });
  };

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const close = () => setOpen(false);
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  const pickMonth = (month: number) => {
    onChange(clampMonthKey(`${pickY}-${pad(month)}`));
    setOpen(false);
  };

  const goYear = (delta: number) => {
    const nextY = pickY + delta;
    if (nextY < minY || nextY > maxY) return;
    setPickY(nextY);
  };

  const canPrevYear = pickY > minY;
  const canNextYear = pickY < maxY;

  const picker = open ? (
    <div ref={menuRef} className="month-pick-menu" style={menuStyle} role="dialog" aria-modal="true">
      <div className="picker-cal-head">
        <button type="button" className="picker-nav-btn" disabled={!canPrevYear} onClick={() => goYear(-1)} aria-label="Previous year">
          <Icon name="chevL" size={16} />
        </button>
        <span className="picker-cal-title">{pickY}</span>
        <button type="button" className="picker-nav-btn" disabled={!canNextYear} onClick={() => goYear(1)} aria-label="Next year">
          <Icon name="chevR" size={16} />
        </button>
      </div>
      <div className="month-pick-grid">
        {MONTH_SHORT.map((label, i) => {
          const month = i + 1;
          const key = `${pickY}-${pad(month)}`;
          const enabled = key >= MIN_MONTH_KEY && key <= MAX_MONTH_KEY;
          const active = key === current;
          const today = key === CURRENT_MONTH_KEY;
          return (
            <button
              key={label}
              type="button"
              className={"month-pick-cell" + (active ? " active" : "") + (today && !active ? " today" : "")}
              disabled={!enabled}
              onClick={() => pickMonth(month)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="month-switch" data-tour="tour-month" ref={rootRef}>
      <button className="msbtn" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevL" size={18} /></button>
      <button
        ref={labelRef}
        className="ms-label-btn"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="calendar" size={15} />
        <span>{monthLabel(current, true)}</span>
        <Icon name="chevD" size={14} />
      </button>
      <button className="msbtn" disabled={idx >= months.length - 1} onClick={() => go(1)} aria-label="Next month"><Icon name="chevR" size={18} /></button>
      {picker ? createPortal(picker, document.body) : null}
    </div>
  );
}

// ── SummaryCard: labeled stat with optional tone accent ─────────────
function SummaryCard({ label, value, sub, tone, foot }) {
  return (
    <div className={"summary-card" + (tone ? " tone-" + tone : "")}>
      <div className="sc-label">{label}</div>
      <div className="sc-value">{value}</div>
      {sub ? <div className="sc-sub">{sub}</div> : null}
      {foot ? <div className="sc-foot">{foot}</div> : null}
    </div>
  );
}

// ── BudgetBar: spent-vs-budget progress row ─────────────────────────
function BudgetBar({ cat, spent, budget, onClick, currency }) {
  const budgetSet = isBudgetSet(budget);
  const pct = budgetSet ? spent / budget : 0;
  const over = budgetSet && pct > 1;
  const w = Math.min(pct, 1) * 100;
  return (
    <button className="budget-row" onClick={onClick}>
      <div className="br-head">
        <div className="br-name"><CatGlyph glyph={cat.glyph} id={cat.id} /> {cat.name}</div>
        <div className={"br-amt" + (over ? " over" : "")}>
          {fmtMoney(spent, { cents: false, currency })} <span className="br-of">/ {fmtBudgetLimit(budget, { currency })}</span>
        </div>
      </div>
      <div className="br-track">
        <div className="br-fill" style={{ width: w + "%", background: over ? "var(--danger)" : cat.color }} />
        {over ? <div className="br-overmark" /> : null}
      </div>
      <div className="br-meta">
        {!budgetSet ? <span>Unset</span>
          : over
            ? <span className="br-over-txt">Over by {fmtMoney(spent - budget, { cents: false, currency })}</span>
            : <span>{fmtMoney(budget - spent, { cents: false, currency })} left · {Math.round(pct * 100)}%</span>}
      </div>
    </button>
  );
}

// ── TransactionRow: single expense/income line item ─────────────────
function TransactionRow({ exp, onEdit, onDelete, currency, walletName, categoryIndex }) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const sub = categoryIndex.subById[exp.sub];
  const cat = sub ? categoryIndex.catById[sub.catId] : null;
  if (!sub || !cat) return null;

  /** Start delete — ask for scope when the row is recurring. */
  const requestDelete = () => {
    if (isRecurring(exp)) {
      setScopeOpen(true);
      return;
    }
    onDelete(exp.id);
  };

  return (
    <div className="txn">
      <div className="txn-date">
        <div className="txn-day">{new Date(exp.date + "T00:00:00").getDate()}</div>
        <div className="txn-wd">{weekdayLabel(exp.date)}</div>
      </div>
      <div className="txn-glyph" style={glyphTint(cat.color)}>{displayGlyph(cat.glyph, cat.id)}</div>
      <div className="txn-main">
        <div className="txn-note">{exp.note}{isRecurring(exp) ? <span className="txn-rep" title={recurringLabel(exp.recurring)}><Icon name="repeat" size={13} /></span> : null}</div>
        <div className="txn-cat">{cat.name} · {sub.name}{walletName ? <span className="txn-wallet"> · {walletName}</span> : null}</div>
      </div>
      <div className={"txn-amt" + (exp.kind === "income" ? " income" : " expense")}>
        {exp.kind === "income" ? "+" : "−"}{fmtMoney(exp.amount, { currency })}
      </div>
      <div className="txn-actions">
        <button onClick={() => onEdit(exp)} aria-label="Edit"><Icon name="edit" size={16} /></button>
        <button onClick={requestDelete} aria-label="Delete"><Icon name="trash" size={16} /></button>
      </div>
      {scopeOpen ? (
        <DeleteScopeDialog
          title="Delete recurring transaction"
          onCancel={() => setScopeOpen(false)}
          onConfirm={async (scope) => {
            await onDelete(exp.id, { scope, fromDate: exp.date });
            setScopeOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Segmented: pill-style option switch ──────────────────────────────
function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={"seg-btn" + (value === o.v ? " active" : "")} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

// ── EmptyState: centered placeholder for empty lists ────────────────
function EmptyState({ title, sub }) {
  return <div className="empty"><div className="empty-mark">◌</div><div className="empty-title">{title}</div>{sub ? <div className="empty-sub">{sub}</div> : null}</div>;
}

type WalletPickerProps = {
  wallets: FinancialWallet[];
  value: string;
  onChange: (id: string) => void;
  onManage?: () => void;
  className?: string;
};

function WalletPicker({ wallets, value, onChange, onManage, className }: WalletPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<Record<string, string | number>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = wallets.find((w) => w.id === value) ?? wallets[0];

  const placeMenu = () => {
    const chip = chipRef.current;
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 8,
      left: r.left,
      right: "auto",
      minWidth: Math.max(r.width, 220),
      zIndex: 60,
    });
  };

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const close = () => setOpen(false);
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  if (!selected) return null;

  const menu = open ? (
    <div ref={menuRef} className="wallet-menu" style={menuStyle}>
      {wallets.map((w) => {
        const cur = getCurrency(w.currency);
        return (
          <button
            key={w.id}
            type="button"
            className={"wallet-menu-item" + (w.id === selected.id ? " active" : "")}
            onClick={() => { onChange(w.id); setOpen(false); }}
          >
            <span className="wmi-name">{w.name}</span>
            <span className="wmi-cur num">{cur.code} · {cur.symbol}</span>
          </button>
        );
      })}
      {onManage ? (
        <>
          <div className="am-div" />
          <button type="button" className="wallet-menu-item manage" onClick={() => { onManage(); setOpen(false); }}>
            <Icon name="edit" size={15} /> Manage wallets
          </button>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={"wallet-switch" + (className ? ` ${className}` : "")} data-tour="tour-wallet" ref={rootRef}>
      <button
        ref={chipRef}
        className="wallet-chip"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="wallet" size={16} />
        <span className="wallet-chip-name">{selected.name}</span>
        <span className="wallet-chip-cur num">{selected.currency}</span>
        <Icon name="chevD" size={14} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

// ── Add / edit expense modal ────────────────────────────────────────
function AddExpenseModal({ initial, defaultMonth, wallets, defaultWalletId, categoryIndex, onSave, onClose, onDelete }) {
  const editing = !!(initial && initial.id);
  const initKind = initial?.kind ?? "expense";
  const { expenseCategories, incomeCategory, subById, catById } = categoryIndex;
  const firstSub = (catId) => catById[catId]?.subs[0]?.id ?? catId;
  const initCat = initial && subById[initial.sub] ? subById[initial.sub].catId : "food";
  const [kind, setKind] = useState(initKind);
  const [walletId, setWalletId] = useState(initial?.walletId ?? defaultWalletId);
  const [catId, setCatId] = useState(initKind === "income" ? "income" : initCat);
  const [sub, setSub] = useState(initial ? initial.sub : firstSub("food"));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial ? initial.date : TODAY_ISO);
  const [note, setNote] = useState(initial ? initial.note : "");
  const initRecurring = normalizeRecurring(initial?.recurring);
  const [recurringOn, setRecurringOn] = useState(initRecurring !== false);
  const [recurringFreq, setRecurringFreq] = useState<RecurringInterval>(
    initRecurring !== false ? initRecurring : "monthly",
  );
  const [scopeOpen, setScopeOpen] = useState(false);
  const selectedWallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
  const cur = getCurrency(selectedWallet?.currency);
  const visibleCategories = kind === "income" ? [incomeCategory] : expenseCategories;
  const amtRef = useRef(null);

  useEffect(() => { if (amtRef.current) amtRef.current.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !scopeOpen) onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [scopeOpen]);

  const switchKind = (next) => {
    setKind(next);
    if (next === "income") {
      setCatId(incomeCategory.id);
      setSub(firstSub(incomeCategory.id));
    } else {
      const first = expenseCategories[0];
      setCatId(first?.id ?? "food");
      setSub(firstSub(first?.id ?? "food"));
    }
  };

  const chooseCat = (id) => { setCatId(id); setSub(firstSub(id)); };
  const valid = amount && parseFloat(amount) > 0 && date;
  const submit = () => {
    if (!valid || !walletId) return;
    onSave({
      id: initial && initial.id,
      walletId,
      kind,
      date,
      sub,
      amount: Math.round(parseFloat(amount) * 100) / 100,
      note: note.trim() || subById[sub]?.name || "Transaction",
      recurring: recurringOn ? recurringFreq : false,
    });
  };

  /** Start delete — ask for scope when editing a recurring transaction. */
  const requestDelete = () => {
    if (!initial?.id) return;
    if (isRecurring(initial)) {
      setScopeOpen(true);
      return;
    }
    onDelete(initial.id);
  };

  return (
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget && !scopeOpen) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{editing ? "Edit transaction" : "Add transaction"}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body modal-scroll">
          <label className="fld-label">Type</label>
          <Segmented
            options={[{ v: "expense", label: "Expense" }, { v: "income", label: "Income" }]}
            value={kind}
            onChange={switchKind}
          />

          {wallets.length > 1 ? (
            <div className="txn-wallet-field">
              <label className="fld-label">Wallet</label>
              <WalletPicker
                wallets={wallets}
                value={walletId}
                onChange={setWalletId}
                className="wallet-switch--block"
              />
            </div>
          ) : null}

          <div className={"amount-field" + (kind === "income" ? " amount-field--income" : "")}>
            <span className="amount-cur">{kind === "income" ? "+" : ""}{cur.symbol}</span>
            <input
              ref={amtRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(stripNegativeInput(e.target.value))}
              onKeyDown={(e) => {
                preventNegativeKeys(e);
                if (e.key === "Enter") submit();
              }}
              onWheel={preventWheelChange}
            />
          </div>

          <label className="fld-label">{kind === "income" ? "Source" : "Category"}</label>
          <div className="cat-grid">
            {visibleCategories.map((c) => (
              <button key={c.id} type="button" className={"cat-chip" + (catId === c.id ? " active" : "")}
                style={catId === c.id ? { borderColor: c.color, background: c.color + "16" } : null}
                onClick={() => chooseCat(c.id)}>
                <span className="cc-glyph" style={{ color: c.color }}>{displayGlyph(c.glyph, c.id)}</span>
                <span className="cc-label">{c.name}</span>
              </button>
            ))}
          </div>

          <label className="fld-label">Subcategory</label>
          <div className="sub-row">
            {catById[catId]?.subs.map((s) => (
              <button key={s.id} type="button" className={"sub-chip" + (sub === s.id ? " active" : "")} onClick={() => setSub(s.id)}>{s.name}</button>
            ))}
          </div>

          <div className="fld-2col">
            <div>
              <label className="fld-label">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <label className="fld-label">Note</label>
              <input className="text-in" type="text" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <label className="toggle-line tight">
            <input
              type="checkbox"
              checked={recurringOn}
              onChange={(e) => setRecurringOn(e.target.checked)}
            />
            <span className="toggle-ui" /> <span>Recurring</span>
          </label>
          {recurringOn ? (
            <div className="wallet-seg">
              <Segmented
                options={[
                  { v: "monthly", label: "Monthly" },
                  { v: "quarterly", label: "Quarterly" },
                  { v: "yearly", label: "Yearly" },
                ]}
                value={recurringFreq}
                onChange={setRecurringFreq}
              />
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          {editing ? <button className="ghost-btn danger" type="button" onClick={requestDelete}>Delete</button> : <span />}
          <div className="mf-right">
            <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-btn" type="button" disabled={!valid} onClick={submit}>
              {editing ? "Save changes" : kind === "income" ? "Add income" : "Add expense"}
            </button>
          </div>
        </div>
      </div>
      {scopeOpen && initial?.id ? (
        <DeleteScopeDialog
          title="Delete recurring transaction"
          onCancel={() => setScopeOpen(false)}
          onConfirm={async (scope) => {
            await onDelete(initial.id, { scope, fromDate: initial.date });
            setScopeOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export {
  AddExpenseModal, BudgetBar, CatGlyph, DeleteScopeDialog, EmptyState, Icon, MonthSwitcher, Segmented, Sidebar, SummaryCard, TransactionRow, WalletPicker, glyphTint
};
