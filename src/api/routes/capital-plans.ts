import { notFound } from "@/api/lib/errors";
import { randomObjectId } from "@/api/lib/ids";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { objectIdSchema } from "@/schemas/common";
import { createCapitalPlanSchema, updateCapitalPlanSchema } from "@/schemas/capital-plan";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const capitalPlansRoutes = new Hono<{ Variables: SessionVariables }>();

capitalPlansRoutes.use("*", sessionAuth);

capitalPlansRoutes.get("/", async (c) => {
  const accountId = c.get("accountId");
  const { capitalPlans } = getCollections(getDb());
  const docs = await capitalPlans.find({ accountId }).sort({ createdAt: 1 }).toArray();
  return c.json({ capitalPlans: serializeDocs(docs) });
});

capitalPlansRoutes.post("/", zValidator("json", createCapitalPlanSchema), async (c) => {
  const accountId = c.get("accountId");
  const body = c.req.valid("json");
  const { capitalPlans } = getCollections(getDb());
  const now = new Date();

  const result = await capitalPlans.insertOne({
    _id: randomObjectId(),
    accountId,
    enc: body.enc,
    payload: body.payload,
    createdAt: now,
    updatedAt: now,
  });

  const doc = await capitalPlans.findOne({ _id: result.insertedId });
  if (!doc) notFound("Plan not found");

  return c.json({ capitalPlan: serializeDoc(doc) }, 201);
});

capitalPlansRoutes.patch("/:id", zValidator("json", updateCapitalPlanSchema), async (c) => {
  const accountId = c.get("accountId");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Plan not found");

  const body = c.req.valid("json");
  const { capitalPlans } = getCollections(getDb());

  const updated = await capitalPlans.findOneAndUpdate(
    { _id: new ObjectId(id.data), accountId },
    { $set: { enc: body.enc, payload: body.payload, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Plan not found");
  return c.json({ capitalPlan: serializeDoc(updated) });
});

capitalPlansRoutes.delete("/:id", async (c) => {
  const accountId = c.get("accountId");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Plan not found");

  const { capitalPlans } = getCollections(getDb());
  const result = await capitalPlans.deleteOne({
    _id: new ObjectId(id.data),
    accountId,
  });

  if (result.deletedCount === 0) notFound("Plan not found");
  return c.json({ ok: true });
});
