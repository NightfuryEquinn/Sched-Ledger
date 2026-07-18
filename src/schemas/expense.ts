import { RECURRING_INTERVALS } from "@/lib/recurring";
import { z } from "zod";
import { encryptedPayloadSchema, e2eeVersionSchema, seriesKeySchema } from "./encryption";
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

const expenseMetaSchema = z.object({
  walletId: objectIdSchema,
  kind: txnKindSchema.optional().default("expense"),
  date: isoDateSchema,
  recurring: recurringFieldInputSchema.optional().default(false),
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
  seriesKey: seriesKeySchema.optional(),
});

export const createExpenseSchema = expenseMetaSchema;

export const updateExpenseSchema = z
  .object({
    walletId: objectIdSchema.optional(),
    kind: txnKindSchema.optional(),
    date: isoDateSchema.optional(),
    recurring: recurringFieldInputSchema.optional(),
    enc: e2eeVersionSchema,
    payload: encryptedPayloadSchema,
    seriesKey: seriesKeySchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const expenseSchema = z.object({
  userAddress: walletAddressSchema,
  walletId: objectIdSchema.optional(),
  kind: txnKindSchema.default("expense"),
  date: isoDateSchema,
  recurring: recurringFieldSchema.default(false),
  enc: e2eeVersionSchema.optional(),
  payload: encryptedPayloadSchema.optional(),
  seriesKey: seriesKeySchema.optional(),
  /** Soft-deleted occurrence kept so cron does not rematerialize it. */
  skipped: z.boolean().optional().default(false),
  /** Legacy plaintext fields. */
  sub: subcategoryIdSchema.optional(),
  amount: z.number().positive().optional(),
  note: z.string().max(500).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
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
