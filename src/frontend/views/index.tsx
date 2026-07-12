import { AreaTrend, Donut, MiniSpark, MoMBars } from "@/frontend/charts";
import { CurrencyPicker } from "@/frontend/components/CurrencyPicker";
import {
  BudgetBar,
  CatGlyph,
  EmptyState,
  Icon,
  Segmented,
  SummaryCard,
  TransactionRow,
  glyphTint,
} from "@/frontend/components/ui";
import {
  CURRENT_DAY,
  CURRENT_MONTH_KEY,
  MONTHS,
  dayLabel,
  fmtBudgetLimit,
  fmtMoney,
  fmtMoneyShort,
  getCurrency,
  isBudgetSet,
  monthLabel,
  monthsWindow,
  weekdayLabel,
} from "@/frontend/lib/data";
import { fetchFxRates, fxConvert, fxRateLabel } from "@/frontend/lib/fx";
import { preventNegativeKeys, preventWheelChange, stripNegativeInput } from "@/frontend/lib/number-input";
import {
  catOf,
  chartActiveKey,
  chartBudgetForPeriod,
  chartSelectionMonth,
  isIncome, isOutgoing, isSavings, monthExpenses, monthStats,
  recurringDueDay,
  recurringLabel,
  recurringMonthlyEquivalent,
  recurringScheduleKey,
  recurringSchedulesForMonth,
  spendingChartSeries,
  type ChartPeriod
} from "@/frontend/lib/stats";
import { getAccent } from "@/frontend/lib/theme";
import { displayGlyph } from "@/lib/glyphs";
import { useEffect, useMemo, useState } from "react";

export { Categories } from "./Categories";

/*
 * Ledger views
 * ────────────
 *   Overview     — summary cards, spend trend, donut, budgets, recent
 *   Transactions — searchable / filterable list grouped by date
 *   Budgets      — per-category budget editing
 *   Insights     — month-over-month and category trends
 *   Recurring    — fixed monthly commitments
 */

// ── Overview ────────────────────────────────────────────────────────
export function Overview({ expenses, budgets, wallet, month, currency, categoryIndex, setView, onEdit }) {
  const st = useMemo(
    () => monthStats(expenses, budgets, wallet, month, categoryIndex),
    [expenses, budgets, wallet, month, categoryIndex],
  );
  const [hoverCat, setHoverCat] = useState(null);

  const donutData = categoryIndex.expenseCategories
    .map((c) => ({
      id: c.id,
      label: c.name,
      value: st.byCat[c.id] || 0,
      color: c.color,
      glyph: displayGlyph(c.glyph, c.id),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalAll = donutData.reduce((s, d) => s + d.value, 0);

  const [yy, mm] = month.split("-").map(Number);
  const days = new Date(yy, mm, 0).getDate();
  const todayCap = month === CURRENT_MONTH_KEY ? CURRENT_DAY : days;
  const cum = [];
  let run = 0;
  for (let d = 1; d <= todayCap; d++) {
    const dayKey = `${month}-${String(d).padStart(2, "0")}`;
    run += st.list
      .filter((e) => e.date === dayKey && isOutgoing(e) && !isSavings(e, categoryIndex))
      .reduce((s, e) => s + e.amount, 0);
    cum.push({ x: String(d), v: Math.round(run) });
  }

  const recent = st.list.slice(0, 6);
  const spentPct = st.totalBudget ? st.spent / st.totalBudget : 0;
  const activeCat = hoverCat;
  const isStarting = wallet?.fundingMode === "starting";
  const poolLabel = isStarting ? "Balance" : "Income";
  const poolValue = isStarting ? st.balance : st.monthlyPool;
  const poolSub = isStarting
    ? `starting ${fmtMoney(wallet?.startingBalance ?? 0, { cents: false, currency })}`
    : st.earned
      ? `${fmtMoney(wallet?.income ?? 0, { cents: false, currency })} + ${fmtMoney(st.earned, { cents: false, currency })} earned`
      : monthLabel(month, true);

  return (
    <div className="view">
      <div className="summary-grid" data-tour="tour-overview-summary">
        <SummaryCard label={poolLabel} value={fmtMoney(poolValue, { cents: false, currency })} sub={poolSub} />
        <SummaryCard label="Spent" tone="spent" value={fmtMoney(st.spent, { cents: false, currency })}
          sub={`${Math.round(spentPct * 100)}% of budget`} />
        <SummaryCard label="Saved" tone="saved" value={fmtMoney(st.saved, { cents: false, currency })}
          sub={st.monthlyPool ? `${Math.round((st.saved / st.monthlyPool) * 100)}% of pool` : ""} />
        <SummaryCard label={isStarting ? "Available" : "Remaining"} tone={st.remaining < 0 ? "danger" : "ok"}
          value={fmtMoney(st.remaining, { cents: false, currency })} sub={isStarting ? "current wallet balance" : "after spend & savings"} />
      </div>

      <div className="ov-grid">
        <section className="panel trend-panel" data-tour="tour-overview-trend">
          <div className="panel-head">
            <div>
              <h2>Spending this month</h2>
              <p className="panel-sub">Cumulative · dashed line is total budget {fmtMoneyShort(st.totalBudget, currency)}</p>
            </div>
            <div className="trend-now">{fmtMoney(st.spent, { cents: false, currency })}</div>
          </div>
          <AreaTrend points={cum.length ? cum : [{ x: "1", v: 0 }]} accent={getAccent()} height={210} budgetLine={st.totalBudget} />
        </section>

        <section className="panel donut-panel" data-tour="tour-overview-donut">
          <div className="panel-head"><h2>By category</h2></div>
          <div className="donut-wrap">
            <div className="donut-stage">
              <Donut data={donutData} size={188} thickness={26} onHover={setHoverCat} activeId={activeCat} />
              <div className="donut-center">
                <div className="dc-label">{activeCat ? categoryIndex.catById[activeCat].name : "Total"}</div>
                <div className="dc-value">{fmtMoney(activeCat ? (st.byCat[activeCat] || 0) : totalAll, { cents: false, currency })}</div>
              </div>
            </div>
            <ul className="legend">
              {donutData.map((d) => (
                <li key={d.id} className={activeCat && activeCat !== d.id ? "dim" : ""}
                  onMouseEnter={() => setHoverCat(d.id)} onMouseLeave={() => setHoverCat(null)}>
                  <CatGlyph glyph={d.glyph} id={d.id} /> <span className="lg-name">{d.label}</span>
                  <span className="lg-pct">{Math.round((d.value / totalAll) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="ov-grid">
        <section className="panel" data-tour="tour-overview-budgets">
          <div className="panel-head">
            <h2>Budget tracker</h2>
            <button className="link-btn" onClick={() => setView("budgets")}>Manage</button>
          </div>
          <div className="budget-list">
            {categoryIndex.expenseCategories.map((c) => (
              <BudgetBar key={c.id} cat={c} spent={st.byCat[c.id] || 0} budget={budgets[c.id]} onClick={() => setView("budgets")} currency={currency} />
            ))}
          </div>
        </section>

        <section className="panel" data-tour="tour-overview-recent">
          <div className="panel-head">
            <h2>Recent</h2>
            <button className="link-btn" onClick={() => setView("transactions")}>See all</button>
          </div>
          <div className="recent-list">
            {recent.length ? recent.map((e) => {
              const cat = categoryIndex.catById[catOf(e.sub, categoryIndex)];
              return (
                <button key={e.id} className="recent-row" onClick={() => onEdit(e)}>
                  <span className="rr-glyph" style={glyphTint(cat.color)}>{displayGlyph(cat.glyph, cat.id)}</span>
                  <span className="rr-main">
                    <span className="rr-note">{e.note}</span>
                    <span className="rr-sub">{categoryIndex.subById[e.sub]?.name ?? e.sub} · {dayLabel(e.date)}</span>
                  </span>
                  <span className={"rr-amt" + (isIncome(e) ? " income" : " expense")}>
                    {isIncome(e) ? "+" : "−"}{fmtMoney(e.amount, { currency })}
                  </span>
                </button>
              );
            }) : <EmptyState title="No expenses yet" sub="Add your first one for this month." />}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Transactions ────────────────────────────────────────────────────
export function Transactions({ expenses, month, currency, categoryIndex, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  let list = monthExpenses(expenses, month);
  if (filter === "income") list = list.filter(isIncome);
  else if (filter !== "all") list = list.filter((e) => catOf(e.sub, categoryIndex) === filter);
  if (q.trim()) {
    const s = q.toLowerCase();
    list = list.filter((e) =>
      e.note.toLowerCase().includes(s) ||
      (categoryIndex.subById[e.sub]?.name ?? "").toLowerCase().includes(s) ||
      (categoryIndex.catById[catOf(e.sub, categoryIndex)]?.name ?? "").toLowerCase().includes(s),
    );
  }
  const netTotal = list.reduce((s, e) => s + (isIncome(e) ? e.amount : -e.amount), 0);
  // group by date
  const groups = {};
  list.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="view">
      <div className="txn-toolbar" data-tour="tour-txn-toolbar">
        <div className="search">
          <Icon name="search" size={17} />
          <input placeholder="Search notes & categories" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="txn-count">{list.length} entries · {netTotal >= 0 ? "+" : "−"}{fmtMoney(Math.abs(netTotal), { cents: false, currency })} net</div>
      </div>
      <div className="filter-chips" data-tour="tour-txn-filters">
        <button className={"fchip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All</button>
        {[...categoryIndex.categories]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((c) => {
            const key = c.type === "income" ? "income" : c.id;
            return (
              <button key={c.id} className={"fchip" + (filter === key ? " active" : "")} onClick={() => setFilter(key)}>
                <CatGlyph glyph={c.glyph} id={c.id} /> {c.name}
              </button>
            );
          })}
      </div>

      <section key={filter + ":" + q} className="panel txn-panel txn-panel--filter" data-tour="tour-txn-list">
        {dates.length ? dates.map((d) => (
          <div key={d} className="txn-group">
            <div className="txn-group-head">
              <span>{dayLabel(d)} · {weekdayLabel(d)}</span>
              <span>{(() => {
                const dayNet = groups[d].reduce((s, e) => s + (isIncome(e) ? e.amount : -e.amount), 0);
                return (dayNet >= 0 ? "+" : "−") + fmtMoney(Math.abs(dayNet), { currency });
              })()}</span>
            </div>
            {groups[d].map((e) => (
              <TransactionRow
                key={e.id}
                exp={e}
                onEdit={onEdit}
                onDelete={onDelete}
                currency={currency}
                categoryIndex={categoryIndex}
              />
            ))}
          </div>
        )) : <EmptyState title="Nothing matches" sub="Try a different search or filter." />}
      </section>
    </div>
  );
}

// ── Budgets ─────────────────────────────────────────────────────────
export function Budgets({ expenses, budgets, setBudgets, wallet, month, currency, categoryIndex }) {
  const st = useMemo(
    () => monthStats(expenses, budgets, wallet, month, categoryIndex),
    [expenses, budgets, wallet, month, categoryIndex],
  );
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState("");
  const totalBudget = st.totalBudget;
  const totalSpent = Object.values(st.byCat).reduce((s, v) => s + v, 0);

  const startEdit = (id) => { setEditId(id); setDraft(isBudgetSet(budgets[id]) ? String(budgets[id]) : ""); };
  const commit = () => {
    const v = Math.max(0, Math.round(parseFloat(draft) || 0));
    setBudgets({ ...budgets, [editId]: v });
    setEditId(null);
  };

  return (
    <div className="view">
      <div className="summary-grid sg-3" data-tour="tour-budgets-summary">
        <SummaryCard label="Total budget" value={fmtMoney(totalBudget, { cents: false, currency })} sub="across all categories" />
        <SummaryCard label="Spent so far" tone="spent" value={fmtMoney(totalSpent, { cents: false, currency })} sub={`${Math.round((totalSpent / (totalBudget || 1)) * 100)}% used`} />
        <SummaryCard label="Left to spend" tone={totalBudget - totalSpent < 0 ? "danger" : "ok"} value={fmtMoney(totalBudget - totalSpent, { cents: false, currency })} sub={monthLabel(month, true)} />
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Budget by category</h2><p className="panel-sub">Tap an amount to allocate</p></div>
        <div className="budget-edit-list" data-tour="tour-budgets-list">
          {categoryIndex.expenseCategories.map((c) => {
            const spent = st.byCat[c.id] || 0;
            const budget = budgets[c.id];
            const budgetSet = isBudgetSet(budget);
            const pct = budgetSet ? spent / budget : 0;
            const over = pct > 1;
            return (
              <div key={c.id} className="bedit">
                <div className="be-top">
                  <div className="be-name"><CatGlyph glyph={c.glyph} id={c.id} /> {c.name}</div>
                  {editId === c.id ? (
                    <div className="be-edit">
                      <span className="be-cur">{getCurrency(currency).symbol}</span>
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="1"
                        value={draft}
                        onChange={(e) => setDraft(stripNegativeInput(e.target.value))}
                        onKeyDown={(e) => {
                          preventNegativeKeys(e);
                          if (e.key === "Enter") commit();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        onWheel={preventWheelChange}
                        onBlur={commit}
                      />
                    </div>
                  ) : (
                    <button className={"be-amt" + (over ? " over" : "")} onClick={() => startEdit(c.id)}>
                      {fmtMoney(spent, { cents: false, currency })} <span className="br-of">/ {fmtBudgetLimit(budget, { currency })}</span>
                    </button>
                  )}
                </div>
                <div className="br-track tall">
                  <div className="br-fill" style={{ width: Math.min(pct, 1) * 100 + "%", background: over ? "var(--danger)" : c.color }} />
                </div>
                <div className="be-meta">
                  {!budgetSet ? <span>Unset</span>
                    : over ? <span className="br-over-txt">Over budget by {fmtMoney(spent - budget, { cents: false, currency })}</span>
                        : <span>{fmtMoney(budget - spent, { cents: false, currency })} remaining · {Math.round(pct * 100)}% used</span>}
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
export function Insights({ expenses, budgets, wallet, month, currency, categoryIndex, setMonth }) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("monthly");
  const [viewCurrency, setViewCurrency] = useState(currency);
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null);
  const [fxStatus, setFxStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fxError, setFxError] = useState("");

  useEffect(() => {
    setViewCurrency(currency);
  }, [currency]);

  useEffect(() => {
    let cancelled = false;
    setFxStatus("loading");
    setFxRates(null);
    setFxError("");
    fetchFxRates(currency)
      .then((fx) => {
        if (cancelled) return;
        setFxRates(fx.rates);
        setFxStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setFxRates({ [currency]: 1 });
        setFxStatus("error");
        setFxError(err instanceof Error ? err.message : "Could not load rates");
        setViewCurrency(currency);
      });
    return () => { cancelled = true; };
  }, [currency]);

  const canConvert =
    viewCurrency === currency ||
    (fxStatus === "ready" && typeof fxRates?.[viewCurrency] === "number");
  const displayCurrency = canConvert ? viewCurrency : currency;
  const money = (n: number) =>
    fmtMoney(Math.round(fxConvert(n, currency, displayCurrency, fxRates)), {
      cents: false,
      currency: displayCurrency,
    });

  const spendingBudgets = Object.fromEntries(Object.entries(budgets).filter(([id]) => id !== "income"));
  const totalBudget = Object.values(spendingBudgets).reduce((s, v) => s + v, 0);
  const chartMonths = monthsWindow(month);
  const chartBars = useMemo(() => {
    return spendingChartSeries(chartPeriod, expenses, month, categoryIndex).map((bar) => ({
      ...bar,
      spent: Math.round(fxConvert(bar.spent, currency, displayCurrency, fxRates)),
    }));
  }, [chartPeriod, expenses, month, categoryIndex, currency, displayCurrency, fxRates]);
  const chartBudget = useMemo(
    () => Math.round(fxConvert(chartBudgetForPeriod(chartPeriod, totalBudget, month), currency, displayCurrency, fxRates)),
    [chartPeriod, totalBudget, month, currency, displayCurrency, fxRates],
  );
  const activeChartKey = chartActiveKey(chartPeriod, month);
  const perMonth = chartMonths.map((mo) => {
    const list = monthExpenses(expenses, mo.key).filter((e) => isOutgoing(e) && !isSavings(e, categoryIndex));
    return { key: mo.key, label: monthLabel(mo.key).split(" ")[0], spent: Math.round(list.reduce((s, e) => s + e.amount, 0)) };
  });
  const cur = monthStats(expenses, budgets, wallet, month, categoryIndex);
  const idx = MONTHS.findIndex((m) => m.key === month);
  const prevKey = idx > 0 ? MONTHS[idx - 1].key : null;
  const prev = prevKey ? monthStats(expenses, budgets, wallet, prevKey, categoryIndex) : null;

  const catRows = categoryIndex.expenseCategories.map((c) => {
    const now = cur.byCat[c.id] || 0;
    const was = prev ? (prev.byCat[c.id] || 0) : 0;
    const series = chartMonths.map((mo) =>
      Math.round(
        fxConvert(
          monthExpenses(expenses, mo.key)
            .filter((e) => isOutgoing(e) && catOf(e.sub, categoryIndex) === c.id)
            .reduce((s, e) => s + e.amount, 0),
          currency,
          displayCurrency,
          fxRates,
        ),
      ),
    );
    const delta = was ? (now - was) / was : now > 0 ? 1 : 0;
    return { c, now, was, delta, series };
  }).sort((a, b) => b.now - a.now);

  // top subcategories this month
  const subTotals = {};
  cur.list.filter(isOutgoing).forEach((e) => { subTotals[e.sub] = (subTotals[e.sub] || 0) + e.amount; });
  const topSubs = Object.entries(subTotals).map(([sub, v]) => ({ sub, v })).sort((a, b) => b.v - a.v).slice(0, 6);
  const maxSub = topSubs.length ? topSubs[0].v : 1;

  const avgSpent = Math.round(perMonth.reduce((s, m) => s + m.spent, 0) / perMonth.length);
  const rateLine = fxRateLabel(currency, displayCurrency, fxRates);
  const fxNote =
    fxStatus === "loading"
      ? "Fetching live rates…"
      : fxStatus === "error"
        ? fxError || "Rate unavailable — showing wallet currency"
        : displayCurrency !== currency && rateLine
          ? `View only · ${rateLine}`
          : "Wallet currency";

  const chartSub =
    chartPeriod === "daily"
      ? `Daily spend in ${monthLabel(month, true)} · dashed line is daily budget`
      : chartPeriod === "quarterly"
        ? "Total spend by quarter · dashed line is quarterly budget · tap a bar to view"
        : chartPeriod === "yearly"
          ? "Total spend by year · dashed line is yearly budget · tap a bar to view"
          : "Total spend · dashed line is budget · tap a bar to view";

  return (
    <div className="view">
      <div className="insights-fx" data-tour="tour-insights-fx">
        <div className="insights-fx-main">
          <label className="fld-label" htmlFor="insights-currency">View in</label>
          <CurrencyPicker
            id="insights-currency"
            className="insights-fx-select"
            value={viewCurrency}
            onChange={setViewCurrency}
            badgeFor={(code) => (code === currency ? "wallet" : null)}
          />
        </div>
        <p className={"insights-fx-note" + (fxStatus === "error" ? " is-error" : "")}>{fxNote}</p>
      </div>

      <div className="summary-grid sg-3">
        <SummaryCard label="This month" tone="spent" value={money(cur.spent)} sub={monthLabel(month)} />
        <SummaryCard label="vs last month" tone={prev && cur.spent > prev.spent ? "danger" : "saved"}
          value={prev ? (cur.spent >= prev.spent ? "+" : "−") + money(Math.abs(cur.spent - prev.spent)) : "—"}
          sub={prev ? `${Math.round(Math.abs(cur.spent - prev.spent) / (prev.spent || 1) * 100)}% ${cur.spent >= prev.spent ? "higher" : "lower"}` : "no prior data"} />
        <SummaryCard label="6-month average" value={money(avgSpent)} sub="monthly spend" />
      </div>

      <section className="panel" data-tour="tour-insights-chart">
        <div className="panel-head insights-chart-head">
          <div>
            <h2>Month over month</h2>
            <p className="panel-sub">{chartSub}</p>
          </div>
          <Segmented
            options={[
              { v: "daily", label: "Daily" },
              { v: "monthly", label: "Monthly" },
              { v: "quarterly", label: "Quarterly" },
              { v: "yearly", label: "Yearly" },
            ]}
            value={chartPeriod}
            onChange={setChartPeriod}
          />
        </div>
        <MoMBars
          months={chartBars}
          accent={getAccent()}
          activeKey={activeChartKey}
          onSelect={(key) => setMonth(chartSelectionMonth(chartPeriod, key))}
          budget={chartBudget}
        />
      </section>

      <div className="ov-grid" data-tour="tour-insights-trends">
        <section className="panel">
          <div className="panel-head"><h2>Category trends</h2><p className="panel-sub">vs previous month</p></div>
          <div className="cat-trend-list">
            {catRows.map(({ c, now, delta, series }) => (
              <div key={c.id} className="ctrow">
                <div className="ct-name"><CatGlyph glyph={c.glyph} id={c.id} /> {c.name}</div>
                <MiniSpark values={series} color={c.color} />
                <div className="ct-amt">{money(now)}</div>
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
              const s = categoryIndex.subById[sub];
              const c = s ? categoryIndex.catById[s.catId] : null;
              if (!s || !c) return null;
              return (
                <div key={sub} className="ts-row">
                  <div className="ts-head"><span>{s.name} <span className="ts-cat">· {c.name}</span></span><span className="ts-amt">{money(v)}</span></div>
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
export function Recurring({ expenses, month, currency, categoryIndex, onEdit }) {
  const list = recurringSchedulesForMonth(expenses, month);
  const total = list.reduce((s, e) => s + e.amount, 0);
  const monthlyEq = Math.round(list.reduce((s, e) => s + recurringMonthlyEquivalent(e.amount, e.recurring), 0));
  return (
    <div className="view">
      <div className="summary-grid sg-2" data-tour="tour-recurring-summary">
        <SummaryCard label="Recurring this month" value={fmtMoney(total, { cents: false, currency })} sub={`${list.length} scheduled ${list.length === 1 ? "charge" : "charges"}`} />
        <SummaryCard label="Monthly equivalent" tone="spent" value={fmtMoney(monthlyEq, { cents: false, currency })} sub="normalized across intervals" />
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Fixed & recurring</h2><p className="panel-sub">Auto-posted on due dates from your last amount</p></div>
        <div className="rec-list" data-tour="tour-recurring-list">
          {list.length ? list.map((e) => {
            const s = categoryIndex.subById[e.sub];
            const c = s ? categoryIndex.catById[s.catId] : null;
            if (!s || !c) return null;
            const dueDay = recurringDueDay(e, month);
            const scheduleKey = recurringScheduleKey(e);
            return (
              <button key={scheduleKey} className="rec-row" onClick={() => onEdit(e)}>
                <span className="rec-glyph" style={glyphTint(c.color)}>{displayGlyph(c.glyph, c.id)}</span>
                <span className="rec-main">
                  <span className="rec-note">{e.note}</span>
                  <span className="rec-sub">{c.name} · {s.name} · {recurringLabel(e.recurring)}</span>
                </span>
                <span className="rec-day">
                  <span className="rec-day-n">{dueDay}</span>
                  <span className="rec-day-l">{monthLabel(month)}</span>
                </span>
                <span className="rec-amt">{fmtMoney(e.amount, { currency })}</span>
              </button>
            );
          }) : <EmptyState title="No recurring items" sub="Mark an expense as recurring when adding it." />}
        </div>
      </section>
    </div>
  );
}

