import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";
import { notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "@/schemas/expense";
import { objectIdSchema } from "@/schemas/common";

export const expensesRoutes = new Hono<{ Variables: SessionVariables }>();

expensesRoutes.use("*", sessionAuth);

expensesRoutes.get("/", zValidator("query", listExpensesQuerySchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const { month, recurring, sub } = c.req.valid("query");
  const { expenses } = getCollections(getDb());

  const filter: Record<string, unknown> = { userAddress: walletAddress };
  if (month) filter.date = { $regex: `^${month}` };
  if (recurring !== undefined) filter.recurring = recurring;
  if (sub) filter.sub = sub;

  const docs = await expenses.find(filter).sort({ date: -1 }).toArray();
  return c.json({ expenses: serializeDocs(docs) });
});

expensesRoutes.get("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Expense not found");

  const { expenses } = getCollections(getDb());
  const doc = await expenses.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });
  if (!doc) notFound("Expense not found");

  return c.json({ expense: serializeDoc(doc) });
});

expensesRoutes.post("/", zValidator("json", createExpenseSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const now = new Date();
  const { expenses } = getCollections(getDb());

  const result = await expenses.insertOne({
    userAddress: walletAddress,
    ...body,
    createdAt: now,
    updatedAt: now,
  });

  const doc = await expenses.findOne({ _id: result.insertedId });
  if (!doc) notFound("Expense not found");

  return c.json({ expense: serializeDoc(doc) }, 201);
});

expensesRoutes.patch("/:id", zValidator("json", updateExpenseSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Expense not found");

  const body = c.req.valid("json");
  const { expenses } = getCollections(getDb());

  const updated = await expenses.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Expense not found");
  return c.json({ expense: serializeDoc(updated) });
});

expensesRoutes.delete("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Expense not found");

  const { expenses } = getCollections(getDb());
  const result = await expenses.deleteOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });

  if (result.deletedCount === 0) notFound("Expense not found");
  return c.json({ ok: true });
});
