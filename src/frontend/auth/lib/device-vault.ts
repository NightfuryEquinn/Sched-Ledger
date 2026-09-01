/**
 * Device vault — wrap in-app wallet secrets with a local passphrase.
 * Uses PBKDF2-SHA-256 + AES-256-GCM.
 */

const VAULT_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

type VaultBlob = {
  v: typeof VAULT_VERSION;
  salt: string;
  iv: string;
  ciphertext: string;
};

type VaultSecrets = {
  mnemonic: string;
  privateKey: string;
};

/** Encode bytes as base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary);
}

/** Decode base64 to bytes. */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

/** Derive an AES-GCM key from a passphrase and salt. */
async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Whether a passphrase meets the minimum local vault policy. */
export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.length >= 8;
}

/** Encrypt mnemonic + privateKey for on-device storage. */
export async function wrapSecrets(passphrase: string, secrets: VaultSecrets): Promise<VaultBlob> {
  if (!isValidPassphrase(passphrase)) {
    throw new Error("Passphrase must be at least 8 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveVaultKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    v: VAULT_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypt a vault blob with the device passphrase. */
export async function unwrapSecrets(passphrase: string, vault: VaultBlob): Promise<VaultSecrets> {
  if (vault.v !== VAULT_VERSION) {
    throw new Error("Unsupported vault format.");
  }

  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const key = await deriveVaultKey(passphrase, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(vault.ciphertext),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as VaultSecrets;

    if (!parsed?.mnemonic || !parsed?.privateKey) {
      throw new Error("Vault contents are incomplete.");
    }

    return parsed;
  } catch {
    throw new Error("Wrong passphrase or corrupted vault.");
  }
}

/** Pick quiz indices covering distinct recovery-phrase positions. */
export function pickQuizIndices(wordCount: number, quizSize = 3): number[] {
  const size = Math.min(quizSize, wordCount);
  const indices = Array.from({ length: wordCount }, (_, i) => i);

  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }

  return indices.slice(0, size).sort((a, b) => a - b);
}

/** Whether the user answers match the mnemonic words at quiz indices. */
export function checkQuizAnswers(
  words: string[],
  indices: number[],
  answers: Record<number, string>,
): boolean {
  return indices.every((i) => {
    const expected = words[i]?.toLowerCase().trim();
    const got = (answers[i] ?? "").toLowerCase().trim();

    return !!expected && expected === got;
  });
}
