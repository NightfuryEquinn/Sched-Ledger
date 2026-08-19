import { z } from "zod";
import { accountIdSchema } from "./ids";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

const capitalPlanTaxonomySchema = z.object({
  accountId: accountIdSchema,
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createCapitalPlanSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export const updateCapitalPlanSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export type CapitalPlanTaxonomy = z.infer<typeof capitalPlanTaxonomySchema>;
