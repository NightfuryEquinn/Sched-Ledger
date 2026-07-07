export const FONT_PAIRS = {
  warm: {
    display: "'Spectral', Georgia, serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
    label: "Warm serif",
  },
  grotesque: {
    display: "'Bricolage Grotesque', system-ui, sans-serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
    label: "Grotesque",
  },
  editorial: {
    display: "'Newsreader', Georgia, serif",
    body: "'Instrument Sans', system-ui, sans-serif",
    label: "Editorial",
  },
} as const;

export const ACCENTS = ["#c97a4a", "#6f8b6f", "#4a6fa5", "#8a6fa5", "#b5654a"] as const;

export type FontPairId = keyof typeof FONT_PAIRS;
export type Density = "compact" | "balanced" | "spacious";
export type ThemePreference = "light" | "dark" | "system";

export type TweakValues = {
  accent: string;
  font: FontPairId;
  density: Density;
};

export const TWEAK_DEFAULTS: TweakValues = {
  accent: "#c97a4a",
  font: "warm",
  density: "spacious",
};

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

export function getAccent(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
    "#c97a4a"
  );
}
