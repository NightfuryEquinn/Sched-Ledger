import type { IdentityRecord } from "@/frontend/lib/types";
import { walletClient } from "@/frontend/auth/lib/wallet";
import { buildDerivationMessage, deriveKeyFromSignature } from "./e2ee";
import { ledgerKeyStore } from "./key-store";

export async function unlockLedgerKey(idn: IdentityRecord): Promise<void> {
  const message = buildDerivationMessage(idn.address);
  let signature = await walletClient.sign(idn, message);
  if (Array.isArray(signature)) signature = signature[0]!;
  const key = await deriveKeyFromSignature(signature);
  ledgerKeyStore.set(idn.address, key);
}
