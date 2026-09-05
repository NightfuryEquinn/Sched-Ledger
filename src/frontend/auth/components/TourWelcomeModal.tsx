import { Icon } from "@/frontend/components/ui";
import { useModalMotion } from "@/frontend/lib/animate";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type TourWelcomeModalProps = {
  /** Take the guided walkthrough: shell tour now, view tours as they open. */
  onGuided: () => Promise<unknown>;
  /** Skip every automatic tour; the help button and menu entry still work. */
  onExplore: () => Promise<unknown>;
  /** Called after the exit animation, so the parent can unmount the modal. */
  onClosed: () => void;
};

/** What each choice actually does, spelled out before the user commits. */
const CHOICES = [
  {
    icon: "info" as const,
    title: "A guided walk-through",
    body: "A short tour of the shell, then a few pointers the first time you open each view.",
  },
  {
    icon: "sparkle" as const,
    title: "Or find your own way",
    body: "Nothing opens by itself. The ? beside any page title still replays that view's tour whenever you want it.",
  },
];

/**
 * First-run prompt: guided tour or explore alone. Shown once per user — the
 * answer is stored on their profile, so it follows them to every device.
 */
export function TourWelcomeModal({ onGuided, onExplore, onClosed }: TourWelcomeModalProps) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { requestClose } = useModalMotion(scrimRef, panelRef, { variant: "center" });
  const [choosing, setChoosing] = useState<"guided" | "explore" | null>(null);

  /** Persist the choice, then close. Guards against a double tap. */
  const choose = async (choice: "guided" | "explore", save: () => Promise<unknown>) => {
    if (choosing) return;

    setChoosing(choice);
    try {
      await save();
      requestClose(onClosed);
    } catch {
      /* Leave the modal open so the choice can be made again. */
      setChoosing(null);
    }
  };

  return createPortal(
    /* Deliberately not closable by scrim or Escape: this is asked once, and a
       stray click should not silently answer it. */
    <div ref={scrimRef} className="modal-scrim center">
      <div
        ref={panelRef}
        className="modal sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-welcome-title"
      >
        <div className="modal-head">
          <h3 id="tour-welcome-title">Welcome to Custos</h3>
        </div>

        <div className="modal-body">
          <p className="dm-lead">
            Would you like a quick tour of how everything fits together, or would you rather look
            around on your own?
          </p>

          <div className="wn-list">
            {CHOICES.map((choice) => (
              <div className="wn-item" key={choice.title}>
                <span className="wn-item-icon" aria-hidden>
                  <Icon name={choice.icon} size={18} />
                </span>
                <div className="wn-item-text">
                  <span className="wn-item-title">{choice.title}</span>
                  <p className="legal-p">{choice.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot modal-foot-stacked">
          <div className="mf-row mf-row-full tour-welcome-actions">
            <button
              className="ghost-btn full"
              type="button"
              disabled={!!choosing}
              onClick={() => void choose("explore", onExplore)}
            >
              <span className="btn-label">
                {choosing === "explore" ? "Saving…" : "I'll explore"}
              </span>
            </button>
            <button
              className="primary-btn full"
              type="button"
              disabled={!!choosing}
              onClick={() => void choose("guided", onGuided)}
            >
              <span className="btn-label">
                {choosing === "guided" ? "Saving…" : "Show me around"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
