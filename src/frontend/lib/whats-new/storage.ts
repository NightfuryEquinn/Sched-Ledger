/* Per-device record of which release notes have been shown. localStorage is
   per-browser, so "seen for this version" is exactly "seen on this device".
   The `ledger:` prefix is required so clearAllLocalData() sweeps this key. */
const STORAGE_KEY = "ledger:whatsnew:v1";

/** Seen flag per app version, e.g. { "1.0.0": true }. */
type SeenState = Record<string, boolean>;

/** Read the seen-version map, falling back to empty on unusable storage. */
function read(): SeenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as SeenState) : {};
  } catch {
    return {};
  }
}

/** Persist the seen-version map, ignoring quota or private-mode failures. */
function write(state: SeenState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage unavailable: the popup simply shows again next visit. */
  }
}

/** Whether this device has already seen the notes for the given version. */
export function hasSeenWhatsNew(version: string): boolean {
  return !!read()[version];
}

/** Record that this device has seen the notes for the given version. */
export function markWhatsNewSeen(version: string) {
  write({ ...read(), [version]: true });
}
