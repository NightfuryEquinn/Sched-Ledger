import { afterEach, describe, expect, test } from "bun:test";
import { walletClient } from "@/frontend/auth/lib/wallet";
import type { IdentityRecord } from "@/frontend/lib/types";

const injectedNoKey: IdentityRecord = {
  address: "0x1234567890123456789012345678901234567890",
  injected: true,
};

describe("walletClient.sign", () => {
  afterEach(() => {
    delete (globalThis as { ethereum?: unknown }).ethereum;
  });

  test("rejects when injected is set but no extension and no stored key", async () => {
    await expect(walletClient.sign(injectedNoKey, "test message")).rejects.toThrow(
      /no wallet signer/i,
    );
  });

  test("rejects when there is no injected wallet and no private key", async () => {
    const idn: IdentityRecord = {
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    };

    await expect(walletClient.sign(idn, "test message")).rejects.toThrow(/no wallet signer/i);
  });
});
