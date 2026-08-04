import { DatePicker, TimePicker } from "@/frontend/components/DateTimePicker";
import { CategoryPicker } from "@/frontend/components/CategoryPicker";
import {
  DeleteScopeDialog,
  EmptyState,
  Icon,
  SummaryCard,
  glyphTint,
} from "@/frontend/components/ui";
import {
  CURRENT_MONTH_KEY,
  EVENT_CATS,
  REPEATS,
  TODAY_ISO,
  collapseRecurringToNext,
  dayLabel,
  eventCatMeta,
  eventTimeLabel,
  eventsByDayForMonth,
  fmtCommentTime,
  fmtMoney,
  fmtTime,
  getCurrency,
  leadLabel,
  leadTimesForEvent,
  monthLabel,
  repeatLabel,
  weekdayLabel,
} from "@/frontend/lib/data";
import { isActiveHoldOccurrence } from "@/frontend/lib/envelope-holds";
import { preventNegativeKeys, preventWheelChange, stripNegativeInput } from "@/frontend/lib/number-input";
import type { CategoryIndex, LedgerEvent } from "@/frontend/lib/types";
import type { DeleteScope } from "@/lib/delete-scope";
import { CATEGORY_GLYPH_OPTIONS, displayGlyph } from "@/lib/glyphs";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Schedule view
 * ─────────────
 *   Schedule   — month calendar + upcoming agenda
 *   EventModal — add / edit an event, incl. email-reminder opt-in
 */

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function normalizeLead(lead: string, allDay: boolean): string {
  const allowed = leadTimesForEvent(allDay);
  return allowed.some((l) => l.id === lead) ? lead : allDay ? "1d" : "at";
}

function shiftIso(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function ChevDown({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type LeadPickerProps = {
  options: ReadonlyArray<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
};

/** Custom dropdown for the email reminder lead time. */
function LeadPicker({ options, value, onChange }: LeadPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeRef.current?.scrollIntoView({ block: "nearest" });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  if (!selected) return null;

  const menu = open ? (
    <div
      className="picker-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="picker-menu picker-menu--lead" role="listbox" aria-label="Reminder lead time">
        <div className="picker-timezone-list">
          {options.map((option) => {
            const active = option.id === selected.id;

            return (
              <button
                key={option.id}
                ref={active ? activeRef : undefined}
                type="button"
                role="option"
                aria-selected={active}
                className={"picker-timezone-item" + (active ? " active" : "")}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="pti-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="picker-wrap" ref={rootRef}>
      <button
        type="button"
        className="picker-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="picker-trigger-label">{selected.label}</span>
        <ChevDown />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

function AgendaEventRow({
  ev,
  iso,
  currency,
  onEditEvent,
}: {
  ev: LedgerEvent;
  iso: string;
  currency: string;
  onEditEvent: (ev: LedgerEvent, occurrenceIso: string) => void;
}) {
  const c = eventCatMeta(ev);
  const holdActive = isActiveHoldOccurrence(ev, iso);
  return (
    <button type="button" className="agenda-row" onClick={() => onEditEvent(ev, iso)}>
      <span className="ag-glyph" style={glyphTint(c.color)}>{displayGlyph(c.glyph, c.id)}</span>
      <span className="ag-main">
        <span className="ag-title">
          {ev.title}
          {ev.repeat !== "once" && (
            <span className="ag-rep" title={repeatLabel(ev)}>
              <Icon name="repeat" size={12} />
            </span>
          )}
          {holdActive ? (
            <span className="ag-hold" title="Budget hold active">
              <Icon name="lock" size={11} />
              {fmtMoney(ev.budgetHoldAmount ?? 0, { cents: false, currency })}
            </span>
          ) : null}
          {ev.comments && ev.comments.length > 0 && (
            <span className="ag-cmt">
              <Icon name="comment" size={12} /> {ev.comments.length}
            </span>
          )}
        </span>
        <span className="ag-sub">
          <span>{c.name}</span>
          {ev.notify ? (
            <span className="ag-bell">
              <Icon name="bell" size={11} />
              <span>{leadLabel(ev.lead, ev.allDay).toLowerCase()}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="ag-time">{eventTimeLabel(ev)}</span>
    </button>
  );
}

// ── Schedule (calendar + agenda) ────────────────────────────────────
export function Schedule({ events, month, currency, onAddEvent, onEditEvent }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(days).padStart(2, "0")}`;
  const startOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first

  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const isCurrent = month === CURRENT_MONTH_KEY;
  const byDay = useMemo(() => eventsByDayForMonth(events, month), [events, month]);
  const occ = useMemo(() => {
    const out: Array<{ iso: string; ev: LedgerEvent }> = [];
    for (const [iso, list] of byDay) {
      for (const ev of list) out.push({ iso, ev });
    }
    return out;
  }, [byDay]);
  const agenda = isCurrent ? occ.filter((o) => o.iso >= TODAY_ISO) : occ;

  // Re-tick each minute so today's occurrence drops out of the agenda once its
  // time goes by, handing the slot to the series' next occurrence.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /** Agenda with each recurring series reduced to its next occurrence. */
  const upcoming = useMemo(
    () => (isCurrent ? collapseRecurringToNext(agenda, now) : agenda),
    [agenda, isCurrent, now],
  );

  const upcomingByDay = useMemo(() => {
    if (!isCurrent) return [];
    const groups = new Map<string, LedgerEvent[]>();
    for (const { iso, ev } of upcoming) {
      const list = groups.get(iso);
      if (list) list.push(ev);
      else groups.set(iso, [ev]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, dayEvents]) => ({ iso, events: dayEvents }));
  }, [upcoming, isCurrent]);

  const nextRem = agenda.find((o) => o.ev.notify);
  const alertsCount = occ.filter((o) => o.ev.notify).length;

  const defaultFocusDay =
    isCurrent && TODAY_ISO >= monthStart && TODAY_ISO <= monthEnd ? TODAY_ISO : monthStart;
  const viewDay = selectedDay ?? defaultFocusDay;
  const navAnchor = viewDay;

  const handleDayClick = (iso: string, dayEvents: LedgerEvent[]) => {
    if (dayEvents.length === 0) {
      onAddEvent(iso);
      return;
    }
    if (selectedDay === iso) {
      setSelectedDay(null);
      return;
    }
    setSelectedDay(iso);
  };

  const navigateDay = (delta: number) => {
    const next = shiftIso(navAnchor, delta);
    if (next < monthStart || next > monthEnd) return;
    setSelectedDay(next);
  };

  const showFullUpcoming = isCurrent && !selectedDay;
  const focusedEvents = showFullUpcoming ? [] : (byDay.get(viewDay) ?? []);
  const canPrevDay = !showFullUpcoming && navAnchor > monthStart;
  const canNextDay = !showFullUpcoming && navAnchor < monthEnd;
  const upcomingTitle = isCurrent ? "Upcoming" : "Agenda";

  return (
    <div className="view">
      <div className="summary-grid sg-3" data-tour="tour-schedule-summary">
        <SummaryCard label="Events this Month" value={String(occ.length)} sub={monthLabel(month, true)} />
        <SummaryCard label="Next Reminder" tone="ok"
          value={nextRem ? dayLabel(nextRem.iso) : "—"}
          sub={nextRem ? `${nextRem.ev.title} · ${leadLabel(nextRem.ev.lead, nextRem.ev.allDay).toLowerCase()}` : "no upcoming reminders"} />
        <SummaryCard label="Email Reminders" value={String(alertsCount)} sub="occurrences will notify you" />
      </div>

      <section className="panel" data-tour="tour-schedule-agenda">
        <div className="panel-head panel-head--agenda">
          <div className="agenda-head">
            <button
              type="button"
              className="agenda-nav-btn"
              disabled={!canPrevDay}
              onClick={() => navigateDay(-1)}
              aria-label="Previous Day"
            >
              <Icon name="chevL" size={18} />
            </button>
            <div className="agenda-head-main">
              <h2>{upcomingTitle}</h2>
              <p className="panel-sub">
                {showFullUpcoming
                  ? `${upcoming.length} ${upcoming.length === 1 ? "event" : "events"} from ${dayLabel(TODAY_ISO)} · earliest first`
                  : `${dayLabel(viewDay)} · ${weekdayLabel(viewDay)} · ${focusedEvents.length} ${focusedEvents.length === 1 ? "event" : "events"}`}
              </p>
            </div>
            <button
              type="button"
              className="agenda-nav-btn"
              disabled={!canNextDay}
              onClick={() => navigateDay(1)}
              aria-label="Next Day"
            >
              <Icon name="chevR" size={18} />
            </button>
          </div>
        </div>
        <div className="agenda">
          {showFullUpcoming ? (
            upcomingByDay.length ? (
              upcomingByDay.map(({ iso, events: dayEvents }) => (
                <div key={iso} className="agenda-group">
                  <div className="agenda-date">
                    <span className="agenda-dnum">{new Date(iso + "T00:00:00").getDate()}</span>
                    <span className="agenda-dwd">{weekdayLabel(iso)}</span>
                  </div>
                  <div className="agenda-items">
                    {dayEvents.map((ev) => (
                      <AgendaEventRow key={`${iso}-${ev.id}`} ev={ev} iso={iso} currency={currency} onEditEvent={onEditEvent} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No Upcoming Events"
                sub="Nothing scheduled from today onward — add an event or pick another day on the calendar."
              />
            )
          ) : focusedEvents.length ? (
            <div className="agenda-group">
              <div className="agenda-date">
                <span className="agenda-dnum">{new Date(viewDay + "T00:00:00").getDate()}</span>
                <span className="agenda-dwd">{weekdayLabel(viewDay)}</span>
              </div>
              <div className="agenda-items">
                {focusedEvents.map((ev) => (
                  <AgendaEventRow key={ev.id} ev={ev} iso={viewDay} currency={currency} onEditEvent={onEditEvent} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No Events this Day"
              sub="Add something to this date, click the day again to show all upcoming, or use the arrows to browse."
            />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{monthLabel(month, true)}</h2>
            <p className="panel-sub">Click a day to view or add · click an event to edit</p>
          </div>
          <button className="add-btn add-btn--top" onClick={() => onAddEvent(TODAY_ISO)}>
            <Icon name="plus" size={17} /> <span className="abt-txt">New Event</span>
          </button>
        </div>

        <div className="cal" data-tour="tour-schedule-cal">
          <div className="cal-wd">
            {WD.map((d) => <div key={d} className="cal-wd-c">{d}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="cal-cell empty" />;
              const iso = `${month}-${String(d).padStart(2, "0")}`;
              const list = byDay.get(iso) ?? [];
              const today = iso === TODAY_ISO;
              const past = isCurrent && iso < TODAY_ISO;
              return (
                <div
                  key={i}
                  className={
                    "cal-cell"
                    + (today ? " today" : "")
                    + (past ? " past" : "")
                    + (viewDay === iso ? " selected" : "")
                  }
                  onClick={() => handleDayClick(iso, list)}
                >
                  <div className="cal-daynum">{d}</div>
                  <div className="cal-events">
                    {list.slice(0, 3).map((ev) => {
                      const c = eventCatMeta(ev);
                      return (
                        <button key={ev.id} className="cal-chip" style={{ background: c.color + "1c", color: c.color }}
                          title={ev.title}
                          onClick={(e) => { e.stopPropagation(); onEditEvent(ev, iso); }}>
                          <span className="cal-chip-glyph">{displayGlyph(c.glyph, c.id)}</span>
                          <span className="cal-chip-txt">{ev.allDay ? ev.title : `${fmtTime(ev.time)} ${ev.title}`}</span>
                        </button>
                      );
                    })}
                    {list.length > 3 && <div className="cal-more">+{list.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── EventModal (add / edit event) ───────────────────────────────────
export function EventModal({
  initial,
  defaultDate,
  occurrenceIso,
  hasLinkedPayment = false,
  categoryIndex,
  currency,
  onSave,
  onClose,
  onDelete,
  onLogPayment,
}) {
  const editing = !!(initial && initial.id);
  const lastEmail = (() => { try { return localStorage.getItem("ledger:notifyEmail") || ""; } catch (e) { return ""; } })();
  const customMeta = EVENT_CATS.find((c) => c.id === "custom")!;

  const [title, setTitle] = useState(initial ? initial.title : "");
  const [catId, setCatId] = useState(initial ? initial.catId : "bill");
  const [customLabel, setCustomLabel] = useState(initial?.customLabel ?? "");
  const [customGlyph, setCustomGlyph] = useState(initial?.customGlyph ?? customMeta.glyph);
  const [date, setDate] = useState(initial ? initial.date : (defaultDate || TODAY_ISO));
  const [allDay, setAllDay] = useState(initial ? !!initial.allDay : true);
  const [time, setTime] = useState(initial && initial.time ? initial.time : "09:00");
  const [repeat, setRepeat] = useState(initial ? initial.repeat : "once");
  // Email reminders are opt-in: new events start with notifications off,
  // matching the API schema default.
  const [notify, setNotify] = useState(initial ? !!initial.notify : false);
  const [lead, setLead] = useState(() =>
    normalizeLead(initial ? initial.lead : "1d", initial ? !!initial.allDay : true),
  );
  const [email, setEmail] = useState(initial && initial.email ? initial.email : lastEmail);
  const [comments, setComments] = useState(initial && initial.comments ? initial.comments : []);
  const [draft, setDraft] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [holdEnabled, setHoldEnabled] = useState(Boolean(initial?.budgetHoldEnabled));
  const [holdAmount, setHoldAmount] = useState(
    initial?.budgetHoldAmount ? String(initial.budgetHoldAmount) : "",
  );
  const [holdCategoryId, setHoldCategoryId] = useState(
    initial?.budgetHoldCategoryId ?? categoryIndex?.expenseCategories[0]?.id ?? "",
  );

  const paymentOccurrenceIso = occurrenceIso || initial?.date || date;

  const leadOptions = useMemo(() => leadTimesForEvent(allDay), [allDay]);
  const deleteFromDate = occurrenceIso || initial?.date || date;
  const showLogPayment = !!(editing && onLogPayment);

  const titleRef = useRef(null);
  useEffect(() => { if (titleRef.current) titleRef.current.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !scopeOpen) onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [scopeOpen]);

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked);
    if (!leadTimesForEvent(checked).some((l) => l.id === lead)) {
      setLead(checked ? "1d" : "at");
    }
  };

  const chooseCat = (id: string) => {
    setCatId(id);
    if (id === "custom" && !customGlyph) setCustomGlyph(customMeta.glyph);
  };

  const addComment = () => {
    const t = draft.trim();
    if (!t) return;
    setComments((cs) => [...cs, { id: "c" + Date.now(), text: t, at: new Date().toISOString() }]);
    setDraft("");
  };

  const customOk = catId !== "custom" || (customLabel.trim() && customGlyph);
  const holdAmountNum = Math.max(0, Math.round(parseFloat(holdAmount) || 0));
  const resolvedHoldCategoryId = holdCategoryId || categoryIndex?.expenseCategories[0]?.id || "";
  const holdValid = !holdEnabled || (holdAmountNum > 0 && resolvedHoldCategoryId);
  const valid = title.trim() && date && (allDay || time) && customOk && holdValid;
  const submit = () => {
    if (!valid) return;
    if (notify && email.trim()) { try { localStorage.setItem("ledger:notifyEmail", email.trim()); } catch (e) {} }
    const holdFields = holdEnabled && holdAmountNum > 0 && resolvedHoldCategoryId
      ? {
          budgetHoldEnabled: true,
          budgetHoldAmount: holdAmountNum,
          budgetHoldCategoryId: resolvedHoldCategoryId,
          budgetHoldReleasedDates: initial?.budgetHoldReleasedDates,
        }
      : {
          budgetHoldEnabled: false,
        };
    onSave({
      id: initial && initial.id, title: title.trim(), catId,
      customLabel: catId === "custom" ? customLabel.trim() : undefined,
      customGlyph: catId === "custom" ? customGlyph : undefined,
      date,
      allDay, time: allDay ? null : time, repeat,
      notify, lead, email: email.trim(), comments,
      ...holdFields,
    });
  };

  /** Start delete — ask for scope when the event repeats. */
  const requestDelete = () => {
    if (!initial?.id) return;
    if (initial.repeat && initial.repeat !== "once") {
      setScopeOpen(true);
      return;
    }
    onDelete(initial.id);
  };

  /** Confirm a scoped recurring event delete. */
  const confirmScopedDelete = async (scope: DeleteScope) => {
    await onDelete(initial.id, { scope, fromDate: deleteFromDate });
    setScopeOpen(false);
  };

  return (
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget && !scopeOpen) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{editing ? "Edit Event" : "New Event"}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body modal-scroll">
          <input ref={titleRef} className="ev-title-in" type="text" placeholder="Event title"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />

          <div className="event-div" />
          <label className="fld-label">Type</label>
          <div className="cat-grid">
            {EVENT_CATS.filter((c) => c.id !== "custom").map((c) => (
              <button key={c.id} type="button" className={"cat-chip" + (catId === c.id ? " active" : "")}
                style={catId === c.id ? { borderColor: c.color, background: c.color + "16" } : null}
                onClick={() => chooseCat(c.id)}>
                <span className="cc-glyph" style={{ color: c.color }}>{displayGlyph(c.glyph, c.id)}</span>
                <span className="cc-label">{c.name}</span>
              </button>
            ))}
            <button
              type="button"
              className={"cat-chip cat-chip--span2" + (catId === "custom" ? " active" : "")}
              style={catId === "custom" ? { borderColor: customMeta.color, background: customMeta.color + "16" } : null}
              onClick={() => chooseCat("custom")}
            >
              <span className="cc-glyph" style={{ color: customMeta.color }}>
                {displayGlyph(customGlyph || customMeta.glyph, "custom")}
              </span>
              <span className="cc-label">{customLabel.trim() || "Custom type"}</span>
            </button>
          </div>

          {catId === "custom" ? (
            <div className="ev-custom">
              <label className="fld-label" htmlFor="ev-custom-name">Custom type name</label>
              <input
                id="ev-custom-name"
                className="text-in"
                type="text"
                placeholder="e.g. Team sync, Vet visit"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                maxLength={40}
              />
              <label className="fld-label">Emoji</label>
              <div className="cat-glyph-row">
                {CATEGORY_GLYPH_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={"cat-glyph-btn" + (customGlyph === g ? " active" : "")}
                    style={customGlyph === g ? { borderColor: customMeta.color, color: customMeta.color } : undefined}
                    onClick={() => setCustomGlyph(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="event-div" />

          <div className="fld-2col">
            <div>
              <label className="fld-label">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <label className="fld-label">Time</label>
              {allDay
                ? <div className="time-allday">All day</div>
                : <TimePicker value={time} onChange={setTime} />}
            </div>
          </div>

          <label className="toggle-line tight">
            <input type="checkbox" checked={allDay} onChange={(e) => handleAllDayChange(e.target.checked)} />
            <span className="toggle-ui" /> <span>All-day event</span>
          </label>

          <div className="event-div" />
          <label className="fld-label">Repeats</label>
          <div className="sub-row">
            {REPEATS.map((r) => (
              <button key={r.id} type="button" className={"sub-chip" + (repeat === r.id ? " active" : "")} onClick={() => setRepeat(r.id)}>{r.label}</button>
            ))}
          </div>
          <div className="event-div" />
          <div className="notify-head">
            <label className="toggle-line tight">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span className="toggle-ui" /> <span><Icon name="bell" size={15} /> Email reminder</span>
            </label>
          </div>
          {notify && (
            <div className="notify-card">
              <div className="fld-2col tight">
                <div>
                  <label className="fld-label">Send</label>
                  <LeadPicker options={leadOptions} value={lead} onChange={setLead} />
                </div>
                <div>
                  <label className="fld-label">Send to</label>
                  <input className="text-in" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <p className="notify-note">
                The email includes this event's name, budget hold and comments. Email is not
                encrypted, so a readable copy is stored for delivery until you turn reminders off.
              </p>
            </div>
          )}
          <div className="event-div" />

          <div className="notify-head">
            <label className="toggle-line tight">
              <input
                type="checkbox"
                checked={holdEnabled}
                onChange={(e) => setHoldEnabled(e.target.checked)}
              />
              <span className="toggle-ui" />
              <span><Icon name="lock" size={15} /> Hold from budget</span>
            </label>
          </div>
          {holdEnabled ? (
            <div className="notify-card">
              <div className="fld-2col tight hold-fields-grid">
                <div className="hold-fields-grid__amount">
                  <label className="fld-label">Amount</label>
                  <div className="hold-amt-row">
                    <span className="hold-cur">{getCurrency(currency).symbol}</span>
                    <input
                      className="text-in"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={holdAmount}
                      onChange={(e) => setHoldAmount(stripNegativeInput(e.target.value))}
                      onKeyDown={preventNegativeKeys}
                      onWheel={preventWheelChange}
                    />
                  </div>
                </div>
                <div className="hold-fields-grid__category">
                  <label className="fld-label">Category</label>
                  <CategoryPicker
                    categories={categoryIndex.expenseCategories}
                    value={resolvedHoldCategoryId}
                    onChange={setHoldCategoryId}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <div className="event-div" />

          <label className="fld-label">Comments</label>
          <div className="cmt-thread">
            {comments.length ? comments.map((c) => (
              <div key={c.id} className="cmt">
                <div className="cmt-bubble">{c.text}</div>
                <div className="cmt-time">{fmtCommentTime(c.at)}</div>
              </div>
            )) : <div className="cmt-empty">No comments yet — add a note, context, or follow-up.</div>}
            <div className="cmt-composer">
              <input className="cmt-in" type="text" placeholder="Add a comment…" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComment(); } }} />
              <button className="cmt-send" type="button" disabled={!draft.trim()} onClick={addComment} aria-label="Post Comment"><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>

        <div className={"modal-foot" + (showLogPayment ? " modal-foot-stacked" : "")}>
          {showLogPayment ? (
            <div className="mf-row mf-row-full">
              <button className="ghost-btn danger" type="button" onClick={requestDelete}>Delete</button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => onLogPayment({
                  id: initial.id,
                  title: title.trim() || initial.title,
                  date: paymentOccurrenceIso,
                  expenseId: hasLinkedPayment ? initial.expenseId : undefined,
                })}
              >
                {hasLinkedPayment ? "View Linked Payment" : "Log Payment"}
              </button>
            </div>
          ) : (
            editing ? <button className="ghost-btn danger" type="button" onClick={requestDelete}>Delete</button> : <span />
          )}
          <div className="mf-right">
            <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-btn" type="button" disabled={!valid} onClick={submit}>{editing ? "Save Changes" : "Add Event"}</button>
          </div>
        </div>
      </div>
      {scopeOpen && initial?.id ? (
        <DeleteScopeDialog
          title="Delete Recurring Event"
          onCancel={() => setScopeOpen(false)}
          onConfirm={confirmScopedDelete}
        />
      ) : null}
    </div>
  );
}

