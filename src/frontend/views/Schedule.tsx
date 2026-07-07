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
  EVENT_CAT_BY_ID,
  EVENT_CATS,
  LEAD_TIMES,
  REPEATS,
  TODAY_ISO,
  dayLabel,
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
import type { LedgerEvent } from "@/frontend/lib/types";

/*
 * Schedule view
 * ─────────────
 *   Schedule   — month calendar + upcoming agenda
 *   EventModal — add / edit an event, incl. email-reminder opt-in
 */

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Schedule (calendar + agenda) ────────────────────────────────────
export function Schedule({ events, month, onAddEvent, onEditEvent }) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const startOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const isCurrent = month === CURRENT_MONTH_KEY;
  const occ = useMemo(() => scheduleForMonth(events, month), [events, month]);
  const agenda = isCurrent ? occ.filter((o) => o.iso >= TODAY_ISO) : occ;

  // group agenda by date
  const groups = [];
  const gmap = {};
  agenda.forEach((o) => {
    if (!gmap[o.iso]) { gmap[o.iso] = []; groups.push(o.iso); }
    gmap[o.iso].push(o.ev);
  });

  const nextRem = agenda.find((o) => o.ev.notify);
  const alertsCount = occ.filter((o) => o.ev.notify).length;

  const eventsOn = (d) => {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    return events.filter((ev) => occursOn(ev, iso));
  };

  return (
    <div className="view">
      <div className="summary-grid sg-3">
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
            <p className="panel-sub">Click any day to schedule · click an event to edit</p>
          </div>
          <button className="add-btn add-btn--top" onClick={() => onAddEvent(isCurrent ? TODAY_ISO : `${month}-01`)}>
            <Icon name="plus" size={17} /> <span className="abt-txt">New event</span>
          </button>
        </div>

        <div className="cal">
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
                <div key={i} className={"cal-cell" + (today ? " today" : "") + (past ? " past" : "")}
                  onClick={() => onAddEvent(iso)}>
                  <div className="cal-daynum">{d}</div>
                  <div className="cal-events">
                    {list.slice(0, 3).map((ev) => {
                      const c = EVENT_CAT_BY_ID[ev.catId];
                      return (
                        <button key={ev.id} className="cal-chip" style={{ background: c.color + "1c", color: c.color }}
                          title={ev.title}
                          onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }}>
                          <span className="cal-chip-dot" style={{ background: c.color }} />
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

      <section className="panel">
        <div className="panel-head">
          <h2>{isCurrent ? "Upcoming" : "Agenda"}</h2>
          <p className="panel-sub">{agenda.length} {agenda.length === 1 ? "event" : "events"}</p>
        </div>
        <div className="agenda">
          {groups.length ? groups.map((iso) => (
            <div key={iso} className="agenda-group">
              <div className="agenda-date">
                <span className="agenda-dnum">{new Date(iso + "T00:00:00").getDate()}</span>
                <span className="agenda-dwd">{weekdayLabel(iso)}</span>
              </div>
              <div className="agenda-items">
                {gmap[iso].map((ev) => {
                  const c = EVENT_CAT_BY_ID[ev.catId];
                  return (
                    <button key={ev.id} className="agenda-row" onClick={() => onEditEvent(ev)}>
                      <span className="ag-glyph" style={glyphTint(c.color)}>{c.glyph}</span>
                      <span className="ag-main">
                        <span className="ag-title">
                          {ev.title}
                          {ev.repeat !== "once" && <span className="ag-rep" title={repeatLabel(ev)}><Icon name="repeat" size={12} /></span>}
                          {ev.comments && ev.comments.length > 0 && <span className="ag-cmt"><Icon name="comment" size={12} /> {ev.comments.length}</span>}
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
                })}
              </div>
            </div>
          )) : <EmptyState title="Nothing scheduled" sub={isCurrent ? "You're all clear for the rest of the month." : "Add an event to this month."} />}
        </div>
      </section>
    </div>
  );
}

// ── EventModal (add / edit event) ───────────────────────────────────
export function EventModal({ initial, defaultDate, onSave, onClose, onDelete }) {
  const editing = !!(initial && initial.id);
  const lastEmail = (() => { try { return localStorage.getItem("ledger:notifyEmail") || ""; } catch (e) { return ""; } })();

  const [title, setTitle] = useState(initial ? initial.title : "");
  const [catId, setCatId] = useState(initial ? initial.catId : "bill");
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

  const addComment = () => {
    const t = draft.trim();
    if (!t) return;
    setComments((cs) => [...cs, { id: "c" + Date.now(), text: t, at: new Date().toISOString() }]);
    setDraft("");
  };

  const valid = title.trim() && date && (allDay || time);
  const submit = () => {
    if (!valid) return;
    if (notify && email.trim()) { try { localStorage.setItem("ledger:notifyEmail", email.trim()); } catch (e) {} }
    onSave({
      id: initial && initial.id, title: title.trim(), catId, date,
      allDay, time: allDay ? null : time, repeat,
      notify, lead, email: email.trim(), comments,
    });
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{editing ? "Edit event" : "New event"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>

        <input ref={titleRef} className="ev-title-in" type="text" placeholder="Event title"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />

        <label className="fld-label">Type</label>
        <div className="cat-grid">
          {EVENT_CATS.map((c) => (
            <button key={c.id} className={"cat-chip" + (catId === c.id ? " active" : "")}
              style={catId === c.id ? { borderColor: c.color, background: c.color + "16" } : null}
              onClick={() => setCatId(c.id)}>
              <span className="cc-glyph" style={{ color: c.color }}>{c.glyph}</span>{c.name}
            </button>
          ))}
        </div>

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
            <button key={r.id} className={"sub-chip" + (repeat === r.id ? " active" : "")} onClick={() => setRepeat(r.id)}>{r.label}</button>
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
            <button className="cmt-send" disabled={!draft.trim()} onClick={addComment} aria-label="Post comment"><Icon name="send" size={17} /></button>
          </div>
        </div>

        <div className="modal-foot">
          {editing ? <button className="ghost-btn danger" onClick={() => onDelete(initial.id)}>Delete</button> : <span />}
          <div className="mf-right">
            <button className="ghost-btn" onClick={onClose}>Cancel</button>
            <button className="primary-btn" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Add event"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

