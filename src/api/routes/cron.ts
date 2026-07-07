import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { processDueReminders } from "@/api/lib/reminders";
import { ensureDb } from "@/api/middleware/db";

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

/** Vercel Cron (or manual curl) — processes due event reminders. */
cronRoutes.get("/reminders", async (c) => {
  assertCronAuth(c.req.header("Authorization"));
  const result = await processDueReminders();
  return c.json({ ok: true, ...result });
});
