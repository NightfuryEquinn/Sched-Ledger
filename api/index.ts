/**
 * Vercel Bun serverless entry.
 * The runtime expects a Bun.serve-style export (`{ fetch }`); the build
 * bundle is a Hono app with that shape — do not call it as a plain function.
 */
export default {
  /** Load the API bundle and forward the request to Hono. */
  async fetch(req: Request): Promise<Response> {
    const mod = await import("./handler.js");

    return mod.default.fetch(req);
  },
};
