/*
 * Local cache of the third-party data-sharing consent flag.
 * The server record (GET/PATCH /api/consent) is the source of truth;
 * this cache only seeds the toggle before the network round-trip resolves.
 */

const consentKey = (addr: string) => `ledger:consent:${(addr || "").toLowerCase()}`;

export function getConsent(addr: string): boolean {
  try {
    return localStorage.getItem(consentKey(addr)) === "true";
  } catch {
    return false;
  }
}

export function setConsent(addr: string, value: boolean): void {
  try {
    localStorage.setItem(consentKey(addr), value ? "true" : "false");
  } catch {
    /* ignore */
  }
}
