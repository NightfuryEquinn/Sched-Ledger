/** Persist which ledger-key derivation generation unlocked an address. */

export type KeyGeneration = "custos" | "legacy";

const STORAGE_KEY = "custos:key-generation:v1";
const memory = new Map<string, KeyGeneration>();

/** Whether browser localStorage is available. */
function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

/** Read stored key-generation map from localStorage. */
function readMap(): Record<string, KeyGeneration> {
  if (!hasLocalStorage()) {
    return Object.fromEntries(memory);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as Record<string, KeyGeneration>) : {};
  } catch {
    return {};
  }
}

/** Write key-generation map to localStorage. */
function writeMap(map: Record<string, KeyGeneration>): void {
  memory.clear();

  for (const [k, v] of Object.entries(map)) {
    memory.set(k, v);
  }

  if (!hasLocalStorage()) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Return the remembered derivation generation for an address, if any. */
export function getKeyGeneration(address: string): KeyGeneration | null {
  return readMap()[address.toLowerCase()] ?? null;
}

/** Remember which derivation generation unlocked this address. */
export function setKeyGeneration(address: string, generation: KeyGeneration): void {
  const map = readMap();
  map[address.toLowerCase()] = generation;
  writeMap(map);
}
