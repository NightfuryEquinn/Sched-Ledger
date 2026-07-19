import { notFound } from "@/api/lib/errors";
import {
  clearReminderLogsForEvent,
  sendEventConfirmation,
  sendImmediateReminderIfDue,
} from "@/api/lib/reminders";
import { serializeDoc, serializeDocs } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { deleteScopeQuerySchema, resolveEventDeleteAction } from "@/lib/delete-scope";
import { objectIdSchema, isLeadAllowedForEvent, type LeadId } from "@/schemas/common";
import { createEventSchema, listEventsQuerySchema, updateEventSchema } from "@/schemas/event";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ObjectId } from "mongodb";

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

  const { expenseId, ...rest } = body;
  const result = await events.insertOne({
    userAddress: walletAddress,
    ...rest,
    ...(expenseId ? { expenseId: new ObjectId(expenseId) } : {}),
    createdAt: now,
    updatedAt: now,
  });

  const doc = await events.findOne({ _id: result.insertedId });
  if (!doc) notFound("Event not found");

  void sendEventConfirmation(doc).catch((err) =>
    console.error("[reminders] confirmation email failed:", err),
  );
  /* If the remind-at time is in the current poll window, send now instead of waiting for cron. */
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

  const existing = await events.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });
  if (!existing) notFound("Event not found");

  const mergedAllDay = body.allDay ?? existing.allDay;
  const mergedLead = (body.lead ?? existing.lead) as LeadId;
  if (!isLeadAllowedForEvent(mergedLead, mergedAllDay)) {
    throw new HTTPException(400, {
      message: mergedAllDay
        ? "All-day events only support 1 day or 2 days before reminders"
        : "Invalid reminder lead for timed events",
    });
  }

  const { expenseId, ...rest } = body;
  const $set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if ("expenseId" in body) {
    if (expenseId) $set.expenseId = new ObjectId(expenseId);
    else delete $set.expenseId;
  }
  const $unset: Record<string, ""> = {
    title: "",
    comments: "",
    customLabel: "",
    customGlyph: "",
  };
  if ("expenseId" in body && !expenseId) {
    $unset.expenseId = "";
  }

  const updated = await events.findOneAndUpdate(
    { _id: new ObjectId(id.data), userAddress: walletAddress },
    { $set, $unset },
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

eventsRoutes.delete("/:id", zValidator("query", deleteScopeQuerySchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const id = objectIdSchema.safeParse(c.req.param("id"));
  if (!id.success) notFound("Event not found");

  const { scope, fromDate } = c.req.valid("query");
  const { events } = getCollections(getDb());
  const doc = await events.findOne({
    _id: new ObjectId(id.data),
    userAddress: walletAddress,
  });
  if (!doc) notFound("Event not found");

  const repeating = doc.repeat && doc.repeat !== "once";
  const effectiveScope = repeating ? scope ?? "all" : "all";
  const effectiveFrom = fromDate ?? doc.date;

  if (!repeating || effectiveScope === "all") {
    const result = await events.deleteOne({
      _id: doc._id,
      userAddress: walletAddress,
    });
    if (result.deletedCount === 0) notFound("Event not found");
    await clearReminderLogsForEvent(doc._id);
    return c.json({ ok: true, deleted: true });
  }

  const action = resolveEventDeleteAction(effectiveScope, doc.date, effectiveFrom);

  if (action.type === "delete") {
    const result = await events.deleteOne({
      _id: doc._id,
      userAddress: walletAddress,
    });
    if (result.deletedCount === 0) notFound("Event not found");
    await clearReminderLogsForEvent(doc._id);
    return c.json({ ok: true, deleted: true });
  }

  if (action.type === "except") {
    const updated = await events.findOneAndUpdate(
      { _id: doc._id, userAddress: walletAddress },
      {
        $addToSet: { exceptDates: action.date },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );
    if (!updated) notFound("Event not found");
    return c.json({ ok: true, deleted: false, event: serializeDoc(updated) });
  }

  const updated = await events.findOneAndUpdate(
    { _id: doc._id, userAddress: walletAddress },
    {
      $set: { until: action.until, updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!updated) notFound("Event not found");
  return c.json({ ok: true, deleted: false, event: serializeDoc(updated) });
});
