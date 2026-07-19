import { cacheDel, cacheGet, cacheSet } from "@/api/lib/cache";
import { notFound } from "@/api/lib/errors";
import { serializeDoc } from "@/api/lib/serialize";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { defaultProfile, updateProfileSchema } from "@/schemas/profile";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ObjectId } from "mongodb";

const PROFILE_CACHE_TTL_MS = 30_000;

export const profileRoutes = new Hono<{ Variables: SessionVariables }>();

profileRoutes.use("*", sessionAuth);

/** Build the in-memory profile cache key for an account. */
function profileCacheKey(accountId: string) {
  return `profile:${accountId}`;
}

/** Expose only id + currentMonth (ownership keys stay server-side). */
function serializeProfile(doc: { _id: import("mongodb").ObjectId; currentMonth: string }) {
  const serialized = serializeDoc(doc);

  return {
    id: serialized.id,
    currentMonth: serialized.currentMonth,
  };
}

/** Load or create the ledger profile for an account (with short TTL cache). */
async function getOrCreateProfile(accountId: string) {
  const cached = cacheGet<Awaited<ReturnType<typeof fetchProfile>>>(profileCacheKey(accountId));
  if (cached) return cached;

  const profile = await fetchProfile(accountId);
  cacheSet(profileCacheKey(accountId), profile, PROFILE_CACHE_TTL_MS);
  return profile;
}

/** Fetch the profile document, inserting a default when missing. */
async function fetchProfile(accountId: string) {
  const { ledgerProfiles } = getCollections(getDb());
  const existing = await ledgerProfiles.findOne({ accountId });
  if (existing) return existing;

  const now = new Date();
  const seed = defaultProfile(accountId);
  const result = await ledgerProfiles.insertOne({
    _id: new ObjectId(),
    ...seed,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ledgerProfiles.findOne({ _id: result.insertedId });
  if (!created) throw new Error("Failed to create ledger profile");
  return created;
}

/** Drop the cached profile for an account after a write. */
function invalidateProfile(accountId: string) {
  cacheDel(profileCacheKey(accountId));
}

profileRoutes.get("/", async (c) => {
  const accountId = c.get("accountId");
  const profile = await getOrCreateProfile(accountId);
  c.header("Cache-Control", "private, max-age=30");
  return c.json({ profile: serializeProfile(profile) });
});

profileRoutes.patch("/", zValidator("json", updateProfileSchema), async (c) => {
  const accountId = c.get("accountId");
  const body = c.req.valid("json");
  const { ledgerProfiles } = getCollections(getDb());

  await fetchProfile(accountId);
  invalidateProfile(accountId);

  const updated = await ledgerProfiles.findOneAndUpdate(
    { accountId },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) notFound("Profile not found");
  return c.json({ profile: serializeProfile(updated) });
});
