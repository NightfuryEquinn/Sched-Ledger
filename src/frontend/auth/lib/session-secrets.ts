/**
 * In-memory store for unwrapped in-app wallet secrets for the current tab.
 * Never written to localStorage — clears on sign-out / clearAllLocalData.
 */

type SessionSecret = {
  mnemonic: string;
  privateKey: string;
};

const store = new Map<string, SessionSecret>();

/** Normalize address keys for Map lookups. */
function keyOf(address: string): string {
  return address.toLowerCase();
}

export const sessionSecrets = {
  /** Store unwrapped secrets for an address. */
  set(address: string, secrets: SessionSecret) {
    store.set(keyOf(address), secrets);
  },

  /** Read unwrapped secrets for an address, if any. */
  get(address: string): SessionSecret | undefined {
    return store.get(keyOf(address));
  },

  /** Drop secrets for one address. */
  clear(address: string) {
    store.delete(keyOf(address));
  },

  /** Drop all session secrets. */
  clearAll() {
    store.clear();
  },
};
