import { ObjectId } from "mongodb";

export function toApiId(id: ObjectId | string): string {
  return typeof id === "string" ? id : id.toHexString();
}

export function serializeDoc<T extends { _id: ObjectId }>(
  doc: T,
): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  const out: Record<string, unknown> = { ...rest, id: toApiId(_id) };
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

export function serializeDocs<T extends { _id: ObjectId }>(
  docs: T[],
): Array<Omit<T, "_id"> & { id: string }> {
  return docs.map(serializeDoc);
}
