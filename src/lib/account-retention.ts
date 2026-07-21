/** Days without activity before an account may be purged with its data. */
export const ACCOUNT_STALE_DAYS = 90;

/** Milliseconds equivalent of {@link ACCOUNT_STALE_DAYS}. */
export const ACCOUNT_STALE_MS = ACCOUNT_STALE_DAYS * 24 * 60 * 60 * 1000;
