import type { CapitalPace } from "@/frontend/lib/savingsInsights";

/**
 * Status chip for one Capitals plan. Overpaid wins over funded — both have
 * nothing left to set aside, but only one of them is good news. A plan with no
 * budget has nothing to judge, and gets no chip at all.
 */
function PaceStatus({ plan }: { plan: CapitalPace }) {
  if (plan.overbudget) {
    return <span className="capital-pace-status capital-pace-status--warn">Overpaid</span>;
  }
  if (plan.funded) {
    return <span className="capital-pace-status capital-pace-status--ok">Funded</span>;
  }
  if (plan.onTrack === true) {
    return <span className="capital-pace-status capital-pace-status--ok">On pace</span>;
  }
  if (plan.onTrack === false) {
    return <span className="capital-pace-status capital-pace-status--warn">Behind pace</span>;
  }

  return null;
}

/**
 * The Capitals half of Saving Insights: one line per plan with what is set
 * aside, what is left, the pace it is being saved at, and where that leaves it
 * against the target date. Shared by the Piggies and Insights views, which
 * format money differently (Insights can convert currency), so `money` comes
 * from the caller.
 */
export function CapitalPaceList({
  plans,
  money,
}: {
  plans: CapitalPace[];
  money: (n: number) => string;
}) {
  if (!plans.length) return null;

  return (
    <div className="capital-pace-list">
      {plans.map((plan) => (
        <div key={plan.planId} className="capital-pace-row">
          <span className="capital-pace-glyph">{plan.glyph}</span>
          <div className="capital-pace-main">
            <span className="capital-pace-name">{plan.name}</span>
            <span className="capital-pace-meta">
              {money(plan.unspent)} set aside
              {plan.remainingNeed > 0 ? ` · ${money(plan.remainingNeed)} to go` : ""}
              {plan.monthlyPace > 0 ? ` · ${money(plan.monthlyPace)}/mo pace` : ""}
              {plan.requiredMonthly ? ` · ${money(plan.requiredMonthly)}/mo needed` : ""}
            </span>
          </div>
          <PaceStatus plan={plan} />
        </div>
      ))}
    </div>
  );
}
