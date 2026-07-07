import { serve } from "bun";
import { createApiApp } from "@/api";
import { processDueReminders } from "@/api/lib/reminders";
import { connectDb } from "@/db/client";
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

if (
  process.env.NODE_ENV !== "production" &&
  process.env.CRON_SECRET?.trim() &&
  process.env.RESEND_API_KEY?.trim()
) {
  const pollMs = 15 * 60 * 1000;
  const poll = async () => {
    try {
      const result = await processDueReminders();
      if (result.sent > 0) {
        console.log(`[reminders] sent ${result.sent} email(s)`);
      }
    } catch (err) {
      console.error("[reminders] poll failed:", err);
    }
  };
  setInterval(poll, pollMs);
  void poll();
  console.log("[reminders] dev poller active (every 15 min)");
}
