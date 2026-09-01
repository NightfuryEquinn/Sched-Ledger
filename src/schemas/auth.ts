import { z } from "zod";
import { walletAddressSchema } from "./common";

export const authChallengeSchema = z.object({
  address: walletAddressSchema,
});

export const authVerifySchema = z.object({
  address: walletAddressSchema,
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature"),
});
