import { processDueRecurringExpenses } from "@/api/lib/recurring-expenses";
import { processDueReminders } from "@/api/lib/reminders";
import { ensureDb } from "@/api/middleware/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export const cronRoutes = new Hono();

cronRoutes.use("*", ensureDb);

function assertCronAuth(authHeader: string | undefined): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new HTTPException(503, { message: "CRON_SECRET not configured" });
  }
  const expected = `Bearer ${secret}`;
  if (authHeader !== expected) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
}

/**
 * External cron (cron-job.org or manual curl) — due event reminder emails + recurring expense rows.
 */
cronRoutes.get("/reminders", async (c) => {
  assertCronAuth(c.req.header("Authorization"));
  const [reminders, recurring] = await Promise.all([
    processDueReminders(),
    processDueRecurringExpenses(),
  ]);
  return c.json({ ok: true, reminders, recurring });
});
