import { z } from "zod";
import { categoryIdSchema } from "./category";

export { walletAddressSchema } from "./address";
export { accountIdSchema, objectIdSchema } from "./ids";

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Date must be YYYY-MM-DD");

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

export const LEAD_IDS = ["at", "15m", "30m", "1h", "6h", "12h", "1d", "2d"] as const;
export type LeadId = (typeof LEAD_IDS)[number];

/** Reminder leads allowed for all-day events (days only). */
export const ALL_DAY_LEAD_IDS = ["1d", "2d"] as const satisfies readonly LeadId[];

/** Reminder leads allowed for timed events. */
export const TIMED_LEAD_IDS = LEAD_IDS;

/** Whether a reminder lead is valid for an all-day or timed event. */
export function isLeadAllowedForEvent(lead: LeadId, allDay: boolean): boolean {
  return allDay
    ? (ALL_DAY_LEAD_IDS as readonly string[]).includes(lead)
    : (TIMED_LEAD_IDS as readonly string[]).includes(lead);
}

export const eventCategoryIdSchema = z.enum(EVENT_CATEGORY_IDS);
export const repeatIdSchema = z.enum(REPEAT_IDS);
export const leadIdSchema = z.enum(LEAD_IDS);
