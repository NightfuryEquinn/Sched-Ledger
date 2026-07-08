import Shepherd from "shepherd.js";
import type { Tour } from "shepherd.js";
import type { ViewId } from "@/frontend/lib/types";
import { getViewTourSteps, SHELL_TOUR_STEPS } from "./steps";
import { markTourSeen } from "./storage";

type TourKind = ViewId | "shell";

let activeTour: Tour | null = null;

function waitForElement(selector: string, timeout = 2500): Promise<Element | null> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

function bindButtons(tour: Tour, steps: ReturnType<typeof getViewTourSteps>) {
  return steps.map((step) => ({
    ...step,
    buttons: step.buttons?.map((button) => {
      if (typeof button === "object" && button !== null && "action" in button) {
        const action = button.action;
        if (action === "next") return { ...button, action: () => tour.next() };
        if (action === "back") return { ...button, action: () => tour.back() };
        if (action === "complete") return { ...button, action: () => tour.complete() };
      }
      return button;
    }),
    beforeShowPromise: async () => {
      const selector =
        typeof step.attachTo?.element === "string" ? step.attachTo.element : null;
      if (selector) await waitForElement(selector);
      if (step.beforeShowPromise) await step.beforeShowPromise();
    },
  }));
}

function createTour(kind: TourKind, onDone?: () => void): Tour {
  if (activeTour?.isActive()) {
    activeTour.cancel();
    activeTour = null;
  }

  const steps = kind === "shell" ? SHELL_TOUR_STEPS : getViewTourSteps(kind);
  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      scrollTo: { behavior: "smooth", block: "center" },
      classes: "ledger-tour-step",
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 12,
    },
  });

  bindButtons(tour, steps).forEach((step) => tour.addStep(step));

  const finish = () => {
    markTourSeen(kind);
    activeTour = null;
    onDone?.();
  };

  tour.on("complete", finish);
  tour.on("cancel", () => {
    activeTour = null;
  });

  activeTour = tour;
  return tour;
}

export function runTour(kind: TourKind, onDone?: () => void) {
  const tour = createTour(kind, onDone);
  tour.start();
  return tour;
}

export function cancelActiveTour() {
  if (activeTour?.isActive()) activeTour.cancel();
  activeTour = null;
}

export function isTourActive() {
  return !!activeTour?.isActive();
}
