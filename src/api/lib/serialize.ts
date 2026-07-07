import type { ObjectId } from "mongodb";

export function toApiId(id: ObjectId | string): string {
  return typeof id === "string" ? id : id.toHexString();
}

export function serializeDoc<T extends { _id: ObjectId }>(
  doc: T,
): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: toApiId(_id) };
}

export function serializeDocs<T extends { _id: ObjectId }>(
  docs: T[],
): Array<Omit<T, "_id"> & { id: string }> {
  return docs.map(serializeDoc);
}
