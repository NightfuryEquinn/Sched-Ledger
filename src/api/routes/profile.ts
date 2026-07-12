import { cacheDel, cacheGet, cacheSet } from "@/api/lib/cache";
import { notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { defaultProfile, updateProfileSchema } from "@/schemas/profile";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

const PROFILE_CACHE_TTL_MS = 30_000;

export const profileRoutes = new Hono<{ Variables: SessionVariables }>();

profileRoutes.use("*", sessionAuth);

function profileCacheKey(address: string) {
  return `profile:${address}`;
}

function serializeProfile(doc: { _id: import("mongodb").ObjectId; userAddress: string; currentMonth: string }) {
  const serialized = serializeDoc(doc);
  return {
    id: serialized.id,
    userAddress: serialized.userAddress,
    currentMonth: serialized.currentMonth,
  };
}

async function getOrCreateProfile(walletAddress: string) {
  const cached = cacheGet<Awaited<ReturnType<typeof fetchProfile>>>(profileCacheKey(walletAddress));
  if (cached) return cached;

  const profile = await fetchProfile(walletAddress);
  cacheSet(profileCacheKey(walletAddress), profile, PROFILE_CACHE_TTL_MS);
  return profile;
}

async function fetchProfile(walletAddress: string) {
  const { ledgerProfiles } = getCollections(getDb());
  const existing = await ledgerProfiles.findOne({ userAddress: walletAddress });
  if (existing) return existing;

  const now = new Date();
  const seed = defaultProfile(walletAddress);
  const result = await ledgerProfiles.insertOne({
    ...seed,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ledgerProfiles.findOne({ _id: result.insertedId });
  if (!created) throw new Error("Failed to create ledger profile");
  return created;
}

function invalidateProfile(walletAddress: string) {
  cacheDel(profileCacheKey(walletAddress));
}

profileRoutes.get("/", async (c) => {
  const walletAddress = c.get("walletAddress");
  const profile = await getOrCreateProfile(walletAddress);
  c.header("Cache-Control", "private, max-age=30");
  return c.json({ profile: serializeProfile(profile) });
});

profileRoutes.patch("/", zValidator("json", updateProfileSchema), async (c) => {
  const walletAddress = c.get("walletAddress");
  const body = c.req.valid("json");
  const { ledgerProfiles } = getCollections(getDb());

  await fetchProfile(walletAddress);
  invalidateProfile(walletAddress);

  const updated = await ledgerProfiles.findOneAndUpdate(
    { userAddress: walletAddress },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Profile not found");
  return c.json({ profile: serializeProfile(updated) });
});
