import { roundMoney } from "./data";
import { isSavingsCategory, type CategoryIndex } from "./categories";
import { classifyTx } from "./stats";
import type { Expense } from "./types";

export type Piglet = {
  subId: string;
  name: string;
  deposited: number;
  withdrawn: number;
  balance: number;
  target?: number;
  deadline?: string;
  /** Retired piglet: hidden from new deposits once its balance is zero. */
  archived: boolean;
  /** Balance / target, or `null` when there is no target — never 0. */
  progress: number | null;
  lastContribution?: string;
};

export type Piggy = {
  catId: string;
  name: string;
  color: string;
  glyph: string;
  archived: boolean;
  deposited: number;
  withdrawn: number;
  balance: number;
  target?: number;
  deadline?: string;
  progress: number | null;
  piglets: Piglet[];
  lastContribution?: string;
};

function progressOf(balance: number, target: number | undefined): number | null {
  if (target === undefined || target <= 0) return null;
  return balance / target;
}

/**
 * Build one Piggy per savings category, each broken into its subcategory
 * Piglets. Balances are derived from transaction history: `classifyTx`
 * "savings" rows are deposits, "withdrawal" rows subtract. Transactions
 * assigned to a Capitals plan (`capitalPlanId`) are excluded — they show as
 * Unspent on that plan instead.
 *
 * Walks every savings-typed category via `allCategories` (not
 * `index.savingsCategories`, which drops archived entries) so a retired
 * piggy's balance is never silently dropped — it is filtered back out below
 * only once its balance is confirmed to be zero.
 */
export function buildPiggies(txns: Expense[], index: CategoryIndex, walletId?: string): Piggy[] {
  const savingsCats = index.allCategories.filter((c) => isSavingsCategory(c));
  const byCat = new Map<string, Piggy>();

  for (const cat of savingsCats) {
    byCat.set(cat.id, {
      catId: cat.id,
      name: cat.name,
      color: cat.color,
      glyph: cat.glyph,
      archived: Boolean(cat.archived),
      deposited: 0,
      withdrawn: 0,
      balance: 0,
      target: cat.target,
      deadline: cat.deadline,
      progress: null,
      piglets: cat.subs.map((sub) => ({
        subId: sub.id,
        name: sub.name,
        deposited: 0,
        withdrawn: 0,
        balance: 0,
        target: sub.target,
        deadline: sub.deadline,
        archived: Boolean(sub.archived),
        progress: null,
      })),
    });
  }

  for (const e of txns) {
    if (walletId && e.walletId !== walletId) continue;
    if (e.capitalPlanId) continue;
    const cls = classifyTx(e, index);
    if (cls !== "savings" && cls !== "withdrawal") continue;

    const catId = index.subById[e.sub]?.catId;
    const piggy = catId ? byCat.get(catId) : undefined;
    if (!piggy) continue;

    const signed = cls === "savings" ? e.amount : -e.amount;
    piggy.balance = roundMoney(piggy.balance + signed);
    if (cls === "savings") piggy.deposited = roundMoney(piggy.deposited + e.amount);
    else piggy.withdrawn = roundMoney(piggy.withdrawn + e.amount);
    if (!piggy.lastContribution || e.date > piggy.lastContribution) {
      piggy.lastContribution = e.date;
    }

    const piglet = piggy.piglets.find((p) => p.subId === e.sub);
    if (!piglet) continue;
    piglet.balance = roundMoney(piglet.balance + signed);
    if (cls === "savings") piglet.deposited = roundMoney(piglet.deposited + e.amount);
    else piglet.withdrawn = roundMoney(piglet.withdrawn + e.amount);
    if (!piglet.lastContribution || e.date > piglet.lastContribution) {
      piglet.lastContribution = e.date;
    }
  }

  const piggies = [...byCat.values()].map((piggy) => {
    // A category-level target is the goal. If unset but piglets carry
    // targets, the pig's target is the sum of the parts — the goal should
    // never read as "none" when the pieces are known.
    const pigletTargetSum = piggy.piglets.reduce((s, p) => s + (p.target ?? 0), 0);
    const target = piggy.target ?? (pigletTargetSum > 0 ? pigletTargetSum : undefined);

    return {
      ...piggy,
      target,
      progress: progressOf(piggy.balance, target),
      piglets: piggy.piglets.map((p) => ({ ...p, progress: progressOf(p.balance, p.target) })),
    };
  });

  // An archived envelope with nothing left in it has nothing to show; one
  // that still carries a balance stays visible so the money isn't lost from view.
  // The same rule applies per piglet so a retired sub does not clutter a live pig.
  return piggies
    .map((p) => ({
      ...p,
      piglets: p.piglets.filter((piglet) => !piglet.archived || piglet.balance !== 0),
    }))
    .filter((p) => !p.archived || p.balance !== 0);
}
