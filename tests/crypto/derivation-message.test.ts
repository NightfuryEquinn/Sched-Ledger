import { describe, expect, test } from "bun:test";
import {
  buildDerivationMessage,
  DERIVATION_MESSAGE_PREFIX,
  LEGACY_DERIVATION_MESSAGE_PREFIX,
} from "@/frontend/lib/crypto/e2ee";
import { getAddress } from "ethers";

describe("derivation message", () => {
  test("defaults to Custos prefix", () => {
    const address = "0x0000000000000000000000000000000000000001";
    const message = buildDerivationMessage(address);

    expect(message.startsWith(DERIVATION_MESSAGE_PREFIX)).toBe(true);
    expect(message).toContain(getAddress(address));
    expect(message).not.toContain("Sched Ledger");
  });

  test("can build the legacy Sched Ledger message", () => {
    const address = "0x0000000000000000000000000000000000000001";
    const message = buildDerivationMessage(address, LEGACY_DERIVATION_MESSAGE_PREFIX);

    expect(message.startsWith(LEGACY_DERIVATION_MESSAGE_PREFIX)).toBe(true);
    expect(message).toContain("Sched Ledger");
  });
});
