import { AreaTrend, Donut, MiniSpark, MoMBars } from "@/frontend/charts";
import { CurrencyPicker } from "@/frontend/components/CurrencyPicker";
import {
  CatGlyph,
  EmptyState,
  Icon,
  Segmented,
  SummaryCard,
  TransactionRow,
  glyphTint,
} from "@/frontend/components/ui";
import { isSavingsCategory, isSpendingCategory } from "@/frontend/lib/categories";
import {
  CURRENT_DAY,
  CURRENT_MONTH_KEY,
  MONTHS,
  dayLabel,
  eventCatMeta,
  eventTimeLabel,
  eventsForDay,
  fmtBudgetLimit,
  fmtMoney,
  fmtMoneyShort,
  getCurrency,
  isBudgetSet,
  monthLabel,
  monthsWindow,
  pad,
  weekdayLabel,
} from "@/frontend/lib/data";
import { fetchFxRates, fxConvert, fxRateLabel } from "@/frontend/lib/fx";
import { preventNegativeKeys, preventWheelChange, stripNegativeInput } from "@/frontend/lib/number-input";
import {
  assessSpendingHabit,
  type HabitPeriod,
} from "@/frontend/lib/spendingHabits";
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
import type { Budgets, CategoryIndex, Expense, FinancialWallet, LedgerEvent, TodoList, ViewId } from "@/frontend/lib/types";
import { displayGlyph } from "@/lib/glyphs";
import { useEffect, useMemo, useState } from "react";

export { Categories } from "./Categories";

/*
 * Ledger views
 * ────────────
 *   Overview     — summary cards, to-do & schedule, spend/earn trend, donut,
 *                  recent transactions
 *   Transactions — searchable / filterable list grouped by date
 *   Budgets      — per-category budget editing
 *   Insights     — month-over-month and category trends
 *   Recurring    — fixed monthly commitments
 */

/** Up to `limit` lists in API order (oldest first). */
function oldestTodoLists(todoLists: TodoList[], limit = 3) {
  return todoLists.slice(0, limit);
}

/** ISO date YYYY-MM-DD for a Date. */
function isoDateOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:MM clock string for a Date. */
function clockHm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Today's events that have not yet passed at `now`, earliest first, capped at `limit`.
 * Timed events before the current clock are omitted; all-day events stay for the whole day.
 */
function remainingTodayEvents(events: LedgerEvent[], now: Date, limit = 3) {
  const todayIso = isoDateOf(now);
  const nowHm = clockHm(now);

  return eventsForDay(events, todayIso)
    .filter((ev) => ev.allDay || (ev.time || "00:00") >= nowHm)
    .slice(0, limit);
}

type OverviewProps = {
  expenses: Expense[];
  budgets: Budgets;
  wallet: FinancialWallet | null | undefined;
  month: string;
  currency: string;
  categoryIndex: CategoryIndex;
  todoLists?: TodoList[];
  events?: LedgerEvent[];
  setView: (view: ViewId) => void;
  onEdit: (expense: Expense) => void;
  onEditEvent: (event: LedgerEvent) => void;
};

// ── Overview ────────────────────────────────────────────────────────
/** Home summary: spend, todos, today's schedule, trend, and recent transactions. */
export function Overview({
  expenses,
  budgets,
  wallet,
  month,
  currency,
  categoryIndex,
  todoLists = [],
  events = [],
  setView,
  onEdit,
  onEditEvent,
}: OverviewProps) {
  const [loadedAt] = useState(() => new Date());
  const st = useMemo(
    () => monthStats(expenses, budgets, wallet, month, categoryIndex),
    [expenses, budgets, wallet, month, categoryIndex],
  );
  const [hoverCat, setHoverCat] = useState(null);
  const recentTodos = useMemo(() => oldestTodoLists(todoLists, 3), [todoLists]);
  const todayEvents = useMemo(
    () => remainingTodayEvents(events, loadedAt, 3),
    [events, loadedAt],
  );

  const donutData = useMemo(
    () =>
      categoryIndex.spendingCategories
        .map((c) => ({
          id: c.id,
          label: c.name,
          value: st.byCat[c.id] || 0,
          color: c.color,
          glyph: displayGlyph(c.glyph, c.id),
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [categoryIndex.spendingCategories, st.byCat],
  );
  const totalAll = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData]);

  const [yy, mm] = month.split("-").map(Number);
  const days = new Date(yy, mm, 0).getDate();
  const todayCap = month === CURRENT_MONTH_KEY ? CURRENT_DAY : days;
  /** Cumulative spend and earnings per day of the selected month. */
  const { cum, earnCum } = useMemo(() => {
    const spentByDay = new Map<string, number>();
    const earnedByDay = new Map<string, number>();
    for (const e of st.list) {
      if (isIncome(e)) {
        earnedByDay.set(e.date, (earnedByDay.get(e.date) || 0) + e.amount);
        continue;
      }
      if (!isOutgoing(e) || isSavings(e, categoryIndex)) continue;
      spentByDay.set(e.date, (spentByDay.get(e.date) || 0) + e.amount);
    }
    const spentPoints: Array<{ x: string; v: number }> = [];
    const earnedPoints: Array<{ x: string; v: number }> = [];
    let spentRun = 0;
    let earnedRun = 0;
    for (let d = 1; d <= todayCap; d++) {
      const dayKey = `${month}-${pad(d)}`;
      spentRun += spentByDay.get(dayKey) || 0;
      earnedRun += earnedByDay.get(dayKey) || 0;
      spentPoints.push({ x: String(d), v: Math.round(spentRun) });
      earnedPoints.push({ x: String(d), v: Math.round(earnedRun) });
    }
    return { cum: spentPoints, earnCum: earnedPoints };
  }, [st.list, month, todayCap, categoryIndex]);

  const recent = st.list.slice(0, 3);
  const accent = getAccent();
  const spentPct = st.spendingBudget ? st.spent / st.spendingBudget : 0;
  const activeCat = hoverCat;
  const isStarting = wallet?.fundingMode === "starting";
  const poolLabel = isStarting ? "Balance" : "Income";
  const poolValue = isStarting ? st.balance : st.monthlyPool;
  const poolSub = isStarting
    ? `starting ${fmtMoney(wallet?.startingBalance ?? 0, { currency })}`
    : st.earned
      ? `${fmtMoney(wallet?.income ?? 0, { currency })} + ${fmtMoney(st.earned, { currency })} earned`
      : monthLabel(month, true);

  return (
    <div className="view">
      <div className="summary-grid" data-tour="tour-overview-summary">
        <SummaryCard label={poolLabel} value={fmtMoney(poolValue, { currency })} sub={poolSub} />
        <SummaryCard label="Spent" tone="spent" value={fmtMoney(st.spent, { currency })}
          sub={`${Math.round(spentPct * 100)}% of budget`} />
        <SummaryCard label="Saved" tone="saved" value={fmtMoney(st.saved, { currency })}
          sub={st.monthlyPool ? `${Math.round((st.saved / st.monthlyPool) * 100)}% of pool` : ""} />
        <SummaryCard label={isStarting ? "Available" : "Remaining"} tone={st.remaining < 0 ? "danger" : "ok"}
          value={fmtMoney(st.remaining, { currency })} sub={isStarting ? "current wallet balance" : "after spend & savings"} />
      </div>

      <div className="ov-grid">
        <section className="panel" data-tour="tour-overview-oldest-todo">
          <div className="panel-head">
            <h2>Recent To-Do</h2>
            <button className="link-btn" onClick={() => setView("todos")}>See All</button>
          </div>
          <div className="recent-list">
            {recentTodos.length ? recentTodos.map((list) => {
              const done = list.tasks.filter((t) => t.done).length;
              const total = list.tasks.length;

              return (
                <button
                  key={list.id}
                  type="button"
                  className="recent-row"
                  onClick={() => setView("todos")}
                >
                  <span className="rr-glyph" style={{ background: "var(--surface-3)" }}>
                    {list.icon}
                  </span>
                  <span className="rr-main">
                    <span className="rr-note">{list.name}</span>
                    <span className="rr-sub">
                      {total ? `${done}/${total} done` : "No Tasks Yet"}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <EmptyState title="No Lists Yet" sub="Create a to-do list to get started." />
            )}
          </div>
        </section>

        <section className="panel" data-tour="tour-overview-today-schedule">
          <div className="panel-head">
            <h2>Recent Schedule</h2>
            <button className="link-btn" onClick={() => setView("schedule")}>See All</button>
          </div>
          <div className="recent-list">
            {todayEvents.length ? todayEvents.map((ev) => {
              const cat = eventCatMeta(ev);

              return (
                <button
                  key={ev.id}
                  type="button"
                  className="recent-row"
                  onClick={() => (onEditEvent ? onEditEvent(ev) : setView("schedule"))}
                >
                  <span className="rr-glyph" style={glyphTint(cat.color)}>
                    {displayGlyph(cat.glyph, cat.id)}
                  </span>
                  <span className="rr-main">
                    <span className="rr-note">{ev.title}</span>
                    <span className="rr-sub">
                      {cat.name} · {eventTimeLabel(ev)}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <EmptyState title="Nothing Left Today" sub="No upcoming events for the rest of today." />
            )}
          </div>
        </section>
      </div>

      <section className="panel trend-panel" data-tour="tour-overview-trend">
        <div className="panel-head trend-head">
          <div>
            <h2>Spending & Earning this Month</h2>
            <p className="panel-sub">Cumulative · dashed line is total budget {fmtMoneyShort(st.totalBudget, currency)}</p>
          </div>
          <div className="trend-totals">
            <div className="trend-total">
              <span className="trend-key"><i className="trend-dot" style={{ background: accent }} /> Spending</span>
              <span className="trend-now">{fmtMoney(st.spent, { currency })}</span>
            </div>
            <div className="trend-total">
              <span className="trend-key"><i className="trend-dot trend-dot--earn" /> Earning</span>
              <span className="trend-now trend-now--earn">{fmtMoney(st.earned, { currency })}</span>
            </div>
          </div>
        </div>
        <AreaTrend
          points={cum.length ? cum : [{ x: "1", v: 0 }]}
          compare={earnCum.length ? earnCum : [{ x: "1", v: 0 }]}
          accent={accent}
          height={210}
          budgetLine={st.totalBudget}
        />
      </section>

      <div className="ov-grid ov-grid--charts">
        <section className="panel donut-panel" data-tour="tour-overview-donut">
          <div className="panel-head"><h2>By Category</h2></div>
          <div className="donut-wrap">
            <div className="donut-stage">
              <Donut data={donutData} size={188} thickness={26} onHover={setHoverCat} activeId={activeCat} />
              <div className="donut-center">
                <div className="dc-label">{activeCat ? categoryIndex.catById[activeCat].name : "Total"}</div>
                <div className="dc-value">{fmtMoney(activeCat ? (st.byCat[activeCat] || 0) : totalAll, { currency })}</div>
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

        <section className="panel" data-tour="tour-overview-recent">
          <div className="panel-head">
            <h2>Recent Transaction</h2>
            <button className="link-btn" onClick={() => setView("transactions")}>See All</button>
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
            }) : <EmptyState title="No Transactions Yet" sub="Add your first one for this month." />}
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

  const { list, netTotal, dates, groups } = useMemo(() => {
    let rows = monthExpenses(expenses, month);
    if (filter === "income") rows = rows.filter(isIncome);
    else if (filter !== "all") rows = rows.filter((e) => catOf(e.sub, categoryIndex) === filter);
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((e) =>
        e.note.toLowerCase().includes(s) ||
        (categoryIndex.subById[e.sub]?.name ?? "").toLowerCase().includes(s) ||
        (categoryIndex.catById[catOf(e.sub, categoryIndex)]?.name ?? "").toLowerCase().includes(s),
      );
    }
    const net = rows.reduce((s, e) => s + (isIncome(e) ? e.amount : -e.amount), 0);
    const byDate: Record<string, typeof rows> = {};
    rows.forEach((e) => {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });
    const sortedDates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

    return { list: rows, netTotal: net, dates: sortedDates, groups: byDate };
  }, [expenses, month, filter, q, categoryIndex]);

  const sortedCats = useMemo(
    () =>
      [...categoryIndex.categories].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [categoryIndex.categories],
  );

  return (
    <div className="view">
      <div className="txn-toolbar" data-tour="tour-txn-toolbar">
        <div className="search">
          <Icon name="search" size={17} />
          <input placeholder="Search notes & categories" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="txn-count">{list.length} entries · {netTotal >= 0 ? "+" : "−"}{fmtMoney(Math.abs(netTotal), { currency })} net</div>
      </div>
      <div className="filter-chips" data-tour="tour-txn-filters">
        <button className={"fchip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All</button>
        {sortedCats.map((c) => {
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
        )) : <EmptyState title="Nothing Matches" sub="Try a different search or filter." />}
      </section>
    </div>
  );
}

// ── Budgets ─────────────────────────────────────────────────────────
export function Budgets({ expenses, budgets, setBudgets, wallet, month, currency, categoryIndex, events = [] }) {
  const st = useMemo(
    () => monthStats(expenses, budgets, wallet, month, categoryIndex, events),
    [expenses, budgets, wallet, month, categoryIndex, events],
  );
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState("");
  const totalBudget = st.totalBudget;
  const totalSpent = st.spent;
  const totalHeld = st.totalHeld;
  const totalAvailable = totalBudget - totalSpent - st.saved - totalHeld;

  const startEdit = (id) => { setEditId(id); setDraft(isBudgetSet(budgets[id]) ? String(budgets[id]) : ""); };
  const commit = () => {
    const v = Math.max(0, Math.round(parseFloat(draft) || 0));
    setBudgets({ ...budgets, [editId]: v });
    setEditId(null);
  };

  return (
    <div className="view">
      <div className="summary-grid sg-5" data-tour="tour-budgets-summary">
        <SummaryCard label="Total Budget" value={fmtMoney(totalBudget, { currency })} sub="across all categories" />
        <SummaryCard label="Spent so Far" tone="spent" value={fmtMoney(totalSpent, { currency })} sub={`${Math.round((totalSpent / (totalBudget || 1)) * 100)}% used`} />
        <SummaryCard
          label="Saved"
          tone="saved"
          value={fmtMoney(st.saved, { currency })}
          sub={st.monthlyPool ? `${Math.round((st.saved / st.monthlyPool) * 100)}% of pool` : ""}
        />
        <SummaryCard label="Held" tone="saved" value={fmtMoney(totalHeld, { currency })} sub="all scheduled reserves this month" />
        <SummaryCard label="Available" tone={totalAvailable < 0 ? "danger" : "ok"} value={fmtMoney(totalAvailable, { currency })} sub={monthLabel(month, true)} />
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Budget by Category</h2><p className="panel-sub">Tap an amount to allocate</p></div>
        <div className="budget-edit-list" data-tour="tour-budgets-list">
          {categoryIndex.expenseCategories.map((c) => {
            const spent = st.byCat[c.id] || 0;
            const held = st.byCatHeld[c.id] || 0;
            const budget = budgets[c.id];
            const budgetSet = isBudgetSet(budget);
            const spentPct = budgetSet ? spent / budget : 0;
            const committed = spent + held;
            const over = budgetSet && committed > budget;
            const available = budgetSet ? budget - committed : 0;
            return (
              <div key={c.id} className="bedit">
                <div className="be-top">
                  <div className="be-name">
                    <CatGlyph glyph={c.glyph} id={c.id} /> {c.name}
                    {held > 0 ? (
                      <span className="budget-hold" title="Budget hold active">
                        <Icon name="lock" size={11} />
                        {fmtMoney(held, { currency })}
                      </span>
                    ) : null}
                  </div>
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
                      {fmtMoney(spent, { currency })} <span className="br-of">/ {fmtBudgetLimit(budget, { currency })}</span>
                    </button>
                  )}
                </div>
                <div className="br-track tall">
                  <div className="br-fill" style={{ width: Math.min(spentPct, 1) * 100 + "%", background: over ? "var(--danger)" : c.color }} />
                </div>
                <div className="be-meta">
                  {!budgetSet ? <span>Unset</span>
                    : over ? <span className="br-over-txt">Over budget by {fmtMoney(committed - budget, { currency })}</span>
                        : held > 0
                          ? <span>{fmtMoney(available, { currency })} available · {fmtMoney(spent, { currency })} {isSavingsCategory(c) ? "saved" : "spent"} · {fmtMoney(held, { currency })} held</span>
                          : <span>{fmtMoney(budget - spent, { currency })} remaining · {Math.round(spentPct * 100)}% used</span>}
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
  const [habitPeriod, setHabitPeriod] = useState<HabitPeriod>("month");
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

  const spendingBudgets = Object.fromEntries(
    Object.entries(budgets).filter(([id]) => {
      const cat = categoryIndex.catById[id];
      return cat ? isSpendingCategory(cat) : id !== "income" && id !== "savings";
    }),
  );
  const totalBudget = Object.values(spendingBudgets).reduce((s, v) => s + v, 0);
  const chartMonths = useMemo(() => monthsWindow(month), [month]);

  /** Pre-aggregate outgoing spend by month and category once for Insights charts. */
  const monthlyAgg = useMemo(() => {
    const monthKeys = new Set(chartMonths.map((m) => m.key));
    const byMonth = new Map<string, { spent: number; byCat: Record<string, number> }>();
    for (const key of monthKeys) byMonth.set(key, { spent: 0, byCat: {} });

    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      if (!monthKeys.has(key)) continue;
      if (!isOutgoing(e) || isSavings(e, categoryIndex)) continue;
      const bucket = byMonth.get(key)!;
      bucket.spent += e.amount;
      const cat = catOf(e.sub, categoryIndex);
      bucket.byCat[cat] = (bucket.byCat[cat] || 0) + e.amount;
    }

    return byMonth;
  }, [expenses, chartMonths, categoryIndex]);

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
  const perMonth = useMemo(
    () =>
      chartMonths.map((mo) => ({
        key: mo.key,
        label: monthLabel(mo.key).split(" ")[0],
        spent: Math.round(monthlyAgg.get(mo.key)?.spent || 0),
      })),
    [chartMonths, monthlyAgg],
  );
  const cur = monthStats(expenses, budgets, wallet, month, categoryIndex);
  const idx = MONTHS.findIndex((m) => m.key === month);
  const prevKey = idx > 0 ? MONTHS[idx - 1].key : null;
  const prev = prevKey ? monthStats(expenses, budgets, wallet, prevKey, categoryIndex) : null;

  const catRows = useMemo(
    () =>
      categoryIndex.spendingCategories
        .map((c) => {
          const now = cur.byCat[c.id] || 0;
          const was = prev ? prev.byCat[c.id] || 0 : 0;
          const series = chartMonths.map((mo) =>
            Math.round(
              fxConvert(
                monthlyAgg.get(mo.key)?.byCat[c.id] || 0,
                currency,
                displayCurrency,
                fxRates,
              ),
            ),
          );
          const delta = was ? (now - was) / was : now > 0 ? 1 : 0;

          return { c, now, was, delta, series };
        })
        .sort((a, b) => b.now - a.now),
    [
      categoryIndex.spendingCategories,
      cur.byCat,
      prev,
      chartMonths,
      monthlyAgg,
      currency,
      displayCurrency,
      fxRates,
    ],
  );

  // top subcategories this month
  const subTotals = {};
  cur.list.filter((e) => isOutgoing(e) && !isSavings(e, categoryIndex)).forEach((e) => {
    subTotals[e.sub] = (subTotals[e.sub] || 0) + e.amount;
  });
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

  const habit = useMemo(
    () => assessSpendingHabit(expenses, habitPeriod, month, categoryIndex),
    [expenses, habitPeriod, month, categoryIndex],
  );
  const habitSub =
    habitPeriod === "month"
      ? `Based on outgoing spend in ${habit.periodLabel} · updates with the selected month`
      : `Based on outgoing spend in ${habit.periodLabel} · updates with the selected year`;

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

      <section className="panel insights-habits" data-tour="tour-insights-habits">
        <div className="panel-head insights-habits-head">
          <div>
            <h2>Spending Habit</h2>
            <p className="panel-sub">{habitSub}</p>
          </div>
          <Segmented
            options={[
              { v: "month", label: "Per Month" },
              { v: "year", label: "Per Year" },
            ]}
            value={habitPeriod}
            onChange={setHabitPeriod}
          />
        </div>

        {habit.status === "insufficient" ? (
          <div className="insights-habits-locked">
            <div className="insights-habits-locked-mark" aria-hidden="true">◌</div>
            <div className="insights-habits-locked-copy">
              <p className="insights-habits-locked-title">Style unlocks after 5 days of transactions</p>
              <p className="insights-habits-locked-sub">
                {habit.daysHave === 0
                  ? `No outgoing spend days yet in ${habit.periodLabel}.`
                  : `${habit.daysHave} of ${habit.daysNeeded} active days in ${habit.periodLabel}.`}
              </p>
            </div>
            <div
              className="insights-habits-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={habit.daysNeeded}
              aria-valuenow={habit.daysHave}
              aria-label="Transaction Days Toward Habit Unlock"
            >
              <div
                className="insights-habits-progress-fill"
                style={{ width: `${(habit.daysHave / habit.daysNeeded) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className={"insights-habits-result style-" + habit.style.id}>
            <div className="insights-habits-identity">
              <p className="insights-habits-temperament">{habit.style.temperament}</p>
              <h3 className="insights-habits-title">{habit.style.title}</h3>
              <p className="insights-habits-meta">
                {habit.activeDays} active days · {habit.txCount} transactions in {habit.periodLabel}
              </p>
            </div>
            <div className="insights-habits-copy">
              <div className="insights-habits-block">
                <p className="insights-habits-kicker">Data Pattern</p>
                <p>{habit.style.pattern}</p>
              </div>
              <div className="insights-habits-block">
                <p className="insights-habits-kicker">Behavior</p>
                <p>{habit.style.behavior}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="summary-grid sg-3">
        <SummaryCard label="This Month" tone="spent" value={money(cur.spent)} sub={monthLabel(month)} />
        <SummaryCard label="Vs Last Month" tone={prev && cur.spent > prev.spent ? "danger" : "saved"}
          value={prev ? (cur.spent >= prev.spent ? "+" : "−") + money(Math.abs(cur.spent - prev.spent)) : "—"}
          sub={prev ? `${Math.round(Math.abs(cur.spent - prev.spent) / (prev.spent || 1) * 100)}% ${cur.spent >= prev.spent ? "higher" : "lower"}` : "no prior data"} />
        <SummaryCard label="6-Month Average" value={money(avgSpent)} sub="monthly spend" />
      </div>

      <section className="panel" data-tour="tour-insights-chart">
        <div className="panel-head insights-chart-head">
          <div>
            <h2>Month Over Month</h2>
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
          <div className="panel-head"><h2>Category Trends</h2><p className="panel-sub">vs previous month</p></div>
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
          <div className="panel-head"><h2>Top Subcategories</h2><p className="panel-sub">{monthLabel(month, true)}</p></div>
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
        <SummaryCard label="Recurring this Month" value={fmtMoney(total, { cents: false, currency })} sub={`${list.length} scheduled ${list.length === 1 ? "charge" : "charges"}`} />
        <SummaryCard label="Monthly Equivalent" tone="spent" value={fmtMoney(monthlyEq, { cents: false, currency })} sub="normalized across intervals" />
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Fixed & Recurring</h2><p className="panel-sub">Auto-posted on due dates from your last amount</p></div>
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
          }) : <EmptyState title="No Recurring Items" sub="Mark an expense as recurring when adding it." />}
        </div>
      </section>
    </div>
  );
}

