import { ensureDb } from "@/api/middleware/db";
import { globalRateLimit } from "@/api/middleware/rate-limit";
import { securityHeaders } from "@/api/middleware/security";
import { Hono } from "hono";
import { authRoutes } from "./auth";
import { budgetAlertsRoutes } from "./budget-alerts";
import { categoriesRoutes } from "./categories";
import { consentRoutes } from "./consent";
import { cronRoutes } from "./cron";
import { eventsRoutes } from "./events";
import { expensesRoutes } from "./expenses";
import { fxRoutes } from "./fx";
import { profileRoutes } from "./profile";
import { pushRoutes } from "./push";
import { todoListsRoutes } from "./todo-lists";
import { usersRoutes } from "./users";
import { walletsRoutes } from "./wallets";

export function createApiRoutes() {
  const api = new Hono();

  api.use("*", securityHeaders);
  api.use("*", globalRateLimit);
  api.use("*", ensureDb);

  api.route("/auth", authRoutes);
  api.route("/users", usersRoutes);
  api.route("/push", pushRoutes);
  api.route("/profile", profileRoutes);
  api.route("/wallets", walletsRoutes);
  api.route("/categories", categoriesRoutes);
  api.route("/expenses", expensesRoutes);
  api.route("/events", eventsRoutes);
  api.route("/todo-lists", todoListsRoutes);
  api.route("/consent", consentRoutes);
  api.route("/budget-alerts", budgetAlertsRoutes);
  api.route("/fx", fxRoutes);
  api.route("/cron", cronRoutes);

  return api;
}
