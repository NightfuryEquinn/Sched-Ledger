import { z } from "zod";
import { DEFAULT_CATEGORIES, emptyBudgets } from "./category";
import {
  budgetsSchema,
  walletAddressSchema,
} from "./common";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

export const CURRENCY_CODES = [
  "AED",
  "AUD",
  "BDT",
  "BND",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "IDR",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NZD",
  "PHP",
  "PKR",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "USD",
  "VND",
  "ZAR",
] as const;

export const currencyCodeSchema = z.enum(CURRENCY_CODES);

export const fundingModeSchema = z.enum(["monthly", "starting"]);

export const financialWalletSchema = z.object({
  userAddress: walletAddressSchema,
  name: z.string().trim().min(1).max(60),
  currency: currencyCodeSchema,
  fundingMode: fundingModeSchema.default("monthly"),
  enc: e2eeVersionSchema.optional(),
  payload: encryptedPayloadSchema.optional(),
  income: z.number().nonnegative().optional(),
  startingBalance: z.number().nonnegative().optional(),
  budgets: budgetsSchema.optional(),
  isDefault: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(60),
  currency: currencyCodeSchema,
  fundingMode: fundingModeSchema.optional().default("monthly"),
});

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    currency: currencyCodeSchema.optional(),
    fundingMode: fundingModeSchema.optional(),
    isDefault: z.boolean().optional(),
    enc: e2eeVersionSchema.optional(),
    payload: encryptedPayloadSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .refine((data) => (data.enc == null) === (data.payload == null), {
    message: "enc and payload must be provided together",
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
