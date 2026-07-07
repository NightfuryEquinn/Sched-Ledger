import { api } from "@/frontend/lib/api";
import type { Account } from "@/frontend/lib/types";
import { codenameFor } from "./codename";
import { identityStorage } from "./identity-storage";

export function getSavedAccount(): Account | null {
  const addr = identityStorage.session();
  if (!addr) return null;
  const idn = identityStorage.find(addr);
  if (!idn) return null;
  return {
    address: idn.address,
    codename: idn.codename || codenameFor(idn.address),
    injected: !!idn.injected,
  };
}

export function clearSession(): void {
  identityStorage.setSession(null);
}

export async function logoutSession(): Promise<void> {
  try {
    await api.auth.logout();
  } catch {
    /* ignore */
  }
  clearSession();
}
