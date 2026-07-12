import { z } from "zod";

/** Current on-wire encryption format version. */
export const E2EE_VERSION = 1 as const;

export const e2eeVersionSchema = z.literal(E2EE_VERSION);

/** Base64-encoded AES-GCM blob (IV + ciphertext + tag). */
export const encryptedPayloadSchema = z.string().min(1).max(16_384);

/** SHA-256 hex digest identifying a recurring expense series. */
export const seriesKeySchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Invalid series key");

export type EncryptedPayload = z.infer<typeof encryptedPayloadSchema>;
export type SeriesKey = z.infer<typeof seriesKeySchema>;
