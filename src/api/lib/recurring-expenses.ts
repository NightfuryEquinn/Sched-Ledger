import type { ObjectId } from "mongodb";
import { getCollections, getDb } from "@/db";
import type { ExpenseDocument } from "@/db/collections";
import {
  RECURRING_CATCHUP_LIMIT,
  formatIsoDateParts,
  normalizeRecurring,
  nextRecurringDueDate,
  parseIsoDate,
  recurringScheduleKey,
  zonedTodayIso,
  type RecurringInterval,
} from "@/lib/recurring";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

/** Only materialize dues in the last ~5 weeks (missed cron days), not years of history. */
const LOOKBACK_DAYS = 35;

export type RecurringMaterializeResult = {
  scanned: number;
  series: number;
  created: number;
  skipped: number;
  errors: string[];
};

function seriesKey(doc: ExpenseDocument): string {
  return recurringScheduleKey({
    walletId: doc.walletId?.toString() ?? "",
    sub: doc.sub,
    note: doc.note,
    recurring: doc.recurring,
  });
}

function addDaysIso(iso: string, delta: number): string {
  const { y, m, d } = parseIsoDate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return formatIsoDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

async function userTimezone(userAddress: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(userAddress);
  if (hit) return hit;
  const { users } = getCollections(getDb());
  const user = await users.findOne({ address: userAddress });
  const tz = user?.timezone ?? DEFAULT_TIMEZONE;
  cache.set(userAddress, tz);
  return tz;
}

/**
 * Create ledger rows for due recurring expenses/income through each user's local today.
 * Idempotent: skips dates that already have a matching series row.
 * Only fills dues within LOOKBACK_DAYS of today (plus RECURRING_CATCHUP_LIMIT per series).
 */
export async function processDueRecurringExpenses(now = new Date()): Promise<RecurringMaterializeResult> {
  const result: RecurringMaterializeResult = {
    scanned: 0,
    series: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const { expenses } = getCollections(getDb());
  const anchors = await expenses
    .find({
      recurring: { $in: [true, "monthly", "quarterly", "yearly"] },
      walletId: { $exists: true, $ne: null },
    })
    .sort({ date: -1 })
    .toArray();

  result.scanned = anchors.length;

  /** Latest row supplies amount/note; earliest date supplies day-of-month (avoids clamp drift). */
  type SeriesState = { latest: ExpenseDocument; anchorIso: string };
  const bySeries = new Map<string, SeriesState>();
  for (const doc of anchors) {
    const freq = normalizeRecurring(doc.recurring);
    if (!freq || !doc.walletId) continue;
    const key = `${doc.userAddress}|${seriesKey(doc)}`;
    const prev = bySeries.get(key);
    if (!prev) {
      bySeries.set(key, { latest: doc, anchorIso: doc.date });
      continue;
    }
    /* docs are sorted date desc — first seen is latest; track min date as anchor. */
    if (doc.date < prev.anchorIso) prev.anchorIso = doc.date;
  }

  result.series = bySeries.size;
  const tzCache = new Map<string, string>();

  for (const { latest: template, anchorIso } of bySeries.values()) {
    const freq = normalizeRecurring(template.recurring) as RecurringInterval;
    if (!template.walletId) {
      result.skipped++;
      continue;
    }

    try {
      const tz = await userTimezone(template.userAddress, tzCache);
      const today = zonedTodayIso(tz, now);
      const minDue = addDaysIso(today, -LOOKBACK_DAYS);
      let cursor = template.date;
      let createdForSeries = 0;

      while (createdForSeries < RECURRING_CATCHUP_LIMIT) {
        const due = nextRecurringDueDate(anchorIso, freq, cursor);
        if (!due || due > today) break;

        if (due < minDue) {
          cursor = due;
          continue;
        }

        const dedupe = {
          userAddress: template.userAddress,
          walletId: template.walletId as ObjectId,
          sub: template.sub,
          note: template.note,
          date: due,
          recurring:
            freq === "monthly"
              ? ({ $in: ["monthly", true] } as const)
              : freq,
        };

        const existing = await expenses.findOne(dedupe as Record<string, unknown>);
        if (existing) {
          result.skipped++;
          cursor = due;
          continue;
        }

        const stamp = new Date();
        await expenses.insertOne({
          userAddress: template.userAddress,
          walletId: template.walletId,
          kind: template.kind ?? "expense",
          date: due,
          sub: template.sub,
          amount: template.amount,
          note: template.note,
          recurring: freq,
          createdAt: stamp,
          updatedAt: stamp,
        });
        result.created++;
        createdForSeries++;
        cursor = due;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${template.note || template.sub} (${anchorIso}): ${msg}`);
    }
  }

  return result;
}
