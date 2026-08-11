import { Icon } from "@/frontend/components/ui";
import { RELEASE_NOTES } from "@/frontend/lib/whats-new";
import { createPortal } from "react-dom";

type WhatsNewModalProps = {
  onClose: () => void;
};

/** Release notes for the current app version, shown on a device's first run. */
export function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  const { version, date, lead, highlights } = RELEASE_NOTES;

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
        <div className="modal-head">
          <h3 id="whatsnew-title">What&apos;s New</h3>
          <span className="wn-pill num">v{version}</span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body modal-scroll">
          <p className="dm-lead">{lead}</p>
          <p className="wn-date">Released {date}</p>

          <div className="dm-div" />

          <div className="wn-list">
            {highlights.map((item) => (
              <div className="wn-item" key={item.title}>
                <span className="wn-item-icon" aria-hidden><Icon name={item.icon} size={18} /></span>
                <div className="wn-item-text">
                  <span className="wn-item-title">{item.title}</span>
                  <p className="legal-p">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="primary-btn full" type="button" onClick={onClose}>Got It</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
