import { scheduleForMonth } from "@/frontend/lib/data";
import type { LedgerEvent } from "@/frontend/lib/types";

/** Bill/renewal events can reserve budget envelope holds. */
export function isHoldEligibleEvent(ev: Pick<LedgerEvent, "catId">): boolean {
  return ev.catId === "bill" || ev.catId === "renewal";
}

/** Whether the event has an active encrypted hold configuration. */
export function hasBudgetHoldConfig(ev: LedgerEvent): boolean {
  return Boolean(
    ev.budgetHoldEnabled &&
      typeof ev.budgetHoldAmount === "number" &&
      ev.budgetHoldAmount > 0 &&
      ev.budgetHoldCategoryId,
  );
}

/** True when a hold was released for this calendar occurrence. */
export function isHoldReleased(ev: LedgerEvent, occurrenceIso: string): boolean {
  if (ev.budgetHoldReleasedDates?.includes(occurrenceIso)) return true;

  if (ev.repeat === "once" && ev.expenseId && occurrenceIso === ev.date) {
    return true;
  }

  return false;
}

/** True when this occurrence still reserves budget. */
export function isActiveHoldOccurrence(ev: LedgerEvent, occurrenceIso: string): boolean {
  if (!isHoldEligibleEvent(ev) || !hasBudgetHoldConfig(ev)) return false;

  return !isHoldReleased(ev, occurrenceIso);
}

/** Sum active holds per category for a month (client-decrypted only). */
export function holdsByCategory(events: LedgerEvent[], monthKey: string): Record<string, number> {
  const holds: Record<string, number> = {};

  for (const { iso, ev } of scheduleForMonth(events, monthKey)) {
    if (!isActiveHoldOccurrence(ev, iso)) continue;

    const catId = ev.budgetHoldCategoryId!;
    holds[catId] = (holds[catId] || 0) + ev.budgetHoldAmount!;
  }

  return holds;
}

/** Total active holds across all categories for a month. */
export function totalActiveHolds(events: LedgerEvent[], monthKey: string): number {
  const byCat = holdsByCategory(events, monthKey);

  return Object.values(byCat).reduce((sum, amount) => sum + amount, 0);
}

/** Return event with the occurrence hold marked released. */
export function releaseHoldForOccurrence(ev: LedgerEvent, occurrenceIso: string): LedgerEvent {
  if (!hasBudgetHoldConfig(ev)) return ev;

  const released = ev.budgetHoldReleasedDates ?? [];
  if (released.includes(occurrenceIso)) return ev;

  return {
    ...ev,
    budgetHoldReleasedDates: [...released, occurrenceIso],
  };
}
