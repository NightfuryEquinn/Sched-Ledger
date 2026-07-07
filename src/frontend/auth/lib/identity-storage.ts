import type { IdentityRecord } from "@/frontend/lib/types";

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
  upsert(idn: IdentityRecord) {
    const list = identityStorage.list().filter(
      (i) => i.address.toLowerCase() !== idn.address.toLowerCase(),
    );
    list.unshift(idn);
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

export function clearAllLocalData(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("ledger:")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
