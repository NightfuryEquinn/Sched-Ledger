import { budgetAlertEmailHtml, emailConfigured, sendEmail } from "@/api/lib/email";
import { getCollections, getDb } from "@/db";
import type { BudgetAlertItem } from "@/schemas/budget-alert";
import { ObjectId } from "mongodb";

export type BudgetAlertSendResult = {
  sent: number;
  skipped: number;
  errors: string[];
};

function formatAmount(amount: number, currency?: string): string {
  const code = (currency || "MYR").toUpperCase();
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount)}`;
  }
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/**
 * Sends budget-near-limit emails for alerts the client evaluated after decrypting
 * ledger data. Dedupes via budget_alert_logs so each category/level/month emails once.
 */
export async function sendBudgetAlerts(opts: {
  userAddress: string;
  walletId: string;
  walletName?: string;
  month: string;
  alerts: BudgetAlertItem[];
}): Promise<BudgetAlertSendResult> {
  const result: BudgetAlertSendResult = { sent: 0, skipped: 0, errors: [] };

  if (!emailConfigured()) {
    result.errors.push("RESEND_API_KEY not configured");
    return result;
  }

  const { users, budgetAlertLogs, financialWallets } = getCollections(getDb());
  const user = await users.findOne({ address: opts.userAddress });
  if (!user) {
    result.errors.push("User not found");
    return result;
  }

  if (user.budgetAlertsEnabled === false) {
    result.skipped += opts.alerts.length;
    return result;
  }

  const email = user.notifyEmail?.trim();
  if (!email) {
    result.errors.push("No notify email on file");
    return result;
  }

  let walletName = opts.walletName;
  if (!walletName) {
    try {
      const wallet = await financialWallets.findOne({
        _id: new ObjectId(opts.walletId),
        userAddress: opts.userAddress,
      });
      walletName = wallet?.name;
    } catch {
      /* ignore invalid wallet id */
    }
  }

  const label = monthLabel(opts.month);

  for (const alert of opts.alerts) {
    const logKey = {
      userAddress: opts.userAddress,
      walletId: opts.walletId,
      categoryId: alert.categoryId,
      month: opts.month,
      level: alert.level,
    };

    const existing = await budgetAlertLogs.findOne(logKey);
    if (existing) {
      result.skipped++;
      continue;
    }

    const percent = Math.round((alert.spent / alert.budget) * 100);
    const { html, text, subject } = budgetAlertEmailHtml({
      categoryName: alert.categoryName,
      level: alert.level,
      spentLabel: formatAmount(alert.spent, alert.currency),
      budgetLabel: formatAmount(alert.budget, alert.currency),
      percent,
      monthLabel: label,
      walletName,
    });

    const sent = await sendEmail({ to: email, subject, html, text });
    if (!sent.ok) {
      result.errors.push(`${alert.categoryId}: ${sent.error}`);
      continue;
    }

    try {
      await budgetAlertLogs.insertOne({
        ...logKey,
        email,
        sentAt: new Date(),
      });
      result.sent++;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        result.skipped++;
      } else {
        result.errors.push(`${alert.categoryId}: failed to log send`);
      }
    }
  }

  return result;
}
