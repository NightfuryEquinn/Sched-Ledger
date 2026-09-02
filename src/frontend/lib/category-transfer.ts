import { resolveCategoryType, type CategoryType } from "@/frontend/lib/categories";
import type { Category, Expense } from "@/frontend/lib/types";

export const TRANSFER_CONCURRENCY = 2;
export const TRANSFER_PROGRESS_MS = 100;
export const TRANSFER_YIELD_MS = 0;
export const TRANSFER_HIDDEN_POLL_MS = 250;
export const TRANSFER_DEFAULT_RETRY_MS = 1000;

export type PacedTransferHooks = {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  isHidden?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Return wait-ms to retry the same item; null means a fatal error. */
  retryAfterMs?: (err: unknown) => number | null;
  progressIntervalMs?: number;
  yieldMs?: number;
  hiddenPollMs?: number;
};

export type PacedTransferResult<T> = {
  completed: T[];
  remaining: T[];
  error?: unknown;
};

/** Default sleep used by the transfer runner. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Whether the document is in the background (PWA kill risk). */
export function documentIsHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Wait-ms for a 429-style error; null for any other failure. */
export function retryAfterFromError(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const status = "status" in err ? Number((err as { status?: unknown }).status) : NaN;
  if (status !== 429) return null;
  const retryAfterMs =
    "retryAfterMs" in err ? Number((err as { retryAfterMs?: unknown }).retryAfterMs) : NaN;

  return Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? retryAfterMs
    : TRANSFER_DEFAULT_RETRY_MS;
}

/**
 * Process items with a concurrency cap, yielding between batches so the UI
 * can paint. 429s wait and retry the same item. Other errors stop the run
 * and return remaining items. Hidden documents pause the pool.
 */
export async function runPacedTransfer<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  hooks: PacedTransferHooks = {},
): Promise<PacedTransferResult<T>> {
  const concurrency = Math.max(1, hooks.concurrency ?? TRANSFER_CONCURRENCY);
  const sleep = hooks.sleep ?? defaultSleep;
  const now = hooks.now ?? Date.now;
  const isHidden = hooks.isHidden ?? documentIsHidden;
  const retryAfterMs = hooks.retryAfterMs ?? retryAfterFromError;
  const progressIntervalMs = hooks.progressIntervalMs ?? TRANSFER_PROGRESS_MS;
  const yieldMs = hooks.yieldMs ?? TRANSFER_YIELD_MS;
  const hiddenPollMs = hooks.hiddenPollMs ?? TRANSFER_HIDDEN_POLL_MS;
  const completed: T[] = [];
  let lastProgressAt = 0;

  /** Emit progress at most every `progressIntervalMs`, and always at completion. */
  const emitProgress = (done: number, force = false) => {
    if (!hooks.onProgress) return;
    const t = now();
    if (!force && t - lastProgressAt < progressIntervalMs && done !== items.length) return;
    lastProgressAt = t;
    hooks.onProgress(done, items.length);
  };

  emitProgress(0, true);

  /** Wait until the document is visible again. */
  const waitUntilVisible = async () => {
    while (isHidden()) {
      await sleep(hiddenPollMs);
    }
  };

  for (let i = 0; i < items.length; i += concurrency) {
    await waitUntilVisible();

    const batch = items.slice(i, i + concurrency);
    const pending = [...batch];

    while (pending.length) {
      await waitUntilVisible();
      const slice = pending.splice(0, concurrency);
      const results = await Promise.all(
        slice.map(async (item) => {
          try {
            await worker(item);

            return { item, ok: true as const };
          } catch (err) {
            const wait = retryAfterMs(err);
            if (wait != null) return { item, ok: false as const, retry: wait };

            return { item, ok: false as const, error: err };
          }
        }),
      );

      for (const result of results) {
        if (result.ok) {
          completed.push(result.item);
          emitProgress(completed.length);
          continue;
        }

        if ("retry" in result && result.retry != null) {
          await sleep(result.retry);
          pending.unshift(result.item);
          continue;
        }

        const leftover = [result.item, ...pending, ...items.slice(i + concurrency)];

        emitProgress(completed.length, true);

        return { completed, remaining: leftover, error: result.error };
      }
    }

    if (i + concurrency < items.length) {
      await sleep(yieldMs);
    }
  }

  emitProgress(completed.length, true);

  return { completed, remaining: [] };
}

/** Rows whose subcategory is in the source set. */
export function expensesMatchingSubs(expenses: Expense[], sourceSubIds: ReadonlySet<string>) {
  return expenses.filter((e) => sourceSubIds.has(e.sub));
}

/** Transaction kind that `classifyTx` expects for the destination type. */
export function kindForDestType(type: CategoryType): "expense" | "income" {
  return type === "income" ? "income" : "expense";
}

/** Apply dest sub / kind / capital-plan rules onto one expense. */
export function applyTransferFields(
  expense: Expense,
  destSubId: string,
  destType: CategoryType,
): Expense {
  const next: Expense = {
    ...expense,
    sub: destSubId,
    kind: kindForDestType(destType),
  };

  if (destType !== "savings") {
    delete next.capitalPlanId;
  }

  return next;
}

/** Source sub ids for a whole-category transfer. */
export function subIdsOfCategory(cat: Category): string[] {
  return cat.subs.map((s) => s.id);
}

/** Confirm copy when source and dest types differ. */
export function crossTypeWarning(
  count: number,
  sourceLabel: string,
  destLabel: string,
  sourceType: CategoryType,
  destType: CategoryType,
): string | null {
  if (sourceType === destType) return null;
  const n = count === 1 ? "transaction" : "transactions";

  return `${count} ${sourceLabel} ${n} will become ${destLabel}.`;
}

/** Display "Category / Subcategory". */
export function catSubLabel(cat: Category, subId?: string): string {
  if (!subId) return cat.name;
  const sub = cat.subs.find((s) => s.id === subId);

  return sub ? `${cat.name} / ${sub.name}` : cat.name;
}

/** Resolve dest type from a live category. */
export function destTypeOf(cat: Category): CategoryType {
  return resolveCategoryType(cat);
}
