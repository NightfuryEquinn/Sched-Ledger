import { getAddress } from "ethers";
import { useState } from "react";
import { Brand } from "@/frontend/components/Brand";
import { Icon } from "@/frontend/components/ui";
import { api } from "@/frontend/lib/api";
import type { Account, IdentityRecord } from "@/frontend/lib/types";
import { Identicon } from "./components/Identicon";
import { copyText } from "./lib/clipboard";
import { codenameFor } from "./lib/codename";
import { shortAddr } from "./lib/format";
import { identityStorage } from "./lib/identity-storage";
import { walletClient } from "./lib/wallet";

type DraftWallet = {
  address: string;
  mnemonic: string;
  privateKey: string;
};

type AuthScreenProps = {
  onAuth: (account: Account) => void;
};

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<"welcome" | "create" | "restore">("welcome");
  const [draft, setDraft] = useState<DraftWallet | null>(null);
  const [saved, setSaved] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const identities = identityStorage.list();

  const reset = () => {
    setMode("welcome");
    setDraft(null);
    setSaved(false);
    setPhrase("");
    setPhraseCopied(false);
    setError("");
    setBusy(false);
  };

  async function doGenerate() {
    setError("");
    setPhraseCopied(false);
    setBusy(true);
    try {
      setDraft(await walletClient.create());
    } catch {
      setError("Could not generate identity.");
    }
    setBusy(false);
  }

  const startCreate = () => {
    setMode("create");
    setDraft(null);
    setSaved(false);
    void doGenerate();
  };

  async function enterWith(idn: IdentityRecord) {
    setError("");
    setBusy(true);
    try {
      const { message } = await api.auth.challenge(idn.address);
      let signature = await walletClient.sign(idn, message);
      if (Array.isArray(signature)) signature = signature[0]!;
      await api.auth.verify({ address: idn.address, message, signature });
      const codename = codenameFor(idn.address);
      await api.users.upsert({ address: idn.address, codename, notifyEmail: "" });
      identityStorage.upsert({
        address: idn.address,
        codename,
        mnemonic: idn.mnemonic,
        privateKey: idn.privateKey,
        injected: !!idn.injected,
        lastSeen: Date.now(),
      });
      identityStorage.setSession(idn.address);
      onAuth({ address: idn.address, codename, injected: !!idn.injected });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }

  async function doImport() {
    setError("");
    setBusy(true);
    try {
      const wallet = await walletClient.fromMnemonic(phrase);
      await enterWith(wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That phrase isn't valid.");
      setBusy(false);
    }
  }

  async function connectInjected() {
    setError("");
    if (!walletClient.hasInjected()) {
      setError("No browser wallet detected on this device.");
      return;
    }
    try {
      const accs = await window.ethereum!.request({ method: "eth_requestAccounts" });
      const address = getAddress(accs[0]!);
      await enterWith({ address, injected: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection was cancelled.");
    }
  }

  if (mode === "create" && !draft) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <div className="gen-load"><div className="spinner" /><p>Generating your keys…</p></div>
      </div></div>
    );
  }

  if (mode === "create" && draft) {
    const words = draft.mnemonic.split(" ");
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={reset}>← Back</button>
        <h2 className="auth-h2">Meet your new identity</h2>
        <div className="identity-hero">
          <Identicon address={draft.address} size={54} radius={15} />
          <div>
            <div className="ih-name">{codenameFor(draft.address)}</div>
            <div className="ih-addr num">{shortAddr(draft.address)}</div>
          </div>
        </div>
        <div className="recovery">
          <div className="rec-label"><Icon name="key" size={15} /> Recovery phrase <span className="rec-warn">— write this down</span></div>
          <div className="phrase-grid">
            {words.map((w, i) => <span key={i} className="word"><b>{i + 1}</b>{w}</span>)}
          </div>
          <div className="rec-row2">
            <button className="mini-btn" type="button" onClick={() => { copyText(draft.mnemonic); setPhraseCopied(true); setTimeout(() => setPhraseCopied(false), 1200); }}>
              <Icon name={phraseCopied ? "check" : "copy"} size={14} /> {phraseCopied ? "Copied" : "Copy"}
            </button>
            <button className="mini-btn" type="button" onClick={doGenerate}><Icon name="repeat" size={14} /> Regenerate</button>
          </div>
        </div>
        <p className="rec-note2">This phrase is the only way to recover your ledger. We can't reset it, and anyone who has it controls your data.</p>
        <label className="toggle-line"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> <span className="toggle-ui" /> I've saved my recovery phrase</label>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" disabled={!saved || busy} onClick={() => enterWith(draft)}>{busy ? "Signing…" : "Sign & enter Ledger"}</button>
      </div></div>
    );
  }

  if (mode === "restore") {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={reset}>← Back</button>
        <h2 className="auth-h2">Welcome back</h2>
        {identities.length ? (
          <div className="known">
            <span className="known-label">On this device</span>
            {identities.map((i) => (
              <button key={i.address} className="known-row" type="button" disabled={busy} onClick={() => enterWith(i)}>
                <Identicon address={i.address} size={40} />
                <span className="kr-main">
                  <span className="kr-name">{i.codename || codenameFor(i.address)}</span>
                  <span className="kr-addr num">{shortAddr(i.address)}</span>
                </span>
                <Icon name="chevR" size={18} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="or-div"><span>import a recovery phrase</span></div>
        <textarea className="phrase-in" placeholder="Enter your 12-word recovery phrase, separated by spaces" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" disabled={busy || !phrase.trim()} onClick={doImport}>{busy ? "Restoring…" : "Restore identity"}</button>
        {walletClient.hasInjected() ? <button className="ghost-btn full u-gap-top" type="button" onClick={connectInjected}><Icon name="wallet" size={17} /> Connect browser wallet</button> : null}
      </div></div>
    );
  }

  return (
    <div className="auth-wrap"><div className="auth-card">
      <Brand variant="auth" />
      <h1 className="auth-h1">Private by design.</h1>
      <p className="auth-lead">Track every ringgit without handing over your name, email, or phone number. Your identity is a cryptographic key that only you hold — secured with Web3.</p>
      <div className="auth-actions">
        <button className="primary-btn lg full" type="button" onClick={startCreate}><Icon name="shield" size={18} /> Create anonymous identity</button>
        <button className="ghost-btn lg full" type="button" onClick={() => { setError(""); setMode("restore"); }}><Icon name="key" size={17} /> I already have one</button>
      </div>
      {walletClient.hasInjected() ? <button className="link-btn auth-injected" type="button" onClick={connectInjected}>or connect your browser wallet</button> : null}
      {error ? <div className="auth-error auth-error--gap">{error}</div> : null}
      <ul className="auth-feat">
        <li><Icon name="check" /> No email, phone, or password</li>
        <li><Icon name="check" /> Your data stays on your device</li>
        <li><Icon name="check" /> Sign in by signing with your key</li>
      </ul>
    </div></div>
  );
}
