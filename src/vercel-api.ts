import { createApiApp } from "@/api/app";

// Vercel's Bun runtime invokes a Bun.serve-style default export (an object
// with a `fetch` method); the Hono app instance is exactly that shape.
// Do NOT wrap with `handle()` from hono/vercel — the plain function it
// returns is never invoked by the Bun runtime and requests hang.
export default createApiApp();
