import { createApiApp } from "@/api";
import { processDueRecurringExpenses } from "@/api/lib/recurring-expenses";
import { processDueReminders } from "@/api/lib/reminders";
import { connectDb } from "@/db/client";
import { serve } from "bun";
import index from "./index.html";

const api = createApiApp();

try {
  await connectDb();
  console.log("MongoDB connected");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  console.error("API routes will fail until MongoDB is available.");
}

const server = serve({
  routes: {
    "/api/*": (req) => api.fetch(req),
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);

if (process.env.NODE_ENV !== "production" && process.env.CRON_SECRET?.trim()) {
  const pollMs = 15 * 60 * 1000;
  const poll = async () => {
    try {
      const [reminders, recurring] = await Promise.all([
        process.env.RESEND_API_KEY?.trim()
          ? processDueReminders()
          : Promise.resolve(null),
        processDueRecurringExpenses(),
      ]);
      if (reminders && reminders.sent > 0) {
        console.log(`[reminders] sent ${reminders.sent} email(s)`);
      }
      if (recurring.created > 0) {
        console.log(`[recurring] created ${recurring.created} expense row(s)`);
      }
    } catch (err) {
      console.error("[cron] poll failed:", err);
    }
  };
  setInterval(poll, pollMs);
  void poll();
  console.log("[cron] dev poller active (every 15 min) — reminders + recurring expenses");
}
