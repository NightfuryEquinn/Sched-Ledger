export { closeDb, connectDb, getDb, isDbConnected, setDbForTests } from "./client";
export {
  COLLECTIONS,
  getCollections,
  type AuthNonceDocument,
  type BudgetAlertLogDocument,
  type Collections,
  type ConsentDocument,
  type EventDocument,
  type ExpenseDocument,
  type FinancialWalletDocument,
  type LedgerProfileDocument,
  type ReminderLogDocument,
  type SessionDocument,
  type TodoListDocument,
  type UserDocument,
} from "./collections";
export { ensureIndexes } from "./indexes";

