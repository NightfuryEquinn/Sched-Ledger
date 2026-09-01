import {
  applyTheme,
  getStoredTheme,
  getSystemDark,
  setStoredTheme,
  type ThemePreference,
} from "@/frontend/lib/theme";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeContextValue = {
  preference: ThemePreference;
  dark: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredTheme());
  const [systemDark, setSystemDark] = useState(() => getSystemDark());
  const dark = preference === "system" ? systemDark : preference === "dark";

  useEffect(() => {
    applyTheme(dark);
    setStoredTheme(preference);
  }, [dark, preference]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPreference = (next: ThemePreference) => setPreferenceState(next);
  const toggle = () => setPreferenceState(dark ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ preference, dark, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
