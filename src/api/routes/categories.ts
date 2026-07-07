import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { badRequest, notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import {
  DEFAULT_CATEGORIES,
  type Category,
  updateCategoriesSchema,
} from "@/schemas/category";

export const categoriesRoutes = new Hono<{ Variables: SessionVariables }>();

categoriesRoutes.use("*", sessionAuth);

function cloneDefaults(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    subs: c.subs.map((s) => ({ ...s })),
  }));
}

async function getOrCreateTaxonomy(userAddress: string) {
  const { categoryTaxonomies } = getCollections(getDb());
  const existing = await categoryTaxonomies.findOne({ userAddress });
  if (existing) return existing;

  const now = new Date();
  const result = await categoryTaxonomies.insertOne({
    userAddress,
    categories: cloneDefaults(),
    createdAt: now,
    updatedAt: now,
  });

  const created = await categoryTaxonomies.findOne({ _id: result.insertedId });
  if (!created) throw new Error("Failed to create category taxonomy");
  return created;
}

function validateTaxonomy(categories: Category[]) {
  const catIds = new Set<string>();
  const subIds = new Set<string>();
  let hasIncome = false;
  let hasExpense = false;

  for (const cat of categories) {
    if (catIds.has(cat.id)) badRequest(`Duplicate category id: ${cat.id}`);
    catIds.add(cat.id);
    if (cat.type === "income") hasIncome = true;
    else hasExpense = true;
    for (const sub of cat.subs) {
      if (subIds.has(sub.id)) badRequest(`Duplicate subcategory id: ${sub.id}`);
      subIds.add(sub.id);
    }
  }

  if (!hasIncome) badRequest("At least one income category is required");
  if (!hasExpense) badRequest("At least one expense category is required");
}

categoriesRoutes.get("/", async (c) => {
  const walletAddress = c.get("walletAddress");
  const taxonomy = await getOrCreateTaxonomy(walletAddress);
  return c.json({ categories: taxonomy.categories });
});

categoriesRoutes.put("/", zValidator("json", updateCategoriesSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const { categories } = c.req.valid("json");
  validateTaxonomy(categories);

  const { categoryTaxonomies } = getCollections(getDb());
  await getOrCreateTaxonomy(walletAddress);

  const updated = await categoryTaxonomies.findOneAndUpdate(
    { userAddress: walletAddress },
    { $set: { categories, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Category taxonomy not found");
  return c.json({ categories: updated.categories });
});

export async function findSubInTaxonomy(userAddress: string, subId: string) {
  const taxonomy = await getOrCreateTaxonomy(userAddress);
  for (const cat of taxonomy.categories) {
    const sub = cat.subs.find((s) => s.id === subId);
    if (sub) return { category: cat, sub };
  }
  return null;
}
