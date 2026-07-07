import { Hono } from "hono";
import { ensureDb } from "@/api/middleware/db";
import { globalRateLimit } from "@/api/middleware/rate-limit";
import { securityHeaders } from "@/api/middleware/security";
import { authRoutes } from "./auth";
import { cronRoutes } from "./cron";
import { consentRoutes } from "./consent";
import { eventsRoutes } from "./events";
import { expensesRoutes } from "./expenses";
import { profileRoutes } from "./profile";
import { usersRoutes } from "./users";
import { categoriesRoutes } from "./categories";
import { todoListsRoutes } from "./todo-lists";
import { walletsRoutes } from "./wallets";

export function createApiRoutes() {
  const api = new Hono();

  api.get("/ping", (c) =>
    c.json({ ok: true, runtime: process.versions.bun ? `bun ${process.versions.bun}` : process.version }),
  );

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
  api.route("/wallets", walletsRoutes);
  api.route("/categories", categoriesRoutes);
  api.route("/expenses", expensesRoutes);
  api.route("/events", eventsRoutes);
  api.route("/todo-lists", todoListsRoutes);
  api.route("/consent", consentRoutes);
  api.route("/cron", cronRoutes);

  return api;
}
