import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  glyphTint,
  Icon,
  SummaryCard,
} from "@/frontend/components/ui";
import { DatePicker, TimePicker } from "@/frontend/components/DateTimePicker";
import {
  CURRENT_MONTH_KEY,
  EVENT_CATS,
  LEAD_TIMES,
  REPEATS,
  TODAY_ISO,
  dayLabel,
  eventCatMeta,
  eventTimeLabel,
  fmtCommentTime,
  fmtTime,
  leadLabel,
  monthLabel,
  occursOn,
  repeatLabel,
  scheduleForMonth,
  weekdayLabel,
} from "@/frontend/lib/data";
import { CATEGORY_GLYPH_OPTIONS, displayGlyph } from "@/lib/glyphs";
import type { LedgerEvent } from "@/frontend/lib/types";

/*
 * Schedule view
 * ─────────────
 *   Schedule   — month calendar + upcoming agenda
 *   EventModal — add / edit an event, incl. email-reminder opt-in
 */

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftIso(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function AgendaEventRow({ ev, onEditEvent }: { ev: LedgerEvent; onEditEvent: (ev: LedgerEvent) => void }) {
  const c = eventCatMeta(ev);
  return (
    <button type="button" className="agenda-row" onClick={() => onEditEvent(ev)}>
      <span className="ag-glyph" style={glyphTint(c.color)}>{displayGlyph(c.glyph, c.id)}</span>
      <span className="ag-main">
        <span className="ag-title">
          {ev.title}
          {ev.repeat !== "once" && (
            <span className="ag-rep" title={repeatLabel(ev)}>
              <Icon name="repeat" size={12} />
            </span>
          )}
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
              <span>{leadLabel(ev.lead).toLowerCase()}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="ag-time">{eventTimeLabel(ev)}</span>
    </button>
  );
}

// ── Schedule (calendar + agenda) ────────────────────────────────────
export function Schedule({ events, month, onAddEvent, onEditEvent }) {
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
  const occ = useMemo(() => scheduleForMonth(events, month), [events, month]);
  const agenda = isCurrent ? occ.filter((o) => o.iso >= TODAY_ISO) : occ;

  const nextRem = agenda.find((o) => o.ev.notify);
  const alertsCount = occ.filter((o) => o.ev.notify).length;

  const eventsOn = (d: number) => {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    return events.filter((ev) => occursOn(ev, iso));
  };

  const eventsOnIso = (iso: string) => events.filter((ev) => occursOn(ev, iso));

  const defaultFocusDay =
    isCurrent && TODAY_ISO >= monthStart && TODAY_ISO <= monthEnd ? TODAY_ISO : monthStart;
  const viewDay = selectedDay ?? defaultFocusDay;
  const navAnchor = viewDay;

  const handleDayClick = (iso: string, dayEvents: LedgerEvent[]) => {
    if (dayEvents.length === 0) {
      onAddEvent(iso);
      return;
    }
    setSelectedDay(iso);
  };

  const navigateDay = (delta: number) => {
    const next = shiftIso(navAnchor, delta);
    if (next < monthStart || next > monthEnd) return;
    setSelectedDay(next);
  };

  const focusedEvents = eventsOnIso(viewDay);
  const canPrevDay = navAnchor > monthStart;
  const canNextDay = navAnchor < monthEnd;
  const upcomingTitle = isCurrent ? "Upcoming" : "Agenda";

  return (
    <div className="view">
      <div className="summary-grid sg-3" data-tour="tour-schedule-summary">
        <SummaryCard label="Events this month" value={String(occ.length)} sub={monthLabel(month, true)} />
        <SummaryCard label="Next reminder" tone="ok"
          value={nextRem ? dayLabel(nextRem.iso) : "—"}
          sub={nextRem ? `${nextRem.ev.title} · ${leadLabel(nextRem.ev.lead).toLowerCase()}` : "no upcoming reminders"} />
        <SummaryCard label="Email reminders" value={String(alertsCount)} sub="occurrences will notify you" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{monthLabel(month, true)}</h2>
            <p className="panel-sub">Click a day to view or add · click an event to edit</p>
          </div>
          <button className="add-btn add-btn--top" onClick={() => onAddEvent(isCurrent ? TODAY_ISO : `${month}-01`)}>
            <Icon name="plus" size={17} /> <span className="abt-txt">New event</span>
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
              const list = eventsOn(d);
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
                          onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }}>
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

      <section className="panel" data-tour="tour-schedule-agenda">
        <div className="panel-head panel-head--agenda">
          <div className="agenda-head">
            <button
              type="button"
              className="agenda-nav-btn"
              disabled={!canPrevDay}
              onClick={() => navigateDay(-1)}
              aria-label="Previous day"
            >
              <Icon name="chevL" size={18} />
            </button>
            <div className="agenda-head-main">
              <h2>{upcomingTitle}</h2>
              <p className="panel-sub">
                {dayLabel(viewDay)} · {weekdayLabel(viewDay)}
                {" · "}
                {focusedEvents.length} {focusedEvents.length === 1 ? "event" : "events"}
              </p>
            </div>
            <button
              type="button"
              className="agenda-nav-btn"
              disabled={!canNextDay}
              onClick={() => navigateDay(1)}
              aria-label="Next day"
            >
              <Icon name="chevR" size={18} />
            </button>
          </div>
        </div>
        <div className="agenda">
          {focusedEvents.length ? (
            <div className="agenda-group">
              <div className="agenda-date">
                <span className="agenda-dnum">{new Date(viewDay + "T00:00:00").getDate()}</span>
                <span className="agenda-dwd">{weekdayLabel(viewDay)}</span>
              </div>
              <div className="agenda-items">
                {focusedEvents.map((ev) => (
                  <AgendaEventRow key={ev.id} ev={ev} onEditEvent={onEditEvent} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No events this day"
              sub={
                viewDay === defaultFocusDay && !selectedDay
                  ? "Nothing on today — add an event or browse other days with the arrows."
                  : "Add something to this date or use the arrows to browse the month."
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

// ── EventModal (add / edit event) ───────────────────────────────────
export function EventModal({ initial, defaultDate, onSave, onClose, onDelete }) {
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
  const [lead, setLead] = useState(initial ? initial.lead : "1d");
  const [email, setEmail] = useState(initial && initial.email ? initial.email : lastEmail);
  const [comments, setComments] = useState(initial && initial.comments ? initial.comments : []);
  const [draft, setDraft] = useState("");

  const titleRef = useRef(null);
  useEffect(() => { if (titleRef.current) titleRef.current.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

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
  const valid = title.trim() && date && (allDay || time) && customOk;
  const submit = () => {
    if (!valid) return;
    if (notify && email.trim()) { try { localStorage.setItem("ledger:notifyEmail", email.trim()); } catch (e) {} }
    onSave({
      id: initial && initial.id, title: title.trim(), catId,
      customLabel: catId === "custom" ? customLabel.trim() : undefined,
      customGlyph: catId === "custom" ? customGlyph : undefined,
      date,
      allDay, time: allDay ? null : time, repeat,
      notify, lead, email: email.trim(), comments,
    });
  };

  return (
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{editing ? "Edit event" : "New event"}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body modal-scroll">
          <input ref={titleRef} className="ev-title-in" type="text" placeholder="Event title"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />

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
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span className="toggle-ui" /> <span>All-day event</span>
          </label>

          <label className="fld-label">Repeats</label>
          <div className="sub-row">
            {REPEATS.map((r) => (
              <button key={r.id} type="button" className={"sub-chip" + (repeat === r.id ? " active" : "")} onClick={() => setRepeat(r.id)}>{r.label}</button>
            ))}
          </div>

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
                  <div className="select-wrap">
                    <select className="text-in" value={lead} onChange={(e) => setLead(e.target.value)}>
                      {LEAD_TIMES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    <span className="select-caret"><Icon name="chevD" size={16} /></span>
                  </div>
                </div>
                <div>
                  <label className="fld-label">Send to</label>
                  <input className="text-in" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
            </div>
          )}

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
              <button className="cmt-send" type="button" disabled={!draft.trim()} onClick={addComment} aria-label="Post comment"><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          {editing ? <button className="ghost-btn danger" type="button" onClick={() => onDelete(initial.id)}>Delete</button> : <span />}
          <div className="mf-right">
            <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-btn" type="button" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Add event"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

