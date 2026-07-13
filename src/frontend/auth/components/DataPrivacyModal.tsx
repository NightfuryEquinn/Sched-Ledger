import { CsvImportPanel, type CsvImportPreview } from "@/frontend/auth/components/CsvImportPanel";
import { Icon } from "@/frontend/components/ui";
import { api, type ApiSession } from "@/frontend/lib/api";
import type { Account, Category, CategoryIndex, Expense, FinancialWallet, LedgerEvent, TodoList } from "@/frontend/lib/types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getConsent, setConsent } from "../lib/consent";
import { downloadEventsCsv } from "../lib/export-events";
import { downloadTodosCsv } from "../lib/export-todos";
import { downloadExpenseCsv } from "../lib/export";
import { parseEventsCsv } from "../lib/import-events";
import { parseTodosCsv, type TodoImportList } from "../lib/import-todos";
import { parseExpenseCsv, type ExpenseImportRow } from "../lib/import";
import { clearAllLocalData } from "../lib/identity-storage";

/*
 * Data & privacy modal
 * ────────────────────
 * Sections:
 *   1. Active sessions   — list & revoke server sessions
 *   2. Email reminders   — global opt-out for all reminder emails
 *   3. Your data         — CSV export & import (transactions, schedule, todos)
 *   4. Data sharing      — third-party consent (server-persisted opt-in/out)
 *   5. Local data        — clear sessions, cookies & browser storage
 */

type DataPrivacyModalProps = {
  account: Account;
  expenses: Expense[];
  events?: LedgerEvent[];
  todoLists?: TodoList[];
  wallets?: FinancialWallet[];
  categoryIndex?: CategoryIndex;
  activeWalletId?: string;
  onImportExpenses?: (
    rows: ExpenseImportRow[],
    categories?: Category[],
  ) => Promise<{ imported: number; failed: number; newCategories: number; newSubcategories: number }>;
  onImportEvents?: (
    rows: ReturnType<typeof parseEventsCsv>["rows"],
  ) => Promise<{ imported: number; failed: number }>;
  onImportTodos?: (
    lists: TodoImportList[],
  ) => Promise<{ importedLists: number; importedTasks: number; failed: number }>;
  onClose: () => void;
  onSignedOut?: () => void;
};

export function DataPrivacyModal({
  account,
  expenses,
  events = [],
  todoLists = [],
  wallets = [],
  categoryIndex,
  activeWalletId,
  onImportExpenses,
  onImportEvents,
  onImportTodos,
  onClose,
  onSignedOut,
}: DataPrivacyModalProps) {
  /* Consent: server is the source of truth; localStorage is a warm cache. */
  const [consent, setConsentState] = useState(() => getConsent(account.address));
  const [consentBusy, setConsentBusy] = useState(false);

  /* Email reminders: global preference stored on the user record. */
  const [remindersOn, setRemindersOn] = useState(true);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const [txnExported, setTxnExported] = useState(false);
  const [schedExported, setSchedExported] = useState(false);
  const [todoExported, setTodoExported] = useState(false);

  const [txnPreview, setTxnPreview] = useState<ReturnType<typeof parseExpenseCsv> | null>(null);
  const [schedPreview, setSchedPreview] = useState<ReturnType<typeof parseEventsCsv> | null>(null);
  const [todoPreview, setTodoPreview] = useState<ReturnType<typeof parseTodosCsv> | null>(null);

  const [txnBusy, setTxnBusy] = useState(false);
  const [schedBusy, setSchedBusy] = useState(false);
  const [todoBusy, setTodoBusy] = useState(false);

  const [txnResult, setTxnResult] = useState<{
    imported: number;
    failed: number;
    newCategories: number;
    newSubcategories: number;
  } | null>(null);
  const [schedResult, setSchedResult] = useState<{ imported: number; failed: number } | null>(null);
  const [todoResult, setTodoResult] = useState<{
    importedLists: number;
    importedTasks: number;
    failed: number;
  } | null>(null);

  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const txnCount = expenses.length;
  const eventCount = events.length;
  const todoTaskCount = todoLists.reduce((n, l) => n + l.tasks.length, 0);

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

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2200);
  };

  const isCsvFile = (file: File) => {
    const lower = file.name.toLowerCase();
    return lower.endsWith(".csv") || file.type === "text/csv";
  };

  const exportTransactions = () => {
    downloadExpenseCsv(expenses, wallets, categoryIndex);
    flash(setTxnExported);
  };

  const exportSchedule = () => {
    downloadEventsCsv(events);
    flash(setSchedExported);
  };

  const exportTodos = () => {
    downloadTodosCsv(todoLists);
    flash(setTodoExported);
  };

  const readTxnFile = async (file: File) => {
    if (!categoryIndex || !onImportExpenses) return;
    if (!isCsvFile(file)) {
      setTxnPreview({
        rows: [],
        errors: [{ row: 0, message: "Please choose a .csv file." }],
        notices: [],
        categories: categoryIndex.categories,
        stats: { newCategories: 0, newSubcategories: 0, walletRemapped: 0 },
      });
      setTxnResult(null);
      return;
    }
    const parsed = parseExpenseCsv(
      await file.text(),
      wallets,
      categoryIndex.categories,
      activeWalletId,
      expenses.map((e) => e.id),
    );
    setTxnPreview(parsed);
    setTxnResult(null);
  };

  const readSchedFile = async (file: File) => {
    if (!onImportEvents) return;
    if (!isCsvFile(file)) {
      setSchedPreview({ rows: [], errors: [{ row: 0, message: "Please choose a .csv file." }], notices: [], stats: { skipped: 0 } });
      setSchedResult(null);
      return;
    }
    setSchedPreview(parseEventsCsv(await file.text(), events.map((e) => e.id)));
    setSchedResult(null);
  };

  const readTodoFile = async (file: File) => {
    if (!onImportTodos) return;
    if (!isCsvFile(file)) {
      setTodoPreview({ lists: [], errors: [{ row: 0, message: "Please choose a .csv file." }], notices: [], stats: { newLists: 0, newTasks: 0 } });
      setTodoResult(null);
      return;
    }
    setTodoPreview(parseTodosCsv(await file.text(), todoLists));
    setTodoResult(null);
  };

  const runTxnImport = async () => {
    if (!txnPreview?.rows.length || !onImportExpenses || txnBusy) return;
    setTxnBusy(true);
    try {
      const { stats, categories } = txnPreview;
      const taxonomyChanged = stats.newCategories > 0 || stats.newSubcategories > 0;
      setTxnResult(await onImportExpenses(txnPreview.rows, taxonomyChanged ? categories : undefined));
      setTxnPreview(null);
    } finally {
      setTxnBusy(false);
    }
  };

  const runSchedImport = async () => {
    if (!schedPreview?.rows.length || !onImportEvents || schedBusy) return;
    setSchedBusy(true);
    try {
      setSchedResult(await onImportEvents(schedPreview.rows));
      setSchedPreview(null);
    } finally {
      setSchedBusy(false);
    }
  };

  const runTodoImport = async () => {
    if (!todoPreview?.lists.length || !onImportTodos || todoBusy) return;
    setTodoBusy(true);
    try {
      setTodoResult(await onImportTodos(todoPreview.lists));
      setTodoPreview(null);
    } finally {
      setTodoBusy(false);
    }
  };

  const txnExtraStats = txnPreview
    ? [
        txnPreview.stats.newCategories > 0 ? `${txnPreview.stats.newCategories} new categories` : "",
        txnPreview.stats.newSubcategories > 0 ? `${txnPreview.stats.newSubcategories} new subcategories` : "",
        txnPreview.stats.walletRemapped > 0 ? `${txnPreview.stats.walletRemapped} wallet remapped` : "",
      ].filter(Boolean).join(" · ")
    : "";

  const txnPanelPreview: CsvImportPreview | null = txnPreview
    ? {
        countLabel: txnPreview.rows.length
          ? `${txnPreview.rows.length} transaction${txnPreview.rows.length === 1 ? "" : "s"} ready to import`
          : "No valid transactions found",
        extraStats: txnExtraStats || undefined,
        errors: txnPreview.errors,
        notices: txnPreview.notices,
        canImport: txnPreview.rows.length > 0,
        importButtonLabel: `Import ${txnPreview.rows.length || ""} transaction${txnPreview.rows.length === 1 ? "" : "s"}`,
      }
    : null;

  const schedPanelPreview: CsvImportPreview | null = schedPreview
    ? {
        countLabel: schedPreview.rows.length
          ? `${schedPreview.rows.length} event${schedPreview.rows.length === 1 ? "" : "s"} ready to import`
          : "No valid events found",
        errors: schedPreview.errors,
        notices: schedPreview.notices,
        canImport: schedPreview.rows.length > 0,
        importButtonLabel: `Import ${schedPreview.rows.length || ""} event${schedPreview.rows.length === 1 ? "" : "s"}`,
      }
    : null;

  const todoTaskReady = todoPreview?.lists.reduce((n, l) => n + l.tasks.length, 0) ?? 0;
  const todoExtraStats = todoPreview
    ? [
        todoPreview.stats.newLists > 0 ? `${todoPreview.stats.newLists} new list${todoPreview.stats.newLists === 1 ? "" : "s"}` : "",
        todoPreview.stats.newTasks > 0 ? `${todoPreview.stats.newTasks} new task${todoPreview.stats.newTasks === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ")
    : "";

  const todoPanelPreview: CsvImportPreview | null = todoPreview
    ? {
        countLabel: todoTaskReady
          ? `${todoTaskReady} task${todoTaskReady === 1 ? "" : "s"} across ${todoPreview.lists.length} list${todoPreview.lists.length === 1 ? "" : "s"}`
          : "No valid tasks found",
        extraStats: todoExtraStats || undefined,
        errors: todoPreview.errors,
        notices: todoPreview.notices,
        canImport: todoPreview.lists.length > 0 && todoTaskReady > 0,
        importButtonLabel: `Import ${todoTaskReady || ""} task${todoTaskReady === 1 ? "" : "s"}`,
      }
    : null;

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
            <p className="dm-lead">Download or restore your ledger as CSV files — transactions, schedule events, and to-do lists each have their own export and import.</p>

            <p className="dm-subhead">Transactions</p>
            {onImportExpenses && categoryIndex ? (
              <CsvImportPanel
                importLead="Import transactions from a CSV you exported from Ledger."
                exported={txnExported}
                exportLabel="Export transactions"
                onExport={exportTransactions}
                countNote={`${txnCount} transaction${txnCount === 1 ? "" : "s"} across all wallets.`}
                onReadFile={readTxnFile}
                preview={txnPanelPreview}
                importBusy={txnBusy}
                onImport={() => void runTxnImport()}
                onClear={() => { setTxnPreview(null); setTxnResult(null); }}
                resultSummary={
                  txnResult
                    ? `Imported ${txnResult.imported} transaction${txnResult.imported === 1 ? "" : "s"}${txnResult.newCategories > 0 ? ` · ${txnResult.newCategories} categories created` : ""}${txnResult.newSubcategories > 0 ? ` · ${txnResult.newSubcategories} subcategories created` : ""}${txnResult.failed ? ` · ${txnResult.failed} failed` : ""}.${txnResult.imported > 0 ? " Refresh your views to see them." : ""}`
                    : null
                }
                resultPartial={!!txnResult?.failed}
                footnote="Re-importing skips duplicate transaction IDs. Missing categories are created automatically. Unmatched wallets import into your active wallet."
              />
            ) : (
              <>
                <button className="primary-btn full" type="button" onClick={exportTransactions}>
                  <Icon name={txnExported ? "check" : "download"} size={17} />
                  {txnExported ? "Downloaded" : "Export transactions"}
                </button>
                <p className="dm-note">{txnCount} transaction{txnCount === 1 ? "" : "s"} across all wallets.</p>
              </>
            )}

            <p className="dm-subhead">Schedule</p>
            {onImportEvents ? (
              <CsvImportPanel
                importLead="Import schedule events from a schedule CSV export."
                exported={schedExported}
                exportLabel="Export schedule"
                onExport={exportSchedule}
                countNote={`${eventCount} event${eventCount === 1 ? "" : "s"} in your calendar.`}
                onReadFile={readSchedFile}
                preview={schedPanelPreview}
                importBusy={schedBusy}
                onImport={() => void runSchedImport()}
                onClear={() => { setSchedPreview(null); setSchedResult(null); }}
                resultSummary={
                  schedResult
                    ? `Imported ${schedResult.imported} event${schedResult.imported === 1 ? "" : "s"}${schedResult.failed ? ` · ${schedResult.failed} failed` : ""}.${schedResult.imported > 0 ? " Refresh Schedule to see them." : ""}`
                    : null
                }
                resultPartial={!!schedResult?.failed}
                footnote="Re-importing skips duplicate event IDs. Comments are restored from the CommentsJson column when present."
              />
            ) : (
              <>
                <button className="primary-btn full" type="button" onClick={exportSchedule}>
                  <Icon name={schedExported ? "check" : "download"} size={17} />
                  {schedExported ? "Downloaded" : "Export schedule"}
                </button>
                <p className="dm-note">{eventCount} event{eventCount === 1 ? "" : "s"} in your calendar.</p>
              </>
            )}

            <p className="dm-subhead">TO-DO lists</p>
            {onImportTodos ? (
              <CsvImportPanel
                importLead="Import to-do lists and tasks from a todos CSV export."
                exported={todoExported}
                exportLabel="Export to-do lists"
                onExport={exportTodos}
                countNote={`${todoLists.length} list${todoLists.length === 1 ? "" : "s"} · ${todoTaskCount} task${todoTaskCount === 1 ? "" : "s"}.`}
                onReadFile={readTodoFile}
                preview={todoPanelPreview}
                importBusy={todoBusy}
                onImport={() => void runTodoImport()}
                onClear={() => { setTodoPreview(null); setTodoResult(null); }}
                resultSummary={
                  todoResult
                    ? `Imported ${todoResult.importedTasks} task${todoResult.importedTasks === 1 ? "" : "s"}${todoResult.importedLists > 0 ? ` into ${todoResult.importedLists} new list${todoResult.importedLists === 1 ? "" : "s"}` : ""}${todoResult.failed ? ` · ${todoResult.failed} failed` : ""}.${todoResult.importedTasks > 0 ? " Refresh TO-DO List to see them." : ""}`
                    : null
                }
                resultPartial={!!todoResult?.failed}
                footnote="Re-importing skips duplicate task IDs. New lists are created when needed; matching list names merge into existing lists."
              />
            ) : (
              <>
                <button className="primary-btn full" type="button" onClick={exportTodos}>
                  <Icon name={todoExported ? "check" : "download"} size={17} />
                  {todoExported ? "Downloaded" : "Export to-do lists"}
                </button>
                <p className="dm-note">{todoLists.length} list{todoLists.length === 1 ? "" : "s"} · {todoTaskCount} task{todoTaskCount === 1 ? "" : "s"}.</p>
              </>
            )}
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
