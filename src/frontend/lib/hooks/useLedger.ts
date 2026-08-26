import { api } from "@/frontend/lib/api";
import { maybeNotifyBudgetAlerts } from "@/frontend/lib/budget/notify";
import {
  buildReminderDetails,
  decodeCapitalPlan,
  decodeCategories,
  decodeEvent,
  decodeExpense,
  decodeTodoList,
  decodeVehicle,
  decodeVehicleFill,
  decodeWallet,
  encodeCapitalPlanCreate,
  encodeCapitalPlanUpdate,
  encodeCategories,
  encodeEventCreate,
  encodeEventUpdate,
  encodeExpenseCreate,
  encodeExpenseUpdate,
  encodeTodoListCreate,
  encodeTodoListUpdate,
  encodeVehicleCreate,
  encodeVehicleFillCreate,
  encodeVehicleFillUpdate,
  encodeVehicleUpdate,
  encodeWalletFinancials,
  type EventWire,
  type ReminderContext,
} from "@/frontend/lib/crypto/codec";
import { ledgerKeyStore } from "@/frontend/lib/crypto/key-store";
import { buildCategoryIndex, isIncomeCategory } from "@/frontend/lib/categories";
import { CURRENT_MONTH_KEY, clampMonthKey } from "@/frontend/lib/data";
import { classifyTx, normalizeRecurring, recurringScheduleKey } from "@/frontend/lib/stats";
import type { Budgets, CapitalPlan, Category, Expense, FinancialWallet, FuelFill, LedgerEvent, TodoList, Vehicle } from "@/frontend/lib/types";
import type { DeleteScope } from "@/lib/delete-scope";
import { DEFAULT_CATEGORIES, validateTaxonomy } from "@/schemas/category";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/*
 * Reminder events saved before `notifyDetails` existed would email a
 * content-free body. Attaching the copy is a one-off write per event, so it is
 * capped and batched: a month full of reminders must not burst hundreds of
 * PATCHes into the shared rate limit on first load. Whatever is left over is
 * picked up by later loads.
 */
const REMINDER_BACKFILL_PER_LOAD = 10;
const REMINDER_BACKFILL_CONCURRENCY = 5;

/**
 * Attach the reminder email copy to already-encrypted events that lack it.
 * Best-effort by design — it changes nothing the client renders, so a failed
 * write is swallowed rather than failing the whole events query. Legacy
 * plaintext rows (`enc` unset) are skipped: their own migration re-encrypts the
 * payload, and reusing the stale ciphertext here would undo that.
 */
async function backfillReminderDetails(
  pairs: Array<{ wire: EventWire; event: LedgerEvent }>,
  currency: string | undefined,
  catById: Record<string, Category>,
): Promise<void> {
  const stale = pairs
    .filter(
      ({ wire, event }) =>
        wire.enc === 1 && wire.payload && !wire.notifyDetails && event.notify && event.email.trim(),
    )
    .slice(0, REMINDER_BACKFILL_PER_LOAD);

  for (let i = 0; i < stale.length; i += REMINDER_BACKFILL_CONCURRENCY) {
    await Promise.all(
      stale.slice(i, i + REMINDER_BACKFILL_CONCURRENCY).map(async ({ wire, event }) => {
        const notifyDetails = buildReminderDetails(event, {
          currency,
          holdCategoryName: event.budgetHoldCategoryId
            ? catById[event.budgetHoldCategoryId]?.name
            : undefined,
        });
        if (!notifyDetails) return;

        try {
          /* No `notify` in the body — the server only re-confirms when a request turns it on. */
          await api.events.update(wire.id, { enc: 1, payload: wire.payload, notifyDetails });
        } catch {
          /* A later load retries; reminders still send, just without the details. */
        }
      }),
    );
  }
}

const keys = {
  profile: (wallet: string) => ["profile", wallet] as const,
  wallets: (wallet: string) => ["wallets", wallet] as const,
  categories: (wallet: string) => ["categories", wallet] as const,
  expenses: (wallet: string) => ["expenses", wallet] as const,
  savingsAll: (wallet: string) => ["savings-all", wallet] as const,
  events: (wallet: string, month: string) => ["events", wallet, month] as const,
  todoLists: (wallet: string) => ["todoLists", wallet] as const,
  capitalPlans: (wallet: string) => ["capitalPlans", wallet] as const,
  vehicles: (wallet: string) => ["vehicles", wallet] as const,
  vehicleFills: (wallet: string) => ["vehicleFills", wallet] as const,
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

  const month = clampMonthKey(profileQuery.data?.currentMonth ?? CURRENT_MONTH_KEY);

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

  /*
   * Piggy balances are lifetime totals, so this query is unbounded — unlike
   * `expensesQuery`, which only looks back EXPENSE_LOOKBACK_MONTHS. Savings
   * deposits/withdrawals are a small slice of total transaction volume for
   * most accounts, so a full-history fetch stays cheap in practice.
   *
   * ponytail: fetches full history and filters client-side (the server can't
   * read ciphertext to filter by category). Fine at personal-ledger volume;
   * add a plaintext "savings" marker on expense meta if accounts grow large.
   */
  const savingsAllQuery = useQuery({
    queryKey: keys.savingsAll(wallet),
    queryFn: async () => {
      const cryptoKey = requireKey(wallet);
      const collected: Awaited<ReturnType<typeof decodeExpense>>[] = [];
      let before: string | undefined;

      for (;;) {
        const page = await api.expenses.list({ limit: LIST_PAGE_LIMIT, before });
        const decoded = await Promise.all(page.expenses.map((e) => decodeExpense(e, cryptoKey)));
        collected.push(...decoded);
        if (!page.hasMore || !page.nextBefore) break;
        before = page.nextBefore;
        if (collected.length >= LIST_PAGE_LIMIT * 20) break;
      }

      return collected;
    },
    enabled: cryptoReady && !!profileQuery.data && wallets.length > 0 && categoriesQuery.data !== undefined,
    staleTime: 5 * 60 * 1000,
  });

  const savingsTxns = useMemo(() => {
    const all = (savingsAllQuery.data ?? []).map((e) => ({
      ...e,
      kind: e.kind ?? "expense",
      recurring: normalizeRecurring(e.recurring),
    }));
    return all.filter((e) => {
      if (activeWallet && e.walletId !== activeWallet.id) return false;
      const cls = classifyTx(e, categoryIndex);
      return cls === "savings" || cls === "withdrawal";
    });
  }, [savingsAllQuery.data, categoryIndex, activeWallet]);

  const eventsQuery = useQuery({
    queryKey: keys.events(wallet, month),
    queryFn: async () => {
      /*
       * Load by viewed month so once-events on future days (and recurring
       * series that still occur this month) are included for holds/agenda.
       */
      const cryptoKey = requireKey(wallet);
      const collected: Awaited<ReturnType<typeof decodeEvent>>[] = [];
      let before: string | undefined;

      for (;;) {
        const page = await api.events.list({ month, limit: LIST_PAGE_LIMIT, before });
        const decoded = await Promise.all(
          page.events.map(async (wire) => {
            if (!wire.enc && wire.title) {
              const body = await encodeEventUpdate(
                {
                  title: wire.title,
                  comments: wire.comments ?? [],
                  customLabel: wire.customLabel,
                  customGlyph: wire.customGlyph,
                  catId: wire.catId,
                  date: wire.date,
                  endDate: wire.endDate ?? null,
                  allDay: wire.allDay,
                  time: wire.time,
                  endTime: wire.endTime ?? null,
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

        await backfillReminderDetails(
          page.events.map((wire, i) => ({ wire, event: decoded[i]! })),
          activeWallet?.currency,
          categoryIndex.catById,
        );

        collected.push(...decoded);
        if (!page.hasMore || !page.nextBefore) break;
        before = page.nextBefore;
        if (collected.length >= LIST_PAGE_LIMIT * 5) break;
      }

      return collected;
    },
    enabled: cryptoReady && !!profileQuery.data,
    /*
     * The key is month-scoped, so switching months would otherwise put this
     * query back into `pending` and trip the app-wide "Loading your ledger…"
     * screen. Holding the previous month's rows keeps the shell mounted while
     * the new month streams in.
     */
    placeholderData: keepPreviousData,
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

  const capitalPlansQuery = useQuery({
    queryKey: keys.capitalPlans(wallet),
    queryFn: async () => {
      const { capitalPlans } = await api.capitalPlans.list();
      const cryptoKey = requireKey(wallet);
      return Promise.all(capitalPlans.map((wire) => decodeCapitalPlan(wire, cryptoKey)));
    },
    enabled: cryptoReady && !!profileQuery.data,
  });

  const vehiclesQuery = useQuery({
    queryKey: keys.vehicles(wallet),
    queryFn: async () => {
      const { vehicles } = await api.vehicles.list();
      const cryptoKey = requireKey(wallet);
      return Promise.all(vehicles.map((wire) => decodeVehicle(wire, cryptoKey)));
    },
    enabled: cryptoReady && !!profileQuery.data,
  });

  /*
   * Vehicles are account-scoped, not wallet-scoped, and fuel history is small
   * relative to transaction volume — an unbounded fetch stays cheap in practice,
   * same reasoning as the savingsAllQuery above.
   */
  const vehicleFillsQuery = useQuery({
    queryKey: keys.vehicleFills(wallet),
    queryFn: async () => {
      const cryptoKey = requireKey(wallet);
      const collected: Awaited<ReturnType<typeof decodeVehicleFill>>[] = [];
      let before: string | undefined;

      for (;;) {
        const page = await api.vehicles.fills.list({ limit: LIST_PAGE_LIMIT, before });
        const decoded = await Promise.all(page.fills.map((f) => decodeVehicleFill(f, cryptoKey)));
        collected.push(...decoded);
        if (!page.hasMore || !page.nextBefore) break;
        before = page.nextBefore;
        if (collected.length >= LIST_PAGE_LIMIT * 5) break;
      }

      return collected;
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
      void queryClient.invalidateQueries({ queryKey: keys.savingsAll(wallet) });
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
          events: queryClient.getQueryData<LedgerEvent[]>(keys.events(wallet, month)) ?? [],
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
      void queryClient.invalidateQueries({ queryKey: keys.savingsAll(wallet) });
    },
  });

  const saveEventMutation = useMutation({
    mutationFn: async (data: Omit<LedgerEvent, "id"> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      assertCustomEventFields(data);
      /* Wallet currency + hold category name are E2EE — resolve them for the email copy. */
      const reminderCtx: ReminderContext = {
        currency: activeWallet?.currency,
        holdCategoryName: data.budgetHoldCategoryId
          ? categoryIndex.catById[data.budgetHoldCategoryId]?.name
          : undefined,
      };
      if (data.id) {
        const body = await encodeEventUpdate(data, cryptoKey, reminderCtx);
        const { event } = await api.events.update(data.id, body);
        return decodeEvent(event, cryptoKey);
      }
      const body = await encodeEventCreate(data, cryptoKey, reminderCtx);
      const { event } = await api.events.create(body);
      return decodeEvent(event, cryptoKey);
    },
    onSuccess: (event, variables) => {
      const eventMonth = clampMonthKey(event.date.slice(0, 7));
      const cacheMonths = new Set([month, eventMonth]);

      for (const cacheMonth of cacheMonths) {
        queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet, cacheMonth), (prev = []) => {
          if (variables.id) {
            const mapped = prev.map((e) => (e.id === event.id ? event : e));
            /* Drop from this month's cache when the event no longer occurs here as a once row. */
            if (event.repeat === "once" && eventMonth !== cacheMonth) {
              return mapped.filter((e) => e.id !== event.id);
            }
            return mapped;
          }
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event];
        });
      }

      if (!variables.id) {
        setMonthMutation.mutate(eventMonth);
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
        if (!isIncomeCategory(cat) && !(cat.id in merged)) {
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
      queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet, month), (prev = []) => {
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

  const saveCapitalPlanMutation = useMutation({
    mutationFn: async (data: Partial<CapitalPlan> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      const existing = queryClient.getQueryData<CapitalPlan[]>(keys.capitalPlans(wallet)) ?? [];

      if (data.id) {
        const current = existing.find((p) => p.id === data.id);
        if (!current) throw new Error("Plan not found");
        const merged: Omit<CapitalPlan, "id"> = {
          name: data.name ?? current.name,
          templateId: data.templateId ?? current.templateId,
          glyph: data.glyph ?? current.glyph,
          targetDate: data.targetDate ?? current.targetDate,
          initialBudget: data.initialBudget ?? current.initialBudget,
          createdAt: current.createdAt,
          items: data.items ?? current.items,
        };
        const encrypted = await encodeCapitalPlanUpdate(merged, cryptoKey);
        const { capitalPlan } = await api.capitalPlans.update(data.id, encrypted);
        return decodeCapitalPlan(capitalPlan, cryptoKey);
      }

      const fresh: Omit<CapitalPlan, "id"> = {
        name: data.name ?? "",
        templateId: data.templateId,
        glyph: data.glyph ?? "🎯",
        targetDate: data.targetDate,
        initialBudget: data.initialBudget,
        createdAt: data.createdAt ?? new Date().toISOString(),
        items: data.items ?? [],
      };
      const encrypted = await encodeCapitalPlanCreate(fresh, cryptoKey);
      const { capitalPlan } = await api.capitalPlans.create(encrypted);
      return decodeCapitalPlan(capitalPlan, cryptoKey);
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<CapitalPlan[]>(keys.capitalPlans(wallet), (prev = []) => {
        if (variables.id) return prev.map((p) => (p.id === saved.id ? saved : p));
        return [...prev, saved];
      });
    },
  });

  const deleteCapitalPlanMutation = useMutation({
    mutationFn: (id: string) => api.capitalPlans.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<CapitalPlan[]>(keys.capitalPlans(wallet), (prev = []) =>
        prev.filter((p) => p.id !== id),
      );
    },
  });

  const saveVehicleMutation = useMutation({
    mutationFn: async (data: Omit<Vehicle, "id" | "createdAt"> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      const { id, ...rest } = data;
      if (id) {
        const body = await encodeVehicleUpdate(rest, cryptoKey);
        const { vehicle } = await api.vehicles.update(id, body);
        return decodeVehicle(vehicle, cryptoKey);
      }
      const body = await encodeVehicleCreate(rest, cryptoKey);
      const { vehicle } = await api.vehicles.create(body);
      return decodeVehicle(vehicle, cryptoKey);
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<Vehicle[]>(keys.vehicles(wallet), (prev = []) => {
        if (variables.id) return prev.map((v) => (v.id === saved.id ? saved : v));
        return [...prev, saved];
      });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (id: string) => api.vehicles.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<Vehicle[]>(keys.vehicles(wallet), (prev = []) =>
        prev.filter((v) => v.id !== id),
      );
      queryClient.setQueryData<FuelFill[]>(keys.vehicleFills(wallet), (prev = []) =>
        prev.filter((f) => f.vehicleId !== id),
      );
    },
  });

  const saveVehicleFillMutation = useMutation({
    mutationFn: async (data: Omit<FuelFill, "id"> & { id?: string }) => {
      const cryptoKey = requireKey(wallet);
      const { id, ...rest } = data;
      if (id) {
        const body = await encodeVehicleFillUpdate(rest, cryptoKey);
        const { fill } = await api.vehicles.fills.update(id, body);
        return decodeVehicleFill(fill, cryptoKey);
      }
      const body = await encodeVehicleFillCreate(rest, cryptoKey);
      const { fill } = await api.vehicles.fills.create(body);
      return decodeVehicleFill(fill, cryptoKey);
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<FuelFill[]>(keys.vehicleFills(wallet), (prev = []) => {
        if (variables.id) return prev.map((f) => (f.id === saved.id ? saved : f));
        return [...prev, saved];
      });
    },
  });

  const deleteVehicleFillMutation = useMutation({
    mutationFn: (id: string) => api.vehicles.fills.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<FuelFill[]>(keys.vehicleFills(wallet), (prev = []) =>
        prev.filter((f) => f.id !== id),
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
    todoListsQuery.isLoading ||
    capitalPlansQuery.isLoading ||
    vehiclesQuery.isLoading;
  const error =
    profileQuery.error ??
    walletsQuery.error ??
    categoriesQuery.error ??
    expensesQuery.error ??
    eventsQuery.error ??
    todoListsQuery.error ??
    capitalPlansQuery.error ??
    vehiclesQuery.error;

  return {
    profile: profileQuery.data,
    wallets,
    activeWallet,
    allExpenses,
    expenses,
    savingsTxns,
    savingsLoading: savingsAllQuery.isLoading,
    events: eventsQuery.data ?? [],
    todoLists: todoListsQuery.data ?? [],
    capitalPlans: capitalPlansQuery.data ?? [],
    vehicles: vehiclesQuery.data ?? [],
    vehicleFills: vehicleFillsQuery.data ?? [],
    vehicleFillsLoading: vehicleFillsQuery.isLoading,
    budgets: activeWallet?.budgets ?? {},
    wallet: activeWallet,
    currency: activeWallet?.currency ?? "MYR",
    categoryIndex,
    month,
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
    saveCapitalPlan: saveCapitalPlanMutation.mutateAsync,
    deleteCapitalPlan: deleteCapitalPlanMutation.mutateAsync,
    saveVehicle: saveVehicleMutation.mutateAsync,
    deleteVehicle: deleteVehicleMutation.mutateAsync,
    saveVehicleFill: saveVehicleFillMutation.mutateAsync,
    deleteVehicleFill: deleteVehicleFillMutation.mutateAsync,
    isSaving:
      saveExpenseMutation.isPending ||
      deleteExpenseMutation.isPending ||
      saveEventMutation.isPending ||
      deleteEventMutation.isPending ||
      saveWalletMutation.isPending ||
      deleteWalletMutation.isPending ||
      saveCategoriesMutation.isPending ||
      saveTodoListMutation.isPending ||
      deleteTodoListMutation.isPending ||
      saveCapitalPlanMutation.isPending ||
      deleteCapitalPlanMutation.isPending ||
      saveVehicleMutation.isPending ||
      deleteVehicleMutation.isPending ||
      saveVehicleFillMutation.isPending ||
      deleteVehicleFillMutation.isPending,
  };
}
