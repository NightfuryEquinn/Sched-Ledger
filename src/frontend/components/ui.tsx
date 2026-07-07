import { useEffect, useRef, useState } from "react";
import {
  CAT_BY_ID,
  CATEGORIES,
  CURRENCY,
  SUB_BY_ID,
  fmtMoney,
  monthLabel,
  weekdayLabel,
} from "@/frontend/lib/data";
import type { Expense } from "@/frontend/lib/types";
import type { MonthEntry } from "@/frontend/lib/types";
import type { ViewId } from "@/frontend/lib/types";
import { Brand } from "@/frontend/components/Brand";

// Minimal line icons (simple geometry only)
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
    download: <><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" /></>,
    database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10.5 19a1.6 1.6 0 0 0 3 0" /></>,
    bellOff: <><path d="M9 5.4A6 6 0 0 1 18 9c0 3 .8 4.6 1.4 5.4M6 9c0 5-2 6-2 6h11" /><path d="M10.5 19a1.6 1.6 0 0 0 3 0" /><path d="M3 3l18 18" /></>,
    comment: <><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5z" /></>,
    send: <><path d="M4 12l16-7-7 16-2.5-6.5L4 12z" /></>,
    moon: <><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name]}</svg>;
}

function CatDot({ color, size = 9 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flex: "none" }} />;
}

// ── Sidebar (desktop) / bottom nav (mobile via CSS) ─────────────────
function Sidebar({ view, setView }) {
  const items = [
    ["overview", "Overview", "overview"],
    ["transactions", "Transactions", "list"],
    ["budgets", "Budgets", "budget"],
    ["schedule", "Schedule", "calendar"],
    ["insights", "Insights", "insights"],
    ["recurring", "Recurring", "recurring"],
  ];
  return (
    <aside className="sidebar">
      <Brand variant="sidebar" />
      <nav className="nav">
        {items.map(([id, label, icon]) => (
          <button key={id} className={"nav-item" + (view === id ? " active" : "")} onClick={() => setView(id)}>
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function MonthSwitcher({ months, current, onChange }) {
  const idx = months.findIndex((m) => m.key === current);
  const go = (d) => { const n = idx + d; if (n >= 0 && n < months.length) onChange(months[n].key); };
  return (
    <div className="month-switch">
      <button className="msbtn" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevL" size={18} /></button>
      <div className="ms-label">{monthLabel(current, true)}</div>
      <button className="msbtn" disabled={idx >= months.length - 1} onClick={() => go(1)} aria-label="Next month"><Icon name="chevR" size={18} /></button>
    </div>
  );
}

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

function BudgetBar({ cat, spent, budget, onClick }) {
  const pct = budget > 0 ? spent / budget : 0;
  const over = pct > 1;
  const w = Math.min(pct, 1) * 100;
  return (
    <button className="budget-row" onClick={onClick}>
      <div className="br-head">
        <div className="br-name"><CatDot color={cat.color} /> {cat.name}</div>
        <div className={"br-amt" + (over ? " over" : "")}>
          {fmtMoney(spent, { cents: false })} <span className="br-of">/ {fmtMoney(budget, { cents: false })}</span>
        </div>
      </div>
      <div className="br-track">
        <div className="br-fill" style={{ width: w + "%", background: over ? "var(--danger)" : cat.color }} />
        {over ? <div className="br-overmark" /> : null}
      </div>
      <div className="br-meta">
        {over
          ? <span className="br-over-txt">Over by {fmtMoney(spent - budget, { cents: false })}</span>
          : <span>{fmtMoney(budget - spent, { cents: false })} left · {Math.round(pct * 100)}%</span>}
      </div>
    </button>
  );
}

function TransactionRow({ exp, onEdit, onDelete }) {
  const sub = SUB_BY_ID[exp.sub];
  const cat = CAT_BY_ID[sub.catId];
  return (
    <div className="txn">
      <div className="txn-date">
        <div className="txn-day">{new Date(exp.date + "T00:00:00").getDate()}</div>
        <div className="txn-wd">{weekdayLabel(exp.date)}</div>
      </div>
      <div className="txn-glyph" style={{ color: cat.color, background: cat.color + "1f" }}>{cat.glyph}</div>
      <div className="txn-main">
        <div className="txn-note">{exp.note}{exp.recurring ? <span className="txn-rep" title="Recurring"><Icon name="repeat" size={13} /></span> : null}</div>
        <div className="txn-cat">{cat.name} · {sub.name}</div>
      </div>
      <div className="txn-amt">{fmtMoney(exp.amount)}</div>
      <div className="txn-actions">
        <button onClick={() => onEdit(exp)} aria-label="Edit"><Icon name="edit" size={16} /></button>
        <button onClick={() => onDelete(exp.id)} aria-label="Delete"><Icon name="trash" size={16} /></button>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={"seg-btn" + (value === o.v ? " active" : "")} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function EmptyState({ title, sub }) {
  return <div className="empty"><div className="empty-mark">◌</div><div className="empty-title">{title}</div>{sub ? <div className="empty-sub">{sub}</div> : null}</div>;
}

// ── Add / edit expense modal ────────────────────────────────────────
function AddExpenseModal({ initial, defaultMonth, onSave, onClose, onDelete }) {
  const editing = !!(initial && initial.id);
  const firstSub = (catId) => CAT_BY_ID[catId].subs[0].id;
  const initCat = initial ? SUB_BY_ID[initial.sub].catId : "food";
  const [catId, setCatId] = useState(initCat);
  const [sub, setSub] = useState(initial ? initial.sub : firstSub("food"));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial ? initial.date : defaultMonth + "-08");
  const [note, setNote] = useState(initial ? initial.note : "");
  const [recurring, setRecurring] = useState(initial ? !!initial.recurring : false);
  const amtRef = useRef(null);
  useEffect(() => { if (amtRef.current) amtRef.current.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const chooseCat = (id) => { setCatId(id); setSub(firstSub(id)); };
  const valid = amount && parseFloat(amount) > 0 && date;
  const submit = () => {
    if (!valid) return;
    onSave({ id: initial && initial.id, date, sub, amount: Math.round(parseFloat(amount) * 100) / 100, note: note.trim() || SUB_BY_ID[sub].name, recurring });
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{editing ? "Edit expense" : "Add expense"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>

        <div className="amount-field">
          <span className="amount-cur">{CURRENCY.symbol}</span>
          <input ref={amtRef} type="number" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>

        <label className="fld-label">Category</label>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={"cat-chip" + (catId === c.id ? " active" : "")}
              style={catId === c.id ? { borderColor: c.color, background: c.color + "16" } : null}
              onClick={() => chooseCat(c.id)}>
              <span className="cc-glyph" style={{ color: c.color }}>{c.glyph}</span>{c.name}
            </button>
          ))}
        </div>

        <label className="fld-label">Subcategory</label>
        <div className="sub-row">
          {CAT_BY_ID[catId].subs.map((s) => (
            <button key={s.id} className={"sub-chip" + (sub === s.id ? " active" : "")} onClick={() => setSub(s.id)}>{s.name}</button>
          ))}
        </div>

        <div className="fld-2col">
          <div>
            <label className="fld-label">Date</label>
            <input className="text-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="fld-label">Note</label>
            <input className="text-in" type="text" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <label className="toggle-line">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span className="toggle-ui" /> <span>Recurring monthly</span>
        </label>

        <div className="modal-foot">
          {editing ? <button className="ghost-btn danger" onClick={() => onDelete(initial.id)}>Delete</button> : <span />}
          <div className="mf-right">
            <button className="ghost-btn" onClick={onClose}>Cancel</button>
            <button className="primary-btn" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Add expense"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  Icon,
  CatDot,
  Sidebar,
  MonthSwitcher,
  SummaryCard,
  BudgetBar,
  TransactionRow,
  Segmented,
  EmptyState,
  AddExpenseModal,
};
