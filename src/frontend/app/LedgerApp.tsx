import { useEffect, useRef, useState } from "react";
import { AccountMenu } from "@/frontend/auth";
import {
  AddExpenseModal,
  Icon,
  MonthSwitcher,
  NAV_ITEMS,
  Sidebar,
} from "@/frontend/components/ui";
import { WalletManageModal, WalletSwitcher } from "@/frontend/components/Wallets";
import { ThemeToggle } from "@/frontend/components/ThemeToggle";
import { CURRENT_MONTH_KEY, MONTHS, TODAY_ISO } from "@/frontend/lib/data";
import { useLedger } from "@/frontend/lib/hooks/useLedger";
import type { Account, Expense, LedgerEvent, ViewId } from "@/frontend/lib/types";
import { EventModal, Schedule } from "@/frontend/views/Schedule";
import { TodoListView } from "@/frontend/views/TodoList";
import {
  Budgets as BudgetsView,
  Categories as CategoriesView,
  Insights,
  Overview,
  Recurring,
  Transactions,
} from "@/frontend/views";

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
  categories: "Categories",
  recurring: "Recurring",
  insights: "Insights",
};

export function LedgerApp({ account, onSignOut }: LedgerAppProps) {
  const ledger = useLedger(account.address);
  const [view, setView] = useState<ViewId>("overview");
  const [modal, setModal] = useState<Expense | { add: true } | null>(null);
  const [evModal, setEvModal] = useState<LedgerEvent | { add: true; date: string } | null>(null);
  const [walletModal, setWalletModal] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const monthInitialized = useRef(false);
  const fabRef = useRef<HTMLDivElement>(null);

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
    await ledger.saveExpense({ ...data, walletId });
    setModal(null);
  };

  const deleteExpense = async (id: string) => {
    await ledger.deleteExpense(id);
    setModal(null);
  };

  const saveEvent = async (data: LedgerEvent & { id?: string }) => {
    await ledger.saveEvent(data);
    setEvModal(null);
  };

  const deleteEvent = async (id: string) => {
    await ledger.deleteEvent(id);
    setEvModal(null);
  };

  const viewProps = { expenses, budgets, wallet, month, currency, categoryIndex: ledger.categoryIndex };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <main className="main">
        <header className="topbar">
          <div className="tb-row tb-row--main">
            <h1 key={view} className="page-title page-title--anim">{VIEW_TITLES[view]}</h1>
            <div className="tb-actions">
              <ThemeToggle />
              <AccountMenu account={account} onSignOut={onSignOut} expenses={allExpenses} wallets={wallets} categoryIndex={ledger.categoryIndex} />
            </div>
          </div>
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
        </header>

        <div className="scroll">
          {view === "overview" && (
            <Overview {...viewProps} setView={setView} onEdit={setModal} />
          )}
          {view === "schedule" && (
            <Schedule
              events={events}
              month={month}
              onAddEvent={(iso: string) => setEvModal({ add: true, date: iso })}
              onEditEvent={(ev: LedgerEvent) => setEvModal(ev)}
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
          {view === "budgets" && <BudgetsView {...viewProps} setBudgets={setBudgets} />}
          {view === "categories" && (
            <CategoriesView
              categoryIndex={ledger.categoryIndex}
              onSave={ledger.saveCategories}
            />
          )}
          {view === "recurring" && <Recurring {...viewProps} onEdit={setModal} />}
          {view === "insights" && <Insights {...viewProps} setMonth={setMonth} />}
          <div className="scroll-pad" />
        </div>
      </main>

      {/* Mobile bottom navigation (hidden on desktop via CSS) */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={"bn-item" + (view === id ? " active" : "")}
            onClick={() => setView(id)}
            aria-label={label}
          >
            <Icon name={icon} size={21} />
            <span className="bn-label">{id === "todos" ? "To-dos" : label}</span>
          </button>
        ))}
      </nav>

      <div ref={fabRef} className={"fab-wrap" + (fabOpen ? " open" : "")}>
        <div className="fab-actions" aria-hidden={!fabOpen}>
          <button
            className="fab-action"
            type="button"
            aria-label="Add event"
            tabIndex={fabOpen ? 0 : -1}
            onClick={() => {
              setFabOpen(false);
              const date = month === CURRENT_MONTH_KEY ? TODAY_ISO : `${month}-01`;
              setEvModal({ add: true, date });
            }}
          >
            <Icon name="calendar" size={20} />
            <span className="fab-action-label">Event</span>
          </button>
          <button
            className="fab-action"
            type="button"
            aria-label="Add transaction"
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
          aria-label={fabOpen ? "Close add menu" : "Open add menu"}
          aria-expanded={fabOpen}
          onClick={() => setFabOpen((o) => !o)}
        >
          <Icon name="chevU" size={26} />
        </button>
      </div>

      {modal && activeWallet ? (
        <AddExpenseModal
          initial={"add" in modal ? null : modal}
          defaultMonth={month}
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
          onSave={saveEvent}
          onClose={() => setEvModal(null)}
          onDelete={deleteEvent}
        />
      )}
    </div>
  );
}
