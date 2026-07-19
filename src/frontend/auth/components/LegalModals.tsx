import { Icon } from "@/frontend/components/ui";
import { createPortal } from "react-dom";

type LegalModalProps = {
  onClose: () => void;
};

export function TermsModal({ onClose }: LegalModalProps) {
  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="tnc-title">
        <div className="modal-head">
          <h3 id="tnc-title">Terms &amp; conditions</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body modal-scroll">
          <p className="dm-lead">Last updated July 8, 2026. By using Sched Ledger you agree to these terms.</p>

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
              Use the service only for lawful personal or household expense tracking and scheduling.
              Do not attempt to disrupt the service, circumvent security controls, or access another person&apos;s account.
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
              Sched Ledger and its accompanying materials are free software licensed under the
              GNU General Public License version 3 (GPLv3), or (at your option) any later version.
            </p>
            <p className="legal-p">
              You may redistribute and/or modify this software under the terms of that license.
              This program is distributed in the hope that it will be useful, but without any warranty;
              without even the implied warranty of merchantability or fitness for a particular purpose.
              See the GPLv3 for full terms.
            </p>
            <p className="dm-note">The full license text is available in the project <span className="num">LICENSE</span> file.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
