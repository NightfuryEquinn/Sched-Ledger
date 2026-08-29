import type { ViewId } from "@/frontend/lib/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cancelActiveTour, runTour, type TourKind } from "./runTour";
import type { TourPreference } from "@/schemas/profile";

/** Delay before a view tour opens, so the view has settled first. */
const VIEW_TOUR_DELAY_MS = 400;

/** Delay before the shell tour opens on a fresh sign-in. */
const SHELL_TOUR_DELAY_MS = 600;

type UseLedgerTourOptions = {
  view: ViewId;
  ready: boolean;
  /** The user's answer to the first-run prompt, from their profile. */
  preference: TourPreference;
  /** Tour ids already shown to this user ("shell" plus view ids). */
  seen: string[];
  /** Persist that a tour has now been shown. */
  onSeen: (kind: TourKind) => void;
};

export function useLedgerTour({ view, ready, preference, seen, onSeen }: UseLedgerTourOptions) {
  const viewRef = useRef(view);
  viewRef.current = view;

  /* A pending tour timer, cleared when the view changes or the app unmounts —
     otherwise navigating away inside the delay still opened the old view's tour. */
  const timerRef = useRef<number | null>(null);

  const seenSet = useMemo(() => new Set(seen), [seen]);
  const seenRef = useRef(seenSet);
  seenRef.current = seenSet;

  /* Tours already started this session. `seen` only updates once the profile
     PATCH lands, which is far too late to stop a second start. */
  const started = useRef<Set<string>>(new Set());

  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  /** Clear any tour waiting on its open delay. */
  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /** Start a tour and record it as shown once it ends, however it ends. */
  const start = useCallback((kind: TourKind, onDone?: () => void) => {
    started.current.add(kind);

    return runTour(kind, {
      onDone: (finishedKind) => {
        onSeenRef.current(finishedKind);
        onDone?.();
      },
    });
  }, []);

  /** Auto-open a view's tour the first time this user reaches it. */
  const maybeAutoTourView = useCallback(
    (target: ViewId) => {
      if (seenRef.current.has(target) || started.current.has(target)) return;

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void start(target);
      }, VIEW_TOUR_DELAY_MS);
    },
    [clearTimer, start],
  );

  /** Replay the current view's tour on demand, ignoring seen state. */
  const startViewTour = useCallback(
    (target: ViewId = viewRef.current) => {
      clearTimer();
      void start(target);
    },
    [clearTimer, start],
  );

  useEffect(() => {
    if (!ready || preference !== "guided") return;
    if (seenSet.has("shell") || started.current.has("shell")) return;

    const t = window.setTimeout(() => {
      void start("shell", () => maybeAutoTourView(viewRef.current));
    }, SHELL_TOUR_DELAY_MS);

    return () => window.clearTimeout(t);
  }, [ready, preference, seenSet, maybeAutoTourView, start]);

  useEffect(() => {
    if (!ready || preference !== "guided") return;
    if (!seenSet.has("shell")) return;

    maybeAutoTourView(view);

    return clearTimer;
  }, [view, ready, preference, seenSet, maybeAutoTourView, clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
      cancelActiveTour();
    },
    [clearTimer],
  );

  return { startViewTour };
}
