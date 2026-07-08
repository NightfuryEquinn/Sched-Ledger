import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "ledger_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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
  try {
    return new URL(c.req.url).origin;
  } catch {
    return process.env.APP_ORIGIN || "http://localhost:3000";
  }
}

export function getClientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.header("x-real-ip") || c.req.header("cf-connecting-ip") || "unknown";
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
    secure: process.env.NODE_ENV === "production",
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
