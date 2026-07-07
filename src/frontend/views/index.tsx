import { useMemo, useState } from "react";
import { AreaTrend, Donut, MiniSpark, MoMBars } from "@/frontend/charts";
import {
  BudgetBar,
  CatDot,
  EmptyState,
  Icon,
  SummaryCard,
  TransactionRow,
} from "@/frontend/components/ui";
import {
  CAT_BY_ID,
  CATEGORIES,
  CURRENCY,
  CURRENT_DAY,
  CURRENT_MONTH_KEY,
  DEFAULT_INCOME,
  MONTHS,
  SUB_BY_ID,
  dayLabel,
  fmtMoney,
  fmtMoneyShort,
  monthLabel,
  weekdayLabel,
} from "@/frontend/lib/data";
import { catOf, isSavings, monthExpenses, monthStats } from "@/frontend/lib/stats";
import { getAccent } from "@/frontend/lib/theme";
import type { Budgets, Expense } from "@/frontend/lib/types";

export function Overview({ expenses, budgets, income, month, setView, onEdit }) {
  const accent = "var(--accent)";
  const st = useMemo(() => monthStats(expenses, budgets, income, month), [expenses, budgets, income, month]);
  const [hoverCat, setHoverCat] = useState(null);

  const donutData = CATEGORIES
    .map((c) => ({ id: c.id, label: c.name, value: st.byCat[c.id] || 0, color: c.color }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalAll = donutData.reduce((s, d) => s + d.value, 0);

  // cumulative daily spend (non-savings) for trend
  const [yy, mm] = month.split("-").map(Number);
  const days = new Date(yy, mm, 0).getDate();
  const todayCap = month === CURRENT_MONTH_KEY ? CURRENT_DAY : days;
  const cum = [];
  let run = 0;
  for (let d = 1; d <= todayCap; d++) {
    const dayKey = `${month}-${String(d).padStart(2, "0")}`;
    run += st.list.filter((e) => e.date === dayKey && !isSavings(e)).reduce((s, e) => s + e.amount, 0);
    cum.push({ x: String(d), v: Math.round(run) });
  }

  const recent = st.list.slice(0, 6);
  const spentPct = st.totalBudget ? st.spent / st.totalBudget : 0;
  const activeCat = hoverCat;

  return (
    <div className="view">
      <div className="summary-grid">
        <SummaryCard label="Income" value={fmtMoney(income, { cents: false })} sub={monthLabel(month, true)} />
        <SummaryCard label="Spent" tone="spent" value={fmtMoney(st.spent, { cents: false })}
          sub={`${Math.round(spentPct * 100)}% of budget`} />
        <SummaryCard label="Saved" tone="saved" value={fmtMoney(st.saved, { cents: false })}
          sub={income ? `${Math.round((st.saved / income) * 100)}% of income` : ""} />
        <SummaryCard label="Remaining" tone={st.remaining < 0 ? "danger" : "ok"}
          value={fmtMoney(st.remaining, { cents: false })} sub="after spend & savings" />
      </div>

      <div className="ov-grid">
        <section className="panel trend-panel">
          <div className="panel-head">
            <div>
              <h2>Spending this month</h2>
              <p className="panel-sub">Cumulative · dashed line is total budget {fmtMoneyShort(st.totalBudget)}</p>
            </div>
            <div className="trend-now">{fmtMoney(st.spent, { cents: false })}</div>
          </div>
          <AreaTrend points={cum.length ? cum : [{ x: "1", v: 0 }]} accent={getAccent()} height={210} budgetLine={st.totalBudget} />
        </section>

        <section className="panel donut-panel">
          <div className="panel-head"><h2>By category</h2></div>
          <div className="donut-wrap">
            <div className="donut-stage">
              <Donut data={donutData} size={188} thickness={26} onHover={setHoverCat} activeId={activeCat} />
              <div className="donut-center">
                <div className="dc-label">{activeCat ? CAT_BY_ID[activeCat].name : "Total"}</div>
                <div className="dc-value">{fmtMoney(activeCat ? (st.byCat[activeCat] || 0) : totalAll, { cents: false })}</div>
              </div>
            </div>
            <ul className="legend">
              {donutData.map((d) => (
                <li key={d.id} className={activeCat && activeCat !== d.id ? "dim" : ""}
                  onMouseEnter={() => setHoverCat(d.id)} onMouseLeave={() => setHoverCat(null)}>
                  <CatDot color={d.color} /> <span className="lg-name">{d.label}</span>
                  <span className="lg-pct">{Math.round((d.value / totalAll) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="ov-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Budget tracker</h2>
            <button className="link-btn" onClick={() => setView("budgets")}>Manage</button>
          </div>
          <div className="budget-list">
            {CATEGORIES.map((c) => (
              <BudgetBar key={c.id} cat={c} spent={st.byCat[c.id] || 0} budget={budgets[c.id]} onClick={() => setView("budgets")} />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Recent</h2>
            <button className="link-btn" onClick={() => setView("transactions")}>See all</button>
          </div>
          <div className="recent-list">
            {recent.length ? recent.map((e) => (
              <button key={e.id} className="recent-row" onClick={() => onEdit(e)}>
                <span className="rr-glyph" style={{ color: CAT_BY_ID[catOf(e.sub)].color, background: CAT_BY_ID[catOf(e.sub)].color + "1f" }}>{CAT_BY_ID[catOf(e.sub)].glyph}</span>
                <span className="rr-main">
                  <span className="rr-note">{e.note}</span>
                  <span className="rr-sub">{SUB_BY_ID[e.sub].name} · {dayLabel(e.date)}</span>
                </span>
                <span className="rr-amt">{fmtMoney(e.amount)}</span>
              </button>
            )) : <EmptyState title="No expenses yet" sub="Add your first one for this month." />}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Transactions ────────────────────────────────────────────────────
export function Transactions({ expenses, month, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  let list = monthExpenses(expenses, month);
  if (filter !== "all") list = list.filter((e) => catOf(e.sub) === filter);
  if (q.trim()) {
    const s = q.toLowerCase();
    list = list.filter((e) => e.note.toLowerCase().includes(s) || SUB_BY_ID[e.sub].name.toLowerCase().includes(s) || CAT_BY_ID[catOf(e.sub)].name.toLowerCase().includes(s));
  }
  const total = list.reduce((s, e) => s + e.amount, 0);
  // group by date
  const groups = {};
  list.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="view">
      <div className="txn-toolbar">
        <div className="search">
          <Icon name="search" size={17} />
          <input placeholder="Search notes & categories" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="txn-count">{list.length} entries · {fmtMoney(total, { cents: false })}</div>
      </div>
      <div className="filter-chips">
        <button className={"fchip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={"fchip" + (filter === c.id ? " active" : "")} onClick={() => setFilter(c.id)}>
            <CatDot color={c.color} size={8} /> {c.name}
          </button>
        ))}
      </div>

      <section className="panel txn-panel">
        {dates.length ? dates.map((d) => (
          <div key={d} className="txn-group">
            <div className="txn-group-head">
              <span>{dayLabel(d)} · {weekdayLabel(d)}</span>
              <span>{fmtMoney(groups[d].reduce((s, e) => s + e.amount, 0))}</span>
            </div>
            {groups[d].map((e) => <TransactionRow key={e.id} exp={e} onEdit={onEdit} onDelete={onDelete} />)}
          </div>
        )) : <EmptyState title="Nothing matches" sub="Try a different search or filter." />}
      </section>
    </div>
  );
}

// ── Budgets ─────────────────────────────────────────────────────────
export function Budgets({ expenses, budgets, setBudgets, income, month }) {
  const st = useMemo(() => monthStats(expenses, budgets, income, month), [expenses, budgets, income, month]);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState("");
  const totalBudget = st.totalBudget;
  const totalSpent = Object.values(st.byCat).reduce((s, v) => s + v, 0);

  const startEdit = (id) => { setEditId(id); setDraft(String(budgets[id])); };
  const commit = () => {
    const v = Math.max(0, Math.round(parseFloat(draft) || 0));
    setBudgets((b) => ({ ...b, [editId]: v }));
    setEditId(null);
  };

  return (
    <div className="view">
      <div className="summary-grid sg-3">
        <SummaryCard label="Total budget" value={fmtMoney(totalBudget, { cents: false })} sub="across all categories" />
        <SummaryCard label="Allocated so far" tone="spent" value={fmtMoney(totalSpent, { cents: false })} sub={`${Math.round((totalSpent / (totalBudget || 1)) * 100)}% used`} />
        <SummaryCard label="Left to spend" tone={totalBudget - totalSpent < 0 ? "danger" : "ok"} value={fmtMoney(totalBudget - totalSpent, { cents: false })} sub={monthLabel(month, true)} />
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Budget by category</h2><p className="panel-sub">Tap an amount to adjust</p></div>
        <div className="budget-edit-list">
          {CATEGORIES.map((c) => {
            const spent = st.byCat[c.id] || 0;
            const budget = budgets[c.id];
            const pct = budget ? spent / budget : 0;
            const over = pct > 1;
            return (
              <div key={c.id} className="bedit">
                <div className="be-top">
                  <div className="be-name"><CatDot color={c.color} /> {c.name}</div>
                  {editId === c.id ? (
                    <div className="be-edit">
                      <span className="be-cur">{CURRENCY.symbol}</span>
                      <input autoFocus type="number" value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditId(null); }} onBlur={commit} />
                    </div>
                  ) : (
                    <button className={"be-amt" + (over ? " over" : "")} onClick={() => startEdit(c.id)}>
                      {fmtMoney(spent, { cents: false })} <span className="br-of">/ {fmtMoney(budget, { cents: false })}</span>
                    </button>
                  )}
                </div>
                <div className="br-track tall">
                  <div className="br-fill" style={{ width: Math.min(pct, 1) * 100 + "%", background: over ? "var(--danger)" : c.color }} />
                </div>
                <div className="be-meta">
                  {over ? <span className="br-over-txt">Over budget by {fmtMoney(spent - budget, { cents: false })}</span>
                        : <span>{fmtMoney(budget - spent, { cents: false })} remaining · {Math.round(pct * 100)}% used</span>}
                  <span className="be-subs">{c.subs.map((s) => s.name).join(" · ")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Insights ────────────────────────────────────────────────────────
export function Insights({ expenses, budgets, income, month, setMonth }) {
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  const perMonth = MONTHS.map((mo) => {
    const list = monthExpenses(expenses, mo.key).filter((e) => !isSavings(e));
    return { key: mo.key, label: monthLabel(mo.key).split(" ")[0], spent: Math.round(list.reduce((s, e) => s + e.amount, 0)) };
  });
  const cur = monthStats(expenses, budgets, income, month);
  const idx = MONTHS.findIndex((m) => m.key === month);
  const prevKey = idx > 0 ? MONTHS[idx - 1].key : null;
  const prev = prevKey ? monthStats(expenses, budgets, income, prevKey) : null;

  const catRows = CATEGORIES.map((c) => {
    const now = cur.byCat[c.id] || 0;
    const was = prev ? (prev.byCat[c.id] || 0) : 0;
    const series = MONTHS.map((mo) => Math.round(monthExpenses(expenses, mo.key).filter((e) => catOf(e.sub) === c.id).reduce((s, e) => s + e.amount, 0)));
    const delta = was ? (now - was) / was : (now > 0 ? 1 : 0);
    return { c, now, was, delta, series };
  }).sort((a, b) => b.now - a.now);

  // top subcategories this month
  const subTotals = {};
  cur.list.forEach((e) => { subTotals[e.sub] = (subTotals[e.sub] || 0) + e.amount; });
  const topSubs = Object.entries(subTotals).map(([sub, v]) => ({ sub, v })).sort((a, b) => b.v - a.v).slice(0, 6);
  const maxSub = topSubs.length ? topSubs[0].v : 1;

  const avgSpent = Math.round(perMonth.reduce((s, m) => s + m.spent, 0) / perMonth.length);

  return (
    <div className="view">
      <div className="summary-grid sg-3">
        <SummaryCard label="This month" tone="spent" value={fmtMoney(cur.spent, { cents: false })} sub={monthLabel(month)} />
        <SummaryCard label="vs last month" tone={prev && cur.spent > prev.spent ? "danger" : "saved"}
          value={prev ? (cur.spent >= prev.spent ? "+" : "−") + fmtMoney(Math.abs(cur.spent - prev.spent), { cents: false }).replace(CURRENCY.symbol, CURRENCY.symbol) : "—"}
          sub={prev ? `${prev ? Math.round(Math.abs(cur.spent - prev.spent) / (prev.spent || 1) * 100) : 0}% ${cur.spent >= prev.spent ? "higher" : "lower"}` : "no prior data"} />
        <SummaryCard label="6-month average" value={fmtMoney(avgSpent, { cents: false })} sub="monthly spend" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Month over month</h2><p className="panel-sub">Total spend · dashed line is budget · tap a bar to view</p></div>
        </div>
        <MoMBars months={perMonth} accent={getAccent()} activeKey={month} onSelect={setMonth} budget={totalBudget} />
      </section>

      <div className="ov-grid">
        <section className="panel">
          <div className="panel-head"><h2>Category trends</h2><p className="panel-sub">vs previous month</p></div>
          <div className="cat-trend-list">
            {catRows.map(({ c, now, delta, series }) => (
              <div key={c.id} className="ctrow">
                <div className="ct-name"><CatDot color={c.color} /> {c.name}</div>
                <MiniSpark values={series} color={c.color} />
                <div className="ct-amt">{fmtMoney(now, { cents: false })}</div>
                <div className={"ct-delta " + (delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat")}>
                  {delta > 0.001 ? "▲" : delta < -0.001 ? "▼" : "—"} {Math.abs(Math.round(delta * 100))}%
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Top subcategories</h2><p className="panel-sub">{monthLabel(month, true)}</p></div>
          <div className="topsub-list">
            {topSubs.map(({ sub, v }) => {
              const s = SUB_BY_ID[sub]; const c = CAT_BY_ID[s.catId];
              return (
                <div key={sub} className="ts-row">
                  <div className="ts-head"><span>{s.name} <span className="ts-cat">· {c.name}</span></span><span className="ts-amt">{fmtMoney(v, { cents: false })}</span></div>
                  <div className="ts-track"><div className="ts-fill" style={{ width: (v / maxSub) * 100 + "%", background: c.color }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Recurring ───────────────────────────────────────────────────────
export function Recurring({ expenses, month, onEdit }) {
  const list = monthExpenses(expenses, month).filter((e) => e.recurring)
    .sort((a, b) => a.date < b.date ? -1 : 1);
  const total = list.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="view">
      <div className="summary-grid sg-2">
        <SummaryCard label="Recurring this month" value={fmtMoney(total, { cents: false })} sub={`${list.length} subscriptions & bills`} />
        <SummaryCard label="Share of income" tone="spent" value={total ? Math.round(total / DEFAULT_INCOME * 100) + "%" : "0%"} sub="fixed commitments" />
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Fixed & recurring</h2><p className="panel-sub">Charged automatically each month</p></div>
        <div className="rec-list">
          {list.length ? list.map((e) => {
            const s = SUB_BY_ID[e.sub]; const c = CAT_BY_ID[s.catId];
            return (
              <button key={e.id} className="rec-row" onClick={() => onEdit(e)}>
                <span className="rec-glyph" style={{ color: c.color, background: c.color + "1f" }}>{c.glyph}</span>
                <span className="rec-main"><span className="rec-note">{e.note}</span><span className="rec-sub">{c.name} · {s.name}</span></span>
                <span className="rec-day"><span className="rec-day-n">{new Date(e.date + "T00:00:00").getDate()}</span><span className="rec-day-l">{monthLabel(month)}</span></span>
                <span className="rec-amt">{fmtMoney(e.amount)}</span>
              </button>
            );
          }) : <EmptyState title="No recurring items" sub="Mark an expense as recurring when adding it." />}
        </div>
      </section>
    </div>
  );
}

