import { z } from "zod";
import { walletAddressSchema } from "./common";

export const userSchema = z.object({
  address: walletAddressSchema,
  codename: z.string().min(1).max(64),
  notifyEmail: z.string().email().optional().or(z.literal("")),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createUserSchema = z.object({
  address: walletAddressSchema,
  codename: z.string().min(1).max(64),
  notifyEmail: z.string().email().optional().or(z.literal("")),
});

export const updateUserSchema = z
  .object({
    codename: z.string().min(1).max(64).optional(),
    notifyEmail: z.string().email().optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
