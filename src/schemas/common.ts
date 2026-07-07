import { z } from "zod";

export const walletAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-f0-9]{40}$/, "Invalid wallet address");

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Date must be YYYY-MM-DD");

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid document id");

export const CATEGORY_IDS = [
  "food",
  "transport",
  "utilities",
  "sport",
  "fun",
  "savings",
] as const;

export const SUBCATEGORY_IDS = [
  "groceries",
  "meal",
  "snacks",
  "petrol",
  "transportation",
  "electricity",
  "water",
  "internet",
  "gym",
  "streaming",
  "outings",
  "games",
  "saving",
] as const;

export const EVENT_CATEGORY_IDS = [
  "bill",
  "income",
  "savings",
  "renewal",
  "appointment",
  "personal",
] as const;

export const REPEAT_IDS = ["once", "daily", "weekly", "monthly", "yearly"] as const;

export const LEAD_IDS = ["at", "10m", "1h", "1d", "1w"] as const;

export const categoryIdSchema = z.enum(CATEGORY_IDS);
export const subcategoryIdSchema = z.enum(SUBCATEGORY_IDS);
export const eventCategoryIdSchema = z.enum(EVENT_CATEGORY_IDS);
export const repeatIdSchema = z.enum(REPEAT_IDS);
export const leadIdSchema = z.enum(LEAD_IDS);

export const budgetsSchema = z.record(categoryIdSchema, z.number().nonnegative());

export const DEFAULT_BUDGETS: Record<(typeof CATEGORY_IDS)[number], number> = {
  food: 1200,
  transport: 500,
  utilities: 450,
  sport: 180,
  fun: 350,
  savings: 1000,
};

export const EMPTY_BUDGETS: Record<(typeof CATEGORY_IDS)[number], number> = Object.fromEntries(
  CATEGORY_IDS.map((id) => [id, 0]),
) as Record<(typeof CATEGORY_IDS)[number], number>;

export const DEFAULT_INCOME = 5600;
