import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ address: 1 }, { unique: true }),
    db.collection(COLLECTIONS.ledgerProfiles).createIndex({ userAddress: 1 }, { unique: true }),
    db.collection(COLLECTIONS.expenses).createIndex({ userAddress: 1, date: -1 }),
    db.collection(COLLECTIONS.expenses).createIndex({ userAddress: 1, recurring: 1, date: -1 }),
    db.collection(COLLECTIONS.events).createIndex({ userAddress: 1, date: 1 }),
    db.collection(COLLECTIONS.consent).createIndex({ userAddress: 1 }, { unique: true }),
    db.collection(COLLECTIONS.authNonces).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(COLLECTIONS.authNonces).createIndex({ address: 1, nonce: 1 }),
    db.collection(COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ address: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
