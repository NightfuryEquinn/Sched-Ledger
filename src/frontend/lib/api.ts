import type { Account, Budgets, Category, Expense, FinancialWallet, LedgerEvent, TodoList } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiProfile = {
  id: string;
  userAddress: string;
  currentMonth: string;
};

export type ApiSession = {
  id: string;
  device: string;
  ip?: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
};

export type ApiUser = {
  id: string;
  address: string;
  codename: string;
  notifyEmail?: string;
  timezone?: string;
  emailRemindersEnabled?: boolean;
  budgetAlertsEnabled?: boolean;
};

export type ApiConsent = {
  id: string;
  userAddress: string;
  optedIn: boolean;
  updatedAt: string;
};

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = opts;
  const res = await fetch(`/api${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, payload.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health() {
    return fetch("/api/health").then(async (res) => {
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, payload.error ?? res.statusText);
      }
      return res.json() as Promise<{ ok: boolean; service: string; db: string }>;
    });
  },

  auth: {
    challenge(address: string) {
      return request<{ message: string; nonce: string; expiresAt: string; uri: string }>(
        "/auth/challenge",
        { method: "POST", body: { address } },
      );
    },
    verify(body: { address: string; message: string; signature: string }) {
      return request<{ account: Account; session: ApiSession }>("/auth/verify", {
        method: "POST",
        body,
      });
    },
    me() {
      return request<{ account: Account; session: ApiSession | null }>("/auth/me");
    },
    logout() {
      return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
    },
    sessions() {
      return request<{ sessions: ApiSession[] }>("/auth/sessions");
    },
    revokeSession(id: string) {
      return request<{ ok: boolean }>(`/auth/sessions/${id}`, { method: "DELETE" });
    },
    revokeOtherSessions() {
      return request<{ ok: boolean }>("/auth/sessions", { method: "DELETE" });
    },
    clearAll() {
      return request<{ ok: boolean; cleared: string[] }>("/auth/clear", { method: "POST" });
    },
  },

  users: {
    upsert(body: { address: string; codename: string; notifyEmail?: string }) {
      return request<{ user: ApiUser }>("/users", {
        method: "POST",
        body,
      });
    },
    me() {
      return request<{ user: ApiUser }>("/users/me");
    },
    updateMe(body: {
      codename?: string;
      notifyEmail?: string;
      timezone?: string;
      emailRemindersEnabled?: boolean;
      budgetAlertsEnabled?: boolean;
    }) {
      return request<{ user: ApiUser }>("/users/me", { method: "PATCH", body });
    },
  },

  consent: {
    get() {
      return request<{ consent: ApiConsent }>("/consent");
    },
    update(optedIn: boolean) {
      return request<{ consent: ApiConsent }>("/consent", {
        method: "PATCH",
        body: { optedIn },
      });
    },
  },

  profile: {
    get() {
      return request<{ profile: ApiProfile }>("/profile");
    },
    update(body: Partial<Pick<ApiProfile, "currentMonth">>) {
      return request<{ profile: ApiProfile }>("/profile", { method: "PATCH", body });
    },
  },

  wallets: {
    list() {
      return request<{ wallets: FinancialWallet[] }>("/wallets");
    },
    create(body: { name: string; currency: string; fundingMode?: string }) {
      return request<{ wallet: FinancialWallet }>("/wallets", { method: "POST", body });
    },
    update(id: string, body: Partial<Pick<FinancialWallet, "name" | "currency" | "fundingMode" | "income" | "startingBalance" | "budgets" | "isDefault">> | Record<string, unknown>) {
      return request<{ wallet: FinancialWallet }>(`/wallets/${id}`, { method: "PATCH", body });
    },
    updateBudgets(id: string, body: { enc: 1; payload: string }) {
      return request<{ wallet: FinancialWallet }>(`/wallets/${id}/budgets`, {
        method: "PUT",
        body,
      });
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/wallets/${id}`, { method: "DELETE" });
    },
  },

  categories: {
    list() {
      return request<{ categories: Category[] }>("/categories");
    },
    update(categories: Category[]) {
      return request<{ categories: Category[] }>("/categories", {
        method: "PUT",
        body: { categories },
      });
    },
  },

  expenses: {
    list(query?: { month?: string; recurring?: boolean; walletId?: string }) {
      const params = new URLSearchParams();
      if (query?.month) params.set("month", query.month);
      if (query?.recurring !== undefined) params.set("recurring", String(query.recurring));
      if (query?.walletId) params.set("walletId", query.walletId);
      const qs = params.toString();
      return request<{ expenses: Expense[] }>(`/expenses${qs ? `?${qs}` : ""}`);
    },
    create(body: Pick<Expense, "walletId" | "kind" | "date" | "sub" | "amount" | "note" | "recurring"> | Record<string, unknown>) {
      return request<{ expense: Expense }>("/expenses", { method: "POST", body });
    },
    update(id: string, body: Partial<Omit<Expense, "id">> | Record<string, unknown>) {
      return request<{ expense: Expense }>(`/expenses/${id}`, { method: "PATCH", body });
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/expenses/${id}`, { method: "DELETE" });
    },
  },

  events: {
    list(query?: { month?: string }) {
      const qs = query?.month ? `?month=${encodeURIComponent(query.month)}` : "";
      return request<{ events: LedgerEvent[] }>(`/events${qs}`);
    },
    create(body: Omit<LedgerEvent, "id" | "comments"> & { comments?: LedgerEvent["comments"] }) {
      return request<{ event: LedgerEvent }>("/events", { method: "POST", body });
    },
    update(id: string, body: Partial<Omit<LedgerEvent, "id">>) {
      return request<{ event: LedgerEvent }>(`/events/${id}`, { method: "PATCH", body });
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/events/${id}`, { method: "DELETE" });
    },
    addComment(id: string, text: string) {
      return request<{ event: LedgerEvent }>(`/events/${id}/comments`, {
        method: "POST",
        body: { text },
      });
    },
  },

  todoLists: {
    list() {
      return request<{ todoLists: TodoList[] }>("/todo-lists");
    },
    create(body: { name: string; icon: string }) {
      return request<{ todoList: TodoList }>("/todo-lists", { method: "POST", body });
    },
    update(id: string, body: Partial<Pick<TodoList, "name" | "icon" | "tasks">>) {
      return request<{ todoList: TodoList }>(`/todo-lists/${id}`, { method: "PATCH", body });
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/todo-lists/${id}`, { method: "DELETE" });
    },
  },

  fx: {
    latest(base: string) {
      return request<{
        base: string;
        rates: Record<string, number>;
        fetchedAt: number;
        cached: boolean;
      }>(`/fx/latest/${encodeURIComponent(base)}`);
    },
  },

  budgetAlerts: {
    notify(body: {
      walletId: string;
      month: string;
      alerts: Array<{
        categoryId: string;
        categoryName: string;
        spent: number;
        budget: number;
        level: "warning" | "exceeded";
        currency?: string;
      }>;
    }) {
      return request<{ ok: boolean; sent: number; skipped: number; errors: string[] }>(
        "/budget-alerts",
        { method: "POST", body },
      );
    },
  },
};
