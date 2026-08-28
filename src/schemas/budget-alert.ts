import { z } from "zod";
import { categoryIdSchema, monthKeySchema, objectIdSchema } from "./common";

const budgetAlertLevelSchema = z.enum(["warning", "exceeded"]);

export const budgetAlertItemSchema = z.object({
  categoryId: categoryIdSchema,
  categoryName: z.string().trim().min(1).max(64),
  spent: z.number().nonnegative(),
  budget: z.number().positive(),
  level: budgetAlertLevelSchema,
  currency: z.string().trim().min(3).max(3).optional(),
});

export const createBudgetAlertsSchema = z.object({
  walletId: objectIdSchema,
  /** Client-decrypted display label (wallet names are E2EE). */
  walletName: z.string().trim().min(1).max(60).optional(),
  month: monthKeySchema,
  alerts: z.array(budgetAlertItemSchema).min(1).max(32),
});

export type BudgetAlertItem = z.infer<typeof budgetAlertItemSchema>;
