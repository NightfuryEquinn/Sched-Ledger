import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

/**
 * Build a Mongo ObjectId from 12 random bytes (no embedded timestamp).
 * Prefer this for client-visible document ids so IDs do not leak creation time.
 */
export function randomObjectId(): ObjectId {
  return new ObjectId(randomBytes(12));
}

/**
 * Both stored forms of a foreign-key id, for a `$in` filter.
 *
 * Reference fields on expenses, events and fills are typed `ObjectId | string`:
 * every current write path constructs an ObjectId, but the type admits legacy
 * hex rows, and an ObjectId-only filter would skip those silently — which for a
 * cleanup query means leaving exactly the rows it exists to fix.
 */
export function idForms(hex: string): [ObjectId, string] {
  return [new ObjectId(hex), hex];
}
