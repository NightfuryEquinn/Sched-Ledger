type WhatsNewDecision = "show" | "skip-seen";

type DecisionInput = {
  /** Whether this device already saw notes for the current version. */
  seen: boolean;
};

/**
 * Decide whether the What's New popup should open by itself.
 *
 * New accounts also get the notes — after the welcome modal and any guided
 * tour finish. Tour-seen state is deliberately not consulted: it lives in
 * localStorage, so a returning user on a new device has not seen the tour
 * there either — gating on it would suppress the popup in exactly the case
 * this feature exists for.
 */
export function shouldAutoShowWhatsNew({ seen }: DecisionInput): WhatsNewDecision {
  if (seen) {
    return "skip-seen";
  }

  return "show";
}
