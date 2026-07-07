import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/frontend/components/ui";
import { api, type ApiSession } from "@/frontend/lib/api";
import type { Account, CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";
import { getConsent, setConsent } from "../lib/consent";
import { downloadExpenseCsv } from "../lib/export";
import { clearAllLocalData } from "../lib/identity-storage";

/*
 * Data & privacy modal
 * ────────────────────
 * Sections:
 *   1. Active sessions   — list & revoke server sessions
 *   2. Email reminders   — global opt-out for all reminder emails
 *   3. Export your data  — client-side CSV download
 *   4. Data sharing      — third-party consent (server-persisted opt-in/out)
 *   5. Local data        — clear sessions, cookies & browser storage
 */

type DataPrivacyModalProps = {
  account: Account;
  expenses: Expense[];
  wallets?: FinancialWallet[];
  categoryIndex?: CategoryIndex;
  onClose: () => void;
  onSignedOut?: () => void;
};

export function DataPrivacyModal({ account, expenses, wallets = [], categoryIndex, onClose, onSignedOut }: DataPrivacyModalProps) {
  /* Consent: server is the source of truth; localStorage is a warm cache. */
  const [consent, setConsentState] = useState(() => getConsent(account.address));
  const [consentBusy, setConsentBusy] = useState(false);

  /* Email reminders: global preference stored on the user record. */
  const [remindersOn, setRemindersOn] = useState(true);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const [exported, setExported] = useState(false);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const count = expenses.length;

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
      .then(({ user }) => setRemindersOn(user.emailRemindersEnabled !== false))
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

  const exportCsv = () => {
    downloadExpenseCsv(expenses, wallets, categoryIndex);
    setExported(true);
    setTimeout(() => setExported(false), 2200);
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
                  <p className="consent-desc">Events can send you email reminders when you turn them on per event. Switching this off stops all reminder emails at once, without editing each event.</p>
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

          {/* 3. Export */}
          <div className="dm-sec">
            <span className="fld-label">Export your data</span>
            <p className="dm-lead">Download every transaction in your ledger as a CSV spreadsheet — open it in Excel, Numbers or Sheets. This is your own copy and is never shared.</p>
            <button className="primary-btn full" type="button" onClick={exportCsv}>
              <Icon name={exported ? "check" : "download"} size={17} />
              {exported ? "Downloaded" : "Export to CSV"}
            </button>
            <p className="dm-note">{count} transaction{count === 1 ? "" : "s"} across all months · saved to your device.</p>
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
