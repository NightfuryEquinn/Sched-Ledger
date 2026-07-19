import {
  SESSION_MAX_LIFETIME_MS,
  SESSION_TTL_MS,
  generateToken,
  hashToken,
  readSessionToken,
  setSessionCookie,
} from "@/api/lib/auth";
import { unauthorized } from "@/api/lib/errors";
import { getCollections, getDb } from "@/db";
import { createMiddleware } from "hono/factory";
import { ObjectId } from "mongodb";

export type SessionVariables = {
  accountId: string;
  sessionId: string;
};

/**
 * Resolve the opaque account id for a session row.
 * Prefers session.accountId (verified against users); falls back to legacy address.
 */
async function resolveAccountId(session: {
  accountId?: string;
  address?: string;
}): Promise<string | null> {
  const { users } = getCollections(getDb());

  if (session.accountId && ObjectId.isValid(session.accountId)) {
    const user = await users.findOne({ _id: new ObjectId(session.accountId) });
    if (user) return session.accountId;
  }

  if (!session.address) return null;

  const user = await users.findOne({ address: session.address.toLowerCase() });

  return user ? user._id.toHexString() : null;
}

/** Require a valid session cookie; rotate the token on sliding renewal. */
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

  const accountId = await resolveAccountId(session);
  if (!accountId) unauthorized("Session expired or invalid. Sign in again.");

  /* Backfill accountId onto legacy sessions that only stored address. */
  if (!session.accountId) {
    void sessions.updateOne({ _id: session._id }, { $set: { accountId } });
  }

  c.set("accountId", accountId);
  c.set("sessionId", session._id.toHexString());

  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    const renewedExpiry = Math.min(now.getTime() + SESSION_TTL_MS, absoluteExpiry);
    const newToken = generateToken();
    const newHash = hashToken(newToken);
    const rotated = await sessions.updateOne(
      { _id: session._id, tokenHash },
      { $set: { tokenHash: newHash, lastSeenAt: now, expiresAt: new Date(renewedExpiry) } },
    );

    if (rotated.modifiedCount > 0) {
      setSessionCookie(c, newToken);
    }
  }

  await next();
});
