import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrency } from "@/frontend/lib/data";
import type { FinancialWallet } from "@/frontend/lib/types";
import { CurrencyPicker } from "./CurrencyPicker";
import { Icon, Segmented, WalletPicker } from "./ui";

/*
 * Wallets
 * ───────
 *   WalletSwitcher    — topbar dropdown to switch the active wallet
 *   WalletManageModal — list / add / edit / delete wallets
 */

type WalletSwitcherProps = {
  wallets: FinancialWallet[];
  activeId: string;
  onChange: (id: string) => void;
  onManage: () => void;
};

export function WalletSwitcher({ wallets, activeId, onChange, onManage }: WalletSwitcherProps) {
  return (
    <WalletPicker wallets={wallets} value={activeId} onChange={onChange} onManage={onManage} />
  );
}

type WalletManageModalProps = {
  wallets: FinancialWallet[];
  activeId: string;
  onSave: (data: Partial<FinancialWallet> & { id?: string; name?: string; currency?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

export function WalletManageModal({ wallets, onSave, onDelete, onClose }: WalletManageModalProps) {
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [fundingMode, setFundingMode] = useState<"monthly" | "starting">("monthly");
  const [income, setIncome] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const startAdd = () => {
    setMode("add");
    setEditId(null);
    setName("");
    setCurrency("MYR");
    setFundingMode("monthly");
    setIncome("0");
    setStartingBalance("0");
    setError("");
  };

  const startEdit = (w: FinancialWallet) => {
    setMode("edit");
    setEditId(w.id);
    setName(w.name);
    setCurrency(w.currency);
    setFundingMode(w.fundingMode);
    setIncome(String(w.income));
    setStartingBalance(String(w.startingBalance));
    setError("");
  };

  const backToList = () => {
    setMode("list");
    setError("");
  };

  const submit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({
        id: editId ?? undefined,
        name: name.trim(),
        currency,
        fundingMode,
        income: fundingMode === "monthly" ? Math.max(0, Math.round(parseFloat(income) || 0)) : 0,
        startingBalance: fundingMode === "starting" ? Math.max(0, Math.round(parseFloat(startingBalance) || 0)) : 0,
      });
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save wallet");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await onDelete(id);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete wallet");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "list" ? "Wallets" : mode === "add" ? "Add wallet" : "Edit wallet";

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body modal-scroll">
          {mode === "list" ? (
            <div className="dm-sec">
              <span className="fld-label">Your wallets</span>
              <p className="dm-lead">
                Track spending in separate purses — each wallet has its own currency, income, and budgets.
              </p>
              <div className="session-list">
                {wallets.map((w) => {
                  const cur = getCurrency(w.currency);
                  return (
                    <div key={w.id} className="session-row">
                      <div className="session-main">
                        <div className="session-device">
                          {w.name}
                          {w.isDefault ? <span className="wallet-badge">Default</span> : null}
                        </div>
                        <div className="session-meta num">
                          {cur.code} · {cur.symbol} ·{" "}
                          {w.fundingMode === "starting"
                            ? `Starting ${cur.symbol}${w.startingBalance.toLocaleString()}`
                            : `Income ${cur.symbol}${w.income.toLocaleString()}/mo`}
                        </div>
                      </div>
                      <button className="ghost-btn" type="button" onClick={() => startEdit(w)}>Edit</button>
                    </div>
                  );
                })}
              </div>
              <button className="primary-btn full u-gap-top" type="button" onClick={startAdd}>
                <Icon name="plus" size={17} /> Add wallet
              </button>
              <p className="dm-note">{wallets.length} wallet{wallets.length === 1 ? "" : "s"} · switch between them from the top bar.</p>
            </div>
          ) : (
            <div className="dm-sec">
              <span className="fld-label">Wallet details</span>
              <p className="dm-lead">
                {mode === "add"
                  ? "Give this wallet a name, pick its currency, and choose how to fund it."
                  : "Update the wallet name or funding settings."}
              </p>

              <label className="fld-label" htmlFor="wallet-name">Name</label>
              <input
                id="wallet-name"
                className="text-in wallet-field"
                type="text"
                placeholder="e.g. Cash, Maybank, Travel USD"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />

              <label className="fld-label" htmlFor="wallet-currency">Currency</label>
              <CurrencyPicker
                id="wallet-currency"
                className="wallet-field"
                value={currency}
                onChange={setCurrency}
                disabled={mode === "edit"}
              />
              {mode === "edit" ? (
                <p className="dm-note dm-note--pull">Currency cannot be changed after creation.</p>
              ) : null}

              <label className="fld-label">Funding</label>
              <div className="wallet-seg">
                <Segmented
                  options={[
                    { v: "monthly", label: "Monthly income" },
                    { v: "starting", label: "Starting balance" },
                  ]}
                  value={fundingMode}
                  onChange={setFundingMode}
                />
              </div>
              <p className="dm-note dm-note--pull dm-note--gap">
                {fundingMode === "monthly"
                  ? "Set a monthly income budget. Add salary, wages, and bonuses as income transactions."
                  : "Set how much money this wallet started with. Track top-ups as income transactions."}
              </p>

              {fundingMode === "monthly" ? (
                <>
                  <label className="fld-label">Monthly income</label>
                  <div className="amount-field compact wallet-amount">
                    <span className="amount-cur">{getCurrency(currency).symbol}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <label className="fld-label">Starting balance</label>
                  <div className="amount-field compact wallet-amount">
                    <span className="amount-cur">{getCurrency(currency).symbol}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(e.target.value)}
                    />
                  </div>
                </>
              )}

              {error ? <p className="auth-error">{error}</p> : null}

              {mode === "edit" && editId && wallets.length > 1 ? (
                <>
                  <div className="dm-div" />
                  <span className="fld-label">Remove wallet</span>
                  <p className="dm-lead">Delete this wallet only if it has no transactions. This cannot be undone.</p>
                  <button className="ghost-btn danger full" type="button" disabled={busy} onClick={() => remove(editId)}>
                    Delete wallet
                  </button>
                </>
              ) : null}

              <div className="wallet-form-actions">
                <button className="ghost-btn full" type="button" onClick={backToList}>Back</button>
                <button className="primary-btn full" type="button" disabled={busy || !name.trim()} onClick={submit}>
                  {busy ? "Saving…" : mode === "add" ? "Add wallet" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
