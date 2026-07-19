import { notFound } from "@/api/lib/errors";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { updateCategoriesSchema } from "@/schemas/category";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export const categoriesRoutes = new Hono<{ Variables: SessionVariables }>();

categoriesRoutes.use("*", sessionAuth);

/**
 * Return the user's taxonomy as enc/payload, legacy plaintext categories,
 * or { seed: true } when no document exists yet.
 */
categoriesRoutes.get("/", async (c) => {
  const accountId = c.get("accountId");
  const { categoryTaxonomies } = getCollections(getDb());
  const taxonomy = await categoryTaxonomies.findOne({ accountId });

  if (!taxonomy) {
    return c.json({ seed: true });
  }

  if (taxonomy.enc === 1 && taxonomy.payload) {
    return c.json({ enc: taxonomy.enc, payload: taxonomy.payload });
  }

  return c.json({ categories: taxonomy.categories ?? [] });
});

/**
 * Upsert encrypted category taxonomy; clears legacy plaintext `categories`.
 */
categoriesRoutes.put("/", zValidator("json", updateCategoriesSchema), async (c) => {
  const accountId = c.get("accountId");
  const { enc, payload } = c.req.valid("json");
  const { categoryTaxonomies } = getCollections(getDb());
  const now = new Date();

  const updated = await categoryTaxonomies.findOneAndUpdate(
    { accountId },
    {
      $set: { enc, payload, updatedAt: now },
      $setOnInsert: { accountId, createdAt: now },
      $unset: { categories: "" },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!updated) notFound("Category taxonomy not found");

  return c.json({ enc: updated.enc, payload: updated.payload });
});
