import { z } from "zod";
import { monthKeySchema, walletAddressSchema } from "./common";

/** Per-user ledger UI state. Budgets/income live on financial_wallets (E2EE). */
export const ledgerProfileSchema = z.object({
  userAddress: walletAddressSchema,
  currentMonth: monthKeySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const updateProfileSchema = z
  .object({
    currentMonth: monthKeySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type LedgerProfile = z.infer<typeof ledgerProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export function defaultProfile(
  userAddress: string,
  currentMonth?: string,
): Omit<LedgerProfile, "createdAt" | "updatedAt"> {
  const now = new Date();
  const month =
    currentMonth ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    userAddress: walletAddressSchema.parse(userAddress),
    currentMonth: monthKeySchema.parse(month),
  };
}
