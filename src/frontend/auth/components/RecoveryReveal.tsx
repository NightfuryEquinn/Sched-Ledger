import { Icon } from "@/frontend/components/ui";
import type { IdentityRecord } from "@/frontend/lib/types";
import { useState } from "react";
import { createPortal } from "react-dom";
import { unwrapSecrets } from "../lib/device-vault";
import { copyText } from "../lib/clipboard";
import { sessionSecrets } from "../lib/session-secrets";

type RecoveryRevealProps = {
  identity: IdentityRecord;
  onClose: () => void;
};

export function RecoveryReveal({ identity, onClose }: RecoveryRevealProps) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [mnemonic, setMnemonic] = useState(
    () => sessionSecrets.get(identity.address)?.mnemonic || identity.mnemonic || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const words = mnemonic.split(/\s+/).filter(Boolean);
  const needsPass = !mnemonic && !!identity.vault;

  /** Unlock the vault just long enough to show the phrase. */
  async function revealFromVault() {
    if (!identity.vault) return;
    setError("");
    setBusy(true);
    try {
      const secrets = await unwrapSecrets(passphrase, identity.vault);
      sessionSecrets.set(identity.address, secrets);
      setMnemonic(secrets.mnemonic);
      setShown(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock vault.");
    }
    setBusy(false);
  }

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>Recovery phrase</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="rec-note2">Anyone with these words controls your ledger. Never share them or enter them on another site.</p>
          {needsPass && !mnemonic ? (
            <>
              <label className="fld-label">Device passphrase
                <input
                  className="text-in"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </label>
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="primary-btn full" type="button" disabled={busy || !passphrase} onClick={() => void revealFromVault()}>
                {busy ? "Unlocking…" : "Reveal phrase"}
              </button>
            </>
          ) : (
            <>
              <div className={`phrase-grid${shown ? "" : " blurred"}`}>
                {words.map((w, i) => (
                  <span key={i} className="word"><b>{i + 1}</b>{w}</span>
                ))}
              </div>
              <div className="reveal-actions">
                {!shown ? (
                  <button className="ghost-btn full" type="button" onClick={() => setShown(true)}>Tap to reveal</button>
                ) : (
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() => {
                      copyText(mnemonic);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                  >
                    <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy phrase"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
