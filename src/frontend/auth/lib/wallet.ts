import type { IdentityRecord } from "@/frontend/lib/types";
import { Wallet } from "ethers";

async function fakeSign(message: string): Promise<string> {
  const data = new TextEncoder().encode(`${message}:${Date.now()}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}${hex.slice(0, 64)}1b`;
}

export const walletClient = {
  hasInjected() {
    return typeof window.ethereum !== "undefined";
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
    if (idn.privateKey) {
      return await new Wallet(idn.privateKey).signMessage(message);
    }
    return await fakeSign(message);
  },
};
