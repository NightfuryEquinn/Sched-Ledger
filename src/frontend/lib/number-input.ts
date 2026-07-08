import type { KeyboardEvent, WheelEvent } from "react";

/** Prevent scroll-wheel from changing a focused number input. */
export function preventWheelChange(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

/** Block keys that would produce negative or scientific-notation values. */
export function preventNegativeKeys(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
    e.preventDefault();
  }
}

export function stripNegativeInput(value: string): string {
  return value.replace(/-/g, "");
}
