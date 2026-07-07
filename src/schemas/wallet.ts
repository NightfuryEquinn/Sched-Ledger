import { z } from "zod";
import {
  budgetsSchema,
  walletAddressSchema,
} from "./common";
import { DEFAULT_CATEGORIES, emptyBudgets } from "./category";

export const CURRENCY_CODES = [
  "MYR",
  "USD",
  "SGD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "THB",
  "IDR",
  "CNY",
] as const;

export const currencyCodeSchema = z.enum(CURRENCY_CODES);

export const fundingModeSchema = z.enum(["monthly", "starting"]);

export const financialWalletSchema = z.object({
  userAddress: walletAddressSchema,
  name: z.string().trim().min(1).max(60),
  currency: currencyCodeSchema,
  fundingMode: fundingModeSchema.default("monthly"),
  income: z.number().nonnegative(),
  startingBalance: z.number().nonnegative(),
  budgets: budgetsSchema,
  isDefault: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(60),
  currency: currencyCodeSchema,
  fundingMode: fundingModeSchema.optional().default("monthly"),
  income: z.number().nonnegative().optional().default(0),
  startingBalance: z.number().nonnegative().optional().default(0),
});

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    currency: currencyCodeSchema.optional(),
    fundingMode: fundingModeSchema.optional(),
    income: z.number().nonnegative().optional(),
    startingBalance: z.number().nonnegative().optional(),
    budgets: budgetsSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type FinancialWallet = z.infer<typeof financialWalletSchema>;
export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type FundingMode = z.infer<typeof fundingModeSchema>;

export function defaultWallet(
  userAddress: string,
  overrides?: Partial<
    Pick<FinancialWallet, "name" | "currency" | "fundingMode" | "income" | "startingBalance" | "budgets">
  >,
): Omit<FinancialWallet, "createdAt" | "updatedAt"> {
  return {
    userAddress: walletAddressSchema.parse(userAddress),
    name: overrides?.name ?? "Main",
    currency: overrides?.currency ?? "MYR",
    fundingMode: overrides?.fundingMode ?? "monthly",
    income: overrides?.income ?? 0,
    startingBalance: overrides?.startingBalance ?? 0,
    budgets: overrides?.budgets ?? emptyBudgets(DEFAULT_CATEGORIES),
    isDefault: true,
  };
}
