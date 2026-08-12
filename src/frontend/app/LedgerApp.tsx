import { AccountMenu } from "@/frontend/auth";
import { WhatsNewModal } from "@/frontend/auth/components/WhatsNewModal";
import type { LedgerBackupPlain } from "@/frontend/auth/lib/encrypted-backup";
import type { EventImportRow } from "@/frontend/auth/lib/import-events";
import type { TodoImportList } from "@/frontend/auth/lib/import-todos";
import { restoreBackupToLedger } from "@/frontend/auth/lib/restore-backup";
import { ThemeToggle } from "@/frontend/components/ThemeToggle";
import { WalletManageModal, WalletSwitcher } from "@/frontend/components/Wallets";
import {
  AddExpenseModal,
  Icon,
  MonthSwitcher,
  NAV_ITEMS,
  Sidebar,
} from "@/frontend/components/ui";
import { CURRENT_MONTH_KEY, MONTHS, TODAY_ISO } from "@/frontend/lib/data";
import { releaseHoldForOccurrence, restoreHoldForOccurrence } from "@/frontend/lib/envelope-holds";
import { useLedger } from "@/frontend/lib/hooks/useLedger";
import { useLedgerTour } from "@/frontend/lib/tour";
import { useWhatsNew } from "@/frontend/lib/whats-new";
import type { Account, Category, Expense, LedgerEvent, ViewId } from "@/frontend/lib/types";
import {
  Budgets as BudgetsView,
  Categories as CategoriesView,
  Insights,
  Overview,
  Recurring,
  Transactions,
} from "@/frontend/views";
import { EventModal, Schedule } from "@/frontend/views/Schedule";
import { TodoListView } from "@/frontend/views/TodoList";
import { Calculator } from "@/frontend/views/Calculator";
import { Transparency } from "@/frontend/views/Transparency";
import { useEffect, useMemo, useRef, useState } from "react";

/*
 * LedgerApp — authenticated app shell
 * ───────────────────────────────────
 * Desktop: sidebar + topbar + scrollable view.
 * Mobile (≤860px): bottom navigation replaces the sidebar.
 * Hosts the global modals (expense, wallet management, event).
 */

type LedgerAppProps = {
  account: Account;
  onSignOut: () => void;
};

const VIEW_TITLES: Record<ViewId, string> = {
  overview: "Overview",
  todos: "TO-DO List",
  schedule: "Schedule",
  transactions: "Transactions",
  budgets: "Budgets",
  calculator: "Calculator",
  categories: "Categories",
  recurring: "Recurring",
  insights: "Insights",
  transparency: "Transparency",
};

export function LedgerApp({ account, onSignOut }: LedgerAppProps) {
  const ledger = useLedger(account.address);
  const [view, setView] = useState<ViewId>("overview");
  const [modal, setModal] = useState<Expense | { add: true; eventId?: string; date?: string; note?: string } | null>(null);
  const [evModal, setEvModal] = useState<LedgerEvent | { add: true; date: string } | null>(null);
  const [evOccurrenceIso, setEvOccurrenceIso] = useState<string | undefined>(undefined);
  const [walletModal, setWalletModal] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const monthInitialized = useRef(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const tourReady = !ledger.isLoading && !ledger.error && !!ledger.profile;
  const { startViewTour } = useLedgerTour({ view, ready: tourReady });
  const { open: whatsNewOpen, openWhatsNew, closeWhatsNew } = useWhatsNew({
    ready: tourReady,
    accountCreatedAt: ledger.profile?.createdAt,
  });

  useEffect(() => {
    if (!fabOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFabOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setFabOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [fabOpen]);

  useEffect(() => {
    if (ledger.isLoading || ledger.error || monthInitialized.current || !ledger.profile) return;
    monthInitialized.current = true;
    if (ledger.profile.currentMonth !== CURRENT_MONTH_KEY) {
      ledger.setMonth(CURRENT_MONTH_KEY);
    }
  }, [ledger.isLoading, ledger.error, ledger.profile, ledger.setMonth]);

  /**
   * Subcategories with transaction history. A category holding any of these is
   * archived rather than deleted, so its past transactions keep resolving to
   * the right type — deleting a savings envelope outright would silently
   * reclassify its whole history as spending.
   */
  const usedSubIds = useMemo(
    () => new Set(ledger.expenses.map((e) => e.sub)),
    [ledger.expenses],
  );

  if (ledger.isLoading) {
    return (
      <div className="app app--loading">
        <div className="loading-state">Loading your ledger…</div>
      </div>
    );
  }

  if (ledger.error) {
    return (
      <div className="app app--loading">
        <div className="loading-state loading-state--error">
          Could not reach the server. Check that the API is running and try again.
        </div>
      </div>
    );
  }

  const { expenses, allExpenses, budgets, wallet, currency, events, month, wallets, activeWallet, setMonth, setBudgets, setActiveWalletId } = ledger;

  const saveExpense = async (data: Expense & { id?: string }) => {
    const walletId = data.walletId || activeWallet?.id;
    if (!walletId) return;
    const saved = await ledger.saveExpense({ ...data, walletId });
    if (data.eventId) {
      const ev = events.find((e) => e.id === data.eventId);
      if (ev) {
        try {
          let patch = releaseHoldForOccurrence(ev, data.date);
          if (!data.id && saved?.expense?.id) {
            patch = { ...patch, expenseId: saved.expense.id };
          }
          await ledger.saveEvent(patch);
        } catch {
          /* Link-back / hold release is best-effort; expense already saved. */
        }
      }
    }
    setModal(null);
  };

  /** Open expense modal prefilled from a schedule event. */
  const logPaymentFromEvent = (ev: { id: string; title: string; date: string; expenseId?: string }) => {
    if (ev.expenseId) {
      const linked = allExpenses.find((e) => e.id === ev.expenseId);
      if (linked) {
        setEvModal(null);
        setModal(linked);
        return;
      }
    }
    setEvModal(null);
    setModal({
      add: true,
      eventId: ev.id,
      date: ev.date,
      note: ev.title,
    });
  };

  const importExpenses = async (rows: Omit<Expense, "id">[], categories?: Category[]) => {
    let newCategories = 0;
    let newSubcategories = 0;
    if (categories) {
      const before = new Set(ledger.categoryIndex.allCategories.map((c) => c.id));
      const beforeSubs = new Set(
        ledger.categoryIndex.allCategories.flatMap((c) => c.subs.map((s) => s.id)),
      );
      await ledger.saveCategories(categories);
      newCategories = categories.filter((c) => !before.has(c.id)).length;
      newSubcategories = categories
        .flatMap((c) => c.subs)
        .filter((s) => !beforeSubs.has(s.id)).length;
    }

    let imported = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const walletId = row.walletId || activeWallet?.id;
        if (!walletId) {
          failed++;
          continue;
        }
        await ledger.saveExpense({ ...row, walletId });
        imported++;
      } catch {
        failed++;
      }
    }
    return { imported, failed, newCategories, newSubcategories };
  };

  const importEvents = async (rows: EventImportRow[]) => {
    let imported = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await ledger.saveEvent(row);
        imported++;
      } catch {
        failed++;
      }
    }
    return { imported, failed };
  };

  const importTodos = async (lists: TodoImportList[]) => {
    let importedLists = 0;
    let importedTasks = 0;
    let failed = 0;

    for (const listData of lists) {
      try {
        const existing =
          (listData.listId && ledger.todoLists.find((l) => l.id === listData.listId)) ||
          ledger.todoLists.find((l) => l.name.toLowerCase() === listData.name.toLowerCase());

        if (existing) {
          const existingIds = new Set(existing.tasks.map((t) => t.id));
          const merged = [...existing.tasks];
          for (const task of listData.tasks) {
            if (existingIds.has(task.id)) continue;
            merged.push(task);
            importedTasks++;
          }
          if (merged.length > existing.tasks.length) {
            await ledger.saveTodoList({ id: existing.id, tasks: merged });
          }
        } else {
          const created = await ledger.saveTodoList({ name: listData.name, icon: listData.icon });
          importedLists++;
          if (listData.tasks.length) {
            await ledger.saveTodoList({ id: created.id, tasks: listData.tasks });
            importedTasks += listData.tasks.length;
          }
        }
      } catch {
        failed++;
      }
    }

    return { importedLists, importedTasks, failed };
  };

  /** Restore an encrypted backup snapshot into the unlocked ledger. */
  const restoreBackup = async (plain: LedgerBackupPlain) => {
    return restoreBackupToLedger(
      plain,
      {
        address: account.address,
        wallets,
        expenses: allExpenses,
        events,
        todoLists: ledger.todoLists,
      },
      {
        saveCategories: ledger.saveCategories,
        saveWallet: async (w) => ledger.saveWallet(w),
        saveExpense: async (e) => {
          await ledger.saveExpense(e);
        },
        saveEvent: async (e) => {
          await ledger.saveEvent(e);
        },
        saveTodoList: async (t) => {
          await ledger.saveTodoList(t);
        },
      },
    );
  };

  const deleteExpense = async (id: string, opts?: { scope?: "this" | "future" | "all"; fromDate?: string }) => {
    const linkedEvent = events.find((ev) => ev.expenseId === id);
    const linkedExpense = allExpenses.find((expense) => expense.id === id);

    await ledger.deleteExpense(id, opts);

    if (linkedEvent) {
      const occurrenceIso = linkedExpense?.date ?? linkedEvent.date;
      await ledger.saveEvent(restoreHoldForOccurrence(linkedEvent, occurrenceIso));
    }

    setModal(null);
  };

  const saveEvent = async (data: LedgerEvent & { id?: string }) => {
    await ledger.saveEvent(data);
    setEvModal(null);
    setEvOccurrenceIso(undefined);
  };

  const deleteEvent = async (id: string, opts?: { scope?: "this" | "future" | "all"; fromDate?: string }) => {
    await ledger.deleteEvent(id, opts);
    setEvModal(null);
    setEvOccurrenceIso(undefined);
  };

  /** Open an event for edit with the calendar occurrence under the cursor. */
  const openEvent = (ev: LedgerEvent, occurrenceIso?: string) => {
    setEvOccurrenceIso(occurrenceIso ?? ev.date);
    setEvModal(ev);
  };

  const viewProps = { expenses, budgets, wallet, month, currency, categoryIndex: ledger.categoryIndex };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <main className="main">
        <header className="topbar">
          <div className="tb-row tb-row--main">
            <div className="page-title-row">
              <h1 key={view} className="page-title page-title--anim">{VIEW_TITLES[view]}</h1>
              <button
                type="button"
                className="tour-help-btn"
                aria-label={`Tour ${VIEW_TITLES[view]}`}
                onClick={() => startViewTour(view)}
              >
                <Icon name="info" size={17} />
              </button>
            </div>
            <div className="tb-actions">
              <ThemeToggle />
              <AccountMenu
                account={account}
                onSignOut={onSignOut}
                expenses={allExpenses}
                events={events}
                todoLists={ledger.todoLists}
                wallets={wallets}
                categoryIndex={ledger.categoryIndex}
                activeWalletId={activeWallet?.id}
                onImportExpenses={importExpenses}
                onImportEvents={importEvents}
                onImportTodos={importTodos}
                onRestoreBackup={restoreBackup}
                onTakeTour={() => startViewTour(view)}
                onWhatsNew={openWhatsNew}
              />
            </div>
          </div>
          {view !== "transparency" ? (
            <div className="tb-row tb-row--tools">
              {activeWallet && wallets.length ? (
                <WalletSwitcher
                  wallets={wallets}
                  activeId={activeWallet.id}
                  onChange={setActiveWalletId}
                  onManage={() => setWalletModal(true)}
                />
              ) : null}
              <MonthSwitcher months={MONTHS} current={month} onChange={setMonth} />
            </div>
          ) : null}
        </header>

        <div className="scroll">
          {view === "overview" && (
            <Overview
              {...viewProps}
              todoLists={ledger.todoLists}
              events={events}
              setView={setView}
              onEdit={setModal}
              onEditEvent={(ev: LedgerEvent) => openEvent(ev, TODAY_ISO)}
            />
          )}
          {view === "schedule" && (
            <Schedule
              events={events}
              month={month}
              currency={currency}
              onAddEvent={(iso: string) => {
                setEvOccurrenceIso(undefined);
                setEvModal({ add: true, date: iso });
              }}
              onEditEvent={openEvent}
            />
          )}
          {view === "todos" && (
            <TodoListView
              todoLists={ledger.todoLists}
              onSave={ledger.saveTodoList}
              onDelete={ledger.deleteTodoList}
            />
          )}
          {view === "transactions" && (
            <Transactions {...viewProps} onEdit={setModal} onDelete={deleteExpense} />
          )}
          {view === "budgets" && <BudgetsView {...viewProps} events={events} setBudgets={setBudgets} />}
          {view === "calculator" && (
            <Calculator
              wallet={wallet}
              budgets={budgets}
              setBudgets={setBudgets}
              currency={currency}
              categoryIndex={ledger.categoryIndex}
            />
          )}
          {view === "categories" && (
            <CategoriesView
              categoryIndex={ledger.categoryIndex}
              onSave={ledger.saveCategories}
              usedSubIds={usedSubIds}
            />
          )}
          {view === "recurring" && <Recurring {...viewProps} onEdit={setModal} />}
          {view === "insights" && <Insights {...viewProps} setMonth={setMonth} />}
          {view === "transparency" && <Transparency />}
          <div className="scroll-pad" />
        </div>
      </main>

      {/* Mobile bottom navigation (hidden on desktop via CSS) */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            data-tour={`tour-nav-${id}`}
            className={"bn-item" + (view === id ? " active" : "")}
            onClick={() => setView(id)}
            aria-label={label}
          >
            <Icon name={icon} size={21} />
            <span className="bn-label">{id === "todos" ? "To-dos" : label}</span>
          </button>
        ))}
      </nav>

      <div ref={fabRef} data-tour="tour-fab" className={"fab-wrap" + (fabOpen ? " open" : "") + (view === "transparency" ? " fab-wrap--hidden" : "")}>
        <div className="fab-actions" aria-hidden={!fabOpen}>
          <button
            className="fab-action"
            type="button"
            aria-label="Add Event"
            tabIndex={fabOpen ? 0 : -1}
            onClick={() => {
              setFabOpen(false);
              setEvModal({ add: true, date: TODAY_ISO });
            }}
          >
            <Icon name="calendar" size={20} />
            <span className="fab-action-label">Event</span>
          </button>
          <button
            className="fab-action"
            type="button"
            aria-label="Add Transaction"
            tabIndex={fabOpen ? 0 : -1}
            onClick={() => {
              setFabOpen(false);
              setModal({ add: true });
            }}
          >
            <Icon name="list" size={20} />
            <span className="fab-action-label">Transaction</span>
          </button>
        </div>
        <button
          className="fab"
          type="button"
          aria-label={fabOpen ? "Close Add Menu" : "Open Add Menu"}
          aria-expanded={fabOpen}
          onClick={() => setFabOpen((o) => !o)}
        >
          <Icon name="chevU" size={26} />
        </button>
      </div>

      {modal && activeWallet ? (
        <AddExpenseModal
          initial={
            "add" in modal
              ? modal.eventId || modal.date || modal.note
                ? {
                    eventId: modal.eventId,
                    date: modal.date,
                    note: modal.note,
                  }
                : null
              : modal
          }
          wallets={wallets}
          defaultWalletId={activeWallet.id}
          categoryIndex={ledger.categoryIndex}
          onSave={saveExpense}
          onClose={() => setModal(null)}
          onDelete={deleteExpense}
        />
      ) : null}
      {walletModal ? (
        <WalletManageModal
          wallets={wallets}
          activeId={activeWallet?.id ?? ""}
          onSave={ledger.saveWallet}
          onDelete={ledger.deleteWallet}
          onClose={() => setWalletModal(false)}
        />
      ) : null}
      {evModal && (
        <EventModal
          initial={"add" in evModal ? null : evModal}
          defaultDate={"add" in evModal ? evModal.date : undefined}
          occurrenceIso={"add" in evModal ? undefined : evOccurrenceIso}
          hasLinkedPayment={
            !("add" in evModal)
            && !!evModal.expenseId
            && allExpenses.some((expense) => expense.id === evModal.expenseId)
          }
          categoryIndex={ledger.categoryIndex}
          currency={currency}
          onSave={saveEvent}
          onLogPayment={logPaymentFromEvent}
          onClose={() => {
            setEvModal(null);
            setEvOccurrenceIso(undefined);
          }}
          onDelete={deleteEvent}
        />
      )}
      {whatsNewOpen ? <WhatsNewModal onClose={closeWhatsNew} /> : null}
    </div>
  );
}
