/** How recently an account must have been created to count as brand new. */
export const NEW_ACCOUNT_GRACE_MS = 10 * 60 * 1000;

type WhatsNewDecision = "show" | "skip-seen" | "skip-new-account";

type DecisionInput = {
  /** Whether this device already saw notes for the current version. */
  seen: boolean;
  /** ISO timestamp of ledger profile creation, when loaded. */
  accountCreatedAt?: string;
  now?: number;
};

/**
 * Decide whether the What's New popup should open by itself.
 *
 * Brand-new accounts are skipped because the guided tour is their introduction
 * and every feature is new to them anyway. Tour-seen state is deliberately not
 * consulted: it lives in localStorage, so a returning user on a new device has
 * not seen the tour there either — gating on it would suppress the popup in
 * exactly the case this feature exists for.
 */
export function shouldAutoShowWhatsNew({
  seen,
  accountCreatedAt,
  now = Date.now(),
}: DecisionInput): WhatsNewDecision {
  if (seen) {
    return "skip-seen";
  }

  if (accountCreatedAt) {
    const created = Date.parse(accountCreatedAt);
    /* An unparseable timestamp falls through to "show" rather than silently
       swallowing the release. */
    if (Number.isFinite(created) && now - created < NEW_ACCOUNT_GRACE_MS) {
      return "skip-new-account";
    }
  }

  return "show";
}
