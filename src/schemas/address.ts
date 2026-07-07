import { z } from "zod";

export const walletAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-f0-9]{40}$/, "Invalid wallet address");
