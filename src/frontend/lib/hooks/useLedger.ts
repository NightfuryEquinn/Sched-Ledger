import { api } from "@/frontend/lib/api";
import {
  decodeExpense,
  decodeWallet,
  encodeExpenseCreate,
  encodeExpenseUpdate,
  encodeWalletFinancials,
  type ExpenseWire,
  type WalletWire,
} from "@/frontend/lib/crypto/codec";
import { ledgerKeyStore } from "@/frontend/lib/crypto/key-store";
import { buildCategoryIndex } from "@/frontend/lib/categories";
import { CURRENT_MONTH_KEY, clampMonthKey } from "@/frontend/lib/data";
import { normalizeRecurring } from "@/frontend/lib/stats";
import type { Budgets, Category, Expense, FinancialWallet, LedgerEvent, TodoList } from "@/frontend/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

const ACTIVE_WALLET_KEY = "ledger:active-wallet";

function activeWalletStorageKey(wallet: string) {
  return `${ACTIVE_WALLET_KEY}:${wallet.toLowerCase()}`;
}

function requireKey(address: string): CryptoKey {
  const key = ledgerKeyStore.get(address);
  if (!key) throw new Error("Encryption key is locked");
  return key;
}

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
        wallets.map(async (w) => {
          const wire = w as WalletWire;
          if (!wire.enc) {
            const encrypted = await encodeWalletFinancials(
              {
                income: wire.income ?? 0,
                startingBalance: wire.startingBalance ?? 0,
                budgets: wire.budgets ?? {},
              },
              cryptoKey,
            );
            const { wallet: updated } = await api.wallets.update(wire.id, encrypted);
            return decodeWallet(updated as WalletWire, cryptoKey);
          }
          return decodeWallet(wire, cryptoKey);
        }),
      );
    },
    enabled: cryptoReady,
  });

  const categoriesQuery = useQuery({
    queryKey: keys.categories(wallet),
    queryFn: async () => {
      const { categories } = await api.categories.list();
      return categories;
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
      const { expenses } = await api.expenses.list();
      const cryptoKey = requireKey(wallet);
      return Promise.all(expenses.map((e) => decodeExpense(e as ExpenseWire, cryptoKey)));
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
      const { events } = await api.events.list();
      return events;
    },
    enabled: cryptoReady && !!profileQuery.data,
  });

  const todoListsQuery = useQuery({
    queryKey: keys.todoLists(wallet),
    queryFn: async () => {
      const { todoLists } = await api.todoLists.list();
      return todoLists;
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
        { income: activeWallet.income, startingBalance: activeWallet.startingBalance, budgets },
        cryptoKey,
      );
      return api.wallets.updateBudgets(activeWallet.id, encrypted);
    },
    onSuccess: async ({ wallet: wire }) => {
      const cryptoKey = requireKey(wallet);
      const updated = await decodeWallet(wire as WalletWire, cryptoKey);
      queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) =>
        prev.map((w) => (w.id === updated.id ? updated : w)),
      );
    },
  });

  const saveWalletMutation = useMutation({
    mutationFn: async (data: Partial<FinancialWallet> & { id?: string; name?: string; currency?: string }) => {
      const cryptoKey = requireKey(wallet);
      if (data.id) {
        const financialPatch =
          data.income !== undefined || data.startingBalance !== undefined || data.budgets !== undefined
            ? await encodeWalletFinancials(
                {
                  income: data.income,
                  startingBalance: data.startingBalance,
                  budgets: data.budgets,
                },
                cryptoKey,
              )
            : {};
        const { wallet: updated } = await api.wallets.update(data.id, {
          name: data.name,
          currency: data.currency,
          fundingMode: data.fundingMode,
          isDefault: data.isDefault,
          ...financialPatch,
        });
        return decodeWallet(updated as WalletWire, cryptoKey);
      }
      const { wallet: created } = await api.wallets.create({
        name: data.name!,
        currency: data.currency!,
        fundingMode: data.fundingMode,
      });
      const encrypted = await encodeWalletFinancials(
        {
          income: data.fundingMode === "monthly" ? (data.income ?? 0) : 0,
          startingBalance: data.fundingMode === "starting" ? (data.startingBalance ?? 0) : 0,
          budgets: {},
        },
        cryptoKey,
      );
      const { wallet: updated } = await api.wallets.update(created.id, encrypted);
      return decodeWallet(updated as WalletWire, cryptoKey);
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
          setActiveWalletId(fallback.id);
        }
        return next;
      });
    },
  });

  const saveExpenseMutation = useMutation({
    mutationFn: async (data: Expense & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      if (data.id) {
        const body = await encodeExpenseUpdate(data, cryptoKey);
        const { expense } = await api.expenses.update(data.id, body);
        return decodeExpense(expense as ExpenseWire, cryptoKey);
      }
      const body = await encodeExpenseCreate(data, cryptoKey);
      const { expense } = await api.expenses.create(body);
      return decodeExpense(expense as ExpenseWire, cryptoKey);
    },
    onSuccess: (expense, variables) => {
      queryClient.setQueryData<Expense[]>(keys.expenses(wallet), (prev = []) => {
        if (variables.id) {
          return prev.map((e) => (e.id === expense.id ? expense : e));
        }
        return [expense, ...prev].sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
        );
      });
      if (!variables.id) {
        setMonthMutation.mutate(expense.date.slice(0, 7));
      }
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.expenses.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<Expense[]>(keys.expenses(wallet), (prev = []) =>
        prev.filter((e) => e.id !== id),
      );
    },
  });

  const saveEventMutation = useMutation({
    mutationFn: async (data: LedgerEvent & { id?: string }) => {
      if (data.id) {
        const { event } = await api.events.update(data.id, data);
        return event;
      }
      const { event } = await api.events.create(data);
      return event;
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
    mutationFn: (categories: Category[]) => api.categories.update(categories),
    onSuccess: async ({ categories }) => {
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
          { income: activeWallet.income, startingBalance: activeWallet.startingBalance, budgets: merged },
          cryptoKey,
        );
        const { wallet: wire } = await api.wallets.updateBudgets(activeWallet.id, encrypted);
        const updated = await decodeWallet(wire as WalletWire, cryptoKey);
        queryClient.setQueryData<FinancialWallet[]>(keys.wallets(wallet), (prev = []) =>
          prev.map((w) => (w.id === updated.id ? updated : w)),
        );
      }
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => api.events.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet), (prev = []) =>
        prev.filter((e) => e.id !== id),
      );
    },
  });

  const saveTodoListMutation = useMutation({
    mutationFn: async (data: Partial<TodoList> & { id?: string; name?: string; icon?: string }) => {
      if (data.id) {
        const { todoList } = await api.todoLists.update(data.id, data);
        return todoList;
      }
      const { todoList } = await api.todoLists.create({
        name: data.name!,
        icon: data.icon ?? "☑",
      });
      return todoList;
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
    deleteExpense: deleteExpenseMutation.mutateAsync,
    saveEvent: saveEventMutation.mutateAsync,
    deleteEvent: deleteEventMutation.mutateAsync,
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
