import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

/**
 * Build a Mongo ObjectId from 12 random bytes (no embedded timestamp).
 * Prefer this for client-visible document ids so IDs do not leak creation time.
 */
export function randomObjectId(): ObjectId {
  return new ObjectId(randomBytes(12));
}
