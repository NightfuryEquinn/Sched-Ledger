import { connectDb } from "@/db/client";
import { createMiddleware } from "hono/factory";

const DB_MIDDLEWARE_TIMEOUT_MS = 15_000;

export const ensureDb = createMiddleware(async (c, next) => {
  try {
    await Promise.race([
      connectDb(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Database connection timed out")), DB_MIDDLEWARE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database unavailable";
    return c.json({ error: message }, 503);
  }
  await next();
});
