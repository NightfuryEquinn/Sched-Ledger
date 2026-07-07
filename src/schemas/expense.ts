import { z } from "zod";
import { isoDateSchema, subcategoryIdSchema, walletAddressSchema } from "./common";

export const expenseSchema = z.object({
  userAddress: walletAddressSchema,
  date: isoDateSchema,
  sub: subcategoryIdSchema,
  amount: z.number().positive(),
  note: z.string().max(500).default(""),
  recurring: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createExpenseSchema = z.object({
  date: isoDateSchema,
  sub: subcategoryIdSchema,
  amount: z.number().positive(),
  note: z.string().max(500).optional().default(""),
  recurring: z.boolean().optional().default(false),
});

export const updateExpenseSchema = z
  .object({
    date: isoDateSchema.optional(),
    sub: subcategoryIdSchema.optional(),
    amount: z.number().positive().optional(),
    note: z.string().max(500).optional(),
    recurring: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listExpensesQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  recurring: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sub: subcategoryIdSchema.optional(),
});

export type Expense = z.infer<typeof expenseSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
