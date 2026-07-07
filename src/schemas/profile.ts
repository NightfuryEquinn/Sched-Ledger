import { z } from "zod";
import {
  budgetsSchema,
  EMPTY_BUDGETS,
  monthKeySchema,
  walletAddressSchema,
} from "./common";

export const ledgerProfileSchema = z.object({
  userAddress: walletAddressSchema,
  income: z.number().nonnegative(),
  budgets: budgetsSchema,
  currentMonth: monthKeySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const updateProfileSchema = z
  .object({
    income: z.number().nonnegative().optional(),
    budgets: budgetsSchema.optional(),
    currentMonth: monthKeySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const updateBudgetsSchema = z.object({
  budgets: budgetsSchema,
});

export type LedgerProfile = z.infer<typeof ledgerProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateBudgetsInput = z.infer<typeof updateBudgetsSchema>;

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
    income: 0,
    budgets: { ...EMPTY_BUDGETS },
    currentMonth: monthKeySchema.parse(month),
  };
}
