import { z } from "zod";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

export const createCapitalPlanSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export const updateCapitalPlanSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});
