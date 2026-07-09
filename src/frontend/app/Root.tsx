import { LedgerApp } from "@/frontend/app/LedgerApp";
import { AuthScreen, getSavedAccount, logoutSession } from "@/frontend/auth";
import { ThemeToggle } from "@/frontend/components/ThemeToggle";
import { api } from "@/frontend/lib/api";
import { ThemeProvider } from "@/frontend/lib/hooks/useTheme";
import type { Account } from "@/frontend/lib/types";
import { useEffect, useState } from "react";

/**
 * App root: restores the server session on boot, then renders either
 * the authenticated LedgerApp or the AuthScreen.
 */
export function Root() {
  const [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState(true);

  // Restore session; prefer locally-stored codename when it matches.
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
    </ThemeProvider>
  );
}
