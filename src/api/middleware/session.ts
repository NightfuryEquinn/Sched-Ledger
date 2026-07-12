import {
  SESSION_MAX_LIFETIME_MS,
  SESSION_TTL_MS,
  hashToken,
  readSessionToken,
} from "@/api/lib/auth";
import { unauthorized } from "@/api/lib/errors";
import { getCollections, getDb } from "@/db";
import { createMiddleware } from "hono/factory";

export type SessionVariables = {
  walletAddress: string;
  sessionId: string;
};

export const sessionAuth = createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
  const token = readSessionToken(c);
  if (!token) unauthorized("Session required. Sign in again.");

  const tokenHash = hashToken(token);
  const { sessions } = getCollections(getDb());
  const now = new Date();
  const session = await sessions.findOne({
    tokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  });

  if (!session) unauthorized("Session expired or invalid. Sign in again.");

  /* Sliding renewal must not extend a session forever: enforce an absolute cap. */
  const absoluteExpiry = session.createdAt.getTime() + SESSION_MAX_LIFETIME_MS;
  if (now.getTime() >= absoluteExpiry) {
    void sessions.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    unauthorized("Session expired or invalid. Sign in again.");
  }

  c.set("walletAddress", session.address);
  c.set("sessionId", session._id.toHexString());

  const header = c.req.header("x-wallet-address");
  if (header && header.toLowerCase() !== session.address) {
    unauthorized("Wallet address does not match session.");
  }

  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    const renewedExpiry = Math.min(now.getTime() + SESSION_TTL_MS, absoluteExpiry);
    void sessions.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: now, expiresAt: new Date(renewedExpiry) } },
    );
  }

  await next();
});
