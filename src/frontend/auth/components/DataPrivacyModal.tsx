import { Icon } from "@/frontend/components/ui";
import { api, type ApiSession } from "@/frontend/lib/api";
import type { Account } from "@/frontend/lib/types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getConsent, setConsent } from "../lib/consent";
import { clearAllLocalData } from "../lib/identity-storage";

/*
 * Data & privacy modal
 * ────────────────────
 * Sections:
 *   1. Active sessions   — list & revoke server sessions
 *   2. Email reminders   — global opt-out for all reminder emails
 *   3. Budget alerts     — email notifications near category limits
 *   4. Data sharing      — third-party consent (server-persisted opt-in/out)
 *   5. Local data        — clear sessions, cookies & browser storage
 */

type DataPrivacyModalProps = {
  account: Account;
  onClose: () => void;
  onSignedOut?: () => void;
};

export function DataPrivacyModal({
  account,
  onClose,
  onSignedOut,
}: DataPrivacyModalProps) {
  /* Consent: server is the source of truth; localStorage is a warm cache. */
  const [consent, setConsentState] = useState(() => getConsent(account.address));
  const [consentBusy, setConsentBusy] = useState(false);

  /* Email reminders: global preference stored on the user record. */
  const [remindersOn, setRemindersOn] = useState(true);
  const [remindersBusy, setRemindersBusy] = useState(false);

  /* Budget alerts: email preference + notification address. */
  const [budgetAlertsOn, setBudgetAlertsOn] = useState(true);
  const [budgetAlertsBusy, setBudgetAlertsBusy] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyEmailDraft, setNotifyEmailDraft] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  useEffect(() => {
    api.auth.sessions().then(({ sessions: list }) => setSessions(list)).catch(() => {});
    api.consent
      .get()
      .then(({ consent: record }) => {
        setConsentState(record.optedIn);
        setConsent(account.address, record.optedIn);
      })
      .catch(() => {});
    api.users
      .me()
      .then(({ user }) => {
        setRemindersOn(user.emailRemindersEnabled !== false);
        setBudgetAlertsOn(user.budgetAlertsEnabled !== false);
        const email = user.notifyEmail?.trim() || "";
        setNotifyEmail(email);
        setNotifyEmailDraft(email);
      })
      .catch(() => {});
  }, [account.address]);

  /* ── Handlers ─────────────────────────────────────────────────── */

  const toggleConsent = async () => {
    const next = !consent;
    setConsentState(next);
    setConsentBusy(true);
    try {
      const { consent: record } = await api.consent.update(next);
      setConsentState(record.optedIn);
      setConsent(account.address, record.optedIn);
    } catch {
      setConsentState(!next); // revert on failure
    } finally {
      setConsentBusy(false);
    }
  };

  const toggleReminders = async () => {
    const next = !remindersOn;
    setRemindersOn(next);
    setRemindersBusy(true);
    try {
      await api.users.updateMe({ emailRemindersEnabled: next });
    } catch {
      setRemindersOn(!next); // revert on failure
    } finally {
      setRemindersBusy(false);
    }
  };

  const toggleBudgetAlerts = async () => {
    const next = !budgetAlertsOn;
    setBudgetAlertsOn(next);
    setBudgetAlertsBusy(true);
    try {
      await api.users.updateMe({ budgetAlertsEnabled: next });
    } catch {
      setBudgetAlertsOn(!next);
    } finally {
      setBudgetAlertsBusy(false);
    }
  };

  const saveNotifyEmail = async () => {
    const next = notifyEmailDraft.trim();
    if (next === notifyEmail) return;
    setEmailBusy(true);
    try {
      const { user } = await api.users.updateMe({ notifyEmail: next });
      const saved = user.notifyEmail?.trim() || "";
      setNotifyEmail(saved);
      setNotifyEmailDraft(saved);
      try {
        if (saved) localStorage.setItem("ledger:notifyEmail", saved);
      } catch {
        /* ignore */
      }
    } catch {
      setNotifyEmailDraft(notifyEmail);
    } finally {
      setEmailBusy(false);
    }
  };

  const revokeSession = async (id: string) => {
    setSessionsBusy(true);
    try {
      await api.auth.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setSessionsBusy(false);
    }
  };

  const revokeOthers = async () => {
    setSessionsBusy(true);
    try {
      await api.auth.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
    } finally {
      setSessionsBusy(false);
    }
  };

  const clearEverything = async () => {
    setClearBusy(true);
    try {
      await api.auth.clearAll();
      clearAllLocalData();
      onSignedOut?.();
      onClose();
    } finally {
      setClearBusy(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────────── */

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>Data &amp; privacy</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body modal-scroll">
          {/* 1. Active sessions */}
          <div className="dm-sec">
            <span className="fld-label">Active sessions</span>
            <p className="dm-lead">Each sign-in creates a secure session on this device or browser. Revoke any session you do not recognize to protect against phishing or unauthorized access.</p>
            <div className="session-list">
              {sessions.length ? sessions.map((s) => (
                <div key={s.id} className="session-row">
                  <div className="session-main">
                    <div className="session-device">{s.device}{s.current ? " · This device" : ""}</div>
                    <div className="session-meta num">Last active {new Date(s.lastSeenAt).toLocaleString()}</div>
                  </div>
                  {!s.current ? (
                    <button className="ghost-btn" type="button" disabled={sessionsBusy} onClick={() => revokeSession(s.id)}>Revoke</button>
                  ) : null}
                </div>
              )) : <p className="dm-note">No active sessions found.</p>}
            </div>
            {sessions.some((s) => !s.current) ? (
              <button className="ghost-btn full u-gap-top" type="button" disabled={sessionsBusy} onClick={revokeOthers}>
                Sign out all other devices
              </button>
            ) : null}
          </div>

          <div className="dm-div" />

          {/* 2. Email reminders (global opt-out) */}
          <div className="dm-sec">
            <span className="fld-label">Email reminders</span>
            <div className="consent-card">
              <div className="consent-top">
                <div>
                  <div className="consent-title">Allow reminder emails</div>
                  <p className="consent-desc">Events can send you email reminders when you turn them on per event. Switching this off stops all reminder delivery at once, without editing each event.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={remindersOn} disabled={remindersBusy} onChange={toggleReminders} />
                  <span className="toggle-ui" />
                </label>
              </div>
              <div className={`consent-status ${remindersOn ? "cs-on" : "cs-off"}`}>
                <span className="cs-dot" />
                {remindersOn ? "Enabled — events you opt into will email you" : "Disabled — no reminder emails will be sent"}
              </div>
            </div>
          </div>

          <div className="dm-div" />

          {/* 3. Budget alerts */}
          <div className="dm-sec">
            <span className="fld-label">Budget alerts</span>
            <p className="dm-lead">When a category reaches 80% of its monthly budget (or goes over), Sched Ledger can notify you. Spend amounts stay encrypted — only the alert summary is sent.</p>
            <div className="consent-card">
              <div className="consent-top">
                <div>
                  <div className="consent-title">Email when nearing a limit</div>
                  <p className="consent-desc">Uses the notification email below. One email per category per month at the warning and exceeded levels.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={budgetAlertsOn} disabled={budgetAlertsBusy} onChange={toggleBudgetAlerts} />
                  <span className="toggle-ui" />
                </label>
              </div>
              <div className={`consent-status ${budgetAlertsOn ? "cs-on" : "cs-off"}`}>
                <span className="cs-dot" />
                {budgetAlertsOn
                  ? notifyEmail
                    ? `Enabled — alerts go to ${notifyEmail}`
                    : "Enabled — add an email below to receive alerts"
                  : "Disabled — no budget alert emails"}
              </div>
            </div>

            <label className="fld u-gap-top">
              <p className="dm-subhead">Notification Email</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="text-in"
                  type="email"
                  placeholder="you@example.com"
                  value={notifyEmailDraft}
                  onChange={(e) => setNotifyEmailDraft(e.target.value)}
                  disabled={emailBusy}
                  style={{ flex: 1 }}
                />
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={emailBusy || notifyEmailDraft.trim() === notifyEmail}
                  onClick={saveNotifyEmail}
                >
                  Save
                </button>
              </div>
            </label>
          </div>

          <div className="dm-div" />

          {/* 4. Third-party data sharing consent */}
          <div className="dm-sec">
            <span className="fld-label">Third-party data sharing</span>
            <div className="consent-card">
              <div className="consent-top">
                <div>
                  <div className="consent-title">Sell anonymized spending data to partners</div>
                  <p className="consent-desc">When on, we share a de-identified copy of your category totals with vetted research &amp; advertising partners, who pay for the insight. Your name, address and notes are never included. Off by default — opt in or out anytime.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={consent} disabled={consentBusy} onChange={toggleConsent} />
                  <span className="toggle-ui" />
                </label>
              </div>
              <div className={`consent-status ${consent ? "cs-on" : "cs-off"}`}>
                <span className="cs-dot" />
                {consent ? "Opted in — sharing is active" : "Opted out — nothing is shared"}
              </div>
            </div>
            <p className="dm-note">Your choice is saved to your account and applies on every device. Withdrawing consent stops sharing immediately for future periods.</p>
          </div>

          <div className="dm-div" />

          {/* 5. Clear local data */}
          <div className="dm-sec">
            <span className="fld-label">Cookies &amp; local data</span>
            <p className="dm-lead">Sign out everywhere and remove Ledger data stored in this browser, including saved identities and preferences. Your ledger itself stays on the server — restore it anytime with your recovery phrase.</p>
            <button className="ghost-btn danger full" type="button" disabled={clearBusy} onClick={clearEverything}>
              {clearBusy ? "Clearing…" : "Clear sessions, cookies & local data"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
