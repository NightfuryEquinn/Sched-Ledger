import { z } from "zod";
import { RECURRING_INTERVALS } from "@/lib/recurring";
import { isoDateSchema, objectIdSchema, subcategoryIdSchema, walletAddressSchema } from "./common";

export const txnKindSchema = z.enum(["expense", "income"]);

export { RECURRING_INTERVALS };
export const recurringIntervalSchema = z.enum(RECURRING_INTERVALS);
export type RecurringInterval = z.infer<typeof recurringIntervalSchema>;

export const recurringFieldSchema = z.preprocess(
  (val) => {
    if (val === true) return "monthly";
    if (val === false || val === null || val === undefined) return false;
    return val;
  },
  z.union([recurringIntervalSchema, z.literal(false)]),
);

export const recurringFieldInputSchema = z.union([recurringIntervalSchema, z.literal(false)]).default(false);

export const expenseSchema = z.object({
  userAddress: walletAddressSchema,
  walletId: objectIdSchema.optional(),
  kind: txnKindSchema.default("expense"),
  date: isoDateSchema,
  sub: subcategoryIdSchema,
  amount: z.number().positive(),
  note: z.string().max(500).default(""),
  recurring: recurringFieldSchema.default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createExpenseSchema = z.object({
  walletId: objectIdSchema,
  kind: txnKindSchema.optional().default("expense"),
  date: isoDateSchema,
  sub: subcategoryIdSchema,
  amount: z.number().positive(),
  note: z.string().max(500).optional().default(""),
  recurring: recurringFieldInputSchema.optional().default(false),
});

export const updateExpenseSchema = z
  .object({
    walletId: objectIdSchema.optional(),
    kind: txnKindSchema.optional(),
    date: isoDateSchema.optional(),
    sub: subcategoryIdSchema.optional(),
    amount: z.number().positive().optional(),
    note: z.string().max(500).optional(),
    recurring: recurringFieldInputSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listExpensesQuerySchema = z.object({
  walletId: objectIdSchema.optional(),
  kind: txnKindSchema.optional(),
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

export type TxnKind = z.infer<typeof txnKindSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
