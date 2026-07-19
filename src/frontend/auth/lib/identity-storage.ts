import type { IdentityRecord } from "@/frontend/lib/types";
import { ledgerKeyStore } from "@/frontend/lib/crypto/key-store";
import { sessionSecrets } from "@/frontend/auth/lib/session-secrets";
import { clearCipherCacheForAddress } from "@/frontend/lib/pwa/cipher-cache";

export const identityStorage = {
  list(): IdentityRecord[] {
    try {
      return JSON.parse(localStorage.getItem("ledger:identities") || "[]");
    } catch {
      return [];
    }
  },
  save(list: IdentityRecord[]) {
    localStorage.setItem("ledger:identities", JSON.stringify(list));
  },
  /** Persist an identity without plaintext secrets when a vault is present. */
  upsert(idn: IdentityRecord) {
    const sanitized: IdentityRecord = {
      address: idn.address,
      codename: idn.codename,
      injected: !!idn.injected,
      lastSeen: idn.lastSeen ?? Date.now(),
    };
    if (idn.vault) sanitized.vault = idn.vault;
    /* Keep legacy plaintext only when there is no vault yet (migration window). */
    if (!idn.vault && !idn.injected) {
      if (idn.mnemonic) sanitized.mnemonic = idn.mnemonic;
      if (idn.privateKey) sanitized.privateKey = idn.privateKey;
    }

    const list = identityStorage.list().filter(
      (i) => i.address.toLowerCase() !== idn.address.toLowerCase(),
    );
    list.unshift(sanitized);
    identityStorage.save(list);
  },
  find(addr: string) {
    return identityStorage.list().find(
      (i) => i.address.toLowerCase() === (addr || "").toLowerCase(),
    );
  },
  session() {
    return localStorage.getItem("ledger:session");
  },
  setSession(addr: string | null) {
    if (addr) localStorage.setItem("ledger:session", addr);
    else localStorage.removeItem("ledger:session");
  },
};

/** Clear ledger keys, session secrets, localStorage, and IndexedDB cipher cache. */
export function clearAllLocalData(): void {
  const sessionAddr = identityStorage.session();
  ledgerKeyStore.clear();
  sessionSecrets.clearAll();
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("ledger:")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  if (sessionAddr) void clearCipherCacheForAddress(sessionAddr);
}
