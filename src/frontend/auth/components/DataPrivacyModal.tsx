import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/frontend/components/ui";
import { api, type ApiSession } from "@/frontend/lib/api";
import type { Account, Expense } from "@/frontend/lib/types";
import { getConsent, setConsent } from "../lib/consent";
import { downloadExpenseCsv } from "../lib/export";
import { clearAllLocalData } from "../lib/identity-storage";

type DataPrivacyModalProps = {
  account: Account;
  expenses: Expense[];
  onClose: () => void;
  onSignedOut?: () => void;
};

export function DataPrivacyModal({ account, expenses, onClose, onSignedOut }: DataPrivacyModalProps) {
  const [consent, setConsentState] = useState(() => getConsent(account.address));
  const [exported, setExported] = useState(false);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const count = expenses.length;

  useEffect(() => {
    api.auth.sessions().then(({ sessions: list }) => setSessions(list)).catch(() => {});
  }, []);

  const toggleConsent = () => {
    const next = !consent;
    setConsentState(next);
    setConsent(account.address, next);
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

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm modal-scroll">
        <div className="modal-head">
          <h3>Data &amp; privacy</h3>
          <button className="icon-btn" type="button" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

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
            <button className="ghost-btn full" type="button" style={{ marginTop: 10 }} disabled={sessionsBusy} onClick={revokeOthers}>
              Sign out all other devices
            </button>
          ) : null}
        </div>

        <div className="am-div" style={{ margin: "20px 2px" }} />

        <div className="dm-sec">
          <span className="fld-label">Export your data</span>
          <p className="dm-lead">Download every transaction in your ledger as a CSV spreadsheet — open it in Excel, Numbers or Sheets. This is your own copy and is never shared.</p>
          <button className="primary-btn full" type="button" onClick={() => { downloadExpenseCsv(expenses); setExported(true); setTimeout(() => setExported(false), 2200); }}>
            <Icon name={exported ? "check" : "download"} size={17} />
            {exported ? "Downloaded" : "Export to CSV"}
          </button>
          <p className="dm-note">{count} transaction{count === 1 ? "" : "s"} across all months · saved to your device.</p>
        </div>

        <div className="am-div" style={{ margin: "20px 2px" }} />

        <div className="dm-sec">
          <span className="fld-label">Third-party data sharing</span>
          <div className="consent-card">
            <div className="consent-top">
              <div>
                <div className="consent-title">Sell anonymized spending data to partners</div>
                <p className="consent-desc">When on, we share a de-identified copy of your category totals with vetted research &amp; advertising partners, who pay for the insight. Your name, address and notes are never included. Off by default — opt in or out anytime.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={consent} onChange={toggleConsent} />
                <span className="toggle-ui" />
              </label>
            </div>
            <div className={`consent-status ${consent ? "cs-on" : "cs-off"}`}>
              <span className="cs-dot" />
              {consent ? "Opted in — sharing is active" : "Opted out — nothing is shared"}
            </div>
          </div>
          <p className="dm-note">You can withdraw consent at any time; sharing stops immediately for future periods.</p>
        </div>

        <div className="am-div" style={{ margin: "20px 2px" }} />

        <div className="dm-sec">
          <span className="fld-label">Cookies &amp; local data</span>
          <p className="dm-lead">Clear your server session cookie and all Ledger data stored in this browser, including saved identities and preferences.</p>
          <button className="ghost-btn danger full" type="button" disabled={clearBusy} onClick={clearEverything}>
            {clearBusy ? "Clearing…" : "Clear sessions, cookies & local data"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
