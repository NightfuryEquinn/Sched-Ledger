import { useEffect, useRef, useState } from "react";
import { Icon } from "@/frontend/components/ui";
import type { Account, CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";
import { DataPrivacyModal } from "./components/DataPrivacyModal";
import { Identicon } from "./components/Identicon";
import { RecoveryReveal } from "./components/RecoveryReveal";
import { copyText } from "./lib/clipboard";
import { shortAddr } from "./lib/format";
import { identityStorage } from "./lib/identity-storage";

type AccountMenuProps = {
  account: Account;
  onSignOut: () => void;
  expenses: Expense[];
  wallets?: FinancialWallet[];
  categoryIndex?: CategoryIndex;
};

export function AccountMenu({ account, onSignOut, expenses, wallets = [], categoryIndex }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const stored = identityStorage.find(account.address);

  return (
    <div className="acct" ref={ref}>
      <button className="acct-chip" type="button" onClick={() => setOpen((o) => !o)}>
        <Identicon address={account.address} size={28} radius={9} />
        <span className="acct-name">{account.codename}</span>
        <Icon name="chevD" size={15} />
      </button>
      {open ? (
        <div className="acct-menu">
          <div className="am-head">
            <Identicon address={account.address} size={40} />
            <div>
              <div className="am-name">{account.codename}</div>
              <div className="am-addr num">{shortAddr(account.address)}</div>
            </div>
          </div>
          <button className="am-item" type="button" onClick={() => { copyText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Address copied" : "Copy address"}
          </button>
          {stored?.mnemonic ? (
            <button className="am-item" type="button" onClick={() => { setReveal(true); setOpen(false); }}>
              <Icon name="key" size={16} /> Recovery phrase
            </button>
          ) : null}
          {stored?.injected ? (
            <div className="am-item am-item--static">
              <Icon name="wallet" size={16} /> Browser wallet
            </div>
          ) : null}
          <button className="am-item" type="button" onClick={() => { setDataOpen(true); setOpen(false); }}>
            <Icon name="database" size={16} /> Data &amp; privacy
          </button>
          <div className="am-div" />
          <button className="am-item danger" type="button" onClick={onSignOut}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      ) : null}
      {reveal && stored ? (
        <RecoveryReveal identity={stored} onClose={() => setReveal(false)} />
      ) : null}
      {dataOpen ? (
        <DataPrivacyModal
          account={account}
          expenses={expenses}
          wallets={wallets}
          categoryIndex={categoryIndex}
          onClose={() => setDataOpen(false)}
          onSignedOut={onSignOut}
        />
      ) : null}
    </div>
  );
}
