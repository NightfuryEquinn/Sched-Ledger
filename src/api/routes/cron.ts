import { processDueRecurringExpenses } from "@/api/lib/recurring-expenses";
import { processDueReminders } from "@/api/lib/reminders";
import { ensureDb } from "@/api/middleware/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { timingSafeEqual } from "node:crypto";

export const cronRoutes = new Hono();

cronRoutes.use("*", ensureDb);

/** Constant-time compare of the Authorization header to `Bearer ${CRON_SECRET}`. */
function assertCronAuth(authHeader: string | undefined): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new HTTPException(503, { message: "CRON_SECRET not configured" });
  }
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
}

/**
 * External cron (cron-job.org every ~15 min, or manual curl) — scans the database
 * for due event reminder emails and materializes recurring expense rows.
 */
cronRoutes.get("/reminders", async (c) => {
  assertCronAuth(c.req.header("Authorization"));
  const [reminders, recurring] = await Promise.all([
    processDueReminders(),
    processDueRecurringExpenses(),
  ]);

  return c.json({ ok: true, reminders, recurring });
});
