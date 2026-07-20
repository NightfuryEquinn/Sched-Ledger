import { api } from "@/frontend/lib/api";
import { maybeNotifyBudgetAlerts } from "@/frontend/lib/budget/notify";
import {
  decodeCategories,
  decodeEvent,
  decodeExpense,
  decodeTodoList,
  decodeWallet,
  encodeCategories,
  encodeEventCreate,
  encodeEventUpdate,
  encodeExpenseCreate,
  encodeExpenseUpdate,
  encodeTodoListCreate,
  encodeTodoListUpdate,
  encodeWalletFinancials,
} from "@/frontend/lib/crypto/codec";
import { ledgerKeyStore } from "@/frontend/lib/crypto/key-store";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import { CURRENT_MONTH_KEY, clampMonthKey } from "@/frontend/lib/data";
import { normalizeRecurring, recurringScheduleKey } from "@/frontend/lib/stats";
import type { Budgets, Category, Expense, FinancialWallet, LedgerEvent, TodoList } from "@/frontend/lib/types";
import type { DeleteScope } from "@/lib/delete-scope";
import { DEFAULT_CATEGORIES, validateTaxonomy } from "@/schemas/category";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

const ACTIVE_WALLET_KEY = "ledger:active-wallet";

export type DeleteScopeOpts = { scope?: DeleteScope; fromDate?: string };

/** Storage key for the last active wallet per account. */
function activeWalletStorageKey(wallet: string) {
  return `${ACTIVE_WALLET_KEY}:${wallet.toLowerCase()}`;
}

/** Require an unlocked ledger crypto key for the given address. */
function requireKey(address: string): CryptoKey {
  const key = ledgerKeyStore.get(address);
  if (!key) throw new Error("Encryption key is locked");
  return key;
}

/** Client-side check that custom events include label + glyph before encrypt. */
function assertCustomEventFields(data: Pick<LedgerEvent, "catId" | "customLabel" | "customGlyph">) {
  if (data.catId !== "custom") return;
  if (!data.customLabel?.trim()) throw new Error("Custom type name is required");
  if (!data.customGlyph?.trim()) throw new Error("Custom emoji is required");
}

/** Clone default category taxonomy for first-time seed. */
function cloneDefaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    subs: c.subs.map((s) => ({ ...s })),
  }));
}

/** Shift a YYYY-MM key by a signed month delta. */
function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y!, (m! - 1) + delta, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** ISO date at the start of a month key. */
function monthStartIso(key: string): string {
  return `${key}-01`;
}

const EXPENSE_LOOKBACK_MONTHS = 36;
const LIST_PAGE_LIMIT = 2000;

const keys = {
  profile: (wallet: string) => ["profile", wallet] as const,
  wallets: (wallet: string) => ["wallets", wallet] as const,
  categories: (wallet: string) => ["categories", wallet] as const,
  expenses: (wallet: string) => ["expenses", wallet] as const,
  events: (wallet: string) => ["events", wallet] as const,
  todoLists: (wallet: string) => ["todoLists", wallet] as const,
};

export function useLedger(walletAddress: string) {
  const queryClient = useQueryClient();
  const wallet = walletAddress.toLowerCase();
  const cryptoReady = ledgerKeyStore.isUnlocked(wallet);

  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(activeWalletStorageKey(wallet));
  });

  const profileQuery = useQuery({
    queryKey: keys.profile(wallet),
    queryFn: async () => {
      const { profile } = await api.profile.get();
      return profile;
    },
    enabled: cryptoReady,
  });

  const walletsQuery = useQuery({
    queryKey: keys.wallets(wallet),
    queryFn: async () => {
      const { wallets } = await api.wallets.list();
      const cryptoKey = requireKey(wallet);
      return Promise.all(
        wallets.map(async (wire) => {
          const decoded = await decodeWallet(wire, cryptoKey);
          /* Migrate legacy plaintext name/financials into the E2EE payload. */
          if (!wire.enc || wire.name != null) {
            const encrypted = await encodeWalletFinancials(
              {
                name: decoded.name,
                income: decoded.income,
                startingBalance: decoded.startingBalance,
                budgets: decoded.budgets,
              },
              cryptoKey,
            );
            const { wallet: updated } = await api.wallets.update(wire.id, encrypted);
            return decodeWallet(updated, cryptoKey);
          }
          return decoded;
        }),
      );
    },
    enabled: cryptoReady,
  });

  const categoriesQuery = useQuery({
    queryKey: keys.categories(wallet),
    queryFn: async () => {
      const wire = await api.categories.list();
      const cryptoKey = requireKey(wallet);

      if (wire.seed) {
        const defaults = cloneDefaultCategories();
        const encrypted = await encodeCategories(defaults, cryptoKey);
        await api.categories.update(encrypted);
        return defaults;
      }

      if (!wire.enc && wire.categories) {
        const encrypted = await encodeCategories(wire.categories, cryptoKey);
        await api.categories.update(encrypted);
        return wire.categories;
      }

      return decodeCategories(wire, cryptoKey);
    },
    enabled: cryptoReady,
  });

  const categoryIndex = useMemo(
    () => buildCategoryIndex(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );

  const wallets = (walletsQuery.data ?? []).map((w) => ({
    ...w,
    fundingMode: w.fundingMode ?? "monthly",
    startingBalance: w.startingBalance ?? 0,
  }));

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    if (activeWalletId) {
      const found = wallets.find((w) => w.id === activeWalletId);
      if (found) return found;
    }
    return wallets.find((w) => w.isDefault) ?? wallets[0];
  }, [wallets, activeWalletId]);

  useEffect(() => {
    if (!activeWallet) return;
    if (activeWalletId !== activeWallet.id) {
      setActiveWalletIdState(activeWallet.id);
      localStorage.setItem(activeWalletStorageKey(wallet), activeWallet.id);
    }
  }, [activeWallet, activeWalletId, wallet]);

  const setActiveWalletId = useCallback(
    (id: string) => {
      setActiveWalletIdState(id);
      localStorage.setItem(activeWalletStorageKey(wallet), id);
    },
    [wallet],
  );

  const expensesQuery = useQuery({
    queryKey: keys.expenses(wallet),
    queryFn: async () => {
      const from = monthStartIso(shiftMonthKey(CURRENT_MONTH_KEY, -EXPENSE_LOOKBACK_MONTHS));
      const cryptoKey = requireKey(wallet);
      const collected: Awaited<ReturnType<typeof decodeExpense>>[] = [];
      let before: string | undefined;

      for (;;) {
        const page = await api.expenses.list({
          from,
          limit: LIST_PAGE_LIMIT,
          before,
        });
        const decoded = await Promise.all(page.expenses.map((e) => decodeExpense(e, cryptoKey)));
        collected.push(...decoded);
        if (!page.hasMore || !page.nextBefore) break;
        before = page.nextBefore;
        if (collected.length >= LIST_PAGE_LIMIT * 5) break;
      }

      return collected;
    },
    enabled: cryptoReady && !!profileQuery.data && wallets.length > 0 && categoriesQuery.data !== undefined,
  });

  const allExpenses = (expensesQuery.data ?? []).map((e) => ({
    ...e,
    kind: e.kind ?? "expense",
    recurring: normalizeRecurring(e.recurring),
  }));
  const expenses = useMemo(
    () => (activeWallet ? allExpenses.filter((e) => e.walletId === activeWallet.id) : []),
    [allExpenses, activeWallet],
  );

  const eventsQuery = useQuery({
    queryKey: keys.events(wallet),
    queryFn: async () => {
      /* Load active recurring series + recent once events (36-month lookback). */
      const from = monthStartIso(shiftMonthKey(CURRENT_MONTH_KEY, -EXPENSE_LOOKBACK_MONTHS));
      const cryptoKey = requireKey(wallet);
      const { events } = await api.events.list({ from, limit: LIST_PAGE_LIMIT });

      return Promise.all(
        events.map(async (wire) => {
          if (!wire.enc && wire.title) {
            const body = await encodeEventUpdate(
              {
                title: wire.title,
                comments: wire.comments ?? [],
                customLabel: wire.customLabel,
                customGlyph: wire.customGlyph,
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
              },
              cryptoKey,
            );
            const { event } = await api.events.update(wire.id, body);
            return decodeEvent(event, cryptoKey);
          }
          return decodeEvent(wire, cryptoKey);
        }),
      );
    },
    enabled: cryptoReady && !!profileQuery.data,
  });

  const todoListsQuery = useQuery({
    queryKey: keys.todoLists(wallet),
    queryFn: async () => {
      const { todoLists } = await api.todoLists.list();
      const cryptoKey = requireKey(wallet);
      return Promise.all(
        todoLists.map(async (wire) => {
          if (!wire.enc && wire.name) {
            const encrypted = await encodeTodoListUpdate(
              {
                name: wire.name,
                icon: wire.icon ?? "📋",
                tasks: wire.tasks ?? [],
              },
              cryptoKey,
            );
            const { todoList } = await api.todoLists.update(wire.id, encrypted);
            return decodeTodoList(todoList, cryptoKey);
          }
          return decodeTodoList(wire, cryptoKey);
        }),
      );
    },
    enabled: cryptoReady && !!profileQuery.data,
  });

  const setMonthMutation = useMutation({
    mutationFn: (currentMonth: string) => api.profile.update({ currentMonth }),
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(keys.profile(wallet), profile);
    },
  });

  const setBudgetsMutation = useMutation({
    mutationFn: async (budgets: Budgets) => {
      if (!activeWallet) throw new Error("No active wallet");
      const cryptoKey = requireKey(wallet);
      const encrypted = await encodeWalletFinancials(
        {
          name: activeWallet.name,
          income: activeWallet.income,
          startingBalance: activeWallet.startingBalance,
          budgets,
        },
        cryptoKey,
      );
      return api.wallets.updateBudgets(activeWallet.id, encrypted);
    },
    onSuccess: async ({ wallet: wire }) => {
      const cryptoKey = requireKey(wallet);
      const updated = await decodeWallet(wire, cryptoKey);
      queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) =>
        prev.map((w) => (w.id === updated.id ? updated : w)),
      );
    },
  });

  const saveWalletMutation = useMutation({
    mutationFn: async (data: Partial<FinancialWallet> & { id?: string; name?: string; currency?: string }) => {
      const cryptoKey = requireKey(wallet);
      if (data.id) {
        const existing = (walletsQuery.data ?? []).find((w) => w.id === data.id);
        const name = data.name ?? existing?.name ?? "Wallet";
        const financialPatch =
          data.name !== undefined ||
          data.income !== undefined ||
          data.startingBalance !== undefined ||
          data.budgets !== undefined
            ? await encodeWalletFinancials(
                {
                  name,
                  income: data.income ?? existing?.income ?? 0,
                  startingBalance: data.startingBalance ?? existing?.startingBalance ?? 0,
                  budgets: data.budgets ?? existing?.budgets ?? {},
                },
                cryptoKey,
              )
            : {};
        const { wallet: updated } = await api.wallets.update(data.id, {
          currency: data.currency,
          fundingMode: data.fundingMode,
          isDefault: data.isDefault,
          ...financialPatch,
        });
        return decodeWallet(updated, cryptoKey);
      }
      const encrypted = await encodeWalletFinancials(
        {
          name: data.name!,
          income: data.fundingMode === "monthly" ? (data.income ?? 0) : 0,
          startingBalance: data.fundingMode === "starting" ? (data.startingBalance ?? 0) : 0,
          budgets: {},
        },
        cryptoKey,
      );
      const { wallet: created } = await api.wallets.create({
        currency: data.currency!,
        fundingMode: data.fundingMode,
        ...encrypted,
      });
      return decodeWallet(created, cryptoKey);
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) => {
        if (variables.id) {
          return prev.map((w) => (w.id === saved.id ? saved : w.isDefault && saved.isDefault ? { ...w, isDefault: false } : w));
        }
        return [...prev, saved];
      });
      if (!variables.id) setActiveWalletId(saved.id);
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: (id: string) => api.wallets.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) => {
        const next = prev.filter((w) => w.id !== id);
        if (activeWalletId === id && next.length) {
          const fallback = next.find((w) => w.isDefault) ?? next[0];
          if (fallback) setActiveWalletId(fallback.id);
        }
        return next;
      });
    },
  });

  const saveExpenseMutation = useMutation({
    mutationFn: async (data: Omit<Expense, "id"> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      if (data.id) {
        const body = await encodeExpenseUpdate(data, cryptoKey);
        const res = await api.expenses.update(data.id, body);
        const expense = await decodeExpense(res.expense, cryptoKey);
        return {
          expense,
          deletedIds: res.deletedIds ?? [],
          endedIds: res.endedIds ?? [],
        };
      }
      const body = await encodeExpenseCreate(data, cryptoKey);
      const { expense } = await api.expenses.create(body);
      return {
        expense: await decodeExpense(expense, cryptoKey),
        deletedIds: [] as string[],
        endedIds: [] as string[],
      };
    },
    onSuccess: ({ expense, deletedIds, endedIds }, variables) => {
      const gone = new Set(deletedIds);
      const ended = new Set(endedIds);
      const nextExpenses = (() => {
        const prev = queryClient.getQueryData<Expense[]>(keys.expenses(wallet)) ?? [];
        let next = prev.filter((e) => !gone.has(e.id));
        next = next.map((e) => {
          if (ended.has(e.id)) return { ...e, recurring: false as const };
          if (variables.id && e.id === expense.id) return expense;
          return e;
        });
        if (!variables.id) {
          next = [expense, ...next].sort((a, b) =>
            a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
          );
        } else if (!next.some((e) => e.id === expense.id)) {
          next = [expense, ...next];
        }
        return next;
      })();
      queryClient.setQueryData<Expense[]>(keys.expenses(wallet), nextExpenses);
      if (!variables.id) {
        setMonthMutation.mutate(expense.date.slice(0, 7));
      }

      const walletDoc = activeWallet;
      if (walletDoc && expense.kind !== "income") {
        const monthKey = expense.date.slice(0, 7);
        const scoped = nextExpenses.filter((e) => e.walletId === walletDoc.id);
        void maybeNotifyBudgetAlerts({
          expenses: scoped,
          budgets: walletDoc.budgets,
          wallet: walletDoc,
          month: monthKey,
          currency: walletDoc.currency,
          categoryIndex,
          events: queryClient.getQueryData<LedgerEvent[]>(keys.events(wallet)) ?? [],
        });
      }
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: ({ id, opts }: { id: string; opts?: DeleteScopeOpts }) =>
      api.expenses.remove(id, opts),
    onSuccess: (res, { id, opts }) => {
      queryClient.setQueryData<Expense[]>(keys.expenses(wallet), (prev = []) => {
        if (res.skippedId) {
          return prev.filter((e) => e.id !== res.skippedId);
        }
        if (res.deletedIds?.length) {
          const gone = new Set(res.deletedIds);
          let next = prev.filter((e) => !gone.has(e.id));

          // Futures scope also ends recurrence on remaining past rows.
          if (opts?.scope === "future" && opts.fromDate) {
            const target = prev.find((e) => e.id === id);
            if (target && normalizeRecurring(target.recurring) !== false) {
              const series = recurringScheduleKey(target);
              next = next.map((e) => {
                if (
                  normalizeRecurring(e.recurring) === false ||
                  recurringScheduleKey(e) !== series ||
                  e.date >= opts.fromDate!
                ) {
                  return e;
                }
                return { ...e, recurring: false as const };
              });
            }
          }

          return next;
        }
        return prev.filter((e) => e.id !== id);
      });
    },
  });

  const saveEventMutation = useMutation({
    mutationFn: async (data: Omit<LedgerEvent, "id"> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      assertCustomEventFields(data);
      if (data.id) {
        const body = await encodeEventUpdate(data, cryptoKey);
        const { event } = await api.events.update(data.id, body);
        return decodeEvent(event, cryptoKey);
      }
      const body = await encodeEventCreate(data, cryptoKey);
      const { event } = await api.events.create(body);
      return decodeEvent(event, cryptoKey);
    },
    onSuccess: (event, variables) => {
      queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet), (prev = []) => {
        if (variables.id) {
          return prev.map((e) => (e.id === event.id ? event : e));
        }
        return [...prev, event];
      });
      if (!variables.id) {
        setMonthMutation.mutate(event.date.slice(0, 7));
      }
    },
  });

  const saveCategoriesMutation = useMutation({
    mutationFn: async (categories: Category[]) => {
      const error = validateTaxonomy(categories);
      if (error) throw new Error(error);
      const cryptoKey = requireKey(wallet);
      const encrypted = await encodeCategories(categories, cryptoKey);
      await api.categories.update(encrypted);
      return categories;
    },
    onSuccess: async (categories) => {
      queryClient.setQueryData(keys.categories(wallet), categories);
      if (!activeWallet) return;
      const merged = { ...activeWallet.budgets };
      let changed = false;
      for (const cat of categories) {
        if (cat.type !== "income" && !(cat.id in merged)) {
          merged[cat.id] = 0;
          changed = true;
        }
      }
      if (changed) {
        const cryptoKey = requireKey(wallet);
        const encrypted = await encodeWalletFinancials(
          {
            name: activeWallet.name,
            income: activeWallet.income,
            startingBalance: activeWallet.startingBalance,
            budgets: merged,
          },
          cryptoKey,
        );
        const { wallet: wire } = await api.wallets.updateBudgets(activeWallet.id, encrypted);
        const updated = await decodeWallet(wire, cryptoKey);
        queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) =>
          prev.map((w) => (w.id === updated.id ? updated : w)),
        );
      }
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async ({
      id,
      opts,
    }: {
      id: string;
      opts?: DeleteScopeOpts;
    }): Promise<{ ok: boolean; deleted?: boolean; event?: LedgerEvent }> => {
      const res = await api.events.remove(id, opts);
      if (!res.deleted && res.event) {
        const cryptoKey = requireKey(wallet);
        return {
          ...res,
          event: await decodeEvent(res.event, cryptoKey),
        };
      }
      return { ok: res.ok, deleted: res.deleted };
    },
    onSuccess: (res, { id }) => {
      queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet), (prev = []) => {
        if (res.deleted || !res.event) {
          return prev.filter((e) => e.id !== id);
        }
        return prev.map((e) => (e.id === res.event!.id ? res.event! : e));
      });
    },
  });

  const saveTodoListMutation = useMutation({
    mutationFn: async (data: Partial<TodoList> & { id?: string; name?: string; icon?: string }) => {
      const cryptoKey = requireKey(wallet);
      const existing = (queryClient.getQueryData<TodoList[]>(keys.todoLists(wallet)) ?? []);
      const name = data.name ?? "";
      const icon = data.icon ?? "📋";
      const tasks = data.tasks ?? (data.id ? existing.find((l) => l.id === data.id)?.tasks ?? [] : []);

      if (name) {
        const clash = existing.find(
          (l) =>
            l.id !== data.id &&
            l.name.toLowerCase() === name.trim().toLowerCase(),
        );
        if (clash) throw new Error("A list with this name already exists");
      }

      if (data.id) {
        const current = existing.find((l) => l.id === data.id);
        if (!current) throw new Error("List not found");
        const encrypted = await encodeTodoListUpdate(
          {
            name: data.name ?? current.name,
            icon: data.icon ?? current.icon,
            tasks: data.tasks ?? current.tasks,
          },
          cryptoKey,
        );
        const { todoList } = await api.todoLists.update(data.id, encrypted);
        return decodeTodoList(todoList, cryptoKey);
      }

      const encrypted = await encodeTodoListCreate({ name, icon, tasks }, cryptoKey);
      const { todoList } = await api.todoLists.create(encrypted);
      return decodeTodoList(todoList, cryptoKey);
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<TodoList[]>(keys.todoLists(wallet), (prev = []) => {
        if (variables.id) {
          return prev.map((l) => (l.id === saved.id ? saved : l));
        }
        return [...prev, saved];
      });
    },
  });

  const deleteTodoListMutation = useMutation({
    mutationFn: (id: string) => api.todoLists.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<TodoList[]>(keys.todoLists(wallet), (prev = []) =>
        prev.filter((l) => l.id !== id),
      );
    },
  });

  const isLoading =
    !cryptoReady ||
    profileQuery.isLoading ||
    walletsQuery.isLoading ||
    categoriesQuery.isLoading ||
    expensesQuery.isLoading ||
    eventsQuery.isLoading ||
    todoListsQuery.isLoading;
  const error =
    profileQuery.error ??
    walletsQuery.error ??
    categoriesQuery.error ??
    expensesQuery.error ??
    eventsQuery.error ??
    todoListsQuery.error;

  return {
    profile: profileQuery.data,
    wallets,
    activeWallet,
    allExpenses,
    expenses,
    events: eventsQuery.data ?? [],
    todoLists: todoListsQuery.data ?? [],
    budgets: activeWallet?.budgets ?? {},
    wallet: activeWallet,
    currency: activeWallet?.currency ?? "MYR",
    categoryIndex,
    month: clampMonthKey(profileQuery.data?.currentMonth ?? CURRENT_MONTH_KEY),
    cryptoReady,
    isLoading,
    error,
    setActiveWalletId,
    setMonth: (currentMonth: string) => setMonthMutation.mutate(currentMonth),
    setBudgets: (budgets: Budgets) => setBudgetsMutation.mutate(budgets),
    saveCategories: saveCategoriesMutation.mutateAsync,
    saveWallet: saveWalletMutation.mutateAsync,
    deleteWallet: deleteWalletMutation.mutateAsync,
    saveExpense: saveExpenseMutation.mutateAsync,
    deleteExpense: (id: string, opts?: DeleteScopeOpts) =>
      deleteExpenseMutation.mutateAsync({ id, opts }),
    saveEvent: saveEventMutation.mutateAsync,
    deleteEvent: (id: string, opts?: DeleteScopeOpts) =>
      deleteEventMutation.mutateAsync({ id, opts }),
    saveTodoList: saveTodoListMutation.mutateAsync,
    deleteTodoList: deleteTodoListMutation.mutateAsync,
    isSaving:
      saveExpenseMutation.isPending ||
      deleteExpenseMutation.isPending ||
      saveEventMutation.isPending ||
      deleteEventMutation.isPending ||
      saveWalletMutation.isPending ||
      deleteWalletMutation.isPending ||
      saveCategoriesMutation.isPending ||
      saveTodoListMutation.isPending ||
      deleteTodoListMutation.isPending,
  };
}
