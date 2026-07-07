import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/frontend/components/ui";
import type { IdentityRecord } from "@/frontend/lib/types";
import { copyText } from "../lib/clipboard";

type RecoveryRevealProps = {
  identity: IdentityRecord;
  onClose: () => void;
};

export function RecoveryReveal({ identity, onClose }: RecoveryRevealProps) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = (identity.mnemonic || "").split(/\s+/).filter(Boolean);

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>Recovery phrase</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="rec-note2">Anyone with these words controls your ledger. Never share them or enter them on another site.</p>
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
                  copyText(identity.mnemonic || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy phrase"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
