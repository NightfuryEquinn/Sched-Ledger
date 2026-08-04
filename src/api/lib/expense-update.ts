import type { UpdateExpenseInput } from "@/schemas/expense";
import { ObjectId } from "mongodb";

export type ExpenseUpdateDocument = {
  $set: Record<string, unknown>;
  $unset?: Record<string, "">;
};

/**
 * Build the Mongo update document for PATCH /expenses/:id.
 *
 * A nullable field ("clear this") is expressed with $unset only — never with a
 * matching $set entry. Mongo rejects an update that touches the same path from
 * two operators with ConflictingUpdateOperators (code 40), and the driver
 * serializes an `undefined` value in $set as null rather than dropping it, so
 * `$set: { seriesKey: undefined }` still counts as touching the path.
 */
export function buildExpenseUpdate(
  body: UpdateExpenseInput,
  now: Date = new Date(),
): ExpenseUpdateDocument {
  const $set: Record<string, unknown> = { updatedAt: now };
  if (body.walletId) $set.walletId = new ObjectId(body.walletId);
  if (body.kind !== undefined) $set.kind = body.kind;
  if (body.date !== undefined) $set.date = body.date;
  if (body.recurring !== undefined) $set.recurring = body.recurring;
  if (body.enc !== undefined) $set.enc = body.enc;
  if (body.payload !== undefined) $set.payload = body.payload;
  /* null means "drop the series membership" and is handled by $unset below. */
  if (body.seriesKey != null) $set.seriesKey = body.seriesKey;
  if (body.eventId) $set.eventId = new ObjectId(body.eventId);

  const $unset: Record<string, ""> = {};
  if (body.payload !== undefined) {
    /* Legacy plaintext columns are replaced by the encrypted payload. */
    $unset.sub = "";
    $unset.amount = "";
    $unset.note = "";
  }
  if (body.seriesKey === null) $unset.seriesKey = "";
  if (body.eventId === null) $unset.eventId = "";

  return Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
}
