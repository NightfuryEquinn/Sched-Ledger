export { closeDb, connectDb, getDb } from "./client";
export {
  COLLECTIONS,
  getCollections, type AuthNonceDocument, type Collections, type ConsentDocument, type EventDocument, type ExpenseDocument, type FinancialWalletDocument, type LedgerProfileDocument, type SessionDocument, type UserDocument
} from "./collections";
export { ensureIndexes } from "./indexes";

