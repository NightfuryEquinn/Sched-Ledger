import { ObjectId } from "mongodb";

/** Convert a Mongo ObjectId (or hex string) to the API id string. */
function toApiId(id: ObjectId | string): string {
  return typeof id === "string" ? id : id.toHexString();
}

const STRIP_OWNERSHIP_KEYS = new Set(["userAddress", "accountId", "address"]);

/**
 * Serialize a Mongo document for the API: expose `id`, stringify linked ObjectIds,
 * and strip ownership keys (accountId / legacy userAddress) from resource payloads.
 */
export function serializeDoc<T extends { _id: ObjectId }>(
  doc: T,
  opts?: { keepAddress?: boolean },
): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  const out: Record<string, unknown> = { ...rest, id: toApiId(_id) };

  for (const key of STRIP_OWNERSHIP_KEYS) {
    if (key === "address" && opts?.keepAddress) continue;
    delete out[key];
  }

  if ("walletId" in out && out.walletId instanceof ObjectId) {
    out.walletId = toApiId(out.walletId as ObjectId);
  }
  if ("eventId" in out && out.eventId instanceof ObjectId) {
    out.eventId = toApiId(out.eventId as ObjectId);
  }
  if ("expenseId" in out && out.expenseId instanceof ObjectId) {
    out.expenseId = toApiId(out.expenseId as ObjectId);
  }

  return out as Omit<T, "_id"> & { id: string };
}

/** Serialize many documents with ownership keys stripped. */
export function serializeDocs<T extends { _id: ObjectId }>(
  docs: T[],
): Array<Omit<T, "_id"> & { id: string }> {
  return docs.map((doc) => serializeDoc(doc));
}
