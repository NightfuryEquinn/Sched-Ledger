import { badRequest, notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { objectIdSchema } from "@/schemas/common";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "@/schemas/expense";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const expensesRoutes = new Hono<{ Variables: SessionVariables }>();

expensesRoutes.use("*", sessionAuth);

expensesRoutes.get("/", zValidator("query", listExpensesQuerySchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const { month, recurring, sub, walletId } = c.req.valid("query");
  const { expenses } = getCollections(getDb());

  const filter: Record<string, unknown> = { userAddress: walletAddress };
  if (walletId) filter.walletId = new ObjectId(walletId);
  if (month) filter.date = { $regex: `^${month}` };
  if (recurring === true) {
    filter.recurring = { $in: [true, "monthly", "quarterly", "yearly"] };
  } else if (recurring === false) {
    filter.recurring = false;
  }
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
  const { expenses, financialWallets } = getCollections(getDb());

  const wallet = await financialWallets.findOne({
    _id: new ObjectId(body.walletId),
    userAddress: walletAddress,
  });
  if (!wallet) notFound("Wallet not found");

  if (body.recurring && body.recurring !== false && !body.seriesKey) {
    badRequest("seriesKey is required for encrypted recurring expenses");
  }

  const result = await expenses.insertOne({
    userAddress: walletAddress,
    walletId: new ObjectId(body.walletId),
    kind: body.kind ?? "expense",
    date: body.date,
    recurring: body.recurring,
    enc: body.enc,
    payload: body.payload,
    seriesKey: body.seriesKey,
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
  const { expenses, financialWallets } = getCollections(getDb());

  if (body.walletId) {
    const wallet = await financialWallets.findOne({
      _id: new ObjectId(body.walletId),
      userAddress: walletAddress,
    });
    if (!wallet) notFound("Wallet not found");
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.walletId) patch.walletId = new ObjectId(body.walletId);
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.date !== undefined) patch.date = body.date;
  if (body.recurring !== undefined) patch.recurring = body.recurring;
  if (body.enc !== undefined) patch.enc = body.enc;
  if (body.payload !== undefined) patch.payload = body.payload;
  if ("seriesKey" in body) patch.seriesKey = body.seriesKey ?? undefined;

  const update =
    body.payload !== undefined
      ? { $set: patch, $unset: { sub: "", amount: "", note: "" } }
      : { $set: patch };

  const updated = await expenses.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    update,
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
