import { TODO_ICON_OPTIONS } from "@/lib/glyphs";
import { z } from "zod";
import { walletAddressSchema } from "./address";

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
  name: z.string().trim().min(1).max(80),
  icon: todoIconSchema.default("📋"),
  tasks: z.array(todoTaskSchema).default([]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createTodoListSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: todoIconSchema.default("📋"),
});

export const updateTodoListSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  icon: todoIconSchema.optional(),
  tasks: z.array(todoTaskSchema).optional(),
});

export type TodoIcon = z.infer<typeof todoIconSchema>;
export type TodoTask = z.infer<typeof todoTaskSchema>;
export type TodoList = z.infer<typeof todoListSchema>;
