import { describe, expect, test } from "bun:test";
import {
  checkQuizAnswers,
  isValidPassphrase,
  pickQuizIndices,
  unwrapSecrets,
  wrapSecrets,
} from "@/frontend/auth/lib/device-vault";

describe("device vault", () => {
  test("wrapSecrets / unwrapSecrets round-trip", async () => {
    const secrets = {
      mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };
    const vault = await wrapSecrets("correct horse battery", secrets);
    expect(vault.v).toBe(1);
    expect(vault.salt.length).toBeGreaterThan(8);
    const plain = await unwrapSecrets("correct horse battery", vault);
    expect(plain).toEqual(secrets);
  });

  test("wrong passphrase fails", async () => {
    const vault = await wrapSecrets("long-enough-pass", {
      mnemonic: "one two three four five six seven eight nine ten eleven twelve",
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    await expect(unwrapSecrets("wrong-passphrase", vault)).rejects.toThrow(/Wrong passphrase/);
  });

  test("isValidPassphrase enforces length", () => {
    expect(isValidPassphrase("short")).toBe(false);
    expect(isValidPassphrase("12345678")).toBe(true);
  });

  test("pickQuizIndices returns sorted unique indices", () => {
    const indices = pickQuizIndices(12, 3);
    expect(indices).toHaveLength(3);
    expect(new Set(indices).size).toBe(3);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    expect(indices.every((i) => i >= 0 && i < 12)).toBe(true);
  });

  test("checkQuizAnswers is case-insensitive", () => {
    const words = ["alpha", "bravo", "charlie", "delta"];
    expect(checkQuizAnswers(words, [0, 2], { 0: "Alpha", 2: "CHARLIE" })).toBe(true);
    expect(checkQuizAnswers(words, [0, 2], { 0: "alpha", 2: "wrong" })).toBe(false);
  });
});
