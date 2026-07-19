import { Brand } from "@/frontend/components/Brand";
import { identityStorage } from "@/frontend/auth/lib/identity-storage";
import { unwrapSecrets, wrapSecrets, isValidPassphrase } from "@/frontend/auth/lib/device-vault";
import { sessionSecrets } from "@/frontend/auth/lib/session-secrets";
import { walletClient } from "@/frontend/auth/lib/wallet";
import { unlockLedgerKey } from "@/frontend/lib/crypto/unlock";
import type { Account, IdentityRecord } from "@/frontend/lib/types";
import { useState } from "react";

type UnlockScreenProps = {
  account: Account;
  onUnlocked: () => void;
  onSignOut: () => void;
};

/** Resolve signing material for unlock (session, vault, or legacy plaintext). */
async function materializeIdentity(
  idn: IdentityRecord,
  passphrase: string,
): Promise<IdentityRecord> {
  const session = sessionSecrets.get(idn.address);
  if (session) {
    return { ...idn, mnemonic: session.mnemonic, privateKey: session.privateKey };
  }

  if (idn.vault) {
    if (!passphrase) throw new Error("Enter your device passphrase.");
    const secrets = await unwrapSecrets(passphrase, idn.vault);
    sessionSecrets.set(idn.address, secrets);
    return { ...idn, ...secrets };
  }

  if (idn.privateKey && idn.mnemonic) {
    if (!passphrase) {
      /* Allow one-shot unlock for legacy plaintext, then require migration. */
      return idn;
    }
    if (!isValidPassphrase(passphrase)) {
      throw new Error("Passphrase must be at least 8 characters.");
    }
    const vault = await wrapSecrets(passphrase, {
      mnemonic: idn.mnemonic,
      privateKey: idn.privateKey,
    });
    identityStorage.upsert({
      address: idn.address,
      codename: idn.codename,
      vault,
      injected: false,
      lastSeen: Date.now(),
    });
    sessionSecrets.set(idn.address, {
      mnemonic: idn.mnemonic,
      privateKey: idn.privateKey,
    });
    return { ...idn, vault };
  }

  return idn;
}

export function UnlockScreen({ account, onUnlocked, onSignOut }: UnlockScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const idn = identityStorage.find(account.address);
  const session = idn ? sessionSecrets.get(idn.address) : undefined;
  const needsWalletSign = !!idn?.injected || (!session && !idn?.privateKey && !idn?.vault);
  const needsPassphrase = !!idn && !idn.injected && !session && (!!idn.vault || !!idn.privateKey);
  const migrating = !!idn && !idn.injected && !idn.vault && !!idn.privateKey && !!idn.mnemonic;

  async function unlock() {
    if (!idn) {
      setError("No local identity found. Sign in again to unlock your ledger.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const ready = await materializeIdentity(idn, passphrase);
      await unlockLedgerKey(ready);
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock encryption key.");
    }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Brand />
        <h1>Unlock your ledger</h1>
        <p className="auth-lead">
          Transaction amounts and notes are encrypted end-to-end.{" "}
          {needsWalletSign
            ? "Sign a message with your wallet to derive your decryption key."
            : needsPassphrase
              ? migrating
                ? "Set a device passphrase to encrypt your local key, then unlock."
                : "Enter your device passphrase, then unlock to derive your decryption key."
              : "Your encryption key will be derived from your wallet."}
        </p>
        {needsPassphrase ? (
          <label className="fld-label">
            {migrating ? "New device passphrase" : "Device passphrase"}
            <input
              className="text-in"
              type="password"
              autoComplete={migrating ? "new-password" : "current-password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }}
            />
          </label>
        ) : null}
        {error && <p className="auth-error">{error}</p>}
        <button type="button" className="btn btn--primary btn--block" disabled={busy || (needsPassphrase && !passphrase)} onClick={() => void unlock()}>
          {busy ? "Unlocking…" : needsWalletSign ? "Sign to unlock" : "Unlock"}
        </button>
        {!idn && walletClient.hasInjected() && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            disabled={busy}
            onClick={() => void unlock()}
          >
            Connect wallet
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
