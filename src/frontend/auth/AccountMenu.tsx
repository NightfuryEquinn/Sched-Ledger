import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/frontend/components/ui";
import { api } from "@/frontend/lib/api";
import type { Account, CategoryIndex, Expense, FinancialWallet } from "@/frontend/lib/types";
import { formatTimezoneOption, timezoneOptions } from "@/lib/timezone";
import { DataPrivacyModal } from "./components/DataPrivacyModal";
import { Identicon } from "./components/Identicon";
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
};

export function AccountMenu({ account, onSignOut, expenses, wallets = [], categoryIndex }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timezone, setTimezone] = useState(() => browserTimezone());
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [tzBusy, setTzBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone]);

  useEffect(() => {
    api.users
      .me()
      .then(({ user }) => {
        if (user.timezone) {
          setTimezone(user.timezone);
          setTimezoneSaved(true);
        }
      })
      .catch(() => {});
  }, [account.address]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div className="acct" ref={ref}>
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
            <div className="select-wrap am-tz-select">
              <select
                id="acct-tz"
                value={timezone}
                disabled={tzBusy}
                onChange={(e) => saveTimezone(e.target.value)}
              >
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneOption(tz)}
                  </option>
                ))}
              </select>
              <span className="select-caret">
                <Icon name="chevD" size={15} />
              </span>
            </div>
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
