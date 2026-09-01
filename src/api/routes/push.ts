import { vapidPublicKey } from "@/api/lib/push";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/schemas/push";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export const pushRoutes = new Hono<{ Variables: SessionVariables }>();

/* Application server key — public by definition, so no session required. */
pushRoutes.get("/public-key", (c) => c.json({ key: vapidPublicKey() }));

/* Upsert on endpoint so a re-subscribe (or `pushsubscriptionchange`) just
   refreshes the row instead of piling up duplicates. */
pushRoutes.post("/subscribe", sessionAuth, zValidator("json", pushSubscribeSchema), async (c) => {
  const accountId = c.get("accountId");
  const { endpoint, keys } = c.req.valid("json");
  const { pushSubscriptions } = getCollections(getDb());
  const now = new Date();

  const existing = await pushSubscriptions.findOne({ endpoint });
  if (existing && existing.accountId !== accountId) {
    throw new HTTPException(409, { message: "Push endpoint is registered to another account" });
  }

  await pushSubscriptions.updateOne(
    { endpoint, accountId },
    {
      $set: {
        keys,
        userAgent: c.req.header("User-Agent")?.slice(0, 256) ?? "",
        lastSeenAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  return c.json({ ok: true });
});

/* Self-only: an endpoint can only be removed by the account that owns it. */
pushRoutes.delete(
  "/subscribe",
  sessionAuth,
  zValidator("json", pushUnsubscribeSchema),
  async (c) => {
    const accountId = c.get("accountId");
    const { endpoint } = c.req.valid("json");
    const { pushSubscriptions } = getCollections(getDb());

    const { deletedCount } = await pushSubscriptions.deleteOne({ endpoint, accountId });

    return c.json({ ok: true, removed: deletedCount });
  },
);
