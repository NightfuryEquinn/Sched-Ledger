/**
 * Client-only encrypted ledger backup — download / restore a portable blob.
 * Outer layer uses the unlocked ledger AES key (same as E2EE).
 */

import { decryptJson, encryptJson } from "@/frontend/lib/crypto/e2ee";
import type {
  CapitalPlan,
  Category,
  Expense,
  FinancialWallet,
  FuelFill,
  LedgerEvent,
  TodoList,
  Vehicle,
} from "@/frontend/lib/types";

export const BACKUP_FORMAT = "sched-ledger-backup" as const;
export const BACKUP_VERSION = 1 as const;

export type LedgerBackupPlain = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  address: string;
  wallets: FinancialWallet[];
  categories: Category[];
  expenses: Expense[];
  events: LedgerEvent[];
  todoLists: TodoList[];
  /** Present on backups from 4.1.4 onward; omitted on older exports. */
  capitalPlans?: CapitalPlan[];
  vehicles?: Vehicle[];
  vehicleFills?: FuelFill[];
};

type EncryptedBackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  address: string;
  exportedAt: string;
  /** AES-GCM ciphertext of LedgerBackupPlain, keyed by the ledger E2EE key. */
  payload: string;
};

/** Build a plaintext backup snapshot from in-memory ledger data. */
export function buildBackupPlain(input: {
  address: string;
  wallets: FinancialWallet[];
  categories: Category[];
  expenses: Expense[];
  events: LedgerEvent[];
  todoLists: TodoList[];
  capitalPlans?: CapitalPlan[];
  vehicles?: Vehicle[];
  vehicleFills?: FuelFill[];
}): LedgerBackupPlain {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    address: input.address,
    wallets: input.wallets,
    categories: input.categories,
    expenses: input.expenses,
    events: input.events,
    todoLists: input.todoLists,
    capitalPlans: input.capitalPlans,
    vehicles: input.vehicles,
    vehicleFills: input.vehicleFills,
  };
}

/** Encrypt a backup snapshot with the unlocked ledger key. */
export async function encryptBackup(
  key: CryptoKey,
  plain: LedgerBackupPlain,
): Promise<EncryptedBackupFile> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    address: plain.address,
    exportedAt: plain.exportedAt,
    payload: await encryptJson(key, plain),
  };
}

/** Decrypt and validate an encrypted backup file. */
export async function decryptBackup(
  key: CryptoKey,
  file: EncryptedBackupFile,
): Promise<LedgerBackupPlain> {
  if (file.format !== BACKUP_FORMAT || file.version !== BACKUP_VERSION) {
    throw new Error("Unsupported backup format.");
  }

  const plain = await decryptJson<LedgerBackupPlain>(key, file.payload);

  if (plain.format !== BACKUP_FORMAT || plain.version !== BACKUP_VERSION) {
    throw new Error("Backup contents are invalid.");
  }

  return plain;
}

/** Parse a JSON backup file from disk. */
export function parseBackupFile(raw: string): EncryptedBackupFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  const file = parsed as EncryptedBackupFile;

  if (
    !file ||
    file.format !== BACKUP_FORMAT ||
    file.version !== BACKUP_VERSION ||
    typeof file.payload !== "string" ||
    typeof file.address !== "string"
  ) {
    throw new Error("Not a Sched Ledger encrypted backup.");
  }

  return file;
}

/** Trigger a browser download of the encrypted backup. */
export function downloadEncryptedBackup(file: EncryptedBackupFile, filename?: string) {
  const stamp = file.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `sched-ledger-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
