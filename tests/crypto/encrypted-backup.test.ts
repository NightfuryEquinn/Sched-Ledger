import { describe, expect, test } from "bun:test";
import {
  buildBackupPlain,
  decryptBackup,
  encryptBackup,
  parseBackupFile,
} from "@/frontend/auth/lib/encrypted-backup";
import {
  buildDerivationMessage,
  deriveKeyFromSignature,
} from "@/frontend/lib/crypto/e2ee";
import { Wallet } from "ethers";

async function testKey() {
  const wallet = Wallet.createRandom();
  const sig = await wallet.signMessage(buildDerivationMessage(wallet.address));
  return { key: await deriveKeyFromSignature(sig), address: wallet.address };
}

describe("encrypted backup", () => {
  test("encrypt / decrypt round-trip", async () => {
    const { key, address } = await testKey();
    const plain = buildBackupPlain({
      address,
      wallets: [],
      categories: [],
      expenses: [
        {
          id: "aaaaaaaaaaaaaaaaaaaaaaaa",
          walletId: "bbbbbbbbbbbbbbbbbbbbbbbb",
          kind: "expense",
          date: "2026-07-01",
          sub: "food",
          amount: 12.5,
          note: "lunch",
          recurring: false,
        },
      ],
      events: [],
      todoLists: [],
    });
    const file = await encryptBackup(key, plain);
    expect(file.format).toBe("sched-ledger-backup");
    const restored = await decryptBackup(key, file);
    expect(restored.expenses).toEqual(plain.expenses);
    expect(restored.address).toBe(address);
  });

  test("parseBackupFile rejects garbage", () => {
    expect(() => parseBackupFile("{not json")).toThrow();
    expect(() => parseBackupFile(JSON.stringify({ format: "other" }))).toThrow(/Not a Sched Ledger/);
  });
});
