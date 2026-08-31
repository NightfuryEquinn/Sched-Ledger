import { ObjectId } from "mongodb";

/** Build a Mongo $or cursor for keyset pagination on (date desc, _id desc). */
export function dateIdCursorClause(before: string, beforeId?: string): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [{ date: { $lt: before } }];
  if (beforeId) {
    clauses.push({ date: before, _id: { $lt: new ObjectId(beforeId) } });
  }

  return clauses;
}

/** Append keyset pagination to a filter that may already constrain `date`. */
export function applyDateIdCursor(
  filter: Record<string, unknown>,
  before?: string,
  beforeId?: string,
): void {
  if (!before) return;

  const cursor = { $or: dateIdCursorClause(before, beforeId) };

  if (filter.date) {
    filter.$and = [{ date: filter.date }, cursor];
    delete filter.date;

    return;
  }

  if (filter.$and) {
    (filter.$and as Record<string, unknown>[]).push(cursor);

    return;
  }

  Object.assign(filter, cursor);
}

/** Derive the next page cursor from a sorted result page. */
export function pageCursorFromDocs<T extends { date: string; _id: ObjectId }>(
  docs: T[],
  limit: number,
): { hasMore: boolean; nextBefore: string | null; nextBeforeId: string | null } {
  const hasMore = docs.length === limit;
  const last = docs[docs.length - 1];

  return {
    hasMore,
    nextBefore: hasMore && last ? last.date : null,
    nextBeforeId: hasMore && last ? last._id.toHexString() : null,
  };
}
