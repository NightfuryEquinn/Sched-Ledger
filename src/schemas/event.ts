import { z } from "zod";
import {
  eventCategoryIdSchema,
  isoDateSchema,
  isLeadAllowedForEvent,
  leadIdSchema,
  repeatIdSchema,
  walletAddressSchema,
  type LeadId,
} from "./common";

export const eventCommentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(2000),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
});

const customLabelSchema = z.string().min(1).max(40);
const customGlyphSchema = z.string().min(1).max(8);

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

function withCustomFields<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((data, ctx) => {
    if (data.catId === "custom") {
      if (!data.customLabel?.trim()) {
        ctx.addIssue({ code: "custom", message: "Custom type name is required", path: ["customLabel"] });
      }
      if (!data.customGlyph?.trim()) {
        ctx.addIssue({ code: "custom", message: "Custom emoji is required", path: ["customGlyph"] });
      }
    }
    refineLeadForAllDay(data, ctx);
  });
}

export const eventSchema = z.object({
  userAddress: walletAddressSchema,
  title: z.string().min(1).max(200),
  catId: eventCategoryIdSchema,
  customLabel: customLabelSchema.optional(),
  customGlyph: customGlyphSchema.optional(),
  date: isoDateSchema,
  allDay: z.boolean().default(true),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  repeat: repeatIdSchema.default("once"),
  /** Occurrence dates removed with "This Only". */
  exceptDates: z.array(isoDateSchema).optional().default([]),
  /** Inclusive last occurrence; null/undefined means unbounded. */
  until: isoDateSchema.nullable().optional(),
  notify: z.boolean().default(false),
  lead: leadIdSchema.default("1d"),
  email: z.string().email().optional().or(z.literal("")),
  comments: z.array(eventCommentSchema).default([]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createEventSchema = withCustomFields({
  title: z.string().min(1).max(200),
  catId: eventCategoryIdSchema,
  customLabel: customLabelSchema.optional(),
  customGlyph: customGlyphSchema.optional(),
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
  comments: z.array(eventCommentSchema).optional().default([]),
});

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    catId: eventCategoryIdSchema.optional(),
    customLabel: customLabelSchema.optional(),
    customGlyph: customGlyphSchema.optional(),
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
    comments: z.array(eventCommentSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .superRefine((data, ctx) => {
    if (data.catId === "custom") {
      if (!data.customLabel?.trim()) {
        ctx.addIssue({ code: "custom", message: "Custom type name is required", path: ["customLabel"] });
      }
      if (!data.customGlyph?.trim()) {
        ctx.addIssue({ code: "custom", message: "Custom emoji is required", path: ["customGlyph"] });
      }
    }
    refineLeadForAllDay(data, ctx);
  });

export const addEventCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const listEventsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export type EventComment = z.infer<typeof eventCommentSchema>;
export type Event = z.infer<typeof eventSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type AddEventCommentInput = z.infer<typeof addEventCommentSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
