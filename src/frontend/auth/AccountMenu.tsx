import { TimezonePicker } from "@/frontend/components/TimezonePicker";
import { Icon } from "@/frontend/components/ui";
import { api } from "@/frontend/lib/api";
import type { Account, CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";
import type { ExpenseImportRow } from "./lib/import";
import { useEffect, useRef, useState } from "react";
import { DataPrivacyModal } from "./components/DataPrivacyModal";
import { Identicon } from "./components/Identicon";
import { CopyrightModal, TermsModal } from "./components/LegalModals";
import { RecoveryReveal } from "./components/RecoveryReveal";
import { copyText } from "./lib/clipboard";
import { shortAddr } from "./lib/format";
import { identityStorage } from "./lib/identity-storage";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

type AccountMenuProps = {
  account: Account;
  onSignOut: () => void;
  expenses: Expense[];
  wallets?: FinancialWallet[];
  categoryIndex?: CategoryIndex;
  activeWalletId?: string;
  onImportExpenses?: (rows: ExpenseImportRow[]) => Promise<{ imported: number; failed: number }>;
  onTakeTour?: () => void;
};

export function AccountMenu({
  account,
  onSignOut,
  expenses,
  wallets = [],
  categoryIndex,
  activeWalletId,
  onImportExpenses,
  onTakeTour,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [copyrightOpen, setCopyrightOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timezone, setTimezone] = useState(() => browserTimezone());
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [tzBusy, setTzBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.users
      .me()
      .then(({ user }) => {
        if (user.timezone) {
          setTimezone(user.timezone);
          setTimezoneSaved(true);
          return;
        }
        /* No timezone stored yet: persist the browser's zone so server-side
           reminder times match what the UI shows instead of the app default. */
        const tz = browserTimezone();
        api.users
          .updateMe({ timezone: tz })
          .then(() => {
            setTimezone(tz);
            setTimezoneSaved(true);
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, [account.address]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Portaled pickers render outside `.acct`; ignore their interactions.
      if (target?.closest?.(".picker-scrim")) return;
      if (ref.current && target && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const saveTimezone = async (next: string) => {
    setTimezone(next);
    setTzBusy(true);
    try {
      await api.users.updateMe({ timezone: next });
      setTimezoneSaved(true);
    } catch {
      api.users
        .me()
        .then(({ user }) => setTimezone(user.timezone ?? browserTimezone()))
        .catch(() => {});
    } finally {
      setTzBusy(false);
    }
  };

  const stored = identityStorage.find(account.address);

  return (
    <div className="acct" data-tour="tour-account" ref={ref}>
      <button
        className="acct-chip"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
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
          <div className="am-tz">
            <label className="am-tz-label" htmlFor="acct-tz">
              Default timezone
            </label>
            <p className="am-tz-hint">
              Event times and email reminders follow this zone. Vercel cron runs in UTC (Hobby: ±1 hour window).
            </p>
            <TimezonePicker
              id="acct-tz"
              className="am-tz-select"
              value={timezone}
              disabled={tzBusy}
              onChange={saveTimezone}
            />
            {!timezoneSaved ? (
              <p className="am-tz-note">Pick your timezone so reminders fire at the right local time.</p>
            ) : null}
          </div>
          <div className="am-div" />
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
          <button className="am-item" type="button" onClick={() => { setTermsOpen(true); setOpen(false); }}>
            <Icon name="file" size={16} /> Terms &amp; conditions
          </button>
          <button className="am-item" type="button" onClick={() => { setCopyrightOpen(true); setOpen(false); }}>
            <Icon name="info" size={16} /> Copyright
          </button>
          <div className="am-div" />
          {onTakeTour ? (
            <button className="am-item" type="button" onClick={() => { onTakeTour(); setOpen(false); }}>
              <Icon name="info" size={16} /> Take a tour
            </button>
          ) : null}
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
          activeWalletId={activeWalletId}
          onImportExpenses={onImportExpenses}
          onClose={() => setDataOpen(false)}
          onSignedOut={onSignOut}
        />
      ) : null}
      {termsOpen ? <TermsModal onClose={() => setTermsOpen(false)} /> : null}
      {copyrightOpen ? <CopyrightModal onClose={() => setCopyrightOpen(false)} /> : null}
    </div>
  );
}
