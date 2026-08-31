import type { IdentityRecord } from "@/frontend/lib/types";
import { sessionSecrets } from "@/frontend/auth/lib/session-secrets";
import { Wallet } from "ethers";

/** Resolve a private key from the identity or in-memory session secrets. */
function resolvePrivateKey(idn: IdentityRecord): string | undefined {
  if (idn.privateKey) return idn.privateKey;

  return sessionSecrets.get(idn.address)?.privateKey;
}

export const walletClient = {
  hasInjected() {
    return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
  },
  async create() {
    const w = Wallet.createRandom();
    return { address: w.address, mnemonic: w.mnemonic!.phrase, privateKey: w.privateKey };
  },
  async fromMnemonic(phrase: string) {
    const clean = phrase.trim().replace(/\s+/g, " ").toLowerCase();
    const count = clean.split(" ").length;
    if (count !== 12 && count !== 24) throw new Error("A recovery phrase has 12 or 24 words.");
    const w = Wallet.fromPhrase(clean);
    return { address: w.address, mnemonic: clean, privateKey: w.privateKey };
  },
  async sign(idn: IdentityRecord, message: string) {
    if (idn.injected && walletClient.hasInjected()) {
      return await window.ethereum!.request({
        method: "personal_sign",
        params: [message, idn.address],
      });
    }
    const privateKey = resolvePrivateKey(idn);
    if (privateKey) {
      return await new Wallet(privateKey).signMessage(message);
    }

    throw new Error("No wallet signer available — connect an extension or unlock with your recovery phrase.");
  },
};
