import { useEffect, useState } from "react";
import { AuthScreen, getSavedAccount, logoutSession } from "@/frontend/auth";
import { LedgerApp } from "@/frontend/app/LedgerApp";
import { ThemeToggle } from "@/frontend/components/ThemeToggle";
import { api } from "@/frontend/lib/api";
import { ThemeProvider } from "@/frontend/lib/hooks/useTheme";
import {
  ACCENTS,
  FONT_PAIRS,
  TWEAK_DEFAULTS,
  type TweakValues,
} from "@/frontend/lib/theme";
import type { Account } from "@/frontend/lib/types";
import {
  TweakColor,
  TweakRadio,
  TweakSection,
  TweakSelect,
  TweaksPanel,
  useTweaks,
} from "@/frontend/tweaks/TweaksPanel";

export function Root() {
  const [t, setTweak] = useTweaks<TweakValues>(TWEAK_DEFAULTS);
  const [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", t.accent);
    const fonts = FONT_PAIRS[t.font] || FONT_PAIRS.warm;
    root.style.setProperty("--font-display", fonts.display);
    root.style.setProperty("--font-body", fonts.body);
    root.setAttribute("data-density", t.density);
  }, [t.accent, t.font, t.density]);

  useEffect(() => {
    api.auth
      .me()
      .then(({ account: remote }) => {
        const local = getSavedAccount();
        if (local && local.address.toLowerCase() === remote.address.toLowerCase()) {
          setAccount({ ...remote, codename: local.codename, injected: local.injected });
        } else {
          setAccount(remote);
        }
      })
      .catch(() => setAccount(null))
      .finally(() => setBooting(false));
  }, []);

  const signOut = async () => {
    await logoutSession();
    setAccount(null);
  };

  if (booting) {
    return (
      <ThemeProvider>
        <div className="app app--loading">
          <div className="loading-state">Loading…</div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {account ? (
        <LedgerApp key={account.address} account={account} onSignOut={signOut} />
      ) : (
        <>
          <ThemeToggle className="auth-theme-toggle" />
          <AuthScreen onAuth={setAccount} />
        </>
      )}

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={[...ACCENTS]}
          onChange={(v) => setTweak("accent", v as string)}
        />
        <TweakSection label="Typography" />
        <TweakSelect
          label="Font pairing"
          value={t.font}
          options={Object.keys(FONT_PAIRS).map((k) => ({
            value: k,
            label: FONT_PAIRS[k as keyof typeof FONT_PAIRS].label,
          }))}
          onChange={(v) => setTweak("font", v)}
        />
        <TweakSection label="Layout" />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "balanced", "spacious"]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweaksPanel>
    </ThemeProvider>
  );
}
