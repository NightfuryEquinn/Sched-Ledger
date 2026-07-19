import { z } from "zod";

/** Mongo ObjectId as a 24-char hex string. */
export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid document id");

/** Opaque account id (users._id hex) used as the ownership FK. */
export const accountIdSchema = objectIdSchema;
