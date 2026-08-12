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
  eventDaysForDay,
  fmtBudgetLimit,
  fmtMoney,
  fmtMoneyShort,
  getCurrency,
  isBudgetSet,
  monthLabel,
  monthsWindow,
  pad,
  roundMoney,
  weekdayLabel,
} from "@/frontend/lib/data";
import { fetchFxRates, fxConvert, fxRateLabel } from "@/frontend/lib/fx";
import { preventNegativeKeys, preventWheelChange, stripNegativeInput } from "@/frontend/lib/number-input";
import {
  assessSpendingHabit,
  buildHabitNarrative,
  buildHabitNudge,
  describeHabitShift,
  habitTrajectory,
  type HabitPeriod,
} from "@/frontend/lib/spendingHabits";
import {
  catOf,
  chartActiveKey,
  chartBudgetForPeriod,
  chartSelectionMonth,
  dayFlowSeries,
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

  return eventDaysForDay(events, todayIso)
    .filter(
      /* A run already under way stays listed regardless of its start time. */
      (day) => day.dayIndex > 0 || day.ev.allDay || (day.ev.time || "00:00") >= nowHm,
    )
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
  /** Per-day spend / income split by source — powers the trend hover card. */
  const dayFlows = useMemo(
    () => dayFlowSeries(st.list, month, categoryIndex, todayCap),
    [st.list, month, categoryIndex, todayCap],
  );
  const trendDetails = useMemo(
    () => dayFlows.map((f) => ({ ...f, label: `${weekdayLabel(f.day)}, ${dayLabel(f.day)}` })),
    [dayFlows],
  );
  /** Cumulative spend and earnings per day of the selected month. */
  const { cum, earnCum } = useMemo(() => {
    const spentPoints: Array<{ x: string; v: number }> = [];
    const earnedPoints: Array<{ x: string; v: number }> = [];
    let spentRun = 0;
    let earnedRun = 0;
    for (const flow of dayFlows) {
      spentRun += flow.spent;
      earnedRun += flow.earned;
      spentPoints.push({ x: flow.label, v: Math.round(spentRun) });
      earnedPoints.push({ x: flow.label, v: Math.round(earnedRun) });
    }
    return { cum: spentPoints, earnCum: earnedPoints };
  }, [dayFlows]);

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
            {todayEvents.length ? todayEvents.map((day) => {
              const ev = day.ev;
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
                      {cat.name} · {eventTimeLabel(ev, day)}
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
            <p className="panel-sub">
              Cumulative · hover a day for its categories · dashed line is total budget {fmtMoneyShort(st.totalBudget, currency)}
            </p>
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
          details={trendDetails.length ? trendDetails : null}
          format={(n) => fmtMoney(n, { currency })}
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
    const v = Math.max(0, roundMoney(parseFloat(draft) || 0));
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
                        step="0.01"
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
    fmtMoney(roundMoney(fxConvert(n, currency, displayCurrency, fxRates)), {
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

  /** Pre-aggregate spend and income by month and category once for Insights charts. */
  const monthlyAgg = useMemo(() => {
    const monthKeys = new Set(chartMonths.map((m) => m.key));
    type Bucket = {
      spent: number;
      earned: number;
      byCat: Record<string, number>;
      /** Income keyed by subcategory — most wallets have a single income category. */
      byIncomeSub: Record<string, number>;
    };
    const byMonth = new Map<string, Bucket>();
    for (const key of monthKeys) byMonth.set(key, { spent: 0, earned: 0, byCat: {}, byIncomeSub: {} });

    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      if (!monthKeys.has(key)) continue;
      const bucket = byMonth.get(key)!;
      const cat = catOf(e.sub, categoryIndex);

      if (isIncome(e)) {
        bucket.earned += e.amount;
        bucket.byIncomeSub[e.sub] = (bucket.byIncomeSub[e.sub] || 0) + e.amount;
        continue;
      }
      if (!isOutgoing(e) || isSavings(e, categoryIndex)) continue;
      bucket.spent += e.amount;
      bucket.byCat[cat] = (bucket.byCat[cat] || 0) + e.amount;
    }

    return byMonth;
  }, [expenses, chartMonths, categoryIndex]);

  const chartBars = useMemo(() => {
    return spendingChartSeries(chartPeriod, expenses, month, categoryIndex).map((bar) => ({
      ...bar,
      spent: roundMoney(fxConvert(bar.spent, currency, displayCurrency, fxRates)),
      earned: roundMoney(fxConvert(bar.earned, currency, displayCurrency, fxRates)),
    }));
  }, [chartPeriod, expenses, month, categoryIndex, currency, displayCurrency, fxRates]);
  const chartBudget = useMemo(
    () => roundMoney(fxConvert(chartBudgetForPeriod(chartPeriod, totalBudget, month), currency, displayCurrency, fxRates)),
    [chartPeriod, totalBudget, month, currency, displayCurrency, fxRates],
  );
  const activeChartKey = chartActiveKey(chartPeriod, month);
  const perMonth = useMemo(
    () =>
      chartMonths.map((mo) => ({
        key: mo.key,
        label: monthLabel(mo.key).split(" ")[0],
        spent: roundMoney(monthlyAgg.get(mo.key)?.spent || 0),
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
            roundMoney(
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

  const avgSpent = roundMoney(perMonth.reduce((s, m) => s + m.spent, 0) / perMonth.length);

  // ── Income ────────────────────────────────────────────────────────
  /** Income totals per subcategory for one month's transactions. */
  const incomeBySub = (list: Expense[]) => {
    const totals: Record<string, number> = {};
    for (const e of list) {
      if (!isIncome(e)) continue;
      totals[e.sub] = (totals[e.sub] || 0) + e.amount;
    }

    return totals;
  };

  /** One row per income source that has ever paid out inside the chart window. */
  const incomeRows = useMemo(() => {
    const now = incomeBySub(cur.list);
    const was = prev ? incomeBySub(prev.list) : {};
    const sources = new Set([...Object.keys(now), ...Object.keys(was)]);
    for (const mo of chartMonths) {
      for (const sub of Object.keys(monthlyAgg.get(mo.key)?.byIncomeSub ?? {})) sources.add(sub);
    }

    return [...sources]
      .map((sub) => {
        const meta = categoryIndex.subById[sub];
        const cat = meta ? categoryIndex.catById[meta.catId] : null;
        const amount = now[sub] || 0;
        const before = was[sub] || 0;
        const series = chartMonths.map((mo) =>
          roundMoney(
            fxConvert(monthlyAgg.get(mo.key)?.byIncomeSub[sub] || 0, currency, displayCurrency, fxRates),
          ),
        );

        return {
          sub,
          name: meta?.name ?? sub,
          cat,
          now: amount,
          delta: before ? (amount - before) / before : amount > 0 ? 1 : 0,
          series,
        };
      })
      .filter((row) => row.cat)
      .sort((a, b) => b.now - a.now);
  }, [
    categoryIndex.subById,
    categoryIndex.catById,
    cur.list,
    prev,
    chartMonths,
    monthlyAgg,
    currency,
    displayCurrency,
    fxRates,
  ]);

  // top income sources this month
  const topIncomeSubs = Object.entries(incomeBySub(cur.list))
    .map(([sub, v]) => ({ sub, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  const maxIncomeSub = topIncomeSubs.length ? topIncomeSubs[0].v : 1;

  const avgEarned = roundMoney(
    chartMonths.reduce((s, mo) => s + (monthlyAgg.get(mo.key)?.earned || 0), 0) / chartMonths.length,
  );
  const earnedDelta = prev ? cur.earned - prev.earned : 0;
  const netKept = cur.earned - cur.spent;
  const keptPct = cur.earned ? Math.round((netKept / cur.earned) * 100) : 0;
  const rateLine = fxRateLabel(currency, displayCurrency, fxRates);
  const fxNote =
    fxStatus === "loading"
      ? "Fetching live rates…"
      : fxStatus === "error"
        ? fxError || "Rate unavailable — showing wallet currency"
        : displayCurrency !== currency && rateLine
          ? `View only · ${rateLine}`
          : "Wallet currency";

  const chartPeriodSub =
    chartPeriod === "daily"
      ? `Daily spend in ${monthLabel(month, true)} · dashed line is daily budget`
      : chartPeriod === "quarterly"
        ? "Total spend by quarter · dashed line is quarterly budget · tap a bar to view"
        : chartPeriod === "yearly"
          ? "Total spend by year · dashed line is yearly budget · tap a bar to view"
          : "Total spend · dashed line is budget · tap a bar to view";
  const chartSub = `${chartPeriodSub} · hover for spend & income`;

  const habit = useMemo(
    () => assessSpendingHabit(expenses, habitPeriod, month, categoryIndex),
    [expenses, habitPeriod, month, categoryIndex],
  );
  const habitTrail = useMemo(
    () => habitTrajectory(expenses, month, categoryIndex),
    [expenses, month, categoryIndex], // deliberately NOT habitPeriod — the trail is always the trailing 6 months
  );
  const habitTrailMaxSpend = useMemo(
    () => Math.max(...habitTrail.map((p) => p.spend), 1),
    [habitTrail],
  );
  const habitStory = useMemo(() => {
    if (habit.status !== "ready") return null;
    return {
      narrative: buildHabitNarrative(habit.style.id, habit.metrics, { money }),
      nudge: buildHabitNudge(habit.style.id, habit.metrics, { money }),
      shift: describeHabitShift(habitTrail),
    };
    // `money` is a fresh closure every render — depend on its real inputs instead, so an
    // unrelated re-render doesn't rebuild the narrative/nudge strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habit, habitTrail, currency, displayCurrency, fxRates]);
  const habitSub =
    habitPeriod === "month"
      ? `Based on outgoing spend in ${habit.periodLabel} · updates with the selected month`
      : habitPeriod === "year"
        ? `Based on outgoing spend in ${habit.periodLabel} · updates with the selected year`
        : `Based on outgoing spend in ${habit.periodLabel} · rolling window, ignores month boundaries`;

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
              { v: "rolling90", label: "Last 90 Days" },
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
                {" "}{habit.daysNeeded - habit.daysHave} more spending days to unlock.
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
          <div className={"insights-habits-result habit-tinted style-" + habit.style.id}>
            <div className="insights-habits-top">
              <div className="insights-habits-identity">
                <div className="insights-habits-crown">
                  <p className="insights-habits-temperament">{habit.style.temperament}</p>
                  <span className={"insights-habits-confidence conf-" + habit.confidence.level}>
                    {habit.confidence.level} confidence
                  </span>
                </div>
                <h3 className="insights-habits-title">
                  {habit.style.title}
                  {habit.blend.secondary && (
                    <span className="insights-habits-blend"> with a {habit.blend.secondary.trait} streak</span>
                  )}
                </h3>
                <p className="insights-habits-meta">
                  {habit.activeDays} active days · {habit.txCount} transactions · {money(habit.metrics.total)} in {habit.periodLabel}
                </p>
              </div>
              {habitStory && (
                <div className="insights-habits-copy">
                  <div className="insights-habits-block">
                    <p className="insights-habits-kicker">Data Pattern</p>
                    <p>{habitStory.narrative.pattern}</p>
                  </div>
                  <div className="insights-habits-block">
                    <p className="insights-habits-kicker">Behavior</p>
                    <p>{habitStory.narrative.behavior}</p>
                  </div>
                  <div className="insights-habits-block is-nudge">
                    <p className="insights-habits-kicker">Try This</p>
                    <p>{habitStory.nudge}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="insights-habits-signals">
              <div className="insights-habits-signal">
                <p className="ihs-label">Median charge</p>
                <p className="ihs-value">{money(habit.metrics.medianAmt)}</p>
                <p className="ihs-hint">p90 {money(habit.metrics.p90)}</p>
              </div>
              <div className="insights-habits-signal">
                <p className="ihs-label">Amount swing</p>
                <p className="ihs-value">{habit.metrics.amountCv.toFixed(2)}×</p>
                <p className="ihs-hint">lower is steadier</p>
              </div>
              <div className="insights-habits-signal">
                <p className="ihs-label">Typical gap</p>
                <p className="ihs-value">{habit.metrics.medianGap}d</p>
                <p className="ihs-hint">longest quiet {habit.metrics.longestQuiet}d</p>
              </div>
              <div className="insights-habits-signal">
                <p className="ihs-label">Busiest day</p>
                <p className="ihs-value">
                  {habit.metrics.topDowSampleDate ? weekdayLabel(habit.metrics.topDowSampleDate) : "—"}
                </p>
                <p className="ihs-hint">{Math.round(habit.metrics.topDowShare * 100)}% of transactions</p>
              </div>
              <div className="insights-habits-signal">
                <p className="ihs-label">Biggest cluster</p>
                <p className="ihs-value">
                  {habit.metrics.biggestCluster
                    ? `${habit.metrics.biggestCluster.size} tx / ${habit.metrics.biggestCluster.spanDays}d`
                    : "—"}
                </p>
                <p className="ihs-hint">
                  {habit.metrics.biggestCluster ? Math.round(habit.metrics.biggestCluster.share * 100) : 0}% of spend
                </p>
              </div>
              <div className="insights-habits-signal">
                <p className="ihs-label">On a schedule</p>
                <p className="ihs-value">{Math.round(habit.metrics.recurringShare * 100)}%</p>
                <p className="ihs-hint">{habit.metrics.recurringCount} recurring charges</p>
              </div>
            </div>

            {habit.metrics.categories.length > 0 && (
              <div className="insights-habits-driver">
                {habit.metrics.categories.slice(0, 3).map((cat) => (
                  <div key={cat.id} className="ihd-row">
                    <CatGlyph glyph={cat.glyph} id={cat.id} />
                    <div className="ihd-name">{cat.name}</div>
                    <div className="ihd-bar">
                      <div
                        className="ihd-fill"
                        style={{ width: `${Math.round(cat.share * 100)}%` }}
                      />
                    </div>
                    <div className="ihd-amt">{money(cat.amount)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="insights-habits-trajectory">
              <p className="iht-note">{habitStory?.shift}</p>
              <div className="iht-grid">
                {habitTrail.map((pt) => {
                  const isReady = pt.status === "ready";
                  return (
                    <button
                      key={pt.monthKey}
                      type="button"
                      className={
                        "iht-col habit-tinted " +
                        (isReady ? "style-" + pt.styleId : "") +
                        (pt.monthKey === month ? " is-active" : "")
                      }
                      onClick={() => setMonth(pt.monthKey)}
                      disabled={!isReady}
                    >
                      <div
                        className={"iht-bar" + (isReady ? "" : " is-empty")}
                        style={{ height: isReady ? `${Math.max(6, (pt.spend / habitTrailMaxSpend) * 100)}%` : "4px" }}
                      />
                      <p className="iht-label">{monthLabel(pt.monthKey).split(" ")[0]}</p>
                      <p className="iht-style">{isReady ? pt.trait : "—"}</p>
                    </button>
                  );
                })}
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
          format={money}
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

      <div className="insights-section" data-tour="tour-insights-income">
        <div className="insights-section-head">
          <h2>Income</h2>
          <p className="panel-sub">Where money came in, and how much of it survived the month</p>
        </div>

        <div className="summary-grid">
          <SummaryCard label="Income This Month" tone="saved" value={money(cur.earned)} sub={monthLabel(month)} />
          <SummaryCard
            label="Vs Last Month"
            tone={!prev || earnedDelta === 0 ? undefined : earnedDelta > 0 ? "saved" : "danger"}
            value={prev ? (earnedDelta >= 0 ? "+" : "−") + money(Math.abs(earnedDelta)) : "—"}
            sub={
              prev
                ? `${Math.round(Math.abs(earnedDelta) / (prev.earned || 1) * 100)}% ${earnedDelta >= 0 ? "higher" : "lower"}`
                : "no prior data"
            }
          />
          <SummaryCard label="6-Month Average" value={money(avgEarned)} sub="monthly income" />
          <SummaryCard
            label="Net Kept"
            tone={netKept < 0 ? "danger" : "ok"}
            value={money(netKept)}
            sub={cur.earned ? `${keptPct}% of income kept` : "no income recorded"}
          />
        </div>

        <div className="ov-grid">
          <section className="panel">
            <div className="panel-head"><h2>Income Trends</h2><p className="panel-sub">by source · vs previous month</p></div>
            <div className="cat-trend-list">
              {incomeRows.length ? incomeRows.map(({ sub, name, cat, now, delta, series }) => (
                <div key={sub} className="ctrow">
                  <div className="ct-name"><CatGlyph glyph={cat!.glyph} id={cat!.id} /> {name}</div>
                  <MiniSpark values={series} color={cat!.color} />
                  <div className="ct-amt">{money(now)}</div>
                  <div className={"ct-delta ct-delta--income " + (delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat")}>
                    {delta > 0.001 ? "▲" : delta < -0.001 ? "▼" : "—"} {Math.abs(Math.round(delta * 100))}%
                  </div>
                </div>
              )) : (
                <EmptyState title="No Income Yet" sub="Log an income transaction to see trends here." />
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Top Income Sources</h2><p className="panel-sub">{monthLabel(month, true)}</p></div>
            <div className="topsub-list">
              {topIncomeSubs.length ? topIncomeSubs.map(({ sub, v }) => {
                const s = categoryIndex.subById[sub];
                const c = s ? categoryIndex.catById[s.catId] : null;
                if (!s || !c) return null;
                return (
                  <div key={sub} className="ts-row">
                    <div className="ts-head">
                      <span>{s.name} <span className="ts-cat">· {c.name}</span></span>
                      <span className="ts-amt">{money(v)}</span>
                    </div>
                    <div className="ts-track">
                      <div className="ts-fill" style={{ width: (v / maxIncomeSub) * 100 + "%", background: c.color }} />
                    </div>
                  </div>
                );
              }) : (
                <EmptyState title="Nothing Earned" sub={`No income recorded in ${monthLabel(month, true)}.`} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Recurring ───────────────────────────────────────────────────────
export function Recurring({ expenses, month, currency, categoryIndex, onEdit }) {
  const list = recurringSchedulesForMonth(expenses, month);
  const total = roundMoney(list.reduce((s, e) => s + e.amount, 0));
  const monthlyEq = roundMoney(list.reduce((s, e) => s + recurringMonthlyEquivalent(e.amount, e.recurring), 0));
  return (
    <div className="view">
      <div className="summary-grid sg-2" data-tour="tour-recurring-summary">
        <SummaryCard label="Recurring this Month" value={fmtMoney(total, { currency })} sub={`${list.length} scheduled ${list.length === 1 ? "charge" : "charges"}`} />
        <SummaryCard label="Monthly Equivalent" tone="spent" value={fmtMoney(monthlyEq, { currency })} sub="normalized across intervals" />
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

