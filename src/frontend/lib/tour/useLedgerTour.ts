import type { ViewId } from "@/frontend/lib/types";
import { useCallback, useEffect, useRef } from "react";
import { cancelActiveTour, runTour } from "./runTour";
import { hasSeenTour } from "./storage";

type UseLedgerTourOptions = {
  view: ViewId;
  ready: boolean;
};

export function useLedgerTour({ view, ready }: UseLedgerTourOptions) {
  const prompted = useRef<Set<string>>(new Set());
  const viewRef = useRef(view);
  viewRef.current = view;

  const maybeAutoTourView = useCallback((target: ViewId = viewRef.current) => {
    if (hasSeenTour(target)) return;
    const key = `view:${target}`;
    if (prompted.current.has(key)) return;
    prompted.current.add(key);
    window.setTimeout(() => runTour(target), 400);
  }, []);

  const startShellTour = useCallback(() => {
    runTour("shell", () => maybeAutoTourView(viewRef.current));
  }, [maybeAutoTourView]);

  const startViewTour = useCallback((target: ViewId = viewRef.current) => {
    runTour(target);
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (!hasSeenTour("shell")) {
      const key = "shell";
      if (prompted.current.has(key)) return;
      prompted.current.add(key);
      const t = window.setTimeout(
        () => runTour("shell", () => maybeAutoTourView(viewRef.current)),
        600,
      );
      return () => window.clearTimeout(t);
    }
  }, [ready, maybeAutoTourView]);

  useEffect(() => {
    if (!ready) return;
    if (!hasSeenTour("shell")) return;
    maybeAutoTourView(view);
  }, [view, ready, maybeAutoTourView]);

  useEffect(() => () => cancelActiveTour(), []);

  return { startShellTour, startViewTour };
}
