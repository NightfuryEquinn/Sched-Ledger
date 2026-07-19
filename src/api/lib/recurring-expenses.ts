import { randomObjectId } from "@/api/lib/ids";
import { getCollections, getDb } from "@/db";
import type { ExpenseDocument } from "@/db/collections";
import {
  RECURRING_CATCHUP_LIMIT,
  formatIsoDateParts,
  nextRecurringDueDate,
  normalizeRecurring,
  parseIsoDate,
  recurringScheduleKey,
  zonedTodayIso,
  type RecurringInterval,
} from "@/lib/recurring";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { ObjectId } from "mongodb";

/** Only materialize dues in the last ~5 weeks (missed cron days), not years of history. */
const LOOKBACK_DAYS = 35;

/** Bound work per cron-job.org poll (aligned with ~30s request timeout). */
const ANCHOR_BATCH_LIMIT = 200;
const CRON_TIME_BUDGET_MS = 22_000;

export type RecurringMaterializeResult = {
  scanned: number;
  series: number;
  created: number;
  skipped: number;
  errors: string[];
  truncated?: boolean;
};

function legacySeriesKey(doc: ExpenseDocument): string {
  return recurringScheduleKey({
    walletId: doc.walletId?.toString() ?? "",
    sub: doc.sub ?? "",
    note: doc.note ?? "",
    recurring: doc.recurring,
  });
}

function seriesKey(doc: ExpenseDocument): string {
  if (doc.enc === 1 && doc.seriesKey) return doc.seriesKey;
  return legacySeriesKey(doc);
}

function addDaysIso(iso: string, delta: number): string {
  const { y, m, d } = parseIsoDate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return formatIsoDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Resolve a user's IANA timezone, caching by accountId. */
async function userTimezone(accountId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(accountId);
  if (hit) return hit;
  const { users } = getCollections(getDb());
  const user = await users.findOne({ _id: new ObjectId(accountId) });
  const tz = user?.timezone ?? DEFAULT_TIMEZONE;
  cache.set(accountId, tz);
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
  const started = Date.now();
  const anchors = await expenses
    .find({
      recurring: { $in: [true, "monthly", "quarterly", "yearly"] },
      walletId: { $exists: true },
      skipped: { $ne: true },
    } as Record<string, unknown>)
    .sort({ date: -1 })
    .limit(ANCHOR_BATCH_LIMIT)
    .toArray();

  result.scanned = anchors.length;
  if (anchors.length >= ANCHOR_BATCH_LIMIT) {
    result.truncated = true;
  }

  /** Latest row supplies payload/amount; earliest date supplies day-of-month (avoids clamp drift). */
  type SeriesState = { latest: ExpenseDocument; anchorIso: string };
  const bySeries = new Map<string, SeriesState>();
  for (const doc of anchors) {
    const freq = normalizeRecurring(doc.recurring);
    if (!freq || !doc.walletId) continue;
    const key = `${doc.accountId}|${seriesKey(doc)}`;
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
    if (Date.now() - started > CRON_TIME_BUDGET_MS) {
      result.truncated = true;
      break;
    }

    const freq = normalizeRecurring(template.recurring) as RecurringInterval;
    if (!template.walletId) {
      result.skipped++;
      continue;
    }

    try {
      const tz = await userTimezone(template.accountId, tzCache);
      const today = zonedTodayIso(tz, now);
      const minDue = addDaysIso(today, -LOOKBACK_DAYS);
      let cursor = template.date;
      let createdForSeries = 0;
      const encrypted = template.enc === 1;

      while (createdForSeries < RECURRING_CATCHUP_LIMIT) {
        const due = nextRecurringDueDate(anchorIso, freq, cursor);
        if (!due || due > today) break;

        if (due < minDue) {
          cursor = due;
          continue;
        }

        const dedupe = encrypted
          ? {
              accountId: template.accountId,
              walletId: template.walletId,
              seriesKey: template.seriesKey,
              date: due,
              recurring:
                freq === "monthly"
                  ? ({ $in: ["monthly", true] } as const)
                  : freq,
            }
          : {
              accountId: template.accountId,
              walletId: template.walletId,
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
          _id: randomObjectId(),
          accountId: template.accountId,
          walletId: template.walletId,
          kind: template.kind ?? "expense",
          date: due,
          recurring: freq,
          ...(encrypted
            ? {
                enc: 1 as const,
                payload: template.payload!,
                seriesKey: template.seriesKey,
              }
            : {
                sub: template.sub!,
                amount: template.amount!,
                note: template.note ?? "",
              }),
          createdAt: stamp,
          updatedAt: stamp,
        });
        result.created++;
        createdForSeries++;
        cursor = due;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const label =
        template.enc === 1
          ? template.seriesKey?.slice(0, 8) ?? "encrypted"
          : template.note || template.sub || "recurring";
      result.errors.push(`${label} (${anchorIso}): ${msg}`);
    }
  }

  return result;
}
