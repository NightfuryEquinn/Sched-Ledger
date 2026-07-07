import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { updateConsentSchema } from "@/schemas/consent";

export const consentRoutes = new Hono<{ Variables: SessionVariables }>();

consentRoutes.use("*", sessionAuth);

async function getOrCreateConsent(walletAddress: string) {
  const { consent } = getCollections(getDb());
  const existing = await consent.findOne({ userAddress: walletAddress });
  if (existing) return existing;

  const now = new Date();
  const result = await consent.insertOne({
    userAddress: walletAddress,
    optedIn: false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await consent.findOne({ _id: result.insertedId });
  if (!created) throw new Error("Failed to create consent record");
  return created;
}

consentRoutes.get("/", async (c) => {
  const walletAddress = c.get("walletAddress");
  const record = await getOrCreateConsent(walletAddress);
  return c.json({ consent: serializeDoc(record) });
});

consentRoutes.patch("/", zValidator("json", updateConsentSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const { optedIn } = c.req.valid("json");
  const { consent } = getCollections(getDb());

  await getOrCreateConsent(walletAddress);

  const updated = await consent.findOneAndUpdate(
    { userAddress: walletAddress },
    { $set: { optedIn, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  return c.json({ consent: serializeDoc(updated!) });
});
