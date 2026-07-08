import { z } from "zod";
import { categoryIdSchema, subcategoryIdSchema } from "./category";

export { walletAddressSchema } from "./address";

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
  "income",
] as const;

/** @deprecated Use subcategoryIdSchema from category.ts */
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
  "salary",
  "wages",
  "bonus",
  "funds",
  "other_income",
] as const;

export { categoryIdSchema, subcategoryIdSchema } from "./category";

export const budgetsSchema = z.record(categoryIdSchema, z.number().nonnegative());

export const EVENT_CATEGORY_IDS = [
  "bill",
  "income",
  "savings",
  "renewal",
  "appointment",
  "personal",
  "custom",
] as const;

export const REPEAT_IDS = ["once", "daily", "weekly", "monthly", "yearly"] as const;
export type RepeatId = (typeof REPEAT_IDS)[number];

export const LEAD_IDS = ["at", "10m", "1h", "1d", "1w"] as const;
export type LeadId = (typeof LEAD_IDS)[number];

export const eventCategoryIdSchema = z.enum(EVENT_CATEGORY_IDS);
export const repeatIdSchema = z.enum(REPEAT_IDS);
export const leadIdSchema = z.enum(LEAD_IDS);

export const EMPTY_BUDGETS: Record<string, number> = Object.fromEntries(
  CATEGORY_IDS.map((id) => [id, 0]),
);

export const DEFAULT_INCOME = 5600;
