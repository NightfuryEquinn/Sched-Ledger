import { createApiRoutes } from "@/api/routes";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export function createApiApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.route("/api", createApiRoutes());

  return app;
}
