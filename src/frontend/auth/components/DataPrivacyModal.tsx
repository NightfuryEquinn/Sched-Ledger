import { Icon } from "@/frontend/components/ui";
import { api, type ApiSession } from "@/frontend/lib/api";
import type { Account, CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getConsent, setConsent } from "../lib/consent";
import { downloadExpenseCsv } from "../lib/export";
import { parseExpenseCsv, type ExpenseImportRow } from "../lib/import";
import { clearAllLocalData } from "../lib/identity-storage";

/*
 * Data & privacy modal
 * ────────────────────
 * Sections:
 *   1. Active sessions   — list & revoke server sessions
 *   2. Email reminders   — global opt-out for all reminder emails
 *   3. Your data         — CSV export & import
 *   4. Data sharing      — third-party consent (server-persisted opt-in/out)
 *   5. Local data        — clear sessions, cookies & browser storage
 */

type DataPrivacyModalProps = {
  account: Account;
  expenses: Expense[];
  wallets?: FinancialWallet[];
  categoryIndex?: CategoryIndex;
  activeWalletId?: string;
  onImportExpenses?: (rows: ExpenseImportRow[]) => Promise<{ imported: number; failed: number }>;
  onClose: () => void;
  onSignedOut?: () => void;
};

export function DataPrivacyModal({
  account,
  expenses,
  wallets = [],
  categoryIndex,
  activeWalletId,
  onImportExpenses,
  onClose,
  onSignedOut,
}: DataPrivacyModalProps) {
  /* Consent: server is the source of truth; localStorage is a warm cache. */
  const [consent, setConsentState] = useState(() => getConsent(account.address));
  const [consentBusy, setConsentBusy] = useState(false);

  /* Email reminders: global preference stored on the user record. */
  const [remindersOn, setRemindersOn] = useState(true);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const [exported, setExported] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ReturnType<typeof parseExpenseCsv> | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const resetImport = () => {
    setImportFileName(null);
    setImportPreview(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const readCsvFile = async (file: File) => {
    if (!categoryIndex || !onImportExpenses) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && file.type !== "text/csv") {
      setImportPreview({ rows: [], errors: [{ row: 0, message: "Please choose a .csv file." }] });
      setImportFileName(file.name);
      setImportResult(null);
      return;
    }
    const text = await file.text();
    const existingIds = expenses.map((e) => e.id);
    const parsed = parseExpenseCsv(text, wallets, categoryIndex, activeWalletId, existingIds);
    setImportFileName(file.name);
    setImportPreview(parsed);
    setImportResult(null);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void readCsvFile(files[0]);
  };

  const runImport = async () => {
    if (!importPreview?.rows.length || !onImportExpenses || importBusy) return;
    setImportBusy(true);
    try {
      const result = await onImportExpenses(importPreview.rows);
      setImportResult(result);
      setImportPreview(null);
      setImportFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setImportBusy(false);
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

          {/* 3. Export & import */}
          <div className="dm-sec">
            <span className="fld-label">Your data</span>
            <p className="dm-lead">Download every transaction in your ledger as a CSV spreadsheet — open it in Excel, Numbers or Sheets. This is your own copy and is never shared.</p>
            <button className="primary-btn full" type="button" onClick={exportCsv}>
              <Icon name={exported ? "check" : "download"} size={17} />
              {exported ? "Downloaded" : "Export to CSV"}
            </button>
            <p className="dm-note">{count} transaction{count === 1 ? "" : "s"} across all months · saved to your device.</p>

            {onImportExpenses && categoryIndex ? (
              <>
                <p className="dm-lead dm-lead--gap">Import a CSV you exported from Ledger to add those transactions back into your account. Drag and drop a file here, or click to browse.</p>
                <div
                  className={`csv-dropzone${dragging ? " csv-dropzone--drag" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Import CSV file"
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                >
                  <Icon name="file" size={22} />
                  <p className="csv-dropzone-text">
                    {importFileName ? (
                      <>Selected: <strong>{importFileName}</strong></>
                    ) : (
                      <>Drop your CSV here or <span className="csv-dropzone-link">choose a file</span></>
                    )}
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => handleFiles(e.target.files)}
                />

                {importPreview ? (
                  <div className="csv-import-preview">
                    <p className="csv-import-count">
                      {importPreview.rows.length
                        ? `${importPreview.rows.length} transaction${importPreview.rows.length === 1 ? "" : "s"} ready to import`
                        : "No valid transactions found"}
                      {importPreview.errors.length
                        ? ` · ${importPreview.errors.length} row${importPreview.errors.length === 1 ? "" : "s"} skipped`
                        : ""}
                    </p>
                    {importPreview.errors.length ? (
                      <ul className="csv-import-errors">
                        {importPreview.errors.slice(0, 5).map((err) => (
                          <li key={`${err.row}-${err.message}`}>
                            {err.row > 0 ? `Row ${err.row}: ` : ""}{err.message}
                          </li>
                        ))}
                        {importPreview.errors.length > 5 ? (
                          <li>…and {importPreview.errors.length - 5} more</li>
                        ) : null}
                      </ul>
                    ) : null}
                    <div className="csv-import-actions">
                      <button
                        className="primary-btn"
                        type="button"
                        disabled={!importPreview.rows.length || importBusy}
                        onClick={() => void runImport()}
                      >
                        {importBusy ? "Importing…" : `Import ${importPreview.rows.length || ""} transaction${importPreview.rows.length === 1 ? "" : "s"}`}
                      </button>
                      <button className="ghost-btn" type="button" disabled={importBusy} onClick={resetImport}>
                        Clear
                      </button>
                    </div>
                  </div>
                ) : null}

                {importResult ? (
                  <p className={`csv-import-summary${importResult.failed ? " csv-import-summary--partial" : ""}`}>
                    Imported {importResult.imported} transaction{importResult.imported === 1 ? "" : "s"}
                    {importResult.failed ? ` · ${importResult.failed} failed` : ""}.
                    {importResult.imported > 0 ? " Refresh your views to see them." : ""}
                  </p>
                ) : null}

                <p className="dm-note">Re-importing the same export skips rows whose ID is already in your ledger. Category and wallet names must match your ledger.</p>
              </>
            ) : null}
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
