import { z } from "zod";
import { categoryIdSchema, monthKeySchema, objectIdSchema } from "./common";

export const budgetAlertLevelSchema = z.enum(["warning", "exceeded"]);

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
  month: monthKeySchema,
  alerts: z.array(budgetAlertItemSchema).min(1).max(32),
});

export type BudgetAlertLevel = z.infer<typeof budgetAlertLevelSchema>;
export type BudgetAlertItem = z.infer<typeof budgetAlertItemSchema>;
export type CreateBudgetAlertsInput = z.infer<typeof createBudgetAlertsSchema>;
