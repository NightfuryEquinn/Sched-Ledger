import { describe, expect, test } from "bun:test";
import {
  SESSION_COOKIE,
  SESSION_MAX_LIFETIME_MS,
  SESSION_TTL_MS,
  NONCE_TTL_MS,
  buildAuthMessage,
  generateNonce,
  generateToken,
  hashToken,
  parseDeviceLabel,
  verifyAuthSignature,
} from "@/api/lib/auth";
import { Wallet, getAddress } from "ethers";

describe("auth helpers", () => {
  test("generateToken produces unique base64url tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("hashToken is deterministic SHA-256 hex", () => {
    const token = "test-token";
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).not.toBe(token);
  });

  test("generateNonce is unique", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });

  test("buildAuthMessage includes checksummed address and nonce", () => {
    const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const msg = buildAuthMessage(address, "nonce-1", "http://localhost:3000");
    expect(msg).toContain(getAddress(address));
    expect(msg).toContain("Nonce: nonce-1");
    expect(msg).toContain("URI: http://localhost:3000");
  });

  test("verifyAuthSignature accepts a valid wallet signature", async () => {
    const wallet = Wallet.createRandom();
    const message = buildAuthMessage(wallet.address, "n1", "http://localhost:3000");
    const signature = await wallet.signMessage(message);
    expect(verifyAuthSignature(message, signature, wallet.address)).toBe(true);
  });

  test("verifyAuthSignature rejects a wrong address", async () => {
    const wallet = Wallet.createRandom();
    const other = Wallet.createRandom();
    const message = buildAuthMessage(wallet.address, "n1", "http://localhost:3000");
    const signature = await wallet.signMessage(message);
    expect(verifyAuthSignature(message, signature, other.address)).toBe(false);
  });

  test("verifyAuthSignature rejects garbage signatures", () => {
    expect(verifyAuthSignature("hello", "0xdead", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      false,
    );
  });

  test("parseDeviceLabel maps common user agents", () => {
    expect(parseDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("iOS device");
    expect(parseDeviceLabel("Mozilla/5.0 (Linux; Android 14)")).toBe("Android device");
    expect(parseDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("Mac");
    expect(parseDeviceLabel("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows");
    expect(parseDeviceLabel("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
    expect(parseDeviceLabel("UnknownBot/1.0")).toBe("Unknown device");
  });

  test("session constants match product policy", () => {
    expect(SESSION_COOKIE).toBe("ledger_session");
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(SESSION_MAX_LIFETIME_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(NONCE_TTL_MS).toBe(5 * 60 * 1000);
  });
});
