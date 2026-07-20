import { Icon } from "@/frontend/components/ui";
import { createPortal } from "react-dom";

type LegalModalProps = {
  onClose: () => void;
};

/** Terms & Conditions modal for account menu legal links. */
export function TermsModal({ onClose }: LegalModalProps) {
  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="tnc-title">
        <div className="modal-head">
          <h3 id="tnc-title">Terms &amp; Conditions</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body modal-scroll">
          <p className="dm-lead">Last updated July 20, 2026. By using Sched Ledger you agree to these terms.</p>

          <div className="dm-sec">
            <span className="fld-label">Service</span>
            <p className="legal-p">
              Sched Ledger is a private expense ledger and schedule app. You sign in with a Web3 wallet identity.
              We do not require an email or password. You are responsible for safeguarding your wallet keys and recovery phrase.
              Prefer creating a ledger-only identity in the app rather than reconnecting a funded exchange or hot wallet, so the
              login address is less likely to be correlated with on-chain activity.
            </p>
          </div>

          <div className="dm-div" />

          <div className="dm-sec">
            <span className="fld-label">Your data</span>
            <p className="legal-p">
              Ledger data you create (transactions, budgets, events, categories, and related preferences) is stored with your account.
              You can export a CSV copy and manage sessions, reminder preferences, and third-party sharing from Data &amp; privacy.
              Clearing local browser data does not delete your server-side ledger.
            </p>
          </div>

          <div className="dm-div" />

          <div className="dm-sec">
            <span className="fld-label">Acceptable use</span>
            <p className="legal-p">
              Use the service only for lawful expense tracking and scheduling.
              Do not attempt to disrupt the service, circumvent security controls, or access another person&apos;s account.
            </p>
          </div>

          <div className="dm-div" />

          <div className="dm-sec">
            <span className="fld-label">Software license</span>
            <p className="legal-p">
              The Sched Ledger source code is licensed under the Business Source License 1.1 (BSL 1.1).
              Using this hosted service does not grant you rights to copy, modify, redistribute, self-host,
              or offer Sched Ledger as a competing commercial product or hosted service except as allowed by
              that license or a separate commercial agreement with the Licensor.
              See the project LICENSE file and Copyright notice for full terms, including the Change Date
              when the work becomes available under the Apache License, Version 2.0.
            </p>
          </div>

          <div className="dm-div" />

          <div className="dm-sec">
            <span className="fld-label">Availability &amp; disclaimer</span>
            <p className="legal-p">
              The service is provided as-is. We may change or discontinue features. Sched Ledger is not financial, tax, or legal advice.
              Reminder emails may be delayed or skipped depending on your settings and scheduling infrastructure.
            </p>
          </div>

          <div className="dm-div" />

          <div className="dm-sec">
            <span className="fld-label">Changes</span>
            <p className="legal-p">
              We may update these terms from time to time. Continued use after an update means you accept the revised terms.
              Questions about these terms can be raised via the project repository.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Copyright and project license modal for account menu legal links. */
export function CopyrightModal({ onClose }: LegalModalProps) {
  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="copyright-title">
        <div className="modal-head">
          <h3 id="copyright-title">Copyright</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body modal-scroll">
          <div className="dm-sec">
            <p className="legal-p legal-p--lead">
              © 2026 Sched Ledger. All rights reserved except where the project license grants otherwise.
            </p>
            <p className="legal-p">
              Sched Ledger and its accompanying materials are licensed under the
              Business Source License 1.1 (BSL 1.1). Source is available for use under
              the terms of that license; production use is allowed except when offering
              a competing commercial product or hosted service.
            </p>
            <p className="legal-p">
              On the Change Date stated in the LICENSE file (or sooner as required by BSL),
              the Licensed Work will become available under the Apache License, Version 2.0.
              The software is provided as-is, without warranty of any kind.
            </p>
            <p className="dm-note">The full license text is available in the project <span className="num">LICENSE</span> file.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
