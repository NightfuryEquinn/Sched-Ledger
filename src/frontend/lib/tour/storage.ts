import type { ViewId } from "@/frontend/lib/types";

const STORAGE_KEY = "ledger:tour:v1";

type TourState = Partial<Record<ViewId | "shell", boolean>>;

function read(): TourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TourState) : {};
  } catch {
    return {};
  }
}

function write(state: TourState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function hasSeenTour(id: ViewId | "shell"): boolean {
  return !!read()[id];
}

export function markTourSeen(id: ViewId | "shell") {
  write({ ...read(), [id]: true });
}

export function resetAllTours() {
  localStorage.removeItem(STORAGE_KEY);
}
