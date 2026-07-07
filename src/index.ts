import { serve } from "bun";
import { createApiApp } from "@/api";
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
