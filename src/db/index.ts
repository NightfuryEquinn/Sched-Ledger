export { connectDb, getDb, closeDb } from "./client";
export {
  COLLECTIONS,
  getCollections,
  type Collections,
  type UserDocument,
  type LedgerProfileDocument,
  type FinancialWalletDocument,
  type ExpenseDocument,
  type EventDocument,
  type ConsentDocument,
  type AuthNonceDocument,
  type SessionDocument,
} from "./collections";
export { ensureIndexes } from "./indexes";
