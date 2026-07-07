import { zValidator } from "@hono/zod-validator";
import { getAddress } from "ethers";
import { Hono } from "hono";
import { ObjectId } from "mongodb";
import {
  SESSION_TTL_MS,
  buildAuthMessage,
  clearSessionCookie,
  generateNonce,
  generateToken,
  getClientIp,
  getRequestUri,
  getUserAgent,
  hashToken,
  parseDeviceLabel,
  readSessionToken,
  setSessionCookie,
  verifyAuthSignature,
} from "@/api/lib/auth";
import { badRequest, notFound, unauthorized } from "@/api/lib/errors";
import { authChallengeRateLimit, authVerifyRateLimit } from "@/api/middleware/rate-limit";
import type { SessionVariables } from "@/api/middleware/session";
import { sessionAuth } from "@/api/middleware/session";
import { getCollections, getDb } from "@/db";
import { authChallengeSchema, authVerifySchema } from "@/schemas/auth";
import { objectIdSchema } from "@/schemas/common";

export const authRoutes = new Hono<{ Variables: SessionVariables }>();

authRoutes.post("/challenge", authChallengeRateLimit, zValidator("json", authChallengeSchema), async (c) => {
  const { address } = c.req.valid("json");
  const normalized = getAddress(address).toLowerCase();
  const nonce = generateNonce();
  const uri = getRequestUri(c);
  const message = buildAuthMessage(normalized, nonce, uri);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000);

  const { authNonces } = getCollections(getDb());
  await authNonces.insertOne({
    address: normalized,
    nonce,
    message,
    expiresAt,
    createdAt: now,
  });

  return c.json({ message, nonce, expiresAt: expiresAt.toISOString(), uri });
});

authRoutes.post("/verify", authVerifyRateLimit, zValidator("json", authVerifySchema), async (c) => {
  const { address, message, signature } = c.req.valid("json");
  const normalized = getAddress(address).toLowerCase();

  const { authNonces, sessions, users } = getCollections(getDb());
  const nonceDoc = await authNonces.findOne({
    address: normalized,
    message,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!nonceDoc) badRequest("Sign-in challenge expired or invalid. Request a new one.");

  if (!verifyAuthSignature(message, signature, normalized)) {
    badRequest("Signature verification failed. Make sure you signed with the correct wallet.");
  }

  const now = new Date();
  await authNonces.updateOne({ _id: nonceDoc._id }, { $set: { usedAt: now } });

  const token = generateToken();
  const tokenHash = hashToken(token);
  const ip = getClientIp(c);
  const userAgent = getUserAgent(c);

  const sessionResult = await sessions.insertOne({
    address: normalized,
    tokenHash,
    userAgent,
    ip,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });

  let user = await users.findOne({ address: normalized });
  if (!user) {
    const insert = await users.insertOne({
      address: normalized,
      codename: normalized.slice(0, 6),
      notifyEmail: "",
      createdAt: now,
      updatedAt: now,
    });
    user = await users.findOne({ _id: insert.insertedId });
  }

  setSessionCookie(c, token);

  return c.json({
    account: {
      address: normalized,
      codename: user?.codename || normalized.slice(0, 6),
      injected: false,
    },
    session: {
      id: sessionResult.insertedId.toHexString(),
      device: parseDeviceLabel(userAgent),
      current: true,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    },
  });
});

authRoutes.get("/me", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const sessionId = c.get("sessionId");
  const { users, sessions } = getCollections(getDb());

  const user = await users.findOne({ address: walletAddress });
  const session = await sessions.findOne({ _id: new ObjectId(sessionId) });

  if (!session || session.revokedAt) unauthorized("Session expired or invalid. Sign in again.");

  return c.json({
    account: {
      address: walletAddress,
      codename: user?.codename || walletAddress.slice(0, 6),
      injected: false,
    },
    session: {
      id: sessionId,
      device: parseDeviceLabel(session.userAgent),
      current: true,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    },
  });
});

authRoutes.post("/logout", async (c) => {
  const token = readSessionToken(c);
  if (token) {
    const { sessions } = getCollections(getDb());
    await sessions.updateOne(
      { tokenHash: hashToken(token), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/sessions", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const sessionId = c.get("sessionId");
  const { sessions } = getCollections(getDb());

  const docs = await sessions
    .find({ address: walletAddress, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .toArray();

  return c.json({
    sessions: docs.map((s) => ({
      id: s._id.toHexString(),
      device: parseDeviceLabel(s.userAgent),
      ip: s.ip === "unknown" ? "" : s.ip.replace(/\d+$/, "•••"),
      current: s._id.toHexString() === sessionId,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
  });
});

authRoutes.delete("/sessions", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const sessionId = c.get("sessionId");
  const { sessions } = getCollections(getDb());

  await sessions.updateMany(
    {
      address: walletAddress,
      _id: { $ne: new ObjectId(sessionId) },
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date() } },
  );

  return c.json({ ok: true });
});

authRoutes.delete("/sessions/:id", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const sessionId = c.get("sessionId");
  const parsed = objectIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success) notFound("Session not found");

  const targetId = parsed.data;
  if (targetId === sessionId) badRequest("Cannot revoke your current session from here. Sign out instead.");

  const { sessions } = getCollections(getDb());
  const result = await sessions.updateOne(
    {
      _id: new ObjectId(targetId),
      address: walletAddress,
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date() } },
  );

  if (result.matchedCount === 0) notFound("Session not found");
  return c.json({ ok: true });
});

authRoutes.post("/clear", sessionAuth, async (c) => {
  const walletAddress = c.get("walletAddress");
  const { sessions } = getCollections(getDb());
  const now = new Date();

  await sessions.updateMany(
    { address: walletAddress, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
  );

  clearSessionCookie(c);
  return c.json({ ok: true, cleared: ["session", "cookie"] });
});
