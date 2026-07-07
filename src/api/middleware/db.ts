import { createMiddleware } from "hono/factory";
import { connectDb } from "@/db/client";

export const ensureDb = createMiddleware(async (_c, next) => {
  await connectDb();
  await next();
});
