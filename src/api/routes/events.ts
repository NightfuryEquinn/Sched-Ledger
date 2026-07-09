import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";
import {
  clearReminderLogsForEvent,
  sendEventConfirmation,
  sendImmediateReminderIfDue,
} from "@/api/lib/reminders";
import { notFound } from "@/api/lib/errors";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import {
  addEventCommentSchema,
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "@/schemas/event";
import { objectIdSchema } from "@/schemas/common";

export const eventsRoutes = new Hono<{ Variables: SessionVariables }>();

eventsRoutes.use("*", sessionAuth);

eventsRoutes.get("/", zValidator("query", listEventsQuerySchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const { month } = c.req.valid("query");
  const { events } = getCollections(getDb());

  const filter: Record<string, unknown> = { userAddress: walletAddress };
  if (month) filter.date = { $regex: `^${month}` };

  const docs = await events.find(filter).sort({ date: 1 }).toArray();
  return c.json({ events: serializeDocs(docs) });
});

eventsRoutes.get("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Event not found");

  const { events } = getCollections(getDb());
  const doc = await events.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });
  if (!doc) notFound("Event not found");

  return c.json({ event: serializeDoc(doc) });
});

eventsRoutes.post("/", zValidator("json", createEventSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const now = new Date();
  const { events } = getCollections(getDb());

  const result = await events.insertOne({
    userAddress: walletAddress,
    ...body,
    createdAt: now,
    updatedAt: now,
  });

  const doc = await events.findOne({ _id: result.insertedId });
  if (!doc) notFound("Event not found");

  void sendEventConfirmation(doc).catch((err) =>
    console.error("[reminders] confirmation email failed:", err),
  );
  /* Reminders due before the next daily cron run must be sent now or they'd arrive late. */
  void sendImmediateReminderIfDue(doc).catch((err) =>
    console.error("[reminders] immediate reminder failed:", err),
  );

  return c.json({ event: serializeDoc(doc) }, 201);
});

eventsRoutes.patch("/:id", zValidator("json", updateEventSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Event not found");

  const body = c.req.valid("json");
  const { events } = getCollections(getDb());

  const $set: Record<string, unknown> = { ...body, updatedAt: new Date() };
  const $unset: Record<string, ""> = {};
  if (body.catId && body.catId !== "custom") {
    delete $set.customLabel;
    delete $set.customGlyph;
    $unset.customLabel = "";
    $unset.customGlyph = "";
  }

  const updated = await events.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    Object.keys($unset).length ? { $set, $unset } : { $set },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Event not found");
  if (body.notify === true) {
    void sendEventConfirmation(updated).catch((err) =>
      console.error("[reminders] confirmation email failed:", err),
    );
  }
  if (updated.notify) {
    void sendImmediateReminderIfDue(updated).catch((err) =>
      console.error("[reminders] immediate reminder failed:", err),
    );
  }
  return c.json({ event: serializeDoc(updated) });
});

eventsRoutes.post("/:id/comments", zValidator("json", addEventCommentSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Event not found");

  const { text } = c.req.valid("json");
  const comment = {
    id: crypto.randomUUID(),
    text,
    at: new Date().toISOString(),
  };

  const { events } = getCollections(getDb());
  const updated = await events.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    {
      $push: { comments: comment },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Event not found");
  return c.json({ event: serializeDoc(updated) }, 201);
});

eventsRoutes.delete("/:id", async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Event not found");

  const { events } = getCollections(getDb());
  const result = await events.deleteOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });

  if (result.deletedCount === 0) notFound("Event not found");
  await clearReminderLogsForEvent(new ObjectId(id.data));
  return c.json({ ok: true });
});
