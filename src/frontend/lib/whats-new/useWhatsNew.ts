import { APP_VERSION } from "@/lib/version";
import { isTourActive } from "@/frontend/lib/tour";
import { useCallback, useEffect, useRef, useState } from "react";
import { shouldAutoShowWhatsNew } from "./should-show";
import { hasSeenWhatsNew, markWhatsNewSeen } from "./storage";

/** How often to re-check whether a guided tour is on screen. */
const TOUR_POLL_MS = 400;

/**
 * Consecutive quiet polls required before opening. The tour schedules itself on
 * timers — 600ms for the shell tour after the ledger is ready, then 400ms before
 * a view tour follows it — so "not active right now" is not the same as "not
 * about to start". Three quiet polls outlast both gaps.
 */
const QUIET_POLLS_REQUIRED = 3;

type UseWhatsNewOptions = {
  /** True once the ledger has loaded and the shell is on screen. */
  ready: boolean;
  /** ISO creation time of the ledger profile, once loaded. */
  accountCreatedAt?: string;
};

/**
 * Own the What's New popup: decide whether to open it automatically on this
 * device, and expose manual open/close for the account menu entry.
 */
export function useWhatsNew({ ready, accountCreatedAt }: UseWhatsNewOptions) {
  const [open, setOpen] = useState(false);
  const [waitingForTour, setWaitingForTour] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!ready || decided.current) return;

    const decision = shouldAutoShowWhatsNew({
      seen: hasSeenWhatsNew(APP_VERSION),
      accountCreatedAt,
    });

    decided.current = true;

    if (decision === "skip-new-account") {
      /* The guided tour is this user's introduction. Bank the version now so
         they are not shown these notes on their next visit either. */
      markWhatsNewSeen(APP_VERSION);

      return;
    }

    if (decision === "show") {
      setWaitingForTour(true);
    }
  }, [ready, accountCreatedAt]);

  /* A returning user on a new device also gets the shell tour. Wait it out so
     the two never overlap. Kept in its own effect, keyed only on the latch, so
     a profile refetch cannot restart or cancel the wait. */
  useEffect(() => {
    if (!waitingForTour) return;

    let quiet = 0;
    const timer = window.setInterval(() => {
      if (isTourActive()) {
        quiet = 0;

        return;
      }

      quiet += 1;
      if (quiet < QUIET_POLLS_REQUIRED) return;

      window.clearInterval(timer);
      setWaitingForTour(false);
      setOpen(true);
    }, TOUR_POLL_MS);

    return () => window.clearInterval(timer);
  }, [waitingForTour]);

  /** Open the popup on demand, without touching the auto-show gate. */
  const openWhatsNew = useCallback(() => setOpen(true), []);

  /** Close the popup and stop announcing this version on this device. */
  const closeWhatsNew = useCallback(() => {
    setOpen(false);
    markWhatsNewSeen(APP_VERSION);
  }, []);

  return { open, openWhatsNew, closeWhatsNew };
}
