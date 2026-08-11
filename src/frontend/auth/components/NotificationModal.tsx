import { Icon } from "@/frontend/components/ui";
import {
  disablePush,
  enablePush,
  pushStatus,
  type PushStatus,
} from "@/frontend/lib/push/subscribe";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Notification modal
 * ──────────────────
 * Enable/disable Web Push reminders for the current device. The push
 * subscription itself is the opt-in, so this is per-device by design — the
 * email kill-switch in Data & Privacy stays account-wide.
 */

type NotificationModalProps = {
  onClose: () => void;
};

/* Unlike the other preference toggles, a failure here is not silently
   reverted — a denied permission can only be undone in browser settings. */
const FAILURE_NOTE: Record<string, string> = {
  unsupported: "This browser cannot receive push notifications. On iPhone or iPad, add Sched Ledger to your Home Screen first.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
  unconfigured: "Push notifications are not configured on this server yet.",
  failed: "Could not enable notifications. Please try again.",
};

export function NotificationModal({ onClose }: NotificationModalProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus({ supported: false, permission: "default", subscribed: false }));
  }, []);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    setNote("");
    try {
      if (status.subscribed) {
        await disablePush();
      } else {
        const result = await enablePush();
        if (!result.ok) setNote(FAILURE_NOTE[result.reason] ?? FAILURE_NOTE.failed!);
      }
      setStatus(await pushStatus());
    } catch {
      setNote(FAILURE_NOTE.failed!);
    } finally {
      setBusy(false);
    }
  };

  const on = status?.subscribed === true;
  const unsupported = status !== null && !status.supported;

  return createPortal(
    <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>Notifications</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body modal-scroll">
          <div className="dm-sec">
            <span className="fld-label">Push notifications</span>
            <p className="dm-lead">
              Get event reminders on this device at the same time the reminder email goes out — even when Sched Ledger is closed. Reminders are checked every 15 minutes.
            </p>
            <div className="consent-card">
              <div className="consent-top">
                <div>
                  <div className="consent-title">Notify Me On This Device</div>
                  <p className="consent-desc">
                    The notification shows the event name, time and any budget hold or comments you saved with it — the same details as the email. Each device is enabled separately, and turning this off here does not affect your other devices or your reminder emails.
                  </p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy || status === null || unsupported}
                    onChange={toggle}
                  />
                  <span className="toggle-ui" />
                </label>
              </div>
              <div className={`consent-status ${on ? "cs-on" : "cs-off"}`}>
                <span className="cs-dot" />
                {status === null
                  ? "Checking this device…"
                  : unsupported
                    ? "Not available in this browser"
                    : on
                      ? "Enabled — reminders will notify this device"
                      : "Disabled — no push notifications on this device"}
              </div>
            </div>
            {note ? <p className="dm-note">{note}</p> : null}
            {unsupported ? <p className="dm-note">{FAILURE_NOTE.unsupported}</p> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
