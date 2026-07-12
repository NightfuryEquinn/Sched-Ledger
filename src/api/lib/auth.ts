import { getAddress, verifyMessage } from "ethers";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "ledger_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Absolute cap: no session may outlive this, regardless of sliding renewal. */
export const SESSION_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const NONCE_TTL_MS = 5 * 60 * 1000;

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function buildAuthMessage(address: string, nonce: string, uri: string): string {
  const normalized = getAddress(address);
  const issuedAt = new Date().toISOString();
  return [
    "Sched Ledger wants you to sign in with your Web3 identity.",
    "",
    `Address: ${normalized}`,
    "Sign in to verify you control this key. This will not send a transaction or cost gas.",
    "",
    `URI: ${uri}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function verifyAuthSignature(
  message: string,
  signature: string,
  expectedAddress: string,
): boolean {
  try {
    const recovered = verifyMessage(message, signature);
    return getAddress(recovered) === getAddress(expectedAddress);
  } catch {
    return false;
  }
}

export function getRequestUri(c: Context): string {
  /* Pin the signed-message URI to the configured origin when available so a
     spoofed Host header cannot change what users are asked to sign. */
  const pinned = process.env.APP_ORIGIN?.trim();
  if (pinned) return pinned;
  try {
    return new URL(c.req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function getClientIp(c: Context): string {
  /* Prefer headers set by the trusted proxy itself. For x-forwarded-for, use the
     LAST entry (appended by the nearest proxy); leading entries are client-supplied
     and trivially spoofable, which would allow rate-limit bypass. */
  const trusted = c.req.header("x-real-ip") || c.req.header("cf-connecting-ip");
  if (trusted) return trusted.trim();
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1]!.trim() || "unknown";
  }
  return "unknown";
}

export function getUserAgent(c: Context): string {
  return (c.req.header("user-agent") || "unknown").slice(0, 512);
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    /* Secure by default; only allow plain HTTP for explicit local development. */
    secure: process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test",
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function parseDeviceLabel(userAgent: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS device";
  if (/Android/i.test(userAgent)) return "Android device";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown device";
}
