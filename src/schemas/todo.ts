import { TODO_ICON_OPTIONS } from "@/lib/glyphs";
import { z } from "zod";
import { walletAddressSchema } from "./address";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

export const TODO_ICONS = TODO_ICON_OPTIONS;

export const todoIconSchema = z.enum(TODO_ICONS);

export const todoTaskIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9_-]+$/, "Invalid task id");

export const todoTaskSchema = z.object({
  id: todoTaskIdSchema,
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

export const todoListSchema = z.object({
  userAddress: walletAddressSchema,
  enc: e2eeVersionSchema.optional(),
  payload: encryptedPayloadSchema.optional(),
  /** Legacy plaintext fields (pre-E2EE). */
  name: z.string().trim().min(1).max(80).optional(),
  icon: todoIconSchema.optional(),
  tasks: z.array(todoTaskSchema).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createTodoListSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export const updateTodoListSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export type TodoIcon = z.infer<typeof todoIconSchema>;
export type TodoTask = z.infer<typeof todoTaskSchema>;
export type TodoList = z.infer<typeof todoListSchema>;
