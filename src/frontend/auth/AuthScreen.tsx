import { Brand } from "@/frontend/components/Brand";
import { LoadingBloom } from "@/frontend/components/LoadingBloom";
import { Icon } from "@/frontend/components/ui";
import { api } from "@/frontend/lib/api";
import type { Account, IdentityRecord } from "@/frontend/lib/types";
import { getAddress } from "ethers";
import { useMemo, useState } from "react";
import { Identicon } from "./components/Identicon";
import {
  checkQuizAnswers,
  isValidPassphrase,
  pickQuizIndices,
  unwrapSecrets,
  wrapSecrets,
} from "./lib/device-vault";
import { copyText } from "./lib/clipboard";
import { codenameFor } from "./lib/codename";
import { shortAddr } from "./lib/format";
import { identityStorage } from "./lib/identity-storage";
import { sessionSecrets } from "./lib/session-secrets";
import { unlockLedgerKey } from "@/frontend/lib/crypto/unlock";
import { walletClient } from "./lib/wallet";

type DraftWallet = {
  address: string;
  mnemonic: string;
  privateKey: string;
};

type AuthScreenProps = {
  onAuth: (account: Account) => void;
};

type AuthMode = "welcome" | "create" | "quiz" | "passphrase" | "restore" | "device-unlock";

/** Persist vaulted (or injected) identity, unlock E2EE, and enter the app. */
async function finishAuth(
  idn: IdentityRecord & { mnemonic?: string; privateKey?: string },
  onAuth: (account: Account) => void,
) {
  const { message } = await api.auth.challenge(idn.address);
  let signature = await walletClient.sign(idn, message);
  if (Array.isArray(signature)) signature = signature[0]!;
  await api.auth.verify({ address: idn.address, message, signature });
  const codename = codenameFor(idn.address);
  await api.users.upsert({ address: idn.address, codename, notifyEmail: "" });

  const stored: IdentityRecord = {
    address: idn.address,
    codename,
    injected: !!idn.injected,
    lastSeen: Date.now(),
  };
  if (idn.vault) stored.vault = idn.vault;
  identityStorage.upsert(stored);
  identityStorage.setSession(idn.address);

  if (idn.privateKey && idn.mnemonic) {
    sessionSecrets.set(idn.address, {
      mnemonic: idn.mnemonic,
      privateKey: idn.privateKey,
    });
  }

  await unlockLedgerKey({
    ...idn,
    privateKey: idn.privateKey ?? sessionSecrets.get(idn.address)?.privateKey,
  });
  onAuth({ address: idn.address, codename, injected: !!idn.injected });
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("welcome");
  const [draft, setDraft] = useState<DraftWallet | null>(null);
  const [saved, setSaved] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quizIndices, setQuizIndices] = useState<number[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [pendingIdn, setPendingIdn] = useState<IdentityRecord | null>(null);
  const [unlockPass, setUnlockPass] = useState("");
  const identities = identityStorage.list();

  const words = useMemo(
    () => (draft?.mnemonic ? draft.mnemonic.split(" ") : []),
    [draft?.mnemonic],
  );

  const reset = () => {
    setMode("welcome");
    setDraft(null);
    setSaved(false);
    setPhrase("");
    setPhraseCopied(false);
    setError("");
    setBusy(false);
    setQuizIndices([]);
    setQuizAnswers({});
    setPassphrase("");
    setPassphrase2("");
    setPendingIdn(null);
    setUnlockPass("");
  };

  async function doGenerate() {
    setError("");
    setPhraseCopied(false);
    setBusy(true);
    try {
      setDraft(await walletClient.create());
      setSaved(false);
      setQuizIndices([]);
      setQuizAnswers({});
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

  /** Advance from phrase screen to the recovery quiz. */
  const startQuiz = () => {
    if (!draft || !saved) return;
    setQuizIndices(pickQuizIndices(words.length, 3));
    setQuizAnswers({});
    setError("");
    setMode("quiz");
  };

  /** After quiz, collect a device passphrase to wrap the vault. */
  const startPassphrase = () => {
    if (!draft) return;
    if (!checkQuizAnswers(words, quizIndices, quizAnswers)) {
      setError("Those words don't match. Check your written phrase and try again.");
      return;
    }
    setError("");
    setPassphrase("");
    setPassphrase2("");
    setMode("passphrase");
  };

  /** Wrap draft secrets and sign in. */
  async function sealAndEnter() {
    if (!draft) return;
    setError("");
    if (!isValidPassphrase(passphrase)) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== passphrase2) {
      setError("Passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      const vault = await wrapSecrets(passphrase, {
        mnemonic: draft.mnemonic,
        privateKey: draft.privateKey,
      });
      await finishAuth(
        {
          address: draft.address,
          mnemonic: draft.mnemonic,
          privateKey: draft.privateKey,
          vault,
        },
        onAuth,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }

  /** Restore from typed recovery phrase → set device passphrase. */
  async function doImport() {
    setError("");
    setBusy(true);
    try {
      const wallet = await walletClient.fromMnemonic(phrase);
      setDraft(wallet);
      setPassphrase("");
      setPassphrase2("");
      setMode("passphrase");
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That phrase isn't valid.");
      setBusy(false);
    }
  }

  /** Known identity on this device — unlock vault or migrate plaintext. */
  async function selectKnown(idn: IdentityRecord) {
    setError("");
    if (idn.injected) {
      setBusy(true);
      try {
        await finishAuth(idn, onAuth);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not sign in.");
        setBusy(false);
      }
      return;
    }

    const session = sessionSecrets.get(idn.address);
    if (session) {
      setBusy(true);
      try {
        await finishAuth(
          { ...idn, mnemonic: session.mnemonic, privateKey: session.privateKey },
          onAuth,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not sign in.");
        setBusy(false);
      }
      return;
    }

    if (idn.vault) {
      setPendingIdn(idn);
      setUnlockPass("");
      setMode("device-unlock");
      return;
    }

    /* Legacy plaintext — migrate into a vault. */
    if (idn.mnemonic && idn.privateKey) {
      setDraft({
        address: idn.address,
        mnemonic: idn.mnemonic,
        privateKey: idn.privateKey,
      });
      setPassphrase("");
      setPassphrase2("");
      setMode("passphrase");
      return;
    }

    setError("This identity needs its recovery phrase restored on this device.");
  }

  /** Unlock an existing vault with the device passphrase. */
  async function unlockDeviceVault() {
    if (!pendingIdn?.vault) return;
    setError("");
    setBusy(true);
    try {
      const secrets = await unwrapSecrets(unlockPass, pendingIdn.vault);
      await finishAuth(
        {
          ...pendingIdn,
          mnemonic: secrets.mnemonic,
          privateKey: secrets.privateKey,
          vault: pendingIdn.vault,
        },
        onAuth,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock vault.");
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
      setBusy(true);
      await finishAuth({ address, injected: true }, onAuth);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection was cancelled.");
      setBusy(false);
    }
  }

  if (mode === "create" && !draft) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <div className="gen-load"><LoadingBloom label="Generating your keys…" /></div>
      </div></div>
    );
  }

  if (mode === "create" && draft) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={reset}>← Back</button>
        <h2 className="auth-h2">Meet Your New Identity</h2>
        <div className="identity-hero">
          <Identicon address={draft.address} size={54} radius={15} />
          <div>
            <div className="ih-name">{codenameFor(draft.address)}</div>
            <div className="ih-addr num">{shortAddr(draft.address)}</div>
          </div>
        </div>
        <div className="recovery">
          <div className="rec-label"><Icon name="key" size={15} /> Recovery Phrase <span className="rec-warn">— write this down</span></div>
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
        <button className="primary-btn lg full" type="button" disabled={!saved || busy} onClick={startQuiz}>Continue</button>
      </div></div>
    );
  }

  if (mode === "quiz" && draft) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={() => { setMode("create"); setError(""); }}>← Back</button>
        <h2 className="auth-h2">Confirm Your Phrase</h2>
        <p className="auth-lead">Enter the requested words from your recovery phrase to make sure you wrote them down.</p>
        <div className="vault-quiz">
          {quizIndices.map((idx) => (
            <label key={idx} className="fld-label vault-quiz-row">
              Word {idx + 1}
              <input
                className="text-in"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={quizAnswers[idx] ?? ""}
                onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" onClick={startPassphrase}>Continue</button>
      </div></div>
    );
  }

  if (mode === "passphrase" && draft) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={() => {
          setMode(quizIndices.length ? "quiz" : "restore");
          setError("");
        }}>← Back</button>
        <h2 className="auth-h2">Device Passphrase</h2>
        <p className="auth-lead">
          Encrypt your recovery key on this device. The server never receives this passphrase — only ciphertext syncs to the cloud.
        </p>
        <label className="fld-label">Passphrase
          <input
            className="text-in"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        <label className="fld-label">Confirm passphrase
          <input
            className="text-in"
            type="password"
            autoComplete="new-password"
            value={passphrase2}
            onChange={(e) => setPassphrase2(e.target.value)}
          />
        </label>
        <p className="rec-note2">At least 8 characters. You will need this passphrase to unlock Sched Ledger on this browser.</p>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" disabled={busy} onClick={() => void sealAndEnter()}>
          {busy ? "Signing…" : "Sign & Enter Ledger"}
        </button>
      </div></div>
    );
  }

  if (mode === "device-unlock" && pendingIdn) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={() => { setMode("restore"); setPendingIdn(null); setError(""); }}>← Back</button>
        <h2 className="auth-h2">Unlock this Device</h2>
        <p className="auth-lead">Enter the passphrase that encrypts your key on this browser.</p>
        <div className="identity-hero">
          <Identicon address={pendingIdn.address} size={44} radius={12} />
          <div>
            <div className="ih-name">{pendingIdn.codename || codenameFor(pendingIdn.address)}</div>
            <div className="ih-addr num">{shortAddr(pendingIdn.address)}</div>
          </div>
        </div>
        <label className="fld-label">Device Passphrase
          <input
            className="text-in"
            type="password"
            autoComplete="current-password"
            value={unlockPass}
            onChange={(e) => setUnlockPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void unlockDeviceVault(); }}
          />
        </label>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" disabled={busy || !unlockPass} onClick={() => void unlockDeviceVault()}>
          {busy ? "Unlocking…" : "Unlock & Sign In"}
        </button>
      </div></div>
    );
  }

  if (mode === "restore") {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <button className="auth-back" type="button" onClick={reset}>← Back</button>
        <h2 className="auth-h2">Welcome Back</h2>
        {identities.length ? (
          <div className="known">
            <span className="known-label">On this device</span>
            {identities.map((i) => (
              <button key={i.address} className="known-row" type="button" disabled={busy} onClick={() => void selectKnown(i)}>
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
        <textarea className="phrase-in" placeholder="Enter your 12- or 24-word recovery phrase, separated by spaces" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="primary-btn lg full" type="button" disabled={busy || !phrase.trim()} onClick={() => void doImport()}>{busy ? "Restoring…" : "Restore Identity"}</button>
        {walletClient.hasInjected() ? <button className="ghost-btn full u-gap-top" type="button" onClick={() => void connectInjected()}><Icon name="wallet" size={17} /> Connect Browser Wallet</button> : null}
      </div></div>
    );
  }

  return (
    <div className="auth-wrap"><div className="auth-card">
      <Brand variant="auth" />
      <h1 className="auth-h1">Private by Design.</h1>
      <p className="auth-lead">No email. No password. Just a cryptographic key only you hold.</p>
      <div className="auth-actions">
        <button className="primary-btn lg" type="button" onClick={startCreate}><Icon name="shield" size={18} /> Create New</button>
        <button className="ghost-btn lg" type="button" onClick={() => { setError(""); setMode("restore"); }}><Icon name="key" size={17} /> Open Existing</button>
      </div>
      {walletClient.hasInjected() ? <button className="link-btn auth-injected" type="button" onClick={() => void connectInjected()}>Or Connect Your Browser Wallet</button> : null}
      {error ? <div className="auth-error auth-error--gap">{error}</div> : null}
      <ul className="auth-feat">
        <li><Icon name="check" /> No email or password required to sign in</li>
        <li><Icon name="check" /> Encrypted cloud sync — server stores ciphertext</li>
        <li><Icon name="check" /> Sign in by signing with your key</li>
        <li><Icon name="check" /> Ledger-only key reduces on-chain correlation</li>
      </ul>
    </div></div>
  );
}
