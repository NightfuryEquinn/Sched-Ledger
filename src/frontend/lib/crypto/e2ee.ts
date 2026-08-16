import { E2EE_VERSION } from "@/schemas/encryption";
import { getAddress } from "ethers";
import { normalizeRecurring, type RecurringField } from "@/lib/recurring";

export const DERIVATION_MESSAGE_PREFIX = "Sched Ledger data encryption key v1";

export type ExpenseSecrets = {
  sub: string;
  amount: number;
  note: string;
};

export type WalletSecrets = {
  name: string;
  income: number;
  startingBalance: number;
  budgets: Record<string, number>;
};

export type CategorySecrets = {
  categories: Array<{
    id: string;
    name: string;
    color: string;
    glyph: string;
    type?: "expense" | "income" | "savings";
    builtin?: boolean;
    archived?: boolean;
    /** Piggy goal. Meaningful only when type is "savings". */
    target?: number;
    deadline?: string;
    subs: Array<{ id: string; name: string; target?: number; deadline?: string }>;
  }>;
};

export type EventSecrets = {
  title: string;
  comments: Array<{ id: string; text: string; at: string }>;
  customLabel?: string;
  customGlyph?: string;
  budgetHoldEnabled?: boolean;
  budgetHoldAmount?: number;
  budgetHoldCategoryId?: string;
  budgetHoldReleasedDates?: string[];
};

export type TodoListSecrets = {
  name: string;
  icon: string;
  tasks: Array<{ id: string; title: string; done: boolean }>;
};

export function buildDerivationMessage(address: string): string {
  return `${DERIVATION_MESSAGE_PREFIX}\n\nAddress: ${getAddress(address)}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...view].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const HKDF_INFO = new TextEncoder().encode("ledger-e2ee-aes-gcm-v1");

export async function deriveKeyFromSignature(signature: string): Promise<CryptoKey> {
  const sigBytes = hexToBytes(signature);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    sigBytes as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const packed = new Uint8Array(1 + iv.length + ciphertext.byteLength);
  packed[0] = E2EE_VERSION;
  packed.set(iv, 1);
  packed.set(new Uint8Array(ciphertext), 1 + iv.length);
  return bytesToBase64(packed);
}

export async function decryptJson<T>(key: CryptoKey, payload: string): Promise<T> {
  const packed = base64ToBytes(payload);
  if (packed.length < 14 || packed[0] !== E2EE_VERSION) {
    throw new Error("Unsupported encryption format");
  }
  const iv = packed.slice(1, 13);
  const ciphertext = packed.slice(13);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function expenseSeriesKey(fields: {
  walletId: string;
  sub: string;
  note: string;
  recurring: RecurringField | unknown;
}): Promise<string> {
  const raw = `${fields.walletId}|${fields.sub}|${fields.note}|${normalizeRecurring(fields.recurring)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return bytesToHex(digest);
}
