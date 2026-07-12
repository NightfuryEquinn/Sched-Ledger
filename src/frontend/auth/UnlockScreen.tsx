import { Brand } from "@/frontend/components/Brand";
import { identityStorage } from "@/frontend/auth/lib/identity-storage";
import { walletClient } from "@/frontend/auth/lib/wallet";
import { unlockLedgerKey } from "@/frontend/lib/crypto/unlock";
import type { Account } from "@/frontend/lib/types";
import { useState } from "react";

type UnlockScreenProps = {
  account: Account;
  onUnlocked: () => void;
  onSignOut: () => void;
};

export function UnlockScreen({ account, onUnlocked, onSignOut }: UnlockScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idn = identityStorage.find(account.address);
  const needsWalletSign = !!idn?.injected || !idn?.privateKey;

  async function unlock() {
    if (!idn) {
      setError("No local identity found. Sign in again to unlock your ledger.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await unlockLedgerKey(idn);
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
            : "Your encryption key will be derived from your wallet."}
        </p>
        {error && <p className="auth-error">{error}</p>}
        <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void unlock()}>
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
