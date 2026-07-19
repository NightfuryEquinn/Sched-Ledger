import {
  decryptJson,
  encryptJson,
  expenseSeriesKey,
  type CategorySecrets,
  type EventSecrets,
  type ExpenseSecrets,
  type TodoListSecrets,
  type WalletSecrets,
} from "@/frontend/lib/crypto/e2ee";
import type {
  Budgets,
  Category,
  Expense,
  FinancialWallet,
  LedgerEvent,
  TodoList,
} from "@/frontend/lib/types";
import { normalizeRecurring } from "@/frontend/lib/stats";
import type { RecurringField } from "@/lib/recurring";

export type ExpenseWire = {
  id: string;
  walletId: string;
  kind: "expense" | "income";
  date: string;
  recurring: RecurringField | false;
  enc?: 1;
  payload?: string;
  seriesKey?: string;
  eventId?: string;
  /** Legacy plaintext fields (pre-E2EE or migration). */
  sub?: string;
  amount?: number;
  note?: string;
};

export type WalletWire = FinancialWallet & {
  enc?: 1;
  payload?: string;
};

export async function decodeExpense(wire: ExpenseWire, key: CryptoKey): Promise<Expense> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<ExpenseSecrets>(key, wire.payload);
    return {
      id: wire.id,
      walletId: wire.walletId,
      kind: wire.kind ?? "expense",
      date: wire.date,
      recurring: normalizeRecurring(wire.recurring),
      ...(wire.eventId ? { eventId: wire.eventId } : {}),
      ...secrets,
    };
  }
  if (wire.sub == null || wire.amount == null) {
    throw new Error("Expense is encrypted but no key is available");
  }
  return {
    id: wire.id,
    walletId: wire.walletId,
    kind: wire.kind ?? "expense",
    date: wire.date,
    sub: wire.sub,
    amount: wire.amount,
    note: wire.note ?? "",
    recurring: normalizeRecurring(wire.recurring),
    ...(wire.eventId ? { eventId: wire.eventId } : {}),
  };
}

export async function encodeExpenseCreate(
  expense: Pick<Expense, "walletId" | "kind" | "date" | "sub" | "amount" | "note" | "recurring" | "eventId">,
  key: CryptoKey,
) {
  const payload = await encryptJson(key, {
    sub: expense.sub,
    amount: expense.amount,
    note: expense.note ?? "",
  } satisfies ExpenseSecrets);
  const recurring = normalizeRecurring(expense.recurring);
  const seriesKey =
    recurring !== false
      ? await expenseSeriesKey({
          walletId: expense.walletId,
          sub: expense.sub,
          note: expense.note ?? "",
          recurring,
        })
      : undefined;
  return {
    walletId: expense.walletId,
    kind: expense.kind ?? "expense",
    date: expense.date,
    recurring,
    enc: 1 as const,
    payload,
    ...(seriesKey ? { seriesKey } : {}),
    ...(expense.eventId ? { eventId: expense.eventId } : {}),
  };
}

export async function encodeExpenseUpdate(
  expense: Partial<Omit<Expense, "id">> & Pick<Expense, "sub" | "amount" | "note">,
  key: CryptoKey,
) {
  const payload = await encryptJson(key, {
    sub: expense.sub,
    amount: expense.amount,
    note: expense.note ?? "",
  } satisfies ExpenseSecrets);
  const patch: Record<string, unknown> = { enc: 1, payload };
  if (expense.walletId) patch.walletId = expense.walletId;
  if (expense.kind) patch.kind = expense.kind;
  if (expense.date) patch.date = expense.date;
  if (expense.eventId !== undefined) patch.eventId = expense.eventId || null;
  if (expense.recurring !== undefined) {
    patch.recurring = normalizeRecurring(expense.recurring);
    const recurring = patch.recurring as RecurringField | false;
    if (recurring !== false && expense.walletId) {
      patch.seriesKey = await expenseSeriesKey({
        walletId: expense.walletId,
        sub: expense.sub,
        note: expense.note ?? "",
        recurring,
      });
    } else {
      patch.seriesKey = null;
    }
  }
  return patch;
}

export async function decodeWallet(wire: WalletWire, key: CryptoKey): Promise<FinancialWallet> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<WalletSecrets>(key, wire.payload);
    return {
      id: wire.id,
      name: wire.name,
      currency: wire.currency,
      fundingMode: wire.fundingMode ?? "monthly",
      isDefault: wire.isDefault,
      ...secrets,
    };
  }
  return {
    id: wire.id,
    name: wire.name,
    currency: wire.currency,
    fundingMode: wire.fundingMode ?? "monthly",
    income: wire.income ?? 0,
    startingBalance: wire.startingBalance ?? 0,
    budgets: wire.budgets ?? {},
    isDefault: wire.isDefault,
  };
}

export async function encodeWalletFinancials(
  data: { income?: number; startingBalance?: number; budgets?: Budgets },
  key: CryptoKey,
) {
  return {
    enc: 1 as const,
    payload: await encryptJson(key, {
      income: data.income ?? 0,
      startingBalance: data.startingBalance ?? 0,
      budgets: data.budgets ?? {},
    } satisfies WalletSecrets),
  };
}

export type CategoriesWire = {
  enc?: 1;
  payload?: string;
  /** Legacy plaintext tree (pre-E2EE). */
  categories?: Category[];
  /** No taxonomy doc yet — client should seed encrypted defaults. */
  seed?: boolean;
};

/** Decrypt category taxonomy wire, or return legacy plaintext categories. */
export async function decodeCategories(wire: CategoriesWire, key: CryptoKey): Promise<Category[]> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<CategorySecrets>(key, wire.payload);

    return secrets.categories;
  }

  if (wire.categories) return wire.categories;

  throw new Error("Category taxonomy is encrypted but no key is available");
}

/** Encrypt the full category tree for PUT /api/categories. */
export async function encodeCategories(categories: Category[], key: CryptoKey) {
  return {
    enc: 1 as const,
    payload: await encryptJson(key, { categories } satisfies CategorySecrets),
  };
}

export type EventWire = {
  id: string;
  catId: string;
  date: string;
  allDay: boolean;
  time: string | null;
  repeat: string;
  exceptDates?: string[];
  until?: string | null;
  notify: boolean;
  lead: string;
  email?: string;
  expenseId?: string;
  enc?: 1;
  payload?: string;
  /** Legacy plaintext secrets. */
  title?: string;
  comments?: LedgerEvent["comments"];
  customLabel?: string;
  customGlyph?: string;
};

/** Decrypt event secrets and merge with plaintext schedule metadata. */
export async function decodeEvent(wire: EventWire, key: CryptoKey): Promise<LedgerEvent> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<EventSecrets>(key, wire.payload);

    return {
      id: wire.id,
      catId: wire.catId,
      date: wire.date,
      allDay: wire.allDay,
      time: wire.time,
      repeat: wire.repeat,
      exceptDates: wire.exceptDates,
      until: wire.until,
      notify: wire.notify,
      lead: wire.lead,
      email: wire.email ?? "",
      ...(wire.expenseId ? { expenseId: wire.expenseId } : {}),
      title: secrets.title,
      comments: secrets.comments ?? [],
      ...(secrets.customLabel ? { customLabel: secrets.customLabel } : {}),
      ...(secrets.customGlyph ? { customGlyph: secrets.customGlyph } : {}),
    };
  }

  if (wire.title == null) {
    throw new Error("Event is encrypted but no key is available");
  }

  return {
    id: wire.id,
    title: wire.title,
    catId: wire.catId,
    customLabel: wire.customLabel,
    customGlyph: wire.customGlyph,
    date: wire.date,
    allDay: wire.allDay,
    time: wire.time,
    repeat: wire.repeat,
    exceptDates: wire.exceptDates,
    until: wire.until,
    notify: wire.notify,
    lead: wire.lead,
    email: wire.email ?? "",
    comments: wire.comments ?? [],
    ...(wire.expenseId ? { expenseId: wire.expenseId } : {}),
  };
}

/** Build encrypted create body for an event (secrets in payload). */
export async function encodeEventCreate(
  event: Omit<LedgerEvent, "id">,
  key: CryptoKey,
) {
  const secrets: EventSecrets = {
    title: event.title,
    comments: event.comments ?? [],
  };
  if (event.catId === "custom") {
    if (event.customLabel) secrets.customLabel = event.customLabel;
    if (event.customGlyph) secrets.customGlyph = event.customGlyph;
  }

  return {
    catId: event.catId,
    date: event.date,
    allDay: event.allDay,
    time: event.time,
    repeat: event.repeat,
    notify: event.notify,
    lead: event.lead,
    email: event.email ?? "",
    ...(event.expenseId ? { expenseId: event.expenseId } : {}),
    enc: 1 as const,
    payload: await encryptJson(key, secrets),
  };
}

/** Build encrypted update body for an event. */
export async function encodeEventUpdate(
  event: Partial<Omit<LedgerEvent, "id">> & Pick<LedgerEvent, "title" | "comments">,
  key: CryptoKey,
) {
  const secrets: EventSecrets = {
    title: event.title,
    comments: event.comments ?? [],
  };
  if (event.catId === "custom") {
    if (event.customLabel) secrets.customLabel = event.customLabel;
    if (event.customGlyph) secrets.customGlyph = event.customGlyph;
  }

  const patch: Record<string, unknown> = {
    enc: 1,
    payload: await encryptJson(key, secrets),
  };

  if (event.catId !== undefined) patch.catId = event.catId;
  if (event.date !== undefined) patch.date = event.date;
  if (event.allDay !== undefined) patch.allDay = event.allDay;
  if (event.time !== undefined) patch.time = event.time;
  if (event.repeat !== undefined) patch.repeat = event.repeat;
  if (event.exceptDates !== undefined) patch.exceptDates = event.exceptDates;
  if (event.until !== undefined) patch.until = event.until;
  if (event.notify !== undefined) patch.notify = event.notify;
  if (event.lead !== undefined) patch.lead = event.lead;
  if (event.email !== undefined) patch.email = event.email;
  if (event.expenseId !== undefined) patch.expenseId = event.expenseId || null;

  return patch;
}

export type TodoListWire = {
  id: string;
  enc?: 1;
  payload?: string;
  /** Legacy plaintext fields. */
  name?: string;
  icon?: string;
  tasks?: TodoList["tasks"];
};

/** Decrypt a todo list wire, or return legacy plaintext fields. */
export async function decodeTodoList(wire: TodoListWire, key: CryptoKey): Promise<TodoList> {
  if (wire.enc === 1 && wire.payload) {
    const secrets = await decryptJson<TodoListSecrets>(key, wire.payload);

    return {
      id: wire.id,
      name: secrets.name,
      icon: secrets.icon,
      tasks: secrets.tasks ?? [],
    };
  }

  if (wire.name == null) {
    throw new Error("Todo list is encrypted but no key is available");
  }

  return {
    id: wire.id,
    name: wire.name,
    icon: wire.icon ?? "📋",
    tasks: wire.tasks ?? [],
  };
}

/** Encrypt todo list secrets for create. */
export async function encodeTodoListCreate(
  data: Pick<TodoList, "name" | "icon"> & { tasks?: TodoList["tasks"] },
  key: CryptoKey,
) {
  return {
    enc: 1 as const,
    payload: await encryptJson(key, {
      name: data.name,
      icon: data.icon,
      tasks: data.tasks ?? [],
    } satisfies TodoListSecrets),
  };
}

/** Encrypt todo list secrets for update. */
export async function encodeTodoListUpdate(
  data: Pick<TodoList, "name" | "icon" | "tasks">,
  key: CryptoKey,
) {
  return {
    enc: 1 as const,
    payload: await encryptJson(key, {
      name: data.name,
      icon: data.icon,
      tasks: data.tasks ?? [],
    } satisfies TodoListSecrets),
  };
}
