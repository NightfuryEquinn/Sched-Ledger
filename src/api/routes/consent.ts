import { notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { updateConsentSchema } from "@/schemas/consent";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

export const consentRoutes = new Hono<{ Variables: SessionVariables }>();

consentRoutes.use("*", sessionAuth);

/** Load or create the third-party consent record for an account. */
async function getOrCreateConsent(accountId: string) {
  const { consent } = getCollections(getDb());
  const existing = await consent.findOne({ accountId });
  if (existing) return existing;

  const now = new Date();
  const result = await consent.insertOne({
    _id: new ObjectId(),
    accountId,
    optedIn: false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await consent.findOne({ _id: result.insertedId });
  if (!created) throw new Error("Failed to create consent record");
  return created;
}

consentRoutes.get("/", async (c) => {
  const accountId = c.get("accountId");
  const record = await getOrCreateConsent(accountId);
  return c.json({ consent: serializeDoc(record) });
});

consentRoutes.patch("/", zValidator("json", updateConsentSchema), async (c) => {
  const accountId = c.get("accountId");
  const { optedIn } = c.req.valid("json");
  const { consent } = getCollections(getDb());

  await getOrCreateConsent(accountId);

  const updated = await consent.findOneAndUpdate(
    { accountId },
    { $set: { optedIn, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Consent record not found");
  return c.json({ consent: serializeDoc(updated) });
});
