import { z } from "zod";
import {
  accountIdSchema,
  eventCategoryIdSchema,
  isoDateSchema,
  isLeadAllowedForEvent,
  leadIdSchema,
  objectIdSchema,
  repeatIdSchema,
  type LeadId,
} from "./common";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

export const eventCommentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(2000),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
});

const customLabelSchema = z.string().min(1).max(40);
const customGlyphSchema = z.string().min(1).max(8);

/** Refine lead against allDay for plaintext schedule fields. */
function refineLeadForAllDay(data: { allDay?: boolean; lead?: LeadId }, ctx: z.RefinementCtx) {
  if (data.lead === undefined) return;
  const allDay = data.allDay ?? true;
  if (!isLeadAllowedForEvent(data.lead, allDay)) {
    ctx.addIssue({
      code: "custom",
      message: allDay
        ? "All-day events only support day-based reminders"
        : "Invalid reminder lead for timed events",
      path: ["lead"],
    });
  }
}

const eventScheduleShape = {
  catId: eventCategoryIdSchema,
  date: isoDateSchema,
  allDay: z.boolean().default(true),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  repeat: repeatIdSchema.default("once"),
  /** Occurrence dates removed with "This Only". */
  exceptDates: z.array(isoDateSchema).optional(),
  /** Inclusive last occurrence; null/undefined means unbounded. */
  until: isoDateSchema.nullable().optional(),
  notify: z.boolean().default(false),
  lead: leadIdSchema.default("1d"),
  email: z.string().email().optional().or(z.literal("")),
  /** Optional expense logged from this event (e.g. bill paid). */
  expenseId: objectIdSchema.optional(),
};

const eventSchema = z.object({
  accountId: accountIdSchema,
  ...eventScheduleShape,
  enc: e2eeVersionSchema.optional(),
  payload: encryptedPayloadSchema.optional(),
  /** Legacy plaintext secrets (pre-E2EE). */
  title: z.string().min(1).max(200).optional(),
  customLabel: customLabelSchema.optional(),
  customGlyph: customGlyphSchema.optional(),
  comments: z.array(eventCommentSchema).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createEventSchema = z
  .object({
    catId: eventCategoryIdSchema,
    date: isoDateSchema,
    allDay: z.boolean().optional().default(true),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional()
      .default(null),
    repeat: repeatIdSchema.optional().default("once"),
    notify: z.boolean().optional().default(false),
    lead: leadIdSchema.optional().default("1d"),
    email: z.string().email().optional().or(z.literal("")),
    expenseId: objectIdSchema.optional(),
    enc: e2eeVersionSchema,
    payload: encryptedPayloadSchema,
  })
  .superRefine(refineLeadForAllDay);

export const updateEventSchema = z
  .object({
    catId: eventCategoryIdSchema.optional(),
    date: isoDateSchema.optional(),
    allDay: z.boolean().optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    repeat: repeatIdSchema.optional(),
    exceptDates: z.array(isoDateSchema).optional(),
    until: isoDateSchema.nullable().optional(),
    notify: z.boolean().optional(),
    lead: leadIdSchema.optional(),
    email: z.string().email().optional().or(z.literal("")),
    expenseId: objectIdSchema.nullable().optional(),
    enc: e2eeVersionSchema,
    payload: encryptedPayloadSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(refineLeadForAllDay);

export const listEventsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(2000),
  before: isoDateSchema.optional(),
});

export type EventComment = z.infer<typeof eventCommentSchema>;
export type Event = z.infer<typeof eventSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
