import { describe, expect, test, beforeEach } from "bun:test";
import { ledgerKeyStore } from "@/frontend/lib/crypto/key-store";
import { unlockLedgerKey } from "@/frontend/lib/crypto/unlock";
import { buildDerivationMessage, decryptJson, encryptJson } from "@/frontend/lib/crypto/e2ee";
import type { IdentityRecord } from "@/frontend/lib/types";
import { Wallet } from "ethers";

describe("ledgerKeyStore", () => {
  beforeEach(() => {
    ledgerKeyStore.clear();
  });

  test("set / get / isUnlocked are case-insensitive on address", async () => {
    const wallet = Wallet.createRandom();
    const message = buildDerivationMessage(wallet.address);
    const signature = await wallet.signMessage(message);
    const { deriveKeyFromSignature } = await import("@/frontend/lib/crypto/e2ee");
    const key = await deriveKeyFromSignature(signature);

    ledgerKeyStore.set(wallet.address.toUpperCase(), key);
    expect(ledgerKeyStore.isUnlocked(wallet.address.toLowerCase())).toBe(true);
    expect(ledgerKeyStore.get(wallet.address)).toBe(key);
  });

  test("clear(address) removes only that key", async () => {
    const a = Wallet.createRandom();
    const b = Wallet.createRandom();
    const { deriveKeyFromSignature } = await import("@/frontend/lib/crypto/e2ee");
    const keyA = await deriveKeyFromSignature(await a.signMessage(buildDerivationMessage(a.address)));
    const keyB = await deriveKeyFromSignature(await b.signMessage(buildDerivationMessage(b.address)));
    ledgerKeyStore.set(a.address, keyA);
    ledgerKeyStore.set(b.address, keyB);
    ledgerKeyStore.clear(a.address);
    expect(ledgerKeyStore.isUnlocked(a.address)).toBe(false);
    expect(ledgerKeyStore.isUnlocked(b.address)).toBe(true);
  });

  test("clear() without address wipes all keys", async () => {
    const wallet = Wallet.createRandom();
    const { deriveKeyFromSignature } = await import("@/frontend/lib/crypto/e2ee");
    const key = await deriveKeyFromSignature(
      await wallet.signMessage(buildDerivationMessage(wallet.address)),
    );
    ledgerKeyStore.set(wallet.address, key);
    ledgerKeyStore.clear();
    expect(ledgerKeyStore.isUnlocked(wallet.address)).toBe(false);
  });
});

describe("unlockLedgerKey", () => {
  beforeEach(() => {
    ledgerKeyStore.clear();
  });

  test("stores a key that can decrypt payloads for that identity", async () => {
    const wallet = Wallet.createRandom();
    const idn: IdentityRecord = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic!.phrase,
      injected: false,
      codename: "tester",
    };
    await unlockLedgerKey(idn);
    expect(ledgerKeyStore.isUnlocked(idn.address)).toBe(true);

    const key = ledgerKeyStore.get(idn.address)!;
    const cipher = await encryptJson(key, { amount: 7 });
    await expect(decryptJson(key, cipher)).resolves.toEqual({ amount: 7 });
  });

  test("unlock without private key still derives via fallback signer", async () => {
    const idn: IdentityRecord = {
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      injected: false,
      codename: "broken",
    };
    await unlockLedgerKey(idn);
    expect(ledgerKeyStore.isUnlocked(idn.address)).toBe(true);
  });
});
