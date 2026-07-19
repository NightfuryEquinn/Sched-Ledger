import { badRequest, notFound } from "@/api/lib/errors";
import {
  applyExpenseDeleteScope,
  retireOldExpenseSeries,
  shouldRetireOldExpenseSeries,
} from "@/api/lib/expense-delete-scope";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { deleteScopeQuerySchema } from "@/lib/delete-scope";
import { normalizeRecurring } from "@/lib/recurring";
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

  const filter: Record<string, unknown> = {
    userAddress: walletAddress,
    skipped: { $ne: true },
  };
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
    skipped: { $ne: true },
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
    ...(body.eventId ? { eventId: new ObjectId(body.eventId) } : {}),
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

  const existing = await expenses.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
    skipped: { $ne: true },
  });
  if (!existing) notFound("Expense not found");

  const retireOld = shouldRetireOldExpenseSeries(existing, body);
  let seriesRetire: { deletedIds: string[]; endedIds: string[] } | undefined;

  if (retireOld) {
    const pivotDate = body.date ?? existing.date;
    seriesRetire = await retireOldExpenseSeries({
      expenses,
      doc: existing,
      userAddress: walletAddress,
      pivotDate,
    });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.walletId) patch.walletId = new ObjectId(body.walletId);
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.date !== undefined) patch.date = body.date;
  if (body.recurring !== undefined) patch.recurring = body.recurring;
  if (body.enc !== undefined) patch.enc = body.enc;
  if (body.payload !== undefined) patch.payload = body.payload;
  if ("seriesKey" in body) patch.seriesKey = body.seriesKey ?? undefined;
  if (body.eventId) {
    patch.eventId = new ObjectId(body.eventId);
  }

  const update =
    body.payload !== undefined
      ? {
          $set: patch,
          $unset: {
            sub: "",
            amount: "",
            note: "",
            ...(body.eventId === null ? { eventId: "" } : {}),
          },
        }
      : body.seriesKey === null || body.eventId === null
        ? {
            $set: patch,
            $unset: {
              ...(body.seriesKey === null ? { seriesKey: "" } : {}),
              ...(body.eventId === null ? { eventId: "" } : {}),
            },
          }
        : { $set: patch };

  if (body.seriesKey === null && body.payload !== undefined) {
    (update as { $unset: Record<string, string> }).$unset.seriesKey = "";
  }

  const updated = await expenses.findOneAndUpdate(
    { _id: existing._id, userAddress: walletAddress, skipped: { $ne: true } },
    update,
    { returnDocument: "after" },
  );

  if (!updated) notFound("Expense not found");
  return c.json({
    expense: serializeDoc(updated),
    ...(seriesRetire
      ? { deletedIds: seriesRetire.deletedIds, endedIds: seriesRetire.endedIds }
      : {}),
  });
});

expensesRoutes.delete("/:id", zValidator("query", deleteScopeQuerySchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Expense not found");

  const { scope, fromDate } = c.req.valid("query");
  const { expenses } = getCollections(getDb());
  const doc = await expenses.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
    skipped: { $ne: true },
  });
  if (!doc) notFound("Expense not found");

  const isRecurring = normalizeRecurring(doc.recurring) !== false;

  if (!isRecurring || !scope) {
    const result = await expenses.deleteOne({
      _id: doc._id,
      userAddress: walletAddress,
    });
    if (result.deletedCount === 0) notFound("Expense not found");
    return c.json({ ok: true, deletedIds: [doc._id.toString()] });
  }

  const effectiveFrom = fromDate ?? doc.date;
  const applied = await applyExpenseDeleteScope({
    expenses,
    doc,
    userAddress: walletAddress,
    scope,
    fromDate: effectiveFrom,
  });

  return c.json({ ok: true, ...applied });
});
