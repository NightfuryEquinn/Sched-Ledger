import type { ExpenseDocument } from "@/db/collections";
import type { DeleteScope } from "@/lib/delete-scope";
import { normalizeRecurring } from "@/lib/recurring";
import type { Collection, ObjectId } from "mongodb";

/** Build a Mongo filter that matches every member of an expense's recurring series. */
export function expenseSeriesFilter(doc: ExpenseDocument, accountId: string) {
  const base: Record<string, unknown> = {
    accountId,
    walletId: doc.walletId,
  };

  if (doc.enc === 1 && doc.seriesKey) {
    return { ...base, seriesKey: doc.seriesKey };
  }

  const freq = normalizeRecurring(doc.recurring);
  return {
    ...base,
    sub: doc.sub,
    note: doc.note ?? "",
    recurring:
      freq === "monthly" ? ({ $in: [true, "monthly"] } as const) : freq === false ? false : freq,
  };
}

type ExpenseDeleteResult = {
  deletedIds: string[];
  skippedId?: string;
};

type ExpenseSeriesRetireResult = {
  /** Old-series future rows removed so the prior cadence stops. */
  deletedIds: string[];
  /** Old-series past rows kept as history with recurrence cleared. */
  endedIds: string[];
};

type ExpenseFindCursor = {
  project: (projection: { _id: 1 }) => {
    toArray: () => Promise<Array<{ _id: ObjectId }>>;
  };
};

type ExpenseCollection = Pick<
  Collection<ExpenseDocument>,
  "updateOne" | "updateMany" | "deleteMany"
> & {
  find: (filter: Record<string, unknown>) => ExpenseFindCursor;
};

/**
 * True when an update leaves the prior recurring series (new frequency,
 * new seriesKey, or recurrence turned off) so cron must stop on the old group.
 */
export function shouldRetireOldExpenseSeries(
  existing: Pick<ExpenseDocument, "recurring" | "seriesKey">,
  body: { recurring?: unknown; seriesKey?: string | null },
): boolean {
  const oldFreq = normalizeRecurring(existing.recurring);
  if (oldFreq === false) return false;

  if (body.recurring !== undefined) {
    const newFreq = normalizeRecurring(body.recurring);
    if (newFreq !== oldFreq) return true;
  }

  if ("seriesKey" in body) {
    const newKey = body.seriesKey ?? null;
    const oldKey = existing.seriesKey ?? null;
    if (newKey !== oldKey) return true;
  }

  return false;
}

/**
 * After an occurrence forks to a new cadence: keep earlier rows as one-off
 * history, delete later rows of the old series, so only the updated row's
 * cron continues.
 */
export async function retireOldExpenseSeries(opts: {
  expenses: ExpenseCollection;
  doc: ExpenseDocument;
  accountId: string;
  /** Pivot date — typically the edited occurrence's date. */
  pivotDate: string;
}): Promise<ExpenseSeriesRetireResult> {
  const { expenses, doc, accountId, pivotDate } = opts;
  const series = expenseSeriesFilter(doc, accountId);
  const now = new Date();
  const others = { ...series, _id: { $ne: doc._id } };

  const past = await expenses
    .find({ ...others, date: { $lt: pivotDate } })
    .project({ _id: 1 })
    .toArray();
  const endedIds = past.map((row) => row._id.toString());

  if (endedIds.length) {
    await expenses.updateMany(
      { ...others, date: { $lt: pivotDate } },
      { $set: { recurring: false, updatedAt: now }, $unset: { seriesKey: "" } },
    );
  }

  const future = await expenses
    .find({ ...others, date: { $gt: pivotDate } })
    .project({ _id: 1 })
    .toArray();
  const deletedIds = future.map((row) => row._id.toString());

  if (deletedIds.length) {
    await expenses.deleteMany({ ...others, date: { $gt: pivotDate } });
  }

  // Same-date siblings on the old series (rare): stop cron, keep the row.
  await expenses.updateMany(
    { ...others, date: pivotDate },
    { $set: { recurring: false, updatedAt: now }, $unset: { seriesKey: "" } },
  );

  return { deletedIds, endedIds };
}

/**
 * Apply a delete scope to a recurring expense series.
 * Caller must ensure `doc` is recurring when scope is used.
 */
export async function applyExpenseDeleteScope(opts: {
  expenses: ExpenseCollection;
  doc: ExpenseDocument;
  accountId: string;
  scope: DeleteScope;
  fromDate: string;
}): Promise<ExpenseDeleteResult> {
  const { expenses, doc, accountId, scope, fromDate } = opts;
  const series = expenseSeriesFilter(doc, accountId);
  const now = new Date();

  if (scope === "this") {
    await expenses.updateOne(
      { _id: doc._id, accountId },
      { $set: { skipped: true, updatedAt: now } },
    );
    return { deletedIds: [], skippedId: doc._id.toString() };
  }

  if (scope === "future") {
    const toRemove = await expenses
      .find({ ...series, date: { $gte: fromDate } })
      .project({ _id: 1 })
      .toArray();
    const deletedIds = toRemove.map((row) => row._id.toString());

    if (deletedIds.length) {
      await expenses.deleteMany({
        ...series,
        date: { $gte: fromDate },
      });
    }

    await expenses.updateMany(
      { ...series, date: { $lt: fromDate }, skipped: { $ne: true } },
      { $set: { recurring: false, updatedAt: now }, $unset: { seriesKey: "" } },
    );

    return { deletedIds };
  }

  const toRemove = await expenses.find(series).project({ _id: 1 }).toArray();
  const deletedIds = toRemove.map((row) => row._id.toString());
  if (deletedIds.length) {
    await expenses.deleteMany(series);
  }

  return { deletedIds };
}
