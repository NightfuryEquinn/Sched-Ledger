import { Hono } from "hono";
import { ensureDb } from "@/api/middleware/db";
import { globalRateLimit } from "@/api/middleware/rate-limit";
import { securityHeaders } from "@/api/middleware/security";
import { authRoutes } from "./auth";
import { consentRoutes } from "./consent";
import { eventsRoutes } from "./events";
import { expensesRoutes } from "./expenses";
import { profileRoutes } from "./profile";
import { usersRoutes } from "./users";

export function createApiRoutes() {
  const api = new Hono();

  api.use("*", securityHeaders);
  api.use("*", globalRateLimit);

  api.get("/health", async (c) => {
    try {
      const { connectDb } = await import("@/db/client");
      await connectDb();
      return c.json({ ok: true, service: "ledger-api", db: "connected" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "disconnected";
      return c.json({ ok: false, service: "ledger-api", db: "disconnected", error: message }, 503);
    }
  });

  api.use("*", ensureDb);

  api.route("/auth", authRoutes);
  api.route("/users", usersRoutes);
  api.route("/profile", profileRoutes);
  api.route("/expenses", expensesRoutes);
  api.route("/events", eventsRoutes);
  api.route("/consent", consentRoutes);

  return api;
}
