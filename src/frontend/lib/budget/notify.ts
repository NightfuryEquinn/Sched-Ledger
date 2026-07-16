import { api } from "@/frontend/lib/api";
import { fmtMoney, monthLabel } from "@/frontend/lib/data";
import type { CategoryIndex } from "@/frontend/lib/categories";
import type { Budgets, Expense, FinancialWallet } from "@/frontend/lib/types";
import {
  budgetAlertDedupeKey,
  evaluateBudgetAlerts,
  type BudgetAlert,
} from "@/lib/budget-alerts";
import { monthStats } from "@/frontend/lib/stats";

const LOCAL_PUSH_KEY = "ledger:budget-alert-push";
const LOCAL_SENT_KEY = "ledger:budget-alerts-sent";

export function getBudgetAlertPushEnabled(): boolean {
  try {
    return localStorage.getItem(LOCAL_PUSH_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setBudgetAlertPushEnabled(on: boolean): void {
  try {
    localStorage.setItem(LOCAL_PUSH_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readSentKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_SENT_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markSent(keys: string[]): void {
  try {
    const next = readSentKeys();
    for (const k of keys) next.add(k);
    /* Cap growth — keep the most recent ~200 keys. */
    const list = [...next].slice(-200);
    localStorage.setItem(LOCAL_SENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function notificationBody(alert: BudgetAlert, currency: string): string {
  const pct = Math.round(alert.ratio * 100);
  const spent = fmtMoney(alert.spent, { cents: false, currency });
  const budget = fmtMoney(alert.budget, { cents: false, currency });
  if (alert.level === "exceeded") {
    return `${spent} of ${budget} — over budget for ${monthLabel(alert.month, true)}`;
  }
  return `${spent} of ${budget} (${pct}% used) for ${monthLabel(alert.month, true)}`;
}

export async function showBudgetAlertNotification(
  alert: BudgetAlert,
  currency: string,
): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (!getBudgetAlertPushEnabled()) return false;
  if (Notification.permission !== "granted") return false;

  const title =
    alert.level === "exceeded"
      ? `Budget exceeded: ${alert.categoryName}`
      : `Budget alert: ${alert.categoryName}`;

  try {
    new Notification(title, {
      body: notificationBody(alert, currency),
      tag: budgetAlertDedupeKey({
        walletId: "local",
        categoryId: alert.categoryId,
        month: alert.month,
        level: alert.level,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function requestBudgetAlertPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * After an expense mutation, evaluate category budgets and deliver push/email.
 * Amounts never leave the client except as already-computed alert summaries.
 */
export async function maybeNotifyBudgetAlerts(opts: {
  expenses: Expense[];
  budgets: Budgets;
  wallet: FinancialWallet;
  month: string;
  currency: string;
  categoryIndex: CategoryIndex;
}): Promise<BudgetAlert[]> {
  const st = monthStats(opts.expenses, opts.budgets, opts.wallet, opts.month, opts.categoryIndex);
  const alerts = evaluateBudgetAlerts({
    byCat: st.byCat,
    budgets: opts.budgets,
    categories: opts.categoryIndex.expenseCategories,
    month: opts.month,
  });
  if (!alerts.length) return [];

  const sent = readSentKeys();
  const fresh = alerts.filter((a) => {
    const key = budgetAlertDedupeKey({
      walletId: opts.wallet.id,
      categoryId: a.categoryId,
      month: a.month,
      level: a.level,
    });
    return !sent.has(key);
  });
  if (!fresh.length) return [];

  for (const alert of fresh) {
    await showBudgetAlertNotification(alert, opts.currency);
  }

  try {
    await api.budgetAlerts.notify({
      walletId: opts.wallet.id,
      month: opts.month,
      alerts: fresh.map((a) => ({
        categoryId: a.categoryId,
        categoryName: a.categoryName,
        spent: a.spent,
        budget: a.budget,
        level: a.level,
        currency: opts.currency,
      })),
    });
  } catch {
    /* Email may be unset or Resend unconfigured — push still fired above. */
  }

  markSent(
    fresh.map((a) =>
      budgetAlertDedupeKey({
        walletId: opts.wallet.id,
        categoryId: a.categoryId,
        month: a.month,
        level: a.level,
      }),
    ),
  );

  return fresh;
}
