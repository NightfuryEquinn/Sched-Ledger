import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/frontend/lib/api";
import type { Budgets, Expense, LedgerEvent } from "@/frontend/lib/types";

const keys = {
  profile: (wallet: string) => ["profile", wallet] as const,
  expenses: (wallet: string) => ["expenses", wallet] as const,
  events: (wallet: string) => ["events", wallet] as const,
};

export function useLedger(walletAddress: string) {
  const queryClient = useQueryClient();
  const wallet = walletAddress.toLowerCase();

  const profileQuery = useQuery({
    queryKey: keys.profile(wallet),
    queryFn: async () => {
      const { profile } = await api.profile.get();
      return profile;
    },
  });

  const expensesQuery = useQuery({
    queryKey: keys.expenses(wallet),
    queryFn: async () => {
      const { expenses } = await api.expenses.list();
      return expenses;
    },
    enabled: !!profileQuery.data,
  });

  const eventsQuery = useQuery({
    queryKey: keys.events(wallet),
    queryFn: async () => {
      const { events } = await api.events.list();
      return events;
    },
    enabled: !!profileQuery.data,
  });

  const setMonthMutation = useMutation({
    mutationFn: (currentMonth: string) => api.profile.update({ currentMonth }),
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(keys.profile(wallet), profile);
    },
  });

  const setBudgetsMutation = useMutation({
    mutationFn: (budgets: Budgets) => api.profile.updateBudgets(budgets),
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(keys.profile(wallet), profile);
    },
  });

  const saveExpenseMutation = useMutation({
    mutationFn: async (data: Expense & { id?: string }) => {
      if (data.id) {
        const { expense } = await api.expenses.update(data.id, data);
        return expense;
      }
      const { expense } = await api.expenses.create(data);
      return expense;
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

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => api.events.remove(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<LedgerEvent[]>(keys.events(wallet), (prev = []) =>
        prev.filter((e) => e.id !== id),
      );
    },
  });

  const isLoading =
    profileQuery.isLoading || expensesQuery.isLoading || eventsQuery.isLoading;
  const error = profileQuery.error ?? expensesQuery.error ?? eventsQuery.error;

  return {
    profile: profileQuery.data,
    expenses: expensesQuery.data ?? [],
    events: eventsQuery.data ?? [],
    budgets: profileQuery.data?.budgets ?? {},
    income: profileQuery.data?.income ?? 0,
    month: profileQuery.data?.currentMonth ?? "",
    isLoading,
    error,
    setMonth: (currentMonth: string) => setMonthMutation.mutate(currentMonth),
    setBudgets: (budgets: Budgets) => setBudgetsMutation.mutate(budgets),
    saveExpense: saveExpenseMutation.mutateAsync,
    deleteExpense: deleteExpenseMutation.mutateAsync,
    saveEvent: saveEventMutation.mutateAsync,
    deleteEvent: deleteEventMutation.mutateAsync,
    isSaving:
      saveExpenseMutation.isPending ||
      deleteExpenseMutation.isPending ||
      saveEventMutation.isPending ||
      deleteEventMutation.isPending,
  };
}
