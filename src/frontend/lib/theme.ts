/* ────────────────────────────────────────────────────────────────────
   Theme helpers
   ────────────────────────────────────────────────────────────────────
   The design system lives in styles/ledger.css (tokens for color,
   radius, spacing). This module only handles the light/dark preference
   and exposes the accent color to SVG charts.
   ──────────────────────────────────────────────────────────────────── */

export type ThemePreference = "light" | "dark" | "system";

/** Default accent — keep in sync with --accent in ledger.css. */
const DEFAULT_ACCENT = "#4a6fa5";

const THEME_KEY = "ledger:theme";

export function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* ignore */
  }
  return "system";
}

export function setStoredTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function resolveDark(preference: ThemePreference): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  return getSystemDark();
}

export function applyTheme(dark: boolean): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Read the live accent token (used by SVG charts that can't use CSS vars). */
export function getAccent(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || DEFAULT_ACCENT
  );
}
