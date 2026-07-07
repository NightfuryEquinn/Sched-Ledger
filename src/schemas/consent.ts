import { z } from "zod";
import { walletAddressSchema } from "./common";

export const consentSchema = z.object({
  userAddress: walletAddressSchema,
  optedIn: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const updateConsentSchema = z.object({
  optedIn: z.boolean(),
});

export type Consent = z.infer<typeof consentSchema>;
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;
