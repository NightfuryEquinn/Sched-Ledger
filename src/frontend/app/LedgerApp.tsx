import { useState } from "react";
import { AccountMenu } from "@/frontend/auth";
import {
  AddExpenseModal,
  Icon,
  MonthSwitcher,
  Sidebar,
} from "@/frontend/components/ui";
import { ThemeToggle } from "@/frontend/components/ThemeToggle";
import { MONTHS } from "@/frontend/lib/data";
import { useLedger } from "@/frontend/lib/hooks/useLedger";
import type { Account, Expense, LedgerEvent, ViewId } from "@/frontend/lib/types";
import { EventModal, Schedule } from "@/frontend/views/Schedule";
import {
  Budgets as BudgetsView,
  Insights,
  Overview,
  Recurring,
  Transactions,
} from "@/frontend/views";

type LedgerAppProps = {
  account: Account;
  onSignOut: () => void;
};

const VIEW_TITLES: Record<ViewId, string> = {
  overview: "Overview",
  transactions: "Transactions",
  budgets: "Budgets",
  schedule: "Schedule",
  insights: "Insights",
  recurring: "Recurring",
};

export function LedgerApp({ account, onSignOut }: LedgerAppProps) {
  const ledger = useLedger(account.address);
  const [view, setView] = useState<ViewId>("overview");
  const [modal, setModal] = useState<Expense | { add: true } | null>(null);
  const [evModal, setEvModal] = useState<LedgerEvent | { add: true; date: string } | null>(null);

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

  const { expenses, budgets, income, events, month, setMonth, setBudgets } = ledger;

  const saveExpense = async (data: Expense & { id?: string }) => {
    await ledger.saveExpense(data);
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

  const viewProps = { expenses, budgets, income, month };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <main className="main">
        <header className="topbar">
          <div className="tb-left">
            <h1 className="page-title">{VIEW_TITLES[view]}</h1>
          </div>
          <div className="tb-right">
            <ThemeToggle />
            <MonthSwitcher months={MONTHS} current={month} onChange={setMonth} />
            <AccountMenu account={account} onSignOut={onSignOut} expenses={expenses} />
          </div>
        </header>

        <div className="scroll">
          {view === "overview" && (
            <Overview {...viewProps} setView={setView} onEdit={setModal} />
          )}
          {view === "transactions" && (
            <Transactions {...viewProps} onEdit={setModal} onDelete={deleteExpense} />
          )}
          {view === "budgets" && <BudgetsView {...viewProps} setBudgets={setBudgets} />}
          {view === "schedule" && (
            <Schedule
              events={events}
              month={month}
              onAddEvent={(iso: string) => setEvModal({ add: true, date: iso })}
              onEditEvent={(ev: LedgerEvent) => setEvModal(ev)}
            />
          )}
          {view === "insights" && <Insights {...viewProps} setMonth={setMonth} />}
          {view === "recurring" && <Recurring {...viewProps} onEdit={setModal} />}
          <div className="scroll-pad" />
        </div>
      </main>

      <nav className="bottom-nav">
        {(
          [
            ["overview", "overview"],
            ["transactions", "list"],
            ["budgets", "budget"],
            ["schedule", "calendar"],
            ["insights", "insights"],
            ["recurring", "recurring"],
          ] as const
        ).map(([id, ic]) => (
          <button
            key={id}
            type="button"
            className={"bn-item" + (view === id ? " active" : "")}
            onClick={() => setView(id)}
          >
            <Icon name={ic} size={22} />
          </button>
        ))}
      </nav>

      <button
        className="fab"
        type="button"
        aria-label="Add expense"
        onClick={() => setModal({ add: true })}
      >
        <Icon name="plus" size={26} />
      </button>

      {modal && (
        <AddExpenseModal
          initial={"add" in modal ? null : modal}
          defaultMonth={month}
          onSave={saveExpense}
          onClose={() => setModal(null)}
          onDelete={deleteExpense}
        />
      )}
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
